import type { HeadlineScene, RenderCtx } from "../types";
import { lerp, prog } from "../easing";
import { alpha } from "../theme";
import { drawSource, wrapWords } from "../text";

const PAPER = "#f3efe6";
const INK = "#141414";

/** Newspaper-style card; key phrases get a highlighter sweep, one after another. */
export function renderHeadline(rc: RenderCtx, s: HeadlineScene, t: number) {
  const { ctx, theme, width: W, height: H } = rc;
  ctx.fillStyle = theme.colors.background;
  ctx.fillRect(0, 0, W, H);

  const enter = theme.easing.enter(prog(t, 0, 0.6));
  const zoom = lerp(1, 1.08, theme.easing.move(prog(t, 0, s.duration)));
  const img = s.imageUrl ? rc.assets.get(s.imageUrl) : undefined;

  const cw = 1300, ch = 760;
  ctx.save();
  ctx.translate(W / 2, H / 2 + (1 - enter) * 80);
  ctx.scale(zoom, zoom);
  ctx.rotate(-0.012);
  ctx.globalAlpha = enter;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = PAPER;
  ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
  ctx.shadowColor = "transparent";

  const x0 = -cw / 2 + 80;
  let y = -ch / 2 + 70;
  if (img) {
    const sc = Math.min((cw - 80) / img.width, (ch - 80) / img.height);
    ctx.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc);
  } else {
    // masthead
    ctx.fillStyle = INK;
    ctx.font = `800 34px "Playfair Display", serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(s.publication, x0, y);
    y += 56;
    ctx.fillRect(x0, y, cw - 160, 3);
    ctx.fillRect(x0, y + 8, cw - 160, 1);
    y += 44;

    const highlights = s.highlights.map((h) => h.toLowerCase().split(/\s+/));
    const drawBlock = (text: string, font: string, lh: number, startY: number, wordIdxOffset: number) => {
      ctx.font = font;
      const words = text.split(/\s+/).filter(Boolean);
      const lines = wrapWords(ctx, words, cw - 160);
      const sp = ctx.measureText(" ").width;
      const pos: { x: number; y: number; w: number; word: string }[] = [];
      let yy = startY;
      for (const l of lines) {
        let xx = x0;
        l.words.forEach((w, i) => {
          pos.push({ x: xx, y: yy, w: l.widths[i], word: w });
          xx += l.widths[i] + sp;
        });
        yy += lh;
      }
      return { pos, endY: yy, wordIdxOffset };
    };

    const head = drawBlock(s.headline, `800 72px "Playfair Display", serif`, 84, y, 0);
    const body = drawBlock(s.body, `400 32px "Source Sans 3", sans-serif`, 46, head.endY + 30, 0);

    // find highlight spans across both blocks
    const blocks = [
      { ...head, lh: 84, font: `800 72px "Playfair Display", serif` },
      { ...body, lh: 46, font: `400 32px "Source Sans 3", sans-serif` },
    ];
    const spans: { block: number; from: number; to: number }[] = [];
    highlights.forEach((hw) => {
      for (let b = 0; b < blocks.length; b++) {
        const ws = blocks[b].pos.map((p) => p.word.toLowerCase().replace(/[^\w%$.-]/g, ""));
        const target = hw.map((w) => w.replace(/[^\w%$.-]/g, ""));
        for (let i = 0; i + target.length <= ws.length; i++) {
          if (target.every((w, k) => ws[i + k] === w)) {
            spans.push({ block: b, from: i, to: i + target.length - 1 });
            return;
          }
        }
      }
    });

    // highlighter strokes (drawn beneath text)
    const start = 0.8;
    const each = Math.max(0.5, Math.min(1.1, (s.duration - start - 0.8) / Math.max(1, spans.length)));
    spans.forEach((sp, k) => {
      const p = theme.easing.move(prog(t, start + k * each, each * 0.8));
      if (p <= 0) return;
      const blk = blocks[sp.block];
      const words = blk.pos.slice(sp.from, sp.to + 1);
      // group by line
      const rows = new Map<number, { x1: number; x2: number }>();
      words.forEach((w) => {
        const r = rows.get(w.y);
        rows.set(w.y, r ? { x1: r.x1, x2: w.x + w.w } : { x1: w.x, x2: w.x + w.w });
      });
      const total = [...rows.values()].reduce((a, r) => a + (r.x2 - r.x1), 0);
      let remain = total * p;
      ctx.fillStyle = alpha(theme.colors.accent, 0.55);
      for (const [ry, r] of rows) {
        const len = Math.min(remain, r.x2 - r.x1);
        if (len <= 0) break;
        ctx.fillRect(r.x1 - 8, ry + blk.lh * 0.12, len + 16, blk.lh * 0.78);
        remain -= len;
      }
    });

    for (const blk of blocks) {
      ctx.font = blk.font;
      ctx.fillStyle = INK;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      for (const w of blk.pos) ctx.fillText(w.word, w.x, w.y + blk.lh * 0.08);
    }
  }
  ctx.restore();

  drawSource(rc, s.source, prog(t, 1, 0.5), s.unverified);
}
