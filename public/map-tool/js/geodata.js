/**
 * Pillars of Creation Maps - GeoData
 * Handles loading, caching, and querying geographic data
 */

class GeoData {
    constructor() {
        this.countries = null;
        this.regions = null;

        this.fixedCenters = {
            // Europe
            'france': [2.5, 46.6],
            'united kingdom': [-2.5, 54.5],
            'netherlands': [5.5, 52.2],
            'denmark': [10.0, 56.0],
            'portugal': [-8.0, 39.6],
            'spain': [-3.5, 40.0],
            'norway': [10.0, 62.0],
            'sweden': [17.0, 62.0],
            'finland': [26.0, 64.0],
            'italy': [12.5, 42.5],
            'greece': [22.0, 39.5],
            'poland': [20.0, 52.0],
            'ukraine': [32.0, 49.0],
            'kosovo': [20.9, 42.6],
            // Asia
            'russia': [55.0, 61.0],
            'russian federation': [55.0, 61.0],
            'china': [104.0, 35.0],
            'india': [79.0, 23.0],
            'indonesia': [118.0, -2.0],
            'philippines': [122.0, 13.0],
            'japan': [136.0, 36.0],
            'malaysia': [109.0, 3.5],
            'myanmar': [96.0, 18.0],
            'thailand': [101.0, 15.0],
            'vietnam': [106.0, 16.5],
            'pakistan': [70.0, 30.0],
            'afghanistan': [66.0, 33.0],
            'iran': [53.0, 32.0],
            'iraq': [44.0, 33.0],
            'saudi arabia': [44.0, 24.0],
            'turkey': [35.0, 39.0],
            'kazakhstan': [67.0, 48.0],
            'mongolia': [103.0, 46.5],
            'palestine': [35.0, 31.5],
            // Americas
            'united states of america': [-98.5, 39.5],
            'canada': [-96.0, 56.0],
            'brazil': [-51.0, -10.0],
            'mexico': [-102.0, 24.0],
            'argentina': [-65.0, -35.0],
            'chile': [-71.0, -35.0],
            'peru': [-75.0, -9.0],
            'colombia': [-74.0, 4.0],
            'venezuela': [-66.0, 8.0],
            'bolivia': [-65.0, -17.0],
            // Africa
            'egypt': [30.0, 27.0],
            'libya': [17.0, 27.0],
            'algeria': [3.0, 28.0],
            'niger': [9.0, 16.5],
            'chad': [18.0, 15.0],
            'mali': [-2.0, 17.0],
            'mauritania': [-11.0, 20.0],
            'sudan': [30.0, 15.0],
            'south sudan': [30.0, 7.0],
            'ethiopia': [40.0, 9.0],
            'somalia': [46.0, 6.0],
            'kenya': [37.5, 0.5],
            'tanzania': [35.0, -6.0],
            'angola': [18.0, -12.0],
            'mozambique': [35.0, -17.0],
            'south africa': [25.0, -29.0],
            'democratic republic of the congo': [24.0, -2.0],
            'congo': [15.0, -1.0],
            // Oceania
            'australia': [134.0, -25.0],
            'new zealand': [172.0, -41.0],
        };
    }

    async load() {
        const cacheKey = 'poc-maps-geodata-v5';

        // Try cache first
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const data = JSON.parse(cached);
                this.countries = data.countries;
                this.regions = data.regions;
                this.fixDisputedTerritories();
                console.log('GeoData: Loaded from cache');
                return;
            } catch (e) {
                console.warn('Cache corrupted, reloading...');
                localStorage.removeItem(cacheKey);
            }
        }

        // Retry with exponential backoff
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`GeoData: Loading (attempt ${attempt})...`);
                const [countries, regions] = await this.fetchWithFallback();
                this.countries = countries;
                this.regions = regions;
                this.fixDisputedTerritories();
                this.cacheData(cacheKey);
                return;
            } catch (err) {
                if (attempt < maxRetries) {
                    const delay = 1000 * Math.pow(2, attempt - 1);
                    console.warn(`Load attempt ${attempt} failed, retrying in ${delay}ms...`);
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    throw new Error('Failed to load map data after ' + maxRetries + ' attempts');
                }
            }
        }
    }

    async fetchWithFallback() {
        const timeout = (ms) => new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), ms)
        );

        // Try local files first
        try {
            const [cr, rr] = await Promise.race([
                Promise.all([fetch(CONFIG.data.countries), fetch(CONFIG.data.regions)]),
                timeout(5000)
            ]);
            if (!cr.ok || !rr.ok) throw new Error('Local files not available');
            return [await cr.json(), await rr.json()];
        } catch (localError) {
            console.log('GeoData: Local files unavailable, using GitHub fallback...');
        }

        // Fallback to GitHub
        const [cr, rr] = await Promise.race([
            Promise.all([
                fetch(CONFIG.data.countriesFallback),
                fetch(CONFIG.data.regionsFallback)
            ]),
            timeout(30000)
        ]);
        if (!cr.ok || !rr.ok) throw new Error('GitHub fallback failed');
        return [await cr.json(), await rr.json()];
    }

    cacheData(cacheKey) {
        try {
            const cacheData = JSON.stringify({
                countries: this.countries,
                regions: this.regions
            });
            if (cacheData.length < 5 * 1024 * 1024) {
                localStorage.setItem(cacheKey, cacheData);
                console.log('GeoData: Cached for next visit');
            }
        } catch (e) {
            console.warn('Could not cache:', e.message);
        }
    }

    fixDisputedTerritories() {
        // Fix Crimea — reassign regions to Ukraine
        this.regions.features.forEach(f => {
            const name = (f.properties.name || f.properties.NAME || '').toLowerCase();
            if (name.includes('crimea') || name.includes('krym') || name.includes('sevastopol')) {
                f.properties.admin = 'Ukraine';
                f.properties.ADMIN = 'Ukraine';
                f.properties.sovereignt = 'Ukraine';
                f.properties.SOVEREIGNT = 'Ukraine';
            }
        });

        const ukraine = this.countries.features.find(f =>
            (f.properties.NAME || '').toLowerCase() === 'ukraine'
        );

        const crimeaRegions = this.regions.features.filter(f => {
            const name = (f.properties.name || f.properties.NAME || '').toLowerCase();
            return name.includes('crimea') || name.includes('krym') || name.includes('sevastopol');
        });

        // Merge Crimea into Ukraine's geometry
        if (ukraine && crimeaRegions.length > 0) {
            crimeaRegions.forEach(crimea => this.mergeGeometry(ukraine, crimea));
        }

        // Remove Crimea from Russia's geometry
        const russia = this.countries.features.find(f =>
            (f.properties.NAME || '').toLowerCase().includes('russia')
        );
        if (russia && russia.geometry.type === 'MultiPolygon') {
            russia.geometry.coordinates = russia.geometry.coordinates.filter(poly => {
                // Calculate centroid of this polygon ring
                const ring = poly[0]; // outer ring
                let cx = 0, cy = 0;
                for (const pt of ring) { cx += pt[0]; cy += pt[1]; }
                cx /= ring.length; cy /= ring.length;
                // Crimea bounding box: ~32.5-36.5°E, 44-46.2°N
                const isCrimea = cx > 32.5 && cx < 36.5 && cy > 44 && cy < 46.2;
                return !isCrimea;
            });
        }

        console.log('GeoData: Fixed Crimea -> Ukraine, removed from Russia');
    }

    mergeGeometry(target, source) {
        if (source.geometry.type === 'Polygon') {
            if (target.geometry.type === 'Polygon') {
                target.geometry = {
                    type: 'MultiPolygon',
                    coordinates: [target.geometry.coordinates, source.geometry.coordinates]
                };
            } else if (target.geometry.type === 'MultiPolygon') {
                target.geometry.coordinates.push(source.geometry.coordinates);
            }
        } else if (source.geometry.type === 'MultiPolygon') {
            if (target.geometry.type === 'Polygon') {
                target.geometry = {
                    type: 'MultiPolygon',
                    coordinates: [target.geometry.coordinates, ...source.geometry.coordinates]
                };
            } else if (target.geometry.type === 'MultiPolygon') {
                target.geometry.coordinates.push(...source.geometry.coordinates);
            }
        }
    }

    normalize(str) {
        return (str || '').toLowerCase().replace(/[-_]/g, ' ').replace(/^the\s+/, '').trim();
    }

    findCountry(name) {
        const normalized = this.normalize(name);
        const search = CONFIG.aliases[normalized] || normalized;

        let result = this.countries.features.find(f =>
            this.normalize(f.properties.NAME) === search
        );

        if (!result) {
            result = this.countries.features.find(f =>
                this.normalize(f.properties.ADMIN) === search
            );
        }

        if (!result) {
            result = this.countries.features.find(f =>
                f.properties.NAME_LONG && this.normalize(f.properties.NAME_LONG) === search
            );
        }

        if (!result) {
            result = this.countries.features.find(f => {
                const n = this.normalize(f.properties.NAME);
                const a = this.normalize(f.properties.ADMIN);
                return n.startsWith(search) || search.startsWith(n) ||
                       a.startsWith(search) || search.startsWith(a);
            });
        }

        return result;
    }

    findRegion(name, country) {
        const n = this.normalize(name);
        const c = this.normalize(country);
        const ca = CONFIG.aliases[c] || c;

        let searchNames = [n];
        if (CONFIG.regionAliases) {
            for (const [ascii, variants] of Object.entries(CONFIG.regionAliases)) {
                const allVariants = [...variants, ascii];
                if (allVariants.some(v => v === n)) {
                    searchNames = allVariants;
                    break;
                }
            }
        }

        for (const searchName of searchNames) {
            let result = this.regions.features.find(f => {
                const props = f.properties;
                const names = [props.name, props.NAME, props.name_en, props.woe_name]
                    .filter(Boolean)
                    .map(s => this.normalize(s));
                const parents = [props.admin, props.ADMIN, props.sovereignt]
                    .filter(Boolean)
                    .map(s => this.normalize(s));

                const nameMatch = names.some(x => x === searchName);
                const parentMatch = parents.some(x => x === c || x === ca || x.includes(c));

                return nameMatch && parentMatch;
            });

            if (result) return result;
        }

        let result = this.regions.features.find(f => {
            const props = f.properties;
            const names = [props.name, props.NAME, props.name_en, props.woe_name]
                .filter(Boolean)
                .map(s => this.normalize(s));
            const parents = [props.admin, props.ADMIN, props.sovereignt]
                .filter(Boolean)
                .map(s => this.normalize(s));

            const nameMatch = names.some(x => {
                if (x === n) return true;
                if (Math.abs(x.length - n.length) <= 3 && (x.includes(n) || n.includes(x))) return true;
                return false;
            });
            const parentMatch = parents.some(x => x === c || x === ca || x.includes(c));

            return nameMatch && parentMatch;
        });

        return result;
    }

    getBounds(geometry) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        const process = (coords) => {
            if (typeof coords[0] === 'number') {
                minX = Math.min(minX, coords[0]);
                maxX = Math.max(maxX, coords[0]);
                minY = Math.min(minY, coords[1]);
                maxY = Math.max(maxY, coords[1]);
            } else {
                coords.forEach(process);
            }
        };

        process(geometry.coordinates);
        return [[minX, minY], [maxX, maxY]];
    }

    getCenter(geometry, countryName = null) {
        if (countryName) {
            const key = countryName.toLowerCase();
            if (this.fixedCenters[key]) {
                return this.fixedCenters[key];
            }
        }

        const bounds = this.getBounds(geometry);
        return [
            (bounds[0][0] + bounds[1][0]) / 2,
            (bounds[0][1] + bounds[1][1]) / 2
        ];
    }
}
