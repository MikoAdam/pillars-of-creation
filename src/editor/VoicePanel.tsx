import { useRef } from "react";
import { Mic, Captions } from "lucide-react";
import type { AudioItem } from "./audioStore";

interface Props {
  voices: AudioItem[];
  active?: string | undefined;
  status: string | null;
  progress: number | null;
  onUpload: (f: File) => void;
  onUse: (name: string) => void;
  onSubtitles: (name: string) => void;
  onRemove: (name: string) => void;
}

export function VoicePanel({ voices, active, status, progress, onUpload, onUse, onSubtitles, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="border-b border-border p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Voiceover</span>
        <button onClick={() => input.current?.click()} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Mic className="h-3 w-3" /> Upload audio
        </button>
        <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
      </div>
      {voices.length === 0 && !status && <p className="text-[11px] text-muted-foreground">Upload a narration. Subtitles are written into the script automatically.</p>}
      <div className="flex flex-col gap-1">
        {voices.map((v) => (
          <div key={v.name} className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${active === v.name ? "border-primary" : "border-border"}`}>
            <button onClick={() => onUse(v.name)} title="Use as the voiceover" className="min-w-0 flex-1 truncate text-left font-mono">@{v.name}{active === v.name && " · playing with video"}</button>
            <button onClick={() => onSubtitles(v.name)} title="Make subtitles from this audio" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Captions className="h-3 w-3" /> Subtitles</button>
            <button onClick={() => onRemove(v.name)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
        ))}
      </div>
      {status && <p className="mt-1 text-[11px] text-primary">{status}</p>}
      {progress !== null && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.min(100, Math.max(2, progress))}%` }} />
        </div>
      )}
    </div>
  );
}
