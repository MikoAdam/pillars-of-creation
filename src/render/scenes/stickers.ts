import type { RenderCtx } from "../types";
import { EFFECTS } from "../effectsSymbols";
import { alpha, bodyFont, fillRound } from "../theme";

const paths = new Map<string, Path2D>();
const pathOf = (d: string) => {
  let p = paths.get(d);
  if (!p) { p = new Path2D(d); paths.set(d, p); }
  return p;
};

/** A library icon drawn in one colour, fitted to a size x size square centred on (cx, cy). */
export function drawIcon(rc: RenderCtx, d: { symbol: string; size: number; color: string }, cx: number, cy: number) {
  const def = EFFECTS[d.symbol];
  if (!def) return;
  const { ctx, theme } = rc;
  const k = d.size / Math.max(def.vb[0], def.vb[1]);
  const color = d.color || theme.colors.accent;
  ctx.save();
  ctx.translate(cx - (def.vb[0] * k) / 2, cy - (def.vb[1] * k) / 2);
  ctx.scale(k, k);
  if (def.stroked) {
    ctx.strokeStyle = color;
    ctx.lineWidth = def.sw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const p of def.paths) ctx.stroke(pathOf(p));
  } else {
    ctx.fillStyle = color;
    for (const p of def.paths) ctx.fill(pathOf(p));
  }
  ctx.restore();
}

/** An uploaded picture placed like a shape: `size` is its width, the height follows its own proportions. */
export function drawImage(rc: RenderCtx, d: { asset: string; size: number }, cx: number, cy: number) {
  const { ctx, theme, assets } = rc;
  const img = assets.get("@" + d.asset);
  if (!img || !img.naturalWidth) {
    // not loaded (or never uploaded): a labelled placeholder the same width
    const h = d.size * 0.6;
    ctx.save();
    ctx.fillStyle = alpha(theme.colors.text, 0.08);
    fillRound(ctx, cx - d.size / 2, cy - h / 2, d.size, h, 12);
    ctx.fillStyle = alpha(theme.colors.text, 0.6);
    ctx.font = bodyFont(theme, Math.max(18, Math.min(34, d.size / 12)), 500);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`@${d.asset}`, cx, cy);
    ctx.restore();
    return;
  }
  const h = (d.size * img.naturalHeight) / img.naturalWidth;
  ctx.drawImage(img, cx - d.size / 2, cy - h / 2, d.size, h);
}
