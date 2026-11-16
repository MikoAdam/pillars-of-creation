import {
  Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource, QUALITY_HIGH,
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

export interface ExportProgress { frame: number; frames: number; elapsed: number; eta: number }
export interface ExportJob {
  timeline: Timeline; theme: Theme; assets: Assets;
  format: ExportFormat; from: number; to: number;
  voice?: Blob | undefined;
  music?: { blob: Blob; volume: number } | undefined;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
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
    if (!src) return renderTimeline(ctx, tl, theme, assets, t, undefined, { scale: w / WIDTH });
    // vertical: 16:9 frame in the middle over a soft blurred copy, subtitles underneath
    renderTimeline(src.getContext("2d")!, tl, theme, assets, t, undefined, { subtitles: false });
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

/** Voiceover and music for the range, mixed to one stereo buffer; the music loops under the voice. */
async function mixAudio(voice: Blob | undefined, music: { blob: Blob; volume: number } | undefined, from: number, to: number): Promise<AudioBuffer | null> {
  if (!voice && !music) return null;
  const ac = new AudioContext();
  const dec = async (b: Blob) => ac.decodeAudioData(await b.arrayBuffer());
  const v = voice ? await dec(voice) : null;
  const m = music ? await dec(music.blob) : null;
  void ac.close();
  const sr = 48000, len = Math.max(1, Math.round((to - from) * sr));
  const off = new OfflineAudioContext(2, len, sr);
  if (v) {
    const s = off.createBufferSource();
    s.buffer = v; s.connect(off.destination);
    s.start(0, Math.min(from, v.duration));
  }
  if (m && music) {
    const g = off.createGain();
    g.gain.value = music.volume; g.connect(off.destination);
    const s = off.createBufferSource();
    s.buffer = m; s.loop = true; s.connect(g);
    s.start(0, m.duration ? from % m.duration : 0);
  }
  return off.startRendering();
}

/** Export to MP4 with WebCodecs, or WebM in real time when WebCodecs is missing. */
export async function exportVideo(job: ExportJob): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const [w, h] = FORMAT_SIZE[job.format];
  const hasWebCodecs = typeof VideoEncoder !== "undefined";
  const vCodec = hasWebCodecs ? await getFirstEncodableVideoCodec(new Mp4OutputFormat().getSupportedVideoCodecs(), { width: w, height: h }) : null;
  if (!vCodec) return exportRealtime(job);

  const { canvas, paint } = makeFramePainter(job.timeline, job.theme, job.assets, job.format);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: vCodec, bitrate: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: FPS });
  let audio: AudioBufferSource | null = null;
  const wantAudio = !!(job.voice || job.music);
  const aCodec = wantAudio ? await getFirstEncodableAudioCodec(new Mp4OutputFormat().getSupportedAudioCodecs()) : null;
  if (wantAudio && aCodec) { audio = new AudioBufferSource({ codec: aCodec, bitrate: QUALITY_HIGH }); output.addAudioTrack(audio); }
  await output.start();

  const frames = frameCount(job.from, job.to);
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) {
    if (job.signal.aborted) { await output.cancel(); throw new DOMException("Export cancelled", "AbortError"); }
    paint(job.from + i / FPS);
    await video.add(i / FPS, 1 / FPS);
    if (i % 5 === 0 || i === frames - 1) {
      const elapsed = (performance.now() - t0) / 1000;
      job.onProgress({ frame: i + 1, frames, elapsed, eta: (elapsed / (i + 1)) * (frames - i - 1) });
    }
  }
  if (audio) { const mix = await mixAudio(job.voice, job.music, job.from, job.to); if (mix) await audio.add(mix); }
  await output.finalize();
  return { blob: new Blob([output.target.buffer!], { type: "video/mp4" }), ext: "mp4" };
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
