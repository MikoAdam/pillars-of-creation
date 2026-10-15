import { useRef, useState, type PointerEvent as RPE } from "react";
import type { Span } from "@/lang/parser";
import type { Seg, Timeline } from "@/lang/timeline";

interface Props {
  timeline: Timeline;
  t: number;
  selectedId: string | null;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  onOver: (span: Span, d: number) => void;
}

const PX = 70;
const LABEL_W = 112;
const ROW_H = 26;
const snap = (v: number) => Math.max(0.1, Math.round(v * 10) / 10);

export function TimelinePanel(p: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<{ key: string; d: number; span: Span; startX: number; d0: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const tl = p.timeline;
  const width = Math.max(tl.duration * PX + 80, 600);

  const timeAt = (clientX: number) => {
    const r = area.current!.getBoundingClientRect();
    return Math.min(tl.duration, Math.max(0, (clientX - r.left) / PX));
  };

  // scene sections between transitions
  const bounds = [0, ...tl.transitions.map((x) => x.t), tl.duration];
  const scenes = bounds.slice(0, -1).map((s, i) => ({ s, e: bounds[i + 1], i })).filter((x) => x.e - x.s > 0.01);

  const segBlock = (o: string, seg: Seg, k: number) => {
    const key = `${o}:${k}`;
    const d = edge?.key === key ? edge.d : seg.t1 - seg.t0;
    return (
      <div
        key={key}
        title={`${seg.label} · line ${seg.line + 1}`}
        className="absolute top-1 h-[18px] rounded-sm border border-primary/60 bg-primary/30 text-[10px] leading-[16px] text-foreground"
        style={{ left: seg.t0 * PX, width: Math.max(4, d * PX) }}
      >
        <span className="pointer-events-none truncate px-1">{seg.label} {Math.round(d * 10) / 10}s</span>
        {seg.overSpan && (
          <span
            className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize rounded-sm bg-primary"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setEdge({ key, d: seg.t1 - seg.t0, span: seg.overSpan!, startX: e.clientX, d0: seg.t1 - seg.t0 });
            }}
            onPointerMove={(e) => { if (edge?.key === key) setEdge({ ...edge, d: snap(edge.d0 + (e.clientX - edge.startX) / PX) }); }}
            onPointerUp={() => {
              if (edge?.key === key && Math.abs(edge.d - edge.d0) >= 0.05) p.onOver(edge.span, edge.d);
              setEdge(null);
            }}
          />
        )}
      </div>
    );
  };

  const scrub = {
    onPointerDown: (e: RPE) => { setScrubbing(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); p.onSeek(timeAt(e.clientX)); },
    onPointerMove: (e: RPE) => { if (scrubbing) p.onSeek(timeAt(e.clientX)); },
    onPointerUp: () => setScrubbing(false),
  };

  return (
    <div className="flex h-full min-h-0 overflow-auto bg-editor text-xs">
      <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-editor" style={{ width: LABEL_W }}>
        <div className="h-6 border-b border-border" />
        <div className="flex h-7 items-center border-b border-border px-2 text-muted-foreground">Scenes</div>
        {tl.objects.map((o) => (
          <button
            key={o.id}
            onClick={() => p.onSelect(o.id)}
            className={`block w-full truncate px-2 text-left font-mono ${o.id === p.selectedId ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            style={{ height: ROW_H }}
          >
            {o.id}
          </button>
        ))}
      </div>
      <div ref={area} className="relative" style={{ width }}>
        <div className="relative h-6 cursor-pointer border-b border-border" {...scrub}>
          {Array.from({ length: Math.ceil(tl.duration) + 1 }, (_, i) => (
            <span key={i} className="absolute top-0 h-full border-l border-border pl-1 font-mono text-[10px] text-muted-foreground" style={{ left: i * PX }}>{i}s</span>
          ))}
        </div>
        <div className="relative h-7 border-b border-border" {...scrub}>
          {scenes.map((s) => (
            <div key={s.i} className="absolute top-1 h-5 truncate rounded-sm border border-border bg-secondary px-1.5 leading-[18px] text-muted-foreground" style={{ left: s.s * PX + 1, width: (s.e - s.s) * PX - 2 }}>
              Scene {s.i + 1}
            </div>
          ))}
        </div>
        {tl.objects.map((o) => {
          const segs = [...o.progress.segs, ...o.pos.segs, ...o.scale.segs, ...o.opacity.segs];
          return (
            <div key={o.id} className={`relative border-b border-border/50 ${o.id === p.selectedId ? "bg-primary/5" : ""}`} style={{ height: ROW_H }} onPointerDown={() => p.onSelect(o.id)}>
              <div className="absolute top-[11px] h-1 rounded-full bg-muted-foreground/30" style={{ left: o.start * PX, width: (o.end - o.start) * PX }} />
              {segs.map((s, k) => segBlock(o.id, s, k))}
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: p.t * PX }} />
      </div>
    </div>
  );
}
