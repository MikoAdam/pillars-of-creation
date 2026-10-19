import type { Theme } from "../types";
import { alpha, bodyFont, displayFont, displayText, fillRound } from "../theme";
import { wrapText } from "../text";
import { geoFeatures, geoReady, makeProjection, type GeoFeature, type MapCam, type Projection } from "../geo";
import { drawSymbol, type SymbolName } from "../symbols";

/** Country / region colouring on a map, timed in absolute seconds. */
export interface MapFill {
  feature: GeoFeature | null;
  color: string;
  anim: "pulse" | "fade" | "radial" | "sweep" | "none";
  t0: number;
  d: number;
  end: number;
  occupied: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const out = (t: number) => 1 - Math.pow(1 - t, 3);

const OCEAN = "#dbe5ef";
const LAND = "#fbfcfd";
const BORDER = "#b9c4d2";

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

export function renderMap(ctx: CanvasRenderingContext2D, theme: Theme, cam: MapCam, fills: MapFill[], labels: boolean, t: number) {
  const pr = makeProjection(cam);
  const cx = pr.invertNorm(960, 540)[0];
  ctx.save();
  ctx.fillStyle = OCEAN;
  ctx.fillRect(-200, -200, 2320, 1480);
  if (!geoReady("countries")) {
    ctx.fillStyle = alpha(theme.colors.text, 0.5);
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
  ctx.lineWidth = Math.min(2.2, 0.8 + cam.zoom * 0.25);
  ctx.stroke();

  // colourings
  for (const f of fills) {
    if (!f.feature || t < f.t0 || t >= f.end + 0.4) continue;
    const b = boxes.get(f.feature) ?? screenBox(f.feature, pr, cx);
    if (!visible(b)) continue;
    const local = t - f.t0;
    const p = clamp01(local / Math.max(0.01, f.d));
    let a = 0.62;
    if (f.anim === "fade") a *= smooth(p);
    if (f.anim === "pulse") {
      const decay = Math.max(0, 1 - local / (f.d + 1.2));
      a *= Math.min(1, p * 1.6) * (1 + 0.4 * Math.sin(local * Math.PI * 3.2) * decay);
    }
    if (t >= f.end) a *= 1 - (t - f.end) / 0.4;
    ctx.save();
    if (f.anim === "radial" && p < 1) {
      const [px, py] = pr.point(...f.feature.center);
      const R = Math.hypot(b[2] - b[0], b[3] - b[1]);
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.1, R * out(p)), 0, Math.PI * 2);
      ctx.clip();
    }
    if (f.anim === "sweep" && p < 1) {
      ctx.beginPath();
      ctx.rect(b[0] - 2, b[1] - 2, (b[2] - b[0] + 4) * smooth(p), b[3] - b[1] + 4);
      ctx.clip();
    }
    ctx.beginPath();
    ringsPath(ctx, f.feature, pr, cx);
    ctx.globalAlpha *= clamp01(a / 0.62);
    if (f.occupied) {
      ctx.save();
      ctx.clip("evenodd");
      ctx.fillStyle = alpha(f.color, 0.16);
      ctx.fillRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
      ctx.strokeStyle = alpha(f.color, 0.85);
      ctx.lineWidth = 6;
      ctx.beginPath();
      const h = b[3] - b[1];
      for (let x = Math.floor((b[0] - h) / 18) * 18; x < b[2]; x += 18) { ctx.moveTo(x, b[3]); ctx.lineTo(x + h, b[1]); }
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = alpha(f.color, 0.62);
      ctx.fill("evenodd");
    }
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.restore();
  }

  if (labels) {
    const coloured = new Set(fills.filter((f) => f.feature && t >= f.t0 && t < f.end).map((f) => f.feature));
    ctx.font = bodyFont(theme, 22, 600);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of countries) {
      const b = boxes.get(f)!;
      const w = b[2] - b[0];
      if (!visible(b) || w < 150 || coloured.has(f)) continue;
      const [x, y] = pr.point(...f.center);
      if (x < 40 || x > 1880 || y < 30 || y > 1050) continue;
      const name = f.name.toUpperCase();
      if (ctx.measureText(name).width > w * 0.8) continue;
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.strokeText(name, x, y);
      ctx.fillStyle = alpha(theme.colors.text, 0.45);
      ctx.fillText(name, x, y);
    }
  }
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

/** Thick tapered military arrow, built to progress p. */
export function drawAttack(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], bend: number, width: number, head: number, color: string, p: number) {
  if (p <= 0) return;
  const { pts } = attackCurve(a, b, bend);
  const m = Math.max(2, Math.round(pts.length * p));
  const use = pts.slice(0, m);
  const tip = use[use.length - 1], prev = use[use.length - 2];
  const ang = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
  const hl = 40 * head, hw = 30 * head;
  // stop the shaft where the head starts
  const base: [number, number] = [tip[0] - Math.cos(ang) * hl * 0.85, tip[1] - Math.sin(ang) * hl * 0.85];
  let cut = use.length - 1;
  while (cut > 1 && Math.hypot(use[cut][0] - tip[0], use[cut][1] - tip[1]) < hl * 0.85) cut--;
  const shaft = [...use.slice(0, cut + 1), base];
  const left: [number, number][] = [], right: [number, number][] = [];
  shaft.forEach((q, i) => {
    const r = shaft[Math.min(shaft.length - 1, i + 1)], l = shaft[Math.max(0, i - 1)];
    const an = Math.atan2(r[1] - l[1], r[0] - l[0]);
    const w = (7 + 7 * (i / Math.max(1, shaft.length - 1))) * width;
    left.push([q[0] + Math.cos(an - Math.PI / 2) * w, q[1] + Math.sin(an - Math.PI / 2) * w]);
    right.push([q[0] + Math.cos(an + Math.PI / 2) * w, q[1] + Math.sin(an + Math.PI / 2) * w]);
  });
  ctx.save();
  ctx.beginPath();
  left.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
  ctx.lineTo(base[0] + Math.cos(ang - Math.PI / 2) * hw, base[1] + Math.sin(ang - Math.PI / 2) * hw);
  ctx.lineTo(tip[0], tip[1]);
  ctx.lineTo(base[0] + Math.cos(ang + Math.PI / 2) * hw, base[1] + Math.sin(ang + Math.PI / 2) * hw);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.shadowColor = "rgba(15,23,42,0.25)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.restore();
}

/** Dashed connection line with end dots. */
export function drawRoute(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, p: number) {
  if (p <= 0) return;
  const { pts } = attackCurve(a, b, 0.12);
  const use = pts.slice(0, Math.max(2, Math.round(pts.length * p)));
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

/** Built-in pop for symbols etc. */
export const popIn = (local: number) => (local >= 0.35 ? 1 : Math.max(0, 1 + 2.7 * Math.pow(local / 0.35 - 1, 3) + 1.7 * Math.pow(local / 0.35 - 1, 2)));

export function drawPin(ctx: CanvasRenderingContext2D, sym: SymbolName, color: string, size: number, local: number) {
  const k = popIn(local);
  if (k <= 0) return;
  ctx.save();
  ctx.scale(k, k);
  drawSymbol(ctx, sym, color, 26 * size);
  ctx.restore();
}

export function bubbleLayout(ctx: CanvasRenderingContext2D, theme: Theme, text: string) {
  ctx.font = bodyFont(theme, 30, 600);
  const lines = wrapText(ctx, text, 460);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 48;
  const h = lines.length * 40 + 30;
  return { lines, w, h };
}

/** Speech-bubble callout whose pointer touches (0, 0). */
export function drawBubble(ctx: CanvasRenderingContext2D, theme: Theme, text: string, color: string, local: number) {
  const k = popIn(local);
  if (k <= 0) return;
  const { lines, w, h } = bubbleLayout(ctx, theme, text);
  ctx.save();
  ctx.scale(k, k);
  const x = -w / 2, y = -h - 26;
  ctx.shadowColor = "rgba(15,23,42,0.22)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#ffffff";
  fillRound(ctx, x, y, w, h, 16);
  ctx.beginPath();
  ctx.moveTo(-14, y + h - 1); ctx.lineTo(0, -6); ctx.lineTo(14, y + h - 1); ctx.closePath(); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = color;
  fillRound(ctx, x, y, 8, h, 4);
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = theme.colors.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, x + 28, y + 15 + 20 + i * 40));
  ctx.restore();
}

/** Plain haloed map label centred on (0, 0). */
export function drawPlace(ctx: CanvasRenderingContext2D, theme: Theme, text: string, size: number, color: string, local: number) {
  ctx.save();
  ctx.globalAlpha *= clamp01(local / 0.4);
  ctx.font = bodyFont(theme, size * 2, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const dark = color === "#e5e7eb" || color === "#ffffff";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.45;
  ctx.strokeStyle = dark ? "rgba(15,23,42,0.75)" : "rgba(255,255,255,0.92)";
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function tagWidth(ctx: CanvasRenderingContext2D, theme: Theme, text: string) {
  ctx.font = bodyFont(theme, 28, 700);
  return ctx.measureText(text).width + 70;
}

/** Arrow-shaped direction label; its point sits at (0, 0). */
export function drawTag(ctx: CanvasRenderingContext2D, theme: Theme, text: string, dir: "left" | "right", color: string, local: number) {
  const w = tagWidth(ctx, theme, text), h = 52;
  const p = out(clamp01(local / 0.45));
  if (p <= 0) return;
  const s = dir === "right" ? -1 : 1;
  ctx.save();
  ctx.globalAlpha *= p;
  ctx.translate(s * 30 * (1 - p), 0);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(s * 26, -h / 2);
  ctx.lineTo(s * w, -h / 2);
  ctx.lineTo(s * w, h / 2);
  ctx.lineTo(s * 26, h / 2);
  ctx.closePath();
  ctx.shadowColor = "rgba(15,23,42,0.2)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#ffffff";
  ctx.font = bodyFont(theme, 28, 700);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, s * (w + 26) / 2, 1);
  ctx.restore();
}

/** Year / date badge, top-left anchored at (0, 0). */
export function drawYear(ctx: CanvasRenderingContext2D, theme: Theme, text: string, highlight: boolean, local: number) {
  const p = out(clamp01(local / 0.5));
  ctx.save();
  ctx.globalAlpha *= p;
  ctx.translate(0, -20 * (1 - p));
  ctx.font = displayFont(theme, 72);
  const s = displayText(theme, text);
  const w = ctx.measureText(s).width + 72, h = 112;
  ctx.shadowColor = "rgba(15,23,42,0.18)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 8;
  const flash = highlight ? Math.max(0, 1 - local / 1.4) : 0;
  ctx.fillStyle = "#ffffff";
  fillRound(ctx, 0, 0, w, h, theme.radius ?? 20);
  ctx.shadowColor = "transparent";
  if (flash > 0) {
    ctx.fillStyle = alpha(theme.colors.accent, flash);
    fillRound(ctx, 0, 0, w, h, theme.radius ?? 20);
  }
  ctx.fillStyle = theme.colors.accent;
  fillRound(ctx, 0, h - 8, w, 8, 4);
  ctx.fillStyle = flash > 0.5 ? "#ffffff" : theme.colors.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(s, w / 2, h / 2 - 2);
  ctx.restore();
  return { w, h };
}

/** Legend card, bottom-left anchored at (0, 0) = its bottom-left corner. */
export function drawLegend(ctx: CanvasRenderingContext2D, theme: Theme, entries: { label: string; color: string; t0: number }[], t: number) {
  const shown = entries.filter((e) => t >= e.t0);
  if (!shown.length) return;
  ctx.save();
  ctx.font = bodyFont(theme, 28, 600);
  const w = Math.max(220, ...shown.map((e) => ctx.measureText(e.label).width + 96));
  const h = shown.length * 46 + 36;
  ctx.shadowColor = "rgba(15,23,42,0.16)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  fillRound(ctx, 0, -h, w, h, theme.radius ?? 18);
  ctx.shadowColor = "transparent";
  ctx.textBaseline = "middle";
  shown.forEach((e, i) => {
    const a = out(clamp01((t - e.t0) / 0.4));
    ctx.globalAlpha = a;
    const y = -h + 18 + 23 + i * 46;
    ctx.fillStyle = alpha(e.color, 0.75);
    fillRound(ctx, 24, y - 13, 34, 26, 7);
    ctx.fillStyle = theme.colors.text;
    ctx.fillText(e.label, 74 + 10 * (1 - a), y);
  });
  ctx.restore();
}
