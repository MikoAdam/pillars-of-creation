/// <reference lib="webworker" />
// Speaks narration with the open Supertonic voice model (code MIT, model OpenRAIL), entirely in the browser.
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL = "onnx-community/Supertonic-TTS-ONNX";
type Tts = (text: string, opts: Record<string, unknown>) => Promise<{ audio: Float32Array; sampling_rate: number }>;

let tts: Promise<Tts> | null = null;
const voices = new Map<string, Promise<Float32Array>>();

async function load(): Promise<Tts> {
  const progress_callback = (p: { status: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
    if (p.status === "progress") self.postMessage({ type: "download", progress: p.progress ?? 0, file: p.file, loaded: p.loaded, total: p.total });
  };
  if ("gpu" in navigator) {
    try {
      return (await pipeline("text-to-speech", MODEL, { device: "webgpu", dtype: "fp32", progress_callback } as never)) as unknown as Tts;
    } catch { /* fall back to wasm */ }
  }
  return (await pipeline("text-to-speech", MODEL, { device: "wasm", dtype: "fp32", progress_callback } as never)) as unknown as Tts;
}

function voice(name: string) {
  let v = voices.get(name);
  if (!v) {
    v = fetch(`https://huggingface.co/${MODEL}/resolve/main/voices/${name}.bin`)
      .then((r) => { if (!r.ok) throw new Error(`No voice called ${name}`); return r.arrayBuffer(); })
      .then((b) => new Float32Array(b));
    voices.set(name, v);
  }
  return v;
}

interface Job { id: number; text: string; voice: string; speed: number }

// one line at a time, in the order asked
let queue: Promise<void> = Promise.resolve();
self.onmessage = (e: MessageEvent<Job>) => {
  const job = e.data;
  queue = queue.then(async () => {
    try {
      tts ??= load();
      const speak = await tts;
      const out = await speak(job.text, { speaker_embeddings: await voice(job.voice), num_inference_steps: 5, speed: job.speed });
      const audio = out.audio;
      self.postMessage({ type: "done", id: job.id, audio, sr: out.sampling_rate }, [audio.buffer]);
    } catch (err) {
      tts = null;
      self.postMessage({ type: "error", id: job.id, message: String((err as Error)?.message ?? err) });
    }
  });
};
