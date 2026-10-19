import type { Assets, RenderCtx, Theme } from "@/render/types";
import { HEIGHT, WIDTH, FPS } from "@/render/types";
import { drawGrain } from "@/render/grain";
import { renderPhotoZoom } from "@/render/scenes/photoZoom";
import { renderStatCounter } from "@/render/scenes/statCounter";
import { renderBarChart } from "@/render/scenes/barChart";
import { renderLineChart } from "@/render/scenes/lineChart";
import { renderHeadline } from "@/render/scenes/headlineHighlight";
import { renderKineticText } from "@/render/scenes/kineticText";
import { alpha, bodyFont, fillRound } from "@/render/theme";
import { wrapText } from "@/render/text";
import { renderMap, drawAttack, drawRoute, drawPin, drawBubble, drawPlace, drawTag, drawYear, drawLegend, drawEffect } from "@/render/scenes/map";
import { anchorAt, geoEnds, mapCamAt, alive, cameraAt, EASES, sample, type Fx, type TObj, type Timeline, type Trans } from "@/lang/timeline";

export interface Override {
  id: string;
  dx: number;
  dy: number;
  scaleMul: number;
  /** extra rotation in degrees */
  drot?: number;
  /** opacity replacement while dragging a slider */
  opacity?: number;
}

type Cam = ReturnType<typeof cameraAt>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function transAmount(tr: Trans | undefined, t: number) {
  if (!tr || tr.d <= 0) return 1;
  return ease(clamp01((t - tr.t) / tr.d));
}

/** Render the whole timeline at time t. Pure function of its inputs. */
export interface RenderOpts {
  /** pixel scale of the output canvas relative to 1920x1080 (2 = 4K) */
  scale?: number;
  /** draw subtitle lines (default true) */
  subtitles?: boolean;
}

export function renderTimeline(ctx: CanvasRenderingContext2D, tl: Timeline, theme: Theme, assets: Assets, t: number, override?: Override, opts?: RenderOpts) {
  const k = opts?.scale ?? 1;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const cam = cameraAt(tl, t);
  for (const o of tl.objects) {
    if (!alive(o, t)) continue;
    drawObject(ctx, o, theme, assets, t, cam, override?.id === o.id ? override : undefined);
  }
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  drawGrain(ctx, WIDTH, HEIGHT, Math.floor(t * FPS), theme.grain);
  if (opts?.subtitles !== false) {
    const sub = subtitleAt(tl, t);
    if (sub) drawSubtitle(ctx, theme, sub, WIDTH / 2, HEIGHT - 70, 1400, 40);
  }
}

export function subtitleAt(tl: Timeline, t: number) {
  return tl.subs?.find((s) => t >= s.t0 && t < s.t1)?.text;
}

/** Subtitle pill, bottom-anchored at (cx, bottom). */
export function drawSubtitle(ctx: CanvasRenderingContext2D, theme: Theme, text: string, cx: number, bottom: number, maxW: number, size: number) {
  ctx.save();
  ctx.font = bodyFont(theme, size, 600);
  const lines = wrapText(ctx, text, maxW).slice(0, 3);
  const lh = size * 1.3, padX = size * 0.6, padY = size * 0.35;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
  const h = lines.length * lh + padY * 2;
  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  fillRound(ctx, cx - w / 2, bottom - h, w, h, size * 0.4);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, cx, bottom - h + padY + lh * (i + 0.5)));
  ctx.restore();
}

/** Entrance/exit look: a = 0 (hidden) .. 1 (fully shown). */
function applyFx(ctx: CanvasRenderingContext2D, fx: Fx, raw: number, box: TObj["box"], st: { op: number; s: number; rot: number; dx: number; dy: number; blur: number }) {
  const e = (n: string) => EASES[n](raw);
  switch (fx.style) {
    case "fade": st.op *= e("out"); break;
    case "pop": st.op *= Math.min(1, raw * 2.5); st.s *= 0.3 + 0.7 * e("overshoot"); break;
    case "rise": st.op *= e("out"); st.dy += 90 * (1 - e("snap")); break;
    case "drop": st.op *= Math.min(1, raw * 3); st.dy -= 260 * (1 - e("bounce")); break;
    case "slide_left": st.op *= Math.min(1, raw * 2); st.dx -= 420 * (1 - e("snap")); break;
    case "slide_right": st.op *= Math.min(1, raw * 2); st.dx += 420 * (1 - e("snap")); break;
    case "blur": st.op *= e("out"); st.blur += 28 * (1 - e("out")); st.s *= 1.12 - 0.12 * e("out"); break;
    case "spin": st.op *= Math.min(1, raw * 2); st.rot -= 120 * (1 - e("overshoot")); st.s *= 0.5 + 0.5 * e("overshoot"); break;
    case "grow": st.s *= e("snap"); break;
    case "wipe": {
      const [x, y, w, h] = box;
      ctx.beginPath();
      ctx.rect(x, y, w * e("smooth"), h);
      ctx.clip();
      break;
    }
  }
}

function drawObject(ctx: CanvasRenderingContext2D, o: TObj, theme: Theme, assets: Assets, t: number, cam: Cam, ov?: Override) {
  const local = t - o.start;
  let [px, py] = sample(o.pos, t);
  let s = sample(o.scale, t)[0];
  let op = ov?.opacity ?? sample(o.opacity, t)[0];
  let rot = sample(o.rot, t)[0] + (ov?.drot ?? 0);
  const p = sample(o.progress, t, true)[0];
  let org = o.origin;
  if (o.data?.geo && !o.data.subtitle) { [px, py] = anchorAt(o, t); org = [px, py]; }
  if (ov) { px += ov.dx; py += ov.dy; s *= ov.scaleMul; }

  ctx.save();
  let blur = 0;
  // scene transitions (screen space, before the camera)
  if (o.enter && t < o.enter.t + o.enter.d) {
    const a = transAmount(o.enter, t);
    switch (o.enter.kind) {
      case "crossfade": op *= a; break;
      case "slide": ctx.translate(WIDTH * (1 - a), 0); break;
      case "zoom": op *= a; zoomAbout(ctx, 0.85 + 0.15 * a); break;
      case "push": ctx.translate(0, HEIGHT * (1 - a)); break;
      case "whip": { const w = whip(o.enter, t); ctx.translate(WIDTH * (1 - w), 0); blur += 40 * Math.sin(Math.PI * w); break; }
      case "blur": op *= a; blur += 30 * (1 - a); break;
      case "wipe": ctx.beginPath(); ctx.rect(0, 0, WIDTH * a, HEIGHT); ctx.clip(); break;
    }
  }
  if (o.exit && t >= o.exit.t) {
    const a = transAmount(o.exit, t);
    switch (o.exit.kind) {
      case "crossfade": op *= 1 - a; break;
      case "slide": ctx.translate(-WIDTH * a, 0); break;
      case "zoom": op *= 1 - a; zoomAbout(ctx, 1 + 0.4 * a); break;
      case "push": ctx.translate(0, -HEIGHT * a); break;
      case "whip": { const w = whip(o.exit, t); ctx.translate(-WIDTH * w, 0); blur += 40 * Math.sin(Math.PI * w); break; }
      case "blur": op *= 1 - a; blur += 30 * a; break;
      case "wipe": break;
    }
  }
  // camera
  ctx.translate(WIDTH / 2 + cam.sx, HEIGHT / 2 + cam.sy);
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.cx, -cam.cy);

  // entrance / exit effects and emphasis
  const st = { op: 1, s: 1, rot: 0, dx: 0, dy: 0, blur: 0 };
  const fxIn = o.enterFx, fxOut = o.exitFx;
  for (const pl of o.pulses) {
    if (t < pl.t0 || t >= pl.t1) continue;
    const q = (t - pl.t0) / Math.max(1e-6, pl.t1 - pl.t0);
    if (pl.kind === "pulse") st.s *= 1 + pl.amt * Math.sin(Math.PI * q);
    else st.rot += pl.amt * Math.sin(q * Math.PI * 6) * (1 - q);
  }
  ctx.translate(px + st.dx, py + st.dy);
  const ts = o.kind === "photo" || o.kind === "map" ? 1 : s;
  const fxState = { op: 1, s: 1, rot: 0, dx: 0, dy: 0, blur: 0 };
  if (fxIn && local < fxIn.d) applyFxPre(fxIn, clamp01(local / fxIn.d), fxState);
  if (fxOut && t > o.end - fxOut.d && o.end !== Infinity) applyFxPre(fxOut, clamp01((o.end - t) / fxOut.d), fxState);
  ctx.translate(fxState.dx, fxState.dy);
  ctx.rotate(((rot + st.rot + fxState.rot) * Math.PI) / 180);
  ctx.scale(ts * st.s * fxState.s, ts * st.s * fxState.s);
  ctx.translate(-org[0], -org[1]);
  if (fxIn && local < fxIn.d && fxIn.style === "wipe") applyFx(ctx, fxIn, clamp01(local / fxIn.d), o.box, fxState);
  if (fxOut && fxOut.style === "wipe" && t > o.end - fxOut.d) applyFx(ctx, fxOut, clamp01((o.end - t) / fxOut.d), o.box, fxState);
  blur += fxState.blur;
  op *= fxState.op * st.op;
  if (blur > 0.3) ctx.filter = `blur(${blur.toFixed(1)}px)`;
  ctx.globalAlpha = clamp01(op);

  const rc: RenderCtx = { ctx, theme, assets, width: WIDTH, height: HEIGHT, transparent: true };
  const d = o.data;
  const over = o.progress.segs[0] ? o.progress.segs[0].t1 - o.progress.segs[0].t0 : 0;
  const base = { id: o.id, duration: 10, transition: "cut" as const };

  switch (o.kind) {
    case "photo":
      renderPhotoZoom(rc, { ...base, type: "PhotoZoom", imageUrl: "@" + d.asset, caption: d.caption, vignette: d.vignette,
        from: { x: 0.5, y: 0.5, scale: s }, to: { x: 0.5, y: 0.5, scale: s }, photoDescription: `Missing asset @${d.asset}` }, local);
      break;
    case "count": {
      ctx.globalAlpha *= clamp01(local / 0.3);
      renderStatCounter(rc, { ...base, type: "StatCounter", value: d.value * p, decimals: d.decimals, prefix: d.prefix, suffix: d.suffix,
        unit: d.unit, label: d.label, source: d.source, unverified: d.unverified } as any, 100);
      break;
    }
    case "bars": {
      const n = d.bars.length;
      const finish = 0.4 + (n - 1) * Math.min(0.25, 8 / n) + 0.8;
      const lt = p < 1 ? p * finish : finish + Math.max(0, local - over);
      renderBarChart(rc, { ...base, type: "BarChart", title: d.title, unit: d.unit, bars: d.bars, source: d.source, unverified: d.unverified } as any, lt);
      break;
    }
    case "line": {
      const lt = p < 1 ? p * 1.5 : 1.5 + Math.max(0, local - over);
      renderLineChart(rc, { ...base, duration: 3.2, type: "LineChart", title: d.title, unit: d.unit, points: d.points, source: d.source, unverified: d.unverified } as any, lt);
      break;
    }
    case "headline":
      renderHeadline(rc, { ...base, duration: (over || 3) + 1.6, type: "HeadlineHighlight", publication: d.paper, headline: d.headline,
        body: d.body, highlights: d.marks, source: d.source, unverified: d.unverified } as any, local);
      break;
    case "say": {
      const emphasis: string[] = [];
      const text = (d.text as string).replace(/\*([^*]+)\*/g, (_m, w: string) => { emphasis.push(...w.split(/\s+/)); return w; });
      renderKineticText(rc, { ...base, type: "KineticText", text, emphasis, wordsPerSecond: 1 / d.beat }, local);
      break;
    }
    case "arrow": drawArrow(ctx, d.a, d.b, p, theme); break;
    case "highlight": drawMarker(ctx, d.a, d.b, p, theme); break;
    case "circle": drawCircle(ctx, o.origin, d.r, p, theme); break;
    case "box": drawBox(ctx, o.origin, d.w, d.h, p, theme); break;
    case "map": renderMap(ctx, theme, mapCamAt(o, t), d.fills, d.labels, t, d.renames ?? []); break;
    case "attack": { const e = geoEnds(o, t); drawAttack(ctx, e.a, e.b, d.bend, d.width, d.head, d.color, p); break; }
    case "route": { const e = geoEnds(o, t); drawRoute(ctx, e.a, e.b, d.color, p, d.straight); break; }
    case "pin": ctx.translate(org[0], org[1]); drawPin(ctx, d.symbol, d.color, d.size, local); break;
    case "bubble": ctx.translate(org[0], org[1]); drawBubble(ctx, theme, d.text, d.color, local, d.subtitle); break;
    case "label": ctx.translate(org[0], org[1]); drawPlace(ctx, theme, d.text, d.size, d.color, local); break;
    case "tag": ctx.translate(org[0], org[1]); drawTag(ctx, theme, d.text, d.dir, d.color, local); break;
    case "year": ctx.translate(o.origin[0], o.origin[1]); drawYear(ctx, theme, d.text, d.highlight, local); break;
    case "legend": ctx.translate(o.origin[0], o.origin[1]); drawLegend(ctx, theme, d.entries, t); break;
    case "effect": ctx.translate(org[0], org[1]); drawEffect(ctx, d.symbol, d.color, d.size, local, mapCamAt(o, t).zoom); break;
  }
  ctx.restore();
}

function applyFxPre(fx: Fx, raw: number, st: { op: number; s: number; rot: number; dx: number; dy: number; blur: number }) {
  if (fx.style === "wipe") return;
  applyFx(null as unknown as CanvasRenderingContext2D, fx, raw, [0, 0, 0, 0], st);
}

function whip(tr: Trans, t: number) {
  const p = clamp01((t - tr.t) / Math.max(1e-6, tr.d));
  return p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
}

function zoomAbout(ctx: CanvasRenderingContext2D, k: number) {
  ctx.translate(WIDTH / 2, HEIGHT / 2);
  ctx.scale(k, k);
  ctx.translate(-WIDTH / 2, -HEIGHT / 2);
}

function stroke(ctx: CanvasRenderingContext2D, theme: Theme, w = 12) {
  ctx.strokeStyle = theme.colors.accent;
  ctx.lineWidth = w;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function drawArrow(ctx: CanvasRenderingContext2D, a: number[], b: number[], p: number, theme: Theme) {
  if (p <= 0) return;
  const x = a[0] + (b[0] - a[0]) * p, y = a[1] + (b[1] - a[1]) * p;
  stroke(ctx, theme);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(x, y);
  ctx.stroke();
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const hl = 44 * Math.min(1, p * 3);
  ctx.beginPath();
  ctx.moveTo(x - hl * Math.cos(ang - 0.5), y - hl * Math.sin(ang - 0.5));
  ctx.lineTo(x, y);
  ctx.lineTo(x - hl * Math.cos(ang + 0.5), y - hl * Math.sin(ang + 0.5));
  ctx.stroke();
}

function drawMarker(ctx: CanvasRenderingContext2D, a: number[], b: number[], p: number, theme: Theme) {
  if (p <= 0) return;
  ctx.strokeStyle = alpha(theme.colors.accent, 0.45);
  ctx.lineWidth = 48;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p);
  ctx.stroke();
}

function drawCircle(ctx: CanvasRenderingContext2D, c: number[], r: number, p: number, theme: Theme) {
  if (p <= 0) return;
  stroke(ctx, theme, 10);
  ctx.beginPath();
  ctx.arc(c[0], c[1], r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
  ctx.stroke();
}

function drawBox(ctx: CanvasRenderingContext2D, c: number[], w: number, h: number, p: number, theme: Theme) {
  if (p <= 0) return;
  stroke(ctx, theme, 10);
  const x = c[0] - w / 2, y = c[1] - h / 2;
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
  let remain = (2 * w + 2 * h) * p;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 1; i < pts.length && remain > 0; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    const k = Math.min(1, remain / len);
    ctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k);
    remain -= len;
  }
  ctx.stroke();
}
