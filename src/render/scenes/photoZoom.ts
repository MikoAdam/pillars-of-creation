import { paintBackground } from "../background";
import type { PhotoZoomScene, RenderCtx } from "../types";
import { lerp, prog } from "../easing";
import { alpha, bodyFont, fillRound } from "../theme";
import { wrapText } from "../text";

export function renderPhotoZoom(rc: RenderCtx, s: PhotoZoomScene, t: number) {
  const { ctx, theme, width: W, height: H } = rc;
  const p = theme.easing.move(prog(t, 0, s.duration));
  paintBackground(rc);

  const img = s.imageUrl ? rc.assets.get(s.imageUrl) : undefined;
  if (img) {
    const scale = lerp(s.from.scale, s.to.scale, p);
    const cx = lerp(s.from.x, s.to.x, p), cy = lerp(s.from.y, s.to.y, p);
    const cover = Math.max(W / img.width, H / img.height) * scale;
    const dw = img.width * cover, dh = img.height * cover;
    // focus point (cx,cy) in image space should stay centered, clamped so edges never show
    let dx = W / 2 - cx * dw, dy = H / 2 - cy * dh;
    dx = Math.min(0, Math.max(W - dw, dx));
    dy = Math.min(0, Math.max(H - dh, dy));
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    // placeholder slot
    ctx.strokeStyle = alpha(theme.colors.text, 0.25);
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 4;
    ctx.strokeRect(120, 120, W - 240, H - 240);
    ctx.setLineDash([]);
    ctx.fillStyle = alpha(theme.colors.text, 0.6);
    ctx.font = bodyFont(theme, 36, 600);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PHOTO SLOT", W / 2, H / 2 - 40);
    ctx.font = bodyFont(theme, 28, 400);
    wrapText(ctx, s.photoDescription ?? "Upload a photo", 1100).forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + 20 + i * 40));
  }

  if (s.vignette) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  if (s.caption) {
    const e = theme.easing.enter(prog(t, 0.4, 0.6));
    ctx.font = bodyFont(theme, 40, 600);
    const tw = ctx.measureText(s.caption).width;
    const bx = 96, by = H - 180, bh = 84;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, (tw + 72) * e, bh);
    ctx.clip();
    ctx.fillStyle = theme.colors.background;
    const r = theme.radius ?? 0;
    fillRound(ctx, bx, by, tw + 72, bh, r);
    ctx.fillStyle = theme.colors.accent;
    if (r > 0) fillRound(ctx, bx + 18, by + 22, 8, bh - 44, 4);
    else ctx.fillRect(bx, by, 10, bh);
    ctx.fillStyle = theme.colors.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s.caption, bx + 40, by + bh / 2 + 2);
    ctx.restore();
  }
}
