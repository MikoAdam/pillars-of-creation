import type { KineticTextScene, RenderCtx } from "../types";
import { prog } from "../easing";
import { displayFont, displayText } from "../theme";
import { wrapWords } from "../text";

const clean = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}%$]/gu, "");

export function renderKineticText(rc: RenderCtx, s: KineticTextScene, t: number) {
  const { ctx, theme, width: W, height: H } = rc;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, W, H);

  const words = s.text.split(/\s+/).filter(Boolean).map((w) => displayText(theme, w));
  const emph = new Set(s.emphasis.map(clean));
  // size to fit
  let size = 150;
  let lines;
  for (;;) {
    ctx.font = displayFont(theme, size);
    lines = wrapWords(ctx, words, W - 280, size * 0.28);
    if (lines.length * size * 1.08 <= H - 260 || size <= 50) break;
    size -= 8;
  }
  const lh = size * 1.08;
  const sp = size * 0.28;
  const y0 = H / 2 - (lines.length * lh) / 2 + lh / 2;
  const interval = 1 / s.wordsPerSecond;

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let idx = 0;
  lines.forEach((l, li) => {
    let x = W / 2 - l.width / 2;
    const y = y0 + li * lh;
    l.words.forEach((w, wi) => {
      const p = theme.easing.enter(prog(t, 0.15 + idx * interval, 0.35));
      const isE = emph.has(clean(w));
      if (p > 0) {
        const ww = l.widths[wi];
        ctx.save();
        ctx.globalAlpha = Math.min(1, p * 1.5);
        ctx.translate(x + ww / 2, y + (1 - p) * 40);
        const sc = isE ? 0.6 + 0.4 * p : 0.85 + 0.15 * p;
        ctx.scale(sc, sc);
        ctx.fillStyle = isE ? theme.colors.accent : theme.colors.text;
        ctx.fillText(w, -ww / 2, 0);
        ctx.restore();
      }
      x += l.widths[wi] + sp;
      idx++;
    });
  });
}
