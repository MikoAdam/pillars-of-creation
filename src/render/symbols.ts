/** Map symbols: a coloured round badge with a simple white glyph. Drawn around (0, 0). */

export const SYMBOLS = [
  "explosion", "battle", "bombing", "fire", "skull", "nuke",
  "tank", "troops", "plane", "naval",
  "oil", "factory", "port",
  "flag", "capital", "shield", "treaty", "uprising", "occupation",
] as const;
export type SymbolName = (typeof SYMBOLS)[number];

type C = CanvasRenderingContext2D;

function star(ctx: C, r: number, n = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Glyphs are drawn in a 24-unit box centred on 0,0, white. */
const GLYPH: Record<SymbolName, (ctx: C) => void> = {
  explosion: (c) => { star(c, 11, 8, 0.5); c.fill(); },
  battle: (c) => { c.beginPath(); c.moveTo(-8, -8); c.lineTo(8, 8); c.moveTo(8, -8); c.lineTo(-8, 8); c.stroke(); c.beginPath(); c.moveTo(-10, -4); c.lineTo(-4, -10); c.moveTo(10, -4); c.lineTo(4, -10); c.stroke(); },
  bombing: (c) => { c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.moveTo(0, -11); c.lineTo(0, 11); c.moveTo(-11, 0); c.lineTo(11, 0); c.stroke(); },
  fire: (c) => { c.beginPath(); c.moveTo(0, -11); c.bezierCurveTo(8, -3, 8, 4, 6, 7); c.bezierCurveTo(4, 11, -4, 11, -6, 7); c.bezierCurveTo(-8, 3, -4, -2, -2, -4); c.bezierCurveTo(-1, 0, 2, 0, 0, -11); c.fill(); },
  skull: (c) => { c.beginPath(); c.arc(0, -2, 8, 0, Math.PI * 2); c.fill(); c.fillRect(-5, 4, 10, 6); c.fillStyle = "rgba(15,23,42,0.75)"; c.beginPath(); c.arc(-3, -2, 2.4, 0, 7); c.arc(3, -2, 2.4, 0, 7); c.fill(); c.fillStyle = "#ffffff"; },
  nuke: (c) => { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 11, a - 0.5, a + 0.5); c.closePath(); c.fill(); } c.beginPath(); c.arc(0, 0, 2.5, 0, 7); c.fill(); },
  tank: (c) => { c.fillRect(-11, 1, 22, 7); c.fillRect(-6, -5, 11, 6); c.fillRect(4, -3, 9, 2.5); },
  troops: (c) => { c.beginPath(); c.arc(0, -6, 4, 0, 7); c.fill(); c.beginPath(); c.moveTo(-7, 10); c.lineTo(-5, 0); c.lineTo(5, 0); c.lineTo(7, 10); c.closePath(); c.fill(); },
  plane: (c) => { c.beginPath(); c.moveTo(0, -11); c.lineTo(2, -3); c.lineTo(11, 2); c.lineTo(11, 4); c.lineTo(2, 2); c.lineTo(1.5, 8); c.lineTo(4, 10); c.lineTo(-4, 10); c.lineTo(-1.5, 8); c.lineTo(-2, 2); c.lineTo(-11, 4); c.lineTo(-11, 2); c.lineTo(-2, -3); c.closePath(); c.fill(); },
  naval: (c) => { c.beginPath(); c.moveTo(-11, 1); c.lineTo(11, 1); c.lineTo(7, 6); c.lineTo(-7, 6); c.closePath(); c.fill(); c.fillRect(-3, -6, 6, 7); c.beginPath(); c.moveTo(-11, 10); c.quadraticCurveTo(-5.5, 7, 0, 10); c.quadraticCurveTo(5.5, 13, 11, 10); c.stroke(); },
  oil: (c) => { c.beginPath(); c.moveTo(-7, 11); c.lineTo(0, -11); c.lineTo(7, 11); c.moveTo(-4.5, 3); c.lineTo(4.5, 3); c.moveTo(-2.5, -4); c.lineTo(2.5, -4); c.stroke(); },
  factory: (c) => { c.beginPath(); c.moveTo(-11, 10); c.lineTo(-11, -1); c.lineTo(-4, 3); c.lineTo(-4, -1); c.lineTo(3, 3); c.lineTo(3, -10); c.lineTo(8, -10); c.lineTo(8, 10); c.closePath(); c.fill(); },
  port: (c) => { c.beginPath(); c.arc(0, -8, 2.5, 0, 7); c.moveTo(0, -5.5); c.lineTo(0, 10); c.moveTo(-5, -2); c.lineTo(5, -2); c.moveTo(-9, 3); c.quadraticCurveTo(-8, 10, 0, 10); c.quadraticCurveTo(8, 10, 9, 3); c.stroke(); },
  flag: (c) => { c.beginPath(); c.moveTo(-7, 11); c.lineTo(-7, -11); c.stroke(); c.beginPath(); c.moveTo(-7, -10); c.lineTo(9, -6); c.lineTo(-7, -1); c.closePath(); c.fill(); },
  capital: (c) => { star(c, 11); c.fill(); },
  shield: (c) => { c.beginPath(); c.moveTo(0, -11); c.lineTo(9, -7); c.quadraticCurveTo(9, 6, 0, 11); c.quadraticCurveTo(-9, 6, -9, -7); c.closePath(); c.fill(); },
  treaty: (c) => { c.beginPath(); c.moveTo(-11, 1); c.lineTo(-4, -5); c.lineTo(2, -2); c.lineTo(8, -6); c.moveTo(-6, 0); c.lineTo(0, 6); c.lineTo(3, 3); c.lineTo(-1, -1); c.moveTo(11, 1); c.lineTo(4, 7); c.stroke(); },
  uprising: (c) => { c.fillRect(-6, -2, 12, 9); c.fillRect(-5, 7, 9, 4); for (let i = 0; i < 4; i++) c.fillRect(-6 + i * 3.1, -9, 2.6, 7); },
  occupation: (c) => { c.beginPath(); c.arc(0, 0, 9, 0, 7); c.stroke(); for (const x of [-4, 0, 4]) { c.beginPath(); c.moveTo(x, -9); c.lineTo(x, 9); c.stroke(); } },
};

/** Draw a symbol badge of radius r at the current origin. */
export function drawSymbol(ctx: C, name: SymbolName, color: string, r = 26) {
  ctx.save();
  ctx.shadowColor = "rgba(15,23,42,0.28)";
  ctx.shadowBlur = r * 0.5;
  ctx.shadowOffsetY = r * 0.12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  const k = r / 18;
  ctx.scale(k, k);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  GLYPH[name](ctx);
  ctx.restore();
}
