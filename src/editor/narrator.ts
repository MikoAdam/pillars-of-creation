import type { Timeline } from "@/lang/timeline";

type Line = NonNullable<Timeline["narration"]>[number];
type Settings = Timeline["narrator"];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The voice for the settings: a named one, else one for the language, preferring voices on this computer. */
function pickVoice(s: Settings): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return undefined;
  if (s?.voice) {
    const v = voices.find((x) => x.name.toLowerCase().includes(s.voice.toLowerCase()));
    if (v) return v;
  }
  const lang = (s?.lang || "en").toLowerCase();
  const fit = voices.filter((x) => x.lang.toLowerCase().startsWith(lang));
  return fit.find((x) => x.localService && x.default) ?? fit.find((x) => x.localService) ?? fit[0];
}

/**
 * Placeholder narration: speaks the script's `narrate` lines with the browser's built-in voice
 * while the preview plays, so the timing can be judged before a real voiceover exists. The
 * script's timing comes from `speechSeconds`; the voice's speed is fitted to it line by line.
 * It is heard in the preview only: browsers do not let a page record this voice.
 */
export class PlaceholderVoice {
  private spoken = -1;
  private lastT = 0;
  /** learned correction: how much faster this voice must speak to match the script's timing */
  private fit = 1;

  static available() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  update(lines: Line[], t: number, playing: boolean, settings: Settings) {
    if (!PlaceholderVoice.available()) return;
    if (!playing) { this.stop(); this.lastT = t; return; }
    if (t < this.lastT - 0.1) { this.stop(); } // jumped back: lines may be said again
    this.lastT = t;
    const i = lines.findIndex((l) => t >= l.t0 && t < l.t1);
    if (i < 0 || i === this.spoken) return;
    this.spoken = i;
    // only start a line near its beginning, so scrubbing into the middle of one stays quiet
    if (t - lines[i].t0 > 0.4) { speechSynthesis.cancel(); return; }
    this.say(lines[i], settings);
  }

  private say(line: Line, s: Settings) {
    const u = new SpeechSynthesisUtterance(line.text.replace(/\*/g, ""));
    const v = pickVoice(s);
    if (v) { u.voice = v; u.lang = v.lang; } else if (s?.lang) u.lang = s.lang;
    u.rate = clamp((s?.speed ?? 1) * this.fit, 0.5, 2.5);
    const target = line.t1 - line.t0;
    let began = 0;
    u.onstart = () => { began = performance.now(); };
    u.onend = () => {
      const took = (performance.now() - began) / 1000;
      if (began && took > 0.4) this.fit = clamp(this.fit * Math.pow(took / target, 0.8), 0.6, 2);
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  stop() {
    this.spoken = -1;
    if (PlaceholderVoice.available()) speechSynthesis.cancel();
  }
}
