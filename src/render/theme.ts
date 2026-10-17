import type { Theme } from "./types";
import { easeInOutSine, easeOutBack, easeOutCubic, easeOutExpo, easeOutQuint, easeInOutCubic } from "./easing";

export const THEMES: Theme[] = [
  {
    id: "clean-modern",
    name: "Clean Modern",
    fonts: { display: "Plus Jakarta Sans", body: "Plus Jakarta Sans", displayWeight: 800, displayUpper: false },
    colors: { background: "#f7f8fa", text: "#111827", accent: "#2f6bff" },
    easing: { enter: easeOutQuint, move: easeInOutCubic, count: easeOutExpo },
    grain: 0,
    radius: 24,
  },
];

/** Fonts a script may pick with `style display/body "..."`, with the weight used for headings. */
export const FONT_CHOICES: { name: string; weight: number }[] = [
  { name: "Plus Jakarta Sans", weight: 800 },
  { name: "Fraunces", weight: 700 },
  { name: "Archivo Black", weight: 400 },
  { name: "DM Sans", weight: 700 },
  { name: "Work Sans", weight: 700 },
  { name: "Inter Tight", weight: 700 },
  { name: "Playfair Display", weight: 800 },
  { name: "Anton", weight: 400 },
  { name: "Nunito", weight: 900 },
  { name: "Outfit", weight: 700 },
  { name: "IBM Plex Sans", weight: 700 },
  { name: "Source Sans 3", weight: 700 },
];

export interface StyleOverrides {
  background?: string; text?: string; accent?: string;
  display?: string; body?: string; radius?: number; grain?: number; caps?: boolean;
}

/** Theme defaults with script overrides applied on top. */
export function applyStyle(base: Theme, o: StyleOverrides): Theme {
  const w = o.display ? FONT_CHOICES.find((f) => f.name === o.display)?.weight ?? 700 : base.fonts.displayWeight;
  return {
    ...base,
    fonts: {
      display: o.display ?? base.fonts.display,
      body: o.body ?? base.fonts.body,
      displayWeight: w,
      displayUpper: o.caps ?? base.fonts.displayUpper,
    },
    colors: { background: o.background ?? base.colors.background, text: o.text ?? base.colors.text, accent: o.accent ?? base.colors.accent },
    grain: o.grain ?? base.grain,
    radius: o.radius ?? base.radius ?? 0,
  };
}

export const getTheme = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=DM+Sans:wght@400;500;700&family=Inter+Tight:wght@400;500;700&family=JetBrains+Mono:wght@400;600&family=Playfair+Display:wght@700;800&family=Source+Sans+3:wght@400;600;700&family=Nunito:wght@500;700;900&family=Plus+Jakarta+Sans:wght@500;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Work+Sans:wght@400;500;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=Outfit:wght@400;500;700&display=swap";

export const displayFont = (th: Theme, px: number) => `${th.fonts.displayWeight} ${px}px "${th.fonts.display}", sans-serif`;
export const bodyFont = (th: Theme, px: number, weight = 500) => `${weight} ${px}px "${th.fonts.body}", sans-serif`;
export const displayText = (th: Theme, s: string) => (th.fonts.displayUpper ? s.toUpperCase() : s);

/** Return the color with an alpha (accepts #rrggbb). */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Fill a rectangle with rounded corners (r = 0 gives a plain rect). `topOnly` rounds just the top corners. */
export function fillRound(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, topOnly = false) {
  if (w <= 0 || h <= 0) return;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) return ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, topOnly ? [rr, rr, 0, 0] : rr);
  ctx.fill();
}
