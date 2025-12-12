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
        this.isDragging = false; // Track toolbar dragging state
        this.justFinishedDragging = false; // Flag to prevent popup close after drag
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.toolbarInitialX = 0;
        this.toolbarInitialY = 0;
        
        // Space key panning
        this.isSpacePressed = false;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.previousDrawingMode = 'pen';
        
        // Canvas state for eraser persistence
        this.canvasImageData = null;
        
        // Resize handles
        this.isResizing = false;
        this.resizeHandle = null; // 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'
        this.resizeStartX = 0;
        this.resizeStartY = 0;
        this.originalBounds = null;
        
        // Rotation
        this.isRotating = false;
        this.rotateStartAngle = 0;
        
        // Fill color
        this.fillColor = 'transparent';
        this.fillEnabled = false;
        
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
        
        // Default: toolbar is on the right, so popup opens on the left
        // No class needed - popup will open to the left by default
        
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
        
        // Remove existing popups if present
        const existingColorPopup = document.getElementById('webext-color-popup');
        if (existingColorPopup) {
            existingColorPopup.remove();
        }
        const existingSizePopup = document.getElementById('webext-size-popup');
        if (existingSizePopup) {
            existingSizePopup.remove();
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
        const dpr = window.devicePixelRatio || 1;
        
        // Set canvas size accounting for device pixel ratio
        this.canvas.width = window.innerWidth * dpr;
        this.canvas.height = window.innerHeight * dpr;
        
        // Scale canvas CSS size to match window
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        
        // Scale context to match device pixel ratio
        this.ctx.scale(dpr, dpr);
        
        // Redraw all shapes after resize
        this.redrawAllShapes();
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
                    <!-- Drawing Tools -->
                    <button class="webext-draw-tool-btn" data-tool="pen" title="Vẽ tự do (Bút)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="text" title="Viết chữ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="4 7 4 4 20 4 20 7"/>
                            <line x1="9" y1="20" x2="15" y2="20"/>
                            <line x1="12" y1="4" x2="12" y2="20"/>
                        </svg>
                    </button>
                    <!-- Shapes (grouped) -->
                    <button class="webext-draw-tool-btn" data-tool="shapes" title="Hình dạng">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                            <circle cx="17.5" cy="17.5" r="3.5"/>
                        </svg>
                    </button>
                    <!-- Edit Tools -->
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
                    <button class="webext-draw-tool-btn" data-tool="eraser" title="Tẩy (Xóa)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 20H7l-4-4a1 1 0 0 1 0-1.414l9-9a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 0 1.414l-4 4"/>
                            <line x1="11" y1="11" x2="17" y2="17"/>
                        </svg>
                    </button>
                    <!-- Settings -->
                    <button class="webext-draw-tool-btn" data-tool="color" title="Chọn màu vẽ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 12H2"/>
                            <path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595"/>
                            <path d="m6 2 5 5"/>
                            <path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="size" title="Độ dày nét vẽ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <circle cx="12" cy="12" r="1"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="picker" title="Lấy màu từ màn hình">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"/>
                            <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z"/>
                            <path d="m2 22 .414-.414"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn webext-draw-clear-btn" data-tool="clearall" title="Xóa tất cả">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
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
            
            `;
        
        document.body.appendChild(ui);
        this.uiElement = ui;
        
        // Create popups separately and append directly to body (not inside ui)
        const colorPopup = document.createElement('div');
        colorPopup.id = 'webext-color-popup';
        colorPopup.className = 'webext-draw-popup';
        colorPopup.style.display = 'none';
        colorPopup.innerHTML = `
            <div class="webext-draw-quick-colors">
                <div class="webext-draw-quick-color webext-draw-custom-color" data-color="custom" title="Chọn màu tùy chỉnh" style="background: linear-gradient(45deg, #ff0000 0%, #00ff00 33%, #0000ff 66%, #ffff00 100%); position: relative;">
                    <input type="color" id="webext-custom-color-input" style="position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer;">
                </div>
                <div class="webext-draw-quick-color active" data-color="#000000" style="background:#000000"></div>
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
            <label class="webext-draw-checkbox-label" style="margin-top: 10px;">
                <input type="checkbox" id="webext-fill-enabled">
                <span>Tô màu bên trong</span>
            </label>
        `;
        document.body.appendChild(colorPopup);
        
        const sizePopup = document.createElement('div');
        sizePopup.id = 'webext-size-popup';
        sizePopup.className = 'webext-draw-popup';
        sizePopup.style.display = 'none';
        sizePopup.innerHTML = `
            <div class="webext-draw-size-controls">
                <input type="range" id="webext-line-width" min="1" max="50" value="3">
                <span id="webext-draw-size-value">3</span>
            </div>
        `;
        document.body.appendChild(sizePopup);
        
        const shapesPopup = document.createElement('div');
        shapesPopup.id = 'webext-shapes-popup';
        shapesPopup.className = 'webext-draw-popup';
        shapesPopup.style.display = 'none';
        shapesPopup.innerHTML = `
            <div class="webext-draw-shapes-grid">
                <button class="webext-draw-shape-btn" data-shape="line" title="Đường thẳng">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="19" x2="19" y2="5"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="arrow" title="Mũi tên">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                        <polyline points="12 5 19 12 12 19"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="rectangle" title="Hình chữ nhật">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="circle" title="Hình tròn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="triangle" title="Tam giác">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 20h20L12 2z"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="star" title="Ngôi sao">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="diamond" title="Hình thoi">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L22 12L12 22L2 12L12 2z"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="hexagon" title="Lục giác">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L21 7V17L12 22L3 17V7L12 2z"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="pentagon" title="Ngũ giác">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L22 9L18 21H6L2 9L12 2z"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="ellipse" title="Hình elip">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <ellipse cx="12" cy="12" rx="10" ry="6"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="cross" title="Dấu cộng">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="highlight" title="Highlight">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="10" width="18" height="6" rx="1" fill="currentColor" opacity="0.3"/>
                        <line x1="3" y1="13" x2="21" y2="13"/>
                    </svg>
                </button>
            </div>
        `;
        document.body.appendChild(shapesPopup);
        
        
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
                } else if (tool === 'shapes') {
                    this.togglePopup('shapes', button);
                    return;
                }
                
                // Handle picker tool - open EyeDropper immediately
                if (tool === 'picker') {
                    this.pickColorImmediate();
                    return;
                }
                
                // Handle clear all tool
                if (tool === 'clearall') {
                    this.clearCanvas();
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
                    // Update active state for colors
                    quickColors.forEach(c => c.classList.remove('active'));
                    e.target.classList.add('active');
                }
            });
        });
        
        customColorInput.addEventListener('change', (e) => {
            this.currentColor = e.target.value;
            // Remove active from all quick colors when custom color is selected
            quickColors.forEach(c => c.classList.remove('active'));
        });
        
        lineWidthSlider.addEventListener('input', (e) => {
            this.lineWidth = e.target.value;
            sizeValue.textContent = e.target.value;
        });
        
        // Shape buttons in popup
        const shapeButtons = document.querySelectorAll('.webext-draw-shape-btn');
        shapeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const shape = e.currentTarget.dataset.shape;
                this.drawingMode = shape;
                this.updateCursor();
                
                // Update active state
                shapeButtons.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                // Update main shapes button to show active
                const shapesBtn = document.querySelector('.webext-draw-tool-btn[data-tool="shapes"]');
                toolButtons.forEach(b => b.classList.remove('active'));
                shapesBtn.classList.add('active');
                
                this.closeAllPopups();
            });
        });
        
        // Fill color checkbox (in color popup)
        const fillEnabledCheckbox = document.getElementById('webext-fill-enabled');
        fillEnabledCheckbox.addEventListener('change', (e) => {
            this.fillEnabled = e.target.checked;
            // When fill is enabled, use current stroke color as fill color
            if (this.fillEnabled) {
                this.fillColor = this.currentColor;
            }
        });
        
        // Close popups when clicking outside (except drag handle and during/after dragging)
        document.addEventListener('click', (e) => {
            // Don't close popups when clicking on drag handle or just finished dragging
            if (e.target.closest('.webext-drag-handle') || this.justFinishedDragging || this.isDragging) {
                return;
            }
            
            if (!e.target.closest('.webext-draw-tool-btn[data-tool="color"]') && 
                !e.target.closest('#webext-color-popup')) {
                colorPopup.style.display = 'none';
                document.querySelector('.webext-draw-tool-btn[data-tool="color"]')?.classList.remove('popup-active');
            }
            if (!e.target.closest('.webext-draw-tool-btn[data-tool="size"]') && 
                !e.target.closest('#webext-size-popup')) {
                sizePopup.style.display = 'none';
                document.querySelector('.webext-draw-tool-btn[data-tool="size"]')?.classList.remove('popup-active');
            }
            const shapesPopupEl = document.getElementById('webext-shapes-popup');
            if (!e.target.closest('.webext-draw-tool-btn[data-tool="shapes"]') && 
                !e.target.closest('#webext-shapes-popup')) {
                shapesPopupEl.style.display = 'none';
                document.querySelector('.webext-draw-tool-btn[data-tool="shapes"]')?.classList.remove('popup-active');
            }
        });

        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => {
            this.draw(e);
            this.updateResizeCursor(e);
        });
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Block space key scrolling globally when extension is enabled
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.isEnabled) {
                e.preventDefault();
            }
        }, { passive: false });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.disableDrawing();
                this.closeAllPopups();
            } else if (e.code === 'Space' && !this.isSpacePressed && this.isEnabled) {
                e.preventDefault();
                e.stopPropagation();
                this.isSpacePressed = true;
                this.previousDrawingMode = this.drawingMode;
                this.drawingMode = 'move';
                this.canvas.style.cursor = 'grab';
                return false;
            }
        }, { capture: true });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.isSpacePressed) {
                e.preventDefault();
                e.stopPropagation();
                this.isSpacePressed = false;
                this.drawingMode = this.previousDrawingMode;
                this.updateCursor();
                // Reset move state
                this.selectedShape = null;
                this.originalShape = null;
                return false;
            }
        }, { capture: true });
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
            // Check if clicking on resize/rotate handle of already selected shape
            if (this.selectedShape) {
                const bounds = this.getShapeBounds(this.selectedShape);
                const handle = this.getHandleAtPoint(e.clientX, e.clientY, bounds);
                if (handle) {
                    if (handle === 'rotate') {
                        this.isRotating = true;
                        this.resizeHandle = handle;
                        const centerX = bounds.x + bounds.width / 2;
                        const centerY = bounds.y + bounds.height / 2;
                        this.rotateStartAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
                        this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));
                        this.originalBounds = { ...bounds };
                        this.canvas.style.cursor = 'grabbing';
                    } else {
                        this.isResizing = true;
                        this.resizeHandle = handle;
                        this.resizeStartX = e.clientX;
                        this.resizeStartY = e.clientY;
                        this.originalBounds = { ...bounds };
                        this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));
                    }
                    return;
                }
            }
            
            // Select shape or deselect if clicking empty area
            const clickedShape = this.getShapeAtPoint(e.clientX, e.clientY);
            if (clickedShape) {
                this.selectedShape = clickedShape;
                this.moveStartX = e.clientX;
                this.moveStartY = e.clientY;
                this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));
                this.canvas.style.cursor = 'grabbing';
                this.redrawAllShapes();
            } else {
                // Deselect if clicking empty area
                this.selectedShape = null;
                this.redrawAllShapes();
                this.isDrawing = false;
            }
        } else if (this.drawingMode === 'picker') {
            this.pickColor(e.clientX, e.clientY);
        } else if (this.drawingMode === 'text') {
            this.showTextInput(e.clientX, e.clientY);
            this.isDrawing = false;
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
            // Apply eraser to canvas only - don't modify shapes array
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(e.clientX, e.clientY);
            this.ctx.lineWidth = this.lineWidth * 3; // Make eraser bigger
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.stroke();
            this.ctx.globalCompositeOperation = 'source-over';

            this.lastX = e.clientX;
            this.lastY = e.clientY;
        } else if (this.drawingMode === 'move') {
            // Handle rotating
            if (this.isRotating && this.selectedShape && this.originalShape) {
                this.rotateShape(e.clientX, e.clientY);
                this.redrawAllShapes();
                return;
            }
            
            // Handle resizing
            if (this.isResizing && this.selectedShape && this.originalShape) {
                this.resizeShape(e.clientX, e.clientY);
                this.redrawAllShapes();
                return;
            }
            
            if (this.selectedShape && this.originalShape) {
                // Move individual shape
                const deltaX = e.clientX - this.moveStartX;
                const deltaY = e.clientY - this.moveStartY;
                
                if (this.selectedShape.type === 'path') {
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
                } else if (this.selectedShape.type === 'polygon' || this.selectedShape.type === 'rotatedHighlight') {
                    const points = this.originalShape.points.split(' ');
                    const newPoints = points.map(point => {
                        const [x, y] = point.split(',').map(Number);
                        return `${x + deltaX},${y + deltaY}`;
                    });
                    this.selectedShape.points = newPoints.join(' ');
                } else if (this.selectedShape.type === 'highlight') {
                    this.selectedShape.x = this.originalShape.x + deltaX;
                    this.selectedShape.y = this.originalShape.y + deltaY;
                } else if (this.selectedShape.type === 'ellipse') {
                    this.selectedShape.cx = this.originalShape.cx + deltaX;
                    this.selectedShape.cy = this.originalShape.cy + deltaY;
                } else if (this.selectedShape.type === 'cross') {
                    this.selectedShape.cx = this.originalShape.cx + deltaX;
                    this.selectedShape.cy = this.originalShape.cy + deltaY;
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
                shape.setAttribute('fill', this.fillEnabled ? this.fillColor : 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                break;

            case 'circle':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                const radius = Math.sqrt(Math.pow(currentX - this.shapeStartX, 2) + Math.pow(currentY - this.shapeStartY, 2));
                shape.setAttribute('cx', this.shapeStartX);
                shape.setAttribute('cy', this.shapeStartY);
                shape.setAttribute('r', radius);
                shape.setAttribute('fill', this.fillEnabled ? this.fillColor : 'none');
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
                shape.setAttribute('fill', this.fillEnabled ? this.fillColor : 'none');
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
                shape.setAttribute('fill', this.fillEnabled ? this.fillColor : 'none');
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

            case 'highlight':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                const hlWidth = Math.abs(currentX - this.shapeStartX);
                const hlHeight = Math.abs(currentY - this.shapeStartY);
                const hlX = Math.min(currentX, this.shapeStartX);
                const hlY = Math.min(currentY, this.shapeStartY);
                shape.setAttribute('x', hlX);
                shape.setAttribute('y', hlY);
                shape.setAttribute('width', hlWidth);
                shape.setAttribute('height', hlHeight);
                shape.setAttribute('fill', strokeColor);
                shape.setAttribute('fill-opacity', '0.3');
                shape.setAttribute('stroke', 'none');
                break;

            case 'diamond':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const dCenterX = (this.shapeStartX + currentX) / 2;
                const dCenterY = (this.shapeStartY + currentY) / 2;
                const dWidth = Math.abs(currentX - this.shapeStartX) / 2;
                const dHeight = Math.abs(currentY - this.shapeStartY) / 2;
                const diamondPoints = [
                    `${dCenterX},${dCenterY - dHeight}`,
                    `${dCenterX + dWidth},${dCenterY}`,
                    `${dCenterX},${dCenterY + dHeight}`,
                    `${dCenterX - dWidth},${dCenterY}`
                ];
                shape.setAttribute('points', diamondPoints.join(' '));
                shape.setAttribute('fill', this.fillEnabled ? this.fillColor : 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                break;

            case 'hexagon':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const hCenterX = (this.shapeStartX + currentX) / 2;
                const hCenterY = (this.shapeStartY + currentY) / 2;
                const hRadius = Math.sqrt(Math.pow(currentX - this.shapeStartX, 2) + Math.pow(currentY - this.shapeStartY, 2)) / 2;
                const hexPoints = [];
                for (let i = 0; i < 6; i++) {
                    const hAngle = (Math.PI / 3) * i - Math.PI / 2;
                    hexPoints.push(`${hCenterX + hRadius * Math.cos(hAngle)},${hCenterY + hRadius * Math.sin(hAngle)}`);
                }
                shape.setAttribute('points', hexPoints.join(' '));
                shape.setAttribute('fill', this.fillEnabled ? this.fillColor : 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                break;

            case 'pentagon':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                const pCenterX = (this.shapeStartX + currentX) / 2;
                const pCenterY = (this.shapeStartY + currentY) / 2;
                const pRadius = Math.sqrt(Math.pow(currentX - this.shapeStartX, 2) + Math.pow(currentY - this.shapeStartY, 2)) / 2;
                const pentPoints = [];
                for (let i = 0; i < 5; i++) {
                    const pAngle = (Math.PI * 2 / 5) * i - Math.PI / 2;
                    pentPoints.push(`${pCenterX + pRadius * Math.cos(pAngle)},${pCenterY + pRadius * Math.sin(pAngle)}`);
                }
                shape.setAttribute('points', pentPoints.join(' '));
                shape.setAttribute('fill', this.fillEnabled ? this.fillColor : 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                break;

            case 'ellipse':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
                const eCenterX = (this.shapeStartX + currentX) / 2;
                const eCenterY = (this.shapeStartY + currentY) / 2;
                const eRadiusX = Math.abs(currentX - this.shapeStartX) / 2;
                const eRadiusY = Math.abs(currentY - this.shapeStartY) / 2;
                shape.setAttribute('cx', eCenterX);
                shape.setAttribute('cy', eCenterY);
                shape.setAttribute('rx', eRadiusX);
                shape.setAttribute('ry', eRadiusY);
                shape.setAttribute('fill', this.fillEnabled ? this.fillColor : 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                break;

            case 'cross':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                const crCenterX = (this.shapeStartX + currentX) / 2;
                const crCenterY = (this.shapeStartY + currentY) / 2;
                const crWidth = Math.abs(currentX - this.shapeStartX) / 2;
                const crHeight = Math.abs(currentY - this.shapeStartY) / 2;
                
                const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                vLine.setAttribute('x1', crCenterX);
                vLine.setAttribute('y1', crCenterY - crHeight);
                vLine.setAttribute('x2', crCenterX);
                vLine.setAttribute('y2', crCenterY + crHeight);
                vLine.setAttribute('stroke', strokeColor);
                vLine.setAttribute('stroke-width', strokeWidth);
                vLine.setAttribute('stroke-linecap', 'round');
                shape.appendChild(vLine);
                
                const hLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                hLine.setAttribute('x1', crCenterX - crWidth);
                hLine.setAttribute('y1', crCenterY);
                hLine.setAttribute('x2', crCenterX + crWidth);
                hLine.setAttribute('y2', crCenterY);
                hLine.setAttribute('stroke', strokeColor);
                hLine.setAttribute('stroke-width', strokeWidth);
                hLine.setAttribute('stroke-linecap', 'round');
                shape.appendChild(hLine);
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
        
        // Handle move mode - reset cursor
        if (this.drawingMode === 'move') {
            if (this.isSpacePressed) {
                this.canvas.style.cursor = 'grab';
            } else {
                this.updateCursor();
            }
            // Keep shape selected after move/resize for further editing
            if (this.selectedShape) {
                this.redrawAllShapes();
            }
        }
        
        // Reset resize and rotation state
        this.isResizing = false;
        this.isRotating = false;
        this.resizeHandle = null;
        this.originalBounds = null;
        
        this.isDrawing = false;
        // Don't deselect shape in move mode - keep it selected
        if (this.drawingMode !== 'move') {
            this.selectedShape = null;
        }
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

    async pickColorImmediate() {
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
            } else {
                this.showColorNotification('Trình duyệt không hỗ trợ EyeDropper API');
            }
        } catch (error) {
            // User cancelled or error
            if (error.name !== 'AbortError') {
                console.error('Color picker error:', error);
            }
        }
    }

    async pickColor(x, y) {
        // Redirect to immediate picker
        await this.pickColorImmediate();
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

    addTextToCanvas(x, y, text) {
        const fontSize = 16;
        const fontFamily = 'Nunito, Arial, sans-serif';
        const fontWeight = '700';
        const fontString = `${fontWeight} ${fontSize}px ${fontFamily}`;
        
        this.ctx.font = fontString;
        this.ctx.fillStyle = this.currentColor;
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(text, x, y);
        this.ctx.textBaseline = 'alphabetic';
        
        // Save text shape
        this.shapes.push({
            type: 'text',
            text: text,
            x: x,
            y: y,
            color: this.currentColor,
            fontSize: fontSize,
            fontFamily: fontFamily,
            fontWeight: fontWeight
        });
    }

    showTextInput(x, y) {
        // Temporarily disable canvas pointer events
        this.canvas.style.pointerEvents = 'none';
        
        const fontSize = 16;
        const fontFamily = 'Nunito, Arial, sans-serif';
        const fontWeight = '700';
        
        const inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.id = 'webext-text-input';
        inputElement.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            font-size: ${fontSize}px;
            font-family: ${fontFamily};
            font-weight: ${fontWeight};
            color: ${this.currentColor};
            background: transparent;
            border: none;
            border-bottom: 2px dashed ${this.currentColor};
            outline: none;
            z-index: 1000010;
            padding: 0;
            margin: 0;
            width: 50px;
            height: ${fontSize + 4}px;
            line-height: ${fontSize}px;
            caret-color: ${this.currentColor};
        `;
        
        // Auto-expand input as user types
        inputElement.addEventListener('input', () => {
            inputElement.style.width = Math.max(50, inputElement.scrollWidth) + 'px';
        });
        
        document.body.appendChild(inputElement);
        
        // Use setTimeout to ensure input is ready before focusing
        setTimeout(() => {
            inputElement.focus();
        }, 10);
        
        let isFinished = false;
        const finishText = () => {
            if (isFinished) return;
            isFinished = true;
            
            const text = inputElement.value.trim();
            if (text) {
                const fontString = `${fontWeight} ${fontSize}px ${fontFamily}`;
                this.ctx.font = fontString;
                this.ctx.fillStyle = this.currentColor;
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(text, x, y);
                this.ctx.textBaseline = 'alphabetic';
                
                // Save text shape
                this.shapes.push({
                    type: 'text',
                    text: text,
                    x: x,
                    y: y,
                    color: this.currentColor,
                    fontSize: fontSize,
                    fontFamily: fontFamily,
                    fontWeight: fontWeight
                });
            }
            inputElement.remove();
            this.isDrawing = false;
            // Re-enable canvas pointer events
            this.canvas.style.pointerEvents = 'auto';
        };
        
        inputElement.addEventListener('blur', () => {
            // Delay to allow Enter key to work
            setTimeout(finishText, 100);
        });
        inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishText();
            } else if (e.key === 'Escape') {
                isFinished = true;
                inputElement.remove();
                this.canvas.style.pointerEvents = 'auto';
            }
        });
    }

    createShapeFromSVG() {
        const shape = this.svgOverlay.querySelector('rect, circle, line, g, polygon, path, ellipse');
        if (!shape) return null;
        
        const shapeData = {
            type: shape.tagName,
            color: this.currentColor,
            strokeWidth: this.lineWidth,
            fillColor: this.fillEnabled ? this.fillColor : 'none',
            fillEnabled: this.fillEnabled
        };
        
        if (shape.tagName === 'rect') {
            shapeData.x = parseFloat(shape.getAttribute('x'));
            shapeData.y = parseFloat(shape.getAttribute('y'));
            shapeData.width = parseFloat(shape.getAttribute('width'));
            shapeData.height = parseFloat(shape.getAttribute('height'));
            // Check if it's a highlight (has fill-opacity)
            if (shape.getAttribute('fill-opacity')) {
                shapeData.type = 'highlight';
                shapeData.fillOpacity = parseFloat(shape.getAttribute('fill-opacity'));
            }
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
            } else if (lines.length === 2) { // Cross
                const vLine = lines[0];
                const hLine = lines[1];
                shapeData.type = 'cross';
                shapeData.cx = parseFloat(vLine.getAttribute('x1'));
                shapeData.cy = (parseFloat(vLine.getAttribute('y1')) + parseFloat(vLine.getAttribute('y2'))) / 2;
                shapeData.width = Math.abs(parseFloat(hLine.getAttribute('x2')) - parseFloat(hLine.getAttribute('x1')));
                shapeData.height = Math.abs(parseFloat(vLine.getAttribute('y2')) - parseFloat(vLine.getAttribute('y1')));
            }
        } else if (shape.tagName === 'ellipse') {
            shapeData.type = 'ellipse';
            shapeData.cx = parseFloat(shape.getAttribute('cx'));
            shapeData.cy = parseFloat(shape.getAttribute('cy'));
            shapeData.rx = parseFloat(shape.getAttribute('rx'));
            shapeData.ry = parseFloat(shape.getAttribute('ry'));
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
                const fontFamily = shape.fontFamily || 'Nunito, Arial, sans-serif';
                const fontWeight = shape.fontWeight || '700';
                this.ctx.font = `${fontWeight} ${shape.fontSize}px ${fontFamily}`;
                const metrics = this.ctx.measureText(shape.text);
                // Text baseline is 'top', so y is the top of the text
                if (x >= shape.x && x <= shape.x + metrics.width &&
                    y >= shape.y && y <= shape.y + shape.fontSize) {
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
            } else if (shape.type === 'polygon' || shape.type === 'rotatedHighlight') {
                // Simple bounding box for polygons
                const points = shape.points.split(' ').map(p => p.split(',').map(Number));
                const minX = Math.min(...points.map(p => p[0])) - 10;
                const maxX = Math.max(...points.map(p => p[0])) + 10;
                const minY = Math.min(...points.map(p => p[1])) - 10;
                const maxY = Math.max(...points.map(p => p[1])) + 10;
                if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                    return shape;
                }
            } else if (shape.type === 'highlight') {
                // Bounding box check for highlight
                if (x >= shape.x && x <= shape.x + shape.width &&
                    y >= shape.y && y <= shape.y + shape.height) {
                    return shape;
                }
            } else if (shape.type === 'ellipse') {
                // Ellipse hit detection
                const dx = (x - shape.cx) / shape.rx;
                const dy = (y - shape.cy) / shape.ry;
                if (dx * dx + dy * dy <= 1) {
                    return shape;
                }
            } else if (shape.type === 'cross') {
                // Bounding box for cross
                const halfW = shape.width / 2;
                const halfH = shape.height / 2;
                if (x >= shape.cx - halfW && x <= shape.cx + halfW &&
                    y >= shape.cy - halfH && y <= shape.cy + halfH) {
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

    rotateShape(mouseX, mouseY) {
        const bounds = this.originalBounds;
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX);
        const deltaAngle = currentAngle - this.rotateStartAngle;
        
        const shape = this.selectedShape;
        const origShape = this.originalShape;
        
        // Helper function to rotate a point around center
        const rotatePoint = (px, py) => {
            const cos = Math.cos(deltaAngle);
            const sin = Math.sin(deltaAngle);
            const dx = px - centerX;
            const dy = py - centerY;
            return {
                x: centerX + dx * cos - dy * sin,
                y: centerY + dx * sin + dy * cos
            };
        };
        
        if (shape.type === 'rect') {
            // Convert rect to polygon for rotation
            const corners = [
                { x: origShape.x, y: origShape.y },
                { x: origShape.x + origShape.width, y: origShape.y },
                { x: origShape.x + origShape.width, y: origShape.y + origShape.height },
                { x: origShape.x, y: origShape.y + origShape.height }
            ];
            const rotatedCorners = corners.map(c => rotatePoint(c.x, c.y));
            // Convert to polygon type
            shape.type = 'polygon';
            shape.points = rotatedCorners.map(c => `${c.x},${c.y}`).join(' ');
            delete shape.x;
            delete shape.y;
            delete shape.width;
            delete shape.height;
        } else if (shape.type === 'highlight') {
            // Convert highlight to rotated polygon but keep fill
            const corners = [
                { x: origShape.x, y: origShape.y },
                { x: origShape.x + origShape.width, y: origShape.y },
                { x: origShape.x + origShape.width, y: origShape.y + origShape.height },
                { x: origShape.x, y: origShape.y + origShape.height }
            ];
            const rotatedCorners = corners.map(c => rotatePoint(c.x, c.y));
            // Convert to rotated highlight polygon
            shape.type = 'rotatedHighlight';
            shape.points = rotatedCorners.map(c => `${c.x},${c.y}`).join(' ');
            shape.fillOpacity = origShape.fillOpacity || 0.3;
            delete shape.x;
            delete shape.y;
            delete shape.width;
            delete shape.height;
        } else if (shape.type === 'circle') {
            const rotated = rotatePoint(origShape.x, origShape.y);
            shape.x = rotated.x;
            shape.y = rotated.y;
        } else if (shape.type === 'ellipse') {
            const rotated = rotatePoint(origShape.cx, origShape.cy);
            shape.cx = rotated.x;
            shape.cy = rotated.y;
        } else if (shape.type === 'line' || shape.type === 'arrow') {
            const p1 = rotatePoint(origShape.x1, origShape.y1);
            const p2 = rotatePoint(origShape.x2, origShape.y2);
            shape.x1 = p1.x;
            shape.y1 = p1.y;
            shape.x2 = p2.x;
            shape.y2 = p2.y;
        } else if (shape.type === 'polygon' || shape.type === 'rotatedHighlight') {
            const origPoints = origShape.points.split(' ').map(p => p.split(',').map(Number));
            const newPoints = origPoints.map(([px, py]) => {
                const rotated = rotatePoint(px, py);
                return `${rotated.x},${rotated.y}`;
            });
            shape.points = newPoints.join(' ');
        } else if (shape.type === 'cross') {
            const rotated = rotatePoint(origShape.cx, origShape.cy);
            shape.cx = rotated.x;
            shape.cy = rotated.y;
        } else if (shape.type === 'path') {
            shape.points = origShape.points.map(p => rotatePoint(p.x, p.y));
        } else if (shape.type === 'text') {
            const rotated = rotatePoint(origShape.x, origShape.y);
            shape.x = rotated.x;
            shape.y = rotated.y;
        }
    }

    resizeShape(mouseX, mouseY) {
        const deltaX = mouseX - this.resizeStartX;
        const deltaY = mouseY - this.resizeStartY;
        const handle = this.resizeHandle;
        const orig = this.originalBounds;
        const shape = this.selectedShape;
        const origShape = this.originalShape;
        
        let newX = orig.x;
        let newY = orig.y;
        let newWidth = orig.width;
        let newHeight = orig.height;
        
        // Calculate new bounds based on handle
        if (handle.includes('w')) {
            newX = orig.x + deltaX;
            newWidth = orig.width - deltaX;
        }
        if (handle.includes('e')) {
            newWidth = orig.width + deltaX;
        }
        if (handle.includes('n')) {
            newY = orig.y + deltaY;
            newHeight = orig.height - deltaY;
        }
        if (handle.includes('s')) {
            newHeight = orig.height + deltaY;
        }
        
        // Ensure minimum size
        if (newWidth < 10) { newWidth = 10; newX = orig.x + orig.width - 10; }
        if (newHeight < 10) { newHeight = 10; newY = orig.y + orig.height - 10; }
        
        // Apply to shape based on type
        if (shape.type === 'rect' || shape.type === 'highlight') {
            shape.x = newX;
            shape.y = newY;
            shape.width = newWidth;
            shape.height = newHeight;
        } else if (shape.type === 'circle') {
            const newRadius = Math.max(newWidth, newHeight) / 2;
            shape.radius = newRadius;
            shape.x = newX + newWidth / 2;
            shape.y = newY + newHeight / 2;
        } else if (shape.type === 'ellipse') {
            shape.rx = newWidth / 2;
            shape.ry = newHeight / 2;
            shape.cx = newX + newWidth / 2;
            shape.cy = newY + newHeight / 2;
        } else if (shape.type === 'line' || shape.type === 'arrow') {
            // Scale line endpoints
            const scaleX = newWidth / orig.width || 1;
            const scaleY = newHeight / orig.height || 1;
            shape.x1 = newX + (origShape.x1 - orig.x) * scaleX;
            shape.y1 = newY + (origShape.y1 - orig.y) * scaleY;
            shape.x2 = newX + (origShape.x2 - orig.x) * scaleX;
            shape.y2 = newY + (origShape.y2 - orig.y) * scaleY;
        } else if (shape.type === 'polygon' || shape.type === 'rotatedHighlight') {
            // Scale polygon points
            const scaleX = newWidth / orig.width || 1;
            const scaleY = newHeight / orig.height || 1;
            const origPoints = origShape.points.split(' ').map(p => p.split(',').map(Number));
            const newPoints = origPoints.map(([px, py]) => {
                const nx = newX + (px - orig.x) * scaleX;
                const ny = newY + (py - orig.y) * scaleY;
                return `${nx},${ny}`;
            });
            shape.points = newPoints.join(' ');
        } else if (shape.type === 'cross') {
            shape.width = newWidth;
            shape.height = newHeight;
            shape.cx = newX + newWidth / 2;
            shape.cy = newY + newHeight / 2;
        } else if (shape.type === 'path') {
            // Scale path points
            const scaleX = newWidth / orig.width || 1;
            const scaleY = newHeight / orig.height || 1;
            shape.points = origShape.points.map(p => ({
                x: newX + (p.x - orig.x) * scaleX,
                y: newY + (p.y - orig.y) * scaleY
            }));
        } else if (shape.type === 'text') {
            // Scale font size proportionally
            const scale = Math.max(newWidth / orig.width, newHeight / orig.height) || 1;
            shape.fontSize = Math.max(8, Math.round(origShape.fontSize * scale));
            shape.x = newX;
            shape.y = newY;
        }
    }

    getShapeBounds(shape) {
        let bounds = { x: 0, y: 0, width: 0, height: 0 };
        
        if (shape.type === 'rect' || shape.type === 'highlight') {
            bounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
        } else if (shape.type === 'circle') {
            bounds = { x: shape.x - shape.radius, y: shape.y - shape.radius, width: shape.radius * 2, height: shape.radius * 2 };
        } else if (shape.type === 'ellipse') {
            bounds = { x: shape.cx - shape.rx, y: shape.cy - shape.ry, width: shape.rx * 2, height: shape.ry * 2 };
        } else if (shape.type === 'line' || shape.type === 'arrow') {
            const minX = Math.min(shape.x1, shape.x2);
            const minY = Math.min(shape.y1, shape.y2);
            bounds = { x: minX, y: minY, width: Math.abs(shape.x2 - shape.x1), height: Math.abs(shape.y2 - shape.y1) };
        } else if (shape.type === 'polygon' || shape.type === 'rotatedHighlight') {
            const points = shape.points.split(' ').map(p => p.split(',').map(Number));
            const xs = points.map(p => p[0]);
            const ys = points.map(p => p[1]);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            bounds = { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
        } else if (shape.type === 'cross') {
            const halfW = shape.width / 2;
            const halfH = shape.height / 2;
            bounds = { x: shape.cx - halfW, y: shape.cy - halfH, width: shape.width, height: shape.height };
        } else if (shape.type === 'text') {
            const fontFamily = shape.fontFamily || 'Nunito, Arial, sans-serif';
            const fontWeight = shape.fontWeight || '700';
            this.ctx.font = `${fontWeight} ${shape.fontSize}px ${fontFamily}`;
            const metrics = this.ctx.measureText(shape.text);
            bounds = { x: shape.x, y: shape.y, width: metrics.width, height: shape.fontSize };
        } else if (shape.type === 'path') {
            const xs = shape.points.map(p => p.x);
            const ys = shape.points.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            bounds = { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
        }
        
        return bounds;
    }

    getResizeHandles(bounds) {
        const handleSize = 12;
        const hs = handleSize / 2;
        return {
            nw: { x: bounds.x - hs, y: bounds.y - hs, cursor: 'nwse-resize' },
            n: { x: bounds.x + bounds.width / 2 - hs, y: bounds.y - hs, cursor: 'ns-resize' },
            ne: { x: bounds.x + bounds.width - hs, y: bounds.y - hs, cursor: 'nesw-resize' },
            e: { x: bounds.x + bounds.width - hs, y: bounds.y + bounds.height / 2 - hs, cursor: 'ew-resize' },
            se: { x: bounds.x + bounds.width - hs, y: bounds.y + bounds.height - hs, cursor: 'nwse-resize' },
            s: { x: bounds.x + bounds.width / 2 - hs, y: bounds.y + bounds.height - hs, cursor: 'ns-resize' },
            sw: { x: bounds.x - hs, y: bounds.y + bounds.height - hs, cursor: 'nesw-resize' },
            w: { x: bounds.x - hs, y: bounds.y + bounds.height / 2 - hs, cursor: 'ew-resize' },
            rotate: { x: bounds.x + bounds.width / 2 - hs, y: bounds.y - 30 - hs, cursor: 'grab' }
        };
    }

    getHandleAtPoint(x, y, bounds) {
        const handles = this.getResizeHandles(bounds);
        const handleSize = 12;
        
        // Check rotate handle first (circle) with larger hit area
        const rotateHandle = handles.rotate;
        const rotateCenterX = rotateHandle.x + handleSize / 2;
        const rotateCenterY = rotateHandle.y + handleSize / 2;
        const distToRotate = Math.sqrt(Math.pow(x - rotateCenterX, 2) + Math.pow(y - rotateCenterY, 2));
        if (distToRotate <= handleSize) { // Larger hit area for rotate
            return 'rotate';
        }
        
        // Check resize handles (squares)
        for (const [key, handle] of Object.entries(handles)) {
            if (key === 'rotate') continue;
            if (x >= handle.x && x <= handle.x + handleSize &&
                y >= handle.y && y <= handle.y + handleSize) {
                return key;
            }
        }
        return null;
    }

    drawResizeHandles(bounds) {
        const handles = this.getResizeHandles(bounds);
        const handleSize = 12;
        
        // Draw selection border
        this.ctx.strokeStyle = '#007bff';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        this.ctx.setLineDash([]);
        
        // Draw line to rotate handle
        this.ctx.beginPath();
        this.ctx.moveTo(bounds.x + bounds.width / 2, bounds.y);
        this.ctx.lineTo(bounds.x + bounds.width / 2, bounds.y - 30);
        this.ctx.strokeStyle = '#007bff';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // Draw handles
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#007bff';
        this.ctx.lineWidth = 2;
        
        for (const [key, handle] of Object.entries(handles)) {
            if (key === 'rotate') {
                // Draw rotate handle as circle
                this.ctx.beginPath();
                this.ctx.arc(handle.x + handleSize / 2, handle.y + handleSize / 2, handleSize / 2, 0, 2 * Math.PI);
                this.ctx.fill();
                this.ctx.stroke();
            } else {
                this.ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
                this.ctx.strokeRect(handle.x, handle.y, handleSize, handleSize);
            }
        }
    }

    updateResizeCursor(e) {
        if (!this.isEnabled || this.isDrawing) return;
        if (this.drawingMode !== 'move') return;
        
        if (this.selectedShape) {
            const bounds = this.getShapeBounds(this.selectedShape);
            const handle = this.getHandleAtPoint(e.clientX, e.clientY, bounds);
            
            if (handle) {
                const handles = this.getResizeHandles(bounds);
                this.canvas.style.cursor = handles[handle].cursor;
                return;
            }
            
            // Check if over the selected shape
            if (this.getShapeAtPoint(e.clientX, e.clientY) === this.selectedShape) {
                this.canvas.style.cursor = 'move';
                return;
            }
        }
        
        // Check if hovering over any shape
        const hoverShape = this.getShapeAtPoint(e.clientX, e.clientY);
        if (hoverShape) {
            this.canvas.style.cursor = 'pointer';
        } else {
            this.canvas.style.cursor = 'default';
        }
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
                const fontFamily = shape.fontFamily || 'Nunito, Arial, sans-serif';
                const fontWeight = shape.fontWeight || '700';
                this.ctx.font = `${fontWeight} ${shape.fontSize}px ${fontFamily}`;
                this.ctx.fillStyle = shape.color;
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(shape.text, shape.x, shape.y);
                this.ctx.textBaseline = 'alphabetic';
            } else if (shape.type === 'rect') {
                if (shape.fillEnabled && shape.fillColor && shape.fillColor !== 'none') {
                    this.ctx.fillStyle = shape.fillColor;
                    this.ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
                }
                this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
            } else if (shape.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(shape.x, shape.y, shape.radius, 0, 2 * Math.PI);
                if (shape.fillEnabled && shape.fillColor && shape.fillColor !== 'none') {
                    this.ctx.fillStyle = shape.fillColor;
                    this.ctx.fill();
                }
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
                if (shape.fillEnabled && shape.fillColor && shape.fillColor !== 'none') {
                    this.ctx.fillStyle = shape.fillColor;
                    this.ctx.fill();
                }
                this.ctx.stroke();
            } else if (shape.type === 'highlight') {
                // Draw highlight (filled rectangle with opacity)
                this.ctx.fillStyle = shape.color;
                this.ctx.globalAlpha = shape.fillOpacity || 0.3;
                this.ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
                this.ctx.globalAlpha = 1;
            } else if (shape.type === 'rotatedHighlight') {
                // Draw rotated highlight (filled polygon with opacity)
                const points = shape.points.split(' ');
                this.ctx.fillStyle = shape.color;
                this.ctx.globalAlpha = shape.fillOpacity || 0.3;
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
                this.ctx.fill();
                this.ctx.globalAlpha = 1;
            } else if (shape.type === 'ellipse') {
                this.ctx.beginPath();
                this.ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
                if (shape.fillEnabled && shape.fillColor && shape.fillColor !== 'none') {
                    this.ctx.fillStyle = shape.fillColor;
                    this.ctx.fill();
                }
                this.ctx.stroke();
            } else if (shape.type === 'cross') {
                const halfW = shape.width / 2;
                const halfH = shape.height / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(shape.cx, shape.cy - halfH);
                this.ctx.lineTo(shape.cx, shape.cy + halfH);
                this.ctx.stroke();
                this.ctx.beginPath();
                this.ctx.moveTo(shape.cx - halfW, shape.cy);
                this.ctx.lineTo(shape.cx + halfW, shape.cy);
                this.ctx.stroke();
            }
        });
        
        // Draw resize handles if a shape is selected
        if (this.selectedShape && this.drawingMode === 'move') {
            const bounds = this.getShapeBounds(this.selectedShape);
            this.drawResizeHandles(bounds);
        }
    }

    togglePopup(type, button) {
        const colorPopup = document.getElementById('webext-color-popup');
        const sizePopup = document.getElementById('webext-size-popup');
        const shapesPopup = document.getElementById('webext-shapes-popup');
        
        // Check if the popup is already open
        const isPopupOpen = (type === 'color' && colorPopup.style.display === 'block') ||
                           (type === 'size' && sizePopup.style.display === 'block') ||
                           (type === 'shapes' && shapesPopup.style.display === 'block');
        
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
        
        const positionPopup = (popup) => {
            if (isToolbarLeft) {
                popup.style.left = (buttonRect.right + 10) + 'px';
                popup.style.right = 'auto';
            } else {
                popup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                popup.style.left = 'auto';
            }
            popup.style.top = buttonRect.top + 'px';
            popup.style.bottom = 'auto';
            popup.style.transform = 'none';
            popup.style.display = 'block';
        };
        
        if (type === 'color') {
            positionPopup(colorPopup);
        } else if (type === 'size') {
            positionPopup(sizePopup);
        } else if (type === 'shapes') {
            positionPopup(shapesPopup);
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
            this.justFinishedDragging = true;
            document.body.style.cursor = 'auto';
            // Remove dragging class
            this.uiElement.classList.remove('dragging');
            
            // Update toolbar side class one final time
            const rect = this.uiElement.getBoundingClientRect();
            this.updateToolbarSideClass(rect.left);
            
            // Reset flag after a short delay to prevent click from closing popup
            setTimeout(() => {
                this.justFinishedDragging = false;
            }, 100);
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
            
            if (isToolbarLeft) {
                colorPopup.style.left = (buttonRect.right + 10) + 'px';
                colorPopup.style.right = 'auto';
            } else {
                colorPopup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                colorPopup.style.left = 'auto';
            }
            colorPopup.style.top = buttonRect.top + 'px';
            colorPopup.style.bottom = 'auto';
            colorPopup.style.transform = 'none';
        }
        
        if (sizePopup && sizePopup.style.display === 'block' && sizeBtn) {
            const buttonRect = sizeBtn.getBoundingClientRect();
            
            if (isToolbarLeft) {
                sizePopup.style.left = (buttonRect.right + 10) + 'px';
                sizePopup.style.right = 'auto';
            } else {
                sizePopup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                sizePopup.style.left = 'auto';
            }
            sizePopup.style.top = buttonRect.top + 'px';
            sizePopup.style.bottom = 'auto';
            sizePopup.style.transform = 'none';
        }
    }
    
    closeAllPopups() {
        const colorPopup = document.getElementById('webext-color-popup');
        const sizePopup = document.getElementById('webext-size-popup');
        const shapesPopup = document.getElementById('webext-shapes-popup');
        colorPopup.style.display = 'none';
        sizePopup.style.display = 'none';
        shapesPopup.style.display = 'none';
        // Reset transform to ensure clean state when reopened
        colorPopup.style.transform = '';
        sizePopup.style.transform = '';
        shapesPopup.style.transform = '';
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
            case 'text':
                this.canvas.style.cursor = 'text';
                break;
            default:
                this.canvas.style.cursor = 'crosshair';
        }
    }
}

new WebDrawingExtension();