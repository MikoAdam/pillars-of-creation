/**
 * Geographic data for map scenes: Natural Earth country and region outlines
 * (public domain), Web Mercator math and the map camera projection.
 * Data loads once in the background; drawing stays a pure function of t.
 *
 * Lookup, aliases, curated centres, disputed-territory handling and sovereign-territory
 * expansion replicate the original map creator (config.js / geodata.js / executor.js).
 */
import regionsAsset from "@/assets/geo-regions.json.asset.json";

export type GeoKind = "countries" | "regions";

export interface GeoFeature {
  name: string;
  /** lower-case lookup keys */
  keys: string[];
  /** owning country (regions only), lower-case */
  country?: string;
  /** Natural Earth ADMIN of the country (countries only), lower-case */
  admin?: string;
  /** sovereign of the country (countries only), lower-case */
  sovereign?: string;
  /** Natural Earth TYPE, e.g. "Sovereign country", "Country", "Dependency" */
  type?: string;
  /** population estimate */
  pop?: number;
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
      const keys = [...new Set([name, p.NAME_LONG, p.ADMIN, p.SOVEREIGNT].filter(Boolean).map((s: string) => fold(s)))];
      const pop = Number(p.POP_EST);
      out.push({
        name, keys, rings, bbox: [minX, minY, maxX, maxY], center,
        ...(p.ADMIN ? { admin: fold(String(p.ADMIN)) } : {}),
        ...(p.SOVEREIGNT ? { sovereign: fold(String(p.SOVEREIGNT)) } : {}),
        ...(p.TYPE ? { type: String(p.TYPE) } : {}),
        ...(Number.isFinite(pop) ? { pop } : {}),
      });
    } else {
      const name = String(p.name_en ?? p.name ?? p.woe_name ?? "");
      const keys = [...new Set([p.name, p.NAME, p.name_en, p.woe_name].filter(Boolean).map((s: string) => fold(s)))];
      const admin = fold(String(p.admin ?? p.ADMIN ?? p.sovereignt ?? p.SOVEREIGNT ?? ""));
      out.push({ name, keys, country: admin, rings, bbox: [minX, minY, maxX, maxY], center });
    }
  }
  // fixed visual centres for countries whose territory makes the average misleading
  for (const f of out) {
    const fix = FIXED_CENTERS[f.keys[0]];
    if (fix) f.center = fix;
  }
  return out;
}

/** Curated visual centres from the original map creator (geodata.js). */
const FIXED_CENTERS: Record<string, [number, number]> = {
  france: [2.5, 46.6], "united kingdom": [-2.5, 54.5], netherlands: [5.5, 52.2], denmark: [10, 56],
  portugal: [-8, 39.6], spain: [-3.5, 40], norway: [10, 62], sweden: [17, 62], finland: [26, 64],
  italy: [12.5, 42.5], greece: [22, 39.5], poland: [20, 52], ukraine: [32, 49], kosovo: [20.9, 42.6],
  russia: [55, 61], "russian federation": [55, 61], china: [104, 35], india: [79, 23],
  indonesia: [118, -2], philippines: [122, 13], japan: [136, 36], malaysia: [109, 3.5],
  myanmar: [96, 18], thailand: [101, 15], vietnam: [106, 16.5], pakistan: [70, 30],
  afghanistan: [66, 33], iran: [53, 32], iraq: [44, 33], "saudi arabia": [44, 24],
  turkey: [35, 39], kazakhstan: [67, 48], mongolia: [103, 46.5], palestine: [35, 31.5],
  "united states of america": [-98.5, 39.5], canada: [-96, 56], brazil: [-51, -10],
  mexico: [-102, 24], argentina: [-65, -35], chile: [-71, -35], peru: [-75, -9],
  colombia: [-74, 4], venezuela: [-66, 8], bolivia: [-65, -17],
  egypt: [30, 27], libya: [17, 27], algeria: [3, 28], niger: [9, 16.5], chad: [18, 15],
  mali: [-2, 17], mauritania: [-11, 20], sudan: [30, 15], "south sudan": [30, 7],
  ethiopia: [40, 9], somalia: [46, 6], kenya: [37.5, 0.5], tanzania: [35, -6],
  angola: [18, -12], mozambique: [35, -17], "south africa": [25, -29],
  "democratic republic of the congo": [24, -2], congo: [15, -1],
  australia: [134, -25], "new zealand": [172, -41],
};

/** Install already-fetched GeoJSON (used by tests and the loader). */
export function setGeoData(kind: GeoKind, json: unknown) {
  store[kind] = build(kind, json);
}

/** Fetch the outlines once (browser). Regions ship as a CDN asset (>10 MB). */
export function loadGeo(kind: GeoKind): Promise<void> {
  if (store[kind]) return Promise.resolve();
  pending[kind] ??= fetch(kind === "regions" ? regionsAsset.url : `/geo/${kind}.json`)
    .then((r) => r.json())
    .then((j) => setGeoData(kind, j));
  return pending[kind]!;
}

export const normName = (s: string) => s.toLowerCase().replace(/[-_]/g, " ").replace(/^the\s+/, "").trim();
const fold = (s: string) => normName(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’`]/g, " ").replace(/\s+/g, " ").trim();

/** Country name aliases (lower-case) → Natural Earth name. */
const ALIASES: Record<string, string> = {
  usa: "united states of america", us: "united states of america", america: "united states of america", "united states": "united states of america",
  uk: "united kingdom", britain: "united kingdom", england: "united kingdom", "great britain": "united kingdom",
  uae: "united arab emirates", czech: "czechia", "czech republic": "czechia", russia: "russian federation",
  holland: "netherlands", gaza: "palestine", "west bank": "palestine", "palestinian territories": "palestine",
  macedonia: "north macedonia", bosnia: "bosnia and herz.", "bosnia and herzegovina": "bosnia and herz.",
  drc: "dem. rep. congo", "democratic republic of the congo": "dem. rep. congo", "south korea": "south korea", "north korea": "north korea",
  ivorycoast: "côte d'ivoire", "ivory coast": "côte d'ivoire", burma: "myanmar", "central african republic": "central african rep.",
  "dominican republic": "dominican rep.", "south sudan": "s. sudan", "western sahara": "w. sahara", "equatorial guinea": "eq. guinea",
  "solomon islands": "solomon is.", "falkland islands": "falkland is.", "northern cyprus": "n. cyprus",
};

/** Region aliases (English → Natural Earth spellings), lower-case. Matched bidirectionally. */
const REGION_ALIASES: Record<string, string[]> = {
  crimea: ["krym", "crimea", "respublika krym", "ar krym", "avtonomna respublika krym", "autonomous republic of crimea"],
  donetsk: ["donets'ka", "donetska", "donetsk", "donetzka"],
  luhansk: ["luhans'ka", "luhanska", "luhansk", "lugansk"],
  zaporizhzhia: ["zaporiz'ka", "zaporizka", "zaporizhzhia", "zaporizhia", "zaporiz ka"],
  kherson: ["khersons'ka", "khersonska", "kherson"],
  kharkiv: ["kharkivs'ka", "kharkivska", "kharkiv"], kyiv: ["kiev", "kyiv"],
  bavaria: ["bayern", "bavaria"], hesse: ["hessen", "hesse"], "lower saxony": ["niedersachsen", "lower saxony"],
  "north rhine westphalia": ["nordrhein westfalen", "north rhine westphalia"],
  "rhineland palatinate": ["rheinland pfalz", "rhineland palatinate"],
  thuringia: ["thüringen", "thuringen", "thuringia"], saxony: ["sachsen", "saxony"],
  "saxony anhalt": ["sachsen anhalt", "saxony anhalt"],
  "republika srpska": ["republika srpska", "republic of srpska"],
  lachin: ["lacin", "laçın", "lachin"], kalbajar: ["kalbacar", "kəlbəcər", "kalbajar"],
  agdam: ["ağdam", "agdam"], fuzuli: ["füzuli", "fuzuli"],
  jabrayil: ["cabrayil", "cəbrayıl", "jabrayil"], zangilan: ["zəngilan", "zangilan"],
  qubadli: ["qubadli", "qubadlı"], nagornokarabakh: ["nagorno karabakh", "nagorno-karabakh", "artsakh"],
  shusha: ["şuşa", "shusha", "shushi"], khojaly: ["xocalı", "khojaly", "xocali"],
  khojavend: ["xocavənd", "khojavend", "martuni"], hadrut: ["hadrut"], askeran: ["əsgəran", "askeran"],
  lankaran: ["lənkəran", "lankaran", "lenkeran"],
};

export function findCountry(name: string): GeoFeature | undefined {
  const n = normName(name);
  const search = fold(ALIASES[n] ?? name);
  const list = geoFeatures("countries");
  const norm = (s: string) => fold(s);
  return (
    list.find((f) => norm(f.name) === search) ??
    list.find((f) => f.keys.includes(search)) ??
    list.find((f) => f.keys.some((x) => x.replace(/\./g, "") === search.replace(/\./g, ""))) ??
    // bidirectional prefix fallback, as in the original
    list.find((f) => f.keys.some((x) => x.startsWith(search) || search.startsWith(x)))
  );
}

export function findRegion(name: string, country?: string): GeoFeature | undefined {
  const n = normName(name);
  const c = country ? normName(country) : undefined;
  const ca = c ? (ALIASES[c] ? fold(ALIASES[c]) : fold(c)) : undefined;
  // expand aliases bidirectionally: the typed name may match any variant, and vice versa
  let wanted = [n];
  const nFold = fold(n);
  for (const [ascii, variants] of Object.entries(REGION_ALIASES)) {
    const all = [...variants, ascii].map(fold);
    if (all.some((v) => v === nFold || v.includes(nFold) || nFold.includes(v))) {
      wanted = all;
      break;
    }
  }
  const list = geoFeatures("regions");
  const parentOf = (f: GeoFeature) => f.country ?? "";
  const parentMatch = (f: GeoFeature) =>
    !ca || ca === "" || parentOf(f) === ca || parentOf(f).includes(ca) || ca.includes(parentOf(f));
  const match = (f: GeoFeature) => f.keys.some((k) => wanted.includes(k));
  const fuzzy = (f: GeoFeature) =>
    f.keys.some((k) => {
      if (wanted.includes(k)) return true;
      return wanted.some((w) => Math.abs(k.length - w.length) <= 3 && (k.includes(w) || w.includes(k)));
    });
  return (
    list.find((f) => parentMatch(f) && match(f)) ??
    list.find((f) => parentMatch(f) && fuzzy(f)) ??
    // no country given (or none matched): fall back to a name-only search
    (ca ? undefined : list.find(match) ?? list.find(fuzzy))
  );
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

/** Nearby territories sharing the same sovereign (e.g. Isle of Man for the UK), as the original colours. */
export function territoriesOf(feature: GeoFeature): GeoFeature[] {
  if (!feature.sovereign) return [];
  const [[mLng, mLat]] = [feature.center];
  return geoFeatures("countries").filter((f) => {
    if (f === feature) return false;
    if (f.sovereign !== feature.sovereign) return false;
    // exclude the sovereign itself: its ADMIN is the sovereign name (a territory's ADMIN is its own)
    if (f.admin === feature.sovereign || f.name === feature.sovereign) return false;
    const [fLng, fLat] = f.center;
    return Math.sqrt((fLat - mLat) ** 2 + (fLng - mLng) ** 2) < 12;
  });
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
