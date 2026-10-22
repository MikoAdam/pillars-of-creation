/**
 * Pillars of Creation Maps - Renderer
 * Map rendering, camera control, and visual effects
 */

class MapRenderer {
    constructor(containerId, geoData) {
        this.containerId = containerId;
        this.geoData = geoData;
        this.map = null;
        this.layers = [];
        this.sourceIds = new Set();
        this.markers = [];
        this.labelMarkers = [];
        this.layerCounter = 0;
        this.lastMarker = null;
        this.showBorders = false;
        this.showLabels = false;
        this.lineStartCountry = null;
        this.bubblePositions = [];
        this.legendEntries = [];
        this.legendElement = null;
        this._coloredFeatures = []; // Track colored features for style switch
        this._renames = new Map();    // name.toLowerCase() → { marker }
        this.hoverSourcesReady = false; // Track if hover sources are loaded
        this._minimalBorderIds = []; // Line layer IDs in minimal style, for toggling
        this._minimalLabelIds  = []; // Symbol layer IDs in minimal style, for toggling
    }

    hideClutter() {
        const layersToHide = [
            'park', 'park_outline', 'landcover_wood', 'landcover_grass',
            'landuse_residential', 'landuse_pitch', 'landuse_track',
            'landuse_cemetery', 'landuse_hospital', 'landuse_school',
            'poi_r20', 'poi_r7', 'poi_r1', 'poi_transit', 'airport'
        ];

        layersToHide.forEach(id => {
            if (this.map.getLayer(id)) {
                this.map.setLayoutProperty(id, 'visibility', 'none');
            }
        });
    }

    adjustColorBrightness(hex, percent) {
        if (!hex || !hex.startsWith('#')) return hex;

        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);

        r = Math.max(0, Math.min(255, Math.round(r + (255 * percent / 100))));
        g = Math.max(0, Math.min(255, Math.round(g + (255 * percent / 100))));
        b = Math.max(0, Math.min(255, Math.round(b + (255 * percent / 100))));

        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    createDiagonalPattern(id, color1, color2) {
        if (!this.map.hasImage(id)) {
            const size = 32;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = color2;
            ctx.fillRect(0, 0, size, size);

            ctx.strokeStyle = color1;
            ctx.lineWidth = 4;
            ctx.lineCap = 'square';

            for (let i = -size; i < size * 2; i += 8) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i + size, size);
                ctx.stroke();
            }

            this.map.addImage(id, {
                width: size,
                height: size,
                data: ctx.getImageData(0, 0, size, size).data
            });
        }
    }

    // ─── Helpers for adding GeoJSON sources/layers ───

    addGeoSource(id, data) {
        this.map.addSource(id, { type: 'geojson', data });
        this.sourceIds.add(id);
    }

    /**
     * Returns the ID of the layer that colored fills/lines should be inserted *before*,
     * so they render beneath labels and borders.
     * - Minimal mode: insert below the border line so borders stay on top of colored fills.
     * - Liberty/other: insert below the first symbol layer so labels stay readable.
     * Returns undefined if no anchor layer exists (layers go on top — safe fallback).
     */
    _getFirstLabelLayerId() {
        // In minimal mode, colored fills must go below the country border line
        if (this.map.getLayer('minimal-border-line')) return 'minimal-border-line';
        const style = this.map.getStyle();
        if (!style || !style.layers) return undefined;
        for (const layer of style.layers) {
            if (layer.type === 'symbol') return layer.id;
        }
        return undefined;
    }

    addLineLayer(id, sourceId, color, width, opacity, options = {}) {
        const paint = {
            'line-color': color,
            'line-width': width,
            'line-opacity': opacity
        };
        if (options.dasharray) paint['line-dasharray'] = options.dasharray;
        if (options.blur) paint['line-blur'] = options.blur;

        // Insert below labels so country names stay visible
        this.map.addLayer({ id, type: 'line', source: sourceId, paint }, this._getFirstLabelLayerId());
        this.layers.push(id);
    }

    addFillLayer(id, sourceId, color, opacity, options = {}) {
        const paint = {
            'fill-color': color,
            'fill-opacity': opacity
        };
        if (options.pattern) paint['fill-pattern'] = options.pattern;

        // Insert below labels so country names stay visible
        this.map.addLayer({ id, type: 'fill', source: sourceId, paint }, this._getFirstLabelLayerId());
        this.layers.push(id);
    }

    // ─── Map initialization ───

    async init() {
        // Start immediately with the self-contained minimal style —
        // no tile-server calls on first load.  Liberty is fetched lazily
        // the first time the user switches to Liberty or Satellite.
        // The glyphs URL is for font rendering only (tiny cached pbf files,
        // not map tiles) — keeps label quality identical to Liberty mode.
        this.map = new maplibregl.Map({
            container: this.containerId,
            style: this._minimalBaseStyle(),
            center: [20, 48],
            zoom: 3,
            pitch: 0,
            bearing: 0,
            attributionControl: false,
            preserveDrawingBuffer: true
        });

        // Throttle label/symbol size updates to one rAF per zoom event burst —
        // 'zoom' can fire many times per frame during pinch/scroll gestures.
        this._sizeRafPending = false;
        this.map.on('zoom', () => {
            if (this._sizeRafPending) return;
            this._sizeRafPending = true;
            requestAnimationFrame(() => {
                this._sizeRafPending = false;
                this.updateLabelSizes();
                this.updateSymbolSizes();
            });
        });
        this._baseZoom = 3; // Reference zoom level for symbol sizing

        // Move pitch/rotate from right-click-drag to middle-mouse-drag
        // Disable default right-click drag rotate
        this.map.dragRotate.disable();

        // Middle mouse button drag for pitch/rotate
        let mmDragging = false, mmStartX = 0, mmStartY = 0, mmStartBearing = 0, mmStartPitch = 0;
        const canvas = this.map.getCanvas();

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1) { // middle mouse button
                e.preventDefault();
                mmDragging = true;
                mmStartX = e.clientX;
                mmStartY = e.clientY;
                mmStartBearing = this.map.getBearing();
                mmStartPitch = this.map.getPitch();
                this.map.dragPan.disable();
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!mmDragging) return;
            const dx = e.clientX - mmStartX;
            const dy = e.clientY - mmStartY;
            this.map.setBearing(mmStartBearing + dx * 0.5);
            this.map.setPitch(Math.max(0, Math.min(85, mmStartPitch - dy * 0.5)));
        });

        document.addEventListener('mouseup', (e) => {
            if (e.button === 1 && mmDragging) {
                mmDragging = false;
                this.map.dragPan.enable();
            }
        });

        // Prevent middle-click scroll/paste behavior on the map canvas
        canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

        // Keep the sidebar padding up-to-date on window resize and fullscreen toggle
        window.addEventListener('resize', () => this._applyMapPadding());
        document.addEventListener('fullscreenchange', () => this._applyMapPadding());

        return new Promise(resolve => {
            this.map.on('load', () => {
                // Set up initial minimal state (no tile server needed)
                this._setupMinimalLayers();
                this.setupHoverLayers();
                this._applyMapPadding();
                // Initial UI state for minimal mode
                this.showBorders = true;
                this.showLabels  = true;
                const mapContainer = document.querySelector('.map-container');
                if (mapContainer) mapContainer.classList.add('minimal-mode');
                const bordersEl = document.getElementById('showBorders');
                const labelsEl  = document.getElementById('showLabels');
                if (bordersEl) bordersEl.checked = true;
                if (labelsEl)  labelsEl.checked  = true;
                document.querySelectorAll('.satellite-only')
                    .forEach(el => el.style.display = 'flex');
                this.updateAttribution('minimal');

                // Wait for hover sources to be indexed before marking ready
                const checkInterval = setInterval(() => {
                    if (this.hoverSourcesReady) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 50);
                // Fallback: resolve after 3s no matter what
                setTimeout(() => {
                    clearInterval(checkInterval);
                    this.hoverSourcesReady = true;
                    resolve();
                }, 3000);
            });
        });
    }

    _applyMapPadding() {
        // Sidebar is laid out BESIDE the map (flex row), not over it.
        // The map canvas already excludes the sidebar, so no padding offset is needed.
        // This method is kept as a no-op in case future layout changes require it.
    }

    /**
     * Compensate symbol sizes for zoom level.
     * Symbols at fixed screen size look disproportionately huge when zoomed out.
     * This gently scales them down when zoomed out, up when zoomed in.
     */
    updateSymbolSizes() {
        const zoom = this.map.getZoom();
        // At reference zoom (4), symbols are at their base size
        // Each zoom level doubles/halves map scale, so we do a gentler factor
        const factor = Math.pow(2, (zoom - 4) * 0.25); // 0.25 = quarter-strength
        const clamped = Math.max(0.4, Math.min(2.0, factor));

        this.markers.forEach(m => {
            const el = m.getElement();
            if (!el || !el.classList.contains('map-effect')) return;
            const baseSize = parseFloat(el.dataset.effectSize) || 1;
            const scale = Math.max(0.5, Math.min(3, baseSize));
            const px = Math.round(48 * scale * clamped);
            el.style.width = px + 'px';
            el.style.height = px + 'px';
        });
    }

    updateLabelSizes() {
        const zoom = this.map.getZoom();
        const styleKey = document.getElementById('styleSelect').value;
        const isSatellite = styleKey === 'satellite';

        // Minimum zoom to show each tier (satellite only — other modes show all)
        // Tier: 1=huge nations, 2=large, 3=medium, 4=small, 5=tiny
        const minZoomByTier = [0, 1.5, 2.5, 3.5, 4.5, 5.5];
        // Extra font-size bonus per tier (bigger label for more important country)
        const tierBonus = [0, 5, 2, 0, -1, -2];

        const baseSizeSat = Math.max(10, Math.min(22, zoom * 2.8));
        const baseSizeLib = Math.max(8, Math.min(14, zoom * 1.5));

        document.querySelectorAll('.country-name-label').forEach(label => {
            const tier = parseInt(label.dataset.tier || '3');

            if (isSatellite) {
                const minZoom = minZoomByTier[tier] ?? 5.5;
                if (zoom < minZoom) {
                    label.style.display = 'none';
                    return;
                }
                label.style.display = '';
                const size = Math.max(10, baseSizeSat + (tierBonus[tier] ?? 0));
                label.style.fontSize = size + 'px';
                label.style.textShadow = '0 2px 6px #000, 0 0 20px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.5)';
                label.style.letterSpacing = '1px';
                label.style.textTransform = tier <= 2 ? 'uppercase' : 'none';
                label.style.fontWeight = tier <= 2 ? '700' : '600';
                label.style.color = '';

            } else {
                // Liberty
                label.style.display = '';
                label.style.fontSize = baseSizeLib + 'px';
                label.style.textShadow = '';
                label.style.letterSpacing = '';
                label.style.textTransform = '';
                label.style.fontWeight = '';
                label.style.color = '';
            }
        });
    }

    // ─── Hybrid satellite style: NASA raster + Liberty vector labels ───

    /**
     * Builds a MapLibre style that layers NASA GIBS satellite imagery underneath
     * the Liberty vector tile label/place-name layers.  This is the same technique
     * used by Google Maps, MapTiler Satellite, and Mapbox Satellite Streets —
     * proper collision-detection, zoom-scaling, and centroid placement come for free.
     *
     * We include all "symbol" layers from Liberty EXCEPT transportation/POI/waterway
     * labels, so only country, state, and place names appear.
     */
    _buildHybridSatelliteStyle() {
        const lib = this._libertyStyle;
        if (!lib || !lib.layers) return null;

        // Find the vector tile source key dynamically (OpenFreeMap uses 'openmaptiles')
        const vectorSourceKey = Object.keys(lib.sources || {}).find(k =>
            lib.sources[k].type === 'vector'
        );
        if (!vectorSourceKey) return null;

        // Whitelist: only pull place-name layers — country, state, city, water bodies.
        // Everything else (roads, POI, airports, shields…) is excluded automatically.
        const INCLUDE = ['label_country', 'label_state', 'label_city', 'label_capital',
                         'country_', 'state', 'water_name'];

        const labelLayers = lib.layers
            .filter(l => l.type === 'symbol')
            .filter(l => INCLUDE.some(pat => l.id.toLowerCase().includes(pat)))
            .map(l => {
                const layer = JSON.parse(JSON.stringify(l)); // deep clone
                if (!layer.paint) layer.paint = {};
                // Override text colours for satellite readability
                layer.paint['text-color'] = '#ffffff';
                layer.paint['text-halo-color'] = 'rgba(0,0,0,0.85)';
                layer.paint['text-halo-width'] = 2;
                layer.paint['text-halo-blur'] = 0.5;
                // Boost font size slightly so names are easier to read on dark imagery
                if (layer.layout && layer.layout['text-size']) {
                    const sz = layer.layout['text-size'];
                    // If it's a plain number, add 1; if it's an expression leave it
                    if (typeof sz === 'number') layer.layout['text-size'] = sz + 1;
                }
                return layer;
            });

        return {
            version: 8,
            glyphs: lib.glyphs,
            sprite: lib.sprite,
            sources: {
                nasa: {
                    type: 'raster',
                    tiles: [CONFIG.satellite.tiles],
                    tileSize: 256,
                    maxzoom: CONFIG.satellite.maxZoom
                },
                [vectorSourceKey]: lib.sources[vectorSourceKey]
            },
            layers: [
                { id: 'nasa-background', type: 'raster', source: 'nasa' },
                ...labelLayers
            ]
        };
    }

    // ─── Minimal style: self-contained atlas look — no tile server needed ───
    //
    // Base MapLibre style: solid ocean bg + OpenFreeMap glyph URL (font-only,
    // tiny cached .pbf files — no map tiles).  Three GeoJSON layers from Natural
    // Earth data, plus a native MapLibre symbol layer for country names (full
    // collision detection, zoom-based sizing, identical rendering to Liberty mode).

    _minimalBaseStyle() {
        return {
            version: 8,
            // Glyph server — serves font PBFs only, no tile data.
            // Same host as Liberty style; files are small and browser-cached.
            glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
            sources: {},
            layers: [{ id: 'bg', type: 'background',
                       paint: { 'background-color': '#c2d9ec' } }]
        };
    }

    _setupMinimalLayers() {
        this._minimalBorderIds = [];
        this._minimalLabelIds  = [];

        if (!this.geoData.countries) return;

        // ── 1. Land fill — parchment colour over the ocean background ──────────
        if (!this.map.getSource('minimal-land')) {
            this.map.addSource('minimal-land', {
                type: 'geojson',
                data: this.geoData.countries
            });
            this.map.addLayer({
                id: 'minimal-land',
                type: 'fill',
                source: 'minimal-land',
                paint: { 'fill-color': '#f0ebe0', 'fill-opacity': 1 }
            });
        }

        // ── 2. Country borders — Natural Earth GeoJSON ──────────────────────────
        //    No tolerance override: shared borders between adjacent countries must
        //    simplify to exactly the same path, otherwise one border appears as
        //    two diverging lines ("drawn twice").  MapLibre's default simplification
        //    is fine; visual smoothness comes from line-join:round and line-cap:round.
        if (!this.map.getSource('minimal-borders')) {
            this.map.addSource('minimal-borders', {
                type: 'geojson',
                data: this.geoData.countries
            });
            this.map.addLayer({
                id: 'minimal-border-line',
                type: 'line',
                source: 'minimal-borders',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': '#3a5c72',
                    'line-width': ['interpolate', ['linear'], ['zoom'],
                        0, 0.9, 4, 1.5, 8, 2.2, 12, 3.0],
                    'line-opacity': 1
                }
            });
            this._minimalBorderIds.push('minimal-border-line');
        }

        // ── 4. Country name labels — point GeoJSON with hand-tuned positions ──────
        //    We pre-compute label points using geoData.getCenter(), which has
        //    manually curated coordinates for tricky countries (USA, Russia,
        //    France with overseas territories, Indonesia, etc.) so labels never
        //    land in the ocean.  MapLibre's symbol engine handles collision
        //    detection and zoom-based sizing from there.
        if (!this.map.getSource('minimal-label-src')) {
            const SOVEREIGN = new Set(['Sovereign country', 'Country', 'Sovereignty']);
            const labelPoints = this.geoData.countries.features
                .filter(f => {
                    if (!SOVEREIGN.has(f.properties.TYPE)) return false;
                    // Exclude territories where a DIFFERENT country is the sovereign
                    // (Jersey/Guernsey/Isle of Man have TYPE=Country but SOVEREIGNT=United Kingdom)
                    const sov = f.properties.SOVEREIGNT || '';
                    const adm = f.properties.ADMIN || '';
                    if (sov && adm && sov !== adm) return false;
                    return true;
                })
                .map(f => {
                    const name = f.properties.NAME || f.properties.ADMIN;
                    if (!name) return null;
                    const center = this.geoData.getCenter(f.geometry, name);
                    return {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: center },
                        properties: {
                            NAME: name,
                            POP_EST: f.properties.POP_EST || 0
                        }
                    };
                })
                .filter(Boolean);

            this.map.addSource('minimal-label-src', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: labelPoints }
            });
            this.map.addLayer({
                id: 'minimal-country-labels',
                type: 'symbol',
                source: 'minimal-label-src',
                layout: {
                    'text-field': ['get', 'NAME'],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': ['interpolate', ['linear'], ['zoom'],
                        1, 9, 4, 11, 7, 13, 10, 15],
                    'text-transform': 'uppercase',
                    'text-letter-spacing': 0.07,
                    'text-max-width': 5,
                    'symbol-placement': 'point',
                    'symbol-sort-key': ['*', -1, ['to-number', ['get', 'POP_EST'], 0]]
                },
                paint: {
                    'text-color': '#2c3e50',
                    'text-halo-color': 'rgba(240,235,224,0.92)',
                    'text-halo-width': 1.5,
                    'text-halo-blur': 0.5,
                    'text-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0, 2, 1]
                }
            });
            this._minimalLabelIds.push('minimal-country-labels');
        }
    }

    _makeGraticule(step) {
        const features = [];
        for (let lat = -90 + step; lat < 90; lat += step) {
            features.push({ type: 'Feature', properties: {},
                geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] }});
        }
        for (let lon = -180 + step; lon < 180; lon += step) {
            features.push({ type: 'Feature', properties: {},
                geometry: { type: 'LineString', coordinates: [[lon, -85], [lon, 85]] }});
        }
        return { type: 'FeatureCollection', features };
    }

    // ─── Style switching ───

    setStyle(styleKey) {
        this.removeBorderLayer();
        this.removeLabelMarkers();

        // Save colored features to re-apply after style switch
        const savedFeatures = [...this._coloredFeatures];

        const onStyleReady = () => {
            this.setupHoverLayers();

            // Re-apply colored countries/regions (clear tracking first to avoid duplicates)
            this._coloredFeatures = [];
            for (const { feature, color, animation } of savedFeatures) {
                this.drawFeature(feature, color, animation === 'occupied' ? 'occupied' : 'none');
            }

            const mapContainer = document.querySelector('.map-container');
            const bordersEl = document.getElementById('showBorders');
            const labelsEl  = document.getElementById('showLabels');

            if (styleKey === 'satellite') {
                this.showBorders = true;
                this.showLabels  = true;
                if (bordersEl) bordersEl.checked = true;
                if (labelsEl)  labelsEl.checked  = true;
                document.querySelectorAll('.satellite-only').forEach(el => el.style.display = 'flex');
                if (mapContainer) mapContainer.classList.remove('minimal-mode');
                this.addBorderLayer();
                // In hybrid mode, labels are built into the map style itself (vector tiles) —
                // no DOM markers needed. Fall back to DOM markers only if hybrid failed.
                if (!this._satelliteIsHybrid) this.addLabelMarkers();

            } else if (styleKey === 'minimal') {
                this._setupMinimalLayers();
                this.showBorders = true;
                this.showLabels  = true;
                if (bordersEl) bordersEl.checked = true;
                if (labelsEl)  labelsEl.checked  = true;
                document.querySelectorAll('.satellite-only').forEach(el => el.style.display = 'flex');
                if (mapContainer) mapContainer.classList.add('minimal-mode');

            } else {
                this.hideClutter();
                this.showBorders = false;
                this.showLabels  = false;
                if (bordersEl) bordersEl.checked = false;
                if (labelsEl)  labelsEl.checked  = false;
                document.querySelectorAll('.satellite-only').forEach(el => el.style.display = 'none');
                if (mapContainer) mapContainer.classList.remove('minimal-mode');
            }
        };

        // Register listeners BEFORE setStyle to avoid missing synchronous events
        let fired = false;
        const runOnce = () => {
            if (fired) return;
            fired = true;
            onStyleReady();
        };
        this.map.once('style.load', runOnce);
        this.map.once('idle', runOnce);

        if (styleKey === 'satellite') {
            if (!this._libertyStyle) {
                // Fetch Liberty in the background; when it arrives, upgrade from
                // NASA-only to the full hybrid (labels + imagery) automatically
                fetch(CONFIG.styles.liberty)
                    .then(r => r.json())
                    .then(style => {
                        delete style.center;
                        delete style.zoom;
                        this._libertyStyle = style;
                        // Upgrade to hybrid if still in satellite mode
                        if (document.getElementById('styleSelect')?.value === 'satellite'
                            && !this._satelliteIsHybrid) {
                            this.setStyle('satellite');
                        }
                    })
                    .catch(() => {});
            }
            const hybrid = this._buildHybridSatelliteStyle();
            this._satelliteIsHybrid = !!hybrid;
            this.map.setStyle(hybrid ?? {
                version: 8,
                sources: {
                    nasa: { type: 'raster', tiles: [CONFIG.satellite.tiles], tileSize: 256, maxzoom: CONFIG.satellite.maxZoom }
                },
                layers: [{ id: 'nasa-background', type: 'raster', source: 'nasa' }]
            });
            this.updateAttribution('satellite');
        } else if (styleKey === 'minimal') {
            // Completely self-contained — bare style, no tile server
            this._satelliteIsHybrid = false;
            this.map.setStyle(this._minimalBaseStyle());
            this.updateAttribution('minimal');
        } else {
            // Liberty (or any future vector style) — fetch lazily on first use
            this._satelliteIsHybrid = false;
            if (!this._libertyStyle) {
                fetch(CONFIG.styles.liberty)
                    .then(r => r.json())
                    .then(style => { delete style.center; delete style.zoom; this._libertyStyle = style; })
                    .catch(() => {});
            }
            this.map.setStyle(this._libertyStyle ?? CONFIG.styles[styleKey]);
            this.updateAttribution('vector');
        }

        // Extra safety: if neither event fires within 2s, force it
        setTimeout(runOnce, 2000);
    }

    updateAttribution(type) {
        const el = document.querySelector('.map-attribution');
        if (!el) return;
        if (type === 'satellite') {
            el.innerHTML = '© <a href="https://earthdata.nasa.gov/gibs" target="_blank">NASA GIBS</a>';
        } else if (type === 'minimal') {
            el.innerHTML = '© <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a><br><a href="https://naturalearthdata.com" target="_blank">Natural Earth</a>';
        } else {
            el.innerHTML = '© <a href="https://openfreemap.org" target="_blank">OpenFreeMap</a><br><a href="https://naturalearthdata.com" target="_blank">Natural Earth</a>';
        }
    }

    // ─── Hover layers ───

    setupHoverLayers() {
        if (!this.geoData.countries) return;

        this.hoverSourcesReady = false;

        const currentCenter = this.map.getCenter();
        const currentZoom = this.map.getZoom();

        if (!this.map.getSource('hover-countries')) {
            this.map.addSource('hover-countries', {
                type: 'geojson',
                data: this.geoData.countries
            });
            this.map.addLayer({
                id: 'hover-countries',
                type: 'fill',
                source: 'hover-countries',
                paint: { 'fill-opacity': 0 }
            });
        }

        if (!this.map.getSource('hover-regions')) {
            this.map.addSource('hover-regions', {
                type: 'geojson',
                data: this.geoData.regions
            });
            this.map.addLayer({
                id: 'hover-regions',
                type: 'fill',
                source: 'hover-regions',
                paint: { 'fill-opacity': 0 }
            });
        }

        this.map.jumpTo({ center: currentCenter, zoom: currentZoom });

        // Wait for both hover sources to be indexed before marking ready
        let sourcesLoaded = 0;
        const checkReady = () => {
            sourcesLoaded++;
            if (sourcesLoaded >= 2) {
                this.map.off('sourcedata', onSourceData);
                this.hoverSourcesReady = true;
            }
        };
        const onSourceData = (e) => {
            if (e.isSourceLoaded && (e.sourceId === 'hover-countries' || e.sourceId === 'hover-regions')) {
                checkReady();
            }
        };
        this.map.on('sourcedata', onSourceData);
        // Fallback: mark ready after idle
        this.map.once('idle', () => {
            if (sourcesLoaded < 2) {
                this.map.off('sourcedata', onSourceData);
                this.hoverSourcesReady = true;
            }
        });

        const popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: 'hover-popup'
        });

        this.map.on('mousemove', 'hover-regions', e => {
            if (e.features[0]) {
                const p = e.features[0].properties;
                popup.setLngLat(e.lngLat)
                    .setHTML(`<strong>${p.name || p.NAME}</strong> · ${p.admin || p.ADMIN}`)
                    .addTo(this.map);
            }
        });

        this.map.on('mouseleave', 'hover-regions', () => popup.remove());
    }

    // ─── Border / label toggles ───

    toggleBorders(show) {
        this.showBorders = show;
        if (document.getElementById('styleSelect').value === 'minimal') {
            const vis = show ? 'visible' : 'none';
            (this._minimalBorderIds || []).forEach(id => {
                try { this.map.setLayoutProperty(id, 'visibility', vis); } catch (_) {}
            });
        } else {
            if (show) this.addBorderLayer();
            else this.removeBorderLayer();
        }
    }

    addBorderLayer() {
        if (!this.geoData.countries || this.map.getSource('border-layer')) return;

        this.map.addSource('border-layer', {
            type: 'geojson',
            data: this.geoData.countries
        });
        this.map.addLayer({
            id: 'border-lines',
            type: 'line',
            source: 'border-layer',
            paint: {
                'line-color': '#fff',
                'line-width': 1,
                'line-opacity': 0.6
            }
        }, this._getFirstLabelLayerId());
    }

    removeBorderLayer() {
        if (this.map.getLayer('border-lines')) this.map.removeLayer('border-lines');
        if (this.map.getSource('border-layer')) this.map.removeSource('border-layer');
    }

    removeConnectionLines() {
        // Connection lines are drawn as 'line-N' sources with 'line-N-line' layers
        this.layers = this.layers.filter(id => {
            if (/^line-\d+-line$/.test(id)) {
                if (this.map.getLayer(id)) this.map.removeLayer(id);
                return false;
            }
            return true;
        });
        // Remove the corresponding GeoJSON sources
        for (const id of [...this.sourceIds]) {
            if (/^line-\d+$/.test(id)) {
                if (this.map.getSource(id)) this.map.removeSource(id);
                this.sourceIds.delete(id);
            }
        }
    }

    toggleLabels(show) {
        this.showLabels = show;
        const styleKey = document.getElementById('styleSelect').value;
        const vis = show ? 'visible' : 'none';

        if (styleKey === 'minimal') {
            // Minimal: label is a native MapLibre symbol layer — toggle visibility
            (this._minimalLabelIds || []).forEach(id => {
                try { this.map.setLayoutProperty(id, 'visibility', vis); } catch (_) {}
            });
        } else if (this._satelliteIsHybrid) {
            // Hybrid satellite: label layers are part of the map style
            (this.map.getStyle()?.layers ?? [])
                .filter(l => l.type === 'symbol' && l.id !== 'nasa-background')
                .forEach(l => {
                    try { this.map.setLayoutProperty(l.id, 'visibility', vis); } catch (_) {}
                });
        } else {
            // Satellite fallback / liberty without built-in labels: use DOM markers
            if (show) this.addLabelMarkers();
            else this.removeLabelMarkers();
        }
    }

    addLabelMarkers() {
        if (!this.geoData.countries) return;
        this.removeLabelMarkers();

        this.geoData.countries.features.forEach(f => {
            const name = f.properties.NAME || f.properties.ADMIN;
            if (!name) return;

            // Skip tiny territories/dependencies — they clutter the satellite view
            const type = (f.properties.TYPE || f.properties.FEATURECLA || '').toLowerCase();
            const sovereignt = (f.properties.SOVEREIGNT || '').toLowerCase();
            const admin = (f.properties.ADMIN || '').toLowerCase();
            const isDependency = sovereignt && sovereignt !== admin &&
                !['united states of america', 'united kingdom', 'france'].includes(sovereignt);
            if (isDependency) return;

            const center = this.geoData.getCenter(f.geometry, name);

            // Bounding box area as importance proxy (degree²)
            const bounds = this.geoData.getBounds(f.geometry);
            const bboxArea = (bounds[1][0] - bounds[0][0]) * (bounds[1][1] - bounds[0][1]);

            // Tier 1=huge, 2=large, 3=medium, 4=small, 5=tiny
            const tier = bboxArea > 600 ? 1
                       : bboxArea > 100 ? 2
                       : bboxArea > 20  ? 3
                       : bboxArea > 3   ? 4
                       : 5;

            const el = document.createElement('div');
            el.className = 'country-name-label';
            el.textContent = name;
            el.dataset.tier = tier;

            const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat(center)
                .addTo(this.map);
            this.labelMarkers.push(marker);
        });

        this.updateLabelSizes();
    }

    removeLabelMarkers() {
        this.labelMarkers.forEach(m => m.remove());
        this.labelMarkers = [];
    }

    /**
     * Place a bubble as a fixed subtitle at the bottom-centre of the map
     * instead of at a geographic coordinate.  Returns a pseudo-marker object
     * that is compatible with removeLastMarker() / clearAll().
     */
    addSubtitleBubble(element) {
        const container = document.querySelector('.map-container');
        if (!container) return null;
        element.classList.add('subtitle-bubble');

        // Use position:fixed so the subtitle is always visible regardless of
        // .map-container's rendered height or any overflow:hidden ancestors.
        const rect = container.getBoundingClientRect();
        element.style.position  = 'fixed';
        element.style.bottom    = (window.innerHeight - rect.bottom + 10) + 'px';
        element.style.left      = (rect.left + rect.width * 0.5) + 'px';
        element.style.transform = 'translateX(-50%)';
        element.style.width     = Math.min(Math.round(rect.width * 0.72), 860) + 'px';
        element.style.zIndex    = '9999';

        document.body.appendChild(element);
        const pseudo = {
            getElement: () => element,
            remove:     () => element.remove(),
            setLngLat:  () => pseudo,
            getLngLat:  () => null
        };
        this.markers.push(pseudo);
        this.lastMarker = pseudo;
        return pseudo;
    }

    // ─── Feature drawing ───

    drawFeature(feature, color, animation = 'none', isRegion = false) {
        const id = 'layer-' + (++this.layerCounter);

        // Track for re-apply on style switch (sourceId enables selective clearing)
        this._coloredFeatures.push({ feature, color, animation, sourceId: id, isRegion });

        this.addGeoSource(id, feature);

        // Diagonal stripes for occupied territories
        if (animation === 'striped' || animation === 'disputed' || animation === 'occupied') {
            const patternId = 'stripe-pattern-' + id;
            const stripeColor = this.adjustColorBrightness(color, -30);

            this.createDiagonalPattern(patternId, stripeColor, color);

            this.addFillLayer(id + '-fill', id, color, 0.8, { pattern: patternId });
            this.addLineLayer(id + '-line', id, stripeColor, 3, 1, { dasharray: [6, 3] });
            return;
        }

        // Normal fill + border — both inserted below labels
        this.addFillLayer(id + '-fill', id, color, 0);
        this.map.addLayer({
            id: id + '-line',
            type: 'line',
            source: id,
            paint: {
                'line-color': color,
                'line-width': 0,
                'line-opacity': 0,
                'line-blur': 3
            }
        }, this._getFirstLabelLayerId());
        this.layers.push(id + '-line');

        // Helper: rAF-based tween — GPU-synced, no setInterval jank
        const tween = (durationMs, onTick, onDone) => {
            const start = performance.now();
            const tick = (now) => {
                const t = Math.min(1, (now - start) / durationMs);
                onTick(t);
                if (t < 1) requestAnimationFrame(tick);
                else if (onDone) onDone();
            };
            requestAnimationFrame(tick);
        };

        const safeSet = (layerId, prop, val) => {
            if (this.map.getLayer(layerId)) this.map.setPaintProperty(layerId, prop, val);
        };

        // Animations
        if (animation === 'pulse') {
            tween(1800, t => {
                const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
                safeSet(id + '-fill', 'fill-opacity', e * 0.7);
                safeSet(id + '-line', 'line-width', 6 - e * 2);
                safeSet(id + '-line', 'line-opacity', Math.min(e * 1.2, 1));
            }, () => {
                safeSet(id + '-fill', 'fill-opacity', 0.7);
                safeSet(id + '-line', 'line-width', 4);
                safeSet(id + '-line', 'line-opacity', 1);
            });

        } else if (animation === 'fade') {
            tween(1500, t => {
                safeSet(id + '-fill', 'fill-opacity', t * 0.7);
                safeSet(id + '-line', 'line-width', 3);
                safeSet(id + '-line', 'line-opacity', t * 0.7);
            });

        } else if (animation === 'radial') {
            tween(1800, t => {
                const e = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; // ease-in-out cubic
                safeSet(id + '-fill', 'fill-opacity', e * 0.7);
                safeSet(id + '-line', 'line-width', 8 - e * 4);
                safeSet(id + '-line', 'line-opacity', Math.min(e * 1.5, 1));
            }, () => {
                safeSet(id + '-fill', 'fill-opacity', 0.7);
                safeSet(id + '-line', 'line-width', 4);
            });

        } else if (animation === 'sweep') {
            safeSet(id + '-fill', 'fill-opacity', 0);
            safeSet(id + '-line', 'line-width', 8);
            safeSet(id + '-line', 'line-opacity', 1);
            tween(1800, t => {
                safeSet(id + '-fill', 'fill-opacity', Math.max(0, (t - 0.3) / 0.7) * 0.7);
                safeSet(id + '-line', 'line-width', 8 - t * 4);
            }, () => {
                safeSet(id + '-fill', 'fill-opacity', 0.7);
                safeSet(id + '-line', 'line-width', 4);
            });

        } else {
            setTimeout(() => {
                this.map.setPaintProperty(id + '-fill', 'fill-opacity', 0.7);
                this.map.setPaintProperty(id + '-line', 'line-width', 4);
                this.map.setPaintProperty(id + '-line', 'line-opacity', 0.9);
            }, 50);
        }
    }

    // ─── Lines (dashed, subtle) ───

    drawLine(fromFeature, toFeature, color) {
        const id = 'line-' + (++this.layerCounter);
        const fromCenter = this.geoData.getCenter(fromFeature.geometry, fromFeature.properties.NAME);
        const toCenter = this.geoData.getCenter(toFeature.geometry, toFeature.properties.NAME);

        this.addGeoSource(id, {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [fromCenter, toCenter] }
        });

        this.addLineLayer(id + '-line', id, color, 2, 0.6, { dasharray: [6, 4] });
    }

    // ─── Attack arrows (canvas overlay — screen-space) ───

    initArrowCanvas() {
        if (this.arrowCanvas) return;
        const container = document.querySelector('.map-container');
        this.arrowCanvas = document.createElement('canvas');
        this.arrowCanvas.className = 'arrow-overlay';
        this.arrowCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
        container.appendChild(this.arrowCanvas);
        this.arrowCtx = this.arrowCanvas.getContext('2d');
        this.arrows = [];
        this._arrowRafPending = false;

        // Throttle redraws to one per animation frame — map fires 'move' dozens of
        // times per second during pan/zoom/fly; requesting a new frame each time
        // causes GPU thrashing and visible stuttering.
        const scheduleRedraw = () => {
            if (this._arrowRafPending) return;
            this._arrowRafPending = true;
            requestAnimationFrame(() => {
                this._arrowRafPending = false;
                this.renderArrows();
            });
        };
        this.map.on('move', scheduleRedraw);
        this.map.on('resize', scheduleRedraw);
    }

    drawAttackArrow(fromFeature, toFeature, color, curve = 0.15, width = 1, headSize = null) {
        const fromName = fromFeature.properties.NAME || fromFeature.properties.ADMIN;
        const toName = toFeature.properties.NAME || toFeature.properties.ADMIN;
        const fromCenter = this.geoData.getCenter(fromFeature.geometry, fromName);
        const toCenter = this.geoData.getCenter(toFeature.geometry, toName);
        this.addArrow(fromCenter, toCenter, color, curve, { fromName, toName }, width, headSize);
    }

    addArrow(from, to, color, curve = 0.15, meta = {}, width = 1, headSize = null, animation = 'none', drawDuration = 800) {
        this.initArrowCanvas();
        this.initArrowDragEditing();
        const arrow = { from, to, color, curve, meta, width, headSize: headSize ?? width, animation, animProgress: 1, drawDuration, scriptLine: -1 };
        this.arrows.push(arrow);
        // Always animate drawing from start point when first placed
        arrow.animation = 'draw';
        arrow.animProgress = 0;
        this._animateArrow(arrow, () => {
            // After draw-in completes, set to the intended animation (or none)
            arrow.animation = animation;
            arrow.animProgress = 1;
        });
        return arrow;
    }

    /**
     * Generate script line text from an arrow object.
     * Format: attack: from lat lng, to lat lng, color name, curve 0.15, width 1.00, head 1.00, dur 800
     */
    arrowToScript(arrow) {
        const fromLat = arrow.from[1].toFixed(2), fromLng = arrow.from[0].toFixed(2);
        const toLat = arrow.to[1].toFixed(2), toLng = arrow.to[0].toFixed(2);
        const colorEntry = Object.entries(CONFIG.colors).find(([, hex]) => hex === arrow.color);
        const color = colorEntry ? colorEntry[0] : arrow.color;
        const curve = (arrow.curve || 0.15).toFixed(2);
        const width = (arrow.width || 1).toFixed(2);
        const head = (arrow.headSize ?? arrow.width ?? 1).toFixed(2);
        const dur = Math.round(arrow.drawDuration || 800);
        return `attack: from ${fromLat} ${fromLng}, to ${toLat} ${toLng}, color ${color}, curve ${curve}, width ${width}, head ${head}, dur ${dur}`;
    }

    _animateArrow(arrow, onComplete) {
        const duration = arrow.drawDuration || 800;
        const start = performance.now();
        arrow.animProgress = 0;
        const tick = (now) => {
            const t = Math.min(1, (now - start) / duration);
            // Ease out cubic
            arrow.animProgress = 1 - Math.pow(1 - t, 3);
            this.renderArrows();
            if (t < 1) {
                requestAnimationFrame(tick);
            } else if (onComplete) {
                onComplete();
            }
        };
        requestAnimationFrame(tick);
    }

    renderArrows() {
        if (!this.arrowCanvas || !this.arrowCtx) return;
        const canvas = this.arrowCanvas;
        const ctx = this.arrowCtx;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        const needW = Math.round(rect.width * dpr);
        const needH = Math.round(rect.height * dpr);

        // Resizing canvas.width/height flushes the GPU texture and resets the context —
        // it is expensive and causes visible stuttering during pan/zoom/fly.
        // Only do it when the container actually changes size.
        if (canvas.width !== needW || canvas.height !== needH) {
            canvas.width = needW;
            canvas.height = needH;
        }

        // Use setTransform (absolute) instead of scale() (cumulative) so we never
        // accidentally compound the DPR scale across redraws.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);

        const selIdx = this._selectedArrowIdx ?? -1;

        for (let i = 0; i < this.arrows.length; i++) {
            const arrow = this.arrows[i];

            // Highlight selected arrow with a glow
            if (i === selIdx) {
                ctx.save();
                ctx.shadowColor = 'rgba(102, 126, 234, 0.6)';
                ctx.shadowBlur = 12;
                this.drawArrowOnCanvas(ctx, arrow);
                ctx.restore();
            } else {
                this.drawArrowOnCanvas(ctx, arrow);
            }

            // Draw handles for selected arrow
            if (i === selIdx) {
                const p1 = this.map.project(arrow.from);
                const p2 = this.map.project(arrow.to);
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const px = -dy / dist, py = dx / dist;
                const co = dist * arrow.curve;
                const cp = { x: (p1.x + p2.x) / 2 + px * co, y: (p1.y + p2.y) / 2 + py * co };

                // Dashed line from midpoint to curve handle
                const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(mid.x, mid.y);
                ctx.lineTo(cp.x, cp.y);
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.restore();

                // Handles
                const handles = [
                    { x: p1.x, y: p1.y, fill: '#4ade80', icon: '\u25C0' },  // start: green ◀
                    { x: p2.x, y: p2.y, fill: '#ef4444', icon: '\u25B6' },  // end: red ▶
                    { x: cp.x, y: cp.y, fill: '#facc15', icon: '\u25CF' }   // curve: yellow ●
                ];
                for (const h of handles) {
                    ctx.save();
                    // White circle with colored border
                    ctx.beginPath();
                    ctx.arc(h.x, h.y, 8, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.85)';
                    ctx.fill();
                    ctx.strokeStyle = h.fill;
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                    // Icon
                    ctx.fillStyle = h.fill;
                    ctx.font = 'bold 8px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(h.icon, h.x, h.y);
                    ctx.restore();
                }
            }
        }
    }

    drawArrowOnCanvas(ctx, arrow) {
        const p1 = this.map.project(arrow.from);
        const p2 = this.map.project(arrow.to);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) return;

        const anim = arrow.animation || 'none';
        const prog = arrow.animProgress ?? 1;

        // Fade animation — control global alpha
        if (anim === 'fade' && prog < 1) {
            ctx.save();
            ctx.globalAlpha = prog;
        }

        // Pulse animation — add glow that fades out
        if (anim === 'pulse' && prog < 1) {
            ctx.save();
            ctx.shadowColor = arrow.color;
            ctx.shadowBlur = 20 * (1 - prog);
        }

        // Perpendicular for curve
        const nx = -dy / dist;
        const ny = dx / dist;
        const curveOffset = dist * arrow.curve;
        const cp = {
            x: (p1.x + p2.x) / 2 + nx * curveOffset,
            y: (p1.y + p2.y) / 2 + ny * curveOffset
        };

        // Arrowhead sizing — independent shaft width and head size
        const shaftScale = arrow.width || 1;
        const headScale = arrow.headSize ?? shaftScale;
        const headLen = Math.max(14, Math.min(32, dist * 0.1)) * headScale;
        const headHalfW = headLen * 0.42;
        const shaftW = Math.max(2, Math.min(4, dist * 0.012)) * shaftScale;

        // Bezier helper
        const bPt = (t) => ({
            x: (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * cp.x + t * t * p2.x,
            y: (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * cp.y + t * t * p2.y
        });

        // Bezier tangent (derivative)
        const bTan = (t) => ({
            x: 2 * (1 - t) * (cp.x - p1.x) + 2 * t * (p2.x - cp.x),
            y: 2 * (1 - t) * (cp.y - p1.y) + 2 * t * (p2.y - cp.y)
        });

        // Find t where the shaft ends (headLen pixels before the tip)
        // Use binary search for accuracy
        let lo = 0.5, hi = 1.0;
        for (let i = 0; i < 30; i++) {
            const mid = (lo + hi) / 2;
            const pt = bPt(mid);
            const d = Math.sqrt((pt.x - p2.x) ** 2 + (pt.y - p2.y) ** 2);
            if (d > headLen) lo = mid;
            else hi = mid;
        }
        const tEnd = (lo + hi) / 2;

        // Tangent at tip for arrowhead direction
        const tan = bTan(0.99);
        const tanLen = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
        const tx = tan.x / tanLen;
        const ty = tan.y / tanLen;
        const tpx = -ty; // perpendicular
        const tpy = tx;

        // ── Shaft — extends all the way to the tip ──
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
        ctx.strokeStyle = arrow.color;
        ctx.lineWidth = shaftW;
        ctx.lineCap = 'round';
        // Draw animation — reveal the shaft progressively using lineDash
        if (anim === 'draw' && prog < 1) {
            const totalLen = dist * 1.3; // approximate bezier arc length
            ctx.setLineDash([totalLen * prog, totalLen]);
        }
        ctx.stroke();
        ctx.restore();

        // ── Arrowhead: open V-shape (two stroked lines from tip to wings) ──
        // For draw animation, only show head when progress > 0.7
        const headAlpha = anim === 'draw' ? Math.max(0, (prog - 0.7) / 0.3) : 1;
        if (headAlpha > 0) {
            const base = bPt(tEnd);
            const wingL = { x: base.x + tpx * headHalfW, y: base.y + tpy * headHalfW };
            const wingR = { x: base.x - tpx * headHalfW, y: base.y - tpy * headHalfW };

            ctx.save();
            if (headAlpha < 1) ctx.globalAlpha = (ctx.globalAlpha || 1) * headAlpha;
            ctx.beginPath();
            ctx.moveTo(wingL.x, wingL.y);
            ctx.lineTo(p2.x, p2.y);       // tip
            ctx.lineTo(wingR.x, wingR.y);
            ctx.strokeStyle = arrow.color;
            ctx.lineWidth = Math.max(shaftW, 2) * headScale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.restore();
        }

        // Restore animation contexts
        if ((anim === 'fade' || anim === 'pulse') && prog < 1) {
            ctx.restore();
        }
    }

    clearAttackArrows() {
        this.arrows = [];
        if (this.arrowCtx) {
            this.arrowCtx.clearRect(0, 0, this.arrowCanvas.width, this.arrowCanvas.height);
        }
    }

    /**
     * Hit-test arrows at a screen point. Returns {arrow, index} if hit, null otherwise.
     */
    hitTestArrow(point) {
        if (!this.arrows || !this.arrows.length) return null;
        const idx = this._hitTestScreen(point.x, point.y);
        if (idx === null) return null;
        return { arrow: this.arrows[idx], index: idx };
    }

    removeArrow(index) {
        if (index >= 0 && index < this.arrows.length) {
            this.arrows.splice(index, 1);
            this.renderArrows();
        }
    }

    // ─── Arrow selection & drag editing (PowerPoint-style) ───

    initArrowDragEditing() {
        if (this._arrowDragInitialized) return;
        this._arrowDragInitialized = true;
        this._selectedArrowIdx = -1;
        this._draggingHandle = null;
        this._isDragging = false;

        const canvas = this.arrowCanvas;

        // CRITICAL: Canvas pointer-events are OFF by default.
        // Only enable when hovering over an arrow or when an arrow is selected.
        canvas.style.pointerEvents = 'none';

        // Use map click to detect arrow clicks via hit-testing the map point
        this.map.on('click', (e) => {
            if (this._isDragging) return;
            const hit = this._hitTestScreen(e.point.x, e.point.y);
            if (hit !== null) {
                this._selectedArrowIdx = hit;
                canvas.style.pointerEvents = 'auto';
                this.renderArrows();
            } else if (this._selectedArrowIdx >= 0) {
                this._selectedArrowIdx = -1;
                canvas.style.pointerEvents = 'none';
                this.renderArrows();
            }
        });

        // Right-click: check for arrow hit, then fire contextmenu
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this._selectedArrowIdx >= 0) {
                this._selectedArrowIdx = -1;
                this.renderArrows();
            }
            // Pass through to map
            canvas.style.pointerEvents = 'none';
            const rect = this.map.getCanvas().getBoundingClientRect();
            const point = new maplibregl.Point(
                e.clientX - rect.left,
                e.clientY - rect.top
            );
            this.map.fire('contextmenu', {
                point: point,
                lngLat: this.map.unproject(point),
                originalEvent: e
            });
        });

        // When canvas has pointer events (arrow selected), handle handle-dragging
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            if (this._selectedArrowIdx >= 0) {
                const handle = this._findHandle(mx, my, this.arrows[this._selectedArrowIdx]);
                if (handle) {
                    e.stopPropagation();
                    e.preventDefault();
                    this._draggingHandle = handle;
                    this._isDragging = true;
                    this.map.dragPan.disable();
                    return;
                }
                // Click on arrow body — keep selected
                const hit = this._hitTestScreen(mx, my);
                if (hit !== null) {
                    e.stopPropagation();
                    e.preventDefault();
                    this._selectedArrowIdx = hit;
                    this.renderArrows();
                    return;
                }
                // Clicked empty space — deselect, pass through
                this._selectedArrowIdx = -1;
                canvas.style.pointerEvents = 'none';
                this.renderArrows();
            }
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!this._isDragging || !this._draggingHandle) return;
            e.stopPropagation();
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const arrow = this.arrows[this._selectedArrowIdx];
            if (!arrow) return;

            if (this._draggingHandle === 'from') {
                const ll = this.map.unproject([mx, my]);
                arrow.from = [ll.lng, ll.lat];
            } else if (this._draggingHandle === 'to') {
                const ll = this.map.unproject([mx, my]);
                arrow.to = [ll.lng, ll.lat];
            } else if (this._draggingHandle === 'curve') {
                const p1 = this.map.project(arrow.from);
                const p2 = this.map.project(arrow.to);
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const px = -dy / dist, py = dx / dist;
                const ox = mx - (p1.x + p2.x) / 2;
                const oy = my - (p1.y + p2.y) / 2;
                arrow.curve = (ox * px + oy * py) / dist;
            }
            this.renderArrows();
        });

        const endDrag = () => {
            if (this._isDragging) {
                this.map.dragPan.enable();
                this._draggingHandle = null;
                this._isDragging = false;
                this.renderArrows();
                // Notify about the edit so the script can be updated
                const arrow = this.arrows[this._selectedArrowIdx];
                if (arrow && this.onArrowEdited) this.onArrowEdited(arrow);
            }
        };
        canvas.addEventListener('mouseup', endDrag);
        canvas.addEventListener('mouseleave', endDrag);

        // Hover: update cursor based on arrow/handle proximity
        // Use map mousemove (works even when canvas has no pointer events)
        this.map.on('mousemove', (e) => {
            if (this._isDragging) return;
            if (!this.arrows.length) return;

            if (this._selectedArrowIdx >= 0) {
                const handle = this._findHandle(e.point.x, e.point.y, this.arrows[this._selectedArrowIdx]);
                canvas.style.cursor = handle ? 'grab' : 'default';
            } else {
                const hit = this._hitTestScreen(e.point.x, e.point.y);
                this.map.getCanvas().style.cursor = hit !== null ? 'pointer' : '';
            }
        });

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._selectedArrowIdx >= 0) {
                this._selectedArrowIdx = -1;
                canvas.style.pointerEvents = 'none';
                this.renderArrows();
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && this._selectedArrowIdx >= 0) {
                if (!e.target.matches('input, textarea, select')) {
                    this.removeArrow(this._selectedArrowIdx);
                    this._selectedArrowIdx = -1;
                    canvas.style.pointerEvents = 'none';
                    e.preventDefault();
                }
            }
        });
    }

    _findHandle(mx, my, arrow) {
        if (!arrow) return null;
        const p1 = this.map.project(arrow.from);
        const p2 = this.map.project(arrow.to);
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = -dy / dist, ny = dx / dist;
        const co = dist * arrow.curve;
        const cp = { x: (p1.x + p2.x) / 2 + nx * co, y: (p1.y + p2.y) / 2 + ny * co };

        const handles = [
            { name: 'from', x: p1.x, y: p1.y },
            { name: 'to', x: p2.x, y: p2.y },
            { name: 'curve', x: cp.x, y: cp.y }
        ];
        const pickRadius = 16;
        for (const h of handles) {
            if (Math.sqrt((mx - h.x) ** 2 + (my - h.y) ** 2) < pickRadius) return h.name;
        }
        return null;
    }

    _hitTestScreen(mx, my) {
        if (!this.arrows || !this.arrows.length) return null;
        const threshold = 20;
        for (let i = this.arrows.length - 1; i >= 0; i--) {
            const arrow = this.arrows[i];
            const p1 = this.map.project(arrow.from);
            const p2 = this.map.project(arrow.to);
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / dist, ny = dx / dist;
            const co = dist * arrow.curve;
            const cp = { x: (p1.x + p2.x) / 2 + nx * co, y: (p1.y + p2.y) / 2 + ny * co };

            for (let t = 0; t <= 1; t += 0.02) {
                const bx = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * cp.x + t * t * p2.x;
                const by = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * cp.y + t * t * p2.y;
                if (Math.sqrt((mx - bx) ** 2 + (my - by) ** 2) < threshold) return i;
            }
        }
        return null;
    }

    // ─── Year overlay ───

    setYearOverlay(text, highlight = false) {
        const overlay = document.getElementById('yearOverlay');
        if (overlay) {
            overlay.textContent = text;
            overlay.classList.add('visible');
            if (highlight) overlay.classList.add('highlight');
            else overlay.classList.remove('highlight');
        }
    }

    hideYearOverlay() {
        const overlay = document.getElementById('yearOverlay');
        if (overlay) {
            overlay.classList.remove('visible');
            overlay.classList.remove('highlight');
        }
    }

    // ─── Markers ───

    addMarker(element, lngLat, anchor = 'center') {
        if (isNaN(lngLat[0]) || isNaN(lngLat[1])) {
            console.error('Invalid coordinates for marker:', lngLat);
            return null;
        }

        if (element.classList.contains('map-bubble')) {
            const pixel = this.map.project(lngLat);
            const bubbleWidth = 420;
            const bubbleHeight = 80;

            const yearBadgeArea = { left: 0, top: 0, right: 300, bottom: 100 };
            let offsetY = 0;

            if (pixel.x < yearBadgeArea.right && pixel.y < yearBadgeArea.bottom) {
                offsetY = yearBadgeArea.bottom - pixel.y + 20;
            }

            for (const pos of this.bubblePositions) {
                const dx = Math.abs(pixel.x - pos.x);
                const dy = Math.abs(pixel.y + offsetY - pos.y);
                if (dx < bubbleWidth / 2 && dy < bubbleHeight) {
                    offsetY += bubbleHeight + 10;
                }
            }

            if (offsetY > 0) {
                const newLatLng = this.map.unproject([pixel.x, pixel.y + offsetY]);
                lngLat = [newLatLng.lng, newLatLng.lat];
            }

            const finalPixel = this.map.project(lngLat);
            this.bubblePositions.push({ x: finalPixel.x, y: finalPixel.y });
        }

        const isEffect = element.classList.contains('map-effect');
        const isLabel = element.classList.contains('country-name-label');
        // All placed markers are draggable except country name labels
        const isDraggable = !isLabel;

        const marker = new maplibregl.Marker({
            element,
            anchor,
            draggable: isDraggable
        })
            .setLngLat(lngLat)
            .addTo(this.map);

        // Make all placed markers interactive (draggable)
        if (isDraggable && !isLabel) {
            element.style.pointerEvents = 'auto';
            element.style.cursor = 'grab';
            marker.on('dragstart', () => { element.style.cursor = 'grabbing'; });
            marker.on('dragend', () => { element.style.cursor = 'grab'; });
        }

        // Effects get extra selection/edit behavior
        if (isEffect) {
            // Use click (not mousedown) for selection so it doesn't block drag
            element.addEventListener('click', (e) => {
                if (e.button === 0) {
                    e.stopPropagation();
                    this._selectEffect(marker);
                }
            });

            element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this._selectEffect(marker);
                const lngLat = marker.getLngLat();
                const point = this.map.project([lngLat.lng, lngLat.lat]);
                this.map.fire('contextmenu', {
                    point: point,
                    lngLat: lngLat,
                    originalEvent: e,
                    _effectMarker: marker
                });
            });
        }

        this.markers.push(marker);
        this.lastMarker = marker;
        return marker;
    }

    _selectEffect(marker) {
        // Deselect previous
        if (this._selectedEffectMarker && this._selectedEffectMarker !== marker) {
            this._selectedEffectMarker.getElement().classList.remove('fx-selected');
        }
        this._selectedEffectMarker = marker;
        marker.getElement().classList.add('fx-selected');
    }

    deselectEffect() {
        if (this._selectedEffectMarker) {
            this._selectedEffectMarker.getElement().classList.remove('fx-selected');
            this._selectedEffectMarker = null;
        }
    }

    removeSelectedEffect() {
        if (!this._selectedEffectMarker) return;
        const marker = this._selectedEffectMarker;
        marker.remove();
        this.markers = this.markers.filter(m => m !== marker);
        this.lastMarker = this.markers[this.markers.length - 1] || null;
        this._selectedEffectMarker = null;
    }

    removeEffects() {
        this.markers = this.markers.filter(m => {
            const el = m.getElement();
            if (el && el.classList.contains('map-effect')) {
                m.remove();
                return false;
            }
            return true;
        });
        this.lastMarker = this.markers[this.markers.length - 1] || null;
    }

    removeLastMarker() {
        if (this.lastMarker) {
            const element = this.lastMarker.getElement();
            if (element && element.classList.contains('map-bubble')) {
                this.bubblePositions.pop();
            }

            this.lastMarker.remove();
            this.markers = this.markers.filter(m => m !== this.lastMarker);
            this.lastMarker = this.markers[this.markers.length - 1] || null;
        }
    }

    // ─── Legend ───

    addLegendEntry(label, color) {
        this.legendEntries.push({ label, color });
        this.renderLegend();
    }

    generateAutoLegend(commands) {
        this.legendEntries = [];
        const seen = new Set();
        commands.forEach(cmd => {
            if (cmd.type === 'country' && cmd.color) {
                const color = CONFIG.colors[cmd.color] || cmd.color;
                if (!seen.has(color)) {
                    seen.add(color);
                    this.legendEntries.push({ label: cmd.name, color });
                }
            }
        });
        this.renderLegend();
    }

    renderLegend() {
        if (this.legendElement) this.legendElement.remove();
        if (this.legendEntries.length === 0) return;

        const container = document.querySelector('.map-container');
        this.legendElement = document.createElement('div');
        this.legendElement.className = 'map-legend';

        this.legendEntries.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'legend-row';
            row.innerHTML = `<span class="legend-swatch" style="background:${entry.color}"></span><span class="legend-label">${entry.label}</span>`;
            this.legendElement.appendChild(row);
        });

        container.appendChild(this.legendElement);
    }

    hideLegend() {
        if (this.legendElement) {
            this.legendElement.remove();
            this.legendElement = null;
        }
        this.legendEntries = [];
    }

    // ─── Clear all ───

    clearAll() {
        // Remove all layers
        this.layers.forEach(id => {
            if (this.map.getLayer(id)) this.map.removeLayer(id);
        });
        this.layers = [];

        // Remove all tracked sources
        for (const id of this.sourceIds) {
            if (this.map.getSource(id)) this.map.removeSource(id);
        }
        this.sourceIds.clear();

        // Remove markers
        this.markers.forEach(m => m.remove());
        this.markers = [];
        this.lastMarker = null;

        this.hideYearOverlay();
        this.hideLegend();
        this.clearAttackArrows();

        this.lineStartCountry = null;
        this.bubblePositions = [];
        this._coloredFeatures = [];
        this._clearAllRenames();
    }

    /**
     * Remove all colored layers/sources whose feature belongs to the given country.
     * Matches admin-1 regions (by their admin/sovereignt property) and the admin-0
     * country feature itself (by NAME).  Case-insensitive; hyphens treated as spaces.
     */
    clearFeaturesForCountry(rawName, regionsOnly = false) {
        const norm = s => (s || '').toLowerCase().replace(/[-_]/g, ' ').trim();
        const n = norm(rawName);
        const remaining = [];

        for (const entry of this._coloredFeatures) {
            const p = entry.feature.properties || {};
            if (regionsOnly && !entry.isRegion) { remaining.push(entry); continue; }
            const matches =
                norm(p.admin)      === n ||
                norm(p.ADMIN)      === n ||
                norm(p.sovereignt) === n ||
                norm(p.SOVEREIGNT) === n ||
                norm(p.NAME)       === n ||
                norm(p.name)       === n;

            if (matches) {
                const sid = entry.sourceId;
                [sid + '-fill', sid + '-line'].forEach(lid => {
                    if (this.map.getLayer(lid)) this.map.removeLayer(lid);
                    const idx = this.layers.indexOf(lid);
                    if (idx !== -1) this.layers.splice(idx, 1);
                });
                // Remove pattern image for occupied features
                try { if (this.map.hasImage('stripe-pattern-' + sid)) this.map.removeImage('stripe-pattern-' + sid); } catch (_) {}
                if (this.map.getSource(sid)) this.map.removeSource(sid);
                this.sourceIds.delete(sid);
            } else {
                remaining.push(entry);
            }
        }

        this._coloredFeatures = remaining;
    }

    // ─── Camera ───

    flyTo(lat, lng, zoom, duration = 1200) {
        this.map.flyTo({
            center: [lng, lat],
            zoom,
            pitch: 0,
            bearing: 0,
            duration
        });
    }

    cinematicFlyTo(lat, lng, zoom, pitch = 30, bearing = 0, duration = 2000) {
        this.map.flyTo({
            center: [lng, lat],
            zoom,
            pitch: Math.min(30, Math.max(0, pitch)),
            bearing: bearing % 360,
            duration,
            essential: true
        });
    }

    zoomToFeature(feature) {
        const bounds = this.geoData.getBounds(feature.geometry);
        this.map.fitBounds(bounds, {
            padding: 50,
            maxZoom: 8,
            pitch: 0,
            bearing: 0
        });
    }

    // ─── Query ───

    queryFeatures(point) {
        if (!this.hoverSourcesReady) return null;
        if (!this.map.getLayer('hover-regions') || !this.map.getLayer('hover-countries')) return null;
        const regions = this.map.queryRenderedFeatures(point, { layers: ['hover-regions'] });
        const countries = this.map.queryRenderedFeatures(point, { layers: ['hover-countries'] });

        if (regions.length) {
            const p = regions[0].properties;
            const countryName = countries.length
                ? (countries[0].properties.NAME || countries[0].properties.ADMIN)
                : (p.admin || p.ADMIN);
            return {
                type: 'region',
                name: p.name || p.NAME,
                country: p.admin || p.ADMIN,
                countryName: countryName
            };
        }

        if (countries.length) {
            const p = countries[0].properties;
            return { type: 'country', name: p.NAME || p.ADMIN };
        }

        return null;
    }

    getZoom() { return this.map.getZoom(); }
    getPitch() { return this.map.getPitch(); }
    getBearing() { return this.map.getBearing(); }

    getCenter() {
        const center = this.map.getCenter();
        return { lat: center.lat, lng: center.lng };
    }

    // ─── Country rename / label override ───

    /**
     * Hide the map's default label for `name` and place a custom HTML label at `lngLat`.
     * Uses MapLibre paint expressions to set text-opacity → 0 for the matching feature
     * across every symbol layer in the style, then restores originals on unrename.
     *
     * @param {string} name    – country name as typed in the script (e.g. "Germany")
     * @param {string} label   – replacement text (e.g. "West Germany")
     * @param {[number,number]} lngLat – [lng, lat] of the custom label anchor
     */
    /** Match expression that identifies a country label across all supported map styles. */
    _renameMatchExpr(n) {
        return ['any',
            // Natural Earth GeoJSON used by the minimal-country-labels layer
            ['==', ['downcase', ['coalesce', ['get', 'NAME'],    ['literal', '']]], n],
            // OpenFreeMap liberty tiles — English and native name properties
            ['==', ['downcase', ['coalesce', ['get', 'name_en'], ['literal', '']]], n],
            ['==', ['downcase', ['coalesce', ['get', 'name'],    ['literal', '']]], n]
        ];
    }

    /**
     * Apply text-opacity = 0 for country n on every current symbol layer.
     * We use setPaintProperty (not setFilter) to avoid corrupting existing filters.
     */
    _applyRenameHide(n) {
        const style = this.map.getStyle();
        if (!style) return;
        const opacityExpr = ['case', this._renameMatchExpr(n), 0, 1];
        for (const layer of style.layers) {
            if (layer.type !== 'symbol') continue;
            try { this.map.setPaintProperty(layer.id, 'text-opacity',      opacityExpr); } catch (_) {}
            try { this.map.setPaintProperty(layer.id, 'text-halo-opacity', opacityExpr); } catch (_) {}
        }
    }

    renameCountry(name, label, lngLat) {
        const n = name.toLowerCase();
        this._unrenameOne(n); // Remove any existing override for this country first

        // Custom label styled to match native OpenFreeMap country labels
        const el = document.createElement('div');
        el.className = 'rename-country-label';
        Object.assign(el.style, {
            color:         '#334155',
            fontFamily:    'sans-serif',
            fontSize:      '13px',
            fontWeight:    '700',
            letterSpacing: '0.06em',
            textShadow:    '0 0 3px rgba(255,255,255,0.95), 0 0 5px rgba(255,255,255,0.9), 0 0 8px rgba(255,255,255,0.85)',
            pointerEvents: 'none',
            whiteSpace:    'nowrap',
            userSelect:    'none',
            lineHeight:    '1'
        });
        el.textContent = label;

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat(lngLat)
            .addTo(this.map);

        this._renames.set(n, { marker });

        if (this.map.isStyleLoaded()) {
            this._applyRenameHide(n);
        } else {
            this.map.once('styledata', () => {
                if (this._renames.has(n)) this._applyRenameHide(n);
            });
        }
    }

    /** Restore a single previously renamed country. */
    _unrenameOne(n) {
        if (!this._renames.has(n)) return;
        const { marker } = this._renames.get(n);
        marker.remove();
        this._renames.delete(n); // Remove BEFORE re-applying so this name isn't re-hidden

        // Reset ALL symbol layers to their default opacity, then re-apply any remaining renames.
        // This is more reliable than tracking individual touched layers.
        const style = this.map.getStyle();
        if (!style) return;
        for (const layer of style.layers) {
            if (layer.type !== 'symbol') continue;
            try { this.map.setPaintProperty(layer.id, 'text-opacity',      null); } catch (_) {}
            try { this.map.setPaintProperty(layer.id, 'text-halo-opacity', null); } catch (_) {}
        }
        for (const rn of this._renames.keys()) {
            this._applyRenameHide(rn);
        }
    }

    /** Restore the default map label for `name`. */
    unrenameCountry(name) {
        this._unrenameOne(name.toLowerCase());
    }

    /** Restore all renamed countries (called by clearAll). */
    _clearAllRenames() {
        for (const n of [...this._renames.keys()]) this._unrenameOne(n);
    }

    on(event, handler) {
        this.map.on(event, handler);
    }

    off(event, handler) {
        this.map.off(event, handler);
    }
}
