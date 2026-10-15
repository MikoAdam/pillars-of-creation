import type { RenderCtx, StatCounterScene } from "../types";
import { prog, lerp } from "../easing";
import { alpha, bodyFont, displayFont } from "../theme";
import { drawSource, formatNumber } from "../text";

export function renderStatCounter(rc: RenderCtx, s: StatCounterScene, t: number) {
  const { ctx, theme, width: W, height: H } = rc;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, W, H);

  const countDur = Math.min(2.2, s.duration * 0.6);
  const c = theme.easing.count(prog(t, 0.2, countDur));
  const enter = theme.easing.enter(prog(t, 0, 0.5));
  const value = lerp(0, s.value, c);
  const txt = `${s.prefix}${formatNumber(value, s.decimals)}${s.suffix}`;

  // fit number
  let size = 300;
  ctx.font = displayFont(theme, size);
  const finalW = ctx.measureText(`${s.prefix}${formatNumber(s.value, s.decimals)}${s.suffix}`).width;
  if (finalW > W - 300) size = (size * (W - 300)) / finalW;

  const ruleW = 160 * theme.easing.enter(prog(t, 0.1, 0.6));
  ctx.fillStyle = theme.colors.accent;
  ctx.fillRect(W / 2 - ruleW / 2, H / 2 + 20 - size / 2 - 130, ruleW, 10);

  ctx.save();
  ctx.globalAlpha = enter;
  ctx.translate(W / 2, H / 2 + 20 + (1 - enter) * 40);
  ctx.font = displayFont(theme, size);
  ctx.fillStyle = theme.colors.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(txt, 0, 0);
  if (s.unit) {
    ctx.font = bodyFont(theme, 52, 700);
    ctx.fillStyle = theme.colors.accent;
    ctx.fillText(s.unit.toUpperCase(), 0, -size / 2 - 40);
  }
  ctx.restore();

  const le = theme.easing.enter(prog(t, 0.6, 0.6));
  ctx.save();
  ctx.globalAlpha = le;
  ctx.font = bodyFont(theme, 48, 500);
  ctx.fillStyle = alpha(theme.colors.text, 0.85);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(s.label, W / 2, H / 2 + size / 2 + 50 + (1 - le) * 20);
  ctx.restore();

  drawSource(rc, s.source, prog(t, 1, 0.5), s.unverified);
}
