import type { RenderCtx, Theme } from "./types";
import { alpha } from "./theme";

/**
 * The frame background: flat colour, a soft accent glow, and an edge vignette. Used by the timeline and by single scenes.
 * Painted once per look and size, then drawn as a picture: two full-frame gradients on every frame cost more than
 * everything else in a simple frame, which adds up over a long export.
 */
const frames = new Map<string, HTMLCanvasElement>();
export function paintFrame(ctx: CanvasRenderingContext2D, theme: Theme, W: number, H: number) {
  const k = ctx.getTransform().a || 1;
  const key = `${theme.colors.background}|${theme.colors.accent}|${W}|${H}|${k}`;
  let bg = frames.get(key);
  if (!bg && typeof document !== "undefined") {
    bg = document.createElement("canvas");
    bg.width = Math.round(W * k);
    bg.height = Math.round(H * k);
    const g = bg.getContext("2d")!;
    g.scale(k, k);
    paintGradients(g, theme, W, H);
    if (frames.size > 8) frames.delete(frames.keys().next().value as string);
    frames.set(key, bg);
  }
  if (bg) ctx.drawImage(bg, 0, 0, W, H);
  else paintGradients(ctx, theme, W, H);
}

function paintGradients(ctx: CanvasRenderingContext2D, theme: Theme, W: number, H: number) {
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
