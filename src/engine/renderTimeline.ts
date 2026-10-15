import type { Assets, RenderCtx, Theme } from "@/render/types";
import { HEIGHT, WIDTH, FPS } from "@/render/types";
import { drawGrain } from "@/render/grain";
import { renderPhotoZoom } from "@/render/scenes/photoZoom";
import { renderStatCounter } from "@/render/scenes/statCounter";
import { renderBarChart } from "@/render/scenes/barChart";
import { renderLineChart } from "@/render/scenes/lineChart";
import { renderHeadline } from "@/render/scenes/headlineHighlight";
import { renderKineticText } from "@/render/scenes/kineticText";
import { alpha } from "@/render/theme";
import { alive, sample, type TObj, type Timeline, type Trans } from "@/lang/timeline";

export interface Override {
  id: string;
  dx: number;
  dy: number;
  scaleMul: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function transAmount(tr: Trans | undefined, t: number) {
  if (!tr || tr.d <= 0) return 1;
  return ease(clamp01((t - tr.t) / tr.d));
}

/** Render the whole timeline at time t. Pure function of its inputs. */
export function renderTimeline(ctx: CanvasRenderingContext2D, tl: Timeline, theme: Theme, assets: Assets, t: number, override?: Override) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (const o of tl.objects) {
    if (!alive(o, t)) continue;
    drawObject(ctx, o, theme, assets, t, override?.id === o.id ? override : undefined);
  }
  drawGrain(ctx, WIDTH, HEIGHT, Math.floor(t * FPS), theme.grain);
}

function drawObject(ctx: CanvasRenderingContext2D, o: TObj, theme: Theme, assets: Assets, t: number, ov?: Override) {
  const local = t - o.start;
  let [px, py] = sample(o.pos, t);
  let s = sample(o.scale, t)[0];
  let op = sample(o.opacity, t)[0];
  const p = sample(o.progress, t, true)[0];
  if (ov) { px += ov.dx; py += ov.dy; s *= ov.scaleMul; }

  ctx.save();
  // scene transitions
  if (o.enter && t < o.enter.t + o.enter.d) {
    const a = transAmount(o.enter, t);
    if (o.enter.kind === "crossfade") op *= a;
    if (o.enter.kind === "slide") ctx.translate(WIDTH * (1 - a), 0);
    if (o.enter.kind === "zoom") { op *= a; zoomAbout(ctx, 0.85 + 0.15 * a); }
  }
  if (o.exit && t >= o.exit.t) {
    const a = transAmount(o.exit, t);
    if (o.exit.kind === "crossfade") op *= 1 - a;
    if (o.exit.kind === "slide") ctx.translate(-WIDTH * a, 0);
    if (o.exit.kind === "zoom") { op *= 1 - a; zoomAbout(ctx, 1 + 0.4 * a); }
  }
  ctx.globalAlpha = clamp01(op);
  const ts = o.kind === "photo" ? 1 : s;
  ctx.translate(px, py);
  ctx.scale(ts, ts);
  ctx.translate(-o.origin[0], -o.origin[1]);

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
  }
  ctx.restore();
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
