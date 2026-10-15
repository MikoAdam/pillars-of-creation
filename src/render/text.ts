import type { RenderCtx } from "./types";
import { alpha, bodyFont } from "./theme";

export function wrapWords(ctx: CanvasRenderingContext2D, words: string[], maxW: number, space?: number) {
  const sp = space ?? ctx.measureText(" ").width;
  const lines: { words: string[]; widths: number[]; width: number }[] = [];
  let cur = { words: [] as string[], widths: [] as number[], width: 0 };
  for (const w of words) {
    const ww = ctx.measureText(w).width;
    const next = cur.words.length ? cur.width + sp + ww : ww;
    if (next > maxW && cur.words.length) {
      lines.push(cur);
      cur = { words: [w], widths: [ww], width: ww };
    } else {
      cur.words.push(w);
      cur.widths.push(ww);
      cur.width = next;
    }
  }
  if (cur.words.length) lines.push(cur);
  return lines;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  return wrapWords(ctx, text.split(/\s+/).filter(Boolean), maxW).map((l) => l.words.join(" "));
}

/** Source line bottom-left, fades in. */
export function drawSource(rc: RenderCtx, src: { text: string } | undefined, opacity: number, unverified?: boolean) {
  const { ctx, theme, height } = rc;
  if (!src && !unverified) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  let x = 96;
  const y = height - 64;
  if (unverified) x = drawUnverifiedBadge(rc, x, y) + 20;
  if (src) {
    ctx.font = bodyFont(theme, 26, 500);
    ctx.fillStyle = alpha(theme.colors.text, 0.6);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`Source: ${src.text}`, x, y);
  }
  ctx.restore();
}

/** Warning badge; returns right edge x. */
export function drawUnverifiedBadge(rc: RenderCtx, x: number, y: number) {
  const { ctx, theme } = rc;
  ctx.save();
  ctx.font = bodyFont(theme, 22, 700);
  const label = "⚠ UNVERIFIED";
  const w = ctx.measureText(label).width + 32;
  ctx.fillStyle = "#ff4d3a";
  ctx.beginPath();
  ctx.roundRect(x, y - 20, w, 40, 6);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, x + 16, y + 1);
  ctx.restore();
  return x + w;
}

export function formatNumber(v: number, decimals: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
