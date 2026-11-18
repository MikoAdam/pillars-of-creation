import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, FolderOpen, Pause, Play, X } from "lucide-react";
import type { Timeline } from "@/lang/timeline";
import type { Assets, Theme } from "@/render/types";
import {
  downloadBlob, encodableCodecs, estimateBytes, exportVideo, frameCount, toSrt,
  type CodecChoice, type ExportFormat, type ExportProgress, type QualityChoice,
} from "@/engine/exportVideo";

interface Props {
  timeline: Timeline; theme: Theme; assets: Assets;
  voice?: Blob | undefined;
  music?: { blob: Blob; volume: number } | undefined;
  /** machine-voice clips for narrate lines, when there is no recorded voiceover */
  narration?: { t0: number; dur: number; key: string }[] | undefined;
  onClose: () => void;
}

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "720p", label: "720p", hint: "1280 × 720, quick drafts" },
  { id: "1080p", label: "1080p", hint: "1920 × 1080, standard HD" },
  { id: "1440p", label: "1440p", hint: "2560 × 1440, sharper on big screens" },
  { id: "4k", label: "4K", hint: "3840 × 2160, sharpest, slowest" },
  { id: "vertical", label: "Vertical", hint: "1080 × 1920, Shorts, Reels, TikTok" },
  { id: "square", label: "Square", hint: "1080 × 1080, feeds" },
];
const CODECS: { id: CodecChoice; label: string }[] = [
  { id: "avc", label: "H.264 (plays everywhere)" },
  { id: "hevc", label: "HEVC / H.265 (smaller, Apple devices)" },
  { id: "av1", label: "AV1 (smallest, newest players)" },
  { id: "vp9", label: "VP9 (web)" },
];
const QUALITIES: { id: QualityChoice; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "standard", label: "Standard" },
  { id: "best", label: "Best" },
];

interface Settings {
  format: ExportFormat; fps: number; quality: QualityChoice; codec: CodecChoice;
  subtitles: boolean; srt: boolean; sound: boolean; gentle: boolean;
  split: boolean; partMinutes: number; save: "download" | "folder";
}
const DEFAULTS: Settings = {
  format: "1080p", fps: 30, quality: "standard", codec: "avc", subtitles: true, srt: false, sound: true,
  gentle: true, split: false, partMinutes: 5, save: "download",
};
const KEY = "pnt:export";
const loadSettings = (): Settings => {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>) }; } catch { return DEFAULTS; }
};

const fmt = (s: number) => {
  const t = Math.max(0, Math.round(s));
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, sec = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${Math.max(0.1, b / 1e6).toFixed(b < 1e7 ? 1 : 0)} MB`);
const canPickFolder = typeof window !== "undefined" && "showDirectoryPicker" in window;

type Saved = { name: string; bytes: number; blob: Blob | null };

export function ExportDialog({ timeline, theme, assets, voice, music, narration, onClose }: Props) {
  const total = Math.round(timeline.duration * 10) / 10;
  const [cfg, setCfg] = useState<Settings>(loadSettings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setCfg((c) => ({ ...c, [k]: v }));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* private mode */ } }, [cfg]);
  const [codecs, setCodecs] = useState<CodecChoice[] | null>(null);
  useEffect(() => { setCodecs(null); void encodableCodecs(cfg.format).then(setCodecs); }, [cfg.format]);
  const codec = codecs && !codecs.includes(cfg.codec) ? (codecs[0] ?? "avc") : cfg.codec;

  const [part, setPart] = useState(false);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(total);
  const [name, setName] = useState(() => (timeline.title || "video").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "video");
  const [prog, setProg] = useState<(ExportProgress & { part: number; parts: number }) | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const abort = useRef<AbortController | null>(null);

  const r0 = part ? Math.max(0, Math.min(from, total)) : 0;
  const r1 = part ? Math.max(r0 + 0.1, Math.min(to, total)) : total;
  const busy = !!prog && !done;
  const hasSubs = !!timeline.subs?.length;
  const hasSound = !!(voice || music || narration?.length);
  const missingVoice = !voice && (timeline.narration?.length ?? 0) - (narration?.length ?? 0);
  const ranges = useMemo(() => {
    if (!cfg.split) return [[r0, r1]];
    const len = Math.max(0.5, cfg.partMinutes) * 60, out: [number, number][] = [];
    for (let a = r0; a < r1 - 0.05; a += len) out.push([a, Math.min(r1, a + len)]);
    return out;
  }, [cfg.split, cfg.partMinutes, r0, r1]);
  const sizeEstimate = estimateBytes(r1 - r0, cfg.format, cfg.fps, cfg.quality, codec, cfg.sound && hasSound);

  const start = async () => {
    setError(null); setSaved([]); setDone(false); setPaused(false);
    let folder: FileSystemDirectoryHandle | null = null;
    if (cfg.save === "folder" && canPickFolder) {
      // asked first, while the click still counts as the user's
      try { folder = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: "readwrite", id: "pillars-export" }); }
      catch { return; } // they closed the picker
    }
    const ac = new AbortController();
    abort.current = ac;
    const base = `${name || "video"}-${cfg.format}`;
    try {
      for (let i = 0; i < ranges.length; i++) {
        const [a, b] = ranges[i]!;
        const suffix = ranges.length > 1 ? `-part${i + 1}` : part ? `-${fmt(a).replace(/:/g, "m")}` : "";
        const file = `${base}${suffix}.mp4`;
        setProg({ frame: 0, frames: frameCount(a, b, cfg.fps), elapsed: 0, eta: 0, part: i + 1, parts: ranges.length });
        const handle = folder ? await folder.getFileHandle(file, { create: true }) : undefined;
        const res = await exportVideo({
          timeline, theme, assets, format: cfg.format, from: a, to: b, fps: cfg.fps, quality: cfg.quality, codec,
          subtitles: cfg.subtitles, sound: cfg.sound, gentle: cfg.gentle, isPaused: () => pausedRef.current, file: handle,
          voice, music, narration,
          onProgress: (p) => setProg({ ...p, part: i + 1, parts: ranges.length }),
          signal: ac.signal,
        });
        const out = res.ext === "webm" ? file.replace(/\.mp4$/, ".webm") : file;
        if (res.blob) downloadBlob(res.blob, out); // saved as soon as each part is ready
        setSaved((s) => [...s, { name: out, bytes: res.bytes, blob: res.blob }]);
        if (cfg.srt && hasSubs) {
          const srt = new Blob([toSrt(timeline, a, b)], { type: "application/x-subrip" });
          const srtName = out.replace(/\.(mp4|webm)$/, ".srt");
          if (folder) { const w = await (await folder.getFileHandle(srtName, { create: true })).createWritable(); await w.write(srt); await w.close(); }
          else downloadBlob(srt, srtName);
        }
      }
      setDone(true);
    } catch (e) {
      setProg(null);
      if ((e as DOMException).name !== "AbortError") setError(String((e as Error).message ?? e));
    }
  };

  const overall = prog ? ((prog.part - 1) + prog.frame / Math.max(1, prog.frames)) / prog.parts : 0;
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  const choice = (on: boolean) => `rounded-lg border p-2 text-left ${on ? "border-primary bg-secondary" : "border-border hover:bg-secondary"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm" onClick={() => !busy && onClose()}>
      <div className="max-h-[92vh] w-[620px] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Film className="h-5 w-5" /> Export video</h2>
          <button onClick={() => { abort.current?.abort(); onClose(); }} className="rounded p-1 text-muted-foreground hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <div className="grid grid-cols-3 gap-2">
            {FORMATS.map((f) => (
              <button key={f.id} onClick={() => set("format", f.id)} className={choice(cfg.format === f.id)}>
                <div className="text-sm font-semibold">{f.label}</div>
                <div className="text-[11px] leading-tight text-muted-foreground">{f.hint}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Frame rate</span>
              <select value={cfg.fps} onChange={(e) => set("fps", Number(e.target.value))} className="rounded-md border border-border bg-background px-2 py-1">
                {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps{f === 30 ? " (default)" : f === 60 ? " (smoother, slower)" : ""}</option>)}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Quality</span>
              <div className="flex rounded-md border border-border p-0.5">
                {QUALITIES.map((q) => (
                  <button key={q.id} onClick={() => set("quality", q.id)} className={`flex-1 rounded px-2 py-0.5 text-xs ${cfg.quality === q.id ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}>{q.label}</button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Codec</span>
              <select value={codec} onChange={(e) => set("codec", e.target.value as CodecChoice)} className="rounded-md border border-border bg-background px-2 py-1">
                {CODECS.map((c) => <option key={c.id} value={c.id} disabled={!!codecs && !codecs.includes(c.id)}>{c.label}{codecs && !codecs.includes(c.id) ? " (not in this browser)" : ""}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2" title={hasSubs ? "" : "The script has no subtitle lines"}>
              <input type="checkbox" checked={cfg.subtitles && hasSubs} disabled={!hasSubs} onChange={(e) => set("subtitles", e.target.checked)} className="accent-primary" />
              Subtitles in the picture
            </label>
            <label className="flex items-center gap-2" title={hasSubs ? "For YouTube and players that switch subtitles on and off" : "The script has no subtitle lines"}>
              <input type="checkbox" checked={cfg.srt && hasSubs} disabled={!hasSubs} onChange={(e) => set("srt", e.target.checked)} className="accent-primary" />
              Also save subtitles as .srt
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={cfg.sound && hasSound} disabled={!hasSound} onChange={(e) => set("sound", e.target.checked)} className="accent-primary" />
              Sound{hasSound ? ` (${[voice && "voiceover", narration?.length && "machine voice", music && "music"].filter(Boolean).join(", ")})` : " (none in this video)"}
            </label>
            <label className="flex items-center gap-2" title="Rests between frames so the computer stays usable while it exports. A little slower.">
              <input type="checkbox" checked={cfg.gentle} onChange={(e) => set("gentle", e.target.checked)} className="accent-primary" />
              Keep the computer responsive
            </label>
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={part} onChange={(e) => setPart(e.target.checked)} className="accent-primary" />
              Export only part of the video
            </label>
            {part && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-muted-foreground">From</span>
                <input type="number" step={0.1} min={0} max={total} value={from} onChange={(e) => setFrom(Number(e.target.value))} className="w-20 rounded border border-border bg-background px-2 py-1" />
                <span className="text-muted-foreground">to</span>
                <input type="number" step={0.1} min={0} max={total} value={to} onChange={(e) => setTo(Number(e.target.value))} className="w-20 rounded border border-border bg-background px-2 py-1" />
                <span className="text-muted-foreground">seconds</span>
              </div>
            )}
            <label className="flex items-center gap-2" title="Each part is saved the moment it is done, so a long export can't lose everything at the end">
              <input type="checkbox" checked={cfg.split} onChange={(e) => set("split", e.target.checked)} className="accent-primary" />
              Split into parts of
              <input type="number" min={0.5} step={0.5} value={cfg.partMinutes} onChange={(e) => set("partMinutes", Number(e.target.value))} className="w-16 rounded border border-border bg-background px-2 py-0.5" />
              minutes{cfg.split ? ` (${ranges.length} part${ranges.length === 1 ? "" : "s"})` : ""}
            </label>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">File name</span>
              <input value={name} onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]+/g, ""))} className="rounded-md border border-border bg-background px-2 py-1" />
            </label>
            <div className="flex rounded-md border border-border p-0.5 text-xs">
              <button onClick={() => set("save", "download")} className={`flex items-center gap-1 rounded px-2 py-1 ${cfg.save === "download" ? "bg-secondary font-semibold" : "text-muted-foreground"}`}><Download className="h-3.5 w-3.5" /> Download when ready</button>
              {canPickFolder && <button onClick={() => set("save", "folder")} className={`flex items-center gap-1 rounded px-2 py-1 ${cfg.save === "folder" ? "bg-secondary font-semibold" : "text-muted-foreground"}`}><FolderOpen className="h-3.5 w-3.5" /> Write into a folder</button>}
            </div>
          </div>
        </fieldset>

        <p className="mb-4 mt-3 text-xs text-muted-foreground">
          {fmt(r1 - r0)} long, {frameCount(r0, r1, cfg.fps).toLocaleString()} frames, about {mb(sizeEstimate)}.
          {cfg.save === "folder" ? " The file is written into the folder as it is made." : " The file downloads by itself when it is ready."}
          {missingVoice ? ` ${missingVoice} narrate line(s) have no machine voice yet and will be silent: make it in the Audio panel first.` : ""}
        </p>

        {prog && (
          <div className="mb-4 space-y-1.5">
            {prog.parts > 1 && <div className="text-xs font-semibold">Part {prog.part} of {prog.parts}</div>}
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${(done ? 1 : overall) * 100}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-x-3 font-mono text-[11px] text-muted-foreground">
              <span>Frame {prog.frame.toLocaleString()} / {prog.frames.toLocaleString()}</span>
              <span>{prog.paused ? "Paused" : prog.speed ? `${prog.speed.toFixed(0)} frames/s` : "Starting…"}</span>
              <span className="text-right">{done ? "Done" : `About ${fmt(prog.eta)} left`}</span>
              <span>Elapsed {fmt(prog.elapsed)}</span>
              <span>{prog.bytes ? `${mb(prog.bytes)} written` : ""}</span>
              <span className="text-right">{prog.storage === "memory" ? "In memory" : prog.storage === "file" ? "Into the folder" : "To disk"}{heap ? ` · page ${Math.round(heap / 1e6)} MB` : ""}</span>
            </div>
            {prog.storage === "memory" && (r1 - r0) > 300 && (
              <p className="text-xs text-destructive">This browser won't let the studio write the file to disk as it goes, so it is built in memory. Videos longer than about five minutes can run out of memory here: split them into parts.</p>
            )}
          </div>
        )}
        {saved.length > 0 && (
          <ul className="mb-4 space-y-1 text-sm">
            {saved.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-2 rounded-md bg-secondary px-2 py-1">
                <span className="truncate">✓ {s.name} <span className="text-xs text-muted-foreground">{mb(s.bytes)}{s.blob ? "" : " · in the folder"}</span></span>
                {s.blob && <button onClick={() => downloadBlob(s.blob!, s.name)} className="shrink-0 text-xs text-primary hover:underline">Download again</button>}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          {busy && (
            <button onClick={() => setPaused((p) => !p)} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm">
              {paused ? <><Play className="h-3.5 w-3.5" /> Resume</> : <><Pause className="h-3.5 w-3.5" /> Pause</>}
            </button>
          )}
          {busy && <button onClick={() => abort.current?.abort()} className="rounded-md border border-border px-3 py-1.5 text-sm">Cancel</button>}
          {done ? (
            <button onClick={onClose} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">Done</button>
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
