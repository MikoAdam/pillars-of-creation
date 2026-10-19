import { useRef, useState } from "react";
import { Download, Film, X } from "lucide-react";
import type { Timeline } from "@/lang/timeline";
import type { Assets, Theme } from "@/render/types";
import { downloadBlob, exportVideo, frameCount, type ExportFormat, type ExportProgress } from "@/engine/exportVideo";

interface Props {
  timeline: Timeline; theme: Theme; assets: Assets;
  voice?: Blob | undefined;
  onClose: () => void;
}

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "1080p", label: "1080p", hint: "1920 × 1080, standard HD" },
  { id: "4k", label: "4K", hint: "3840 × 2160, sharper, slower" },
  { id: "vertical", label: "Vertical", hint: "1080 × 1920, for Shorts and Reels" },
];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ExportDialog({ timeline, theme, assets, voice, onClose }: Props) {
  const total = Math.round(timeline.duration * 10) / 10;
  const [format, setFormat] = useState<ExportFormat>("1080p");
  const [part, setPart] = useState(false);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(total);
  const [prog, setProg] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<{ blob: Blob; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const r0 = part ? Math.max(0, Math.min(from, total)) : 0;
  const r1 = part ? Math.max(r0 + 0.1, Math.min(to, total)) : total;
  const busy = !!prog && !result;

  const start = async () => {
    setError(null); setResult(null);
    const ac = new AbortController();
    abort.current = ac;
    setProg({ frame: 0, frames: frameCount(r0, r1), elapsed: 0, eta: 0 });
    try {
      const { blob, ext } = await exportVideo({ timeline, theme, assets, format, from: r0, to: r1, voice, onProgress: setProg, signal: ac.signal });
      const base = (timeline.title || "video").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "video";
      setResult({ blob, name: `${base}-${format}${part ? `-${fmt(r0).replace(":", "m")}` : ""}.${ext}` });
    } catch (e) {
      setProg(null);
      if ((e as DOMException).name !== "AbortError") setError(String((e as Error).message ?? e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="w-[440px] rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Film className="h-5 w-5" /> Export video</h2>
          <button onClick={() => { abort.current?.abort(); onClose(); }} className="rounded p-1 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2">
          {FORMATS.map((f) => (
            <button key={f.id} disabled={busy} onClick={() => setFormat(f.id)}
              className={`rounded-lg border p-2 text-left ${format === f.id ? "border-primary bg-secondary" : "border-border hover:bg-secondary"}`}>
              <div className="text-sm font-semibold">{f.label}</div>
              <div className="text-[11px] leading-tight text-muted-foreground">{f.hint}</div>
            </button>
          ))}
        </div>

        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={part} disabled={busy} onChange={(e) => setPart(e.target.checked)} className="accent-primary" />
          Export only part of the video
        </label>
        {part && (
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">From</span>
            <input type="number" step={0.1} min={0} max={total} value={from} disabled={busy} onChange={(e) => setFrom(Number(e.target.value))} className="w-20 rounded border border-border bg-background px-2 py-1" />
            <span className="text-muted-foreground">to</span>
            <input type="number" step={0.1} min={0} max={total} value={to} disabled={busy} onChange={(e) => setTo(Number(e.target.value))} className="w-20 rounded border border-border bg-background px-2 py-1" />
            <span className="text-muted-foreground">seconds</span>
          </div>
        )}
        <p className="mb-4 text-xs text-muted-foreground">
          {fmt(r1 - r0)} long, {frameCount(r0, r1)} frames at 30 fps{voice ? ", with voiceover" : ""}.
        </p>

        {prog && (
          <div className="mb-4">
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${(prog.frame / prog.frames) * 100}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>Frame {prog.frame} / {prog.frames}</span>
              <span>{result ? "Done" : `About ${fmt(prog.eta)} left`}</span>
            </div>
          </div>
        )}
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          {busy && <button onClick={() => abort.current?.abort()} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel</button>}
          {result ? (
            <button onClick={() => downloadBlob(result.blob, result.name)} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
              <Download className="h-4 w-4" /> Download {result.name.split(".").pop()?.toUpperCase()}
            </button>
          ) : (
            <button onClick={() => void start()} disabled={busy} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Exporting…" : "Start export"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
