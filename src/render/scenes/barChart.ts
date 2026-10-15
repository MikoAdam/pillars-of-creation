import { paintBackground } from "../background";
import type { BarChartScene, RenderCtx } from "../types";
import { prog } from "../easing";
import { alpha, bodyFont, displayFont, displayText } from "../theme";
import { drawSource, formatNumber } from "../text";

export function renderBarChart(rc: RenderCtx, s: BarChartScene, t: number) {
  const { ctx, theme, width: W, height: H } = rc;
  paintBackground(rc);

  const te = theme.easing.enter(prog(t, 0, 0.5));
  ctx.save();
  ctx.globalAlpha = te;
  ctx.font = displayFont(theme, 76);
  ctx.fillStyle = theme.colors.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(displayText(theme, s.title), 96, 90 + (1 - te) * 30);
  ctx.fillStyle = theme.colors.accent;
  ctx.fillRect(96, 196, 120 * te, 8);
  ctx.restore();

  const left = 96, right = W - 96, top = 300, bottom = H - 190;
  const n = s.bars.length;
  const gap = 36;
  const bw = (right - left - gap * (n - 1)) / n;
  const max = Math.max(...s.bars.map((b) => b.value)) || 1;
  const anyHighlight = s.bars.some((b) => b.highlight);

  // baseline
  ctx.fillStyle = alpha(theme.colors.text, 0.3);
  ctx.fillRect(left, bottom, (right - left) * theme.easing.enter(prog(t, 0.2, 0.5)), 3);

  const growDur = 0.8;
  const stagger = Math.min(0.25, (s.duration - 2) / Math.max(1, n));
  s.bars.forEach((b, i) => {
    const p = theme.easing.enter(prog(t, 0.4 + i * stagger, growDur));
    const h = ((bottom - top - 60) * b.value) / max;
    const x = left + i * (bw + gap);
    const color = !anyHighlight || b.highlight ? theme.colors.accent : alpha(theme.colors.text, 0.35);
    ctx.fillStyle = color;
    ctx.fillRect(x, bottom - h * Math.max(0, p), bw, h * Math.max(0, p));

    const lp = prog(t, 0.4 + i * stagger, 0.3);
    ctx.globalAlpha = lp;
    ctx.fillStyle = theme.colors.text;
    ctx.textAlign = "center";
    ctx.font = bodyFont(theme, Math.min(30, bw * 0.22), 500);
    ctx.textBaseline = "top";
    ctx.fillText(b.label, x + bw / 2, bottom + 20);
    ctx.font = bodyFont(theme, Math.min(40, bw * 0.28), 700);
    ctx.textBaseline = "bottom";
    const v = b.value * Math.min(1, Math.max(0, p));
    const dec = Number.isInteger(b.value) ? 0 : (String(b.value).split(".")[1]?.length ?? 1);
    ctx.fillText(`${formatNumber(v, dec)}${s.unit}`, x + bw / 2, bottom - h * Math.max(0, p) - 12);
    ctx.globalAlpha = 1;
  });

  drawSource(rc, s.source, prog(t, 1, 0.5), s.unverified);
}
