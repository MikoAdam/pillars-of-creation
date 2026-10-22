/**
 * Pillars of Creation Maps - Context Menu
 * Smart defaults + expandable options for every map action
 */

class ContextMenu {
    constructor(editor, getZoom, app) {
        this.editor = editor;
        this.getZoom = getZoom;
        this.app = app;
        this.element = document.getElementById('contextMenu');
        this.titleElement = document.getElementById('menuTitle');

        // State
        this.selectedFeature = null;
        this.selectedColor = 'blue';
        this.selectedAnimation = 'pulse';
        this.clickLngLat = null;

        // Arrow editing state
        this._selectedArrow = null;

        // Two-step flow state (attack arrows + connection lines)
        this._flowType = null;     // 'attack' | 'line' | null
        this._flowFrom = null;
        this._flowFromCoord = null;
        this._flowFromLabel = null;
        this._flowColor = null;
        this._flowCurve = 0.15;
        this._flowWidth = 1;
        this._flowHeadSize = 1;
        this._flowDuration = 800;

        // Expanded sections persistence
        this._expandedSections = JSON.parse(localStorage.getItem('poc-ctx-sections') || '{}');

        // Initialize
        this.setupColorPalette();
        this.setupAnimationPills();
        this.setupEventDelegation();
        this.setupCloseHandler();
        this.setupKeyboardShortcuts();
        this.setupEffectPicker();
    }

    // ─── Setup ───

    setupColorPalette() {
        const palette = document.getElementById('colorPalette');
        if (!palette) return;
        palette.innerHTML = '';

        // ── Active color indicator bar ──
        const activeBar = document.createElement('div');
        activeBar.className = 'color-active-bar';
        const activePreview = document.createElement('div');
        activePreview.className = 'color-active-preview';
        activePreview.style.background = CONFIG.colors.blue;
        const activeLabel = document.createElement('span');
        activeLabel.className = 'color-active-label';
        activeLabel.textContent = 'blue';
        activeBar.appendChild(activePreview);
        activeBar.appendChild(activeLabel);
        palette.appendChild(activeBar);
        this._activePreview = activePreview;
        this._activeLabel = activeLabel;

        // ── Preset swatches ──
        const swatchRow = document.createElement('div');
        swatchRow.className = 'color-swatch-row';
        Object.entries(CONFIG.colors).forEach(([name, hex]) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch' + (name === 'blue' ? ' selected' : '');
            swatch.style.background = hex;
            swatch.title = name;
            swatch.dataset.color = name;
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectColor(name, swatch);
            });
            swatchRow.appendChild(swatch);
        });

        // "+" toggle
        const customToggle = document.createElement('button');
        customToggle.className = 'color-picker-toggle';
        customToggle.textContent = '+';
        customToggle.title = 'Custom color';
        swatchRow.appendChild(customToggle);
        palette.appendChild(swatchRow);

        // ── History row (recently used custom colors) ──
        const historyRow = document.createElement('div');
        historyRow.className = 'color-history-row';
        historyRow.style.display = 'none';
        palette.appendChild(historyRow);
        this._colorHistoryRow = historyRow;
        this._colorHistory = JSON.parse(localStorage.getItem('poc-color-history') || '[]');
        this._renderColorHistory();

        // ── Custom color panel: 2D area + hue slider + hex input ──
        const customPanel = document.createElement('div');
        customPanel.className = 'color-custom-panel';
        customPanel.style.display = 'none';

        // Saturation-Lightness canvas (2D)
        const slCanvas = document.createElement('canvas');
        slCanvas.className = 'color-sl-canvas';
        slCanvas.width = 220;
        slCanvas.height = 100;
        this._slCanvas = slCanvas;
        this._currentHue = 0;
        this._currentSat = 1;
        this._currentLight = 0.5;

        // Hue spectrum slider
        const hueSlider = document.createElement('input');
        hueSlider.type = 'range';
        hueSlider.className = 'color-hue-slider';
        hueSlider.min = 0;
        hueSlider.max = 360;
        hueSlider.value = 0;

        // Preview + hex input row
        const previewRow = document.createElement('div');
        previewRow.className = 'color-preview-row';
        const hexInput = document.createElement('input');
        hexInput.type = 'text';
        hexInput.className = 'color-hex-input';
        hexInput.value = '#ff0000';
        hexInput.maxLength = 7;
        hexInput.placeholder = '#ff0000';
        previewRow.appendChild(hexInput);

        customPanel.appendChild(slCanvas);
        customPanel.appendChild(hueSlider);
        customPanel.appendChild(previewRow);
        palette.parentNode.insertBefore(customPanel, palette.nextSibling);

        // ── HSL helpers ──
        const hslToHex = (h, s, l) => {
            const c = (1 - Math.abs(2 * l - 1)) * s;
            const x = c * (1 - Math.abs((h / 60) % 2 - 1));
            const m = l - c / 2;
            let r, g, b;
            if (h < 60) { r = c; g = x; b = 0; }
            else if (h < 120) { r = x; g = c; b = 0; }
            else if (h < 180) { r = 0; g = c; b = x; }
            else if (h < 240) { r = 0; g = x; b = c; }
            else if (h < 300) { r = x; g = 0; b = c; }
            else { r = c; g = 0; b = x; }
            const toH = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
            return `#${toH(r)}${toH(g)}${toH(b)}`;
        };

        const drawSLCanvas = (hue) => {
            const ctx = slCanvas.getContext('2d');
            const w = slCanvas.width, h = slCanvas.height;
            const imgData = ctx.createImageData(w, h);
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const sat = x / (w - 1);
                    const light = 1 - y / (h - 1);
                    const hex = hslToHex(hue, sat, light);
                    const i = (y * w + x) * 4;
                    imgData.data[i] = parseInt(hex.slice(1, 3), 16);
                    imgData.data[i + 1] = parseInt(hex.slice(3, 5), 16);
                    imgData.data[i + 2] = parseInt(hex.slice(5, 7), 16);
                    imgData.data[i + 3] = 255;
                }
            }
            ctx.putImageData(imgData, 0, 0);
            // Draw crosshair at current position
            const cx = Math.round(this._currentSat * (w - 1));
            const cy = Math.round((1 - this._currentLight) * (h - 1));
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
        };

        const applyCustomColor = (hex) => {
            this._lastCustomColor = hex;
            hexInput.value = hex;
            this.selectColor(hex, null);
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        };

        const pickFromCanvas = (e) => {
            const rect = slCanvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            this._currentSat = x;
            this._currentLight = 1 - y;
            const hex = hslToHex(this._currentHue, this._currentSat, this._currentLight);
            drawSLCanvas(this._currentHue);
            applyCustomColor(hex);
        };

        // Canvas mouse interaction
        let canvasDragging = false;
        slCanvas.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            canvasDragging = true;
            pickFromCanvas(e);
        });
        document.addEventListener('mousemove', (e) => {
            if (canvasDragging) pickFromCanvas(e);
        });
        document.addEventListener('mouseup', () => {
            if (canvasDragging) canvasDragging = false;
        });

        // Toggle expand/collapse
        customToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = customPanel.style.display !== 'none';
            customPanel.style.display = isOpen ? 'none' : 'block';
            customToggle.classList.toggle('open', !isOpen);
            if (!isOpen) {
                // Sync canvas internal size to actual display size
                requestAnimationFrame(() => {
                    const rect = slCanvas.getBoundingClientRect();
                    slCanvas.width = Math.round(rect.width);
                    slCanvas.height = Math.round(rect.height);
                    drawSLCanvas(this._currentHue);
                });
            }
        });

        // Hue slider
        hueSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            this._currentHue = parseInt(e.target.value);
            drawSLCanvas(this._currentHue);
            applyCustomColor(hslToHex(this._currentHue, this._currentSat, this._currentLight));
        });

        // Hex input
        hexInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                const v = hexInput.value.trim();
                if (/^#[0-9a-f]{6}$/i.test(v)) applyCustomColor(v);
            }
            e.stopPropagation();
        });
        hexInput.addEventListener('blur', () => {
            const v = hexInput.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(v)) applyCustomColor(v);
        });
        hexInput.addEventListener('click', (e) => e.stopPropagation());

        // Initial draw
        drawSLCanvas(0);
    }

    /** Call when a color is committed to the script (applied) */
    _commitColorToHistory() {
        const c = this.selectedColor;
        if (c && c.startsWith('#') && !CONFIG.colors[c]) this._addColorHistory(c);
    }

    _addColorHistory(hex) {
        if (!hex || !hex.startsWith('#')) return;
        this._colorHistory = this._colorHistory.filter(c => c !== hex);
        this._colorHistory.unshift(hex);
        if (this._colorHistory.length > 8) this._colorHistory.pop();
        localStorage.setItem('poc-color-history', JSON.stringify(this._colorHistory));
        this._renderColorHistory();
    }

    _renderColorHistory() {
        const row = this._colorHistoryRow;
        if (!row) return;
        row.innerHTML = '';
        if (this._colorHistory.length === 0) {
            row.style.display = 'none';
            return;
        }
        row.style.display = 'flex';
        this._colorHistory.forEach(hex => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch color-history-swatch';
            swatch.style.background = hex;
            swatch.title = hex;
            swatch.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectColor(hex, null);
                document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
                swatch.classList.add('selected');
            });
            row.appendChild(swatch);
        });
    }

    setupAnimationPills() {
        const container = document.getElementById('animPills');
        if (!container) return;
        container.querySelectorAll('.anim-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectAnimation(pill.dataset.anim);
            });
        });
    }

    setupEventDelegation() {
        this.element.addEventListener('click', (e) => {
            // more buttons toggle option panels (check BEFORE data-action to prevent bubbling)
            const moreBtn = e.target.closest('.ctx-more-btn');
            if (moreBtn) {
                e.stopPropagation();
                const panelId = moreBtn.dataset.panel;
                this.toggleOptionsPanel(panelId);
                return;
            }

            // data-action items
            const actionEl = e.target.closest('[data-action]');
            if (actionEl) {
                const action = actionEl.dataset.action;
                if (action && typeof this[action] === 'function') {
                    e.stopPropagation();
                    this[action]();
                    return;
                }
            }

            // Arrow animation pill toggles
            const arrowAnimPill = e.target.closest('.arrow-anim-pill');
            if (arrowAnimPill) {
                e.stopPropagation();
                document.querySelectorAll('.arrow-anim-pill').forEach(p => p.classList.remove('selected'));
                arrowAnimPill.classList.add('selected');
                return;
            }

            // Radio pill toggles
            const pill = e.target.closest('.ctx-radio-pill');
            if (pill) {
                e.stopPropagation();
                const group = pill.closest('.ctx-radio-group');
                if (group) {
                    group.querySelectorAll('.ctx-radio-pill').forEach(p => p.classList.remove('selected'));
                    pill.classList.add('selected');
                }
                return;
            }
        });

        // Range slider live updates
        this.element.addEventListener('input', (e) => {
            if (e.target.matches('.ctx-range')) {
                const valueDisplay = e.target.closest('.ctx-range-row')?.querySelector('.ctx-range-value');
                if (valueDisplay) valueDisplay.textContent = parseFloat(e.target.value).toFixed(2);
                // Auto-apply when editing an existing arrow
                if (this._selectedArrow && (e.target.id === 'editArrowWidth' || e.target.id === 'editArrowHeadSize' || e.target.id === 'editArrowDuration')) {
                    this._autoApplyArrowEdit();
                }
                // Auto-apply when editing an existing effect's size
                if (this._selectedEffectMarker && e.target.id === 'editEffectSize') {
                    this._autoApplyEffectSize();
                }
            }
        });

        // Enter key in text inputs
        this.element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.matches('.ctx-inline-input')) {
                e.preventDefault();
                e.stopPropagation();
                const panel = e.target.closest('.ctx-options');
                const submitBtn = panel ? panel.querySelector('[data-action]') : null;
                if (submitBtn) {
                    const action = submitBtn.dataset.action;
                    if (typeof this[action] === 'function') this[action]();
                }
            }
            if (e.key === 'Escape' && e.target.matches('.ctx-inline-input')) {
                e.preventDefault();
                e.stopPropagation();
                this.closeAllPanels();
            }
        });

        // Draggable menu via header
        this.setupDraggable();
    }

    setupDraggable() {
        const header = this.element.querySelector('.context-menu-header');
        if (!header) return;
        let isDragging = false, startX, startY, origLeft, origTop;

        header.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = this.element.getBoundingClientRect();
            origLeft = rect.left;
            origTop = rect.top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            this.element.style.left = (origLeft + dx) + 'px';
            this.element.style.top = (origTop + dy) + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    setupCollapsibleSections() {
        this.element.querySelectorAll('.ctx-section-header[data-section]').forEach(header => {
            const section = header.dataset.section;
            const body = this.element.querySelector(`.ctx-section-body[data-section="${section}"]`);
            if (!body) return;

            if (this._expandedSections[section]) {
                header.classList.add('expanded');
                body.style.display = 'block';
            }

            header.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = header.classList.toggle('expanded');
                body.style.display = isExpanded ? 'block' : 'none';
                this._expandedSections[section] = isExpanded;
                localStorage.setItem('poc-ctx-sections', JSON.stringify(this._expandedSections));
            });
        });
    }

    setupCloseHandler() {
        document.addEventListener('click', (e) => {
            if (!this.element.contains(e.target)) {
                this.close();
            }
        });
        this.element.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (!this.element.classList.contains('visible')) return;
            if (e.target.matches('input, textarea, select')) {
                if (e.key === 'Escape') { this.closeAllPanels(); e.preventDefault(); }
                return;
            }

            // Arrow edit mode shortcuts
            if (this._selectedArrow && !this._flowType) {
                switch (e.key) {
                    case 'Enter': case 'Escape': this.close(); e.preventDefault(); return;
                    case 'Delete': case 'Backspace': this.deleteArrow(); e.preventDefault(); return;
                    case 'r': case 'R': this.reverseArrow(); e.preventDefault(); return;
                }
                return;
            }

            // Effect edit mode shortcuts
            if (this._selectedEffectMarker && !this._flowType) {
                switch (e.key) {
                    case 'Enter': case 'Escape': this.close(); e.preventDefault(); return;
                    case 'Delete': case 'Backspace': this.deleteEffect(); e.preventDefault(); return;
                }
                return;
            }

            switch (e.key) {
                case 'Enter': this.defaultAction(); e.preventDefault(); break;
                case 'Escape': this.close(); e.preventDefault(); break;
                case '1': this.selectAnimation('pulse'); e.preventDefault(); break;
                case '2': this.selectAnimation('fade'); e.preventDefault(); break;
                case '3': this.selectAnimation('radial'); e.preventDefault(); break;
                case '4': this.selectAnimation('sweep'); e.preventDefault(); break;
                case '5': this.selectAnimation('occupied'); e.preventDefault(); break;
                case 'a': case 'A': this.startAttackArrow(); e.preventDefault(); break;
                case 'l': case 'L': this.startLine(); e.preventDefault(); break;
                case 'b': case 'B': this.toggleOptionsPanel('bubbleOpts'); e.preventDefault(); break;
                case 'f': case 'F': this.addFly(); e.preventDefault(); break;
                case 'z': case 'Z': if (this.selectedFeature) { this.addZoom(); e.preventDefault(); } break;
                case 'c': case 'C': this.addCinematic(); e.preventDefault(); break;
                case 'Delete': case 'Backspace': this.removeLast(); e.preventDefault(); break;
            }
        });
    }

    setupEffectPicker() {
        const cats = EffectsLibrary.getCategories();
        let html = '';
        for (const [cat, effects] of Object.entries(cats)) {
            html += `<div class="fx-cat-label">${cat}</div><div class="fx-cat-row">`;
            for (const fx of effects) {
                html += `<button class="fx-pick-btn" data-effect="${fx.name}" title="${fx.label}">${fx.svg}</button>`;
            }
            html += '</div>';
        }

        // Main picker — clicking a button immediately places the effect on the map
        const picker = document.getElementById('effectPicker');
        if (picker) {
            picker.innerHTML = html;
            picker.addEventListener('click', (e) => {
                const btn = e.target.closest('.fx-pick-btn');
                if (!btn) return;
                e.stopPropagation();
                picker.querySelectorAll('.fx-pick-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                // Place immediately
                this._placeEffect(btn.dataset.effect);
            });
        }

        // Edit picker (for changing effect type on existing)
        const editPicker = document.getElementById('effectPickerEdit');
        if (editPicker) {
            editPicker.innerHTML = html;
            editPicker.addEventListener('click', (e) => {
                const btn = e.target.closest('.fx-pick-btn');
                if (!btn) return;
                e.stopPropagation();
                editPicker.querySelectorAll('.fx-pick-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                // Auto-apply type change
                this._changeEffectType(btn.dataset.effect);
            });
        }
    }

    // ─── Show / Close ───

    show(event, feature, lngLat, arrowHit = null, effectMarker = null) {
        this.selectedFeature = feature;
        this.clickLngLat = lngLat;
        this._selectedArrow = arrowHit;
        this._selectedEffectMarker = effectMarker;
        this.closeAllPanels();

        // Title
        if (effectMarker && !this._flowType) {
            const el = effectMarker.getElement();
            const name = el.dataset.effectName || 'symbol';
            const def = EffectsLibrary.EFFECTS[name];
            this.titleElement.textContent = `Symbol: ${def ? def.label : name}`;
        } else if (arrowHit && !this._flowType) {
            const a = arrowHit.arrow;
            const fromLabel = a.meta?.fromName || 'start';
            const toLabel = a.meta?.toName || 'end';
            this.titleElement.textContent = `Arrow: ${fromLabel} \u2192 ${toLabel}`;
        } else if (feature) {
            this.titleElement.textContent = feature.type === 'region'
                ? `${feature.name}, ${feature.country}`
                : feature.name;
        } else {
            this.titleElement.textContent = `${lngLat.lat.toFixed(2)}, ${lngLat.lng.toFixed(2)}`;
        }

        const hasFeature = !!feature;
        const isRegion = feature?.type === 'region';
        const inFlow = !!this._flowType;
        const editingArrow = !!arrowHit && !inFlow && !effectMarker;
        const editingEffect = !!effectMarker && !inFlow;

        // Section visibility
        this._setVisible('.ctx-section-anim', hasFeature && !inFlow && !editingArrow && !editingEffect);
        this._setVisible('.ctx-section-normal', !inFlow && !editingArrow && !editingEffect);
        this._setVisible('.ctx-section-flow', inFlow);
        this._setVisible('.ctx-section-arrow-edit', editingArrow);
        this._setVisible('.ctx-section-effect-edit', editingEffect);


        // Country is always the default action (Enter key). Region shows additionally when available.
        const showCountry = hasFeature && !inFlow && !editingArrow && !editingEffect;
        const showRegion = isRegion && !inFlow && !editingArrow && !editingEffect;
        this._setVisible('#menuColorCountry', showCountry);
        this._setVisible('#menuColorRegion', showRegion);

        this.element.querySelectorAll('.ctx-needs-feature').forEach(el => {
            if (el.id === 'menuColorCountry') return; // handled above
            el.style.display = hasFeature ? '' : 'none';
        });

        // Set region/country names in menu items
        const regionLabel = document.getElementById('regionLabel');
        const countryLabel = document.getElementById('countryLabel');
        if (regionLabel) {
            regionLabel.textContent = isRegion ? `Color ${feature.name}` : 'Color region';
        }
        if (countryLabel) {
            const cName = isRegion ? (feature.country || feature.countryName) : (feature ? feature.name : '');
            countryLabel.textContent = cName ? `Color ${cName}` : 'Color country';
        }

        // Update region/country labels with actual names

        // Flow completion label
        if (inFlow) {
            const targetName = feature
                ? (feature.type === 'region' ? feature.country : feature.name)
                : `${lngLat.lat.toFixed(1)}, ${lngLat.lng.toFixed(1)}`;
            const typeLabel = this._flowType === 'attack' ? 'Arrow' : 'Line';
            const flowLabelEl = this.element.querySelector('.ctx-flow-label');
            if (flowLabelEl) flowLabelEl.textContent = `Complete ${typeLabel.toLowerCase()} to ${targetName}`;
            const flowHeaderEl = this.element.querySelector('.ctx-flow-header');
            if (flowHeaderEl) flowHeaderEl.textContent = `${typeLabel}: ${this._flowFromLabel} \u2192 ${targetName}`;
        }

        // Pre-fill inline inputs
        const defaultText = feature ? feature.name : 'Label';
        ['bubbleTextInput', 'arrowLabelTextInput', 'labelTextInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = defaultText;
        });

        // Pre-fill arrow edit controls
        if (editingArrow) {
            const a = arrowHit.arrow;
            const editWidth = document.getElementById('editArrowWidth');
            const editHead = document.getElementById('editArrowHeadSize');
            const editDuration = document.getElementById('editArrowDuration');
            if (editWidth) { editWidth.value = a.width || 1; editWidth.nextElementSibling.textContent = (a.width || 1).toFixed(2); }
            if (editHead) { editHead.value = a.headSize ?? (a.width || 1); editHead.nextElementSibling.textContent = (a.headSize ?? (a.width || 1)).toFixed(2); }
            if (editDuration) { editDuration.value = a.drawDuration || 800; editDuration.nextElementSibling.textContent = (a.drawDuration || 800); }
            const colorName = Object.entries(CONFIG.colors).find(([, hex]) => hex === a.color);
            if (colorName) this.selectColor(colorName[0], document.querySelector(`.color-swatch[data-color="${colorName[0]}"]`));
        }

        // Pre-fill effect edit controls
        if (editingEffect) {
            const el = effectMarker.getElement();
            const currentType = el.dataset.effectName;
            const currentColor = el.dataset.effectColor;
            const currentSize = parseFloat(el.dataset.effectSize) || 1.5;
            // Highlight current type in edit picker
            const editPicker = document.getElementById('effectPickerEdit');
            if (editPicker) {
                editPicker.querySelectorAll('.fx-pick-btn').forEach(b => {
                    b.classList.toggle('selected', b.dataset.effect === currentType);
                });
            }
            // Select matching color swatch
            if (currentColor) {
                const swatch = document.querySelector(`.color-swatch[data-color="${currentColor}"]`);
                if (swatch) this.selectColor(currentColor, swatch);
            }
            // Set size slider
            const editSize = document.getElementById('editEffectSize');
            if (editSize) { editSize.value = currentSize; editSize.nextElementSibling.textContent = currentSize.toFixed(2); }
        }

        // Position menu — place off-screen first so layout can compute size
        this.element.style.maxHeight = '';
        this.element.style.left = '-9999px';
        this.element.style.top = '-9999px';
        this.element.classList.add('visible');

        // Clamp max-height to available space below click, or reposition upward
        const cx = event.clientX;
        const cy = event.clientY;

        // Double-rAF ensures layout is fully computed before measuring
        requestAnimationFrame(() => { requestAnimationFrame(() => {
            const rect = this.element.getBoundingClientRect();
            let x = cx;
            let y = cy;

            // Horizontal clamp
            if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
            if (x < 8) x = 8;

            // Vertical: prefer below cursor, scroll if needed
            const spaceBelow = window.innerHeight - cy - 8;
            const spaceAbove = cy - 8;

            if (rect.height <= spaceBelow) {
                // Fits below cursor
                y = cy;
            } else if (rect.height <= spaceAbove) {
                // Fits above cursor
                y = cy - rect.height;
            } else {
                // Doesn't fit either way — clamp to viewport and rely on overflow scroll
                y = 8;
                this.element.style.maxHeight = (window.innerHeight - 16) + 'px';
            }

            this.element.style.left = x + 'px';
            this.element.style.top = y + 'px';
        }); });
    }

    close() {
        this.element.classList.remove('visible');
        this._selectedArrow = null;
        this._selectedEffectMarker = null;
        this.closeAllPanels();
    }

    // ─── Selection ───

    selectColor(name, swatch) {
        this.selectedColor = name;
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        if (swatch) swatch.classList.add('selected');
        // Update active color indicator bar
        const hex = CONFIG.colors[name] || name;
        if (this._activePreview) this._activePreview.style.background = hex;
        if (this._activeLabel) this._activeLabel.textContent = CONFIG.colors[name] ? name : hex;
        // Auto-apply color change when editing an existing arrow
        if (this._selectedArrow) {
            this._autoApplyArrowEdit();
        }
        // Auto-apply color change when editing an existing effect
        if (this._selectedEffectMarker) {
            this._autoApplyEffectColor();
        }
    }

    _autoApplyEffectColor() {
        if (!this._selectedEffectMarker) return;
        const el = this._selectedEffectMarker.getElement();
        const colorHex = CONFIG.colors[this.selectedColor] || this.selectedColor;
        el.style.color = colorHex;
        el.dataset.effectColor = this.selectedColor;
    }

    _autoApplyEffectSize() {
        if (!this._selectedEffectMarker) return;
        const el = this._selectedEffectMarker.getElement();
        const sizeEl = document.getElementById('editEffectSize');
        if (!sizeEl) return;
        const size = parseFloat(sizeEl.value);
        el.dataset.effectSize = size;
        // Apply zoom-compensated size (same formula as renderer.updateSymbolSizes)
        const scale = Math.max(0.5, Math.min(3, size));
        const zoom = this.app.renderer.map.getZoom();
        const zoomFactor = Math.max(0.4, Math.min(2.0, Math.pow(2, (zoom - 4) * 0.25)));
        const px = Math.round(48 * scale * zoomFactor);
        el.style.width = px + 'px';
        el.style.height = px + 'px';
    }

    selectAnimation(anim) {
        this.selectedAnimation = anim;
        document.querySelectorAll('.anim-pill').forEach(p => p.classList.remove('selected'));
        const pill = document.querySelector(`.anim-pill[data-anim="${anim}"]`);
        if (pill) pill.classList.add('selected');
    }

    // ─── Default Action ───

    defaultAction() {
        if (this._flowType) {
            this.completeFlow();
            return;
        }
        if (this.selectedFeature) {
            // Country is always the default action (Enter key)
            this.addCountry();
        } else {
            this.toggleOptionsPanel('bubbleOpts');
        }
    }

    // ─── Territory Actions ───

    addRegion() {
        this.close();
        if (!this.selectedFeature) return;
        const colorHex = CONFIG.colors[this.selectedColor] || this.selectedColor;
        const anim = this.selectedAnimation;
        let line;
        if (this.selectedFeature.type === 'region') {
            line = `region: ${this.selectedFeature.name}, ${this.selectedFeature.country}, ${this.selectedColor}`;
            if (anim === 'occupied') line += ', occupied';
            const f = this.app.geoData.findRegion(this.selectedFeature.name, this.selectedFeature.country);
            if (f) this.app.renderer.drawFeature(f, colorHex, anim === 'occupied' ? 'occupied' : anim);
        } else {
            line = `${this.selectedFeature.name.toLowerCase()}: ${this.selectedColor}`;
            if (anim && anim !== 'none') line += `, ${anim}`;
            const f = this.app.geoData.findCountry(this.selectedFeature.name);
            if (f) this.app.renderer.drawFeature(f, colorHex, anim);
        }
        this.editor.insert(line);
        this._commitColorToHistory();
    }

    addCountry() {
        this.close();
        if (!this.selectedFeature) return;
        const name = this.selectedFeature.type === 'region'
            ? this.selectedFeature.country
            : this.selectedFeature.name;
        const colorHex = CONFIG.colors[this.selectedColor] || this.selectedColor;
        const anim = this.selectedAnimation;
        let line = `${name.toLowerCase()}: ${this.selectedColor}`;
        if (anim && anim !== 'none') line += `, ${anim}`;
        const f = this.app.geoData.findCountry(name);
        if (f) this.app.renderer.drawFeature(f, colorHex, anim);
        this.editor.insert(line);
        this._commitColorToHistory();
    }

    // ─── Attack Arrow Flow ───

    startAttackArrow() {
        this.close();
        if (!this.selectedFeature && !this.clickLngLat) return;

        // Read draw duration from arrow panel
        const durationEl = document.getElementById('arrowDurationRange');
        const duration = durationEl ? parseInt(durationEl.value) : 800;

        let fromScript, fromLabel, fromCoord;
        if (this.selectedFeature) {
            const name = this.selectedFeature.type === 'region'
                ? this.selectedFeature.country
                : this.selectedFeature.name;
            fromScript = name;
            fromLabel = name;
        } else {
            fromScript = `${this.clickLngLat.lat.toFixed(2)} ${this.clickLngLat.lng.toFixed(2)}`;
            fromLabel = `${this.clickLngLat.lat.toFixed(1)}, ${this.clickLngLat.lng.toFixed(1)}`;
            fromCoord = [this.clickLngLat.lng, this.clickLngLat.lat];
        }

        this._flowType = 'attack';
        this._flowFrom = fromScript;
        this._flowFromCoord = fromCoord || null;
        this._flowFromLabel = fromLabel;
        this._flowColor = this.selectedColor;
        this._flowCurve = 0.15;
        this._flowWidth = 1;
        this._flowHeadSize = 1;
        this._flowDuration = duration;

        const indicator = document.getElementById('attackIndicator');
        if (indicator) {
            indicator.style.display = 'block';
            indicator.querySelector('.attack-from-name').textContent = fromLabel;
        }
    }

    startLine() {
        this.close();
        if (!this.selectedFeature && !this.clickLngLat) return;

        let fromScript, fromLabel, fromCoord;
        if (this.selectedFeature) {
            const name = this.selectedFeature.type === 'region'
                ? this.selectedFeature.country
                : this.selectedFeature.name;
            fromScript = name;
            fromLabel = name;
        } else {
            fromScript = `${this.clickLngLat.lat.toFixed(2)} ${this.clickLngLat.lng.toFixed(2)}`;
            fromLabel = `${this.clickLngLat.lat.toFixed(1)}, ${this.clickLngLat.lng.toFixed(1)}`;
            fromCoord = [this.clickLngLat.lng, this.clickLngLat.lat];
        }

        this._flowType = 'line';
        this._flowFrom = fromScript;
        this._flowFromCoord = fromCoord || null;
        this._flowFromLabel = fromLabel;
        this._flowColor = this.selectedColor;

        const indicator = document.getElementById('attackIndicator');
        if (indicator) {
            indicator.style.display = 'block';
            indicator.querySelector('.attack-from-name').textContent = `Line from: ${fromLabel}`;
        }
    }

    completeFlow() {
        this.close();
        if (!this._flowType || !this._flowFrom) return;

        let toScript, toCoord;
        if (this.selectedFeature) {
            toScript = this.selectedFeature.type === 'region'
                ? this.selectedFeature.country
                : this.selectedFeature.name;
        } else if (this.clickLngLat) {
            toScript = `${this.clickLngLat.lat.toFixed(2)} ${this.clickLngLat.lng.toFixed(2)}`;
            toCoord = [this.clickLngLat.lng, this.clickLngLat.lat];
        } else {
            return;
        }

        const color = this._flowColor || this.selectedColor;
        const colorHex = CONFIG.colors[color] || color || '#ef4444';
        const renderer = this.app.renderer;
        const geoData = this.app.geoData;

        // Resolve coordinates for live drawing
        const fromCoord = this._flowFromCoord || this._resolveCountryCenter(this._flowFrom);
        const toCoordResolved = toCoord || this._resolveCountryCenter(toScript);

        if (this._flowType === 'attack') {
            const curve = this._flowCurve;
            const width = this._flowWidth;
            const headSize = this._flowHeadSize;
            const duration = this._flowDuration || 800;
            // Create arrow first, then use arrowToScript for consistent formatting
            if (fromCoord && toCoordResolved) {
                const arrow = renderer.addArrow(fromCoord, toCoordResolved, colorHex, curve,
                    { fromName: this._flowFromLabel, toName: toScript }, width, headSize, 'none', duration);
                if (arrow) {
                    const lineIdx = this.editor.insert(renderer.arrowToScript(arrow));
                    arrow.scriptLine = lineIdx;
                }
            }
        } else if (this._flowType === 'line') {
            this.editor.insert(`line: ${this._flowFrom}, ${toScript}, ${color}`);
            // Feature-based lines use GeoJSON dashed line
            const fromF = typeof this._flowFrom === 'string' && !this._flowFromCoord
                ? geoData.findCountry(this._flowFrom) : null;
            const toF = typeof toScript === 'string' && !toCoord
                ? geoData.findCountry(toScript) : null;
            if (fromF && toF) {
                renderer.drawLine(fromF, toF, colorHex);
            } else if (fromCoord && toCoordResolved) {
                renderer.addArrow(fromCoord, toCoordResolved, colorHex, 0, {}, 0.5);
            }
        }

        this._commitColorToHistory();
        this.cancelFlow();
    }

    cancelFlow() {
        this._flowType = null;
        this._flowFrom = null;
        this._flowFromCoord = null;
        this._flowFromLabel = null;
        this._flowColor = null;
        this._flowCurve = 0.15;
        this._flowWidth = 1;
        this._flowHeadSize = 1;
        this._flowDuration = 800;
        const indicator = document.getElementById('attackIndicator');
        if (indicator) indicator.style.display = 'none';
        this.close();
    }

    // ─── Annotation Actions ───

    addBubble() {
        const textInput = document.getElementById('bubbleTextInput');
        const text = textInput ? textInput.value.trim() : '';
        if (!text || !this.clickLngLat) return;
        this.close();
        this.editor.insert(`bubble: ${this.clickLngLat.lat.toFixed(1)}, ${this.clickLngLat.lng.toFixed(1)}, "${text}", ${this.selectedColor}`);
        const el = LabelFactory.createBubble(text, this.selectedColor);
        this.app.renderer.addMarker(el, [this.clickLngLat.lng, this.clickLngLat.lat]);
    }

    addArrowLabel() {
        const textInput = document.getElementById('arrowLabelTextInput');
        const text = textInput ? textInput.value.trim() : '';
        if (!text || !this.clickLngLat) return;
        const dirPill = this.element.querySelector('#arrowLabelDirGroup .ctx-radio-pill.selected');
        const direction = dirPill ? dirPill.dataset.value : 'right';
        this.close();
        this.editor.insert(`arrow: ${this.clickLngLat.lat.toFixed(1)}, ${this.clickLngLat.lng.toFixed(1)}, "${text}", ${direction}`);
        const el = LabelFactory.createArrow(text, direction, this.selectedColor);
        this.app.renderer.addMarker(el, [this.clickLngLat.lng, this.clickLngLat.lat], direction === 'left' ? 'right' : 'left');
    }

    addLabel() {
        const textInput = document.getElementById('labelTextInput');
        const text = textInput ? textInput.value.trim() : '';
        if (!text || !this.clickLngLat) return;
        const sizeEl = document.getElementById('labelSizeRange');
        const size = sizeEl ? parseInt(sizeEl.value) : 14;
        this.close();
        this.editor.insert(`label: ${this.clickLngLat.lat.toFixed(1)}, ${this.clickLngLat.lng.toFixed(1)}, "${text}", ${size}, ${this.selectedColor}`);
        const el = LabelFactory.createLabel(text, size, this.selectedColor);
        this.app.renderer.addMarker(el, [this.clickLngLat.lng, this.clickLngLat.lat]);
    }

    addYear() {
        const textInput = document.getElementById('yearTextInput');
        const text = textInput ? textInput.value.trim() : '';
        if (!text) {
            this.toggleOptionsPanel('yearOpts');
            return;
        }
        const highlightEl = document.getElementById('yearHighlight');
        const highlight = highlightEl ? highlightEl.checked : false;
        this.close();
        let line = `year: "${text}"`;
        if (highlight) line += ', highlight';
        this.editor.insert(line);
        this.app.renderer.setYearOverlay(text, highlight);
    }

    addLegend() {
        const textInput = document.getElementById('legendTextInput');
        const text = textInput ? textInput.value.trim() : '';
        if (!text) {
            this.toggleOptionsPanel('legendOpts');
            return;
        }
        this.close();
        this.editor.insert(`legend: "${text}", ${this.selectedColor}`);
        const colorHex = CONFIG.colors[this.selectedColor] || this.selectedColor;
        this.app.renderer.addLegendEntry(text, colorHex);
    }

    // ─── Effects ───

    _placeEffect(effectName) {
        if (!this.clickLngLat) return;
        const color = this.selectedColor;
        const sizeEl = document.getElementById('effectSizeRange');
        const size = sizeEl ? parseFloat(sizeEl.value) : 1.5;
        this.close();
        let line = `effect: ${this.clickLngLat.lat.toFixed(1)}, ${this.clickLngLat.lng.toFixed(1)}, ${effectName}, ${color}`;
        if (Math.abs(size - 1) > 0.01) line += `, ${size.toFixed(2)}`;
        this.editor.insert(line);
        const el = EffectsLibrary.create(effectName, color, size);
        if (el) this.app.renderer.addMarker(el, [this.clickLngLat.lng, this.clickLngLat.lat]);
    }

    removeEffects() {
        this.close();
        this.editor.insert('remove: effects');
        this.app.renderer.removeEffects();
    }

    deleteEffect() {
        if (!this._selectedEffectMarker) return;
        this.app.renderer._selectEffect(this._selectedEffectMarker);
        this.app.renderer.removeSelectedEffect();
        this._selectedEffectMarker = null;
        this.close();
    }

    _changeEffectType(newType) {
        if (!this._selectedEffectMarker) return;
        const marker = this._selectedEffectMarker;
        const el = marker.getElement();
        const color = el.dataset.effectColor || 'red';
        const size = parseFloat(el.dataset.effectSize) || 1;
        const lngLat = marker.getLngLat();

        // Remove old marker
        marker.remove();
        this.app.renderer.markers = this.app.renderer.markers.filter(m => m !== marker);

        // Create new effect
        const newEl = EffectsLibrary.create(newType, color, size);
        if (newEl) {
            const newMarker = this.app.renderer.addMarker(newEl, [lngLat.lng, lngLat.lat]);
            this.app.renderer._selectEffect(newMarker);
            this._selectedEffectMarker = newMarker;
            // Update title
            const def = EffectsLibrary.EFFECTS[newType];
            this.titleElement.textContent = `Symbol: ${def ? def.label : newType}`;
        }
    }

    // ─── Camera Actions ───

    addFly() {
        this.close();
        if (!this.clickLngLat) return;
        const zoom = Math.round(this.getZoom());
        this.editor.insert(`fly: ${this.clickLngLat.lat.toFixed(1)}, ${this.clickLngLat.lng.toFixed(1)}, ${zoom}`);
    }

    addZoom() {
        this.close();
        if (!this.selectedFeature) return;
        const name = this.selectedFeature.type === 'region'
            ? this.selectedFeature.country : this.selectedFeature.name;
        this.editor.insert(`zoom: ${name}`);
    }

    addCinematic() {
        this.close();
        if (!this.clickLngLat) return;
        const zoom = Math.round(this.getZoom());
        const pitch = Math.round(this.app.renderer.getPitch());
        const bearing = Math.round(this.app.renderer.getBearing());
        this.editor.insert(`cinematic: ${this.clickLngLat.lat.toFixed(1)}, ${this.clickLngLat.lng.toFixed(1)}, ${zoom}, ${pitch || 20}, ${bearing}`);
    }

    // ─── Timing & Cleanup ───

    addWait1() { this.close(); this.editor.insert('wait: 1s'); }
    addWait2() { this.close(); this.editor.insert('wait: 2s'); }

    removeLast() {
        this.close();
        this.editor.insert('remove: last');
        this.app.renderer.removeLastMarker();
    }

    removeArrows() {
        this.close();
        this.editor.insert('remove: arrows');
        this.app.renderer.clearAttackArrows();
    }

    // ─── Arrow Editing ───

    _autoApplyArrowEdit() {
        if (!this._selectedArrow) return;
        const a = this._selectedArrow.arrow;
        const widthEl = document.getElementById('editArrowWidth');
        const headEl = document.getElementById('editArrowHeadSize');
        const durationEl = document.getElementById('editArrowDuration');
        if (widthEl) a.width = parseFloat(widthEl.value);
        if (headEl) a.headSize = parseFloat(headEl.value);
        if (durationEl) a.drawDuration = parseInt(durationEl.value);
        const colorHex = CONFIG.colors[this.selectedColor] || this.selectedColor;
        a.color = colorHex;
        this.app.renderer.renderArrows();
        // Sync change to script
        if (a.scriptLine >= 0) {
            this.editor.updateArrowLine(a.scriptLine, this.app.renderer.arrowToScript(a));
        }
        this._commitColorToHistory();
    }

    applyArrowEdit() {
        if (!this._selectedArrow) return;
        this._autoApplyArrowEdit();
        this.close();
    }

    deleteArrow() {
        if (!this._selectedArrow) return;
        const a = this._selectedArrow.arrow;
        // Remove from script
        if (a.scriptLine >= 0) {
            this.editor.removeLine(a.scriptLine);
            // Adjust scriptLine indices for arrows after this one
            this.app.renderer.arrows.forEach(arr => {
                if (arr.scriptLine > a.scriptLine) arr.scriptLine--;
            });
        }
        this.app.renderer.removeArrow(this._selectedArrow.index);
        this.close();
    }

    reverseArrow() {
        if (!this._selectedArrow) return;
        const a = this._selectedArrow.arrow;
        const tmp = a.from;
        a.from = a.to;
        a.to = tmp;
        if (a.meta) {
            const tmpN = a.meta.fromName;
            a.meta.fromName = a.meta.toName;
            a.meta.toName = tmpN;
        }
        this.app.renderer.renderArrows();
        // Sync to script
        if (a.scriptLine >= 0) {
            this.editor.updateArrowLine(a.scriptLine, this.app.renderer.arrowToScript(a));
        }
        this.close();
    }

    // ─── Options Panel Management ───

    toggleOptionsPanel(panelId) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        const isOpen = panel.classList.contains('open');
        this.closeAllPanels();
        if (!isOpen) {
            panel.classList.add('open');
            // Mark the associated chevron as expanded
            const chevron = this.element.querySelector(`.ctx-more-btn[data-panel="${panelId}"]`);
            if (chevron) chevron.classList.add('expanded');
            const input = panel.querySelector('.ctx-inline-input');
            if (input) setTimeout(() => { input.focus(); input.select(); }, 50);
        }
    }

    closeAllPanels() {
        this.element.querySelectorAll('.ctx-options.open').forEach(p => p.classList.remove('open'));
        this.element.querySelectorAll('.ctx-more-btn.expanded').forEach(b => b.classList.remove('expanded'));
    }

    // ─── Helpers ───

    _setVisible(selector, visible) {
        this.element.querySelectorAll(selector).forEach(el => {
            el.style.display = visible ? '' : 'none';
        });
    }

    _resolveCountryCenter(name) {
        const f = this.app.geoData.findCountry(name);
        if (!f) return null;
        return this.app.geoData.getCenter(f.geometry, f.properties.NAME);
    }

}
