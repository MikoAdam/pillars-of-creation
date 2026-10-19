/**
 * Geographic data for map scenes: Natural Earth country and region outlines
 * (public domain), Web Mercator math and the map camera projection.
 * Data loads once in the background; drawing stays a pure function of t.
 */

export type GeoKind = "countries" | "regions";

export interface GeoFeature {
  name: string;
  /** lower-case lookup keys */
  keys: string[];
  /** owning country (regions only), lower-case */
  country?: string;
  /** rings of Mercator-normalised coords [x0, y0, x1, y1, ...] in 0..1 */
  rings: Float32Array[];
  /** normalised bbox [minX, minY, maxX, maxY] */
  bbox: [number, number, number, number];
  /** label / arrow anchor [lng, lat] */
  center: [number, number];
}

const store: Record<GeoKind, GeoFeature[] | null> = { countries: null, regions: null };
const pending: Partial<Record<GeoKind, Promise<void>>> = {};

export const geoReady = (k: GeoKind) => store[k] !== null;
export const geoFeatures = (k: GeoKind) => store[k] ?? [];

/** Country name aliases (lower-case) → Natural Earth name. */
const ALIASES: Record<string, string> = {
  usa: "united states of america", us: "united states of america", america: "united states of america", "united states": "united states of america",
  uk: "united kingdom", britain: "united kingdom", england: "united kingdom", "great britain": "united kingdom",
  uae: "united arab emirates", czech: "czechia", "czech republic": "czechia", "russian federation": "russia", holland: "netherlands",
  gaza: "palestine", "west bank": "palestine", macedonia: "north macedonia", bosnia: "bosnia and herz.", "bosnia and herzegovina": "bosnia and herz.",
  drc: "dem. rep. congo", "democratic republic of the congo": "dem. rep. congo", "south korea": "south korea", "north korea": "north korea",
  ivorycoast: "côte d'ivoire", "ivory coast": "côte d'ivoire", burma: "myanmar", "central african republic": "central african rep.",
  "dominican republic": "dominican rep.", "south sudan": "s. sudan", "western sahara": "w. sahara", "equatorial guinea": "eq. guinea",
  "solomon islands": "solomon is.", "falkland islands": "falkland is.", "northern cyprus": "n. cyprus",
};

/** Region aliases (English → Natural Earth spelling), lower-case. */
const REGION_ALIASES: Record<string, string[]> = {
  crimea: ["crimea", "krym", "autonomous republic of crimea"],
  donetsk: ["donets'k", "donetsk"], luhansk: ["luhans'k", "luhansk"], zaporizhzhia: ["zaporizhzhya", "zaporizhzhia"],
  kharkiv: ["kharkiv"], kherson: ["kherson"], kyiv: ["kiev", "kyiv"],
  bavaria: ["bayern", "bavaria"], hesse: ["hessen"], "lower saxony": ["niedersachsen"], saxony: ["sachsen"],
  "north rhine westphalia": ["nordrhein-westfalen"], thuringia: ["thüringen"], "saxony anhalt": ["sachsen-anhalt"],
  "republika srpska": ["repuplika srpska", "republika srpska", "srpska"],
  lachin: ["laçın", "lachin"], kalbajar: ["kəlbəcər", "kalbajar"], agdam: ["ağdam", "agdam"], fuzuli: ["füzuli", "fuzuli"],
  jabrayil: ["cəbrayıl", "jabrayil"], zangilan: ["zəngilan", "zangilan"], qubadli: ["qubadlı", "qubadli"], shusha: ["şuşa", "shusha"],
  khojaly: ["xocalı", "khojaly"], khojavend: ["xocavənd", "khojavend"],
};

export const normName = (s: string) => s.toLowerCase().replace(/_/g, " ").trim();
const fold = (s: string) => normName(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’`-]/g, " ").replace(/\s+/g, " ");

/** Web Mercator: lng/lat → normalised 0..1 world coords. */
export function toNorm(lng: number, lat: number): [number, number] {
  const la = Math.max(-85.05, Math.min(85.05, lat)) * (Math.PI / 180);
  return [(lng + 180) / 360, (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2];
}
export function fromNorm(x: number, y: number): [number, number] {
  const lng = x * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return [lng, lat];
}

function build(kind: GeoKind, json: any): GeoFeature[] {
  const out: GeoFeature[] = [];
  for (const f of json.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    const polys: number[][][][] = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    const rings: Float32Array[] = [];
    let minX = 1, minY = 1, maxX = 0, maxY = 0, best = 0;
    let center: [number, number] = [0, 0];
    for (const poly of polys) {
      poly.forEach((ring, ri) => {
        const a = new Float32Array(ring.length * 2);
        let rminX = 1, rmaxX = 0, rminY = 1, rmaxY = 0, sx = 0, sy = 0;
        ring.forEach(([lng, lat], i) => {
          const [x, y] = toNorm(lng, lat);
          a[i * 2] = x; a[i * 2 + 1] = y;
          if (x < rminX) rminX = x; if (x > rmaxX) rmaxX = x; if (y < rminY) rminY = y; if (y > rmaxY) rmaxY = y;
          sx += lng; sy += lat;
        });
        rings.push(a);
        minX = Math.min(minX, rminX); maxX = Math.max(maxX, rmaxX); minY = Math.min(minY, rminY); maxY = Math.max(maxY, rmaxY);
        const area = (rmaxX - rminX) * (rmaxY - rminY);
        if (ri === 0 && area > best) { best = area; center = [sx / ring.length, sy / ring.length]; }
      });
    }
    const p = f.properties ?? {};
    if (kind === "countries") {
      const name = String(p.NAME ?? p.ADMIN ?? "");
      const keys = [...new Set([name, p.NAME_LONG, p.ADMIN].filter(Boolean).map((s: string) => fold(s)))];
      out.push({ name, keys, rings, bbox: [minX, minY, maxX, maxY], center });
    } else {
      const name = String(p.name_en ?? p.name ?? "");
      const keys = [...new Set([p.name, p.name_en].filter(Boolean).map((s: string) => fold(s)))];
      out.push({ name, keys, country: fold(String(p.admin ?? "")), rings, bbox: [minX, minY, maxX, maxY], center });
    }
  }
  // fixed visual centres for countries whose territory makes the average misleading
  for (const f of out) {
    const fix = FIXED_CENTERS[f.keys[0]];
    if (fix) f.center = fix;
  }
  return out;
}

const FIXED_CENTERS: Record<string, [number, number]> = {
  france: [2.5, 46.6], "united kingdom": [-2.5, 54.0], norway: [9.5, 61.5], russia: [55, 61], "united states of america": [-98.5, 39.5],
  canada: [-100, 58], netherlands: [5.5, 52.2], denmark: [9.5, 56], portugal: [-8, 39.6], spain: [-3.5, 40], italy: [12.5, 42.8],
  greece: [22, 39.5], indonesia: [118, -2], japan: [138, 36.5], chile: [-71, -33], "new zealand": [172, -41], croatia: [15.8, 45.4],
};

/** Install already-fetched GeoJSON (used by tests and the loader). */
export function setGeoData(kind: GeoKind, json: unknown) {
  store[kind] = build(kind, json);
}

import regionsAsset from "@/assets/geo-regions.json.asset.json";

/** Fetch the outlines once (browser). Regions ship as a CDN asset (>10 MB). */
export function loadGeo(kind: GeoKind): Promise<void> {
  if (store[kind]) return Promise.resolve();
  pending[kind] ??= fetch(kind === "regions" ? regionsAsset.url : `/geo/${kind}.json`)
    .then((r) => r.json())
    .then((j) => setGeoData(kind, j));
  return pending[kind]!;
}

export function findCountry(name: string): GeoFeature | undefined {
  const k = fold(ALIASES[normName(name)] ?? name);
  const list = geoFeatures("countries");
  return list.find((f) => f.keys.includes(k)) ?? list.find((f) => f.keys.some((x) => x.replace(/\./g, "") === k.replace(/\./g, "")));
}

export function findRegion(name: string, country?: string): GeoFeature | undefined {
  const c = country ? findCountry(country) : undefined;
  const cKeys = c ? c.keys : country ? [fold(country)] : null;
  const wanted = (REGION_ALIASES[normName(name)] ?? [name]).map(fold);
  const list = geoFeatures("regions");
  const match = (f: GeoFeature) => f.keys.some((k) => wanted.includes(k));
  // disputed areas may be filed under another country in the data, so fall back to a name-only match
  return list.find((f) => (!cKeys || cKeys.includes(f.country ?? "")) && match(f)) ?? list.find(match);
}

/** Suggest close names for error messages. */
export function suggest(kind: GeoKind, name: string, country?: string): string[] {
  const k = fold(name);
  const c = country ? findCountry(country) : undefined;
  return geoFeatures(kind)
    .filter((f) => kind === "countries" || !c || c.keys.includes(f.country ?? ""))
    .filter((f) => f.keys.some((x) => x.startsWith(k.slice(0, 3))))
    .slice(0, 4)
    .map((f) => f.name);
}

function inRing(r: Float32Array, x: number, y: number) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Feature under a normalised point (rings use even-odd so holes work). */
export function featureAt(kind: GeoKind, x: number, y: number): GeoFeature | undefined {
  for (const f of geoFeatures(kind)) {
    const [a, b, c, d] = f.bbox;
    if (x < a || x > c || y < b || y > d) continue;
    let n = 0;
    for (const r of f.rings) if (inRing(r, x, y)) n++;
    if (n % 2 === 1) return f;
  }
  return undefined;
}

/** Map camera: centre (lat/lng), zoom (MapLibre-style, 512px tiles), tilt and turn in degrees. */
export interface MapCam { lat: number; lng: number; zoom: number; tilt: number; turn: number }

const PERSPECTIVE = 1400;

/** Projection for one camera. Returns screen coords in the 1920x1080 frame. */
export function makeProjection(cam: MapCam) {
  const [cx, cy] = toNorm(cam.lng, cam.lat);
  const size = 512 * Math.pow(2, cam.zoom);
  const br = (-cam.turn * Math.PI) / 180;
  const cb = Math.cos(br), sb = Math.sin(br);
  const tp = (Math.min(70, Math.max(0, cam.tilt)) * Math.PI) / 180;
  const ct = Math.cos(tp), st = Math.sin(tp);
  const norm = (x: number, y: number): [number, number] => {
    let dx = (x - cx) * size, dy = (y - cy) * size;
    // wrap around the antimeridian to the nearest copy
    if (dx > size / 2) dx -= size; else if (dx < -size / 2) dx += size;
    const rx = dx * cb - dy * sb, ry = dx * sb + dy * cb;
    if (tp === 0) return [960 + rx, 540 + ry];
    const k = PERSPECTIVE / Math.max(80, PERSPECTIVE - ry * st);
    return [960 + rx * k, 540 + ry * ct * k];
  };
  const invert = (sx: number, sy: number): [number, number] => {
    let rx = sx - 960, ry = sy - 540;
    if (tp !== 0) {
      const dy = (ry * PERSPECTIVE) / (ct * PERSPECTIVE + ry * st);
      const k = PERSPECTIVE / (PERSPECTIVE - dy * st);
      rx = rx / k; ry = dy;
    }
    const dx = rx * cb + ry * sb, dy = -rx * sb + ry * cb;
    return [cx + dx / size, cy + dy / size];
  };
  return {
    size,
    norm,
    point: (lng: number, lat: number) => { const [x, y] = toNorm(lng, lat); return norm(x, y); },
    /** screen → [lng, lat] */
    unproject: (sx: number, sy: number) => { const [x, y] = invert(sx, sy); return fromNorm(x, y); },
    invertNorm: invert,
  };
}
export type Projection = ReturnType<typeof makeProjection>;

/** Camera that fits a normalised bbox inside the frame. */
export function fitBbox(b: [number, number, number, number], pad = 0.18): { lat: number; lng: number; zoom: number } {
  const w = Math.max(1e-6, b[2] - b[0]), h = Math.max(1e-6, b[3] - b[1]);
  const zoom = Math.log2(Math.min((1920 * (1 - pad)) / (w * 512), (1080 * (1 - pad)) / (h * 512)));
  const [lng, lat] = fromNorm((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
  return { lat, lng, zoom: Math.max(0.5, Math.min(12, zoom)) };
}

/** Named colours from the original map creator, plus #hex. */
export const MAP_COLORS: Record<string, string> = {
  red: "#dc2626", orange: "#ea580c", yellow: "#ca8a04", gold: "#d4a017", green: "#16a34a", teal: "#0d9488", cyan: "#0891b2",
  blue: "#2563eb", indigo: "#4f46e5", purple: "#9333ea", pink: "#db2777", magenta: "#c026d3", brown: "#92400e", gray: "#6b7280",
  white: "#e5e7eb", maroon: "#7f1d1d", coral: "#f87171", salmon: "#fa8072", tan: "#d2b48c", navy: "#1e3a8a", lime: "#65a30d",
};
export const MAP_COLOR_NAMES = Object.keys(MAP_COLORS);
