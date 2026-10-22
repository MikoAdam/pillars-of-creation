import { useEffect, useRef, useState, type PointerEvent as RPE } from "react";
import type { Span } from "@/lang/parser";
import type { ObjKind, Seg, Timeline, TObj } from "@/lang/timeline";

const NOUN: Partial<Record<ObjKind, string>> = {
  photo: "Photo", count: "Counter", bars: "Bar chart", line: "Line chart", headline: "Headline", say: "Text",
  arrow: "Arrow", circle: "Circle", box: "Box", highlight: "Highlight", map: "Map", pin: "Symbol", effect: "Symbol",
  bubble: "Bubble", label: "Label", tag: "Tag", attack: "Attack", route: "Line", year: "Year", legend: "Legend",
};

function labelOf(o: TObj) {
  if (o.locked && o.from && o.kind === "map") return `Map: ${o.from}`;
  const noun = NOUN[o.kind];
  if (!noun || o.id.replace(/\d+$/, "") !== o.kind) return o.id;
  const text = typeof o.data?.text === "string" ? o.data.text : typeof o.data?.label === "string" ? o.data.label : "";
  return text ? `${noun}: ${text.length > 24 ? text.slice(0, 23) + "…" : text}` : noun;
}

export interface StartInfo { base: number; delaySpan?: Span | undefined; hasDelay?: boolean | undefined; lineEnd: number }

interface Props {
  timeline: Timeline;
  t: number;
  selectedId: string | null;
  onSeek: (t: number) => void;
  onSelect: (id: string) => void;
  onOver: (span: Span, d: number) => void;
  onStart: (info: StartInfo, start: number) => void;
}

const DEFAULT_PX = 70;
const PX_MIN = 14;
const PX_MAX = 320;
const clampPx = (v: number) => Math.min(PX_MAX, Math.max(PX_MIN, v));
const LABEL_W = 112;
const ROW_H = 26;
const TICK_STEPS = [0.5, 1, 2, 5, 10, 30, 60];
const snap = (v: number) => Math.max(0.1, Math.round(v * 10) / 10);

export function TimelinePanel(p: Props) {
  const area = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(DEFAULT_PX);
  const [edge, setEdge] = useState<{ key: string; d: number; span: Span; startX: number; d0: number } | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [shift, setShift] = useState<{ key: string; t0: number; startX: number; nt: number; info: StartInfo } | null>(null);
  const shiftHandlers = (key: string, t0: number, info: StartInfo, sel: () => void) => ({
    onPointerDown: (e: RPE) => {
      e.stopPropagation(); sel();
      if (info.hasDelay && !info.delaySpan) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setShift({ key, t0, startX: e.clientX, nt: t0, info });
    },
    onPointerMove: (e: RPE) => {
      if (shift?.key !== key) return;
      setShift({ ...shift, nt: Math.max(shift.info.base, Math.round((shift.t0 + (e.clientX - shift.startX) / px) * 10) / 10) });
    },
    onPointerUp: () => {
      if (shift?.key === key && Math.abs(shift.nt - shift.t0) >= 0.05) p.onStart(shift.info, shift.nt);
      setShift(null);
    },
  });
  const objInfo = (o: TObj): StartInfo => ({ base: o.base, delaySpan: o.createSpans.delay, hasDelay: o.createSpans.hasDelay, lineEnd: o.createLineEnd });
  const tl = p.timeline;
  const width = Math.max(tl.duration * px + 80, 600);
  const step = TICK_STEPS.find((v) => v * px >= 56) ?? 60;
  const ticks = Array.from({ length: Math.floor(tl.duration / step) + 1 }, (_, i) => i * step);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setPx((v) => clampPx(v * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const x = p.t * px;
    if (x > el.scrollLeft + el.clientWidth - 60 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - LABEL_W - 40);
  }, [p.t, px]);

  const fit = () => {
    const el = wrap.current;
    if (el) setPx(clampPx((el.clientWidth - LABEL_W - 60) / Math.max(1, tl.duration)));
  };

  const timeAt = (clientX: number) => {
    const r = area.current!.getBoundingClientRect();
    return Math.min(tl.duration, Math.max(0, (clientX - r.left) / px));
  };

  // scene sections between transitions
  const bounds = [0, ...tl.transitions.map((x) => x.t), tl.duration];
  const scenes = bounds.slice(0, -1).map((s, i) => ({ s, e: bounds[i + 1], i })).filter((x) => x.e - x.s > 0.01);

  const segBlock = (o: string, seg: Seg, k: number, sel: () => void) => {
    const key = `${o}:${k}`;
    const d = edge?.key === key ? edge.d : seg.t1 - seg.t0;
    const left = shift?.key === key ? shift.nt : seg.t0;
    return (
      <div
        key={key}
        title={`${seg.label} · line ${seg.line + 1} · drag to move, drag the right edge to resize`}
        className={`absolute top-1 h-[18px] cursor-grab rounded-md border border-primary/60 bg-primary/30 text-[10px] leading-[16px] text-foreground ${shift?.key === key ? "ring-2 ring-primary" : ""}`}
        style={{ left: left * px, width: Math.max(4, d * px) }}
        {...shiftHandlers(key, seg.t0, seg, sel)}
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
            onPointerMove={(e) => { if (edge?.key === key) setEdge({ ...edge, d: snap(edge.d0 + (e.clientX - edge.startX) / px) }); }}
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
    <div ref={wrap} className="flex h-full min-h-0 overflow-auto bg-editor text-xs">
      <div className="sticky left-0 z-10 shrink-0 border-r border-border bg-editor" style={{ width: LABEL_W }}>
        <div className="flex h-6 items-center justify-between gap-1 border-b border-border px-1 text-muted-foreground">
          <button onClick={() => setPx((v) => clampPx(v / 1.25))} title="Zoom out (Ctrl + scroll)" className="rounded px-1.5 hover:bg-secondary hover:text-foreground">−</button>
          <button onClick={fit} title="Fit the whole video in view" className="rounded px-1 font-mono text-[10px] hover:bg-secondary hover:text-foreground">fit</button>
          <button onClick={() => setPx((v) => clampPx(v * 1.25))} title="Zoom in (Ctrl + scroll)" className="rounded px-1.5 hover:bg-secondary hover:text-foreground">+</button>
        </div>
        <div className="flex h-7 items-center border-b border-border px-2 text-muted-foreground">Scenes</div>
        {tl.objects.map((o) => (
          <button
            key={o.id}
            onClick={() => p.onSelect(o.id)}
            className={`block w-full truncate px-2 text-left font-mono ${o.id === p.selectedId ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            style={{ height: ROW_H }}
          >
            {labelOf(o)}
          </button>
        ))}
      </div>
      <div ref={area} className="relative" style={{ width }}>
        <div className="relative h-6 cursor-pointer border-b border-border" {...scrub}>
          {ticks.map((tk) => (
            <span key={tk} className="absolute top-0 h-full border-l border-border pl-1 font-mono text-[10px] text-muted-foreground" style={{ left: tk * px }}>{Number.isInteger(tk) ? tk : tk.toFixed(1)}s</span>
          ))}
        </div>
        <div className="relative h-7 border-b border-border" {...scrub}>
          {scenes.map((s) => (
            <div key={s.i} className="absolute top-1 h-5 truncate rounded-sm border border-border bg-secondary px-1.5 leading-[18px] text-muted-foreground" style={{ left: s.s * px + 1, width: (s.e - s.s) * px - 2 }}>
              Scene {s.i + 1}
            </div>
          ))}
        </div>
        {tl.objects.map((o) => {
          const segs = [...o.progress.segs, ...o.pos.segs, ...o.scale.segs, ...o.opacity.segs, ...o.rot.segs];
          return (
            <div key={o.id} className={`relative border-b border-border/50 ${o.id === p.selectedId ? "bg-primary/5" : ""}`} style={{ height: ROW_H }} onPointerDown={() => p.onSelect(o.id)}>
              <div
                title="Drag to change when this starts"
                className={`absolute top-[8px] h-2.5 cursor-grab rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 ${shift?.key === o.id + ":life" ? "ring-2 ring-primary" : ""}`}
                style={{ left: (shift?.key === o.id + ":life" ? shift.nt : o.start) * px, width: (o.end - o.start) * px }}
                {...shiftHandlers(o.id + ":life", o.start, objInfo(o), () => p.onSelect(o.id))}
              />
              {segs.map((s, k) => segBlock(o.id, s, k, () => p.onSelect(o.id)))}
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-y-0 w-px bg-primary" style={{ left: p.t * px }} />
      </div>
    </div>
  );
}
