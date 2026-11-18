import { useRef } from "react";
import { Mic, Captions, Music, Copy } from "lucide-react";
import type { AudioItem } from "./audioStore";

interface Props {
  voices: AudioItem[];
  active?: string | undefined;
  activeMusic?: string | undefined;
  status: string | null;
  progress: number | null;
  onUpload: (f: File) => void;
  onUploadMusic: (f: File) => void;
  onMusic: (name: string) => void;
  onUse: (name: string) => void;
  onSubtitles: (name: string) => void;
  onRemove: (name: string) => void;
  /** placeholder narration in the script: how many lines and how long they take */
  narration?: { lines: number; seconds: number } | undefined;
  onCopyNarration?: () => void;
}

export function VoicePanel({ voices, active, activeMusic, status, progress, onUpload, onUploadMusic, onUse, onMusic, onSubtitles, onRemove, narration, onCopyNarration }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Audio</span>
        <span className="flex items-center gap-1">
          <button onClick={() => input.current?.click()} title="Upload a narration: it becomes the voiceover and is transcribed into subtitles" className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
            <Mic className="h-3 w-3" /> Narration
          </button>
          <button onClick={() => musicInput.current?.click()} title="Upload music: it loops quietly under the whole video" className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
            <Music className="h-3 w-3" /> Music
          </button>
        </span>
        <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
        <input ref={musicInput} type="file" accept="audio/*" hidden data-role="music" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadMusic(f); e.target.value = ""; }} />
      </div>
      {voices.length === 0 && !status && <p className="text-[11px] text-muted-foreground">Narration is transcribed into subtitles automatically. Music loops under the video.</p>}
      <div className="flex flex-col gap-1">
        {voices.map((v) => (
          <div key={v.name} className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${active === v.name ? "border-primary" : "border-border"}`}>
            <button onClick={() => onUse(v.name)} title="Use as the voiceover" className="min-w-0 flex-1 truncate text-left font-mono">@{v.name}{active === v.name && " · voiceover"}{activeMusic === v.name && " · music"}</button>
            <button onClick={() => onMusic(v.name)} title="Use as background music" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Music className="h-3 w-3" /> Music</button>
            <button onClick={() => onSubtitles(v.name)} title="Make subtitles from this audio" className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Captions className="h-3 w-3" /> Subtitles</button>
            <button onClick={() => onRemove(v.name)} className="text-muted-foreground hover:text-foreground">✕</button>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-md border border-border p-2 text-[11px] leading-snug text-muted-foreground">
        <div className="mb-1 font-semibold text-foreground">Placeholder voice</div>
        {narration?.lines
          ? <>
              {narration.lines} <span className="font-mono">narrate</span> line{narration.lines === 1 ? "" : "s"}, {Math.round(narration.seconds)} s in all.{" "}
              {active ? "Your recording plays instead." : "Your browser's built-in voice reads them in the preview, at the pace the script is timed to. It is not in the exported file."}
              {onCopyNarration && (
                <button onClick={onCopyNarration} className="mt-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-foreground hover:bg-secondary">
                  <Copy className="h-3 w-3" /> Copy the narration to record it
                </button>
              )}
            </>
          : <>Write <span className="font-mono">narrate "…"</span> lines (or ask the AI to) and a machine voice reads them in the preview, so you can judge the timing before recording.</>}
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
