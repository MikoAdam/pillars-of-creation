import { useEffect, useRef, useState, type PointerEvent as RPE, type DragEvent } from "react";
import { renderTimeline, type Override } from "@/engine/renderTimeline";
import { alive, sample, worldBox, type TObj, type Timeline } from "@/lang/timeline";
import { HEIGHT, WIDTH, type Assets, type Theme } from "@/render/types";

export type Tool = "select" | "text" | "arrow" | "circle" | "box" | "highlight";

interface Props {
  timeline: Timeline;
  theme: Theme;
  assets: Assets;
  t: number;
  tool: Tool;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (o: TObj, x: number, y: number) => void;
  onScale: (o: TObj, s: number) => void;
  onInsert: (cmd: string) => void;
  onDropFiles: (files: File[]) => void;
  onDropAsset: (name: string) => void;
}

const r10 = (v: number) => Math.round(v / 10) * 10;

type Drag =
  | { kind: "move"; o: TObj; sx: number; sy: number; dx: number; dy: number }
  | { kind: "scale"; o: TObj; cx: number; cy: number; d0: number; mul: number }
  | { kind: "pen"; x1: number; y1: number; x2: number; y2: number };

export function Stage(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal] = useState("");
  const [dropping, setDropping] = useState(false);

  const override: Override | undefined =
    drag?.kind === "move" ? { id: drag.o.id, dx: drag.dx, dy: drag.dy, scaleMul: 1 }
    : drag?.kind === "scale" ? { id: drag.o.id, dx: 0, dy: 0, scaleMul: drag.mul } : undefined;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    renderTimeline(c.getContext("2d")!, p.timeline, p.theme, p.assets, p.t, override);
  });

  const toWorld = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * WIDTH, y: ((e.clientY - r.top) / r.height) * HEIGHT, k: WIDTH / r.width };
  };

  const selected = p.timeline.objects.find((o) => o.id === p.selectedId && alive(o, p.t));

  const hit = (x: number, y: number) => {
    for (let i = p.timeline.objects.length - 1; i >= 0; i--) {
      const o = p.timeline.objects[i];
      if (!alive(o, p.t)) continue;
      const [bx, by, bw, bh] = worldBox(o, p.t);
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return o;
    }
    return null;
  };

  const down = (e: RPE<HTMLDivElement>) => {
    if (textAt) return;
    const { x, y, k } = toWorld(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (p.tool === "text") { setTextAt({ x, y }); setTextVal(""); return; }
    if (p.tool !== "select") { setDrag({ kind: "pen", x1: x, y1: y, x2: x, y2: y }); return; }
    if (selected) {
      const [bx, by, bw, bh] = worldBox(selected, p.t);
      const corners = [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]];
      if (corners.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 14 * k)) {
        const [px, py] = sample(selected.pos, p.t);
        setDrag({ kind: "scale", o: selected, cx: px, cy: py, d0: Math.max(1, Math.hypot(x - px, y - py)), mul: 1 });
        return;
      }
    }
    const o = hit(x, y);
    p.onSelect(o?.id ?? null);
    if (o) setDrag({ kind: "move", o, sx: x, sy: y, dx: 0, dy: 0 });
  };

  const moveP = (e: RPE<HTMLDivElement>) => {
    if (!drag) return;
    const { x, y } = toWorld(e);
    if (drag.kind === "move") setDrag({ ...drag, dx: x - drag.sx, dy: y - drag.sy });
    else if (drag.kind === "scale") setDrag({ ...drag, mul: Math.max(0.05, Math.hypot(x - drag.cx, y - drag.cy) / drag.d0) });
    else setDrag({ ...drag, x2: x, y2: y });
  };

  const up = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "move") {
      if (Math.hypot(d.dx, d.dy) < 3) return;
      const [px, py] = sample(d.o.pos, p.t);
      p.onMove(d.o, px + d.dx, py + d.dy);
    } else if (d.kind === "scale") {
      if (Math.abs(d.mul - 1) < 0.01) return;
      p.onScale(d.o, sample(d.o.scale, p.t)[0] * d.mul);
    } else {
      const x1 = r10(d.x1), y1 = r10(d.y1), x2 = r10(d.x2), y2 = r10(d.y2);
      if (Math.hypot(x2 - x1, y2 - y1) < 15) return;
      if (p.tool === "arrow") p.onInsert(`arrow from ${x1} ${y1} to ${x2} ${y2} over 0.5s`);
      if (p.tool === "highlight") p.onInsert(`highlight from ${x1} ${y1} to ${x2} ${y2} over 0.5s`);
      if (p.tool === "circle") p.onInsert(`circle at ${x1} ${y1} radius ${r10(Math.hypot(x2 - x1, y2 - y1))} over 0.5s`);
      if (p.tool === "box") p.onInsert(`box at ${Math.min(x1, x2)} ${Math.min(y1, y2)} size ${Math.abs(x2 - x1)} ${Math.abs(y2 - y1)} over 0.5s`);
    }
  };

  const commitText = () => {
    const v = textVal.trim().replace(/"/g, "'");
    if (v && textAt) p.onInsert(`say "${v}" at ${r10(textAt.x)} ${r10(textAt.y)}`);
    setTextAt(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const asset = e.dataTransfer.getData("application/x-asset");
    if (asset) return p.onDropAsset(asset);
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (files.length) p.onDropFiles(files);
  };

  // selection box in world coords, adjusted for live drag
  let sel: number[] | null = null;
  if (selected) {
    let [bx, by, bw, bh] = worldBox(selected, p.t);
    if (drag?.kind === "move") { bx += drag.dx; by += drag.dy; }
    if (drag?.kind === "scale" && selected.kind !== "photo") {
      bx = drag.cx + (bx - drag.cx) * drag.mul; by = drag.cy + (by - drag.cy) * drag.mul; bw *= drag.mul; bh *= drag.mul;
    }
    sel = [bx, by, bw, bh];
  }
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const cursor = p.tool === "select" ? "default" : p.tool === "text" ? "text" : "crosshair";

  return (
    <div
      ref={wrap}
      className={`relative aspect-video w-full overflow-hidden rounded-md border bg-card shadow-2xl ${dropping ? "border-primary" : "border-border"}`}
      style={{ cursor, touchAction: "none" }}
      onPointerDown={down}
      onPointerMove={moveP}
      onPointerUp={up}
      onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <canvas ref={canvas} width={WIDTH} height={HEIGHT} className="block h-full w-full" />
      {sel && (
        <div className="pointer-events-none absolute border-2 border-primary" style={{ left: pct(sel[0], WIDTH), top: pct(sel[1], HEIGHT), width: pct(sel[2], WIDTH), height: pct(sel[3], HEIGHT) }}>
          <span className="absolute -top-6 left-0 rounded-sm bg-primary px-1.5 font-mono text-[11px] text-primary-foreground">{selected!.id}</span>
          {["-left-1.5 -top-1.5", "-right-1.5 -top-1.5", "-left-1.5 -bottom-1.5", "-right-1.5 -bottom-1.5"].map((c) => (
            <span key={c} className={`absolute h-3 w-3 border-2 border-primary bg-background ${c}`} />
          ))}
        </div>
      )}
      {drag?.kind === "pen" && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <g className="stroke-primary" fill="none" strokeWidth={8} strokeDasharray="16 10">
            {(p.tool === "arrow" || p.tool === "highlight") && <line x1={drag.x1} y1={drag.y1} x2={drag.x2} y2={drag.y2} />}
            {p.tool === "circle" && <circle cx={drag.x1} cy={drag.y1} r={Math.hypot(drag.x2 - drag.x1, drag.y2 - drag.y1)} />}
            {p.tool === "box" && <rect x={Math.min(drag.x1, drag.x2)} y={Math.min(drag.y1, drag.y2)} width={Math.abs(drag.x2 - drag.x1)} height={Math.abs(drag.y2 - drag.y1)} />}
          </g>
        </svg>
      )}
      {textAt && (
        <input
          autoFocus
          value={textVal}
          onChange={(e) => setTextVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextAt(null); }}
          onBlur={commitText}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Type, then Enter"
          className="absolute w-64 -translate-x-1/2 -translate-y-1/2 rounded-md border border-primary bg-popover px-2 py-1 text-sm outline-none"
          style={{ left: pct(textAt.x, WIDTH), top: pct(textAt.y, HEIGHT) }}
        />
      )}
      {dropping && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 text-sm font-medium text-primary">Drop to add a photo at the playhead</div>
      )}
    </div>
  );
}
