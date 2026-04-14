class WebDrawingExtension {
    constructor() {
        this.isDrawing = false;
        this.isEnabled = false;

        // Load settings from localStorage
        this.settings = this.loadSettings();
        this.currentColor = this.settings.defaultColor;
        this.fillColor = 'transparent';
        this.fillEnabled = false;

        this.lineWidth = this.settings.defaultStrokeWidth;
        this.strokeOpacity = this.settings.defaultOpacity;
        this.canvas = null;
        this.ctx = null;
        this.svgOverlay = null;
        this.lastX = 0;
        this.lastY = 0;
        this.isInitialized = false;
        this.drawingMode = 'cursor'; // cursor, pen, rectangle, circle, arrow, line, triangle, star, move, eraser, picker
        this.shapeStartX = 0;
        this.shapeStartY = 0;
        this.uiElement = null;
        this.isToolbarVisible = false;
        this.pinState = localStorage.getItem('webext-draw-pinned') || 'none'; // 'none', 'right'
        this.drawingsVisible = true;
        this.stepCounter = 1;
        this.shapes = []; // Store all shapes for movement
        this.selectedShape = null; // Currently selected shape for moving
        this.selectedShapes = []; // Multiple selected shapes
        this.isMarqueeSelecting = false; // Marquee selection state
        this.marqueeStart = null; // Marquee start point
        this.moveOffsetX = 0;
        this.moveOffsetY = 0;
        this.originalShape = null; // Store original shape position for delta calculation
        this.currentPath = []; // Store current pen drawing path
        this.freePolygonPoints = []; // Store free polygon points
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

        // Undo/Redo history
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = 50;

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
        // Reset page margins from pinning
        document.documentElement.style.marginRight = '';
        document.documentElement.style.marginLeft = '';
        this.removeAllBlurDivs();
        this.hideContextToolbar();
        this.hideToolbar();
        this.cleanupExistingElements();
        this.isInitialized = false;
    }

    showToolbar() {
        this.uiElement.style.display = 'block';
        this.isToolbarVisible = true;
    }

    hideToolbar() {
        this.uiElement.style.display = 'none';
        this.isToolbarVisible = false;
    }

    togglePin(side) {
        this.pinState = (this.pinState === side) ? 'none' : side;
        localStorage.setItem('webext-draw-pinned', this.pinState);
        this.applyPinState();
    }

    togglePinPopover(button) {
        const existing = document.getElementById('webext-pin-popover');
        if (existing) { existing.remove(); return; }

        const pop = document.createElement('div');
        pop.id = 'webext-pin-popover';
        pop.style.cssText = `
            position: fixed; z-index: 2147483647;
            background: white; border-radius: 12px; padding: 6px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 1px solid #e8eaf0;
            display: flex; flex-direction: column; gap: 2px; min-width: 120px;
            font-family: -apple-system, sans-serif;
        `;

        const options = [];
        if (this.pinState !== 'left') options.push({ label: this.settings.lang === 'en' ? 'Pin Left' : 'Ghim trái', value: 'left', icon: '←' });
        if (this.pinState !== 'right') options.push({ label: this.settings.lang === 'en' ? 'Pin Right' : 'Ghim phải', value: 'right', icon: '→' });
        if (this.pinState !== 'none') options.push({ label: this.settings.lang === 'en' ? 'Float' : 'Nổi', value: 'none', icon: '↕' });

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = `${opt.icon}  ${opt.label}`;
            btn.style.cssText = `
                display: flex; align-items: center; gap: 8px; width: 100%;
                padding: 8px 12px; border: none; background: none; border-radius: 8px;
                font-size: 13px; font-weight: 500; color: #333; cursor: pointer;
                text-align: left; transition: background 0.15s;
            `;
            btn.addEventListener('mouseenter', () => btn.style.background = '#f0f1ff');
            btn.addEventListener('mouseleave', () => btn.style.background = 'none');
            btn.addEventListener('click', () => {
                pop.remove();
                this.togglePin(opt.value === 'none' ? this.pinState : opt.value);
                if (opt.value === 'none') {
                    this.pinState = 'none';
                    localStorage.setItem('webext-draw-pinned', 'none');
                    this.applyPinState();
                }
            });
            pop.appendChild(btn);
        });

        // Position
        const rect = button.getBoundingClientRect();
        if (this.pinState === 'left') {
            pop.style.left = (rect.right + 8) + 'px';
            pop.style.top = rect.top + 'px';
        } else if (this.pinState === 'right') {
            pop.style.right = (window.innerWidth - rect.left + 8) + 'px';
            pop.style.top = rect.top + 'px';
        } else {
            let left = rect.left + rect.width / 2 - 60;
            left = Math.max(10, Math.min(left, window.innerWidth - 140));
            pop.style.left = left + 'px';
            pop.style.top = (rect.top - options.length * 40 - 16) + 'px';
        }

        document.body.appendChild(pop);

        // Close on click outside
        const closeHandler = (e) => {
            if (!pop.contains(e.target) && e.target !== button) {
                pop.remove();
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
    }

    cyclePin() {
        // Cycle: none → left → right → none
        if (this.pinState === 'none') this.pinState = 'left';
        else if (this.pinState === 'left') this.pinState = 'right';
        else this.pinState = 'none';
        localStorage.setItem('webext-draw-pinned', this.pinState);
        this.applyPinState();
        // Update tooltip
        const btn = document.querySelector('[data-tool="pin-cycle"]');
        if (btn) {
            const labels = { none: 'Ghim trái', left: 'Ghim phải', right: 'Bỏ ghim' };
            btn.title = labels[this.pinState] || 'Ghim thanh công cụ';
        }
    }

    applyPinState() {
        const pinBtns = document.querySelectorAll('.webext-draw-pin-btn');
        if (!pinBtns.length) return;

        // Reset
        this.uiElement.classList.remove('pinned', 'pinned-left');
        pinBtns.forEach(b => b.classList.remove('active'));
        document.documentElement.style.marginRight = '';
        document.documentElement.style.marginLeft = '';

        const pinBtn = document.querySelector('[data-tool="pin-cycle"]');
        if (this.pinState === 'right') {
            this.uiElement.classList.add('pinned');
            pinBtn?.classList.add('active');
            document.documentElement.style.marginRight = '50px';
        } else if (this.pinState === 'left') {
            this.uiElement.classList.add('pinned-left');
            pinBtn?.classList.add('active');
            document.documentElement.style.marginLeft = '50px';
        }
    }

    init() {
        this.cleanupExistingElements();
        this.createCanvas();
        this.createSVGOverlay();
        this.createUI();
        this.setupEventListeners();
        this.updateOpacityTrack();
        this.applySettings();
        this.isInitialized = true;
        this.showToolbar();
        this.enableDrawing();
        // Set default drawing mode
        const defaultMode = this.settings.autoCursor ? 'cursor' : 'pen';
        this.drawingMode = defaultMode;
        document.querySelectorAll('.webext-draw-tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`[data-tool="${defaultMode}"]`)?.classList.add('active');
        this.updateCursor();

        // Toolbar is on the right, so remove toolbar-left class for popup positioning
        this.uiElement.classList.remove('toolbar-left');
        
        // Restore saved color selection
        this.restoreSavedColors();
    }
    
    restoreSavedColors() {
        // Highlight the saved color in quick colors if it exists
        const quickColors = document.querySelectorAll('.webext-draw-quick-color');
        quickColors.forEach(colorEl => {
            if (colorEl.dataset.color.toLowerCase() === this.currentColor.toLowerCase()) {
                colorEl.classList.add('active');
            }
        });
        
        // Update color picker to match saved color
        if (this.currentColor) {
            this.updateColorPickerFromColor(this.currentColor);
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
                <div class="webext-drag-handle" title="Kéo để di chuyển">
                    <div class="webext-drag-dots">
                        <span></span><span></span>
                        <span></span><span></span>
                        <span></span><span></span>
                    </div>
                </div>
                <div class="webext-draw-toolbar-content">
                    <!-- Select & Draw -->
                    <button class="webext-draw-tool-btn" data-tool="cursor" title="Con trỏ chuột">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 3l14 8-7 2-3 7z"/>
                            <path d="M12 13l5 5"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="pen" title="Bút vẽ">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="text" title="Chữ">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polyline points="4 7 4 4 20 4 20 7"/>
                            <line x1="9" y1="20" x2="15" y2="20"/>
                            <line x1="12" y1="4" x2="12" y2="20"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="shapes" title="Hình dạng">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                            <circle cx="17.5" cy="17.5" r="3.5"/>
                        </svg>
                    </button>
                    <!-- Edit -->
                    <button class="webext-draw-tool-btn" data-tool="move" title="Di chuyển">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polyline points="5 9 2 12 5 15"/>
                            <polyline points="9 5 12 2 15 5"/>
                            <polyline points="15 19 12 22 9 19"/>
                            <polyline points="19 9 22 12 19 15"/>
                            <line x1="2" y1="12" x2="22" y2="12"/>
                            <line x1="12" y1="2" x2="12" y2="22"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="eraser" title="Tẩy">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M20 20H7l-4-4a1 1 0 0 1 0-1.414l9-9a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 0 1.414l-4 4"/>
                            <line x1="11" y1="11" x2="17" y2="17"/>
                        </svg>
                    </button>
                    <!-- Style -->
                    <button class="webext-draw-tool-btn" data-tool="color" title="Màu sắc">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 12H2"/>
                            <path d="M21.145 18.38A3.34 3.34 0 0 1 20 16.5a3.3 3.3 0 0 1-1.145 1.88c-.575.46-.855 1.02-.855 1.595A2 2 0 0 0 20 22a2 2 0 0 0 2-2.025c0-.58-.285-1.13-.855-1.595"/>
                            <path d="m6 2 5 5"/>
                            <path d="m8.5 4.5 2.148-2.148a1.205 1.205 0 0 1 1.704 0l7.296 7.296a1.205 1.205 0 0 1 0 1.704l-7.592 7.592a3.615 3.615 0 0 1-5.112 0l-3.888-3.888a3.615 3.615 0 0 1 0-5.112L5.67 7.33"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="picker" title="Lấy màu">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"/>
                            <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z"/>
                            <path d="m2 22 .414-.414"/>
                        </svg>
                    </button>
                    <!-- Actions -->
                    <button class="webext-draw-tool-btn webext-draw-clear-btn" data-tool="clearall" title="Xóa tất cả">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="screenshot" title="Chụp màn hình">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                            <circle cx="12" cy="13" r="4"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="ruler" title="Thước đo">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 4h20v16H2z"/>
                            <line x1="6" y1="4" x2="6" y2="8"/>
                            <line x1="10" y1="4" x2="10" y2="10"/>
                            <line x1="14" y1="4" x2="14" y2="8"/>
                            <line x1="18" y1="4" x2="18" y2="10"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="stepmarker" title="Đánh số bước">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <text x="12" y="16" text-anchor="middle" fill="currentColor" stroke="none" font-size="12" font-weight="bold">1</text>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="blur" title="Làm mờ vùng">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <line x1="8" y1="8" x2="8" y2="8.01"/>
                            <line x1="12" y1="8" x2="12" y2="8.01"/>
                            <line x1="16" y1="8" x2="16" y2="8.01"/>
                            <line x1="8" y1="12" x2="8" y2="12.01"/>
                            <line x1="12" y1="12" x2="12" y2="12.01"/>
                            <line x1="16" y1="12" x2="16" y2="12.01"/>
                            <line x1="8" y1="16" x2="8" y2="16.01"/>
                            <line x1="12" y1="16" x2="12" y2="16.01"/>
                            <line x1="16" y1="16" x2="16" y2="16.01"/>
                        </svg>
                    </button>
                    <button class="webext-draw-tool-btn" data-tool="spotlight" title="Spotlight">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="1" y="1" width="22" height="22" rx="2" fill="currentColor" opacity="0.15"/>
                            <circle cx="12" cy="12" r="5" fill="white" stroke="currentColor"/>
                        </svg>
                    </button>
                </div>
                <button class="webext-draw-tool-btn webext-draw-action-btn" data-tool="undo" title="Hoàn tác (Ctrl+Z)" data-disabled="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="1 4 1 10 7 10"/>
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                    </svg>
                </button>
                <button class="webext-draw-tool-btn webext-draw-action-btn" data-tool="redo" title="Làm lại (Ctrl+Shift+Z)" data-disabled="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>
                    </svg>
                </button>
                <button class="webext-draw-tool-btn" data-tool="toggle-visibility" title="Ẩn/hiện nét vẽ">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
                <button class="webext-draw-tool-btn webext-draw-pin-btn" data-tool="pin-cycle" title="Ghim thanh công cụ">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 17v5"/>
                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                    </svg>
                </button>
                <button class="webext-draw-tool-btn" data-tool="settings" title="Cài đặt">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                </button>
                <button class="webext-draw-close-btn" title="Đóng">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
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
            <div class="webext-color-popup-layout">
                <div class="webext-color-picker-container">
                    <div class="webext-color-picker-saturation" id="webext-saturation-panel">
                        <div class="webext-color-picker-saturation-white"></div>
                        <div class="webext-color-picker-saturation-black"></div>
                        <div class="webext-color-picker-cursor" id="webext-saturation-cursor"></div>
                    </div>
                    <div class="webext-color-picker-hue" id="webext-hue-slider">
                        <div class="webext-color-picker-hue-cursor" id="webext-hue-cursor"></div>
                    </div>
                </div>
                <div class="webext-draw-quick-colors">
                    <div class="webext-draw-quick-color" data-color="#000000" style="background:#000000"></div>
                    <div class="webext-draw-quick-color" data-color="#ffffff" style="background:#ffffff"></div>
                    <div class="webext-draw-quick-color" data-color="#808080" style="background:#808080"></div>
                    <div class="webext-draw-quick-color active" data-color="#ff0000" style="background:#ff0000"></div>
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
            <div class="webext-draw-color-bottom">
                <div class="webext-draw-color-hex-row">
                    <div class="webext-draw-color-preview" id="webext-color-preview"></div>
                    <input type="text" class="webext-draw-hex-input" id="webext-hex-input" value="#FF0000" maxlength="7" spellcheck="false">
                </div>
                <label class="webext-draw-switch-label">
                    <input type="checkbox" id="webext-fill-enabled">
                    <span class="webext-draw-switch"></span>
                    <span>Tô màu nền</span>
                </label>
            </div>
            <div class="webext-draw-sliders-row">
                <div class="webext-draw-slider-inline">
                    <span class="webext-draw-slider-inline-label">Độ mờ</span>
                    <div class="webext-draw-slider-track webext-draw-opacity-track">
                        <input type="range" id="webext-stroke-opacity" min="1" max="100" value="100">
                    </div>
                    <span class="webext-draw-slider-inline-value" id="webext-draw-opacity-value">100%</span>
                </div>
                <div class="webext-draw-slider-inline">
                    <span class="webext-draw-slider-inline-label">Nét</span>
                    <div class="webext-draw-slider-track webext-draw-size-track">
                        <input type="range" id="webext-line-width" min="1" max="50" value="4">
                    </div>
                    <span class="webext-draw-slider-inline-value" id="webext-draw-size-value">4</span>
                </div>
            </div>
        `;
        document.body.appendChild(colorPopup);

        const shapesPopup = document.createElement('div');
        shapesPopup.id = 'webext-shapes-popup';
        shapesPopup.className = 'webext-draw-popup';
        shapesPopup.style.display = 'none';
        shapesPopup.innerHTML = `
            <div class="webext-draw-shapes-grid">
                <button class="webext-draw-shape-btn" data-shape="line" title="Đường thẳng">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <line x1="5" y1="19" x2="19" y2="5"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="arrow" title="Mũi tên">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                        <polyline points="12 5 19 12 12 19"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="rectangle" title="Hình chữ nhật">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="circle" title="Hình tròn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="triangle" title="Tam giác">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 2L2 20h20L12 2z"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="star" title="Ngôi sao">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="diamond" title="Hình thoi">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 2L22 12L12 22L2 12L12 2z"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="hexagon" title="Lục giác">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 2L21 7V17L12 22L3 17V7L12 2z"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="pentagon" title="Ngũ giác">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 2L22 9L18 21H6L2 9L12 2z"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="ellipse" title="Elip">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <ellipse cx="12" cy="12" rx="10" ry="6"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="cross" title="Dấu cộng">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="highlight" title="Highlight">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="10" width="18" height="6" rx="1" fill="currentColor" opacity="0.3"/>
                        <line x1="3" y1="13" x2="21" y2="13"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="curve" title="Đường cong">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M4 20 Q12 4 20 20" stroke-linecap="round"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="bezier" title="Bezier">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M4 18 C4 6 20 6 20 18" stroke-linecap="round"/>
                        <circle cx="4" cy="18" r="2" fill="currentColor"/>
                        <circle cx="20" cy="18" r="2" fill="currentColor"/>
                    </svg>
                </button>
                <button class="webext-draw-shape-btn" data-shape="freepolygon" title="Đa giác tự do">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M4 18 L8 6 L16 4 L20 14 L14 20 Z" stroke-linejoin="round"/>
                        <circle cx="4" cy="18" r="1.5" fill="currentColor"/>
                        <circle cx="8" cy="6" r="1.5" fill="currentColor"/>
                        <circle cx="16" cy="4" r="1.5" fill="currentColor"/>
                        <circle cx="20" cy="14" r="1.5" fill="currentColor"/>
                        <circle cx="14" cy="20" r="1.5" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        `;
        document.body.appendChild(shapesPopup);

        // Create screenshot popup
        const screenshotPopup = document.createElement('div');
        screenshotPopup.id = 'webext-screenshot-popup';
        screenshotPopup.className = 'webext-draw-popup';
        screenshotPopup.style.display = 'none';
        screenshotPopup.innerHTML = `
            <div class="webext-draw-screenshot-grid">
                <button class="webext-draw-screenshot-btn" data-screenshot="region" title="Chụp vùng">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>
                        <path d="M9 9h6v6H9z"/>
                    </svg>
                    <span>Chụp vùng</span>
                </button>
                <button class="webext-draw-screenshot-btn" data-screenshot="fullscreen" title="Toàn màn hình">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                    <span>Toàn màn hình</span>
                </button>
                            </div>
        `;
        document.body.appendChild(screenshotPopup);

    }

    setupEventListeners() {
        const lineWidthSlider = document.getElementById('webext-line-width');
        const sizeValue = document.getElementById('webext-draw-size-value');
        const toolButtons = document.querySelectorAll('.webext-draw-tool-btn');
        const quickColors = document.querySelectorAll('.webext-draw-quick-color');
        const closeBtn = document.querySelector('.webext-draw-close-btn');
        const colorPopup = document.getElementById('webext-color-popup');
        const dragHandle = document.querySelector('.webext-drag-handle');

        // Setup color picker
        this.setupColorPicker();

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
                } else if (tool === 'shapes') {
                    this.togglePopup('shapes', button);
                    return;
                }

                // Handle picker tool - open EyeDropper immediately
                if (tool === 'picker') {
                    this.pickColorImmediate();
                    return;
                }

                // Handle undo/redo
                if (tool === 'undo') { this.undo(); return; }
                if (tool === 'redo') { this.redo(); return; }

                // Handle clear all tool
                if (tool === 'clearall') {
                    this.saveState();
                    this.clearCanvas();
                    return;
                }

                // Handle screenshot tool - show popup
                if (tool === 'screenshot') {
                    this.togglePopup('screenshot', button);
                    return;
                }

                // Handle action tools
                if (tool === 'toggle-visibility') {
                    this.toggleDrawingsVisibility();
                    return;
                }
                if (tool === 'pin-cycle') {
                    this.togglePinPopover(button);
                    return;
                }
                if (tool === 'settings') {
                    this.openSettings();
                    return;
                }

                // Handle drawing tools
                // Finish any in-progress free polygon
                if (this.freePolygonPoints.length >= 3) {
                    this.finishFreePolygon();
                } else {
                    this.freePolygonPoints = [];
                }
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
                this.currentColor = color;
                this.updateOpacityTrack();
                // Save to localStorage

                // Update fill color if fill is enabled
                if (this.fillEnabled) {
                    this.fillColor = color;
                }
                quickColors.forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                this.updateColorPickerFromColor(color);
                // Update hex display
                const hexInput = document.getElementById('webext-hex-input');
                const preview = document.getElementById('webext-color-preview');
                if (hexInput) hexInput.value = color.toUpperCase();
                if (preview) preview.style.background = color;
            });
        });

        lineWidthSlider.addEventListener('input', (e) => {
            this.lineWidth = e.target.value;
            sizeValue.textContent = e.target.value;
        });

        const opacitySlider = document.getElementById('webext-stroke-opacity');
        const opacityValue = document.getElementById('webext-draw-opacity-value');
        opacitySlider.addEventListener('input', (e) => {
            this.strokeOpacity = e.target.value / 100;
            opacityValue.textContent = e.target.value + '%';
            // Update the opacity track gradient
            this.updateOpacityTrack();
        });

        // Shape buttons in popup
        const shapeButtons = document.querySelectorAll('.webext-draw-shape-btn');
        shapeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Finish any in-progress free polygon
                if (this.freePolygonPoints.length >= 3) {
                    this.finishFreePolygon();
                } else {
                    this.freePolygonPoints = [];
                }
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

        // Screenshot buttons in popup
        const screenshotButtons = document.querySelectorAll('.webext-draw-screenshot-btn');
        screenshotButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const screenshotType = e.currentTarget.dataset.screenshot;
                this.closeAllPopups();
                
                // Auto-detect if there are drawings
                const hasDrawings = this.shapes.length > 0;
                
                if (screenshotType === 'region') {
                    this.startScreenshotMode(hasDrawings);
                } else if (screenshotType === 'fullscreen') {
                    this.captureFullScreen(hasDrawings);
                }
            });
        });

        // Fill color checkbox (in color popup)
        const fillEnabledCheckbox = document.getElementById('webext-fill-enabled');
        // Restore saved state
        fillEnabledCheckbox.checked = this.fillEnabled;
        
        fillEnabledCheckbox.addEventListener('change', (e) => {
            this.fillEnabled = e.target.checked;
            // Save to localStorage
            
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
            const shapesPopupEl = document.getElementById('webext-shapes-popup');
            if (!e.target.closest('.webext-draw-tool-btn[data-tool="shapes"]') &&
                !e.target.closest('#webext-shapes-popup')) {
                shapesPopupEl.style.display = 'none';
                document.querySelector('.webext-draw-tool-btn[data-tool="shapes"]')?.classList.remove('popup-active');
            }
            const screenshotPopupEl = document.getElementById('webext-screenshot-popup');
            if (!e.target.closest('.webext-draw-tool-btn[data-tool="screenshot"]') &&
                !e.target.closest('#webext-screenshot-popup')) {
                screenshotPopupEl.style.display = 'none';
                document.querySelector('.webext-draw-tool-btn[data-tool="screenshot"]')?.classList.remove('popup-active');
            }
        });

        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => {
            this.draw(e);
            this.updateResizeCursor(e);
        });
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());
        this.canvas.addEventListener('dblclick', (e) => {
            if (this.drawingMode === 'freepolygon' && this.freePolygonPoints.length >= 3) {
                this.finishFreePolygon();
            }
        });

        // Block space key scrolling globally when extension is enabled
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.isEnabled) {
                e.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

            // Undo: Ctrl+Z / Cmd+Z
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
                return;
            }
            // Redo: Ctrl+Shift+Z / Cmd+Shift+Z or Ctrl+Y
            if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
                e.preventDefault();
                this.redo();
                return;
            }
            // Duplicate: Ctrl+D
            if ((e.ctrlKey || e.metaKey) && e.key === 'd' && this.isEnabled) {
                e.preventDefault();
                this.duplicateSelected();
                return;
            }

            if ((e.key === 'Delete' || e.key === 'Backspace') && this.isEnabled && this.drawingMode === 'move') {
                e.preventDefault();
                this.deleteSelectedShapes();
                return;
            }
            if (e.key === 'Escape') {
                // Cancel free polygon if in progress
                if (this.freePolygonPoints.length > 0) {
                    this.freePolygonPoints = [];
                    this.redrawAllShapes();
                    return;
                }
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
                this.selectedShapes = [];
                this.originalShape = null;
                return false;
            }
        }, { capture: true });
    }

    saveState() {
        this.undoStack.push(JSON.parse(JSON.stringify(this.shapes)));
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        this.redoStack = [];
        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.undoStack.length === 0) return;
        this.redoStack.push(JSON.parse(JSON.stringify(this.shapes)));
        this.shapes = this.undoStack.pop();
        this.selectedShape = null;
        this.selectedShapes = [];
        this.redrawAllShapes();
        this.updateUndoRedoButtons();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        this.undoStack.push(JSON.parse(JSON.stringify(this.shapes)));
        this.shapes = this.redoStack.pop();
        this.selectedShape = null;
        this.selectedShapes = [];
        this.redrawAllShapes();
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        const undoBtn = document.querySelector('[data-tool="undo"]');
        const redoBtn = document.querySelector('[data-tool="redo"]');
        if (undoBtn) undoBtn.dataset.disabled = this.undoStack.length ? 'false' : 'true';
        if (redoBtn) redoBtn.dataset.disabled = this.redoStack.length ? 'false' : 'true';
    }


    setupColorPicker() {
        const saturationPanel = document.getElementById('webext-saturation-panel');
        const saturationCursor = document.getElementById('webext-saturation-cursor');
        const hueSlider = document.getElementById('webext-hue-slider');
        const hueCursor = document.getElementById('webext-hue-cursor');

        // Initialize color picker state
        this.colorPickerHue = 0;
        this.colorPickerSaturation = 100;
        this.colorPickerBrightness = 0;

        let isDraggingSaturation = false;
        let isDraggingHue = false;

        // Update saturation panel background based on hue
        const updateSaturationBackground = () => {
            const hueColor = `hsl(${this.colorPickerHue}, 100%, 50%)`;
            saturationPanel.style.backgroundColor = hueColor;
        };

        // Convert HSB to Hex
        const hsbToHex = (h, s, b) => {
            s /= 100;
            b /= 100;
            const k = (n) => (n + h / 60) % 6;
            const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
            const r = Math.round(255 * f(5));
            const g = Math.round(255 * f(3));
            const b2 = Math.round(255 * f(1));
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`;
        };

        // Update hex input and preview
        const updateHexDisplay = (color) => {
            const hexInput = document.getElementById('webext-hex-input');
            const preview = document.getElementById('webext-color-preview');
            if (hexInput) hexInput.value = color.toUpperCase();
            if (preview) preview.style.background = color;
        };

        // Update color from picker
        const updateColorFromPicker = () => {
            const color = hsbToHex(this.colorPickerHue, this.colorPickerSaturation, this.colorPickerBrightness);
            this.currentColor = color;
            this.updateOpacityTrack();
            updateHexDisplay(color);

            if (this.fillEnabled) {
                this.fillColor = color;
            }
            document.querySelectorAll('.webext-draw-quick-color').forEach(c => c.classList.remove('active'));
        };

        // Hex input handler
        const hexInput = document.getElementById('webext-hex-input');
        if (hexInput) {
            hexInput.addEventListener('change', () => {
                let val = hexInput.value.trim();
                if (!val.startsWith('#')) val = '#' + val;
                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    this.currentColor = val;
                    this.updateOpacityTrack();
                    updateHexDisplay(val);
                    if (this.fillEnabled) {
                        this.fillColor = val;
                    }
                    document.querySelectorAll('.webext-draw-quick-color').forEach(c => c.classList.remove('active'));
                }
            });
        }

        // Init preview
        updateHexDisplay(this.currentColor);

        // Saturation panel events
        const handleSaturationMove = (e) => {
            const rect = saturationPanel.getBoundingClientRect();
            let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            let y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

            this.colorPickerSaturation = (x / rect.width) * 100;
            this.colorPickerBrightness = 100 - (y / rect.height) * 100;

            saturationCursor.style.left = x + 'px';
            saturationCursor.style.top = y + 'px';

            updateColorFromPicker();
        };

        saturationPanel.addEventListener('mousedown', (e) => {
            isDraggingSaturation = true;
            handleSaturationMove(e);
            e.preventDefault();
        });

        // Hue slider events
        const handleHueMove = (e) => {
            const rect = hueSlider.getBoundingClientRect();
            let y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

            this.colorPickerHue = (y / rect.height) * 360;

            hueCursor.style.top = y + 'px';
            updateSaturationBackground();
            updateColorFromPicker();
        };

        hueSlider.addEventListener('mousedown', (e) => {
            isDraggingHue = true;
            handleHueMove(e);
            e.preventDefault();
        });

        // Global mouse events for dragging
        document.addEventListener('mousemove', (e) => {
            if (isDraggingSaturation) {
                handleSaturationMove(e);
            }
            if (isDraggingHue) {
                handleHueMove(e);
            }
        });

        document.addEventListener('mouseup', () => {
            isDraggingSaturation = false;
            isDraggingHue = false;
        });

        // Initialize
        updateSaturationBackground();
    }

    updateColorPickerFromColor(hexColor) {
        // Convert hex to HSB
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16) / 255;
        const g = parseInt(hex.substr(2, 2), 16) / 255;
        const b = parseInt(hex.substr(4, 2), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;

        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d + 6) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }

        const s = max === 0 ? 0 : (d / max) * 100;
        const v = max * 100;

        this.colorPickerHue = h;
        this.colorPickerSaturation = s;
        this.colorPickerBrightness = v;

        // Update UI
        const saturationPanel = document.getElementById('webext-saturation-panel');
        const saturationCursor = document.getElementById('webext-saturation-cursor');
        const hueCursor = document.getElementById('webext-hue-cursor');
        const hueSlider = document.getElementById('webext-hue-slider');

        if (saturationPanel && saturationCursor && hueCursor && hueSlider) {
            const satRect = saturationPanel.getBoundingClientRect();
            const hueRect = hueSlider.getBoundingClientRect();

            saturationCursor.style.left = (s / 100) * satRect.width + 'px';
            saturationCursor.style.top = ((100 - v) / 100) * satRect.height + 'px';
            hueCursor.style.top = (h / 360) * hueRect.height + 'px';

            // Update saturation panel background
            saturationPanel.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
        }
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
        this.hideContextToolbar();
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

            // Select shape or start marquee if clicking empty area
            const clickedShape = this.getShapeAtPoint(e.clientX, e.clientY);
            if (clickedShape) {
                // If holding Shift, toggle shape in multi-selection
                if (e.shiftKey) {
                    const idx = this.selectedShapes.indexOf(clickedShape);
                    if (idx >= 0) {
                        this.selectedShapes.splice(idx, 1);
                    } else {
                        this.selectedShapes.push(clickedShape);
                    }
                    this.selectedShape = this.selectedShapes.length > 0 ? this.selectedShapes[this.selectedShapes.length - 1] : null;
                    this.redrawAllShapes();
                    this.isDrawing = false;
                } else {
                    this.selectedShape = clickedShape;
                    this.selectedShapes = [clickedShape];
                    this.moveStartX = e.clientX;
                    this.moveStartY = e.clientY;
                    this.originalShape = JSON.parse(JSON.stringify(this.selectedShape));
                    this.saveState();
                    this.canvas.style.cursor = 'grabbing';
                    this.redrawAllShapes();
                }
            } else {
                // Start marquee selection on empty area
                this.selectedShape = null;
                this.selectedShapes = [];
                this.isMarqueeSelecting = true;
                this.marqueeStart = { x: e.clientX, y: e.clientY };
                this.redrawAllShapes();
            }
        } else if (this.drawingMode === 'picker') {
            this.pickColor(e.clientX, e.clientY);
        } else if (this.drawingMode === 'text') {
            this.showTextInput(e.clientX, e.clientY);
            this.isDrawing = false;
        } else if (this.drawingMode === 'pen') {
            // Start new path
            this.currentPath = [{ x: e.clientX, y: e.clientY }];
        } else if (this.drawingMode === 'freepolygon') {
            // Add point on click
            this.freePolygonPoints.push({ x: e.clientX, y: e.clientY });
            this.isDrawing = false; // Don't track as dragging
            this.drawFreePolygonPreview(e.clientX, e.clientY);
        } else if (this.drawingMode === 'ruler') {
            this.rulerStart = { x: e.clientX, y: e.clientY };
        } else if (this.drawingMode === 'stepmarker') {
            this.saveState();
            this.shapes.push({
                type: 'stepmarker',
                x: e.clientX,
                y: e.clientY,
                number: this.stepCounter++,
                color: this.currentColor,
                opacity: this.strokeOpacity
            });
            this.redrawAllShapes();
            this.isDrawing = false;
        } else if (this.drawingMode === 'blur' || this.drawingMode === 'spotlight') {
            // These use drag — handled like shapes via shapeStartX/Y
        } else if (this.drawingMode !== 'pen' && this.drawingMode !== 'eraser') {
            this.svgOverlay.style.pointerEvents = 'auto';
        }
    }

    draw(e) {
        // Free polygon preview follows mouse even when not dragging
        if (this.drawingMode === 'freepolygon' && this.freePolygonPoints.length > 0 && this.isEnabled) {
            this.drawFreePolygonPreview(e.clientX, e.clientY);
            return;
        }
        if (!this.isDrawing || !this.isEnabled) return;

        if (this.drawingMode === 'pen') {
            this.ctx.beginPath();
            this.ctx.moveTo(this.lastX, this.lastY);
            this.ctx.lineTo(e.clientX, e.clientY);
            this.ctx.strokeStyle = this.currentColor;
            this.ctx.lineWidth = this.lineWidth;
            this.ctx.globalAlpha = this.strokeOpacity;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;

            // Add point to current path
            this.currentPath.push({ x: e.clientX, y: e.clientY });

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
                    this.selectedShape.type === 'note' ||
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
                } else if (this.selectedShape.type === 'highlight' || this.selectedShape.type === 'blur' || this.selectedShape.type === 'spotlight') {
                    this.selectedShape.x = this.originalShape.x + deltaX;
                    this.selectedShape.y = this.originalShape.y + deltaY;
                } else if (this.selectedShape.type === 'stepmarker') {
                    this.selectedShape.x = this.originalShape.x + deltaX;
                    this.selectedShape.y = this.originalShape.y + deltaY;
                } else if (this.selectedShape.type === 'ellipse') {
                    this.selectedShape.cx = this.originalShape.cx + deltaX;
                    this.selectedShape.cy = this.originalShape.cy + deltaY;
                } else if (this.selectedShape.type === 'cross') {
                    this.selectedShape.cx = this.originalShape.cx + deltaX;
                    this.selectedShape.cy = this.originalShape.cy + deltaY;
                } else if (this.selectedShape.type === 'curve' || this.selectedShape.type === 'bezier') {
                    // Offset all numbers in the d attribute
                    const origD = this.originalShape.d;
                    let i = 0;
                    this.selectedShape.d = origD.replace(/-?[\d.]+/g, (match) => {
                        const val = parseFloat(match);
                        const offset = (i % 2 === 0) ? deltaX : deltaY;
                        i++;
                        return (val + offset).toFixed(1);
                    });
                }

                this.redrawAllShapes();
            }

            // Draw marquee selection rectangle
            if (this.isMarqueeSelecting && this.marqueeStart) {
                this.marqueeEnd = { x: e.clientX, y: e.clientY };
                this.redrawAllShapes();
                const mx = Math.min(this.marqueeStart.x, e.clientX);
                const my = Math.min(this.marqueeStart.y, e.clientY);
                const mw = Math.abs(e.clientX - this.marqueeStart.x);
                const mh = Math.abs(e.clientY - this.marqueeStart.y);
                this.ctx.strokeStyle = '#007bff';
                this.ctx.lineWidth = 1;
                this.ctx.setLineDash([4, 4]);
                this.ctx.strokeRect(mx, my, mw, mh);
                this.ctx.setLineDash([]);
                this.ctx.fillStyle = 'rgba(0, 123, 255, 0.08)';
                this.ctx.fillRect(mx, my, mw, mh);
            }
        } else if (this.drawingMode === 'ruler' && this.rulerStart) {
            // Draw ruler measurement line
            this.redrawAllShapes();
            const sx = this.rulerStart.x, sy = this.rulerStart.y;
            const ex = e.clientX, ey = e.clientY;
            const dist = Math.round(Math.sqrt(Math.pow(ex - sx, 2) + Math.pow(ey - sy, 2)));

            this.ctx.strokeStyle = '#ff4444';
            this.ctx.lineWidth = 1.5;
            this.ctx.setLineDash([6, 3]);
            this.ctx.beginPath();
            this.ctx.moveTo(sx, sy);
            this.ctx.lineTo(ex, ey);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // Draw endpoints
            [{ x: sx, y: sy }, { x: ex, y: ey }].forEach(p => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
                this.ctx.fillStyle = '#ff4444';
                this.ctx.fill();
            });

            // Draw distance label
            const midX = (sx + ex) / 2, midY = (sy + ey) / 2;
            const label = `${dist}px`;
            this.ctx.font = 'bold 12px sans-serif';
            const tw = this.ctx.measureText(label).width;
            this.ctx.fillStyle = '#ff4444';
            this.ctx.fillRect(midX - tw / 2 - 4, midY - 18, tw + 8, 20);
            this.ctx.fillStyle = 'white';
            this.ctx.fillText(label, midX - tw / 2, midY - 3);
        } else if (this.drawingMode === 'blur' && this.isDrawing) {
            this.redrawAllShapes();
            const bx = Math.min(this.shapeStartX, e.clientX);
            const by = Math.min(this.shapeStartY, e.clientY);
            const bw = Math.abs(e.clientX - this.shapeStartX);
            const bh = Math.abs(e.clientY - this.shapeStartY);
            // Blur preview
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            this.ctx.fillStyle = 'rgba(200,200,200,0.5)';
            this.ctx.fillRect(bx, by, bw, bh);
            this.ctx.strokeStyle = '#999';
            this.ctx.lineWidth = 1;
            this.ctx.setLineDash([4, 4]);
            this.ctx.strokeRect(bx, by, bw, bh);
            this.ctx.setLineDash([]);
        } else if (this.drawingMode === 'spotlight' && this.isDrawing) {
            this.redrawAllShapes();
            const sx = Math.min(this.shapeStartX, e.clientX);
            const sy = Math.min(this.shapeStartY, e.clientY);
            const sw = Math.abs(e.clientX - this.shapeStartX);
            const sh = Math.abs(e.clientY - this.shapeStartY);
            const cw = this.canvas.width / (window.devicePixelRatio || 1);
            const ch = this.canvas.height / (window.devicePixelRatio || 1);
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            // Dark overlay with cutout
            this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
            this.ctx.fillRect(0, 0, cw, ch);
            this.ctx.clearRect(sx, sy, sw, sh);
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(sx, sy, sw, sh);
        } else {
            this.drawShape(e.clientX, e.clientY);
        }
    }

    drawFreePolygonPreview(mouseX, mouseY) {
        // Draw on canvas directly
        this.redrawAllShapes();
        if (this.freePolygonPoints.length === 0) return;

        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.globalAlpha = this.strokeOpacity;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Draw existing segments
        this.ctx.beginPath();
        this.ctx.moveTo(this.freePolygonPoints[0].x, this.freePolygonPoints[0].y);
        for (let i = 1; i < this.freePolygonPoints.length; i++) {
            this.ctx.lineTo(this.freePolygonPoints[i].x, this.freePolygonPoints[i].y);
        }
        // Line to current mouse position
        this.ctx.lineTo(mouseX, mouseY);
        // Dashed line back to first point
        this.ctx.stroke();

        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(mouseX, mouseY);
        this.ctx.lineTo(this.freePolygonPoints[0].x, this.freePolygonPoints[0].y);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw dots on each point
        this.freePolygonPoints.forEach(p => {
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = this.currentColor;
            this.ctx.fill();
        });

        this.ctx.globalAlpha = 1;
    }

    finishFreePolygon() {
        if (this.freePolygonPoints.length < 3) return;

        this.saveState();
        const pointsStr = this.freePolygonPoints.map(p => `${p.x},${p.y}`).join(' ');
        this.shapes.push({
            type: 'polygon',
            points: pointsStr,
            color: this.currentColor,
            strokeWidth: this.lineWidth,
            opacity: this.strokeOpacity,
            fillColor: this.fillEnabled ? this.fillColor : 'none',
            fillEnabled: this.fillEnabled
        });
        this.freePolygonPoints = [];
        this.redrawAllShapes();
    }

    showNoteInput(x, y) {
        this.canvas.style.pointerEvents = 'none';

        const note = document.createElement('div');
        note.style.cssText = `
            position: fixed; left: ${x}px; top: ${y}px;
            min-width: 150px; min-height: 80px; max-width: 300px;
            background: #fff9c4; border: 1px solid #f0e68c;
            border-radius: 6px; padding: 8px; font-size: 13px;
            font-family: sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            z-index: 2147483647; outline: none; cursor: text;
            white-space: pre-wrap; word-wrap: break-word;
        `;
        note.contentEditable = 'true';
        note.setAttribute('placeholder', 'Type a note...');
        document.body.appendChild(note);
        note.focus();

        const finishNote = () => {
            const text = note.innerText.trim();
            if (text) {
                this.saveState();
                this.shapes.push({
                    type: 'note',
                    text: text,
                    x: x,
                    y: y,
                    color: '#333',
                    bgColor: '#fff9c4',
                    fontSize: 13,
                    opacity: this.strokeOpacity
                });
                this.redrawAllShapes();
            }
            note.remove();
            this.canvas.style.pointerEvents = 'auto';
            this.updateCursor();
        };

        note.addEventListener('blur', () => setTimeout(finishNote, 100));
        note.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { note.remove(); this.canvas.style.pointerEvents = 'auto'; this.updateCursor(); }
        });
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

            case 'curve':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                // Quadratic curve: control point is perpendicular offset from midpoint
                const cvMidX = (this.shapeStartX + currentX) / 2;
                const cvMidY = (this.shapeStartY + currentY) / 2;
                const cvDx = currentX - this.shapeStartX;
                const cvDy = currentY - this.shapeStartY;
                // Control point offset perpendicular to the line
                const cvCpX = cvMidX - cvDy * 0.5;
                const cvCpY = cvMidY + cvDx * 0.5;
                shape.setAttribute('d', `M${this.shapeStartX},${this.shapeStartY} Q${cvCpX},${cvCpY} ${currentX},${currentY}`);
                shape.setAttribute('fill', 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                shape.setAttribute('stroke-linecap', 'round');
                break;

            case 'bezier':
                shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                // Cubic bezier: two control points
                const bzDx = currentX - this.shapeStartX;
                const bzDy = currentY - this.shapeStartY;
                const bzCp1X = this.shapeStartX + bzDx * 0.33;
                const bzCp1Y = this.shapeStartY - Math.abs(bzDy) * 0.6;
                const bzCp2X = this.shapeStartX + bzDx * 0.66;
                const bzCp2Y = currentY - Math.abs(bzDy) * 0.6;
                shape.setAttribute('d', `M${this.shapeStartX},${this.shapeStartY} C${bzCp1X},${bzCp1Y} ${bzCp2X},${bzCp2Y} ${currentX},${currentY}`);
                shape.setAttribute('fill', 'none');
                shape.setAttribute('stroke', strokeColor);
                shape.setAttribute('stroke-width', strokeWidth);
                shape.setAttribute('stroke-linecap', 'round');
                break;
        }

        if (shape) {
            shape.setAttribute('opacity', this.strokeOpacity);
            this.svgOverlay.appendChild(shape);
        }
    }

    stopDrawing() {
        if (this.isDrawing) {
            if (this.drawingMode === 'pen' && this.currentPath.length > 1) {
                this.saveState();
                this.shapes.push({
                    type: 'path',
                    points: [...this.currentPath],
                    color: this.currentColor,
                    strokeWidth: this.lineWidth,
                    opacity: this.strokeOpacity
                });
                this.currentPath = [];
            } else if (this.drawingMode === 'ruler') {
                this.rulerStart = null;
                this.redrawAllShapes();
            } else if (this.drawingMode === 'blur') {
                const bx = Math.min(this.shapeStartX, this.lastX);
                const by = Math.min(this.shapeStartY, this.lastY);
                const bw = Math.abs(this.lastX - this.shapeStartX);
                const bh = Math.abs(this.lastY - this.shapeStartY);
                if (bw > 5 && bh > 5) {
                    this.saveState();
                    this.shapes.push({ type: 'blur', x: bx, y: by, width: bw, height: bh, color: this.currentColor, opacity: this.strokeOpacity });
                    this.redrawAllShapes();
                }
            } else if (this.drawingMode === 'spotlight') {
                const sx = Math.min(this.shapeStartX, this.lastX);
                const sy = Math.min(this.shapeStartY, this.lastY);
                const sw = Math.abs(this.lastX - this.shapeStartX);
                const sh = Math.abs(this.lastY - this.shapeStartY);
                if (sw > 5 && sh > 5) {
                    this.saveState();
                    this.shapes.push({ type: 'spotlight', x: sx, y: sy, width: sw, height: sh, opacity: 1 });
                    this.redrawAllShapes();
                }
            } else if (this.drawingMode !== 'pen' && this.drawingMode !== 'eraser' && this.drawingMode !== 'move' && this.drawingMode !== 'picker' && this.drawingMode !== 'freepolygon' && this.drawingMode !== 'stepmarker') {
                const shape = this.createShapeFromSVG();
                if (shape) {
                    this.saveState();
                    this.shapes.push(shape);
                    this.svgToCanvas();
                }
            }
        }

        // Handle move mode - reset cursor
        if (this.drawingMode === 'move') {
            // Finalize marquee selection
            if (this.isMarqueeSelecting && this.marqueeStart && this.marqueeEnd) {
                const mx = Math.min(this.marqueeStart.x, this.marqueeEnd.x);
                const my = Math.min(this.marqueeStart.y, this.marqueeEnd.y);
                const mw = Math.abs(this.marqueeEnd.x - this.marqueeStart.x);
                const mh = Math.abs(this.marqueeEnd.y - this.marqueeStart.y);

                if (mw > 5 || mh > 5) {
                    // Select all shapes that intersect with the marquee rectangle
                    this.selectedShapes = this.shapes.filter(shape => {
                        const bounds = this.getShapeBounds(shape);
                        return bounds.x < mx + mw && bounds.x + bounds.width > mx &&
                               bounds.y < my + mh && bounds.y + bounds.height > my;
                    });
                    this.selectedShape = this.selectedShapes.length > 0 ? this.selectedShapes[0] : null;
                }
                this.isMarqueeSelecting = false;
                this.marqueeStart = null;
                this.marqueeEnd = null;
                this.redrawAllShapes();
            }

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
            this.selectedShapes = [];
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
        this.removeAllBlurDivs();
        this.shapes = [];
    }

    removeAllBlurDivs() {
        document.querySelectorAll('.webext-blur-overlay').forEach(el => el.remove());
    }

    removeBlurDiv(shape) {
        if (shape._blurId) {
            const el = document.getElementById('webext-blur-' + shape._blurId);
            if (el) el.remove();
        }
    }

    async pickColorImmediate() {
        try {
            // Use EyeDropper API if available (Chrome 95+)
            if (window.EyeDropper) {
                const eyeDropper = new EyeDropper();
                const result = await eyeDropper.open();
                const hexColor = result.sRGBHex;

                // Copy to clipboard only
                await navigator.clipboard.writeText(hexColor);
                this.showColorNotification(hexColor);
            } else {
                this.showColorNotification('Browser does not support EyeDropper API');
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
        notification.textContent = `Color ${color} copied!`;

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
        this.saveState();
        this.shapes.push({
            type: 'text',
            text: text,
            x: x,
            y: y,
            color: this.currentColor,
            fontSize: fontSize,
            fontFamily: fontFamily,
            fontWeight: fontWeight,
            opacity: this.strokeOpacity
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
                    fontWeight: fontWeight,
                    opacity: this.strokeOpacity
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
            opacity: this.strokeOpacity,
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
        } else if (shape.tagName === 'path') {
            const d = shape.getAttribute('d');
            shapeData.d = d;
            if (d.includes('Q')) {
                shapeData.type = 'curve';
            } else if (d.includes('C')) {
                shapeData.type = 'bezier';
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
                const fontFamily = shape.fontFamily || 'Nunito, Arial, sans-serif';
                const fontWeight = shape.fontWeight || '700';
                this.ctx.font = `${fontWeight} ${shape.fontSize}px ${fontFamily}`;
                const metrics = this.ctx.measureText(shape.text);
                // Text baseline is 'top', so y is the top of the text
                if (x >= shape.x && x <= shape.x + metrics.width &&
                    y >= shape.y && y <= shape.y + shape.fontSize) {
                    return shape;
                }
            } else if (shape.type === 'rect' || shape.type === 'note') {
                const w = shape.width || 150, h = shape.height || 80;
                if (x >= shape.x && x <= shape.x + w &&
                    y >= shape.y && y <= shape.y + h) {
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
            } else if (shape.type === 'curve' || shape.type === 'bezier') {
                const bounds = this.getShapeBounds(shape);
                if (x >= bounds.x - 10 && x <= bounds.x + bounds.width + 10 &&
                    y >= bounds.y - 10 && y <= bounds.y + bounds.height + 10) {
                    return shape;
                }
            } else if (shape.type === 'stepmarker') {
                if (Math.sqrt(Math.pow(x - shape.x, 2) + Math.pow(y - shape.y, 2)) <= 18) {
                    return shape;
                }
            } else if (shape.type === 'blur' || shape.type === 'spotlight') {
                if (x >= shape.x && x <= shape.x + shape.width &&
                    y >= shape.y && y <= shape.y + shape.height) {
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

        if (shape.type === 'rect' || shape.type === 'highlight' || shape.type === 'note') {
            bounds = { x: shape.x, y: shape.y, width: shape.width || 150, height: shape.height || 80 };
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
        } else if (shape.type === 'curve' || shape.type === 'bezier') {
            // Extract all numbers from the d attribute for rough bounds
            const nums = shape.d.match(/-?[\d.]+/g).map(Number);
            const xs = [], ys = [];
            for (let i = 0; i < nums.length; i += 2) {
                xs.push(nums[i]);
                if (i + 1 < nums.length) ys.push(nums[i + 1]);
            }
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            bounds = { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
        } else if (shape.type === 'stepmarker') {
            bounds = { x: shape.x - 16, y: shape.y - 16, width: 32, height: 32 };
        } else if (shape.type === 'blur' || shape.type === 'spotlight') {
            bounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
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


    updateOpacityTrack() {
        const track = document.querySelector('.webext-draw-opacity-track');
        if (track) {
            const color = this.currentColor;
            // Gradient from light gray to current color, matching reference design
            track.style.background = `linear-gradient(to right, #e8e8e8, ${color})`;
        }
    }

    loadSettings() {
        const defaults = {
            lang: 'vi',
            defaultColor: '#FF0000',
            defaultStrokeWidth: 4,
            defaultOpacity: 1,
            defaultPosition: 'bottom', // bottom, left, right
            autoCursor: true,
            shortcutKey: 'KeyD',
            saveDrawings: false,
            screenshotFormat: 'png',
            screenshotQuality: 0.9,
            toolbarOrder: null, // null = default order
            hiddenTools: []
        };
        try {
            const saved = JSON.parse(localStorage.getItem('webext-draw-settings') || '{}');
            return { ...defaults, ...saved };
        } catch { return defaults; }
    }

    saveSettings() {
        localStorage.setItem('webext-draw-settings', JSON.stringify(this.settings));
    }

    applySettings() {
        this.currentColor = this.settings.defaultColor;
        this.lineWidth = this.settings.defaultStrokeWidth;
        this.strokeOpacity = this.settings.defaultOpacity;

        // Apply toolbar position
        if (this.settings.defaultPosition === 'left') {
            this.pinState = 'left';
        } else if (this.settings.defaultPosition === 'right') {
            this.pinState = 'right';
        } else {
            this.pinState = 'none';
        }
        localStorage.setItem('webext-draw-pinned', this.pinState);
        if (this.uiElement) this.applyPinState();

        // Apply toolbar order
        this.applyToolbarOrder();

        // Apply hidden tools
        this.applyHiddenTools();

        // Update UI sliders
        const widthSlider = document.getElementById('webext-line-width');
        const widthVal = document.getElementById('webext-draw-size-value');
        const opacitySlider = document.getElementById('webext-stroke-opacity');
        const opacityVal = document.getElementById('webext-draw-opacity-value');
        if (widthSlider) { widthSlider.value = this.lineWidth; }
        if (widthVal) { widthVal.textContent = this.lineWidth; }
        if (opacitySlider) { opacitySlider.value = Math.round(this.strokeOpacity * 100); }
        if (opacityVal) { opacityVal.textContent = Math.round(this.strokeOpacity * 100) + '%'; }
        this.updateOpacityTrack();
    }

    applyToolbarOrder() {
        if (!this.settings.toolbarOrder) return;
        const content = this.uiElement?.querySelector('.webext-draw-toolbar-content');
        if (!content) return;
        const buttons = Array.from(content.querySelectorAll('.webext-draw-tool-btn'));
        const order = this.settings.toolbarOrder;
        const sorted = [];
        order.forEach(tool => {
            const btn = buttons.find(b => b.dataset.tool === tool || b.dataset.shape === tool);
            if (btn) sorted.push(btn);
        });
        // Add any buttons not in order list
        buttons.forEach(b => { if (!sorted.includes(b)) sorted.push(b); });
        sorted.forEach(b => content.appendChild(b));
    }

    applyHiddenTools() {
        const hidden = this.settings.hiddenTools || [];
        this.uiElement?.querySelectorAll('.webext-draw-tool-btn').forEach(btn => {
            const tool = btn.dataset.tool;
            if (hidden.includes(tool)) {
                btn.style.display = 'none';
            } else {
                btn.style.display = '';
            }
        });
    }

    getToolLabel(tool) {
        const vi = {
            cursor: 'Con trỏ', pen: 'Bút vẽ', text: 'Chữ', shapes: 'Hình dạng',
            move: 'Di chuyển', eraser: 'Tẩy', undo: 'Hoàn tác', redo: 'Làm lại',
            color: 'Màu sắc', picker: 'Lấy màu', clearall: 'Xóa tất cả',
            screenshot: 'Chụp màn hình', duplicate: 'Nhân đôi', ruler: 'Thước đo',
            stepmarker: 'Đánh số', blur: 'Làm mờ', spotlight: 'Spotlight',
            'toggle-visibility': 'Ẩn/hiện', 'pin-cycle': 'Ghim',
            settings: 'Cài đặt'
        };
        const en = {
            cursor: 'Cursor', pen: 'Pen', text: 'Text', shapes: 'Shapes',
            move: 'Move', eraser: 'Eraser', undo: 'Undo', redo: 'Redo',
            color: 'Color', picker: 'Pick Color', clearall: 'Clear All',
            screenshot: 'Screenshot', duplicate: 'Duplicate', ruler: 'Ruler',
            stepmarker: 'Step Marker', blur: 'Blur', spotlight: 'Spotlight',
            'toggle-visibility': 'Show/Hide', 'pin-cycle': 'Pin',
            settings: 'Settings'
        };
        const labels = this.settings.lang === 'en' ? en : vi;
        return labels[tool] || tool;
    }

    openSettings() {
        const existing = document.getElementById('webext-settings-modal');
        if (existing) { existing.remove(); return; }

        const s = this.settings;
        const isVi = s.lang === 'vi';
        const t = (vi, en) => isVi ? vi : en;

        const overlay = document.createElement('div');
        overlay.id = 'webext-settings-modal';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 2147483647;
            background: rgba(0,0,0,0.08); display: flex;
            align-items: center; justify-content: center;
        `;

        const modal = document.createElement('div');
        modal.className = 'ws-modal';
        modal.style.cssText = `
            width: 500px; max-width: 92vw; height: 540px; max-height: 85vh;
        `;

        // Header
        const header = document.createElement('div');
        header.className = 'ws-header';
        header.innerHTML = `<h3>${t('Cài đặt', 'Settings')}</h3>`;
        const closeX = document.createElement('button');
        closeX.className = 'ws-close-x';
        closeX.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        closeX.addEventListener('click', () => overlay.remove());
        header.appendChild(closeX);

        // Inject scoped styles
        const styleId = 'ws-modal-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                #webext-settings-modal * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                .ws-modal { background: #ffffff; border-radius: 20px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(60,70,110,0.25), 0 0 0 1px rgba(255,255,255,0.6) inset; }
                .ws-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; background: white; border-bottom: 1px solid #e8eaf0; }
                .ws-header h3 { margin: 0; font-size: 15px; font-weight: 700; color: #2d3250; }
                .ws-close-x { background: none; border: none; cursor: pointer; padding: 6px; border-radius: 8px; display: flex; color: #aab; transition: all 0.15s; }
                .ws-close-x:hover { background: #f0f0f5; color: #666; }

                .ws-section { margin-bottom: 16px; }
                .ws-section-title { font-size: 10px; font-weight: 700; color: #8b90a5; margin: 0 0 6px 2px; text-transform: uppercase; letter-spacing: 1.2px; }
                .ws-card { background: white; border-radius: 14px; padding: 4px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
                .ws-row { display: flex; align-items: center; justify-content: space-between; padding: 11px 16px; position: relative; }
                .ws-row + .ws-row { border-top: 1px solid #f2f3f7; }
                .ws-label { font-size: 13px; color: #2d3250; font-weight: 500; }

                /* Custom Select — pill style */
                .ws-select { appearance: none; -webkit-appearance: none; padding: 6px 30px 6px 12px; border: 1.5px solid #e2e5ee; border-radius: 10px; font-size: 12px; font-weight: 600; background: #f8f9fc url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%237b80a0' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 10px center; outline: none; cursor: pointer; color: #3d4270; min-width: 105px; transition: all 0.2s; }
                .ws-select:focus { border-color: #6c7bf7; box-shadow: 0 0 0 3px rgba(108,123,247,0.12); }
                .ws-select:hover { border-color: #c0c5da; }

                /* Custom Range — rounded thick */
                .ws-range { -webkit-appearance: none; appearance: none; width: 110px; height: 6px; border-radius: 3px; background: linear-gradient(90deg, #e2e5ee 0%, #d0d4e4 100%); outline: none; cursor: pointer; }
                .ws-range::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg, #6c7bf7 0%, #5a67e8 100%); cursor: pointer; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(90,103,232,0.35); transition: transform 0.15s, box-shadow 0.15s; }
                .ws-range::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 3px 10px rgba(90,103,232,0.4); }
                .ws-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg, #6c7bf7 0%, #5a67e8 100%); cursor: pointer; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(90,103,232,0.35); }
                .ws-range-val { min-width: 34px; text-align: center; font-weight: 700; font-size: 11px; color: #5a67e8; background: #eef0ff; padding: 3px 8px; border-radius: 6px; }

                /* Custom Color */
                .ws-color-wrap { display: flex; align-items: center; gap: 8px; }
                .ws-color-input { width: 32px; height: 32px; border: none; border-radius: 10px; cursor: pointer; padding: 0; background: none; overflow: hidden; }
                .ws-color-input::-webkit-color-swatch-wrapper { padding: 0; }
                .ws-color-input::-webkit-color-swatch { border: 2px solid #e2e5ee; border-radius: 10px; }
                .ws-color-hex { font-size: 11px; font-family: 'SF Mono', 'Fira Code', monospace; color: #8b90a5; font-weight: 600; }

                /* Custom Switch — compact iOS style */
                .ws-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
                .ws-switch input { display: none; }
                .ws-switch-track { position: absolute; inset: 0; background: #d5d8e4; border-radius: 20px; cursor: pointer; transition: background 0.3s cubic-bezier(.4,0,.2,1); }
                .ws-switch-thumb { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; transition: transform 0.3s cubic-bezier(.4,0,.2,1); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
                .ws-switch input:checked ~ .ws-switch-track { background: linear-gradient(135deg, #6c7bf7 0%, #5a67e8 100%); }
                .ws-switch input:checked ~ .ws-switch-thumb { transform: translateX(16px); }

                /* Footer */
                .ws-footer { padding: 14px 22px; background: white; border-top: 1px solid #f0f1f5; display: flex; justify-content: flex-end; gap: 10px; }
                .ws-btn { border: none; border-radius: 8px; padding: 8px 18px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; letter-spacing: 0.2px; }
                .ws-btn-primary { background: #5a67e8; color: white; }
                .ws-btn-primary:hover { background: #4a56d6; }
                .ws-btn-secondary { background: none; color: #8b90a5; }
                .ws-btn-secondary:hover { color: #5a67e8; background: #f0f1ff; }

                /* Thin scrollbar */
                .ws-modal-body::-webkit-scrollbar { width: 4px; }
                .ws-modal-body::-webkit-scrollbar-track { background: transparent; }
                .ws-modal-body::-webkit-scrollbar-thumb { background: rgba(100,110,160,0.15); border-radius: 4px; }

                /* Toolbar list items */
                .ws-tool-item:hover { background: #f8f9fc !important; }
            `;
            document.head.appendChild(style);
        }

        // Body
        const body = document.createElement('div');
        body.className = 'ws-modal-body';
        body.style.cssText = 'padding:20px 24px;flex:1;overflow-y:auto;font-size:13px;color:#333;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,0.15) transparent;';

        const switchHtml = (id, checked) => `
            <label class="ws-switch">
                <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
                <span class="ws-switch-track"></span>
                <span class="ws-switch-thumb"></span>
            </label>`;

        body.innerHTML = `
            <div class="ws-section">
                <div class="ws-section-title">${t('Giao diện', 'Interface')}</div>
                <div class="ws-card">
                    <div class="ws-row">
                        <span class="ws-label">${t('Ngôn ngữ', 'Language')}</span>
                        <select id="ws-lang" class="ws-select">
                            <option value="vi" ${s.lang === 'vi' ? 'selected' : ''}>Tiếng Việt</option>
                            <option value="en" ${s.lang === 'en' ? 'selected' : ''}>English</option>
                        </select>
                    </div>
                    <div class="ws-row">
                        <span class="ws-label">${t('Vị trí toolbar', 'Toolbar position')}</span>
                        <select id="ws-position" class="ws-select">
                            <option value="bottom" ${s.defaultPosition === 'bottom' ? 'selected' : ''}>${t('Dưới', 'Bottom')}</option>
                            <option value="left" ${s.defaultPosition === 'left' ? 'selected' : ''}>${t('Trái', 'Left')}</option>
                            <option value="right" ${s.defaultPosition === 'right' ? 'selected' : ''}>${t('Phải', 'Right')}</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="ws-section">
                <div class="ws-section-title">${t('Nét vẽ mặc định', 'Default Stroke')}</div>
                <div class="ws-card">
                    <div class="ws-row">
                        <span class="ws-label">${t('Màu', 'Color')}</span>
                        <div class="ws-color-wrap">
                            <span class="ws-color-hex" id="ws-color-hex">${s.defaultColor}</span>
                            <input type="color" id="ws-color" value="${s.defaultColor}" class="ws-color-input">
                        </div>
                    </div>
                    <div class="ws-row">
                        <span class="ws-label">${t('Độ dày', 'Width')}</span>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="range" id="ws-width" min="1" max="50" value="${s.defaultStrokeWidth}" class="ws-range">
                            <span id="ws-width-val" class="ws-range-val">${s.defaultStrokeWidth}</span>
                        </div>
                    </div>
                    <div class="ws-row">
                        <span class="ws-label">${t('Độ mờ', 'Opacity')}</span>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="range" id="ws-opacity" min="1" max="100" value="${Math.round(s.defaultOpacity * 100)}" class="ws-range">
                            <span id="ws-opacity-val" class="ws-range-val">${Math.round(s.defaultOpacity * 100)}%</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="ws-section">
                <div class="ws-section-title">${t('Hành vi', 'Behavior')}</div>
                <div class="ws-card">
                    <div class="ws-row">
                        <span class="ws-label">${t('Tự bật con trỏ khi mở', 'Auto cursor on open')}</span>
                        ${switchHtml('ws-autocursor', s.autoCursor)}
                    </div>
                    <div class="ws-row">
                        <span class="ws-label">${t('Lưu bản vẽ theo trang', 'Save drawings per page')}</span>
                        ${switchHtml('ws-savedrawings', s.saveDrawings)}
                    </div>
                </div>
            </div>
            <div class="ws-section">
                <div class="ws-section-title">${t('Chụp màn hình', 'Screenshot')}</div>
                <div class="ws-card">
                    <div class="ws-row">
                        <span class="ws-label">${t('Định dạng', 'Format')}</span>
                        <select id="ws-format" class="ws-select">
                            <option value="png" ${s.screenshotFormat === 'png' ? 'selected' : ''}>PNG</option>
                            <option value="jpeg" ${s.screenshotFormat === 'jpeg' ? 'selected' : ''}>JPG</option>
                        </select>
                    </div>
                    <div class="ws-row">
                        <span class="ws-label">${t('Chất lượng', 'Quality')}</span>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="range" id="ws-quality" min="10" max="100" value="${Math.round(s.screenshotQuality * 100)}" class="ws-range">
                            <span id="ws-quality-val" class="ws-range-val">${Math.round(s.screenshotQuality * 100)}%</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="ws-section">
                <div class="ws-section-title">${t('Thanh công cụ', 'Toolbar')}</div>
                <div class="ws-card" style="padding:0;">
                    <div id="ws-toolbar-list"></div>
                </div>
            </div>
        `;

        // Footer
        const footer = document.createElement('div');
        footer.className = 'ws-footer';

        const resetBtn = document.createElement('button');
        resetBtn.textContent = t('Đặt lại', 'Reset');
        resetBtn.className = 'ws-btn ws-btn-secondary';
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            localStorage.removeItem('webext-draw-settings');
            localStorage.removeItem('webext-draw-pinned');
            this.settings = this.loadSettings();
            this.applySettings();
            overlay.remove();
            setTimeout(() => this.openSettings(), 50);
        });

        const saveBtn = document.createElement('button');
        saveBtn.textContent = t('Lưu cài đặt', 'Save Settings');
        saveBtn.className = 'ws-btn ws-btn-primary';
        saveBtn.addEventListener('click', () => {
            this.settings.lang = body.querySelector('#ws-lang').value;
            this.settings.defaultPosition = body.querySelector('#ws-position').value;
            this.settings.defaultColor = body.querySelector('#ws-color').value;
            this.settings.defaultStrokeWidth = parseInt(body.querySelector('#ws-width').value);
            this.settings.defaultOpacity = parseInt(body.querySelector('#ws-opacity').value) / 100;
            this.settings.autoCursor = body.querySelector('#ws-autocursor').checked;
            this.settings.saveDrawings = body.querySelector('#ws-savedrawings').checked;
            this.settings.screenshotFormat = body.querySelector('#ws-format').value;
            this.settings.screenshotQuality = parseInt(body.querySelector('#ws-quality').value) / 100;
            const listItems = body.querySelectorAll('#ws-toolbar-list .ws-tool-item');
            this.settings.toolbarOrder = Array.from(listItems).map(li => li.dataset.tool);
            this.settings.hiddenTools = Array.from(listItems)
                .filter(li => !li.querySelector('input[type=checkbox]').checked)
                .map(li => li.dataset.tool);
            this.saveSettings();
            this.applySettings();
            overlay.remove();
        });

        footer.append(resetBtn, saveBtn);
        modal.append(header, body, footer);
        overlay.appendChild(modal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);

        // Populate toolbar list
        this.populateToolbarList(body.querySelector('#ws-toolbar-list'));

        // Live updates
        body.querySelector('#ws-width').addEventListener('input', (e) => {
            body.querySelector('#ws-width-val').textContent = e.target.value;
        });
        body.querySelector('#ws-opacity').addEventListener('input', (e) => {
            body.querySelector('#ws-opacity-val').textContent = e.target.value + '%';
        });
        body.querySelector('#ws-quality').addEventListener('input', (e) => {
            body.querySelector('#ws-quality-val').textContent = e.target.value + '%';
        });
        body.querySelector('#ws-color').addEventListener('input', (e) => {
            body.querySelector('#ws-color-hex').textContent = e.target.value.toUpperCase();
        });
    }

    populateToolbarList(container) {
        const content = this.uiElement?.querySelector('.webext-draw-toolbar-content');
        if (!content) return;

        const allButtons = Array.from(content.querySelectorAll('.webext-draw-tool-btn'));
        const tools = allButtons.map(b => b.dataset.tool).filter(Boolean);

        // Use saved order or current order
        const order = this.settings.toolbarOrder || tools;
        const hidden = this.settings.hiddenTools || [];

        // Add tools not in order (newly added)
        tools.forEach(t => { if (!order.includes(t)) order.push(t); });

        let dragItem = null;

        order.forEach(tool => {
            if (!tools.includes(tool)) return; // skip removed tools

            const item = document.createElement('div');
            item.className = 'ws-tool-item';
            item.dataset.tool = tool;
            item.draggable = true;
            item.style.cssText = `
                display:flex;align-items:center;gap:10px;padding:8px 14px;
                background:white;border-bottom:1px solid #f5f5f5;cursor:grab;
                font-size:13px;user-select:none;transition:background 0.15s;
            `;
            item.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#bbb" stroke="none" style="flex-shrink:0;cursor:grab;">
                    <circle cx="8" cy="6" r="2"/><circle cx="16" cy="6" r="2"/>
                    <circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>
                    <circle cx="8" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>
                </svg>
                <span style="flex:1;font-weight:500;">${this.getToolLabel(tool)}</span>
                <label class="ws-switch" style="transform:scale(0.85);">
                    <input type="checkbox" ${hidden.includes(tool) ? '' : 'checked'}>
                    <span class="ws-switch-track"></span>
                    <span class="ws-switch-thumb"></span>
                </label>
            `;

            // Drag events
            item.addEventListener('dragstart', (e) => {
                dragItem = item;
                item.style.opacity = '0.4';
                e.dataTransfer.effectAllowed = 'move';
            });
            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
                dragItem = null;
                container.querySelectorAll('.ws-tool-item').forEach(i => i.style.borderTop = '');
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.style.borderTop = '2px solid #007bff';
            });
            item.addEventListener('dragleave', () => {
                item.style.borderTop = '';
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.style.borderTop = '';
                if (dragItem && dragItem !== item) {
                    container.insertBefore(dragItem, item);
                }
            });

            container.appendChild(item);
        });
    }

    toggleDrawingsVisibility() {
        this.drawingsVisible = !this.drawingsVisible;
        this.canvas.style.opacity = this.drawingsVisible ? '1' : '0';
        this.svgOverlay.style.opacity = this.drawingsVisible ? '1' : '0';
        const btn = document.querySelector('[data-tool="toggle-visibility"]');
        if (btn) {
            btn.classList.toggle('active', !this.drawingsVisible);
            btn.querySelector('svg').innerHTML = this.drawingsVisible
                ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>';
        }
    }


    // === Duplicate selected shape ===
    duplicateSelected() {
        const source = this.selectedShape;
        if (!source) return;
        this.saveState();
        const copy = JSON.parse(JSON.stringify(source));
        // Offset the copy
        const offset = 20;
        if (copy.type === 'path') {
            copy.points = copy.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
        } else if (copy.x != null) {
            copy.x += offset; copy.y += offset;
        } else if (copy.x1 != null) {
            copy.x1 += offset; copy.y1 += offset; copy.x2 += offset; copy.y2 += offset;
        } else if (copy.cx != null) {
            copy.cx += offset; copy.cy += offset;
        } else if (copy.points && typeof copy.points === 'string') {
            copy.points = copy.points.split(' ').map(p => {
                const [x, y] = p.split(',').map(Number);
                return `${x + offset},${y + offset}`;
            }).join(' ');
        } else if (copy.d) {
            let i = 0;
            copy.d = copy.d.replace(/-?[\d.]+/g, (m) => {
                const v = parseFloat(m) + offset;
                return v.toFixed(1);
            });
        }
        this.shapes.push(copy);
        this.selectedShape = copy;
        this.selectedShapes = [copy];
        this.redrawAllShapes();
    }

    // === Lock/Unlock selected shape ===
    toggleLockSelected() {
        const shape = this.selectedShape;
        if (!shape) return;
        shape.locked = !shape.locked;
        const btn = document.querySelector('[data-tool="lock"]');
        if (shape.locked) {
            btn?.classList.add('active');
        } else {
            btn?.classList.remove('active');
        }
        this.redrawAllShapes();
    }

    // === Export PNG ===
    exportPNG() {
        // Create a temp canvas with just the drawings
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.canvas.width;
        tempCanvas.height = this.canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        tempCtx.scale(dpr, dpr);
        // Draw white background
        tempCtx.fillStyle = 'white';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        // Draw current canvas content
        tempCtx.drawImage(this.canvas, 0, 0);

        const link = document.createElement('a');
        link.download = 'drawlite-export.png';
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
    }

    // === Grid toggle ===
    toggleGrid() {
        this.showGrid = !this.showGrid;
        const btn = document.querySelector('[data-tool="grid"]');
        if (this.showGrid) {
            btn?.classList.add('active');
        } else {
            btn?.classList.remove('active');
        }
        this.redrawAllShapes();
    }

    drawGrid() {
        if (!this.showGrid) return;
        const w = this.canvas.width / (window.devicePixelRatio || 1);
        const h = this.canvas.height / (window.devicePixelRatio || 1);
        this.ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        this.ctx.lineWidth = 0.5;
        for (let x = 0; x <= w; x += this.gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
            this.ctx.stroke();
        }
        for (let y = 0; y <= h; y += this.gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
            this.ctx.stroke();
        }
    }

    // === Snap to grid ===
    snapToGrid(val) {
        if (!this.showGrid) return val;
        return Math.round(val / this.gridSize) * this.gridSize;
    }

    deleteSelectedShapes() {
        const toDelete = this.selectedShapes.length > 0 ? this.selectedShapes : (this.selectedShape ? [this.selectedShape] : []);
        if (toDelete.length === 0) return;

        this.saveState();
        toDelete.forEach(s => { if (s.type === 'blur') this.removeBlurDiv(s); });
        this.shapes = this.shapes.filter(s => !toDelete.includes(s));
        this.selectedShape = null;
        this.selectedShapes = [];
        this.redrawAllShapes();
    }

    redrawAllShapes() {
        // Clear canvas and blur overlays
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.removeAllBlurDivs();

        // Redraw all shapes
        this.shapes.forEach(shape => {
            this.ctx.globalAlpha = shape.opacity != null ? shape.opacity : 1;
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
            } else if (shape.type === 'note') {
                // Draw sticky note
                const padding = 8;
                this.ctx.font = `${shape.fontSize || 13}px sans-serif`;
                const lines = shape.text.split('\n');
                const lineHeight = (shape.fontSize || 13) * 1.4;
                const maxW = Math.max(...lines.map(l => this.ctx.measureText(l).width));
                const noteW = maxW + padding * 2;
                const noteH = lines.length * lineHeight + padding * 2;

                // Background
                this.ctx.fillStyle = shape.bgColor || '#fff9c4';
                this.ctx.shadowColor = 'rgba(0,0,0,0.12)';
                this.ctx.shadowBlur = 6;
                this.ctx.shadowOffsetY = 2;
                this.ctx.beginPath();
                this.ctx.roundRect(shape.x, shape.y, noteW, noteH, 6);
                this.ctx.fill();
                this.ctx.shadowColor = 'transparent';
                this.ctx.shadowBlur = 0;
                this.ctx.shadowOffsetY = 0;

                // Border
                this.ctx.strokeStyle = '#f0e68c';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();

                // Text
                this.ctx.fillStyle = shape.color || '#333';
                this.ctx.textBaseline = 'top';
                lines.forEach((line, i) => {
                    this.ctx.fillText(line, shape.x + padding, shape.y + padding + i * lineHeight);
                });
                this.ctx.textBaseline = 'alphabetic';

                // Store computed dimensions for hit testing
                shape.width = noteW;
                shape.height = noteH;
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
                const shapeAlpha = shape.opacity != null ? shape.opacity : 1;
                this.ctx.fillStyle = shape.color;
                this.ctx.globalAlpha = (shape.fillOpacity || 0.3) * shapeAlpha;
                this.ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
            } else if (shape.type === 'rotatedHighlight') {
                // Draw rotated highlight (filled polygon with opacity)
                const shapeAlpha2 = shape.opacity != null ? shape.opacity : 1;
                const points = shape.points.split(' ');
                this.ctx.fillStyle = shape.color;
                this.ctx.globalAlpha = (shape.fillOpacity || 0.3) * shapeAlpha2;
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
            } else if (shape.type === 'curve' || shape.type === 'bezier') {
                const p = new Path2D(shape.d);
                this.ctx.stroke(p);
            } else if (shape.type === 'stepmarker') {
                const r = 16;
                // Circle
                this.ctx.beginPath();
                this.ctx.arc(shape.x, shape.y, r, 0, Math.PI * 2);
                this.ctx.fillStyle = shape.color;
                this.ctx.fill();
                // Number
                this.ctx.fillStyle = '#fff';
                this.ctx.font = 'bold 14px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(String(shape.number), shape.x, shape.y);
                this.ctx.textAlign = 'start';
                this.ctx.textBaseline = 'alphabetic';
            } else if (shape.type === 'blur') {
                // Create/update real HTML blur overlay div
                let blurDiv = document.getElementById('webext-blur-' + shape._blurId);
                if (!blurDiv) {
                    shape._blurId = shape._blurId || ('b' + Math.random().toString(36).substr(2, 6));
                    blurDiv = document.createElement('div');
                    blurDiv.id = 'webext-blur-' + shape._blurId;
                    blurDiv.className = 'webext-blur-overlay';
                    document.body.appendChild(blurDiv);
                }
                blurDiv.style.cssText = `
                    position: fixed; left: ${shape.x}px; top: ${shape.y}px;
                    width: ${shape.width}px; height: ${shape.height}px;
                    backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
                    background: rgba(255,255,255,0.05);
                    z-index: ${parseInt(getComputedStyle(this.canvas).zIndex) - 1};
                    pointer-events: none; border-radius: 2px;
                `;
            } else if (shape.type === 'spotlight') {
                // Dark overlay with cutout
                const cw = this.canvas.width / (window.devicePixelRatio || 1);
                const ch = this.canvas.height / (window.devicePixelRatio || 1);
                this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
                // Top
                this.ctx.fillRect(0, 0, cw, shape.y);
                // Bottom
                this.ctx.fillRect(0, shape.y + shape.height, cw, ch - shape.y - shape.height);
                // Left
                this.ctx.fillRect(0, shape.y, shape.x, shape.height);
                // Right
                this.ctx.fillRect(shape.x + shape.width, shape.y, cw - shape.x - shape.width, shape.height);
                // Border
                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
            }
            this.ctx.globalAlpha = 1;
        });

        // Draw selection indicators
        if (this.drawingMode === 'move') {
            if (this.selectedShapes.length > 1) {
                // Draw selection border for each multi-selected shape
                this.selectedShapes.forEach(shape => {
                    const bounds = this.getShapeBounds(shape);
                    this.ctx.strokeStyle = '#007bff';
                    this.ctx.lineWidth = 1;
                    this.ctx.setLineDash([5, 5]);
                    this.ctx.strokeRect(bounds.x - 3, bounds.y - 3, bounds.width + 6, bounds.height + 6);
                    this.ctx.setLineDash([]);
                });
            } else if (this.selectedShape) {
                const bounds = this.getShapeBounds(this.selectedShape);
                this.drawResizeHandles(bounds);
            }
        }

        // Show/hide context toolbar for selected shape(s)
        const hasSelection = this.drawingMode === 'move' && (this.selectedShape || this.selectedShapes.length > 0);
        if (hasSelection) {
            this.showContextToolbar();
        } else {
            this.hideContextToolbar();
        }
    }

    showContextToolbar() {
        let bar = document.getElementById('webext-context-bar');
        const shape = this.selectedShape;
        if (!shape) { this.hideContextToolbar(); return; }

        const bounds = this.getShapeBounds(shape);
        const isVi = this.settings?.lang !== 'en';

        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'webext-context-bar';
            bar.style.cssText = `
                position: fixed; z-index: 2147483646;
                background: #f0f0f0; border-radius: 8px; padding: 3px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.18);
                border: 1px solid #d0d0d0;
                display: flex; gap: 2px;
                font-family: -apple-system, sans-serif;
            `;
            document.body.appendChild(bar);
        }

        bar.innerHTML = '';

        const actions = [
            { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>', label: isVi ? 'Nhân đôi' : 'Duplicate', action: 'duplicate' },
            { icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', label: isVi ? 'Xoá' : 'Delete', action: 'delete' }
        ];

        actions.forEach(a => {
            const btn = document.createElement('button');
            btn.innerHTML = a.icon;
            btn.title = a.label;
            btn.style.cssText = `
                display: flex; align-items: center; justify-content: center;
                width: 32px; height: 32px; border: none; background: white;
                border-radius: 6px; cursor: pointer; color: #666; transition: all 0.15s;
            `;
            btn.addEventListener('mouseenter', () => {
                btn.style.background = a.action === 'delete' ? '#fee' : '#e8e8e8';
                btn.style.color = a.action === 'delete' ? '#e53935' : '#333';
                btn.style.transform = 'scale(1.05)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'white';
                btn.style.color = '#666';
                btn.style.transform = 'scale(1)';
            });
            btn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (a.action === 'duplicate') this.duplicateSelected();
                if (a.action === 'delete') this.deleteSelectedShapes();
                this.hideContextToolbar();
            });
            bar.appendChild(btn);
        });

        // Position below the shape
        const barWidth = actions.length * 36 + 6;
        let left = bounds.x + bounds.width / 2 - barWidth / 2;
        left = Math.max(5, Math.min(left, window.innerWidth - barWidth - 5));
        let top = bounds.y + bounds.height + 10;
        if (top + 40 > window.innerHeight) top = bounds.y - 44;

        bar.style.left = left + 'px';
        bar.style.top = top + 'px';
        bar.style.display = 'flex';
    }

    hideContextToolbar() {
        const bar = document.getElementById('webext-context-bar');
        if (bar) bar.style.display = 'none';
    }

    togglePopup(type, button) {
        const colorPopup = document.getElementById('webext-color-popup');
        const shapesPopup = document.getElementById('webext-shapes-popup');
        const screenshotPopup = document.getElementById('webext-screenshot-popup');

        // Check if the popup is already open
        const isPopupOpen = (type === 'color' && colorPopup.style.display === 'block') ||
            (type === 'shapes' && shapesPopup.style.display === 'block') ||
            (type === 'screenshot' && screenshotPopup.style.display === 'block');

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

        const positionPopup = (popup) => {
            // Show popup temporarily to get its dimensions
            popup.style.visibility = 'hidden';
            popup.style.display = 'block';
            const popupHeight = popup.offsetHeight;
            const popupWidth = popup.offsetWidth;
            popup.style.visibility = '';

            if (this.pinState === 'left') {
                // Pinned left: popup shows to the right of toolbar
                popup.style.left = (buttonRect.right + 10) + 'px';
                popup.style.right = 'auto';
                const spaceBelow = window.innerHeight - buttonRect.top;
                if (spaceBelow < popupHeight) {
                    popup.style.top = Math.max(10, window.innerHeight - popupHeight - 10) + 'px';
                } else {
                    popup.style.top = buttonRect.top + 'px';
                }
            } else if (this.pinState === 'right') {
                // Pinned right: popup shows to the left of toolbar
                popup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                popup.style.left = 'auto';
                const spaceBelow = window.innerHeight - buttonRect.top;
                if (spaceBelow < popupHeight) {
                    popup.style.top = Math.max(10, window.innerHeight - popupHeight - 10) + 'px';
                } else {
                    popup.style.top = buttonRect.top + 'px';
                }
            } else {
                // Floating horizontal: popup shows above the button
                let left = buttonRect.left + (buttonRect.width / 2) - (popupWidth / 2);
                left = Math.max(10, Math.min(left, window.innerWidth - popupWidth - 10));
                popup.style.left = left + 'px';
                popup.style.right = 'auto';
                popup.style.top = (buttonRect.top - popupHeight - 10) + 'px';
            }
            popup.style.bottom = 'auto';
            popup.style.transform = 'none';
        };

        if (type === 'color') {
            positionPopup(colorPopup);
        } else if (type === 'shapes') {
            positionPopup(shapesPopup);
        } else if (type === 'screenshot') {
            positionPopup(screenshotPopup);
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

        // Update toolbar position — must use setProperty to override !important from CSS
        this.uiElement.style.setProperty('right', 'auto', 'important');
        this.uiElement.style.setProperty('bottom', 'auto', 'important');
        this.uiElement.style.setProperty('left', finalX + 'px', 'important');
        this.uiElement.style.setProperty('top', finalY + 'px', 'important');
        this.uiElement.style.setProperty('transform', 'none', 'important');

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
        const shapesPopup = document.getElementById('webext-shapes-popup');
        const screenshotPopup = document.getElementById('webext-screenshot-popup');
        const colorBtn = document.querySelector('.webext-draw-tool-btn[data-tool="color"]');
        const shapesBtn = document.querySelector('.webext-draw-tool-btn[data-tool="shapes"]');
        const screenshotBtn = document.querySelector('.webext-draw-tool-btn[data-tool="screenshot"]');
        const isPinned = this.pinState !== 'none';

        const updatePopupPosition = (popup, btn) => {
            if (!popup || popup.style.display !== 'block' || !btn) return;

            const buttonRect = btn.getBoundingClientRect();
            const popupHeight = popup.offsetHeight;
            const popupWidth = popup.offsetWidth;

            if (!isPinned) {
                // Toolbar is horizontal — show popup above
                let left = buttonRect.left + (buttonRect.width / 2) - (popupWidth / 2);
                left = Math.max(10, Math.min(left, window.innerWidth - popupWidth - 10));
                popup.style.left = left + 'px';
                popup.style.right = 'auto';
                popup.style.top = (buttonRect.top - popupHeight - 10) + 'px';
            } else if (isToolbarLeft) {
                popup.style.left = (buttonRect.right + 10) + 'px';
                popup.style.right = 'auto';
                const spaceBelow = window.innerHeight - buttonRect.top;
                if (spaceBelow < popupHeight) {
                    popup.style.top = Math.max(10, window.innerHeight - popupHeight - 10) + 'px';
                } else {
                    popup.style.top = buttonRect.top + 'px';
                }
            } else {
                popup.style.right = (window.innerWidth - buttonRect.left + 10) + 'px';
                popup.style.left = 'auto';
                const spaceBelow = window.innerHeight - buttonRect.top;
                if (spaceBelow < popupHeight) {
                    popup.style.top = Math.max(10, window.innerHeight - popupHeight - 10) + 'px';
                } else {
                    popup.style.top = buttonRect.top + 'px';
                }
            }
            popup.style.bottom = 'auto';
            popup.style.transform = 'none';
        };

        updatePopupPosition(colorPopup, colorBtn);
        updatePopupPosition(shapesPopup, shapesBtn);
        updatePopupPosition(screenshotPopup, screenshotBtn);
    }

    closeAllPopups() {
        const colorPopup = document.getElementById('webext-color-popup');
        const shapesPopup = document.getElementById('webext-shapes-popup');
        const screenshotPopup = document.getElementById('webext-screenshot-popup');
        if (colorPopup) colorPopup.style.display = 'none';
        if (shapesPopup) shapesPopup.style.display = 'none';
        if (screenshotPopup) screenshotPopup.style.display = 'none';
        if (colorPopup) colorPopup.style.transform = '';
        if (shapesPopup) shapesPopup.style.transform = '';
        if (screenshotPopup) screenshotPopup.style.transform = '';
        // Remove active state from all tool buttons
        document.querySelectorAll('.webext-draw-tool-btn').forEach(btn => {
            btn.classList.remove('popup-active');
        });
    }


    updateCursor() {
        if (!this.isEnabled) {
            this.canvas.style.cursor = 'default';
            this.canvas.style.pointerEvents = 'none';
            return;
        }

        if (this.drawingMode === 'cursor') {
            // Cursor mode: let clicks pass through to the page
            this.canvas.style.pointerEvents = 'none';
            this.canvas.style.cursor = 'default';
            return;
        }

        // All other tools: canvas captures events
        this.canvas.style.pointerEvents = 'auto';

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
            case 'ruler':
                this.canvas.style.cursor = 'crosshair';
                break;
            default:
                this.canvas.style.cursor = 'crosshair';
        }
    }

    startScreenshotMode(includeDrawing = false) {
        // Hide toolbar temporarily
        const toolbar = document.querySelector('.webext-draw-toolbar');
        const originalToolbarDisplay = toolbar ? toolbar.style.display : '';
        if (toolbar) toolbar.style.display = 'none';
        
        // Hide canvas and SVG only if not including drawing
        const originalCanvasDisplay = this.canvas.style.display;
        const originalSvgDisplay = this.svgOverlay.style.display;
        if (!includeDrawing) {
            this.canvas.style.display = 'none';
            this.svgOverlay.style.display = 'none';
        }

        // Create screenshot overlay
        const overlay = document.createElement('div');
        overlay.id = 'webext-screenshot-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.3);
            cursor: crosshair;
            z-index: 10000001;
        `;

        // Create selection box
        const selectionBox = document.createElement('div');
        selectionBox.id = 'webext-screenshot-selection';
        selectionBox.style.cssText = `
            position: fixed;
            border: 2px dashed #fff;
            background: rgba(255, 255, 255, 0.1);
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
            display: none;
            z-index: 10000002;
            pointer-events: none;
        `;

        // Create instruction text
        const instruction = document.createElement('div');
        instruction.id = 'webext-screenshot-instruction';
        instruction.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000003;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        instruction.textContent = 'Drag to select capture area. Press ESC to cancel.';

        document.body.appendChild(overlay);
        document.body.appendChild(selectionBox);
        document.body.appendChild(instruction);

        let startX, startY, isSelecting = false;

        const onMouseDown = (e) => {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;
            selectionBox.style.left = startX + 'px';
            selectionBox.style.top = startY + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
            selectionBox.style.display = 'block';
        };

        const onMouseMove = (e) => {
            if (!isSelecting) return;
            
            const currentX = e.clientX;
            const currentY = e.clientY;
            
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            
            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        };

        const onMouseUp = async (e) => {
            if (!isSelecting) return;
            isSelecting = false;

            const currentX = e.clientX;
            const currentY = e.clientY;
            
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            // Cleanup overlay elements
            overlay.remove();
            selectionBox.remove();
            instruction.remove();

            // Remove event listeners
            document.removeEventListener('mousedown', onMouseDown);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('keydown', onKeyDown);

            // Only capture if selection is meaningful
            if (width > 10 && height > 10) {
                // Small delay to ensure overlay is removed
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Capture screenshot
                await this.captureScreenshotRegion(left, top, width, height);
            }

            // Restore toolbar and canvas
            if (toolbar) toolbar.style.display = originalToolbarDisplay;
            this.canvas.style.display = originalCanvasDisplay;
            this.svgOverlay.style.display = originalSvgDisplay;
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                // Cleanup
                overlay.remove();
                selectionBox.remove();
                instruction.remove();
                document.removeEventListener('mousedown', onMouseDown);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                document.removeEventListener('keydown', onKeyDown);

                // Restore toolbar and canvas
                if (toolbar) toolbar.style.display = originalToolbarDisplay;
                this.canvas.style.display = originalCanvasDisplay;
                this.svgOverlay.style.display = originalSvgDisplay;
            }
        };

        overlay.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('keydown', onKeyDown);
    }

    async captureScreenshotRegion(x, y, width, height) {
        try {
            // Use chrome.tabs.captureVisibleTab via background script
            const response = await chrome.runtime.sendMessage({
                action: 'captureScreenshot'
            });

            if (response && response.dataUrl) {
                // Create image from captured screenshot
                const img = new Image();
                img.onload = () => {
                    // Create canvas to crop the region
                    const cropCanvas = document.createElement('canvas');
                    const dpr = window.devicePixelRatio || 1;
                    cropCanvas.width = width * dpr;
                    cropCanvas.height = height * dpr;
                    const cropCtx = cropCanvas.getContext('2d');

                    // Draw cropped region
                    cropCtx.drawImage(
                        img,
                        x * dpr, y * dpr, width * dpr, height * dpr,
                        0, 0, width * dpr, height * dpr
                    );

                    // Convert to blob and download
                    cropCanvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `screenshot-${Date.now()}.png`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                    }, 'image/png');
                };
                img.src = response.dataUrl;
            } else {
                console.error('Failed to capture screenshot:', response?.error);
                alert('Screenshot failed. Please try again.');
            }
        } catch (error) {
            console.error('Screenshot error:', error);
            alert('Screenshot failed. Please try again.');
        }
    }

    async captureFullScreen(includeDrawing = false) {
        // Hide toolbar temporarily
        const toolbar = document.querySelector('.webext-draw-toolbar');
        const originalToolbarDisplay = toolbar ? toolbar.style.display : '';
        if (toolbar) toolbar.style.display = 'none';
        
        // Hide canvas and SVG only if not including drawing
        const originalCanvasDisplay = this.canvas.style.display;
        const originalSvgDisplay = this.svgOverlay.style.display;
        if (!includeDrawing) {
            this.canvas.style.display = 'none';
            this.svgOverlay.style.display = 'none';
        }

        // Small delay to ensure elements are hidden
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'captureScreenshot'
            });

            if (response && response.dataUrl) {
                // Download full screenshot directly
                const a = document.createElement('a');
                a.href = response.dataUrl;
                a.download = `screenshot-fullscreen-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                console.error('Failed to capture screenshot:', response?.error);
                alert('Screenshot failed. Please try again.');
            }
        } catch (error) {
            console.error('Screenshot error:', error);
            alert('Screenshot failed. Please try again.');
        }

        // Restore toolbar and canvas
        if (toolbar) toolbar.style.display = originalToolbarDisplay;
        this.canvas.style.display = originalCanvasDisplay;
        this.svgOverlay.style.display = originalSvgDisplay;
    }

}

if (!window._drawLiteInstance) {
    window._drawLiteInstance = new WebDrawingExtension();
}