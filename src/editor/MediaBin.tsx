import { useRef } from "react";
import { Upload } from "lucide-react";
import type { MediaItem } from "./assets";

interface Props {
  media: MediaItem[];
  onUpload: (files: File[]) => void;
  onInsert: (name: string) => void;
  onRemove: (name: string) => void;
}

export function MediaBin({ media, onUpload, onInsert, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="border-b border-border p-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Media</span>
        <button onClick={() => input.current?.click()} className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Upload className="h-3 w-3" /> Upload
        </button>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { onUpload([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {media.map((m) => (
          <div key={m.name} className="group relative shrink-0">
            <button
              draggable
              onDragStart={(e) => e.dataTransfer.setData("application/x-asset", m.name)}
              onClick={() => onInsert(m.name)}
              title={`Click or drag to add @${m.name} at the playhead`}
              className="block w-24 overflow-hidden rounded border border-border hover:border-primary"
            >
              <img src={m.src} alt={m.name} className="aspect-video w-full object-cover" />
              <div className="truncate px-1 text-left font-mono text-[10px] text-muted-foreground">@{m.name}</div>
            </button>
            {!m.builtin && (
              <button onClick={() => onRemove(m.name)} className="absolute right-0.5 top-0.5 hidden rounded bg-background/80 px-1 text-[10px] group-hover:block">✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
