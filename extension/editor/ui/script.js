let canvas;
let currentTool = 'draw';
let originalImage;
let isDrawing = false;
let origX, origY, activeShape;

const TOOLS = { DRAW: 'draw', RECT: 'rect', CIRCLE: 'circle', TEXT: 'text', BLUR: 'blur' };

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
        const ratio = Math.min(window.innerWidth * 0.92 / img.width, (window.innerHeight - 110) * 0.92 / img.height);
        canvas.setDimensions({ width: img.width * ratio, height: img.height * ratio });
        img.set({ scaleX: ratio, scaleY: ratio, originX: 'left', originY: 'top', selectable: false, evented: false });
        canvas.add(img);
        canvas.sendToBack(img);
        canvas.renderAll();
        updateSettings();
    });

    setupInteraction();
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
        if (active.type === 'i-text') active.set('fill', strokeColor);
        else {
            active.set({ stroke: strokeColor, strokeWidth: strokeWidth, fill: noFill ? 'transparent' : fillColor });
        }
        canvas.renderAll();
    }
}

// REAL-TIME PIXELATION REGENERATOR
function refreshPixelate(obj) {
    if (!obj || obj.toolType !== TOOLS.BLUR) return;
    
    const s = originalImage.scaleX;
    const pixelSize = 15;
    
    // Create mosaic on a hidden canvas
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = obj.width * obj.scaleX;
    tempCanvas.height = obj.height * obj.scaleY;

    // Draw source portion
    ctx.drawImage(
        originalImage._element,
        obj.left / s, obj.top / s, tempCanvas.width / s, tempCanvas.height / s,
        0, 0, tempCanvas.width, tempCanvas.height
    );

    // Pixelate loop
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
        else if (currentTool === TOOLS.BLUR) activeShape = new fabric.Rect({ ...common, width: 1, height: 1, toolType: TOOLS.BLUR, stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 });
        
        if (activeShape) canvas.add(activeShape);
    });

    canvas.on('mouse:move', function(o) {
        if (!isDrawing || !activeShape) return;
        const p = canvas.getPointer(o.e);
        if (currentTool === TOOLS.CIRCLE) activeShape.set({ left: Math.min(origX, p.x), top: Math.min(origY, p.y), radius: Math.abs(origX - p.x) / 2 });
        else activeShape.set({ left: Math.min(origX, p.x), top: Math.min(origY, p.y), width: Math.abs(origX - p.x), height: Math.abs(origY - p.y) });
        
        if (currentTool === TOOLS.BLUR) refreshPixelate(activeShape);
        canvas.renderAll();
    });

    canvas.on('mouse:up', () => { 
        if (isDrawing && activeShape && currentTool === TOOLS.BLUR) refreshPixelate(activeShape);
        isDrawing = false; activeShape = null; 
    });

    // Update pixelation when moving/scaling
    canvas.on('object:moving', (e) => refreshPixelate(e.target));
    canvas.on('object:scaling', (e) => refreshPixelate(e.target));

    // Deletion
    const del = () => { 
        canvas.getActiveObjects().forEach(obj => { if (obj !== originalImage) canvas.remove(obj); });
        canvas.discardActiveObject().renderAll();
    };
    document.getElementById('action-delete').addEventListener('click', del);
    window.addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') del(); });
}

// UI Handlers
document.querySelectorAll('button[id^="tool-"]').forEach(btn => btn.addEventListener('click', () => {
    if (btn.id === 'tool-ocr') return;
    document.querySelectorAll('button[id^="tool-"]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.id.replace('tool-', '');
    canvas.isDrawingMode = (currentTool === TOOLS.DRAW);
    if (currentTool === TOOLS.TEXT) {
        const t = new fabric.IText('Text', { left: 100, top: 100, fontFamily: 'sans-serif', fill: document.getElementById('stroke-color-picker').value });
        canvas.add(t).setActiveObject(t);
    }
}));

document.getElementById('btn-no-fill').addEventListener('click', function() {
    this.classList.toggle('active');
    updateSettings();
});
document.getElementById('stroke-color-picker').addEventListener('input', updateSettings);
document.getElementById('fill-color-picker').addEventListener('input', updateSettings);
document.getElementById('stroke-width').addEventListener('change', updateSettings);

// Actions
document.getElementById('action-save').addEventListener('click', () => {
    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ action: 'save', data: { base64: canvas.toDataURL({ format: 'png', multiplier: 2 }) } }));
});
document.getElementById('action-copy').addEventListener('click', () => {
    window.webkit.messageHandlers.app.postMessage(JSON.stringify({ action: 'copy', data: { base64: canvas.toDataURL({ format: 'png', multiplier: 2 }) } }));
});
document.getElementById('action-restore').addEventListener('click', () => {
    canvas.getObjects().forEach(obj => { if (obj !== originalImage) canvas.remove(obj); });
    canvas.renderAll();
});

// OCR
document.getElementById('tool-ocr').addEventListener('click', async () => {
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
});
