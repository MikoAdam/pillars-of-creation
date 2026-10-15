import type { RenderCtx } from "./types";

/** Fill the frame background unless the scene is drawn as a layer. */
export function paintBackground(rc: RenderCtx) {
  if (rc.transparent) return;
  rc.ctx.fillStyle = rc.theme.colors.background;
  rc.ctx.fillRect(0, 0, rc.width, rc.height);
}
