import type { RenderCtx } from "../types";
import { prog } from "../easing";
import { alpha, bodyFont, displayFont, displayText, fillRound } from "../theme";
import { wrapWords } from "../text";

/** Words of a line of text; *like this* marks words for the accent colour. */
function parseWords(text: string): { w: string; e: boolean }[] {
  const out: { w: string; e: boolean }[] = [];
  let on = false;
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    let w = tok;
    while (w.startsWith("*")) { on = !on; w = w.slice(1); }
    const e = on;
    let closes = 0;
    while (w.endsWith("*")) { closes++; w = w.slice(0, -1); }
    if (w) out.push({ w, e });
    for (let i = 0; i < closes; i++) on = !on;
  }
  return out;
}

/**
 * Display text that rises in word by word. Draws centred on (cx, top) and returns the block height.
 * The caller sets the font before calling, so the fit is decided once.
 */
function cascade(rc: RenderCtx, words: { w: string; e: boolean }[], cx: number, top: number, size: number, maxW: number, local: number, start: number, perWord: number) {
  const { ctx, theme } = rc;
  const lh = size * 1.1;
  const lines = wrapWords(ctx, words.map((x) => x.w), maxW, size * 0.28);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let idx = 0;
  lines.forEach((l, li) => {
    let x = cx - l.width / 2;
    const y = top + li * lh + lh / 2;
    l.words.forEach((w, wi) => {
      const p = theme.easing.enter(prog(local, start + idx * perWord, 0.45));
      if (p > 0) {
        ctx.save();
        ctx.globalAlpha *= p;
        ctx.fillStyle = words[idx].e ? theme.colors.accent : theme.colors.text;
        ctx.fillText(w, x, y + (1 - p) * 30);
        ctx.restore();
      }
      x += l.widths[wi] + size * 0.28;
      idx++;
    });
  });
  return lines.length * lh;
}

/** Pick the largest display size that fits the words in maxW x maxH. */
function fitDisplay(rc: RenderCtx, words: string[], maxW: number, maxH: number, from: number, to: number) {
  const { ctx, theme } = rc;
  let size = from;
  for (;;) {
    ctx.font = displayFont(theme, size);
    const lines = wrapWords(ctx, words, maxW, size * 0.28);
    if (lines.length * size * 1.1 <= maxH || size <= to) return size;
    size -= 6;
  }
}

/** Title card: a big heading, an accent rule that grows, and an optional line underneath. */
export function drawTitleCard(rc: RenderCtx, d: { text: string; sub: string }, local: number) {
  const { ctx, theme, width: W, height: H } = rc;
  const words = parseWords(displayText(theme, d.text));
  const size = fitDisplay(rc, words.map((x) => x.w), 1640, d.sub ? 440 : 560, 150, 64);
  ctx.save();
  ctx.font = displayFont(theme, size);
  const lh = size * 1.1;
  const n = wrapWords(ctx, words.map((x) => x.w), 1640, size * 0.28).length;
  const blockH = n * lh;
  const top = H / 2 - blockH / 2 - (d.sub ? 70 : 0);
  cascade(rc, words, W / 2, top, size, 1640, local, 0.1, Math.min(0.12, 0.8 / Math.max(1, words.length)));
  const rule = theme.easing.enter(prog(local, 0.5, 0.6));
  ctx.fillStyle = theme.colors.accent;
  fillRound(ctx, W / 2 - 110 * rule, top + blockH + 34, 220 * rule, 10, theme.radius ? 5 : 0);
  if (d.sub) {
    const p = theme.easing.enter(prog(local, 0.8, 0.6));
    ctx.globalAlpha *= p;
    ctx.font = bodyFont(theme, 46, 500);
    ctx.fillStyle = alpha(theme.colors.text, 0.78);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(d.sub, W / 2, top + blockH + 78 + (1 - p) * 20);
  }
  ctx.restore();
}

/** Lower third: a name plate that slides in at the bottom left. */
export function drawLowerThird(rc: RenderCtx, d: { name: string; role: string }, local: number) {
  const { ctx, theme, height: H } = rc;
  const p = theme.easing.enter(prog(local, 0, 0.55));
  if (p <= 0) return;
  const x = 96, bottom = H - 120;
  const h = d.role ? 150 : 104;
  ctx.save();
  ctx.font = displayFont(theme, 58);
  const nameW = ctx.measureText(displayText(theme, d.name)).width;
  ctx.font = bodyFont(theme, 34, 500);
  const roleW = d.role ? ctx.measureText(d.role).width : 0;
  const w = Math.max(nameW, roleW) + 96;
  ctx.globalAlpha *= p;
  ctx.translate(-(1 - p) * 90, 0);
  ctx.fillStyle = alpha(theme.colors.text, 0.08);
  fillRound(ctx, x, bottom - h, w, h, Math.min(theme.radius ?? 0, 14));
  ctx.fillStyle = theme.colors.accent;
  fillRound(ctx, x, bottom - h, 14, h, Math.min(theme.radius ?? 0, 14));
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = displayFont(theme, 58);
  ctx.fillStyle = theme.colors.text;
  ctx.fillText(displayText(theme, d.name), x + 50, bottom - h + (d.role ? 52 : h / 2));
  if (d.role) {
    const q = theme.easing.enter(prog(local, 0.25, 0.5));
    ctx.globalAlpha *= q;
    ctx.font = bodyFont(theme, 34, 500);
    ctx.fillStyle = alpha(theme.colors.text, 0.72);
    ctx.fillText(d.role, x + 50, bottom - 44);
  }
  ctx.restore();
}

/** Quote card: a large quotation mark, the words rising in, and who said it. */
export function drawQuote(rc: RenderCtx, d: { text: string; by: string }, local: number) {
  const { ctx, theme, width: W, height: H } = rc;
  const words = parseWords(d.text);
  const size = fitDisplay(rc, words.map((x) => x.w), 1300, 520, 84, 48);
  ctx.save();
  ctx.font = displayFont(theme, size);
  const lh = size * 1.1;
  const n = wrapWords(ctx, words.map((x) => x.w), 1300, size * 0.28).length;
  const blockH = n * lh;
  const top = H / 2 - blockH / 2 + 10;
  const mark = theme.easing.enter(prog(local, 0, 0.7));
  ctx.save();
  ctx.globalAlpha *= 0.28 * mark;
  ctx.fillStyle = theme.colors.accent;
  ctx.font = `700 ${Math.round(size * 4.2)}px "Playfair Display", serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("“", W / 2 - 700 - 40 * (1 - mark), top + size * 1.6);
  ctx.restore();
  ctx.font = displayFont(theme, size);
  cascade(rc, words, W / 2, top, size, 1300, local, 0.25, Math.min(0.1, 1 / Math.max(1, words.length)));
  if (d.by) {
    const p = theme.easing.enter(prog(local, 0.3 + Math.min(1, words.length * 0.1), 0.6));
    ctx.globalAlpha *= p;
    ctx.font = bodyFont(theme, 40, 600);
    ctx.fillStyle = alpha(theme.colors.text, 0.72);
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`— ${d.by}`, W / 2, top + blockH + 48 + (1 - p) * 16);
  }
  ctx.restore();
}

/**
 * End credits: an optional heading, then role / name rows on either side of a centre line.
 * Standing still the rows rise in one by one; with `roll` the whole block travels up through
 * the frame as p goes 0..1, like film credits.
 */
export function drawCredits(rc: RenderCtx, d: { heading: string; rows: { role: string; name: string }[]; roll: boolean }, local: number, p: number) {
  const { ctx, theme, width: W, height: H } = rc;
  const headSize = 76, rowH = 74, gap = 28;
  const headH = d.heading ? headSize * 1.1 + 64 : 0;
  const blockH = headH + d.rows.length * rowH;
  const top = d.roll ? H + 40 - p * (blockH + H + 80) : H / 2 - blockH / 2;
  ctx.save();
  ctx.textBaseline = "middle";
  if (d.heading) {
    const a = d.roll ? 1 : theme.easing.enter(prog(local, 0, 0.6));
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.font = displayFont(theme, headSize);
    ctx.textAlign = "center";
    ctx.fillStyle = theme.colors.text;
    ctx.fillText(displayText(theme, d.heading), W / 2, top + headSize * 0.55 + (1 - a) * 24);
    ctx.fillStyle = theme.colors.accent;
    fillRound(ctx, W / 2 - 60 * a, top + headSize * 1.1 + 18, 120 * a, 8, theme.radius ? 4 : 0);
    ctx.restore();
  }
  d.rows.forEach((r, i) => {
    const y = top + headH + i * rowH + rowH / 2;
    if (y < -rowH || y > H + rowH) return;
    const a = d.roll ? 1 : theme.easing.enter(prog(local, 0.35 + i * 0.12, 0.5));
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(0, (1 - a) * 18);
    if (r.role) {
      ctx.font = bodyFont(theme, 34, 500);
      ctx.textAlign = "right";
      ctx.fillStyle = alpha(theme.colors.text, 0.62);
      ctx.fillText(r.role, W / 2 - gap, y);
    }
    ctx.font = bodyFont(theme, 40, 700);
    ctx.textAlign = r.role ? "left" : "center";
    ctx.fillStyle = theme.colors.text;
    ctx.fillText(r.name, r.role ? W / 2 + gap : W / 2, y);
    ctx.restore();
  });
  ctx.restore();
}
