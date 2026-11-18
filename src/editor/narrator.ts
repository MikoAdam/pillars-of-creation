import type { Timeline } from "@/lang/timeline";
import { getClip } from "./speech";

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
 * Placeholder narration in the preview. A line with a machine-voice clip plays that clip (the
 * same sound the export carries); a line without one is spoken by the browser's built-in voice,
 * which is instant but can't be recorded, its speed fitted line by line to the script's timing.
 */
export class PlaceholderVoice {
  private spoken = -1;
  private lastT = 0;
  private ac: AudioContext | null = null;
  private src: AudioBufferSourceNode | null = null;
  /** learned correction: how much faster this voice must speak to match the script's timing */
  private fit = 1;

  static available() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /** `now` reads the playhead when a clip has loaded, so it starts in step with the picture */
  update(lines: Line[], t: number, playing: boolean, settings: Settings, now: () => number) {
    if (!playing) { this.stop(); this.lastT = t; return; }
    if (t < this.lastT - 0.1) { this.stop(); } // jumped back: lines may be said again
    this.lastT = t;
    const i = lines.findIndex((l) => t >= l.t0 && t < l.t1);
    if (i < 0 || i === this.spoken) return;
    this.spoken = i;
    const line = lines[i];
    if (line.clip) {
      this.stopSound();
      void this.play(line, i, now);
      const next = lines[i + 1];
      if (next?.clip) void getClip(next.key); // have the next one ready
      return;
    }
    if (!PlaceholderVoice.available()) return;
    // only start a line near its beginning, so scrubbing into the middle of one stays quiet
    if (t - line.t0 > 0.4) { speechSynthesis.cancel(); return; }
    this.say(line, settings);
  }

  private async play(line: Line, i: number, now: () => number) {
    const c = await getClip(line.key);
    if (!c || this.spoken !== i) return;
    this.ac ??= new AudioContext();
    if (this.ac.state === "suspended") await this.ac.resume().catch(() => {});
    const offset = now() - line.t0;
    const buf = this.ac.createBuffer(1, c.pcm.length, c.sr);
    buf.copyToChannel(c.pcm as Float32Array<ArrayBuffer>, 0);
    if (offset >= buf.duration || this.spoken !== i) return;
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    src.connect(this.ac.destination);
    src.start(0, Math.max(0, offset));
    this.src = src;
  }

  private stopSound() {
    try { this.src?.stop(); } catch { /* already ended */ }
    this.src = null;
    if (PlaceholderVoice.available()) speechSynthesis.cancel();
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
    this.stopSound();
  }
}
