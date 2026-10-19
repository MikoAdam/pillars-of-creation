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

self.onmessage = async (e: MessageEvent<{ audio: Float32Array }>) => {
  try {
    asr ??= await load();
    self.postMessage({ type: "progress", stage: "transcribe", progress: 0 });
    const out = await asr(e.data.audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
    self.postMessage({ type: "done", chunks: out.chunks ?? [{ timestamp: [0, null], text: out.text }] });
  } catch (err) {
    self.postMessage({ type: "error", message: String((err as Error)?.message ?? err) });
  }
};
