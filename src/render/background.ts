import type { RenderCtx, Theme } from "./types";
import { alpha } from "./theme";

/** The frame background: flat colour, a soft accent glow, and an edge vignette. Used by the timeline and by single scenes. */
export function paintFrame(ctx: CanvasRenderingContext2D, theme: Theme, W: number, H: number) {
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

/** Background for a scene drawn on its own; a scene drawn as a layer leaves the frame as it is. */
export function paintBackground(rc: RenderCtx) {
  if (rc.transparent) return;
  paintFrame(rc.ctx, rc.theme, rc.width, rc.height);
}
