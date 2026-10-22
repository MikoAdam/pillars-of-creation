/**
 * App - Main application controller
 */
class App {
    constructor() {
        this.geoData = new GeoData();
        this.renderer = null;
        this.parser = new ScriptParser();
        this.executor = null;
        this.editor = new Editor('editor');
        this.menu = null;
        this.isRunning = false;
        this.isPaused = false;
        this.commands = [];
        this.currentIndex = 0;
        this.scriptLines = [];
        this.highlightTimeout = null;
        this._runToken = 0;          // Incremented on stop/restart to cancel pending delays
        this.speedMultiplier = 1;    // Playback speed multiplier
        this._autoStopRecording = false; // Auto-stop recording when animation finishes
        this._aspectRatio = '16:9';  // Current aspect ratio string ('W:H' or empty for free)
    }

    async init() {
        // Show welcome modal — load map in parallel while user reads it
        const modal = document.getElementById('welcomeModal');
        modal.classList.remove('hidden');
        const welcomePromise = new Promise(resolve => { this._dismissResolve = resolve; });

        // Start loading immediately in background
        this.setStatus('Loading map data...');
        try {
            await this.geoData.load();
        } catch (err) {
            this.setStatus('Failed to load map data. Please refresh.');
            console.error(err);
            return;
        }

        this.setStatus('Initializing map...');
        this.renderer = new MapRenderer('map', this.geoData);
        await this.renderer.init();
        this.executor = new ScriptExecutor(this.renderer, this.geoData);
        this.menu = new ContextMenu(this.editor, () => this.renderer.getZoom(), this);

        // Sync arrow map edits back to script
        this.renderer.onArrowEdited = (arrow) => {
            if (arrow.scriptLine >= 0) {
                this.editor.updateArrowLine(arrow.scriptLine, this.renderer.arrowToScript(arrow));
            }
        };
        this.setupEventHandlers();
        this.loadExamples();
        this._enforceAspectRatio();
        // Deferred call ensures dimensions are stable after first paint
        requestAnimationFrame(() => this._enforceAspectRatio());
        window.addEventListener('resize', () => this._enforceAspectRatio());
        document.addEventListener('fullscreenchange', () => this._enforceAspectRatio());

        // Wait for user to click "Get Started" (may already be done)
        await welcomePromise;
        this.setStatus('Ready');
    }

    dismissWelcome() {
        const modal = document.getElementById('welcomeModal');
        if (modal) {
            modal.style.transition = 'opacity 0.3s ease';
            modal.style.opacity = '0';
            setTimeout(() => modal.classList.add('hidden'), 300);
        }
        if (this._dismissResolve) {
            this._dismissResolve();
            this._dismissResolve = null;
        }
    }

    setupEventHandlers() {
        document.getElementById('styleSelect').addEventListener('change', e => {
            this.renderer.setStyle(e.target.value);
        });

        // Playback speed — handled by setSpeed() called from button onclick

        // Timeline click-to-seek
        document.getElementById('timelineBar').addEventListener('click', e => {
            if (!this.commands.length || this.isRunning) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            this.seekTo(Math.round(pct * this.commands.length));
        });
        document.getElementById('showBorders').addEventListener('change', e => {
            this.renderer.toggleBorders(e.target.checked);
        });
        document.getElementById('showLabels').addEventListener('change', e => {
            this.renderer.toggleLabels(e.target.checked);
        });
        document.getElementById('aspectRatio').addEventListener('input', e => {
            this._aspectRatio = e.target.value.trim();
            this._enforceAspectRatio();
        });
        this.setupSidebarResize();
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
        this.renderer.on('contextmenu', e => {
            e.originalEvent.preventDefault();
            const arrowHit = this.renderer.hitTestArrow(e.point);
            const feature = this.renderer.queryFeatures(e.point);
            const effectMarker = e._effectMarker || null;
            this.menu.show(e.originalEvent, feature, e.lngLat, arrowHit, effectMarker);
        });

        // Click on map deselects effects
        this.renderer.on('click', () => {
            this.renderer.deselectEffect();
        });

        // Delete/Backspace removes selected effect, Escape cancels flows
        document.addEventListener('keydown', (e) => {
            if (e.target.matches('input, textarea, select')) return;
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.renderer._selectedEffectMarker) {
                e.preventDefault();
                this.renderer.removeSelectedEffect();
            }
            if (e.key === 'Escape') {
                if (this.renderer._selectedEffectMarker) {
                    this.renderer.deselectEffect();
                }
                // Cancel attack arrow / connection line flow
                if (this.menu && this.menu._flowType) {
                    this.menu.cancelFlow();
                }
            }
        });
    }

    toggleFullscreen() {
        const mapContainer = document.querySelector('.map-container');
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            mapContainer.requestFullscreen();
        }
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById('tab-' + tabName).classList.add('active');
    }

    loadExamples() {
        const container = document.getElementById('examplesList');
        container.innerHTML = Object.entries(EXAMPLES).map(([key, example]) => `
            <div class="example-card" data-key="${key}">
                <h4>${example.title}</h4>
                <p>${example.description}</p>
            </div>
        `).join('');
        container.querySelectorAll('.example-card').forEach(card => {
            card.addEventListener('click', () => this.loadExample(card.dataset.key));
        });
    }

    loadExample(key) {
        this.editor.setValue(EXAMPLES[key].script);
        this.switchTab('editor');
    }

    highlightLine(lineIndex) {
        const editor = document.getElementById('editor');
        if (!editor) return;

        const lines = editor.value.split('\n');
        const beforeCursor = lines.slice(0, lineIndex).join('\n').length + (lineIndex > 0 ? 1 : 0);
        const lineLength = lines[lineIndex] ? lines[lineIndex].length : 0;

        editor.focus();
        editor.setSelectionRange(beforeCursor, beforeCursor + lineLength);
        editor.scrollTop = Math.max(0, (lineIndex - 5) * 20);
    }

    clearHighlight() {
        const editor = document.getElementById('editor');
        if (editor) {
            editor.setSelectionRange(0, 0);
            editor.blur();
        }
    }

    updateTimeline() {
        const total = this.commands.length;
        const current = this.currentIndex;
        const progress = total > 0 ? (current / total) * 100 : 0;
        const progressBar = document.getElementById('timelineProgress');
        const position = document.getElementById('timelinePosition');
        if (progressBar) progressBar.style.width = progress + '%';
        if (position) position.textContent = `${current} / ${total}`;

        if (this.scriptLines[this.currentIndex] !== undefined) {
            this.highlightLine(this.scriptLines[this.currentIndex]);
        } else {
            this.clearHighlight();
        }
    }

    showControls(running) {
        const runBtn = document.getElementById('runBtn');
        const dvdControls = document.getElementById('dvdControls');
        const dvdControls2 = document.getElementById('dvdControls2');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const stopBtn = document.getElementById('stopBtn');
        const playBtn = document.getElementById('playBtn');

        const recPlayBtn = document.getElementById('recordPlayBtn');
        if (this.commands.length === 0) {
            if (runBtn) { runBtn.style.display = 'block'; runBtn.style.flex = '1'; }
            if (recPlayBtn) recPlayBtn.style.display = 'block';
            if (dvdControls) dvdControls.style.display = 'none';
            if (dvdControls2) dvdControls2.style.display = 'none';
        } else {
            if (runBtn) { runBtn.style.display = 'none'; }
            if (recPlayBtn) recPlayBtn.style.display = 'none';
            if (dvdControls) dvdControls.style.display = 'flex';
            if (dvdControls2) dvdControls2.style.display = 'flex';

            if (prevBtn) prevBtn.disabled = (this.currentIndex === 0);
            if (nextBtn) nextBtn.disabled = (this.currentIndex >= this.commands.length);
            if (stopBtn) stopBtn.disabled = !running;
            if (playBtn) playBtn.disabled = running || (this.currentIndex >= this.commands.length);
        }
    }

    stop() {
        this._runToken++;            // Cancel any pending delay immediately
        this.isPaused = false;
        this.isRunning = false;
        this.showControls(false);
        this.setStatus('Stopped');
    }

    async run() {
        if (this.isRunning) return;

        const script = this.editor.getValue();
        // Split on --- separator: commands before --- are "setup" — they run instantly
        // (no delays) before the animation begins, so the map is pre-configured from frame 1.
        const parts = script.split(/^---\s*$/m);
        const mainScript = parts[parts.length - 1]; // everything after the last ---
        const allLines = mainScript.split('\n');

        if (this.commands.length === 0 || this.currentIndex === 0) {
            this.commands = [];
            this.scriptLines = [];

            allLines.forEach((line, index) => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const cmd = this.parser.parseLine(trimmed);
                    if (cmd) {
                        this.commands.push(cmd);
                        this.scriptLines.push(index);
                    }
                }
            });

            if (!this.commands.length) {
                this.setStatus('No commands to run');
                return;
            }

            // Validate color names and show warnings
            const warnings = this._validateColors(this.commands);
            if (warnings.length > 0) {
                this._showScriptWarnings(warnings);
            }

            // Pass commands to executor for legendAuto
            this.executor.allCommands = this.commands;

            this.renderer.clearAll();
            this.currentIndex = 0;

            // Run setup section (everything before ---) with delays skipped
            if (parts.length > 1) {
                await this._runSetupCommands(parts.slice(0, -1).join('\n---\n'));
                // setPaintProperty() only schedules a WebGL re-render — it doesn't paint
                // synchronously. Wait long enough for the GPU to re-render before we capture
                // the first frame, otherwise the pre-record state won't be visible.
                await new Promise(r => setTimeout(r, 150));
            }

            // Start recording now — after setup is applied — if queued by recordAndPlay()
            if (this._pendingRecordStart) {
                this._pendingRecordStart = false;
                this.startVideoRecording();
            }
        }

        const token = ++this._runToken;
        this.executor._isAborted = () => this._runToken !== token;
        this.executor.speedMultiplier = this.speedMultiplier;
        this.executor._skipDelays = false;

        this.isRunning = true;
        this.showControls(true);
        this.updateTimeline();
        this.setStatus('Running...');

        while (this.currentIndex < this.commands.length && this.isRunning) {
            if (this._runToken !== token) break;
            await this.executor.executeCommand(this.commands[this.currentIndex]);
            if (this._runToken !== token) break;
            this.currentIndex++;
            this.updateTimeline();
        }

        // If aborted externally (stop/restart/seek), let the caller handle state
        if (this._runToken !== token) return;

        this.isRunning = false;
        this.showControls(false);
        if (this.currentIndex >= this.commands.length) {
            this.setStatus('Done');
            if (this._autoStopRecording) {
                this._autoStopRecording = false;
                // Brief pause to capture last frame before stopping
                setTimeout(() => this.stopVideoRecording(), 600);
            }
        }
    }

    async stepForward() {
        if (this.isRunning) return; // Already running — ignore
        if (!this.commands.length) {
            await this.prepareCommands();
        }

        if (this.currentIndex < this.commands.length) {
            const token = ++this._runToken;
            this.executor._isAborted = () => this._runToken !== token;
            this.executor._skipDelays = false;
            await this.executor.executeCommand(this.commands[this.currentIndex]);
            if (this._runToken !== token) return;
            this.currentIndex++;
            this.updateTimeline();
            this.showControls(false);
            this.setStatus(`Step ${this.currentIndex} / ${this.commands.length}`);
        } else {
            this.setStatus('End');
        }
    }

    async stepBackward() {
        if (this.isRunning) this.stop();
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.renderer.clearAll();

            const token = ++this._runToken;
            this.executor._isAborted = () => this._runToken !== token;
            this.executor._skipDelays = true; // Skip waits/fly delays during replay

            for (let i = 0; i < this.currentIndex; i++) {
                if (this._runToken !== token) break;
                const cmd = this.commands[i];
                if (cmd.type !== 'wait') {
                    await this.executor.executeCommand(cmd);
                }
            }

            this.executor._skipDelays = false;
            if (this._runToken !== token) return;
            this.updateTimeline();
            this.showControls(false);
            this.setStatus(`Step ${this.currentIndex} / ${this.commands.length}`);
        } else {
            this.setStatus('Start');
        }
    }

    async seekTo(targetIndex) {
        if (this.isRunning) return;
        if (!this.commands.length) return;
        this.currentIndex = Math.max(0, Math.min(targetIndex, this.commands.length));
        this.renderer.clearAll();

        const token = ++this._runToken;
        this.executor._isAborted = () => this._runToken !== token;
        this.executor._skipDelays = true;

        for (let i = 0; i < this.currentIndex; i++) {
            if (this._runToken !== token) break;
            const cmd = this.commands[i];
            if (cmd.type !== 'wait') {
                await this.executor.executeCommand(cmd);
            }
        }

        this.executor._skipDelays = false;
        if (this._runToken !== token) return;
        this.updateTimeline();
        this.showControls(false);
        this.setStatus(`Step ${this.currentIndex} / ${this.commands.length}`);
    }

    async prepareCommands() {
        const script = this.editor.getValue();
        const parts = script.split(/^---\s*$/m);
        const mainScript = parts[parts.length - 1];
        const allLines = mainScript.split('\n');
        this.commands = [];
        this.scriptLines = [];

        allLines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const cmd = this.parser.parseLine(trimmed);
                if (cmd) {
                    this.commands.push(cmd);
                    this.scriptLines.push(index);
                }
            }
        });

        if (!this.commands.length) return;
        this.executor.allCommands = this.commands;
        this.renderer.clearAll();
        this.currentIndex = 0;
        this.showControls(false);
        this.updateTimeline();
    }

    /**
     * Run setup commands (everything before --- in the script) with all delays skipped.
     * Called before the animation loop starts so the map is pre-configured from frame 1.
     */
    async _runSetupCommands(setupText) {
        if (!setupText || !setupText.trim()) return;
        const cmds = [];
        setupText.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed !== '---') {
                const cmd = this.parser.parseLine(trimmed);
                if (cmd) cmds.push(cmd);
            }
        });
        if (!cmds.length) return;
        const prevSkip = this.executor._skipDelays;
        this.executor._skipDelays = true;
        for (const cmd of cmds) await this.executor.executeCommand(cmd);
        this.executor._skipDelays = prevSkip;
    }

    restart() {
        this._runToken++;            // Cancel any pending delay immediately
        this.isRunning = false;
        this.isPaused = false;
        this.renderer.clearAll();
        this.commands = [];
        this.scriptLines = [];
        this.currentIndex = 0;
        this.updateTimeline();
        this.clearHighlight();
        this.showControls(false);
        this.setStatus('Ready to run');
    }

    clearAll() {
        this.renderer.clearAll();
        this.commands = [];
        this.scriptLines = [];
        this.currentIndex = 0;
        this.clearHighlight();
        this.setStatus('Cleared');
    }

    setSpeed(value) {
        this.speedMultiplier = value;
        if (this.executor) this.executor.speedMultiplier = value;
        document.querySelectorAll('#speedBtns .speed-btn').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.speed) === value);
        });
    }

    insertCommand(cmd) {
        this.editor.insert(cmd);
    }

    setStatus(message) {
        const el = document.getElementById('status');
        if (el) el.textContent = message;
    }

    // ─── 16:9 aspect ratio enforcement ───

    setupSidebarResize() {
        const resizer = document.getElementById('sidebarResizer');
        const sidebar = document.querySelector('.sidebar');
        if (!resizer || !sidebar) return;

        const MIN_W = 220;
        const MAX_W = 600;

        // Restore saved width from previous session
        const saved = localStorage.getItem('poc-sidebar-width');
        if (saved) sidebar.style.width = saved;

        let startX, startW;

        const onMove = e => {
            const w = Math.min(MAX_W, Math.max(MIN_W, startW + (e.clientX - startX)));
            sidebar.style.width = w + 'px';
            this._enforceAspectRatio();
        };

        const onUp = () => {
            resizer.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            localStorage.setItem('poc-sidebar-width', sidebar.style.width);
        };

        resizer.addEventListener('mousedown', e => {
            startX = e.clientX;
            startW = sidebar.offsetWidth;
            resizer.classList.add('dragging');
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.preventDefault();
        });
    }

    _parseAspectRatio(str) {
        if (!str) return null;
        const parts = str.split(':');
        if (parts.length !== 2) return null;
        const rw = parseFloat(parts[0]);
        const rh = parseFloat(parts[1]);
        if (!rw || !rh || rw <= 0 || rh <= 0) return null;
        return rw / rh;
    }

    _enforceAspectRatio() {
        const sidebar      = document.querySelector('.sidebar');
        const mapContainer = document.querySelector('.map-container');
        if (!sidebar || !mapContainer) return;

        const ratio = this._parseAspectRatio(this._aspectRatio);

        if (!ratio) {
            // Free mode: map fills all available space
            mapContainer.style.flex      = '1';
            mapContainer.style.width     = '';
            mapContainer.style.height    = '';
            mapContainer.style.alignSelf = 'stretch';
            if (this.renderer?.map) this.renderer.map.resize();
            return;
        }

        // Constrained mode — use window dimensions directly; main.clientHeight
        // can return 0 on first call before the flex layout has fully resolved.
        const header   = document.querySelector('header');
        const sidebarW = sidebar.offsetWidth || 0;
        const headerH  = header ? header.offsetHeight : 0;
        const availW   = window.innerWidth  - sidebarW;
        const availH   = window.innerHeight - headerH;

        if (availW <= 0 || availH <= 0) return;

        // Fit the largest rect with the given ratio into the available space
        let w = availW;
        let h = Math.round(w / ratio);
        if (h > availH) {
            h = availH;
            w = Math.round(h * ratio);
        }

        mapContainer.style.flex      = '0 0 auto';
        mapContainer.style.width     = w + 'px';
        mapContainer.style.height    = h + 'px';
        mapContainer.style.alignSelf = 'center';

        if (this.renderer?.map) this.renderer.map.resize();
    }

    // ─── Word-wrap helper for canvas rendering ───

    _wrapText(ctx, text, maxWidth) {
        const words = text.split(' ');
        const lines = [];
        let current = '';
        for (const word of words) {
            const test = current ? `${current} ${word}` : word;
            if (ctx.measureText(test).width > maxWidth && current) {
                lines.push(current);
                current = word;
            } else {
                current = test;
            }
        }
        if (current) lines.push(current);
        return lines;
    }

    // ─── Screenshot (composite) ───

    async takeScreenshot() {
        const mapCanvas = this.renderer.map.getCanvas();
        const width = mapCanvas.width;
        const height = mapCanvas.height;
        const dpr = window.devicePixelRatio || 1;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // 1. Map (includes borders since those are MapLibre layers)
        ctx.drawImage(mapCanvas, 0, 0);

        // 1b. Attack arrows (canvas overlay)
        if (this.renderer.arrowCanvas) {
            ctx.drawImage(this.renderer.arrowCanvas, 0, 0, width, height);
        }

        // 2. Country name labels — use DOM rect relative to map canvas for accurate positioning
        const mapRect = mapCanvas.getBoundingClientRect();
        this.renderer.labelMarkers.forEach(marker => {
            const label = marker.getElement();
            if (!label || !label.isConnected) return;
            const labelRect = label.getBoundingClientRect();
            const x = (labelRect.left + labelRect.width / 2 - mapRect.left) * dpr;
            const y = (labelRect.top + labelRect.height / 2 - mapRect.top) * dpr;
            const fontSize = parseFloat(getComputedStyle(label).fontSize) * dpr;

            ctx.font = `bold ${fontSize}px "Space Grotesk", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Text shadow for readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            for (let ox = -2; ox <= 2; ox++) {
                for (let oy = -2; oy <= 2; oy++) {
                    ctx.fillText(label.textContent, x + ox * dpr, y + oy * dpr);
                }
            }
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label.textContent, x, y);
        });
        ctx.textAlign = 'left';

        // Rename labels (country name overrides e.g. "West Germany")
        this.renderer._renames.forEach(entry => {
            const el = entry.marker?.getElement();
            if (!el || !el.isConnected) return;
            const elRect = el.getBoundingClientRect();
            const x = (elRect.left + elRect.width / 2 - mapRect.left) * dpr;
            const y = (elRect.top + elRect.height / 2 - mapRect.top) * dpr;
            ctx.font = `700 ${13 * dpr}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            for (let ox = -2; ox <= 2; ox++) {
                for (let oy = -2; oy <= 2; oy++) {
                    if (ox || oy) ctx.fillText(el.textContent, x + ox, y + oy);
                }
            }
            ctx.fillStyle = '#334155';
            ctx.fillText(el.textContent, x, y);
        });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        // 3. Map symbols (DOM markers with SVG) — use DOM rect relative to map canvas
        const symbolPromises = [];
        document.querySelectorAll('.map-effect').forEach(effectEl => {
            if (!effectEl.isConnected) return;

            const svgEl = effectEl.querySelector('svg');
            if (!svgEl) return;

            // Use DOM rect for accurate position relative to map canvas
            const effectRect = effectEl.getBoundingClientRect();
            const sx = (effectRect.left + effectRect.width / 2 - mapRect.left) * dpr;
            const sy = (effectRect.top + effectRect.height / 2 - mapRect.top) * dpr;
            const ew = effectRect.width * dpr;
            const eh = effectRect.height * dpr;

            // Serialize SVG with the current color applied
            const color = getComputedStyle(effectEl).color || '#ef4444';
            const svgClone = svgEl.cloneNode(true);
            svgClone.setAttribute('width', ew);
            svgClone.setAttribute('height', eh);
            // Replace currentColor with the actual color
            const svgStr = new XMLSerializer().serializeToString(svgClone).replace(/currentColor/g, color);
            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            const p = new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    ctx.drawImage(img, sx - ew / 2, sy - eh / 2, ew, eh);
                    URL.revokeObjectURL(url);
                    resolve();
                };
                img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
                img.src = url;
            });
            symbolPromises.push(p);
        });

        // Wait for all symbol images to load and draw
        await Promise.all(symbolPromises);

        // 4. Bubbles (DOM markers / subtitles)
        document.querySelectorAll('.map-bubble').forEach(bubble => {
            const rect = bubble.getBoundingClientRect();
            const bx = (rect.left - mapRect.left) * dpr;
            const by = (rect.top - mapRect.top) * dpr;
            const bw = rect.width * dpr;
            const bh = rect.height * dpr;
            const r = 6 * dpr;

            // Background
            const bgColor = getComputedStyle(bubble).backgroundColor || 'rgba(0,0,0,0.85)';
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, r);
            ctx.fill();

            // Accent border (bottom for subtitles, left for positioned bubbles)
            const cs = getComputedStyle(bubble);
            const isSubtitle = bubble.classList.contains('subtitle-bubble');
            const accentColor = cs.borderLeftColor || 'rgba(255,255,255,0.3)';
            const accentW = 3 * dpr;
            ctx.fillStyle = accentColor;
            ctx.fillRect(bx, by, accentW, bh);

            // Text — word-wrapped so it matches the DOM layout
            const text = bubble.textContent.trim();
            const padX = 18 * dpr;
            const padY = 14 * dpr;
            const fontSize = parseFloat(cs.fontSize) * dpr || 15 * dpr;
            ctx.font = `500 ${fontSize}px "Space Grotesk", sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = isSubtitle ? 'center' : 'left';
            ctx.textBaseline = 'top';
            const maxW = bw - padX * 2;
            const lineH = fontSize * 1.6;
            const lines = this._wrapText(ctx, text, maxW);
            const totalH = lines.length * lineH;
            const startY = by + (bh - totalH) / 2;
            const textX = isSubtitle ? bx + bw / 2 : bx + padX;
            lines.forEach((line, i) => ctx.fillText(line, textX, startY + i * lineH));
            ctx.textAlign = 'left';
        });

        // 4. Year overlay
        const yearOverlay = document.getElementById('yearOverlay');
        if (yearOverlay && yearOverlay.classList.contains('visible')) {
            const text = yearOverlay.textContent;
            const fontSize = 28 * dpr;
            ctx.font = `bold ${fontSize}px "Space Grotesk", sans-serif`;
            const metrics = ctx.measureText(text);
            const pad = 14 * dpr;
            const px = 24 * dpr;
            const py = 24 * dpr;
            const pillW = metrics.width + pad * 2;
            const pillH = fontSize + pad * 2;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
            ctx.beginPath();
            ctx.roundRect(px, py, pillW, pillH, 50 * dpr);
            ctx.fill();

            ctx.strokeStyle = '#4cd964';
            ctx.lineWidth = 2 * dpr;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, px + pad, py + pillH / 2);
        }

        // 5. Legend
        const entries = this.renderer.legendEntries;
        if (entries.length > 0) {
            const rowH = 24 * dpr;
            const padX = 14 * dpr;
            const padY = 10 * dpr;
            const swatchSize = 14 * dpr;
            const gap = 8 * dpr;
            const fontSize = 12 * dpr;

            ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
            const maxLabelW = Math.max(...entries.map(e => ctx.measureText(e.label).width));
            const boxW = padX + swatchSize + gap + maxLabelW + padX;
            const boxH = padY + entries.length * rowH + padY;
            const lx = width - boxW - 14 * dpr;
            const ly = 14 * dpr;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.beginPath();
            ctx.roundRect(lx, ly, boxW, boxH, 8 * dpr);
            ctx.fill();

            ctx.strokeStyle = 'rgba(102, 126, 234, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();

            entries.forEach((entry, i) => {
                const y = ly + padY + i * rowH;
                ctx.fillStyle = entry.color;
                ctx.fillRect(lx + padX, y + (rowH - swatchSize) / 2, swatchSize, swatchSize);
                ctx.fillStyle = '#ddd';
                ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.fillText(entry.label, lx + padX + swatchSize + gap, y + rowH / 2);
            });
        }

        // 6. Attribution
        const isSatellite = document.getElementById('styleSelect').value === 'satellite';
        const attrLines = isSatellite
            ? ['© NASA GIBS']
            : ['© OpenFreeMap', 'Natural Earth'];
        const attrFontSize = 10 * dpr;
        ctx.font = `${attrFontSize}px sans-serif`;
        const attrLineH = attrFontSize * 1.4;
        const attrPadX = 8 * dpr;
        const attrPadY = 4 * dpr;
        const attrBoxW = Math.max(...attrLines.map(l => ctx.measureText(l).width)) + attrPadX * 2;
        const attrBoxH = attrLines.length * attrLineH + attrPadY * 2;
        const attrX = width - attrBoxW - 10 * dpr;
        const attrY = height - attrBoxH - 10 * dpr;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.roundRect(attrX, attrY, attrBoxW, attrBoxH, 4 * dpr);
        ctx.fill();
        ctx.fillStyle = '#aaa';
        ctx.textBaseline = 'middle';
        attrLines.forEach((line, i) => {
            ctx.fillText(line, attrX + attrPadX, attrY + attrPadY + (i + 0.5) * attrLineH);
        });

        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'poc-maps-screenshot.png';
            a.click();
            URL.revokeObjectURL(url);
            this.setStatus('Screenshot saved!');
        });
    }

    // ─── Video recording ───

    startVideoRecording() {
        const mapCanvas = this.renderer.map.getCanvas();
        this.recordingCanvas = document.createElement('canvas');
        this.recordingCanvas.width = mapCanvas.width;
        this.recordingCanvas.height = mapCanvas.height;
        this.recordingCtx = this.recordingCanvas.getContext('2d');
        this.isRecording = true;
        this.drawRecordingFrame();

        const stream = this.recordingCanvas.captureStream(30);
        this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        this.recordedChunks = [];

        this.mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) this.recordedChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
            this.isRecording = false;
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'poc-maps.webm';
            a.click();
            URL.revokeObjectURL(url);
            this.setStatus('Video saved!');
        };

        this.mediaRecorder.start();
        // Show recording indicator in header; dim the sidebar Rec button
        document.getElementById('stopRecordBtn').style.display = 'inline-block';
        const recBtn = document.getElementById('recordPlayBtn');
        if (recBtn) { recBtn.disabled = true; recBtn.textContent = '⏺ Rec…'; }
        this.setStatus('Recording...');
    }

    drawRecordingFrame() {
        if (!this.isRecording) return;
        const mapCanvas = this.renderer.map.getCanvas();
        const ctx = this.recordingCtx;
        const width = this.recordingCanvas.width;
        const height = this.recordingCanvas.height;
        const dpr = window.devicePixelRatio || 1;

        ctx.drawImage(mapCanvas, 0, 0);

        // Attack arrows (canvas overlay)
        if (this.renderer.arrowCanvas) {
            ctx.drawImage(this.renderer.arrowCanvas, 0, 0, width, height);
        }

        // Country name labels — use DOM rect relative to map canvas
        const mapRect = mapCanvas.getBoundingClientRect();
        this.renderer.labelMarkers.forEach(marker => {
            const label = marker.getElement();
            if (!label || !label.isConnected) return;
            const labelRect = label.getBoundingClientRect();
            const x = (labelRect.left + labelRect.width / 2 - mapRect.left) * dpr;
            const y = (labelRect.top + labelRect.height / 2 - mapRect.top) * dpr;
            const fontSize = parseFloat(getComputedStyle(label).fontSize) * dpr;

            ctx.font = `bold ${fontSize}px "Space Grotesk", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            for (let ox = -2; ox <= 2; ox++) {
                for (let oy = -2; oy <= 2; oy++) {
                    ctx.fillText(label.textContent, x + ox * dpr, y + oy * dpr);
                }
            }
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label.textContent, x, y);
        });
        ctx.textAlign = 'left';

        // Rename labels (country name overrides e.g. "West Germany")
        this.renderer._renames.forEach(entry => {
            const el = entry.marker?.getElement();
            if (!el || !el.isConnected) return;
            const elRect = el.getBoundingClientRect();
            const x = (elRect.left + elRect.width / 2 - mapRect.left) * dpr;
            const y = (elRect.top + elRect.height / 2 - mapRect.top) * dpr;
            ctx.font = `700 ${13 * dpr}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            for (let ox = -2; ox <= 2; ox++) {
                for (let oy = -2; oy <= 2; oy++) {
                    if (ox || oy) ctx.fillText(el.textContent, x + ox, y + oy);
                }
            }
            ctx.fillStyle = '#334155';
            ctx.fillText(el.textContent, x, y);
        });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        // Symbols — use DOM rect relative to map canvas, draw pre-cached images
        if (!this._symbolImageCache) this._symbolImageCache = {};
        document.querySelectorAll('.map-effect').forEach(effectEl => {
            if (!effectEl.isConnected) return;
            const effectRect = effectEl.getBoundingClientRect();
            const sx = (effectRect.left + effectRect.width / 2 - mapRect.left) * dpr;
            const sy = (effectRect.top + effectRect.height / 2 - mapRect.top) * dpr;
            const ew = effectRect.width * dpr;
            const eh = effectRect.height * dpr;
            const color = getComputedStyle(effectEl).color || '#ef4444';
            const name = effectEl.dataset.effectName;
            const cacheKey = `${name}_${color}_${Math.round(ew)}`;

            // Use cached image if available
            if (this._symbolImageCache[cacheKey] && this._symbolImageCache[cacheKey].complete) {
                ctx.drawImage(this._symbolImageCache[cacheKey], sx - ew / 2, sy - eh / 2, ew, eh);
            } else if (!this._symbolImageCache[cacheKey]) {
                // Start loading (will be available next frame)
                const svgEl = effectEl.querySelector('svg');
                if (!svgEl) return;
                const svgClone = svgEl.cloneNode(true);
                svgClone.setAttribute('width', ew);
                svgClone.setAttribute('height', eh);
                const svgStr = new XMLSerializer().serializeToString(svgClone).replace(/currentColor/g, color);
                const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = () => URL.revokeObjectURL(url);
                img.src = url;
                this._symbolImageCache[cacheKey] = img;
            }
        });

        // Bubbles — subtitle or positioned, both word-wrapped
        document.querySelectorAll('.map-bubble').forEach(bubble => {
            const rect = bubble.getBoundingClientRect();
            const bx = (rect.left - mapRect.left) * dpr;
            const by = (rect.top - mapRect.top) * dpr;
            const bw = rect.width * dpr;
            const bh = rect.height * dpr;
            const cs = getComputedStyle(bubble);
            const isSubtitle = bubble.classList.contains('subtitle-bubble');
            ctx.fillStyle = cs.backgroundColor || 'rgba(0,0,0,0.85)';
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 6 * dpr);
            ctx.fill();
            const accentColor = cs.borderLeftColor || 'rgba(255,255,255,0.3)';
            const accentW = 3 * dpr;
            ctx.fillStyle = accentColor;
            ctx.fillRect(bx, by, accentW, bh);
            const text = bubble.textContent.trim();
            const padX = 18 * dpr;
            const fontSize = parseFloat(cs.fontSize) * dpr || 15 * dpr;
            ctx.font = `500 ${fontSize}px "Space Grotesk", sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = isSubtitle ? 'center' : 'left';
            ctx.textBaseline = 'top';
            const maxW = bw - padX * 2;
            const lineH = fontSize * 1.6;
            const lines = this._wrapText(ctx, text, maxW);
            const totalH = lines.length * lineH;
            const startY = by + (bh - totalH) / 2;
            const textX = isSubtitle ? bx + bw / 2 : bx + padX;
            lines.forEach((line, i) => ctx.fillText(line, textX, startY + i * lineH));
            ctx.textAlign = 'left';
        });

        // Year overlay
        const yearOverlay = document.getElementById('yearOverlay');
        if (yearOverlay && yearOverlay.classList.contains('visible')) {
            const yearText = yearOverlay.textContent;
            const fontSize = 28 * dpr;
            ctx.font = `bold ${fontSize}px "Space Grotesk", sans-serif`;
            const metrics = ctx.measureText(yearText);
            const pad = 14 * dpr;
            const px = 24 * dpr;
            const py = 24 * dpr;
            const pillW = metrics.width + pad * 2;
            const pillH = fontSize + pad * 2;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
            ctx.beginPath();
            ctx.roundRect(px, py, pillW, pillH, 50 * dpr);
            ctx.fill();
            ctx.strokeStyle = '#4cd964';
            ctx.lineWidth = 2 * dpr;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.fillText(yearText, px + pad, py + pillH / 2);
        }

        // Legend
        const entries = this.renderer.legendEntries;
        if (entries.length > 0) {
            const rowH = 24 * dpr;
            const padX = 14 * dpr;
            const padY = 10 * dpr;
            const swatchSize = 14 * dpr;
            const gap = 8 * dpr;
            const fontSize = 12 * dpr;
            ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
            const maxLabelW = Math.max(...entries.map(e => ctx.measureText(e.label).width));
            const boxW = padX + swatchSize + gap + maxLabelW + padX;
            const boxH = padY + entries.length * rowH + padY;
            const lx = width - boxW - 14 * dpr;
            const ly = 14 * dpr;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.beginPath();
            ctx.roundRect(lx, ly, boxW, boxH, 8 * dpr);
            ctx.fill();
            entries.forEach((entry, i) => {
                const ey = ly + padY + i * rowH;
                ctx.fillStyle = entry.color;
                ctx.fillRect(lx + padX, ey + (rowH - swatchSize) / 2, swatchSize, swatchSize);
                ctx.fillStyle = '#ddd';
                ctx.font = `${fontSize}px "Space Grotesk", sans-serif`;
                ctx.textBaseline = 'middle';
                ctx.fillText(entry.label, lx + padX + swatchSize + gap, ey + rowH / 2);
            });
        }

        // Attribution
        const isSatellite = document.getElementById('styleSelect').value === 'satellite';
        const attrLines = isSatellite
            ? ['© NASA GIBS']
            : ['© OpenFreeMap', 'Natural Earth'];
        const attrFontSize = 10 * dpr;
        ctx.font = `${attrFontSize}px sans-serif`;
        const attrLineH = attrFontSize * 1.4;
        const attrPadX = 8 * dpr;
        const attrPadY = 4 * dpr;
        const attrBoxW = Math.max(...attrLines.map(l => ctx.measureText(l).width)) + attrPadX * 2;
        const attrBoxH = attrLines.length * attrLineH + attrPadY * 2;
        const attrX = width - attrBoxW - 10 * dpr;
        const attrY = height - attrBoxH - 10 * dpr;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.roundRect(attrX, attrY, attrBoxW, attrBoxH, 4 * dpr);
        ctx.fill();
        ctx.fillStyle = '#aaa';
        ctx.textBaseline = 'middle';
        attrLines.forEach((line, i) => {
            ctx.fillText(line, attrX + attrPadX, attrY + attrPadY + (i + 0.5) * attrLineH);
        });

        requestAnimationFrame(() => this.drawRecordingFrame());
    }

    stopVideoRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            document.getElementById('stopRecordBtn').style.display = 'none';
            const recBtn = document.getElementById('recordPlayBtn');
            if (recBtn) { recBtn.disabled = false; recBtn.textContent = '⏺ Rec'; }
            this.setStatus('Saving video...');
        }
    }

    async recordAndPlay() {
        this.restart();
        // Brief pause to let clearAll settle on the canvas
        await new Promise(r => setTimeout(r, 80));
        // Don't start recording yet — defer until after setup commands run inside run(),
        // so the very first recorded frame already has the pre-record map state applied.
        this._pendingRecordStart = true;
        this._autoStopRecording = true;
        await this.run();
        this._pendingRecordStart = false; // Safety: clear flag if run() exited early
    }

    // ─── Script validation ───

    _validateColors(commands) {
        const warnings = [];
        const validColors = Object.keys(CONFIG.colors);
        const countryColors = {}; // Track: each country can only be one color

        commands.forEach((cmd, i) => {
            // Check if color is valid (skip hex colors starting with #)
            if (cmd.color && !cmd.color.startsWith('#') && !validColors.includes(cmd.color)) {
                warnings.push({
                    line: this.scriptLines[i],
                    msg: `"${cmd.color}" is not a valid color. Available: ${validColors.slice(0, 8).join(', ')}...`
                });
            }

            // Check duplicate country coloring
            if (cmd.type === 'country') {
                const name = cmd.name.toLowerCase();
                if (countryColors[name] && countryColors[name] !== cmd.color) {
                    warnings.push({
                        line: this.scriptLines[i],
                        msg: `"${cmd.name}" is already colored "${countryColors[name]}". A country can only show one color at a time.`
                    });
                }
                countryColors[name] = cmd.color;
            }
        });

        return warnings;
    }

    _showScriptWarnings(warnings) {
        // Insert warnings as comments into the editor above the offending lines
        const editor = document.getElementById('editor');
        if (!editor) return;

        const lines = editor.value.split('\n');
        // Process from bottom to top so line numbers don't shift
        const sorted = [...warnings].sort((a, b) => b.line - a.line);
        for (const w of sorted) {
            if (w.line >= 0 && w.line < lines.length) {
                lines.splice(w.line, 0, `# ⚠ WARNING: ${w.msg}`);
            }
        }
        editor.value = lines.join('\n');

        this.setStatus(`${warnings.length} warning(s) found — see editor`);
    }
}

// Initialize
const app = new App();
app.init().catch(err => {
    console.error('Failed to initialize:', err);
    const el = document.getElementById('status');
    if (el) el.textContent = 'Error: ' + err.message;
});
window.app = app;
