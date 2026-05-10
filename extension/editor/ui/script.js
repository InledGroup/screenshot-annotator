let canvas;
let currentTool = 'draw';
let originalImage;
let isDrawing = false;
let origX, origY, activeShape;
let zoomLevel = 1;

const TOOLS = { DRAW: 'draw', RECT: 'rect', CIRCLE: 'circle', ARROW: 'arrow', TEXT: 'text', BLUR: 'blur' };

window.handleMessage = function(payload) {
    if (payload.action === 'init') initCanvas(payload.data.imageBase64);
};

function initCanvas(base64) {
    if (!base64) return;
    if (canvas) canvas.dispose();

    canvas = new fabric.Canvas('editor-canvas', {
        isDrawingMode: true, enableRetinaScaling: true, selection: true, preserveObjectStacking: true
    });

    fabric.Image.fromURL(base64, function(img) {
        if (!img) return;
        originalImage = img;
        fitToScreen();
        canvas.add(img);
        canvas.sendToBack(img);
        canvas.renderAll();
        updateSettings();
    });

    setupInteraction();
    setupZoomAndPan();
}

function fitToScreen() {
    if (!originalImage) return;
    const padding = 60;
    const ratio = Math.min((window.innerWidth - padding) / originalImage.width, (window.innerHeight - 110 - padding) / originalImage.height);
    zoomLevel = ratio;
    updateZoomDisplay();
    canvas.setDimensions({ width: originalImage.width * zoomLevel, height: originalImage.height * zoomLevel });
    originalImage.set({ scaleX: zoomLevel, scaleY: zoomLevel, originX: 'left', originY: 'top', selectable: false, evented: false });
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
}

function updateZoomDisplay() {
    document.getElementById('zoom-level').textContent = Math.round(zoomLevel * 100) + '%';
}

function updateSettings() {
    if (!canvas) return;
    const strokeColor = document.getElementById('stroke-color-picker').value;
    const fillColor = document.getElementById('fill-color-picker').value;
    const strokeWidth = parseInt(document.getElementById('stroke-width').value);
    const noFill = document.getElementById('btn-no-fill').classList.contains('active');

    document.getElementById('stroke-bar').style.backgroundColor = strokeColor;
    document.getElementById('fill-bar').style.backgroundColor = noFill ? 'transparent' : fillColor;

    canvas.freeDrawingBrush.color = strokeColor;
    canvas.freeDrawingBrush.width = strokeWidth;

    const active = canvas.getActiveObject();
    if (active) {
        if (active.type === 'i-text') {
            active.set({ fill: strokeColor, backgroundColor: noFill ? 'transparent' : fillColor });
        } else if (active.toolType !== TOOLS.BLUR) {
            active.set({ stroke: strokeColor, strokeWidth: strokeWidth, fill: noFill ? 'transparent' : fillColor });
        }
        canvas.renderAll();
    }
}

// DYNAMIC PIXELATION
function refreshPixelate(obj) {
    if (!obj || obj.toolType !== TOOLS.BLUR) return;
    
    // Core: Use the actual width/height considering scaling
    const actualWidth = obj.width * obj.scaleX;
    const actualHeight = obj.height * obj.scaleY;
    const s = originalImage.scaleX;
    const pixelSize = 12;
    
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = actualWidth;
    tempCanvas.height = actualHeight;

    ctx.drawImage(
        originalImage._element,
        obj.left / s, obj.top / s, actualWidth / s, actualHeight / s,
        0, 0, actualWidth, actualHeight
    );

    for (let y = 0; y < tempCanvas.height; y += pixelSize) {
        for (let x = 0; x < tempCanvas.width; x += pixelSize) {
            const p = ctx.getImageData(x, y, 1, 1).data;
            ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`;
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
    }

    fabric.Image.fromURL(tempCanvas.toDataURL(), function(pImg) {
        // Use pattern that matches current object scale
        obj.set('fill', new fabric.Pattern({ source: pImg._element, repeat: 'no-repeat' }));
        // Important: we render a pattern that is already at the final size, 
        // so we don't want the object scale to affect it internally twice.
        // Fabric patterns are tricky with scaling.
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
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        fill: 'transparent',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        selectable: true,
        strokeUniform: true
    });
}

function setupInteraction() {
    canvas.on('mouse:down', function(o) {
        if (canvas.isDrawingMode || canvas.findTarget(o.e)) return;
        isDrawing = true;
        const p = canvas.getPointer(o.e);
        origX = p.x; origY = p.y;
        const sc = document.getElementById('stroke-color-picker').value;
        const fc = document.getElementById('btn-no-fill').classList.contains('active') ? 'transparent' : document.getElementById('fill-color-picker').value;
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
        if (isDrawing && activeShape && currentTool === TOOLS.BLUR) refreshPixelate(activeShape);
        isDrawing = false; activeShape = null; 
    });

    canvas.on('object:moving', (e) => refreshPixelate(e.target));
    canvas.on('object:scaling', (e) => refreshPixelate(e.target));

    const del = () => { 
        canvas.getActiveObjects().forEach(obj => { if (obj !== originalImage) canvas.remove(obj); });
        canvas.discardActiveObject().renderAll();
    };
    document.getElementById('action-delete').addEventListener('click', del);
    window.addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') del(); });
}

function setupZoomAndPan() {
    canvas.on('mouse:wheel', function(opt) {
        const delta = opt.e.deltaY;
        let zoom = canvas.getZoom();
        zoom *= 0.999 ** delta;
        if (zoom > 20) zoom = 20;
        if (zoom < 0.01) zoom = 0.01;
        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        zoomLevel = zoom;
        updateZoomDisplay();
        opt.e.preventDefault();
        opt.e.stopPropagation();
    });

    let lastX, lastY;
    canvas.on('mouse:down', function(opt) {
        if (opt.e.altKey || currentTool === 'pan') {
            this.isDragging = true;
            this.selection = false;
            lastX = opt.e.clientX;
            lastY = opt.e.clientY;
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
        }
    });
    canvas.on('mouse:up', function() {
        this.setViewportTransform(this.viewportTransform);
        this.isDragging = false;
        this.selection = !canvas.isDrawingMode;
    });

    document.getElementById('zoom-in').onclick = () => { zoomLevel *= 1.2; canvas.setZoom(zoomLevel); updateZoomDisplay(); };
    document.getElementById('zoom-out').onclick = () => { zoomLevel /= 1.2; canvas.setZoom(zoomLevel); updateZoomDisplay(); };
    document.getElementById('zoom-reset').onclick = fitToScreen;
}

// UI Handlers
document.querySelectorAll('button[id^="tool-"]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.id === 'tool-ocr') return;
    document.querySelectorAll('button[id^="tool-"]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.id.replace('tool-', '');
    canvas.isDrawingMode = (currentTool === TOOLS.DRAW);
    if (currentTool === TOOLS.TEXT) {
        const t = new fabric.IText('Text', { 
            left: 100, top: 100, 
            fontFamily: 'SF Pro Display, Segoe UI, sans-serif', 
            fill: document.getElementById('stroke-color-picker').value,
            backgroundColor: document.getElementById('btn-no-fill').classList.contains('active') ? 'transparent' : document.getElementById('fill-color-picker').value
        });
        canvas.add(t).setActiveObject(t);
    }
}));

document.getElementById('btn-no-fill').onclick = function() { this.classList.toggle('active'); updateSettings(); };
document.getElementById('stroke-color-picker').oninput = updateSettings;
document.getElementById('fill-color-picker').oninput = updateSettings;
document.getElementById('stroke-width').onchange = updateSettings;

// Actions
document.getElementById('action-save').onclick = () => {
    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ action: 'save', data: { base64: canvas.toDataURL({ format: 'png', multiplier: 2 / zoomLevel }) } }));
};
document.getElementById('action-copy').onclick = () => {
    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ action: 'copy', data: { base64: canvas.toDataURL({ format: 'png', multiplier: 2 / zoomLevel }) } }));
};
document.getElementById('action-restore').onclick = () => {
    canvas.getObjects().forEach(obj => { if (obj !== originalImage) canvas.remove(obj); });
    canvas.renderAll();
};

// OCR
document.getElementById('tool-ocr').onclick = async () => {
    const btn = document.getElementById('tool-ocr');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const worker = await Tesseract.createWorker('eng');
        const { data: { blocks } } = await worker.recognize(originalImage.toDataURL());
        await worker.terminate();
        const old = document.querySelector('.ocr-layer'); if (old) old.remove();
        const layer = document.createElement('div'); layer.className = 'ocr-layer';
        document.querySelector('.canvas-wrapper').appendChild(layer);
        const s = originalImage.scaleX;
        blocks.forEach(b => b.lines.forEach(l => l.words.forEach(w => {
            const box = document.createElement('div'); box.className = 'ocr-text-box'; box.textContent = w.text;
            Object.assign(box.style, { left: (w.bbox.x0*s)+'px', top: (w.bbox.y0*s)+'px', width: ((w.bbox.x1-w.bbox.x0)*s)+'px', height: ((w.bbox.y1-w.bbox.y0)*s)+'px', fontSize: ((w.bbox.y1-w.bbox.y0)*s*0.8)+'px' });
            layer.appendChild(box);
        })));
        btn.innerHTML = '<i class="fas fa-expand"></i> Live Text';
    } catch (e) { btn.innerHTML = '<i class="fas fa-times"></i> Error'; }
};
