import type { RenderCtx } from "./types";
import { alpha } from "./theme";

/** Background with a soft accent glow and an edge vignette, unless the scene is drawn as a layer. */
export function paintBackground(rc: RenderCtx) {
  if (rc.transparent) return;
  const { ctx, theme, width: W, height: H } = rc;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, Math.max(W, H) * 0.6);
  glow.addColorStop(0, alpha(theme.colors.accent, 0.18));
  glow.addColorStop(1, alpha(theme.colors.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.5, W / 2, H / 2, Math.max(W, H) * 0.72);
  edge.addColorStop(0, "rgba(0,0,0,0)");
  edge.addColorStop(1, "rgba(0,0,0,0.14)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
}
