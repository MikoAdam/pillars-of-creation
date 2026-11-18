import {
  Output, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource, AudioBufferSource, Quality, QUALITY_HIGH,
  canEncodeVideo, getFirstEncodableVideoCodec, getFirstEncodableAudioCodec, type VideoCodec,
} from "mediabunny";
import type { Assets, Theme } from "@/render/types";
import { FPS, HEIGHT, WIDTH } from "@/render/types";
import type { Timeline } from "@/lang/timeline";
import { drawSubtitle, renderTimeline, subtitleAt } from "./renderTimeline";
import { getClip } from "@/editor/speech";

export type ExportFormat = "720p" | "1080p" | "1440p" | "4k" | "vertical" | "square";
export const FORMAT_SIZE: Record<ExportFormat, [number, number]> = {
  "720p": [1280, 720],
  "1080p": [1920, 1080],
  "1440p": [2560, 1440],
  "4k": [3840, 2160],
  vertical: [1080, 1920],
  square: [1080, 1080],
};

export type CodecChoice = "avc" | "hevc" | "av1" | "vp9";
export type QualityChoice = "draft" | "standard" | "best";

/** Where the file is being written: straight to disk, to the browser's database on disk, to a file the user chose, or to memory. */
export type ExportStorage = "disk" | "database" | "file" | "memory";
export interface ExportProgress {
  frame: number; frames: number; elapsed: number; eta: number;
  storage?: ExportStorage | undefined;
  /** frames per second over the last couple of seconds */
  speed?: number | undefined;
  /** bytes written so far, where it can be counted */
  bytes?: number | undefined;
  paused?: boolean | undefined;
}
export interface ExportJob {
  timeline: Timeline; theme: Theme; assets: Assets;
  format: ExportFormat; from: number; to: number;
  voice?: Blob | undefined;
  music?: { blob: Blob; volume: number } | undefined;
  /** machine-voice clips for narrate lines, placed at their times */
  narration?: Narrated[] | undefined;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
  /** force a storage path (tests and diagnosis); normally the best one available is used */
  storage?: ExportStorage | undefined;
  fps?: number | undefined;
  quality?: QualityChoice | undefined;
  codec?: CodecChoice | undefined;
  /** burn the subtitle lines into the picture (default yes) */
  subtitles?: boolean | undefined;
  /** include the voice, machine voice and music (default yes) */
  sound?: boolean | undefined;
  /** pause between frames so the computer stays usable (a little slower) */
  gentle?: boolean | undefined;
  /** while this returns true the export waits */
  isPaused?: (() => boolean) | undefined;
  /** write straight into this file (in a folder the user picked) */
  file?: FileSystemFileHandle | undefined;
}

/** Exact frame count for a range. */
export const frameCount = (from: number, to: number, fps = FPS) => Math.max(1, Math.round((to - from) * fps));

const BASE_BPS: Record<QualityChoice, number> = { draft: 4e6, standard: 8e6, best: 16e6 }; // H.264, 1080p, 30 fps
const CODEC_EFFICIENCY: Record<CodecChoice, number> = { avc: 1, hevc: 0.65, vp9: 0.7, av1: 0.55 };

/** Video bitrate for the choices: the H.264 1080p rate, scaled by pixels, frame rate and codec. */
export function videoBitrate(format: ExportFormat, fps: number, quality: QualityChoice, codec: CodecChoice) {
  const [w, h] = FORMAT_SIZE[format];
  return Math.round(BASE_BPS[quality] * Math.pow((w * h) / (1920 * 1080), 0.85) * Math.pow(fps / 30, 0.7) * CODEC_EFFICIENCY[codec]);
}

/** About how big the file will be, in bytes. */
export const estimateBytes = (seconds: number, format: ExportFormat, fps: number, quality: QualityChoice, codec: CodecChoice, sound: boolean) =>
  (seconds * (videoBitrate(format, fps, quality, codec) + (sound ? 192_000 : 0))) / 8;

/** Which codecs this browser can encode at this size. */
export async function encodableCodecs(format: ExportFormat): Promise<CodecChoice[]> {
  if (typeof VideoEncoder === "undefined") return [];
  const [width, height] = FORMAT_SIZE[format];
  const all: CodecChoice[] = ["avc", "hevc", "av1", "vp9"];
  const ok = await Promise.all(all.map((c) => canEncodeVideo(c as VideoCodec, { width, height }).catch(() => false)));
  return all.filter((_, i) => ok[i]);
}

/** Subtitle lines of a stretch of the video as an .srt file (times from the start of the stretch). */
export function toSrt(tl: Timeline, from: number, to: number) {
  const ts = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const p = (n: number, d = 2) => String(n).padStart(d, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  };
  return (tl.subs ?? [])
    .filter((s) => s.t1 > from && s.t0 < to)
    .map((s, i) => `${i + 1}\n${ts(Math.max(s.t0, from) - from)} --> ${ts(Math.min(s.t1, to) - from)}\n${s.text}\n`)
    .join("\n");
}

/** Draws one output frame. Uses the same renderTimeline as the preview. */
export function makeFramePainter(tl: Timeline, theme: Theme, assets: Assets, format: ExportFormat, subtitles = true) {
  const [w, h] = FORMAT_SIZE[format];
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  let src: HTMLCanvasElement | null = null;
  if (format === "vertical" || format === "square") { src = document.createElement("canvas"); src.width = WIDTH; src.height = HEIGHT; }
  const paint = (t: number) => {
    if (!src) return renderTimeline(ctx, tl, theme, assets, t, undefined, { scale: w / WIDTH, final: true, subtitles });
    // vertical and square: the 16:9 frame in the middle over a soft blurred copy, subtitles underneath
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
    const sub = subtitles ? subtitleAt(tl, t) : undefined;
    if (sub) drawSubtitle(ctx, theme, sub, w / 2, Math.min(h - 40, fy + fh + (format === "vertical" ? 260 : 150)), w - 120, format === "vertical" ? 52 : 44);
  };
  return { canvas, paint };
}

const SR = 48000;

type Narrated = { t0: number; dur: number; key: string };

/**
 * Voiceover and music, decoded once, mixed on demand for any stretch of the video (the music
 * loops under the voice). Long videos are mixed piece by piece, so no full-length mix is held.
 */
async function audioMixer(voice: Blob | undefined, music: { blob: Blob; volume: number } | undefined, narration: Narrated[] = []) {
  if (!voice && !music && !narration.length) return null;
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
    // machine-voice lines that sound in this stretch
    const end = from + s1 / SR;
    for (const n of narration) {
      if (n.t0 >= end || n.t0 + n.dur <= at) continue;
      const c = await getClip(n.key);
      if (!c) continue;
      const b = off.createBuffer(1, c.pcm.length, c.sr);
      b.copyToChannel(c.pcm as Float32Array<ArrayBuffer>, 0);
      const s = off.createBufferSource();
      s.buffer = b; s.connect(off.destination);
      s.start(Math.max(0, n.t0 - at), Math.max(0, at - n.t0));
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
async function mixAudio(voice: Blob | undefined, music: { blob: Blob; volume: number } | undefined, from: number, to: number, narration?: Narrated[]): Promise<AudioBuffer | null> {
  const mix = await audioMixer(voice, music, narration);
  return mix ? mix(from, 0, Math.round((to - from) * SR)) : null;
}

/**
 * Where the MP4 goes: a file in the browser's private storage, written as it is encoded, so a
 * long video never has to fit in memory. Null where the browser can't write such files; the
 * export then builds the file in memory, which is fine for shorter videos.
 */
async function diskTarget(session: string, count: (n: number) => void) {
  try {
    const root = await navigator.storage.getDirectory();
    // earlier exports: their download has started or been abandoned by now (this export's earlier parts stay)
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
      if (name.startsWith("export-") && !name.startsWith(`export-${session}-`)) await root.removeEntry(name).catch(() => {});
    }
    const handle = await root.getFileHandle(`export-${session}-${Date.now()}.mp4`, { create: true });
    if (typeof handle.createWritable !== "function") return null;
    return { target: new StreamTarget(counting(await handle.createWritable(), count), { chunked: true }), file: () => handle.getFile() };
  } catch {
    return null;
  }
}

type Chunk = { type: "write"; data: Uint8Array; position: number };
/** The writable, passing every write on and reporting how far the file has grown. */
function counting(dest: WritableStream<Chunk>, count: (n: number) => void) {
  const w = dest.getWriter();
  let size = 0;
  return new WritableStream<Chunk>({
    async write(c) { await w.write(c); size = Math.max(size, c.position + c.data.length); count(size); },
    close: () => w.close(),
    abort: (r) => w.abort(r),
  });
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
async function databaseTarget(count: (n: number) => void) {
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
        count(size);
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

/**
 * A pause that keeps time while the tab is in the background. Page timers are slowed to about one
 * a second there, which would stall the export; a worker's timers are not.
 */
let timer: Worker | null = null;
let ticket = 0;
const waking = new Map<number, () => void>();
function sleep(ms: number) {
  if (typeof Worker === "undefined") return new Promise<void>((r) => setTimeout(r, ms));
  if (!timer) {
    timer = new Worker(URL.createObjectURL(new Blob(["onmessage=(e)=>setTimeout(()=>postMessage(e.data[0]),e.data[1])"], { type: "text/javascript" })));
    timer.onmessage = (e) => { waking.get(e.data)?.(); waking.delete(e.data); };
  }
  const id = ++ticket;
  return new Promise<void>((r) => { waking.set(id, r); timer!.postMessage([id, ms]); });
}
/** Names this browser session's export files, so a multi-part export keeps its earlier parts. */
const SESSION = Math.random().toString(36).slice(2, 8);

/** Export to MP4 with WebCodecs, or WebM in real time when WebCodecs is missing. */
export async function exportVideo(job: ExportJob): Promise<{ blob: Blob | null; ext: "mp4" | "webm"; bytes: number }> {
  const [w, h] = FORMAT_SIZE[job.format];
  const fps = job.fps ?? FPS;
  const quality = job.quality ?? "standard";
  const hasWebCodecs = typeof VideoEncoder !== "undefined";
  const wanted = job.codec ? [job.codec as VideoCodec] : [];
  const vCodec = hasWebCodecs ? await getFirstEncodableVideoCodec([...wanted, ...new Mp4OutputFormat().getSupportedVideoCodecs()], { width: w, height: h }) : null;
  if (!vCodec) return exportRealtime(job);

  const { canvas, paint } = makeFramePainter(job.timeline, job.theme, job.assets, job.format, job.subtitles !== false);
  let bytes = 0;
  const count = (n: number) => { bytes = n; };
  const want = job.storage;
  let storage: ExportStorage = "memory";
  let disk: { target: StreamTarget; file: () => Promise<Blob> } | null = null;
  if (job.file) {
    disk = { target: new StreamTarget(counting(await job.file.createWritable(), count), { chunked: true }), file: async () => new Blob() };
    storage = "file";
  }
  if (!disk && (!want || want === "disk")) { disk = await diskTarget(SESSION, count); if (disk) storage = "disk"; }
  if (!disk && (!want || want === "database")) { disk = await databaseTarget(count); if (disk) storage = "database"; }
  const output = disk
    ? new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: disk.target })
    : new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, {
    codec: vCodec,
    quality: new Quality({ bitrate: videoBitrate(job.format, fps, quality, vCodec as CodecChoice) }),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(video, { frameRate: fps });
  let audio: AudioBufferSource | null = null;
  const wantAudio = job.sound !== false && !!(job.voice || job.music || job.narration?.length);
  const aCodec = wantAudio ? await getFirstEncodableAudioCodec(new Mp4OutputFormat().getSupportedAudioCodecs()) : null;
  if (wantAudio && aCodec) { audio = new AudioBufferSource({ codec: aCodec, bitrate: QUALITY_HIGH }); output.addAudioTrack(audio); }
  await output.start();

  const frames = frameCount(job.from, job.to, fps);
  // sound goes in alongside the pictures, a piece ahead, so the file is written as it goes
  // (added only at the end, every encoded frame would wait in memory for it)
  const mix = audio ? await audioMixer(job.voice, job.music, job.narration) : null;
  const totalSamples = Math.round((frames / fps) * SR);
  let mixed = 0;
  const addSound = async (until: number) => {
    while (audio && mix && mixed < Math.min(until, totalSamples)) {
      const end = Math.min(mixed + AUDIO_PIECE, totalSamples);
      await audio.add(await mix(job.from, mixed, end));
      mixed = end;
    }
  };
  const t0 = performance.now();
  let paused = 0; // seconds spent paused, left out of the time estimates
  const recent: number[] = []; // when the last frames finished, for the speed
  const report = (i: number, isPaused = false) => {
    const elapsed = (performance.now() - t0) / 1000 - paused;
    const span = recent.length > 1 ? (recent[recent.length - 1] - recent[0]) / 1000 : 0;
    const speed = span > 0 ? (recent.length - 1) / span : undefined;
    const eta = speed ? (frames - i) / speed : (elapsed / Math.max(1, i)) * (frames - i);
    job.onProgress({ frame: i, frames, elapsed, eta, storage, speed, bytes: bytes || undefined, paused: isPaused });
  };
  const cancel = async () => { await output.cancel(); throw new DOMException("Export cancelled", "AbortError"); };
  for (let i = 0; i < frames; i++) {
    if (job.signal.aborted) await cancel();
    if (job.isPaused?.()) {
      const p0 = performance.now();
      report(i, true);
      while (job.isPaused() && !job.signal.aborted) await sleep(200);
      paused += (performance.now() - p0) / 1000;
      recent.length = 0;
      if (job.signal.aborted) await cancel();
    }
    const f0 = performance.now();
    await addSound(Math.round((i / fps) * SR) + AUDIO_PIECE);
    paint(job.from + i / fps);
    await video.add(i / fps, 1 / fps);
    recent.push(performance.now());
    if (recent.length > 60) recent.shift();
    if (i % 5 === 0 || i === frames - 1) report(i + 1);
    // leave the computer room to breathe: rest about half as long as the frame took, or at least let the page update
    if (job.gentle) await sleep(Math.min(50, (performance.now() - f0) * 0.5));
    else if (i % 15 === 0) await sleep(0);
  }
  await addSound(totalSamples);
  await output.finalize();
  if (storage === "file") return { blob: null, ext: "mp4", bytes };
  if (disk) { const blob = await disk.file(); return { blob, ext: "mp4", bytes: blob.size }; }
  const blob = new Blob([(output.target as BufferTarget).buffer!], { type: "video/mp4" });
  return { blob, ext: "mp4", bytes: blob.size };
}

/** Fallback: record the canvas in real time with MediaRecorder (WebM). */
async function exportRealtime(job: ExportJob): Promise<{ blob: Blob; ext: "webm"; bytes: number }> {
  const { canvas, paint } = makeFramePainter(job.timeline, job.theme, job.assets, job.format, job.subtitles !== false);
  const stream = canvas.captureStream(job.fps ?? FPS);
  let ac: AudioContext | null = null;
  const mix = job.sound === false ? null : await mixAudio(job.voice, job.music, job.from, job.to, job.narration);
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
  const blob = new Blob(parts, { type: "video/webm" });
  return { blob, ext: "webm", bytes: blob.size };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
