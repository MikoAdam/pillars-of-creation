/// <reference lib="webworker" />
// Runs the open-source Whisper speech model entirely in the browser.
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string; chunks?: { timestamp: [number, number | null]; text: string }[] }>;
let asr: Asr | null = null;

async function load() {
  const progress_callback = (p: { status: string; progress?: number; file?: string }) => {
    if (p.status === "progress") self.postMessage({ type: "progress", stage: "download", progress: p.progress ?? 0, file: p.file });
  };
  const hasGpu = "gpu" in navigator;
  try {
    if (hasGpu) {
      return (await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
        device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback,
      } as never)) as unknown as Asr;
    }
  } catch { /* fall back to wasm */ }
  return (await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
    device: "wasm", dtype: "q8", progress_callback,
  } as never)) as unknown as Asr;
}

const WINDOW_S = 30;

self.onmessage = async (e: MessageEvent<{ audio: Float32Array }>) => {
  try {
    asr ??= await load();
    const audio = e.data.audio;
    const win = 16000 * WINDOW_S;
    const n = Math.max(1, Math.ceil(audio.length / win));
    const chunks: { timestamp: [number, number | null]; text: string }[] = [];
    self.postMessage({ type: "progress", stage: "transcribe", progress: 0 });
    for (let i = 0; i < n; i++) {
      const out = await asr(audio.subarray(i * win, (i + 1) * win), { return_timestamps: true });
      const offset = i * WINDOW_S;
      const part = (out.chunks ?? [{ timestamp: [0, null] as [number, number | null], text: out.text }]).map((c) => ({
        timestamp: [c.timestamp[0] + offset, c.timestamp[1] === null ? null : c.timestamp[1] + offset] as [number, number | null],
        text: c.text,
      }));
      chunks.push(...part);
      self.postMessage({ type: "chunk", progress: ((i + 1) / n) * 100, text: part.map((c) => c.text).join(" ").trim() });
    }
    self.postMessage({ type: "done", chunks });
  } catch (err) {
    self.postMessage({ type: "error", message: String((err as Error)?.message ?? err) });
  }
};
