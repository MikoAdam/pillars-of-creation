import type { Theme } from "../types";
import { bodyFont, fillRound } from "../theme";
import { wrapText } from "../text";
import { geoFeatures, geoReady, makeProjection, type GeoFeature, type MapCam, type Projection } from "../geo";
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

function ringsPath(ctx: CanvasRenderingContext2D, f: GeoFeature, pr: Projection, cx: number) {
  for (const r of f.rings) {
    // keep each ring on one side of the antimeridian
    const d0 = r[0] - cx;
    const shift = d0 > 0.5 ? -1 : d0 < -0.5 ? 1 : 0;
    for (let i = 0; i < r.length; i += 2) {
      const [x, y] = pr.norm(r[i] + shift, r[i + 1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
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
function stripePattern(ctx: CanvasRenderingContext2D, color: string): CanvasPattern | string {
  let pat = stripeCache.get(color);
  if (pat) return pat;
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
  pat = ctx.createPattern(tile, "repeat") ?? color;
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

/** MapLibre-style text size by zoom: 9/11/13/15 CSS px at zoom 1/4/7/10. */
function nativeLabelSize(zoom: number) {
  const z = Math.max(1, Math.min(10, zoom));
  const stops: [number, number][] = [[1, 9], [4, 11], [7, 13], [10, 15]];
  for (let i = 0; i < stops.length - 1; i++) {
    const [z0, s0] = stops[i], [z1, s1] = stops[i + 1];
    if (z <= z1) return (s0 + ((z - z0) / (z1 - z0)) * (s1 - s0)) * S;
  }
  return 15 * S;
}

export function renderMap(ctx: CanvasRenderingContext2D, theme: Theme, cam: MapCam, fills: MapFill[], labels: boolean, t: number, renames: MapRename[] = []) {
  const pr = makeProjection(cam);
  const cx = pr.invertNorm(960, 540)[0];
  ctx.save();
  ctx.fillStyle = OCEAN;
  ctx.fillRect(-200, -200, 2320, 1480);
  if (!geoReady("countries")) {
    ctx.fillStyle = "rgba(44,62,80,0.55)";
    ctx.font = bodyFont(theme, 32, 500);
    ctx.textAlign = "center";
    ctx.fillText("Loading map…", 960, 540);
    ctx.restore();
    return;
  }
  const countries = geoFeatures("countries");
  const boxes = new Map<GeoFeature, [number, number, number, number]>();
  ctx.beginPath();
  for (const f of countries) {
    const b = screenBox(f, pr, cx);
    boxes.set(f, b);
    if (visible(b)) ringsPath(ctx, f, pr, cx);
  }
  ctx.fillStyle = LAND;
  ctx.fill("evenodd");
  ctx.lineJoin = "round";
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = Math.min(2.2, 1.1 + cam.zoom * 0.12);
  ctx.globalAlpha *= 0.8;
  ctx.stroke();
  ctx.globalAlpha /= 0.8;

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
    ctx.save();
    ctx.beginPath();
    ringsPath(ctx, f.feature, pr, cx);
    if (f.occupied) {
      ctx.save();
      ctx.clip("evenodd");
      ctx.globalAlpha *= fa;
      ctx.fillStyle = stripePattern(ctx, f.color);
      ctx.fillRect(b[0] - T2, b[1] - T2, b[2] - b[0] + 2 * T2, b[3] - b[1] + 2 * T2);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ringsPath(ctx, f.feature, pr, cx);
      ctx.globalAlpha *= oa;
      ctx.strokeStyle = darken(f.color, 0.3);
      ctx.lineWidth = ow;
      ctx.setLineDash([8 * S, 5.3 * S]);
      ctx.stroke();
      ctx.restore();
    } else {
      if (fa > 0) {
        ctx.save();
        ctx.beginPath();
        ringsPath(ctx, f.feature, pr, cx);
        ctx.globalAlpha *= fa;
        ctx.fillStyle = f.color;
        ctx.fill("evenodd");
        ctx.restore();
      }
      if (oa > 0) {
        ctx.save();
        ctx.beginPath();
        ringsPath(ctx, f.feature, pr, cx);
        ctx.globalAlpha *= oa;
        ctx.strokeStyle = f.color;
        ctx.lineWidth = ow;
        ctx.filter = `blur(${(3 * S).toFixed(1)}px)`;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  if (labels) drawNativeLabels(ctx, theme, cam, pr, cx, countries, boxes, renames, t);
  ctx.restore();
}

const T2 = 64; // pattern bleed for occupied fills

/** Native country labels: uppercase, population-priority, collision-approximated. */
function drawNativeLabels(
  ctx: CanvasRenderingContext2D, theme: Theme, cam: MapCam, pr: Projection, cx: number,
  countries: GeoFeature[], boxes: Map<GeoFeature, [number, number, number, number]>, renames: MapRename[], t: number,
) {
  const opacity = clamp01((cam.zoom - 1) / 1); // text-opacity: zoom 1 → 0, zoom 2 → 1
  if (opacity <= 0) return;
  const size = nativeLabelSize(cam.zoom);
  const renamed = new Set(renames.filter((r) => t >= r.t0 && t < r.end).map((r) => r.name.toLowerCase()));
  const eligible = countries.filter((f) => !renamed.has(f.name.toLowerCase()) &&
    (!f.type || f.type === "Sovereign country" || f.type === "Country" || f.type === "Sovereignty"));
  eligible.sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0));
  ctx.font = bodyFont(theme, size, 400);
  try { (ctx as any).letterSpacing = `${(size * 0.07).toFixed(2)}px`; } catch { /* older canvas */ }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const taken: [number, number, number, number][] = [];
  ctx.globalAlpha *= opacity;
  for (const f of eligible) {
    const b = boxes.get(f)!;
    const w = b[2] - b[0], h = b[3] - b[1];
    if (!visible(b) || w < 34) continue;
    const [x, y] = pr.point(...f.center);
    if (x < 20 || x > 1900 || y < 14 || y > 1066) continue;
    const name = f.name.toUpperCase();
    const tw = ctx.measureText(name).width;
    if (tw > w * 0.92) continue;
    const rect: [number, number, number, number] = [x - tw / 2 - 6, y - size * 0.75, tw + 12, size * 1.5];
    if (taken.some((r) => rect[0] < r[2] && rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1])) continue;
    taken.push(rect);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(240,235,224,0.92)";
    ctx.lineWidth = 3;
    ctx.strokeText(name, x, y);
    ctx.fillStyle = "#2c3e50";
    ctx.fillText(name, x, y);
  }
  try { (ctx as any).letterSpacing = "0px"; } catch { /* ignore */ }
  ctx.globalAlpha /= opacity;

  // per-country custom labels replace the native ones
  for (const r of renames) {
    if (t < r.t0 || t >= r.end) continue;
    const f = countries.find((c) => c.name.toLowerCase() === r.name.toLowerCase());
    if (!f) continue;
    const [x, y] = r.at ? pr.point(r.at[0], r.at[1]) : pr.point(...f.center);
    const a = clamp01((t - r.t0) / 0.3);
    ctx.save();
    ctx.globalAlpha *= a;
    const fs = 14 * S;
    ctx.font = bodyFont(theme, fs, 700);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 4;
    ctx.strokeText(r.text, x, y);
    ctx.fillStyle = "#334155";
    ctx.fillText(r.text, x, y);
    ctx.restore();
  }
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

export function drawPin(ctx: CanvasRenderingContext2D, sym: SymbolName, color: string, size: number, local: number) {
  const k = popIn(local);
  if (k <= 0) return;
  ctx.save();
  ctx.scale(k, k);
  drawSymbol(ctx, sym, color, 26 * size);
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

/** Plain map label, white with a soft black shadow. */
export function drawPlace(ctx: CanvasRenderingContext2D, theme: Theme, text: string, size: number, color: string, local: number) {
  ctx.save();
  ctx.globalAlpha *= clamp01(local / 0.3);
  const fs = size * S;
  ctx.font = bodyFont(theme, fs, 600);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
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
