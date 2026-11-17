import type { Theme } from "../types";
import { bodyFont, fillRound } from "../theme";
import { wrapText } from "../text";
import { geoFeatures, geoReady, makeProjection, toNorm, type GeoFeature, type MapCam, type Projection } from "../geo";
import { drawSymbol, type SymbolName } from "../symbols";
import { EFFECTS } from "../effectsSymbols";

/** Country / region colouring on a map, timed in absolute seconds. */
export interface MapFill {
  feature: GeoFeature | null;
  color: string;
  anim: "pulse" | "fade" | "radial" | "sweep" | "none";
  t0: number;
  d: number;
  end: number;
  occupied: boolean;
  isRegion?: boolean;
}

/** Per-country custom label ("rename britain "United Kingdom""). */
export interface MapRename {
  name: string;
  text: string;
  at?: [number, number];
  t0: number;
  end: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * The original app rendered overlays in CSS pixels of a ~1440px-wide window;
 * our frame is 1920px, so CSS px values scale by 1920/1440.
 */
const S = 1920 / 1440;

/** Original "Minimal" basemap colours. */
const OCEAN = "#c2d9ec";
const LAND = "#f0ebe0";
const BORDER = "#3a5c72";

/** Ring x-coordinates (normalised, one world = 1) made continuous, then shifted by whole worlds to sit nearest the centre meridian cx. */
export function unwrapRing(r: ArrayLike<number>, cx: number): number[] {
  const out: number[] = [];
  let off = 0;
  for (let i = 0; i < r.length; i += 2) {
    let lon = r[i] + off;
    if (i > 0) {
      const prev = out[out.length - 2];
      while (lon - prev > 0.5) { off -= 1; lon -= 1; }
      while (lon - prev < -0.5) { off += 1; lon += 1; }
    }
    out.push(lon, r[i + 1]);
  }
  const shift = Math.round(cx - out[0]);
  return out.map((v, i) => (i % 2 === 0 ? v + shift : v));
}

/** Screen bbox of a feature (corner sampling, good enough for culling and clips). */
function screenBox(f: GeoFeature, pr: Projection, cx: number): [number, number, number, number] {
  const [a, b, c, d] = f.bbox;
  const mid = (a + c) / 2 - cx;
  const shift = mid > 0.5 ? -1 : mid < -0.5 ? 1 : 0;
  const pts = [pr.norm(a + shift, b), pr.norm(c + shift, b), pr.norm(a + shift, d), pr.norm(c + shift, d), pr.norm((a + c) / 2 + shift, (b + d) / 2)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const visible = (b: number[]) => b[2] > -50 && b[0] < 1970 && b[3] > -50 && b[1] < 1130;

/** Cached 45°-stripe pattern for occupied territory fills. */
const stripeCache = new Map<string, CanvasPattern>();
function stripePattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern {
  const cached = stripeCache.get(color);
  if (cached) return cached;
  const tile = document.createElement("canvas");
  const T = Math.round(32 * S);
  tile.width = T; tile.height = T;
  const tc = tile.getContext("2d")!;
  const dark = darken(color, 0.3);
  tc.strokeStyle = dark;
  tc.lineWidth = 4 * S;
  const gap = 8 * S;
  // diagonal stripes at 45°, wrapping seamlessly
  for (let i = -T; i < 2 * T; i += gap * 2) {
    tc.beginPath();
    tc.moveTo(i, T + 2); tc.lineTo(i + T + 2, -2);
    tc.stroke();
  }
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) throw new Error("no pattern");
  stripeCache.set(color, pat);
  return pat;
}
function darken(hex: string, f: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f)), g = Math.round(((n >> 8) & 255) * (1 - f)), b = Math.round((n & 255) * (1 - f));
  return `rgb(${r},${g},${b})`;
}

/**
 * Country-label size by zoom, in CSS px of the original ~1440px window (scaled by S for the
 * 1920 frame). Larger than the map tool's old 9-15px: a video is watched smaller than an editor.
 * The map tool's label layer uses the same stops.
 */
const LABEL_STOPS: [number, number][] = [[1, 14], [3, 16], [5, 19], [7, 22], [10, 26]];
function nativeLabelSize(zoom: number) {
  const z = Math.max(LABEL_STOPS[0][0], Math.min(LABEL_STOPS[LABEL_STOPS.length - 1][0], zoom));
  for (let i = 0; i < LABEL_STOPS.length - 1; i++) {
    const [z0, s0] = LABEL_STOPS[i], [z1, s1] = LABEL_STOPS[i + 1];
    if (z <= z1) return (s0 + ((z - z0) / (z1 - z0)) * (s1 - s0)) * S;
  }
  return LABEL_STOPS[LABEL_STOPS.length - 1][1] * S;
}

type Box4 = [number, number, number, number];

interface MapView {
  pr: Projection;
  cx: number;
  lod: number;
  boxes: Map<GeoFeature, Box4>;
  /** flat (untilted) cameras: world → frame as an affine matrix, and the visible world rectangle */
  flat: { m: [number, number, number, number, number, number]; vx0: number; vx1: number; vy0: number; vy1: number } | null;
  land?: Path2D;
  paths: Map<GeoFeature, Path2D>;
  base?: HTMLCanvasElement;
  uses: number;
}

const PREVIEW_W = 1920;
let scratch: HTMLCanvasElement | undefined;

const views = new Map<string, MapView>();
const VIEW_LIMIT = 6;

/** Outline detail by zoom: far views use fewer points, which is all the eye can see at that size. */
const LOD_TOL = [0, 0.0004, 0.0012, 0.003];
const lodCache = new WeakMap<GeoFeature, ArrayLike<number>[][]>();

function decimate(r: ArrayLike<number>, tol: number): number[] {
  const out = [r[0], r[1]];
  let lx = r[0], ly = r[1];
  for (let i = 2; i < r.length - 2; i += 2) {
    if (Math.abs(r[i] - lx) + Math.abs(r[i + 1] - ly) >= tol) { out.push(r[i], r[i + 1]); lx = r[i]; ly = r[i + 1]; }
  }
  out.push(r[r.length - 2], r[r.length - 1]);
  return out;
}

function lodFor(zoom: number) {
  return zoom >= 5 ? 0 : zoom >= 3 ? 1 : zoom >= 1.6 ? 2 : 3;
}

function ringsAt(f: GeoFeature, lod: number): ArrayLike<number>[] {
  if (lod === 0) return f.rings;
  let levels = lodCache.get(f);
  if (!levels) { levels = []; lodCache.set(f, levels); }
  if (!levels[lod]) levels[lod] = f.rings.map((r) => decimate(r, LOD_TOL[lod]));
  return levels[lod];
}

function addRings(p: Path2D, f: GeoFeature, pr: Projection, cx: number, lod: number) {
  for (const r of ringsAt(f, lod)) {
    const u = unwrapRing(r, cx);
    for (let i = 0; i < u.length; i += 2) {
      const [x, y] = pr.normRaw(u[i], u[i + 1]);
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
  }
}

/**
 * A country's outline in world units (normalised Mercator, relative to its bbox corner for
 * float precision), built once per detail level. A flat camera is an affine map of these, so
 * each frame the browser transforms the path natively (addPath with a matrix) instead of
 * projecting every point in JavaScript: that is what keeps camera flights smooth.
 */
interface WorldPath { p: Path2D; ox: number; oy: number; x0: number; x1: number; y0: number; y1: number }
const worldCache = [0, 1, 2, 3].map(() => new WeakMap<GeoFeature, WorldPath>());
function worldPath(f: GeoFeature, lod: number): WorldPath {
  let w = worldCache[lod].get(f);
  if (w) return w;
  const ox = f.bbox[0], oy = f.bbox[1];
  const p = new Path2D();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of ringsAt(f, lod)) {
    const u = unwrapRing(r, r[0]); // continuous across the antimeridian, starting where the ring starts
    for (let i = 0; i < u.length; i += 2) {
      const x = u[i], y = u[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (i === 0) p.moveTo(x - ox, y - oy); else p.lineTo(x - ox, y - oy);
    }
    p.closePath();
  }
  w = { p, ox, oy, x0, x1, y0, y1 };
  worldCache[lod].set(f, w);
  return w;
}

/** Add f to target as seen by a flat camera: every copy of the world (-1, 0, +1) that is on screen. */
function addFlat(target: Path2D, view: MapView, f: GeoFeature) {
  const fl = view.flat!;
  const w = worldPath(f, view.lod);
  if (w.y1 < fl.vy0 || w.y0 > fl.vy1) return;
  const [a, b, c, d, e, g] = fl.m;
  for (let k = -1; k <= 1; k++) {
    if (w.x1 + k < fl.vx0 || w.x0 + k > fl.vx1) continue;
    const ox = w.ox + k;
    target.addPath(w.p, new DOMMatrix([a, b, c, d, e + a * ox + c * w.oy, g + b * ox + d * w.oy]));
  }
}

/** Projected outlines for one camera, built once and reused while the camera holds still. */
function viewFor(cam: MapCam, countries: GeoFeature[]): MapView {
  const key = [cam.lat, cam.lng, cam.zoom, cam.tilt, cam.turn].join("|");
  const hit = views.get(key);
  if (hit) return hit;
  const pr = makeProjection(cam);
  const cx = pr.invertNorm(960, 540)[0];
  const lod = lodFor(cam.zoom);
  const boxes = new Map<GeoFeature, Box4>();
  for (const f of countries) boxes.set(f, screenBox(f, pr, cx));
  let flat: MapView["flat"] = null;
  if (!(cam.tilt > 0)) {
    const [ccx, ccy] = toNorm(cam.lng, cam.lat);
    const br = (-cam.turn * Math.PI) / 180, cb = Math.cos(br), sb = Math.sin(br), s = pr.size;
    const corners = [[-220, -220], [2140, -220], [-220, 1300], [2140, 1300]].map(([x, y]) => pr.invertNorm(x, y));
    flat = {
      m: [s * cb, s * sb, -s * sb, s * cb, 960 - s * (cb * ccx - sb * ccy), 540 - s * (sb * ccx + cb * ccy)],
      vx0: Math.min(...corners.map((q) => q[0])), vx1: Math.max(...corners.map((q) => q[0])),
      vy0: Math.min(...corners.map((q) => q[1])), vy1: Math.max(...corners.map((q) => q[1])),
    };
  }
  const view: MapView = { pr, cx, lod, boxes, flat, paths: new Map(), uses: 0 };
  if (views.size >= VIEW_LIMIT) views.delete(views.keys().next().value as string);
  views.set(key, view);
  return view;
}

/** All visible land as one path, built on first use. */
function landPath(view: MapView, countries: GeoFeature[]): Path2D {
  if (view.land) return view.land;
  const land = new Path2D();
  for (const f of countries) {
    if (!visible(view.boxes.get(f)!)) continue;
    if (view.flat) addFlat(land, view, f); else addRings(land, f, view.pr, view.cx, view.lod);
  }
  view.land = land;
  return land;
}

function featurePath(view: MapView, f: GeoFeature): Path2D {
  let p = view.paths.get(f);
  if (!p) {
    p = new Path2D();
    if (view.flat) addFlat(p, view, f); else addRings(p, f, view.pr, view.cx, view.lod);
    view.paths.set(f, p);
  }
  return p;
}

/** Ocean, land and borders for one camera. Painted once per camera and drawn as a bitmap on preview frames. */
function paintBase(g: CanvasRenderingContext2D, view: MapView, cam: MapCam, countries: GeoFeature[]) {
  const land = landPath(view, countries);
  g.fillStyle = OCEAN;
  g.fillRect(-200, -200, 2320, 1480);
  g.fillStyle = LAND;
  g.fill(land, "evenodd");
  g.lineJoin = "round";
  g.strokeStyle = BORDER;
  g.lineWidth = Math.min(2.2, 1.1 + cam.zoom * 0.12);
  g.globalAlpha *= 0.8;
  g.stroke(land);
  g.globalAlpha /= 0.8;
}

/** `avoid`: frame rectangles [x, y, w, h] of the markers drawn over this map; country names keep clear of them. */
export function renderMap(ctx: CanvasRenderingContext2D, theme: Theme, cam: MapCam, fills: MapFill[], labels: boolean, t: number, renames: MapRename[] = [], avoid: Box4[] = []) {
  ctx.save();
  if (!geoReady("countries")) {
    ctx.fillStyle = OCEAN;
    ctx.fillRect(-200, -200, 2320, 1480);
    ctx.fillStyle = "rgba(44,62,80,0.55)";
    ctx.font = bodyFont(theme, 32, 500);
    ctx.textAlign = "center";
    ctx.fillText("Loading map…", 960, 540);
    ctx.restore();
    return;
  }
  const countries = geoFeatures("countries");
  const view = viewFor(cam, countries);
  const { pr, cx, boxes } = view;
  view.uses++;
  if (ctx.canvas.width === PREVIEW_W && view.uses > 1) {
    if (!view.base) {
      const c = document.createElement("canvas");
      c.width = 2320;
      c.height = 1480;
      const g = c.getContext("2d")!;
      g.translate(200, 200);
      paintBase(g, view, cam, countries);
      view.base = c;
    }
    ctx.drawImage(view.base, -200, -200);
  } else if (ctx.canvas.width === PREVIEW_W) {
    // a camera seen once (a frame of a flight): paint at half size into one reused canvas
    scratch ??= document.createElement("canvas");
    const c = scratch;
    c.width = 1160;
    c.height = 740;
    const g = c.getContext("2d")!;
    g.scale(0.5, 0.5);
    g.translate(200, 200);
    paintBase(g, view, cam, countries);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c, -200, -200, 2320, 1480);
  } else {
    paintBase(ctx, view, cam, countries);
  }

  // colourings — original fill animations (renderer.js drawFeature)
  for (const f of fills) {
    if (!f.feature || t < f.t0 || t >= f.end) continue;
    const b = boxes.get(f.feature) ?? screenBox(f.feature, pr, cx);
    if (!visible(b)) continue;
    const local = t - f.t0;
    const p = clamp01(local / Math.max(0.01, f.d));
    let fa = 0, oa = 0, ow = 4 * S;
    if (f.occupied) {
      fa = 0.8 * clamp01(local / 0.05);
      oa = fa;
      ow = 3 * S;
    } else {
      switch (f.anim) {
        case "none": fa = 0.7 * clamp01(local / 0.05); oa = fa; ow = 4 * S; break;
        case "pulse": { const e = out(p); fa = 0.7 * e; oa = 0.7 * e; ow = (6 - 2 * p) * S; break; }
        case "fade": { fa = 0.7 * p; oa = 0.7 * p; ow = 3 * S; break; }
        case "radial": { const e = smooth(p); fa = 0.7 * e; oa = Math.min(1, e * 1.5); ow = (8 - 4 * p) * S; break; }
        case "sweep": { ow = (8 - 4 * smooth(p)) * S; oa = 1; fa = p < 0.3 ? 0 : 0.7 * clamp01((p - 0.3) / 0.7); break; }
      }
    }
    if (fa <= 0 && oa <= 0) continue;
    const path = featurePath(view, f.feature);
    ctx.save();
    if (f.occupied) {
      ctx.save();
      ctx.clip(path, "evenodd");
      ctx.globalAlpha *= fa;
      ctx.fillStyle = stripePattern(ctx, f.color);
      ctx.fillRect(b[0] - T2, b[1] - T2, b[2] - b[0] + 2 * T2, b[3] - b[1] + 2 * T2);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= oa;
      ctx.strokeStyle = darken(f.color, 0.3);
      ctx.lineWidth = ow;
      ctx.setLineDash([8 * S, 5.3 * S]);
      ctx.stroke(path);
      ctx.restore();
    } else {
      if (fa > 0) {
        ctx.globalAlpha *= fa;
        ctx.fillStyle = f.color;
        ctx.fill(path, "evenodd");
      }
      if (oa > 0) {
        ctx.save();
        ctx.globalAlpha *= oa;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = ow;
        ctx.filter = `blur(${(3 * S).toFixed(1)}px)`;
        ctx.stroke(path);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  if (labels) drawNativeLabels(ctx, theme, cam, pr, countries, boxes, renames, t, avoid);
  ctx.restore();
}

const T2 = 64; // pattern bleed for occupied fills

/** Split a name into two lines of about equal width, at a space. */
function twoLines(ctx: CanvasRenderingContext2D, name: string): string[] {
  const words = name.split(" ");
  if (words.length < 2) return [name];
  let best: string[] = [name], bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const w = Math.max(...l.map((x) => ctx.measureText(x).width));
    if (w < bestW) { best = l; bestW = w; }
  }
  return best;
}

/**
 * Width and height (normalised) of a country's largest piece of land. A label is sized and
 * fitted to this, not to the whole bbox, which for France, the Netherlands or Norway spans
 * overseas territories far away.
 */
const mainCache = new WeakMap<GeoFeature, [number, number]>();
function mainExtent(f: GeoFeature): [number, number] {
  let e = mainCache.get(f);
  if (e) return e;
  e = [0, 0];
  let best = -1;
  for (const r of f.rings) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i]; if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1]; if (r[i + 1] > y1) y1 = r[i + 1];
    }
    const area = (x1 - x0) * (y1 - y0);
    if (area > best) { best = area; e = [x1 - x0, y1 - y0]; }
  }
  mainCache.set(f, e);
  return e;
}

type Rect = [number, number, number, number]; // x0, y0, x1, y1
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/**
 * Country names: uppercase, most populous first, never overlapping each other, the custom
 * labels or the markers on the map. A name is shown only where it fits its country; it wraps
 * onto two lines when that helps, and fades (instead of popping) as the camera brings it in
 * or out of fit and near the frame edge. Big countries get somewhat bigger names.
 */
function drawNativeLabels(
  ctx: CanvasRenderingContext2D, theme: Theme, cam: MapCam, pr: Projection,
  countries: GeoFeature[], boxes: Map<GeoFeature, Box4>, renames: MapRename[], t: number, avoid: Box4[],
) {
  const opacity = clamp01((cam.zoom - 1) / 1); // fade in between zoom 1 and 2
  const base = nativeLabelSize(cam.zoom);
  const taken: Rect[] = avoid.map(([x, y, w, h]) => [x, y, x + w, y + h]);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  // per-country custom labels go first, so the native ones keep clear of them
  const renamed = new Set<string>();
  for (const r of renames) {
    if (t < r.t0 || t >= r.end) continue;
    const f = countries.find((c) => c.name.toLowerCase() === r.name.toLowerCase());
    if (!f) continue;
    renamed.add(f.name.toLowerCase());
    const [x, y] = r.at ? pr.point(r.at[0], r.at[1]) : pr.point(...f.center);
    const fs = Math.max(base * 1.05, 18 * S);
    ctx.font = bodyFont(theme, fs, 700);
    const tw = ctx.measureText(r.text).width;
    taken.push([x - tw / 2 - fs * 0.4, y - fs * 0.8, x + tw / 2 + fs * 0.4, y + fs * 0.8]);
    ctx.save();
    ctx.globalAlpha *= clamp01((t - r.t0) / 0.3);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = Math.max(4, fs * 0.24);
    ctx.strokeText(r.text, x, y);
    ctx.fillStyle = "#334155";
    ctx.fillText(r.text, x, y);
    ctx.restore();
  }

  if (opacity > 0) {
    const eligible = countries.filter((f) => !renamed.has(f.name.toLowerCase()) &&
      (!f.type || f.type === "Sovereign country" || f.type === "Country" || f.type === "Sovereignty"));
    eligible.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
    for (const f of eligible) {
      const b = boxes.get(f)!;
      if (!visible(b)) continue;
      const [mw, mh] = mainExtent(f);
      const w = Math.min(mw * pr.size, b[2] - b[0]), h = Math.min(mh * pr.size, b[3] - b[1]);
      if (w < base * 2.5) continue;
      const [x, y] = pr.point(...f.center);
      const edge = clamp01(Math.min(x - 30, 1890 - x, y - 24, 1056 - y) / 50);
      if (edge <= 0) continue;
      // big countries: up to 1.35x the base size
      const size = base * Math.min(1.35, Math.max(1, Math.sqrt(w * h) / (base * 18)));
      ctx.font = bodyFont(theme, size, 500);
      try { (ctx as any).letterSpacing = `${(size * 0.08).toFixed(2)}px`; } catch { /* older canvas */ }
      const name = f.name.toUpperCase();
      let lines = [name];
      let tw = ctx.measureText(name).width;
      if (tw > w * 0.9) {
        const two = twoLines(ctx, name);
        const tw2 = Math.max(...two.map((l) => ctx.measureText(l).width));
        if (two.length === 2 && tw2 < tw && h > size * 2.6) { lines = two; tw = tw2; }
      }
      // fade with how well the name fits its country: full above 1.05x, gone below 0.8x
      const fit = clamp01((w / tw - 0.8) / 0.25);
      const a = opacity * fit * edge;
      if (a <= 0.02) continue;
      const lh = size * 1.15;
      const bh = lines.length * lh;
      const rect: Rect = [x - tw / 2 - size * 0.5, y - bh / 2 - size * 0.3, x + tw / 2 + size * 0.5, y + bh / 2 + size * 0.3];
      if (taken.some((r) => overlaps(rect, r))) continue;
      taken.push(rect);
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.strokeStyle = "rgba(240,235,224,0.92)";
      ctx.lineWidth = Math.max(3, size * 0.22);
      ctx.fillStyle = "#2c3e50";
      lines.forEach((l, i) => {
        const ly = y - bh / 2 + lh * (i + 0.5);
        ctx.strokeText(l, x, ly);
        ctx.fillText(l, x, ly);
      });
      ctx.restore();
    }
  }
  try { (ctx as any).letterSpacing = "0px"; } catch { /* ignore */ }
  ctx.restore();
}

/** Points along the attack curve. */
export function attackCurve(a: [number, number], b: [number, number], bend: number, n = 48) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const c: [number, number] = [(a[0] + b[0]) / 2 - (dy / len) * bend * len, (a[1] + b[1]) / 2 + (dx / len) * bend * len];
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    pts.push([(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]]);
  }
  return { pts, control: c };
}

const pathCache = new Map<string, Path2D>();
const pathOf = (d: string) => {
  let p = pathCache.get(d);
  if (!p) { p = new Path2D(d); pathCache.set(d, p); }
  return p;
};

/**
 * Attack arrow, redrawn to the original canvas renderer: a thin quadratic
 * stroke with an open V head, revealed along its length over ~0.8s.
 */
export function drawAttack(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], bend: number, width: number, head: number, color: string, p: number) {
  if (p <= 0) return;
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (dist < 5 * S) return;
  const e = out(clamp01(p));
  const distCss = dist / S;
  const shaftW = Math.max(2, Math.min(4, distCss * 0.012)) * (width || 1) * S;
  const headLen = Math.max(14, Math.min(32, distCss * 0.1)) * (head || 1) * S;
  const half = headLen * 0.42;
  const { control } = attackCurve(a, b, bend);
  ctx.save();
  ctx.globalAlpha *= e < 0.15 ? e / 0.15 : 1;
  // shaft — dashed reveal along the curve
  ctx.strokeStyle = color;
  ctx.lineWidth = shaftW;
  ctx.lineCap = "round";
  ctx.setLineDash([dist * 1.3 * e, dist * 1.3]);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(control[0], control[1], b[0], b[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  // open V head, fading in over the last 30% of the draw
  const headA = Math.max(0, (e - 0.7) / 0.3);
  if (headA > 0) {
    const ang = Math.atan2(b[1] - control[1], b[0] - control[0]);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const px = -sa, py = ca;
    ctx.globalAlpha *= headA;
    ctx.lineWidth = Math.max(shaftW, 2) * (head || 1);
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(b[0] - ca * headLen * 0.9 + px * half, b[1] - sa * headLen * 0.9 + py * half);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(b[0] - ca * headLen * 0.9 - px * half, b[1] - sa * headLen * 0.9 - py * half);
    ctx.stroke();
  }
  ctx.restore();
}

/** Connection line between two countries: straight, dashed, under the labels. */
export function drawRoute(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, p: number, straight = false) {
  if (p <= 0) return;
  const e = out(clamp01(p));
  if (straight) {
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    ctx.save();
    ctx.globalAlpha *= 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * S;
    ctx.setLineDash([dist * 1.3 * e, dist * 1.3]);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const { pts } = attackCurve(a, b, 0.12);
  const use = pts.slice(0, Math.max(2, Math.round(pts.length * e)));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  use.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  for (const q of [a, use[use.length - 1]]) { ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

/** Built-in pop for studio symbols (0.35s appear). */
export const popIn = (local: number) => (local >= 0.35 ? 1 : Math.max(0, 1 + 2.7 * Math.pow(local / 0.35 - 1, 3) + 1.7 * Math.pow(local / 0.35 - 1, 2)));

export function drawPin(ctx: CanvasRenderingContext2D, sym: SymbolName, color: string, size: number, local: number, zoom: number) {
  const k = popIn(local);
  if (k <= 0) return;
  const zoomComp = clamp(Math.pow(2, (zoom - 4) * 0.25), 0.4, 2);
  ctx.save();
  ctx.scale(k, k);
  drawSymbol(ctx, sym, color, 26 * size * zoomComp);
  ctx.restore();
}

/** Effect marker from the original library: 48px square scaled by size and zoom. */
export function drawEffect(ctx: CanvasRenderingContext2D, sym: string, color: string, size: number, local: number, zoom: number) {
  const def = EFFECTS[sym];
  if (!def) return;
  const zoomComp = clamp(Math.pow(2, (zoom - 4) * 0.25), 0.4, 2);
  const px = 48 * S * clamp(size, 0.5, 3) * zoomComp;
  // entrance animations from the original stylesheet
  let op = 1, scale = 1, glow = 0;
  const name = sym;
  if (name === "explosion") {
    const p = clamp01(local / 0.5); // fx-burst .5s
    op = p < 0.5 ? p * 2 : 1;
    scale = p < 0.5 ? 0.2 + (1.15 - 0.2) * out(p * 2) : 1.15 - 0.15 * clamp01((p - 0.5) / 0.5);
  } else if (name === "fire") {
    const ph = (local / 0.8) % 2; // flicker .8s alternate
    const q = ph < 1 ? ph : 2 - ph;
    op = 0.8 + 0.2 * q;
    glow = 0.1 * q;
  } else if (name === "nuke") {
    const q = smooth((local % 3) / 3); // glow 3s infinite
    glow = q;
    op = 1;
  } else {
    const p = clamp01(local / 0.35); // fx-appear
    op = p;
    scale = 0.6 + 0.4 * out(p);
  }
  if (op <= 0) return;
  const k = (px / Math.max(def.vb[0], def.vb[1])) * scale;
  ctx.save();
  ctx.globalAlpha *= op;
  ctx.translate(-def.vb[0] / 2 * k, -def.vb[1] / 2 * k);
  ctx.scale(k, k);
  if (glow > 0.02) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * glow * S;
  }
  if (def.stroked) {
    ctx.strokeStyle = color;
    ctx.lineWidth = def.sw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const d of def.paths) ctx.stroke(pathOf(d));
  } else {
    ctx.fillStyle = color;
    for (const d of def.paths) ctx.fill(pathOf(d));
  }
  ctx.restore();
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Callout cards (bubbles and pointer tags) are drawn this much larger than in the map tool:
 * the tool's 15px text is fine on an editor screen but too small in a video.
 */
export const CARD_SCALE = 1.35;

export function bubbleLayout(ctx: CanvasRenderingContext2D, theme: Theme, text: string, subtitle = false) {
  const font = 20, lh = 32, padX = 2 * 29, padY = 2 * 21;
  ctx.font = bodyFont(theme, font, 500);
  const maxW = subtitle ? 1146 - padX : 506 - padX;
  const lines = wrapText(ctx, text, maxW);
  const w = subtitle ? 1146 : Math.min(506, Math.max(160, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX));
  const h = lines.length * lh + padY;
  return { lines, w, h, font, lh, padX, padY };
}

/**
 * Dark callout card. Geographic bubbles hang above their anchor point;
 * subtitle bubbles fill the bottom-centre band of the frame.
 */
export function drawBubble(ctx: CanvasRenderingContext2D, theme: Theme, text: string, color: string, local: number, subtitle = false) {
  const k = subtitle ? clamp01(local / 0.3) : popIn(local);
  if (k <= 0) return;
  const { lines, w, h, font, lh, padX, padY } = bubbleLayout(ctx, theme, text, subtitle);
  ctx.save();
  ctx.scale(CARD_SCALE, CARD_SCALE);
  ctx.globalAlpha *= k;
  if (!subtitle) ctx.scale(popIn(local), popIn(local));
  const x = -w / 2, y = subtitle ? -h : -h - 13;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 24 * S;
  ctx.shadowOffsetY = 5 * S;
  ctx.fillStyle = "rgba(20,20,30,0.95)";
  fillRound(ctx, x, y, w, h, (subtitle ? 6 : 8) * S);
  ctx.shadowColor = "transparent";
  // left accent stripe
  ctx.fillStyle = color;
  fillRound(ctx, x, y, (subtitle ? 3 : 4) * S, h, 2);
  ctx.fillStyle = "#ffffff";
  ctx.font = bodyFont(theme, font, 500);
  ctx.textAlign = subtitle ? "center" : "left";
  ctx.textBaseline = "middle";
  const tx = subtitle ? 0 : x + padX / 2;
  lines.forEach((l, i) => ctx.fillText(l, tx, y + padY / 2 + lh * (i + 0.5)));
  ctx.restore();
}

/** True for #rgb / #rrggbb colours darker than mid-grey; named colours count as light. */
function isDark(c: string) {
  const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  const hex = m ? m[1] + m[1] + m[2] + m[2] + m[3] + m[3] : /^#([0-9a-f]{6})$/i.exec(c)?.[1];
  if (!hex) return false;
  const n = parseInt(hex, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 128;
}

/** Plain map label: light text gets a soft black shadow, dark text a light halo. */
export function drawPlace(ctx: CanvasRenderingContext2D, theme: Theme, text: string, size: number, color: string, local: number) {
  ctx.save();
  ctx.globalAlpha *= clamp01(local / 0.3);
  const fs = size * S;
  ctx.font = bodyFont(theme, fs, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (isDark(color)) {
    // dark text: a light halo like the country names (a black glow would turn it into a smudge)
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = Math.max(4, fs * 0.24);
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
    return;
  }
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 4 * S;
  ctx.shadowOffsetY = 2 * S;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 12 * S;
  ctx.shadowOffsetY = 0;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function tagLayout(ctx: CanvasRenderingContext2D, theme: Theme, text: string) {
  ctx.font = bodyFont(theme, 20, 600);
  const cw = Math.min(426, ctx.measureText(text).width + 48);
  return { cw, ch: 21 + 32, shaft: 80, head: 13, headH: 8 };
}

/** Pointer label ("arrow"): dark card connected by a thin shaft with a solid head. */
export function drawTag(ctx: CanvasRenderingContext2D, theme: Theme, text: string, dir: "left" | "right", color: string, local: number) {
  const p = out(clamp01(local / 0.35));
  if (p <= 0) return;
  const { cw, ch, shaft, head, headH } = tagLayout(ctx, theme, text);
  const s = dir === "right" ? 1 : -1;
  ctx.save();
  ctx.scale(CARD_SCALE, CARD_SCALE);
  ctx.globalAlpha *= p;
  ctx.translate(s * 30 * (1 - p), 0);
  // shaft
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(s * (shaft - 12), 0);
  ctx.stroke();
  // solid triangular head
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(s * shaft, 0);
  ctx.lineTo(s * (shaft - head), -headH / 2);
  ctx.lineTo(s * (shaft - head), headH / 2);
  ctx.closePath();
  ctx.fill();
  // content card
  const x = s * shaft, w = cw, h = ch;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 20 * S;
  ctx.shadowOffsetY = 5 * S;
  ctx.fillStyle = "rgba(0,0,0,0.92)";
  fillRound(ctx, dir === "right" ? x : x - w, -h / 2, w, h, 6 * S);
  ctx.shadowColor = "transparent";
  // accent stripe on the side facing the point
  ctx.fillStyle = color;
  fillRound(ctx, dir === "right" ? x : x + w - 4 * S, -h / 2, 4 * S, h, 2);
  ctx.fillStyle = "#ffffff";
  ctx.font = bodyFont(theme, 20, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + s * w / 2, 1);
  ctx.restore();
}

/** Year pill, top-left, dark with a green border — as the original. */
export function drawYear(ctx: CanvasRenderingContext2D, theme: Theme, text: string, _highlight: boolean, local: number) {
  const p = out(clamp01(local / 0.35));
  ctx.save();
  ctx.globalAlpha *= p;
  ctx.translate(0, -16 * (1 - p));
  const fs = 28 * S;
  ctx.font = bodyFont(theme, fs, 700);
  try { (ctx as any).letterSpacing = `${(-fs * 0.036).toFixed(2)}px`; } catch { /* older canvas */ }
  const w = ctx.measureText(text).width + 2 * 43 * S, h = 28 * S + 2 * 19 * S;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 20 * S;
  ctx.shadowOffsetY = 5 * S;
  ctx.fillStyle = "rgba(0,0,0,0.95)";
  fillRound(ctx, 0, 0, w, h, h / 2);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#4cd964";
  ctx.lineWidth = 2 * S;
  fillRound(ctx, 0, 0, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 1);
  try { (ctx as any).letterSpacing = "0px"; } catch { /* ignore */ }
  ctx.restore();
  return { w, h };
}

/** Legend card hanging from the top-right corner, as the original. */
export function drawLegend(ctx: CanvasRenderingContext2D, theme: Theme, entries: { label: string; color: string; t0: number }[], t: number) {
  const shown = entries.filter((e) => t >= e.t0);
  if (!shown.length) return;
  ctx.save();
  ctx.font = bodyFont(theme, 16, 400);
  const w = Math.max(160, ...shown.map((e) => ctx.measureText(e.label).width + 21 + 13 + 2 * 21));
  const h = shown.length * 26 + 2 * 16;
  ctx.globalAlpha *= clamp01((t - shown[0].t0) / 0.3);
  ctx.fillStyle = "rgba(0,0,0,0.9)";
  fillRound(ctx, -w, 0, w, h, 8 * S);
  ctx.strokeStyle = "rgba(102,126,234,0.3)";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  shown.forEach((e, i) => {
    const a = out(clamp01((t - e.t0) / 0.4));
    ctx.save();
    ctx.globalAlpha *= a;
    const y = 16 + 13 + i * 26;
    ctx.fillStyle = e.color;
    fillRound(ctx, -w + 21, y - 10.5, 21, 21, 4);
    ctx.fillStyle = "#dddddd";
    ctx.fillText(e.label, -w + 21 + 21 + 13, y + 1);
    ctx.restore();
  });
  ctx.restore();
}
