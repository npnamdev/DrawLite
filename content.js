class WebDrawingExtension {
    constructor() {
        this.isDrawing = false;
        this.isEnabled = false;
        this.currentColor = '#000000';
        this.lineWidth = 3;
        this.canvas = null;
        this.ctx = null;
        this.svgOverlay = null;
        this.lastX = 0;
        this.lastY = 0;
        this.isInitialized = false;
        this.drawingMode = 'pen'; // pen, rectangle, circle, arrow, line, triangle, star, move, eraser, picker
        this.shapeStartX = 0;
        this.shapeStartY = 0;
        this.uiElement = null;
        this.isToolbarVisible = false;
        this.shapes = []; // Store all shapes for movement
        this.selectedShape = null; // Currently selected shape for moving
        this.moveOffsetX = 0;
        this.moveOffsetY = 0;
        this.originalShape = null; // Store original shape position for delta calculation
        this.currentPath = []; // Store current pen drawing path
        this.erasedAreas = []; // Store erased areas to track which shapes are removed
        this.isDragging = false; // Track toolbar dragging state
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.toolbarInitialX = 0;
        this.toolbarInitialY = 0;
        
        this.setupMessageListener();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === "toggleUI") {
                this.toggleExtension();
            }
        });
    }

    toggleExtension() {
        if (this.isInitialized) {
            this.hideExtension();
        } else {
            this.init();
        }
    }

    hideExtension() {
        this.hideToolbar();
        this.cleanupExistingElements();
        this.isInitialized = false;
    }
    
    createToggleButton() {
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'webext-toggle-btn';
        toggleBtn.innerHTML = '🎨';
        toggleBtn.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            background: #007bff;
            border: none;
            border-radius: 50%;
            color: white;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
            z-index: 1000000;
            transition: all 0.2s ease;
        `;
        
        toggleBtn.addEventListener('mouseenter', () => {
            toggleBtn.style.transform = 'scale(1.1)';
        });
        
        toggleBtn.addEventListener('mouseleave', () => {
            toggleBtn.style.transform = 'scale(1)';
        });
        
        document.body.appendChild(toggleBtn);
    }
    
    showToolbar() {
        this.uiElement.style.display = 'block';
        this.isToolbarVisible = true;
        // Remove toggle button completely
        const toggleBtn = document.getElementById('webext-toggle-btn');
        if (toggleBtn) {
            toggleBtn.remove();
        }
    }
    
    hideToolbar() {
        this.uiElement.style.display = 'none';
        this.isToolbarVisible = false;
    }

    init() {
        this.cleanupExistingElements();
        this.createCanvas();
        this.createSVGOverlay();
        this.createUI();
        this.setupEventListeners();
        this.isInitialized = true;
        this.showToolbar(); // Show toolbar directly instead of toggle button
        this.enableDrawing(); // Enable drawing by default
        
        // Set pen tool as active by default
        const penTool = document.querySelector('.webext-draw-tool-btn[data-tool="pen"]');
        if (penTool) {
            penTool.classList.add('active');
        }
    }

    cleanupExistingElements() {
        // Remove existing canvas if present
        const existingCanvas = document.getElementById('webext-draw-canvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }
        
        // Remove existing SVG overlay if present
        const existingSVG = document.getElementById('webext-draw-svg-overlay');
        if (existingSVG) {
            existingSVG.remove();
        }
        
        // Remove existing toggle button if present
        const existingToggleBtn = document.getElementById('webext-toggle-btn');
        if (existingToggleBtn) {
            existingToggleBtn.remove();
        }
        
        // Remove existing UI if present
        const existingUI = document.getElementById('webext-draw-ui');
        if (existingUI) {
            existingUI.remove();
        }
    }

    createSVGOverlay() {
        this.svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.svgOverlay.id = 'webext-draw-svg-overlay';
        this.svgOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 999998;
            pointer-events: none;
            background: transparent;
        `;
        document.body.appendChild(this.svgOverlay);
    }

    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'webext-draw-canvas';
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 999999;
            pointer-events: auto;
            background: transparent;
        `;
        
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();
        document.body.appendChild(this.canvas);
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ctx.putImageData(imageData, 0, 0);
    }

    createUI() {
        const ui = document.createElement('div');
        ui.id = 'webext-draw-ui';
        ui.style.display = 'none';
        ui.innerHTML = `
            <div class="webext-draw-toolbar">
                <div class="webext-drag-handle" title="Kéo để di chuyển thanh công cụ">
                    <div class="webext-drag-dots">
                        <span></span><span></span>
                        <span></span><span></span>
                        <span></span><span></span>
                    </div>
                </div>
                <div class="webext-draw-toolbar-content">
                    <button class="webext-draw-tool-btn" data-tool="pen" title="Vẽ tự do (Bút)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="rectangle" title="Vẽ hình chữ nhật">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="circle" title="Vẽ hình tròn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="triangle" title="Vẽ hình tam giác">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 20h20L12 2z"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="star" title="Vẽ ngôi sao">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="picker" title="Lấy màu từ màn hình">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 17l1 5 1.5-2 1.5 2 1-5"/>
                            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="move" title="Di chuyển hình đã vẽ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="5 9 2 12 5 15"/>
                            <polyline points="9 5 12 2 15 5"/>
                            <polyline points="15 19 12 22 9 19"/>
                            <polyline points="19 9 22 12 19 15"/>
                            <line x1="2" y1="12" x2="22" y2="12"/>
                            <line x1="12" y1="2" x2="12" y2="22"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="arrow" title="Vẽ mũi tên">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12 5 19 12 12 19"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="line" title="Vẽ đường thẳng">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="19" x2="19" y2="5"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="eraser" title="Tẩy (Xóa)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 20H7l-4-4a1 1 0 0 1 0-1.414l9-9a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 0 1.414l-4 4"/>
                            <line x1="11" y1="11" x2="17" y2="17"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="color" title="Chọn màu vẽ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                            <line x1="12" y1="22" x2="12" y2="18"/>
                            <line x1="8" y1="22" x2="16" y2="22"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="size" title="Độ dày nét vẽ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1" fill="none"/>
                            <circle cx="12" cy="12" r="3" fill="none"/>
                            <circle cx="12" cy="12" r="5" fill="none"/>
                        </svg>
                    </button>
                </div>
                <button class="webext-draw-close-btn" title="Tắt extension">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            
            <!-- Color Popup -->
            <div id="webext-color-popup" class="webext-draw-popup" style="display: none;">
                <div class="webext-draw-quick-colors">
                    <div class="webext-draw-quick-color webext-draw-custom-color" data-color="custom" title="Chọn màu tùy chỉnh" style="background: linear-gradient(45deg, #ff0000 0%, #00ff00 33%, #0000ff 66%, #ffff00 100%); position: relative;">
                        <input type="color" id="webext-custom-color-input" style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;">
                    </div>
                    <div class="webext-draw-quick-color" data-color="#000000" style="background:#000000"></div>
                    <div class="webext-draw-quick-color" data-color="#ffffff" style="background:#ffffff"></div>
                    <div class="webext-draw-quick-color" data-color="#ff0000" style="background:#ff0000"></div>
                    <div class="webext-draw-quick-color" data-color="#00ff00" style="background:#00ff00"></div>
                    <div class="webext-draw-quick-color" data-color="#0000ff" style="background:#0000ff"></div>
                    <div class="webext-draw-quick-color" data-color="#ffff00" style="background:#ffff00"></div>
                    <div class="webext-draw-quick-color" data-color="#ff00ff" style="background:#ff00ff"></div>
                    <div class="webext-draw-quick-color" data-color="#00ffff" style="background:#00ffff"></div>
                    <div class="webext-draw-quick-color" data-color="#ff8800" style="background:#ff8800"></div>
                    <div class="webext-draw-quick-color" data-color="#8800ff" style="background:#8800ff"></div>
                    <div class="webext-draw-quick-color" data-color="#00ff88" style="background:#00ff88"></div>
                    <div class="webext-draw-quick-color" data-color="#ff69b4" style="background:#ff69b4"></div>
                    <div class="webext-draw-quick-color" data-color="#32cd32" style="background:#32cd32"></div>
                    <div class="webext-draw-quick-color" data-color="#4169e1" style="background:#4169e1"></div>
                </div>
            </div>
            
            <!-- Size Popup -->
            <div id="webext-size-popup" class="webext-draw-popup" style="display: none;">
                <div class="webext-draw-size-controls">
                    <input type="range" id="webext-line-width" min="1" max="50" value="3">
                    <span id="webext-draw-size-value">3</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(ui);
        this.uiElement = ui;
        
        // Don't create toggle button anymore - toolbar shows directly
        // this.createToggleButton();
    }

    setupEventListeners() {
        const customColorInput = document.getElementById('webext-custom-color-input');
        const lineWidthSlider = document.getElementById('webext-line-width');
        const sizeValue = document.getElementById('webext-draw-size-value');
        const toolButtons = document.querySelectorAll('.webext-draw-tool-btn');
        const quickColors = document.querySelectorAll('.webext-draw-quick-color');
        const closeBtn = document.querySelector('.webext-draw-close-btn');
        const colorPopup = document.getElementById('webext-color-popup');
        const sizePopup = document.getElementById('webext-size-popup');
        const toggleBtn = document.getElementById('webext-toggle-btn');
        const dragHandle = document.querySelector('.webext-drag-handle');

        closeBtn.addEventListener('click', () => this.hideExtension());
        
        // Setup drag functionality
        if (dragHandle) {
            dragHandle.addEventListener('mousedown', (e) => this.startDragging(e));
        }
        
        document.addEventListener('mousemove', (e) => this.drag(e));
        document.addEventListener('mouseup', () => this.stopDragging());
        
        toolButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.currentTarget;
                const tool = button.dataset.tool;
                
                // Handle special tools
                if (tool === 'color') {
                    this.togglePopup('color', button);
                    return;
                } else if (tool === 'size') {
                    this.togglePopup('size', button);
                    return;
                }
                
                // Handle drawing tools
                toolButtons.forEach(b => b.classList.remove('active'));
                button.classList.add('active');
                this.drawingMode = tool;
                this.updateCursor();
                this.closeAllPopups();
            });
        });
        
        quickColors.forEach(item => {
            item.addEventListener('click', (e) => {
                const color = e.target.dataset.color;
                if (color === 'custom') {
                    // Trigger the hidden color input
                    customColorInput.click();
                } else {
                    this.currentColor = color;
                }
            });
        });
        
        customColorInput.addEventListener('change', (e) => {
            this.currentColor = e.target.value;
        });
        
        lineWidthSlider.addEventListener('input', (e) => {
            this.lineWidth = e.target.value;
            sizeValue.textContent = e.target.value;
        });

        // Close popups when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.webext-draw-tool-btn[data-tool="color"]') && 
                !e.target.closest('#webext-color-popup')) {
                colorPopup.style.display = 'none';
                // Remove active state from color button when popup is closed by outside click
                document.querySelector('.webext-draw-tool-btn[data-tool="color"]')?.classList.remove('popup-active');
            }
            if (!e.target.closest('.webext-draw-tool-btn[data-tool="size"]') && 
                !e.target.closest('#webext-size-popup')) {
                sizePopup.style.display = 'none';
                // Remove active state from size button when popup is closed by outside click
                document.querySelector('.webext-draw-tool-btn[data-tool="size"]')?.classList.remove('popup-active');
            }
        });

        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.disableDrawing();
                this.closeAllPopups();
            }
        });
    }

    enableDrawing() {
        this.isEnabled = true;
        this.canvas.style.pointerEvents = 'auto';
        this.updateCursor();
    }

    disableDrawing() {
        this.isEnabled = false;
        this.isDrawing = false;
        this.canvas.style.pointerEvents = 'none';
    }

    startDrawing(e) {
        if (!this.isEnabled) return;
        
        this.isDrawing = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.shapeStartX = e.clientX;
        this.shapeStartY = e.clientY;
        
        if (this.drawingMode === 'move') {
            // Check if clicking on a shape
            this.selectedShape = this.getShapeAtPoint(e.clientX, e.clientY);
            if (this.selectedShape) {
                // Store initial position for delta calculation
                this.moveStartX = e.clientX;
                this.moveStartY = e.clientY;
                this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));
            }
        } else if (this.drawingMode === 'picker') {
            this.pickColor(e.clientX, e.clientY);
        } else if (this.drawingMode === 'pen') {
            // Start new path
            this.currentPath = [{x: e.clientX, y: e.clientY}];
        } else if (this.drawingMode !== 'pen' && this.drawingMode !== 'eraser') {
            this.svgOverlay.style.pointerEvents = 'auto';
        }
    }

    draw(e) {
        if (!this.isDrawing || !this.isEnabled) return;

        if (this.drawingMode === 'pen') {
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(e.clientX, e.clientY);
            this.ctx.strokeStyle = this.currentColor;
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.stroke();
            
            // Add point to current path
            this.currentPath.push({x: e.clientX, y: e.clientY});

            this.lastX = e.clientX;
            this.lastY = e.clientY;
        } else if (this.drawingMode === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(e.clientX, e.clientY);
            this.ctx.lineWidth = this.lineWidth * 3; // Make eraser bigger
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.stroke();
            this.ctx.globalCompositeOperation = 'source-over';
            
            // Track erased area and remove shapes from array
            const eraserRect = {
                x: Math.min(this.lastX, e.clientX) - this.lineWidth * 2,
                y: Math.min(this.lastY, e.clientY) - this.lineWidth * 2,
                width: Math.abs(e.clientX - this.lastX) + this.lineWidth * 4,
                height: Math.abs(e.clientY - this.lastY) + this.lineWidth * 4
            };
            
            // Remove shapes that intersect with eraser
            this.shapes = this.shapes.filter(shape => {
                if (shape.type === 'path') {
                    // Check if any point in path intersects with eraser
                    return !shape.points.some(point => 
                        point.x >= eraserRect.x && 
                        point.x <= eraserRect.x + eraserRect.width &&
                        point.y >= eraserRect.y && 
                        point.y <= eraserRect.y + eraserRect.height
                    );
                } else if (shape.type === 'rect') {
                    // Check rectangle intersection
                    return !(shape.x < eraserRect.x + eraserRect.width &&
                            shape.x + shape.width > eraserRect.x &&
                            shape.y < eraserRect.y + eraserRect.height &&
                            shape.y + shape.height > eraserRect.y);
                } else if (shape.type === 'circle') {
                    // Check circle intersection
                    const dist = Math.sqrt(
                        Math.pow(shape.cx - (eraserRect.x + eraserRect.width/2), 2) + 
                        Math.pow(shape.cy - (eraserRect.y + eraserRect.height/2), 2)
                    );
                    return dist > shape.r + Math.max(eraserRect.width, eraserRect.height)/2;
                } else if (shape.type === 'line' || shape.type === 'arrow') {
                    // Check line intersection
                    return !(shape.x1 >= eraserRect.x && shape.x1 <= eraserRect.x + eraserRect.width &&
                            shape.y1 >= eraserRect.y && shape.y1 <= eraserRect.y + eraserRect.height &&
                            shape.x2 >= eraserRect.x && shape.x2 <= eraserRect.x + eraserRect.width &&
                            shape.y2 >= eraserRect.y && shape.y2 <= eraserRect.y + eraserRect.height);
                } else if (shape.type === 'polygon') {
                    // Check polygon intersection
                    const points = shape.points.split(' ');
                    return !points.some(point => {
                        const [x, y] = point.split(',').map(Number);
                        return x >= eraserRect.x && x <= eraserRect.x + eraserRect.width &&
                               y >= eraserRect.y && y <= eraserRect.y + eraserRect.height;
                    });
                }
                return true;
            });

            this.lastX = e.clientX;
            this.lastY = e.clientY;
        } else if (this.drawingMode === 'move') {
            if (this.selectedShape && this.originalShape) {
                const deltaX = e.clientX - this.moveStartX;
                const deltaY = e.clientY - this.moveStartY;
                
                // Update position based on shape type
                if (this.selectedShape.type === 'path') {
                    // Move all points in the path
                    this.selectedShape.points = this.originalShape.points.map(point => ({
                        x: point.x + deltaX,
                        y: point.y + deltaY
                    }));
                } else if (this.selectedShape.type === 'text' || 
                    this.selectedShape.type === 'rect' || 
                    this.selectedShape.type === 'circle') {
                    this.selectedShape.x = this.originalShape.x + deltaX;
                    this.selectedShape.y = this.originalShape.y + deltaY;
                } else if (this.selectedShape.type === 'line' || 
                          this.selectedShape.type === 'arrow') {
                    this.selectedShape.x1 = this.originalShape.x1 + deltaX;
                    this.selectedShape.y1 = this.originalShape.y1 + deltaY;
                    this.selectedShape.x2 = this.originalShape.x2 + deltaX;
                    this.selectedShape.y2 = this.originalShape.y2 + deltaY;
                } else if (this.selectedShape.type === 'polygon') {
                    const points = this.originalShape.points.split(' ');
                    const newPoints = points.map(point => {
                        const [x, y] = point.split(',').map(Number);
                        return `${x + deltaX},${y + deltaY}`;
                    });
                    this.selectedShape.points = newPoints.join(' ');
                }
                
                this.redrawAllShapes();
            }
        } else {
            this.drawShape(e.clientX, e.clientY);
        }
    }

    drawShape(currentX, currentY) {
        // Clear previous preview
        while (this.svgOverlay.firstChild) {
            this.svgOverlay.removeChild(this.svgOverlay.firstChild);
        }

        let shape;
        const strokeColor = this.currentColor;
        const strokeWidth = this.lineWidth;

        switch (this.drawingMode) {
            case 'rectangle':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                const rectWidth = Math.abs(currentX - this.shapeStartX);
                const rectHeight = Math.abs(currentY - this.shapeStartY);
                const rectX = Math.min(currentX, this.shapeStartX);
                const rectY = Math.min(currentY, this.shapeStartY);
                shape.setAttribute('x', rectX);
                shape.setAttribute('y', rectY);
                shape.setAttribute('width', rectWidth);
                shape.setAttribute('height', rectHeight);
                shape.setAttribute('fill', 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                break;

            case 'circle':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                const radius = Math.sqrt(Math.pow(currentX - this.shapeStartX, 2) + Math.pow(currentY - this.shapeStartY, 2));
                shape.setAttribute('cx', this.shapeStartX);
                shape.setAttribute('cy', this.shapeStartY);
                shape.setAttribute('r', radius);
                shape.setAttribute('fill', 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                break;

            case 'line':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                shape.setAttribute('x1', this.shapeStartX);
                shape.setAttribute('y1', this.shapeStartY);
                shape.setAttribute('x2', currentX);
                shape.setAttribute('y2', currentY);
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                shape.setAttribute('stroke-linecap', 'round');
                break;

            case 'triangle':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const x1 = this.shapeStartX;
                const y1 = this.shapeStartY;
                const x2 = currentX;
                const y2 = currentY;
                const x3 = this.shapeStartX - (currentX - this.shapeStartX);
                const y3 = currentY;
                const points = `${x1},${y1} ${x2},${y2} ${x3},${y3}`;
                shape.setAttribute('points', points);
                shape.setAttribute('fill', 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                shape.setAttribute('stroke-linejoin', 'round');
                break;

            case 'star':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const centerX = (this.shapeStartX + currentX) / 2;
                const centerY = (this.shapeStartY + currentY) / 2;
                const outerRadius = Math.sqrt(Math.pow(currentX - this.shapeStartX, 2) + Math.pow(currentY - this.shapeStartY, 2)) / 2;
                const innerRadius = outerRadius * 0.4;
                const starPoints = [];
                for (let i = 0; i < 10; i++) {
                    const radius = i % 2 === 0 ? outerRadius : innerRadius;
                    const angle = (Math.PI / 5) * i - Math.PI / 2;
                    const x = centerX + radius * Math.cos(angle);
                    const y = centerY + radius * Math.sin(angle);
                    starPoints.push(`${x},${y}`);
                }
                shape.setAttribute('points', starPoints.join(' '));
                shape.setAttribute('fill', 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                shape.setAttribute('stroke-linejoin', 'round');
                break;

            case 'arrow':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                
                // Arrow line
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', this.shapeStartX);
                line.setAttribute('y1', this.shapeStartY);
                line.setAttribute('x2', currentX);
                line.setAttribute('y2', currentY);
                line.setAttribute('stroke', strokeColor);
                line.setAttribute('stroke-width', strokeWidth);
                line.setAttribute('stroke-linecap', 'round');
                shape.appendChild(line);
                
                // Arrow head
                const angle = Math.atan2(currentY - this.shapeStartY, currentX - this.shapeStartX);
                const arrowLength = 15;
                const arrowAngle = Math.PI / 6;
                
                const arrowHead1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                arrowHead1.setAttribute('x1', currentX);
                arrowHead1.setAttribute('y1', currentY);
                arrowHead1.setAttribute('x2', currentX - arrowLength * Math.cos(angle - arrowAngle));
                arrowHead1.setAttribute('y2', currentY - arrowLength * Math.sin(angle - arrowAngle));
                arrowHead1.setAttribute('stroke', strokeColor);
                arrowHead1.setAttribute('stroke-width', strokeWidth);
                arrowHead1.setAttribute('stroke-linecap', 'round');
                shape.appendChild(arrowHead1);
                
                const arrowHead2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                arrowHead2.setAttribute('x1', currentX);
                arrowHead2.setAttribute('y1', currentY);
                arrowHead2.setAttribute('x2', currentX - arrowLength * Math.cos(angle + arrowAngle));
                arrowHead2.setAttribute('y2', currentY - arrowLength * Math.sin(angle + arrowAngle));
                arrowHead2.setAttribute('stroke', strokeColor);
                arrowHead2.setAttribute('stroke-width', strokeWidth);
                arrowHead2.setAttribute('stroke-linecap', 'round');
                shape.appendChild(arrowHead2);
                break;
        }

        if (shape) {
            this.svgOverlay.appendChild(shape);
        }
    }

    stopDrawing() {
        if (this.isDrawing) {
            if (this.drawingMode === 'pen' && this.currentPath.length > 1) {
                // Save pen drawing as a path shape
                this.shapes.push({
                    type: 'path',
                    points: [...this.currentPath],
                    color: this.currentColor,
                    strokeWidth: this.lineWidth
                });
                this.currentPath = [];
            } else if (this.drawingMode !== 'pen' && this.drawingMode !== 'eraser' && this.drawingMode !== 'move' && this.drawingMode !== 'picker') {
                // Save shape to array
                const shape = this.createShapeFromSVG();
                if (shape) {
                    this.shapes.push(shape);
                    this.svgToCanvas();
                }
            }
        }
        this.isDrawing = false;
        this.selectedShape = null;
        this.originalShape = null;
        this.svgOverlay.style.pointerEvents = 'none';
    }

    svgToCanvas() {
        try {
            const svgData = new XMLSerializer().serializeToString(this.svgOverlay);
            const img = new Image();
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            
            img.onload = () => {
                try {
                    this.ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    // Clear SVG
                    while (this.svgOverlay.firstChild) {
                        this.svgOverlay.removeChild(this.svgOverlay.firstChild);
                    }
                } catch (error) {
                    console.error('Error drawing SVG to canvas:', error);
                    this.fallbackDirectCanvasDrawing();
                    URL.revokeObjectURL(url);
                }
            };
            
            img.onerror = () => {
                console.error('Failed to load SVG image');
                this.fallbackDirectCanvasDrawing();
                URL.revokeObjectURL(url);
            };
            
            img.src = url;
        } catch (error) {
            console.error('Error in SVG to canvas conversion:', error);
            this.fallbackDirectCanvasDrawing();
        }
    }

    fallbackDirectCanvasDrawing() {
        // Fallback: draw the last shape directly to canvas
        const shape = this.svgOverlay.querySelector('rect, circle, line, g, polygon');
        if (!shape) return;
        
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        if (shape.tagName === 'rect') {
            const x = parseFloat(shape.getAttribute('x'));
            const y = parseFloat(shape.getAttribute('y'));
            const width = parseFloat(shape.getAttribute('width'));
            const height = parseFloat(shape.getAttribute('height'));
            this.ctx.strokeRect(x, y, width, height);
        } else if (shape.tagName === 'circle') {
            const cx = parseFloat(shape.getAttribute('cx'));
            const cy = parseFloat(shape.getAttribute('cy'));
            const r = parseFloat(shape.getAttribute('r'));
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
            this.ctx.stroke();
        } else if (shape.tagName === 'line') {
            const x1 = parseFloat(shape.getAttribute('x1'));
            const y1 = parseFloat(shape.getAttribute('y1'));
            const x2 = parseFloat(shape.getAttribute('x2'));
            const y2 = parseFloat(shape.getAttribute('y2'));
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        } else if (shape.tagName === 'polygon') {
            const points = shape.getAttribute('points').split(' ');
            this.ctx.beginPath();
            points.forEach((point, index) => {
                const [x, y] = point.split(',').map(parseFloat);
                if (index === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            });
            this.ctx.closePath();
            this.ctx.stroke();
        } else if (shape.tagName === 'g') {
            // Draw arrow lines directly
            const lines = shape.querySelectorAll('line');
            lines.forEach(line => {
                const x1 = parseFloat(line.getAttribute('x1'));
                const y1 = parseFloat(line.getAttribute('y1'));
                const x2 = parseFloat(line.getAttribute('x2'));
                const y2 = parseFloat(line.getAttribute('y2'));
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
            });
        }
        
        // Clear SVG
        while (this.svgOverlay.firstChild) {
            this.svgOverlay.removeChild(this.svgOverlay.firstChild);
        }
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        while (this.svgOverlay.firstChild) {
            this.svgOverlay.removeChild(this.svgOverlay.firstChild);
        }
        this.shapes = [];
    }

    async pickColor(x, y) {
        try {
            // Use EyeDropper API if available (Chrome 95+)
            if (window.EyeDropper) {
                const eyeDropper = new EyeDropper();
                const result = await eyeDropper.open();
                const hexColor = result.sRGBHex;
                
                // Copy to clipboard
                await navigator.clipboard.writeText(hexColor);
                
                // Show notification
                this.showColorNotification(hexColor);
                
                // Set as current color
                this.currentColor = hexColor;
                
                // Switch back to pen tool
                const penTool = document.querySelector('.webext-draw-tool-btn[data-tool="pen"]');
                if (penTool) {
                    penTool.click();
                }
            } else {
                // Fallback: Use canvas element to pick color
                const element = document.elementFromPoint(x, y);
                if (element) {
                    // Create a temporary canvas to capture the element
                    const rect = element.getBoundingClientRect();
                    const tempCanvas = document.createElement('canvas');
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCanvas.width = rect.width;
                    tempCanvas.height = rect.height;
                    
                    // Use html2canvas library if available, otherwise show message
                    this.showColorNotification('#FF5733 (Fallback - Install EyeDropper)');
                }
            }
        } catch (error) {
            console.error('Color picker error:', error);
            this.showColorNotification('#FF5733 (Error)');
        }
        
        this.isDrawing = false;
    }

    showColorNotification(color) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #333;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 1000003;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: opacity 0.3s ease;
        `;
        notification.textContent = `Màu sắc ${color} đã được copy!`;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    }

    showTextInput(x, y) {
        // Temporarily disable canvas pointer events
        this.canvas.style.pointerEvents = 'none';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            font-size: ${this.lineWidth * 5}px;
            color: ${this.currentColor};
            background: transparent;
            border: 1px dashed #007bff;
            outline: none;
            z-index: 1000002;
            padding: 2px;
            min-width: 100px;
        `;
        
        document.body.appendChild(input);
        input.focus();
        
        const finishText = () => {
            const text = input.value.trim();
            if (text) {
                this.ctx.font = `${this.lineWidth * 5}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
                this.ctx.fillStyle = this.currentColor;
                this.ctx.fillText(text, x, y);
                
                // Save text shape
                this.shapes.push({
                    type: 'text',
                    text: text,
                    x: x,
                    y: y,
                    color: this.currentColor,
                    fontSize: this.lineWidth * 5
                });
            }
            input.remove();
            this.isDrawing = false;
            // Re-enable canvas pointer events
            this.canvas.style.pointerEvents = 'auto';
        };
        
        input.addEventListener('blur', finishText);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishText();
            }
        });
    }

    createShapeFromSVG() {
        const shape = this.svgOverlay.querySelector('rect, circle, line, g, polygon');
        if (!shape) return null;
        
        const shapeData = {
            type: shape.tagName,
            color: this.currentColor,
            strokeWidth: this.lineWidth
        };
        
        if (shape.tagName === 'rect') {
            shapeData.x = parseFloat(shape.getAttribute('x'));
            shapeData.y = parseFloat(shape.getAttribute('y'));
            shapeData.width = parseFloat(shape.getAttribute('width'));
            shapeData.height = parseFloat(shape.getAttribute('height'));
        } else if (shape.tagName === 'circle') {
            shapeData.x = parseFloat(shape.getAttribute('cx'));
            shapeData.y = parseFloat(shape.getAttribute('cy'));
            shapeData.radius = parseFloat(shape.getAttribute('r'));
        } else if (shape.tagName === 'line') {
            shapeData.x1 = parseFloat(shape.getAttribute('x1'));
            shapeData.y1 = parseFloat(shape.getAttribute('y1'));
            shapeData.x2 = parseFloat(shape.getAttribute('x2'));
            shapeData.y2 = parseFloat(shape.getAttribute('y2'));
        } else if (shape.tagName === 'polygon') {
            shapeData.points = shape.getAttribute('points');
            const points = shapeData.points.split(' ');
            const firstPoint = points[0].split(',');
            shapeData.x = parseFloat(firstPoint[0]);
            shapeData.y = parseFloat(firstPoint[1]);
        } else if (shape.tagName === 'g') {
            const lines = shape.querySelectorAll('line');
            if (lines.length === 3) { // Arrow
                const mainLine = lines[0];
                shapeData.x1 = parseFloat(mainLine.getAttribute('x1'));
                shapeData.y1 = parseFloat(mainLine.getAttribute('y1'));
                shapeData.x2 = parseFloat(mainLine.getAttribute('x2'));
                shapeData.y2 = parseFloat(mainLine.getAttribute('y2'));
                shapeData.type = 'arrow';
            }
        }
        
        return shapeData;
    }

    getShapeAtPoint(x, y) {
        // Check shapes in reverse order (top to bottom)
        for (let i = this.shapes.length - 1; i >= 0; i--) {
            const shape = this.shapes[i];
            
            if (shape.type === 'path') {
                // Check if point is near any segment of the path
                for (let j = 0; j < shape.points.length - 1; j++) {
                    const p1 = shape.points[j];
                    const p2 = shape.points[j + 1];
                    const distance = this.pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
                    if (distance < shape.strokeWidth + 5) {
                        return shape;
                    }
                }
            } else if (shape.type === 'text') {
                this.ctx.font = `${shape.fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
                const metrics = this.ctx.measureText(shape.text);
                if (x >= shape.x && x <= shape.x + metrics.width &&
                    y >= shape.y - shape.fontSize && y <= shape.y) {
                    return shape;
                }
            } else if (shape.type === 'rect') {
                if (x >= shape.x && x <= shape.x + shape.width &&
                    y >= shape.y && y <= shape.y + shape.height) {
                    return shape;
                }
            } else if (shape.type === 'circle') {
                const distance = Math.sqrt(Math.pow(x - shape.x, 2) + Math.pow(y - shape.y, 2));
                if (distance <= shape.radius) {
                    return shape;
                }
            } else if (shape.type === 'line' || shape.type === 'arrow') {
                // Simple bounding box check for lines
                const minX = Math.min(shape.x1, shape.x2) - 10;
                const maxX = Math.max(shape.x1, shape.x2) + 10;
                const minY = Math.min(shape.y1, shape.y2) - 10;
                const maxY = Math.max(shape.y1, shape.y2) + 10;
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    return shape;
                }
            } else if (shape.type === 'polygon') {
                // Simple bounding box for polygons
                const points = shape.points.split(' ').map(p => p.split(',').map(Number));
                const minX = Math.min(...points.map(p => p[0])) - 10;
                const maxX = Math.max(...points.map(p => p[0])) + 10;
                const minY = Math.min(...points.map(p => p[1])) - 10;
                const maxY = Math.max(...points.map(p => p[1])) + 10;
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    return shape;
                }
            }
        }
        return null;
    }

    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    redrawAllShapes() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Redraw all shapes
        this.shapes.forEach(shape => {
            this.ctx.strokeStyle = shape.color;
            this.ctx.lineWidth = shape.strokeWidth;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            
            if (shape.type === 'path') {
                // Draw pen path
                this.ctx.beginPath();
                shape.points.forEach((point, index) => {
                    if (index === 0) {
                        this.ctx.moveTo(point.x, point.y);
                    } else {
                        this.ctx.lineTo(point.x, point.y);
                    }
                });
                this.ctx.stroke();
            } else if (shape.type === 'text') {
                this.ctx.font = `${shape.fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
                this.ctx.fillStyle = shape.color;
                this.ctx.fillText(shape.text, shape.x, shape.y);
            } else if (shape.type === 'rect') {
                this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
            } else if (shape.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(shape.x, shape.y, shape.radius, 0, 2 * Math.PI);
                this.ctx.stroke();
            } else if (shape.type === 'line') {
                this.ctx.beginPath();
                this.ctx.moveTo(shape.x1, shape.y1);
                this.ctx.lineTo(shape.x2, shape.y2);
                this.ctx.stroke();
            } else if (shape.type === 'arrow') {
                // Draw arrow line
                this.ctx.beginPath();
                this.ctx.moveTo(shape.x1, shape.y1);
                this.ctx.lineTo(shape.x2, shape.y2);
                this.ctx.stroke();
                
                // Draw arrow head
                const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
                const arrowLength = 15;
                const arrowAngle = Math.PI / 6;
                
                this.ctx.beginPath();
                this.ctx.moveTo(shape.x2, shape.y2);
                this.ctx.lineTo(shape.x2 - arrowLength * Math.cos(angle - arrowAngle), 
                               shape.y2 - arrowLength * Math.sin(angle - arrowAngle));
                this.ctx.stroke();
                
                this.ctx.beginPath();
                this.ctx.moveTo(shape.x2, shape.y2);
                this.ctx.lineTo(shape.x2 - arrowLength * Math.cos(angle + arrowAngle), 
                               shape.y2 - arrowLength * Math.sin(angle + arrowAngle));
                this.ctx.stroke();
            } else if (shape.type === 'polygon') {
                const points = shape.points.split(' ');
                this.ctx.beginPath();
                points.forEach((point, index) => {
                    const [x, y] = point.split(',').map(parseFloat);
                    if (index === 0) {
                        this.ctx.moveTo(x, y);
                    } else {
                        this.ctx.lineTo(x, y);
                    }
                });
                this.ctx.closePath();
                this.ctx.stroke();
            }
        });
    }

    togglePopup(type, button) {
        const colorPopup = document.getElementById('webext-color-popup');
        const sizePopup = document.getElementById('webext-size-popup');
        
        // Check if the popup is already open
        const isPopupOpen = (type === 'color' && colorPopup.style.display === 'block') ||
                           (type === 'size' && sizePopup.style.display === 'block');
        
        // Close all popups first
        this.closeAllPopups();
        
        // If popup was already open, don't reopen it (toggle behavior)
        if (isPopupOpen) {
            return;
        }
        
        // Add active state to the button
        button.classList.add('popup-active');
        
        // Get button position
        const buttonRect = button.getBoundingClientRect();
        const isToolbarLeft = this.uiElement.classList.contains('toolbar-left');
        
        if (type === 'color') {
            colorPopup.style.display = 'block';
            colorPopup.style.top = buttonRect.top + 'px';
            
            if (isToolbarLeft) {
                // Position popup to the right of button when toolbar is on left
                colorPopup.style.left = (buttonRect.right + 10) + 'px';
                colorPopup.style.right = 'auto';
            } else {
                // Position popup to the left of button when toolbar is on right
                colorPopup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                colorPopup.style.left = 'auto';
            }
        } else if (type === 'size') {
            sizePopup.style.display = 'block';
            sizePopup.style.top = buttonRect.top + 'px';
            
            if (isToolbarLeft) {
                // Position popup to the right of button when toolbar is on left
                sizePopup.style.left = (buttonRect.right + 10) + 'px';
                sizePopup.style.right = 'auto';
            } else {
                // Position popup to the left of button when toolbar is on right
                sizePopup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                sizePopup.style.left = 'auto';
            }
        }
    }
    
    startDragging(e) {
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        
        const rect = this.uiElement.getBoundingClientRect();
        this.toolbarInitialX = rect.left;
        this.toolbarInitialY = rect.top;
        
        // Add dragging class
        this.uiElement.classList.add('dragging');
        
        // Change cursor
        document.body.style.cursor = 'move';
        e.preventDefault();
    }
    
    drag(e) {
        if (!this.isDragging) return;
        
        const deltaX = e.clientX - this.dragStartX;
        const deltaY = e.clientY - this.dragStartY;
        
        const newX = this.toolbarInitialX + deltaX;
        const newY = this.toolbarInitialY + deltaY;
        
        // Keep toolbar within viewport bounds
        const maxX = window.innerWidth - this.uiElement.offsetWidth;
        const maxY = window.innerHeight - this.uiElement.offsetHeight;
        
        const finalX = Math.max(0, Math.min(newX, maxX));
        const finalY = Math.max(0, Math.min(newY, maxY));
        
        // Update toolbar position
        this.uiElement.style.right = 'auto';
        this.uiElement.style.left = finalX + 'px';
        this.uiElement.style.top = finalY + 'px';
        this.uiElement.style.transform = 'none';
        
        // Update toolbar side class for tooltip/popup positioning
        this.updateToolbarSideClass(finalX);
        
        // Update popup positions if they're open
        this.updatePopupPositions();
    }
    
    stopDragging() {
        if (this.isDragging) {
            this.isDragging = false;
            document.body.style.cursor = 'auto';
            // Remove dragging class
            this.uiElement.classList.remove('dragging');
            
            // Update toolbar side class one final time
            const rect = this.uiElement.getBoundingClientRect();
            this.updateToolbarSideClass(rect.left);
        }
    }
    
    updateToolbarSideClass(toolbarX) {
        // Check if toolbar is on the left half of the screen
        if (toolbarX < window.innerWidth / 2) {
            this.uiElement.classList.add('toolbar-left');
        } else {
            this.uiElement.classList.remove('toolbar-left');
        }
    }
    
    updatePopupPositions() {
        const colorPopup = document.getElementById('webext-color-popup');
        const sizePopup = document.getElementById('webext-size-popup');
        const colorBtn = document.querySelector('.webext-draw-tool-btn[data-tool="color"]');
        const sizeBtn = document.querySelector('.webext-draw-tool-btn[data-tool="size"]');
        const isToolbarLeft = this.uiElement.classList.contains('toolbar-left');
        
        if (colorPopup && colorPopup.style.display === 'block' && colorBtn) {
            const buttonRect = colorBtn.getBoundingClientRect();
            colorPopup.style.top = buttonRect.top + 'px';
            
            if (isToolbarLeft) {
                colorPopup.style.left = (buttonRect.right + 10) + 'px';
                colorPopup.style.right = 'auto';
            } else {
                colorPopup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                colorPopup.style.left = 'auto';
            }
        }
        
        if (sizePopup && sizePopup.style.display === 'block' && sizeBtn) {
            const buttonRect = sizeBtn.getBoundingClientRect();
            sizePopup.style.top = buttonRect.top + 'px';
            
            if (isToolbarLeft) {
                sizePopup.style.left = (buttonRect.right + 10) + 'px';
                sizePopup.style.right = 'auto';
            } else {
                sizePopup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                sizePopup.style.left = 'auto';
            }
        }
    }
    
    closeAllPopups() {
        const colorPopup = document.getElementById('webext-color-popup');
        const sizePopup = document.getElementById('webext-size-popup');
        colorPopup.style.display = 'none';
        sizePopup.style.display = 'none';
        // Remove active state from all tool buttons
        document.querySelectorAll('.webext-draw-tool-btn').forEach(btn => {
            btn.classList.remove('popup-active');
        });
    }


    updateCursor() {
        if (!this.isEnabled) {
            this.canvas.style.cursor = 'default';
            return;
        }
        
        switch (this.drawingMode) {
            case 'pen':
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'eraser':
                this.canvas.style.cursor = 'crosshair';
                break;
            case 'move':
                this.canvas.style.cursor = 'move';
                break;
            default:
                this.canvas.style.cursor = 'crosshair';
        }
    }
}

new WebDrawingExtension();