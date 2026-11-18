import {
  Output, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH,
  getFirstEncodableVideoCodec, getFirstEncodableAudioCodec,
} from "mediabunny";
import type { Assets, Theme } from "@/render/types";
import { FPS, HEIGHT, WIDTH } from "@/render/types";
import type { Timeline } from "@/lang/timeline";
import { drawSubtitle, renderTimeline, subtitleAt } from "./renderTimeline";

export type ExportFormat = "1080p" | "4k" | "vertical";
export const FORMAT_SIZE: Record<ExportFormat, [number, number]> = {
  "1080p": [1920, 1080],
  "4k": [3840, 2160],
  vertical: [1080, 1920],
};

/** Where the file is being written: straight to disk, to the browser's database on disk, or to memory. */
export type ExportStorage = "disk" | "database" | "memory";
export interface ExportProgress { frame: number; frames: number; elapsed: number; eta: number; storage?: ExportStorage }
export interface ExportJob {
  timeline: Timeline; theme: Theme; assets: Assets;
  format: ExportFormat; from: number; to: number;
  voice?: Blob | undefined;
  music?: { blob: Blob; volume: number } | undefined;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
  /** force a storage path (tests and diagnosis); normally the best one available is used */
  storage?: ExportStorage | undefined;
}

/** Exact frame count for a range, at 30 fps. */
export const frameCount = (from: number, to: number) => Math.max(1, Math.round((to - from) * FPS));

/** Draws one output frame. Uses the same renderTimeline as the preview. */
export function makeFramePainter(tl: Timeline, theme: Theme, assets: Assets, format: ExportFormat) {
  const [w, h] = FORMAT_SIZE[format];
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  let src: HTMLCanvasElement | null = null;
  if (format === "vertical") { src = document.createElement("canvas"); src.width = WIDTH; src.height = HEIGHT; }
  const paint = (t: number) => {
    if (!src) return renderTimeline(ctx, tl, theme, assets, t, undefined, { scale: w / WIDTH, final: true });
    // vertical: 16:9 frame in the middle over a soft blurred copy, subtitles underneath
    renderTimeline(src.getContext("2d")!, tl, theme, assets, t, undefined, { subtitles: false, final: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.colors.background;
    ctx.fillRect(0, 0, w, h);
    const coverW = (h * WIDTH) / HEIGHT;
    ctx.save();
    ctx.filter = "blur(40px)";
    ctx.globalAlpha = 0.35;
    ctx.drawImage(src, (w - coverW) / 2, 0, coverW, h);
    ctx.restore();
    const fh = (w * HEIGHT) / WIDTH, fy = (h - fh) / 2;
    ctx.drawImage(src, 0, fy, w, fh);
    const sub = subtitleAt(tl, t);
    if (sub) drawSubtitle(ctx, theme, sub, w / 2, fy + fh + 260, w - 120, 52);
  };
  return { canvas, paint };
}

const SR = 48000;

/**
 * Voiceover and music, decoded once, mixed on demand for any stretch of the video (the music
 * loops under the voice). Long videos are mixed piece by piece, so no full-length mix is held.
 */
async function audioMixer(voice: Blob | undefined, music: { blob: Blob; volume: number } | undefined) {
  if (!voice && !music) return null;
  const ac = new AudioContext();
  const dec = async (b: Blob) => ac.decodeAudioData(await b.arrayBuffer());
  const v = voice ? await dec(voice) : null;
  const m = music ? await dec(music.blob) : null;
  void ac.close();
  /** frames [s0, s1) of the output, counted in samples from time `from` */
  return async (from: number, s0: number, s1: number): Promise<AudioBuffer> => {
    const off = new OfflineAudioContext(2, Math.max(1, s1 - s0), SR);
    const at = from + s0 / SR;
    if (v && at < v.duration) {
      const s = off.createBufferSource();
      s.buffer = v; s.connect(off.destination);
      s.start(0, at);
    }
    if (m && music && m.duration) {
      const g = off.createGain();
      g.gain.value = music.volume; g.connect(off.destination);
      const s = off.createBufferSource();
      s.buffer = m; s.loop = true; s.connect(g);
      s.start(0, at % m.duration);
    }
    return off.startRendering();
  };
}

/** The whole range mixed at once (the real-time fallback needs one buffer). */
async function mixAudio(voice: Blob | undefined, music: { blob: Blob; volume: number } | undefined, from: number, to: number): Promise<AudioBuffer | null> {
  const mix = await audioMixer(voice, music);
  return mix ? mix(from, 0, Math.round((to - from) * SR)) : null;
}

/**
 * Where the MP4 goes: a file in the browser's private storage, written as it is encoded, so a
 * long video never has to fit in memory. Null where the browser can't write such files; the
 * export then builds the file in memory, which is fine for shorter videos.
 */
async function diskTarget() {
  try {
    const root = await navigator.storage.getDirectory();
    // earlier exports: their download has started or been abandoned by now
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
      if (name.startsWith("export-")) await root.removeEntry(name).catch(() => {});
    }
    const handle = await root.getFileHandle(`export-${Date.now()}.mp4`, { create: true });
    if (typeof handle.createWritable !== "function") return null;
    const writable = await handle.createWritable();
    return { target: new StreamTarget(writable, { chunked: true }), file: () => handle.getFile() };
  } catch {
    return null;
  }
}

/**
 * Fallback where the private file storage can't be written (Brave, for one): the file goes into
 * IndexedDB in 8 MB pieces, which the browser keeps on disk. Only the first megabyte stays in
 * memory, because the file's header is rewritten when it is finished; everything after it is
 * written once, in order.
 */
const DB = "pnt-export", STORE = "pieces", PIECE = 8 << 20, HEAD = 1 << 20;
function idb<T>(req: IDBRequest<T>) {
  return new Promise<T>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}
async function databaseTarget() {
  if (typeof indexedDB === "undefined") return null;
  try {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    const db = await idb(open);
    const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
    await idb(tx("readwrite").clear()); // earlier exports
    const head = new Uint8Array(HEAD);
    let size = 0; // bytes written so far
    let buf = new Uint8Array(PIECE * 2), bufStart = HEAD, bufLen = 0; // not yet stored, starting at bufStart
    let pieces = 0;
    const store = async () => {
      if (!bufLen) return;
      await idb(tx("readwrite").put(new Blob([buf.slice(0, bufLen)]), pieces++));
      bufStart += bufLen;
      bufLen = 0;
    };
    const writable = new WritableStream<{ type: "write"; data: Uint8Array; position: number }>({
      async write({ data, position }) {
        let d = data, pos = position;
        if (pos < HEAD) {
          const n = Math.min(d.length, HEAD - pos);
          head.set(d.subarray(0, n), pos);
          d = d.subarray(n);
          pos += n;
        }
        if (d.length) {
          if (pos < bufStart) throw new Error("Export: unexpected rewrite of data already saved");
          const at = pos - bufStart;
          if (at + d.length > buf.length) {
            const next = new Uint8Array(Math.max(buf.length * 2, at + d.length));
            next.set(buf.subarray(0, bufLen));
            buf = next;
          }
          buf.set(d, at);
          bufLen = Math.max(bufLen, at + d.length);
          if (bufLen >= PIECE) await store();
        }
        size = Math.max(size, position + data.length);
      },
      async close() { await store(); },
    });
    return {
      target: new StreamTarget(writable),
      file: async () => {
        const parts: BlobPart[] = [head.slice(0, Math.min(HEAD, size))];
        for (let i = 0; i < pieces; i++) parts.push(await idb(tx("readonly").get(i)) as Blob);
        return new Blob(parts, { type: "video/mp4" });
      },
    };
  } catch {
    return null;
  }
}

const AUDIO_PIECE = 10 * SR; // mix and hand over the sound ten seconds at a time

/** Export to MP4 with WebCodecs, or WebM in real time when WebCodecs is missing. */
export async function exportVideo(job: ExportJob): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const [w, h] = FORMAT_SIZE[job.format];
  const hasWebCodecs = typeof VideoEncoder !== "undefined";
  const vCodec = hasWebCodecs ? await getFirstEncodableVideoCodec(new Mp4OutputFormat().getSupportedVideoCodecs(), { width: w, height: h }) : null;
  if (!vCodec) return exportRealtime(job);

  const { canvas, paint } = makeFramePainter(job.timeline, job.theme, job.assets, job.format);
  const want = job.storage;
  let storage: ExportStorage = "memory";
  let disk: { target: StreamTarget; file: () => Promise<Blob> } | null = !want || want === "disk" ? await diskTarget() : null;
  if (disk) storage = "disk";
  else if (!want || want === "database") { disk = await databaseTarget(); if (disk) storage = "database"; }
  const output = disk
    ? new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: disk.target })
    : new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: vCodec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  let audio: AudioBufferSource | null = null;
  const wantAudio = !!(job.voice || job.music);
  const aCodec = wantAudio ? await getFirstEncodableAudioCodec(new Mp4OutputFormat().getSupportedAudioCodecs()) : null;
  if (wantAudio && aCodec) { audio = new AudioBufferSource({ codec: aCodec, bitrate: QUALITY_HIGH }); output.addAudioTrack(audio); }
  await output.start();

  const frames = frameCount(job.from, job.to);
  // sound goes in alongside the pictures, a piece ahead, so the file is written as it goes
  // (added only at the end, every encoded frame would wait in memory for it)
  const mix = audio ? await audioMixer(job.voice, job.music) : null;
  const totalSamples = Math.round((frames / FPS) * SR);
  let mixed = 0;
  const addSound = async (until: number) => {
    while (audio && mix && mixed < Math.min(until, totalSamples)) {
      const end = Math.min(mixed + AUDIO_PIECE, totalSamples);
      await audio.add(await mix(job.from, mixed, end));
      mixed = end;
    }
  };
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (job.signal.aborted) { await output.cancel(); throw new DOMException("Export cancelled", "AbortError"); }
    await addSound(Math.round((i / FPS) * SR) + AUDIO_PIECE);
    paint(job.from + i / FPS);
    await video.add(i / FPS, 1 / FPS);
    if (i % 5 === 0 || i === frames - 1) {
      const elapsed = (performance.now() - t0) / 1000;
      job.onProgress({ frame: i + 1, frames, elapsed, eta: (elapsed / (i + 1)) * (frames - i - 1), storage });
    }
  }
  await addSound(totalSamples);
  await output.finalize();
  if (disk) return { blob: await disk.file(), ext: "mp4" };
  return { blob: new Blob([(output.target as BufferTarget).buffer!], { type: "video/mp4" }), ext: "mp4" };
}

/** Fallback: record the canvas in real time with MediaRecorder (WebM). */
async function exportRealtime(job: ExportJob): Promise<{ blob: Blob; ext: "webm" }> {
  const { canvas, paint } = makeFramePainter(job.timeline, job.theme, job.assets, job.format);
  const stream = canvas.captureStream(FPS);
  let ac: AudioContext | null = null;
  const mix = await mixAudio(job.voice, job.music, job.from, job.to);
  if (mix) {
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const node = ac.createBufferSource();
    node.buffer = mix; node.connect(dest); node.start();
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }
  const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm", videoBitsPerSecond: 12_000_000 });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  const frames = frameCount(job.from, job.to), dur = job.to - job.from;
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const el = (performance.now() - start) / 1000;
      if (job.signal.aborted || el >= dur) return resolve();
      paint(job.from + el);
      job.onProgress({ frame: Math.min(frames, Math.round(el * FPS)), frames, elapsed: el, eta: dur - el });
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  await done;
  void ac?.close();
  if (job.signal.aborted) throw new DOMException("Export cancelled", "AbortError");
  return { blob: new Blob(parts, { type: "video/webm" }), ext: "webm" };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
