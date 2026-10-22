export interface Cue { t0: number; t1: number; text: string }
export type TranscribeProgress = { stage: "download" | "transcribe"; progress: number };

/** Decode any audio file to 16 kHz mono samples (what Whisper expects). */
async function toMono16k(blob: Blob): Promise<{ samples: Float32Array; duration: number }> {
  const ac = new AudioContext();
  const buf = await ac.decodeAudioData(await blob.arrayBuffer());
  void ac.close();
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const r = await off.startRendering();
  return { samples: r.getChannelData(0), duration: buf.duration };
}

/** Split Whisper chunks into short, readable subtitle cues. */
export function toCues(chunks: { timestamp: [number, number | null]; text: string }[], duration: number, maxChars = 70): Cue[] {
  const out: Cue[] = [];
  chunks.forEach((c, i) => {
    const text = c.text.replace(/"/g, "'").replace(/\s+/g, " ").trim();
    if (!text) return;
    const t0 = c.timestamp[0];
    const t1 = c.timestamp[1] ?? chunks[i + 1]?.timestamp[0] ?? duration;
    const words = text.split(" ");
    const parts: string[] = [];
    let cur = "";
    for (const w of words) {
      if (cur && (cur + " " + w).length > maxChars) { parts.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
    }
    if (cur) parts.push(cur);
    const total = parts.reduce((n, p) => n + p.length, 0);
    let t = t0;
    for (const p of parts) {
      const d = ((t1 - t0) * p.length) / total;
      out.push({ t0: round(t), t1: round(t + d), text: p });
      t += d;
    }
  });
  return out;
}
const round = (v: number) => Math.round(v * 10) / 10;

export function cuesToCode(cues: Cue[], voice: string) {
  return [`# Subtitles (made automatically from @${voice}, edit freely)`, ...cues.map((c) => `subtitle ${c.t0} ${Math.max(c.t1, c.t0 + 0.1)} "${c.text}"`)].join("\n");
}

let worker: Worker | null = null;

export async function transcribe(blob: Blob, onProgress: (p: TranscribeProgress) => void): Promise<Cue[]> {
  const { samples, duration } = await toMono16k(blob);
  worker ??= new Worker(new URL("./whisperWorker.ts", import.meta.url), { type: "module" });
  const w = worker;
  return new Promise((res, rej) => {
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") onProgress({ stage: m.stage, progress: m.progress });
      else if (m.type === "done") res(toCues(m.chunks, duration));
      else if (m.type === "error") rej(new Error(m.message));
    };
    w.postMessage({ audio: samples }, [samples.buffer]);
  });
}
