import type { Theme } from "./types";
import { easeInOutSine, easeOutBack, easeOutCubic, easeOutExpo, easeOutQuint, easeInOutCubic } from "./easing";

export const THEMES: Theme[] = [
  {
    id: "dark-doc",
    name: "Dark Documentary",
    fonts: { display: "Anton", body: "Inter Tight", displayWeight: 400, displayUpper: true },
    colors: { background: "#0d0d0f", text: "#ece8e1", accent: "#e8b23a" },
    easing: { enter: easeOutCubic, move: easeInOutSine, count: easeOutExpo },
    grain: 0.08,
  },
  {
    id: "clean-news",
    name: "Clean News",
    fonts: { display: "Playfair Display", body: "Source Sans 3", displayWeight: 800, displayUpper: false },
    colors: { background: "#f4f1ea", text: "#16181d", accent: "#c8261e" },
    easing: { enter: easeOutQuint, move: easeInOutCubic, count: easeOutCubic },
    grain: 0.035,
  },
  {
    id: "bold-pop",
    name: "Bold Pop",
    fonts: { display: "Archivo Black", body: "DM Sans", displayWeight: 400, displayUpper: true },
    colors: { background: "#1438ff", text: "#ffffff", accent: "#ffe14d" },
    easing: { enter: easeOutBack, move: easeInOutSine, count: easeOutExpo },
    grain: 0.05,
  },
  {
    id: "soft",
    name: "Soft Rounded",
    fonts: { display: "Nunito", body: "Nunito", displayWeight: 900, displayUpper: false },
    colors: { background: "#fbf3ee", text: "#3a3350", accent: "#f08a8a" },
    easing: { enter: easeOutBack, move: easeInOutSine, count: easeOutCubic },
    grain: 0.02,
    radius: 36,
  },
  {
    id: "clean-modern",
    name: "Clean Modern",
    fonts: { display: "Plus Jakarta Sans", body: "Plus Jakarta Sans", displayWeight: 800, displayUpper: false },
    colors: { background: "#f7f8fa", text: "#111827", accent: "#2f6bff" },
    easing: { enter: easeOutQuint, move: easeInOutCubic, count: easeOutExpo },
    grain: 0,
    radius: 24,
  },
  {
    id: "warm-editorial",
    name: "Warm Editorial",
    fonts: { display: "Fraunces", body: "Work Sans", displayWeight: 700, displayUpper: false },
    colors: { background: "#f3ece0", text: "#2b2420", accent: "#b5452f" },
    easing: { enter: easeOutCubic, move: easeInOutSine, count: easeOutCubic },
    grain: 0.04,
    radius: 14,
  },
  {
    id: "pro",
    name: "Professional",
    fonts: { display: "IBM Plex Sans", body: "IBM Plex Sans", displayWeight: 700, displayUpper: false },
    colors: { background: "#0f1b2d", text: "#e8edf5", accent: "#4fa3ff" },
    easing: { enter: easeOutQuint, move: easeInOutCubic, count: easeOutExpo },
    grain: 0.015,
    radius: 16,
  },
  {
    id: "mint",
    name: "Mint Fresh",
    fonts: { display: "Nunito", body: "Nunito", displayWeight: 900, displayUpper: false },
    colors: { background: "#eef8f3", text: "#1f3b34", accent: "#2bb48a" },
    easing: { enter: easeOutBack, move: easeInOutSine, count: easeOutCubic },
    grain: 0.015,
    radius: 32,
  },
  {
    id: "ocean",
    name: "Ocean Calm",
    fonts: { display: "Plus Jakarta Sans", body: "Plus Jakarta Sans", displayWeight: 800, displayUpper: false },
    colors: { background: "#0b2a33", text: "#e6f4f1", accent: "#5fd3c6" },
    easing: { enter: easeOutQuint, move: easeInOutSine, count: easeOutExpo },
    grain: 0.02,
    radius: 22,
  },
  {
    id: "charcoal",
    name: "Charcoal Minimal",
    fonts: { display: "Outfit", body: "Outfit", displayWeight: 700, displayUpper: false },
    colors: { background: "#18181b", text: "#f4f4f5", accent: "#a3e635" },
    easing: { enter: easeOutQuint, move: easeInOutCubic, count: easeOutExpo },
    grain: 0.03,
    radius: 18,
  },
  {
    id: "corporate",
    name: "Corporate Light",
    fonts: { display: "IBM Plex Sans", body: "IBM Plex Sans", displayWeight: 600, displayUpper: false },
    colors: { background: "#ffffff", text: "#1d2939", accent: "#1570ef" },
    easing: { enter: easeOutCubic, move: easeInOutCubic, count: easeOutCubic },
    grain: 0,
    radius: 12,
  },
  {
    id: "vintage",
    name: "Vintage Print",
    fonts: { display: "Fraunces", body: "Work Sans", displayWeight: 700, displayUpper: false },
    colors: { background: "#e9e2cf", text: "#23362b", accent: "#2f6b4f" },
    easing: { enter: easeOutCubic, move: easeInOutSine, count: easeOutCubic },
    grain: 0.06,
    radius: 10,
  },
  {
    id: "lavender",
    name: "Lavender Dusk",
    fonts: { display: "Outfit", body: "Outfit", displayWeight: 700, displayUpper: false },
    colors: { background: "#211c33", text: "#efeaff", accent: "#c4a7ff" },
    easing: { enter: easeOutBack, move: easeInOutSine, count: easeOutExpo },
    grain: 0.025,
    radius: 28,
  },
];

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
