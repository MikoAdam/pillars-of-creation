/**
 * How long a sentence takes to say, at an ordinary narration pace (about 155 words a minute),
 * with short pauses at commas and full stops. The placeholder voice is fitted to this in the
 * preview, so the timing in the script never depends on which voice the browser has.
 */
export function speechSeconds(text: string, speed = 1): number {
  const words = text.replace(/\*/g, "").split(/\s+/).filter(Boolean);
  let units = 0;
  for (const w of words) {
    const digits = w.replace(/[^0-9]/g, "").length;
    // "1987" is said as three or four words
    units += digits >= 3 ? Math.ceil(digits / 1.5) : 1;
  }
  const commas = (text.match(/[,;:–—]/g) ?? []).length;
  const stops = (text.trim().replace(/[.!?…]+$/, "").match(/[.!?…]+\s/g) ?? []).length;
  const secs = units / 2.6 + commas * 0.18 + stops * 0.35;
  return Math.max(0.8, secs / Math.max(0.3, speed));
}

/** Pause after each narrated line before the next one starts. */
export const NARRATION_GAP = 0.25;
