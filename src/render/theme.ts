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
];

export const getTheme = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=DM+Sans:wght@400;500;700&family=Inter+Tight:wght@400;500;700&family=Playfair+Display:wght@700;800&family=Source+Sans+3:wght@400;600;700&display=swap";

export const displayFont = (th: Theme, px: number) => `${th.fonts.displayWeight} ${px}px "${th.fonts.display}", sans-serif`;
export const bodyFont = (th: Theme, px: number, weight = 500) => `${weight} ${px}px "${th.fonts.body}", sans-serif`;
export const displayText = (th: Theme, s: string) => (th.fonts.displayUpper ? s.toUpperCase() : s);

/** Return the color with an alpha (accepts #rrggbb). */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
