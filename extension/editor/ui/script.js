let canvas;
let currentTool = 'draw';
let originalImage;
let currentBase64;
let isDrawing = false;
let origX, origY, activeShape;
let zoomLevel = 1;

const TOOLS = { HAND: 'hand', DRAW: 'draw', RECT: 'rect', CIRCLE: 'circle', ARROW: 'arrow', TEXT: 'text', BLUR: 'blur' };

window.handleMessage = function(payload) {
    if (payload.action === 'init') {
        currentBase64 = payload.data.imageBase64;
        initCanvas(currentBase64);
    }
};

function initCanvas(base64) {
    if (!base64) return;
    if (canvas) canvas.dispose();

    const container = document.getElementById('canvas-container');
    canvas = new fabric.Canvas('editor-canvas', {
        width: container.clientWidth,
        height: container.clientHeight,
        isDrawingMode: true,
        enableRetinaScaling: true,
        selection: true,
        preserveObjectStacking: true,
        backgroundColor: 'transparent'
    });

    window.addEventListener('resize', () => {
        if (!canvas) return;
        canvas.setDimensions({ width: container.clientWidth, height: container.clientHeight });
        canvas.renderAll();
    });

    fabric.Image.fromURL(base64, function(img) {
        if (!img) return;
        originalImage = img;
        
        img.set({ originX: 'left', originY: 'top', selectable: false, evented: false });
        canvas.add(img);
        canvas.sendToBack(img);

        const padding = 60;
        const initialZoom = Math.min((canvas.width - padding) / img.width, (canvas.height - padding) / img.height);
        
        zoomLevel = initialZoom;
        
        const vpt = canvas.viewportTransform.slice();
        vpt[0] = zoomLevel;
        vpt[3] = zoomLevel;
        vpt[4] = (canvas.width / 2) - (img.width * zoomLevel / 2);
        vpt[5] = (canvas.height / 2) - (img.height * zoomLevel / 2);
        canvas.setViewportTransform(vpt);
        
        canvas.renderAll();
        updateZoomDisplay();
        updateSettings();
    });

    setupInteraction();
    setupZoomAndPan();
}

function updateZoomDisplay() {
    document.getElementById('zoom-level').textContent = Math.round(zoomLevel * 100) + '%';
    updateOCRLayer();
}

function updateOCRLayer() {
    const layer = document.querySelector('.ocr-layer');
    if (!layer || !canvas) return;
    const vpt = canvas.viewportTransform;
    layer.style.transform = `matrix(${vpt[0]}, ${vpt[1]}, ${vpt[2]}, ${vpt[3]}, ${vpt[4]}, ${vpt[5]})`;
    layer.style.transformOrigin = '0 0';
}

function switchTool(toolId) {
    const btn = document.getElementById('tool-' + toolId);
    if (!btn) return;
    
    document.querySelectorAll('button[id^="tool-"]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = toolId;
    
    canvas.isDrawingMode = (currentTool === TOOLS.DRAW);
    canvas.selection = (currentTool !== TOOLS.DRAW);
    canvas.defaultCursor = currentTool === TOOLS.HAND ? 'grab' : 'default';
}

function updateSettings() {
    if (!canvas) return;
    const strokeColor = document.getElementById('stroke-color-picker').value;
    const fillColor = document.getElementById('fill-color-picker').value;
    const strokeWidth = parseInt(document.getElementById('stroke-width').value);
    const noFill = document.getElementById('btn-no-fill').classList.contains('active');

    const actualFill = noFill ? 'transparent' : fillColor;

    document.getElementById('stroke-bar').style.backgroundColor = strokeColor;
    document.getElementById('fill-bar').style.backgroundColor = noFill ? 'transparent' : fillColor;

    canvas.freeDrawingBrush.color = strokeColor;
    canvas.freeDrawingBrush.width = strokeWidth;

    const active = canvas.getActiveObject();
    if (active) {
        if (active.type === 'i-text') {
            active.set({ fill: strokeColor, backgroundColor: actualFill });
        } else if (active.toolType !== TOOLS.BLUR) {
            active.set({ stroke: strokeColor, strokeWidth: strokeWidth, fill: actualFill });
        }
        canvas.renderAll();
    }
}

function refreshPixelate(obj) {
    if (!obj || obj.toolType !== TOOLS.BLUR) return;
    const pixelSize = 15;
    const left = obj.left;
    const top = obj.top;
    const width = obj.width * obj.scaleX;
    const height = obj.height * obj.scaleY;

    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = width;
    tempCanvas.height = height;

    ctx.drawImage(originalImage._element, left, top, width, height, 0, 0, width, height);

    for (let y = 0; y < tempCanvas.height; y += pixelSize) {
        for (let x = 0; x < tempCanvas.width; x += pixelSize) {
            const p = ctx.getImageData(x, y, 1, 1).data;
            ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }

    fabric.Image.fromURL(tempCanvas.toDataURL(), function(pImg) {
        obj.set('fill', new fabric.Pattern({ source: pImg._element, repeat: 'no-repeat' }));
        canvas.renderAll();
    });
}

function createArrow(points) {
    const strokeColor = document.getElementById('stroke-color-picker').value;
    const strokeWidth = parseInt(document.getElementById('stroke-width').value);
    const headLength = 15 + strokeWidth;
    const x1 = points[0], y1 = points[1], x2 = points[2], y2 = points[3];
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    return new fabric.Path(`M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${x2 - headLength * Math.cos(angle - Math.PI / 6)} ${y2 - headLength * Math.sin(angle - Math.PI / 6)} M ${x2} ${y2} L ${x2 - headLength * Math.cos(angle + Math.PI / 6)} ${y2 - headLength * Math.sin(angle + Math.PI / 6)}`, {
        stroke: strokeColor, strokeWidth: strokeWidth, fill: 'transparent',
        strokeLineCap: 'round', strokeLineJoin: 'round', selectable: true, strokeUniform: true
    });
}

function setupInteraction() {
    canvas.on('mouse:down', function(o) {
        if (o.e.button !== 0) return;
        const target = canvas.findTarget(o.e);
        if (currentTool === TOOLS.HAND && target && target !== originalImage) return;
        if (canvas.isDrawingMode || (currentTool !== TOOLS.HAND && target)) return;
        if (currentTool === TOOLS.HAND) return;

        isDrawing = true;
        const p = canvas.getPointer(o.e);
        origX = p.x; origY = p.y;
        
        const sc = document.getElementById('stroke-color-picker').value;
        const noFill = document.getElementById('btn-no-fill').classList.contains('active');
        const fc = noFill ? 'transparent' : document.getElementById('fill-color-picker').value;
        const sw = parseInt(document.getElementById('stroke-width').value);

        const common = { left: origX, top: origY, strokeUniform: true, selectable: true };
        if (currentTool === TOOLS.RECT) activeShape = new fabric.Rect({ ...common, width: 1, height: 1, fill: fc, stroke: sc, strokeWidth: sw });
        else if (currentTool === TOOLS.CIRCLE) activeShape = new fabric.Circle({ ...common, radius: 1, fill: fc, stroke: sc, strokeWidth: sw });
        else if (currentTool === TOOLS.ARROW) activeShape = createArrow([origX, origY, origX+1, origY+1]);
        else if (currentTool === TOOLS.BLUR) activeShape = new fabric.Rect({ ...common, width: 1, height: 1, toolType: TOOLS.BLUR, stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 });
        
        if (activeShape) canvas.add(activeShape);
    });

    canvas.on('mouse:move', function(o) {
        if (!isDrawing || !activeShape) return;
        const p = canvas.getPointer(o.e);
        if (currentTool === TOOLS.CIRCLE) activeShape.set({ left: Math.min(origX, p.x), top: Math.min(origY, p.y), radius: Math.abs(origX - p.x) / 2 });
        else if (currentTool === TOOLS.ARROW) {
            canvas.remove(activeShape);
            activeShape = createArrow([origX, origY, p.x, p.y]);
            canvas.add(activeShape);
        }
        else activeShape.set({ left: Math.min(origX, p.x), top: Math.min(origY, p.y), width: Math.abs(origX - p.x), height: Math.abs(origY - p.y) });
        
        if (currentTool === TOOLS.BLUR) refreshPixelate(activeShape);
        canvas.renderAll();
    });

    canvas.on('mouse:up', () => { 
        if (isDrawing) {
            if (activeShape && currentTool === TOOLS.BLUR) refreshPixelate(activeShape);
            setTimeout(() => switchTool(TOOLS.HAND), 100);
        }
        isDrawing = false; activeShape = null; 
    });

    canvas.on('path:created', () => {
        setTimeout(() => switchTool(TOOLS.HAND), 100);
    });

    canvas.on('object:moving', (e) => refreshPixelate(e.target));
    canvas.on('object:scaling', (e) => refreshPixelate(e.target));

    const del = () => { 
        const active = canvas.getActiveObject();
        if (active && active.isEditing) return;
        canvas.getActiveObjects().forEach(obj => { if (obj !== originalImage) canvas.remove(obj); });
        canvas.discardActiveObject().renderAll();
    };
    
    document.getElementById('action-delete').onclick = del;
    window.addEventListener('keydown', (e) => { 
        if (e.key === 'Delete') del(); 
        if (e.key === 'Backspace') {
            const active = canvas.getActiveObject();
            if (active && !active.isEditing) { del(); e.preventDefault(); }
        }
    });
}

function setupZoomAndPan() {
    canvas.on('mouse:wheel', function(opt) {
        const e = opt.e;
        if (e.ctrlKey) {
            const delta = e.deltaY;
            let zoom = canvas.getZoom();
            zoom *= 0.999 ** delta;
            if (zoom > 20) zoom = 20;
            if (zoom < 0.01) zoom = 0.01;
            canvas.zoomToPoint({ x: e.offsetX, y: e.offsetY }, zoom);
            zoomLevel = zoom;
            updateZoomDisplay();
        } else {
            const vpt = this.viewportTransform;
            vpt[4] -= e.deltaX;
            vpt[5] -= e.deltaY;
            this.requestRenderAll();
            updateOCRLayer();
        }
        e.preventDefault();
        e.stopPropagation();
    });

    let lastX, lastY;
    canvas.on('mouse:down', function(opt) {
        const target = canvas.findTarget(opt.e);
        const isMiddleClick = opt.e.button === 1;
        if ((opt.e.altKey || currentTool === TOOLS.HAND || isMiddleClick) && (!target || target === originalImage)) {
            this.isDragging = true;
            this.selection = false;
            lastX = opt.e.clientX;
            lastY = opt.e.clientY;
            canvas.defaultCursor = 'grabbing';
        }
    });
    canvas.on('mouse:move', function(opt) {
        if (this.isDragging) {
            const e = opt.e;
            const vpt = this.viewportTransform;
            vpt[4] += e.clientX - lastX;
            vpt[5] += e.clientY - lastY;
            this.requestRenderAll();
            lastX = e.clientX;
            lastY = e.clientY;
            updateOCRLayer();
        }
    });
    canvas.on('mouse:up', function() {
        this.setViewportTransform(this.viewportTransform);
        this.isDragging = false;
        this.selection = (currentTool !== TOOLS.DRAW);
        canvas.defaultCursor = currentTool === TOOLS.HAND ? 'grab' : 'default';
    });

    document.getElementById('zoom-in').onclick = () => {
        zoomLevel *= 1.2;
        canvas.zoomToPoint({ x: canvas.width / 2, y: canvas.height / 2 }, zoomLevel);
        updateZoomDisplay();
    };
    document.getElementById('zoom-out').onclick = () => {
        zoomLevel /= 1.2;
        canvas.zoomToPoint({ x: canvas.width / 2, y: canvas.height / 2 }, zoomLevel);
        updateZoomDisplay();
    };
    document.getElementById('zoom-reset').onclick = () => {
        const padding = 60;
        zoomLevel = Math.min((canvas.width - padding) / originalImage.width, (canvas.height - padding) / originalImage.height);
        const vpt = canvas.viewportTransform.slice();
        vpt[0] = zoomLevel; vpt[3] = zoomLevel;
        vpt[4] = (canvas.width / 2) - (originalImage.width * zoomLevel / 2);
        vpt[5] = (canvas.height / 2) - (originalImage.height * zoomLevel / 2);
        canvas.setViewportTransform(vpt);
        updateZoomDisplay();
    };
}

document.querySelectorAll('button[id^="tool-"]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.id === 'tool-ocr') return;
    const toolId = btn.id.replace('tool-', '');
    switchTool(toolId);

    if (currentTool === TOOLS.TEXT) {
        const sc = document.getElementById('stroke-color-picker').value;
        const noFill = document.getElementById('btn-no-fill').classList.contains('active');
        const fc = noFill ? 'transparent' : document.getElementById('fill-color-picker').value;
        const t = new fabric.IText('Text', { 
            left: (originalImage.width / 2), 
            top: (originalImage.height / 2), 
            fontFamily: 'SF Pro Display, Segoe UI, sans-serif', 
            fill: sc, backgroundColor: fc, originX: 'center', originY: 'center'
        });
        canvas.add(t).setActiveObject(t);
        canvas.renderAll();
        setTimeout(() => switchTool(TOOLS.HAND), 100);
    }
}));

document.getElementById('btn-no-fill').onclick = function() { this.classList.toggle('active'); updateSettings(); };
document.getElementById('stroke-color-picker').oninput = updateSettings;
document.getElementById('fill-color-picker').oninput = updateSettings;
document.getElementById('stroke-width').onchange = updateSettings;

function getFinalDataUrl() {
    canvas.discardActiveObject().renderAll();
    const vpt = canvas.viewportTransform.slice();
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const dataURL = canvas.toDataURL({ format: 'png', left: 0, top: 0, width: originalImage.width, height: originalImage.height, multiplier: 1 });
    canvas.setViewportTransform(vpt);
    return dataURL;
}

document.getElementById('action-save').onclick = () => {
    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ action: 'save', data: { base64: getFinalDataUrl() } }));
};

document.getElementById('action-copy').onclick = function() {
    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ action: 'copy', data: { base64: getFinalDataUrl() } }));
    const btn = this; const originalHTML = btn.innerHTML;
    btn.classList.add('success'); btn.innerHTML = '<i class="fas fa-check"></i> Copied';
    setTimeout(() => { btn.classList.remove('success'); btn.innerHTML = originalHTML; }, 2000);
};

document.getElementById('action-restore').onclick = () => {
    canvas.getObjects().forEach(obj => { if (obj !== originalImage) canvas.remove(obj); });
    canvas.renderAll();
};

window.handleOCRResult = function(text) {
    const btn = document.getElementById('tool-ocr');
    document.getElementById('ocr-text-res').value = text;
    document.getElementById('ocr-toast').classList.remove('hidden');
    
    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ 
        action: 'copy_text', 
        data: { text: text } 
    }));

    btn.innerHTML = '<i class="fas fa-expand"></i>Copy text';
    btn.disabled = false;
};

window.handleOCRError = function(error) {
    const btn = document.getElementById('tool-ocr');
    console.error('OCR Error:', error);
    btn.innerHTML = `<i class="fas fa-times"></i> Error`;
    setTimeout(() => btn.innerHTML = '<i class="fas fa-expand"></i>Copy text', 3000);
    btn.disabled = false;
};

document.getElementById('tool-ocr').onclick = () => {
    const btn = document.getElementById('tool-ocr');
    if (!currentBase64) return;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reading...';
    btn.disabled = true;

    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ 
        action: 'ocr', 
        data: { base64: currentBase64 } 
    }));
};

document.getElementById('close-toast').onclick = () => {
    document.getElementById('ocr-toast').classList.add('hidden');
};

document.getElementById('copy-toast-btn').onclick = () => {
    const text = document.getElementById('ocr-text-res').value;
    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ 
        action: 'copy_text', 
        data: { text: text } 
    }));
    
    const btn = document.getElementById('copy-toast-btn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    setTimeout(() => btn.innerHTML = originalContent, 2000);
};