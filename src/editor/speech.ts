/**
 * Machine-voice clips for `narrate` lines: made by the Supertonic model in a worker, kept in
 * this browser's IndexedDB (each line is made once), and looked up by speechKey.
 */
export interface Clip { pcm: Float32Array; sr: number }

const DB = "pnt-speech", PCM = "pcm", LEN = "len";
/** set once the user has agreed to the model download; from then on new lines are voiced automatically */
export const MACHINE_VOICE_FLAG = "pnt:machine-voice";
/** about how much the browser downloads the first time */
export const MODEL_MB = 262;

function req<T>(r: IDBRequest<T>) {
  return new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  dbp ??= new Promise((res, rej) => {
    const o = indexedDB.open(DB, 1);
    o.onupgradeneeded = () => { o.result.createObjectStore(PCM); o.result.createObjectStore(LEN); };
    o.onsuccess = () => res(o.result);
    o.onerror = () => rej(o.error);
  });
  return dbp;
}
const store = async (name: string, mode: IDBTransactionMode = "readonly") => (await db()).transaction(name, mode).objectStore(name);

/** Lengths in seconds of every clip made so far, by key. */
export async function loadSpeechIndex(): Promise<Map<string, number>> {
  try {
    const s = await store(LEN);
    const [keys, lens] = await Promise.all([req(s.getAllKeys()), req(s.getAll())]);
    return new Map(keys.map((k, i) => [String(k), lens[i] as number]));
  } catch {
    return new Map();
  }
}

const recent = new Map<string, Promise<Clip | undefined>>();
/** One clip's samples (the last couple of dozen are kept in memory for playback). */
export function getClip(key: string): Promise<Clip | undefined> {
  let c = recent.get(key);
  if (c) { recent.delete(key); recent.set(key, c); return c; }
  c = store(PCM).then((s) => req(s.get(key)) as Promise<Clip | undefined>).catch(() => undefined);
  recent.set(key, c);
  if (recent.size > 24) recent.delete(recent.keys().next().value as string);
  return c;
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { res: (c: Clip) => void; rej: (e: Error) => void }>();
let onDownload: ((p: number) => void) | null = null;

function speak(text: string, voice: string, speed: number): Promise<Clip> {
  if (!worker) {
    worker = new Worker(new URL("./ttsWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "download") { onDownload?.(m.progress ?? 0); return; }
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      if (m.type === "done") w.res({ pcm: m.audio, sr: m.sr });
      else w.rej(new Error(m.message));
    };
  }
  const id = nextId++;
  return new Promise((res, rej) => {
    waiting.set(id, { res, rej });
    worker!.postMessage({ id, text, voice, speed });
  });
}

export interface SpeechJob { key: string; text: string; voice: string; speed: number }
export interface SpeechProgress { done: number; total: number; download?: number }

/**
 * Make the clips that are missing, one line at a time, saving each as it is made and reporting
 * its length, so the script can be re-timed line by line.
 */
export async function makeClips(jobs: SpeechJob[], onClip: (key: string, seconds: number) => void, onProgress: (p: SpeechProgress) => void, isCancelled: () => boolean) {
  onDownload = (p) => onProgress({ done: 0, total: jobs.length, download: p });
  try {
    for (let i = 0; i < jobs.length; i++) {
      if (isCancelled()) return;
      const j = jobs[i];
      const clip = await speak(j.text.replace(/\*/g, ""), j.voice, Math.min(1.4, Math.max(0.7, j.speed)));
      const seconds = clip.pcm.length / clip.sr;
      const [p, l] = [await store(PCM, "readwrite"), await store(LEN, "readwrite")];
      await Promise.all([req(p.put(clip, j.key)), req(l.put(seconds, j.key))]);
      recent.set(j.key, Promise.resolve(clip));
      onClip(j.key, seconds);
      onProgress({ done: i + 1, total: jobs.length });
    }
  } finally {
    onDownload = null;
  }
}
