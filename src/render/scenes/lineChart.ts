import type { LineChartScene, RenderCtx } from "../types";
import { prog } from "../easing";
import { alpha, bodyFont, displayFont, displayText } from "../theme";
import { drawSource, formatNumber } from "../text";

export function renderLineChart(rc: RenderCtx, s: LineChartScene, t: number) {
  const { ctx, theme, width: W, height: H } = rc;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, W, H);

  const te = theme.easing.enter(prog(t, 0, 0.5));
  ctx.save();
  ctx.globalAlpha = te;
  ctx.font = displayFont(theme, 76);
  ctx.fillStyle = theme.colors.text;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(displayText(theme, s.title), 96, 90 + (1 - te) * 30);
  ctx.fillStyle = theme.colors.accent;
  ctx.fillRect(96, 196, 120 * te, 8);
  ctx.restore();

  const left = 200, right = W - 220, top = 300, bottom = H - 200;
  const ys = s.points.map((p) => p.y);
  const minY = Math.min(0, ...ys), maxY = Math.max(...ys) * 1.1 || 1;
  const px = (i: number) => left + ((right - left) * i) / (s.points.length - 1);
  const py = (v: number) => bottom - ((v - minY) / (maxY - minY)) * (bottom - top);

  // grid
  const ge = prog(t, 0.2, 0.5);
  ctx.globalAlpha = ge;
  ctx.font = bodyFont(theme, 24, 500);
  for (let k = 0; k <= 4; k++) {
    const v = minY + ((maxY - minY) * k) / 4;
    const y = py(v);
    ctx.fillStyle = alpha(theme.colors.text, k === 0 ? 0.35 : 0.1);
    ctx.fillRect(left, y, right - left, k === 0 ? 3 : 1);
    ctx.fillStyle = alpha(theme.colors.text, 0.5);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatNumber(v, maxY < 10 ? 1 : 0), left - 20, y);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const step = Math.ceil(s.points.length / 8);
  s.points.forEach((p, i) => {
    if (i % step === 0 || i === s.points.length - 1) ctx.fillText(p.x, px(i), bottom + 18);
  });
  ctx.globalAlpha = 1;

  // line draw
  const drawDur = Math.max(1, s.duration - 2.2);
  const d = theme.easing.move(prog(t, 0.5, drawDur));
  const segs = s.points.length - 1;
  const f = d * segs;
  const full = Math.floor(f);
  ctx.strokeStyle = theme.colors.accent;
  ctx.lineWidth = 8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(px(0), py(s.points[0].y));
  for (let i = 1; i <= full; i++) ctx.lineTo(px(i), py(s.points[i].y));
  let endX = px(full), endY = py(s.points[full].y), endV = s.points[full].y;
  if (full < segs) {
    const r = f - full;
    endX = px(full) + (px(full + 1) - px(full)) * r;
    endV = s.points[full].y + (s.points[full + 1].y - s.points[full].y) * r;
    endY = py(endV);
    ctx.lineTo(endX, endY);
  }
  if (d > 0) ctx.stroke();

  // end point
  if (d > 0) {
    const done = d >= 1;
    const pulse = done ? (Math.sin((t - 0.5 - drawDur) * 5) + 1) / 2 : 0;
    ctx.fillStyle = alpha(theme.colors.accent, 0.25 * (1 - pulse) + 0.1);
    ctx.beginPath();
    ctx.arc(endX, endY, 22 + pulse * 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.colors.accent;
    ctx.beginPath();
    ctx.arc(endX, endY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = bodyFont(theme, 44, 700);
    ctx.fillStyle = theme.colors.text;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${formatNumber(endV, maxY < 10 ? 2 : 0)}${s.unit}`, endX - 10, endY - 34);
  }

  drawSource(rc, s.source, prog(t, 1, 0.5), s.unverified);
}
