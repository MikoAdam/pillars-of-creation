const TILE = 256;
const COUNT = 6;
let tiles: HTMLCanvasElement[] | null = null;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTiles() {
  tiles = [];
  for (let k = 0; k < COUNT; k++) {
    const c = document.createElement("canvas");
    c.width = c.height = TILE;
    const g = c.getContext("2d")!;
    const img = g.createImageData(TILE, TILE);
    const rnd = mulberry32(1337 + k * 7919);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (rnd() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    tiles.push(c);
  }
}

/** Deterministic film grain: tile and offset derive from the frame number only. */
export function drawGrain(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number, strength: number) {
  if (strength <= 0) return;
  if (!tiles) buildTiles();
  const tile = tiles![frame % COUNT];
  const r = mulberry32(frame + 1);
  const ox = -Math.floor(r() * TILE), oy = -Math.floor(r() * TILE);
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.globalCompositeOperation = "overlay";
  for (let y = oy; y < h; y += TILE) for (let x = ox; x < w; x += TILE) ctx.drawImage(tile, x, y);
  ctx.restore();
}
