import { useEffect, useRef, useState, type PointerEvent as RPE, type DragEvent } from "react";
import { renderTimeline, type Override } from "@/engine/renderTimeline";
import { alive, sample, toCanvas, toScene, worldBox, type TObj, type Timeline } from "@/lang/timeline";
import { HEIGHT, WIDTH, type Assets, type Theme } from "@/render/types";

export type Tool = "select" | "text" | "arrow" | "circle" | "box" | "highlight" | "camera";

export interface FxDrop { kind: "enter" | "exit" | "pulse" | "wiggle"; style?: string }

interface Props {
  timeline: Timeline;
  theme: Theme;
  assets: Assets;
  t: number;
  tool: Tool;
  selectedId: string | null;
  /** live opacity preview while a slider is dragged */
  previewOpacity?: number | undefined;
  onSelect: (id: string | null) => void;
  onMove: (o: TObj, x: number, y: number) => void;
  onScale: (o: TObj, s: number) => void;
  onRotate: (o: TObj, deg: number) => void;
  onInsert: (cmd: string) => void;
  onDropFiles: (files: File[]) => void;
  onDropAsset: (name: string) => void;
  onFx: (o: TObj, fx: FxDrop) => void;
  onNotice: (msg: string) => void;
}

const r10 = (v: number) => Math.round(v / 10) * 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Drag =
  | { kind: "move"; o: TObj; sx: number; sy: number; dx: number; dy: number }
  | { kind: "scale"; o: TObj; cx: number; cy: number; d0: number; mul: number }
  | { kind: "rotate"; o: TObj; cx: number; cy: number; a0: number; drot: number }
  | { kind: "pen"; x1: number; y1: number; x2: number; y2: number };

export function Stage(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [textAt, setTextAt] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal] = useState("");
  const [dropping, setDropping] = useState(false);
  const tl = p.timeline;

  const override: Override | undefined =
    drag?.kind === "move" ? { id: drag.o.id, dx: drag.dx, dy: drag.dy, scaleMul: 1 }
    : drag?.kind === "scale" ? { id: drag.o.id, dx: 0, dy: 0, scaleMul: drag.mul }
    : drag?.kind === "rotate" ? { id: drag.o.id, dx: 0, dy: 0, scaleMul: 1, drot: drag.drot }
    : p.previewOpacity !== undefined && p.selectedId ? { id: p.selectedId, dx: 0, dy: 0, scaleMul: 1, opacity: p.previewOpacity } : undefined;

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    renderTimeline(c.getContext("2d")!, tl, p.theme, p.assets, p.t, override);
  });

  /** canvas pixel coords + scene coords */
  const at = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * WIDTH, y = ((e.clientY - r.top) / r.height) * HEIGHT;
    const sc = toScene(tl, p.t, x, y);
    return { x, y, sx: sc.x, sy: sc.y, z: sc.z, k: WIDTH / r.width };
  };

  const selected = tl.objects.find((o) => o.id === p.selectedId && alive(o, p.t));

  const hit = (x: number, y: number) => {
    for (let i = tl.objects.length - 1; i >= 0; i--) {
      const o = tl.objects[i];
      if (!alive(o, p.t)) continue;
      const [bx, by, bw, bh] = worldBox(o, p.t);
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return o;
    }
    return null;
  };

  /** selection rectangle in canvas pixels */
  const canvasBox = (o: TObj) => {
    const [bx, by, bw, bh] = worldBox(o, p.t);
    const a = toCanvas(tl, p.t, bx, by);
    return [a.x, a.y, bw * a.z, bh * a.z];
  };

  const down = (e: RPE<HTMLDivElement>) => {
    if (textAt) return;
    const m = at(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (p.tool === "text") { setTextAt({ x: m.sx, y: m.sy }); setTextVal(""); return; }
    if (p.tool === "camera") { setDrag({ kind: "pen", x1: m.x, y1: m.y, x2: m.x, y2: m.y }); return; }
    if (p.tool !== "select") { setDrag({ kind: "pen", x1: m.sx, y1: m.sy, x2: m.sx, y2: m.sy }); return; }
    if (selected) {
      const [bx, by, bw, bh] = canvasBox(selected);
      const c = toCanvas(tl, p.t, ...(sample(selected.pos, p.t) as [number, number]));
      // rotate knob above the top edge
      if (Math.hypot(bx + bw / 2 - m.x, by - 36 * m.k - m.y) < 14 * m.k) {
        setDrag({ kind: "rotate", o: selected, cx: c.x, cy: c.y, a0: Math.atan2(m.y - c.y, m.x - c.x), drot: 0 });
        return;
      }
      const corners = [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]];
      if (corners.some(([cx, cy]) => Math.hypot(cx - m.x, cy - m.y) < 14 * m.k)) {
        setDrag({ kind: "scale", o: selected, cx: c.x, cy: c.y, d0: Math.max(1, Math.hypot(m.x - c.x, m.y - c.y)), mul: 1 });
        return;
      }
    }
    const o = hit(m.sx, m.sy);
    p.onSelect(o?.id ?? null);
    if (o) setDrag({ kind: "move", o, sx: m.sx, sy: m.sy, dx: 0, dy: 0 });
  };

  const moveP = (e: RPE<HTMLDivElement>) => {
    if (!drag) return;
    const m = at(e);
    if (drag.kind === "move") setDrag({ ...drag, dx: m.sx - drag.sx, dy: m.sy - drag.sy });
    else if (drag.kind === "scale") setDrag({ ...drag, mul: Math.max(0.05, Math.hypot(m.x - drag.cx, m.y - drag.cy) / drag.d0) });
    else if (drag.kind === "rotate") {
      let d = ((Math.atan2(m.y - drag.cy, m.x - drag.cx) - drag.a0) * 180) / Math.PI;
      if (e.shiftKey) d = Math.round(d / 15) * 15;
      setDrag({ ...drag, drot: d });
    } else if (p.tool === "camera") setDrag({ ...drag, x2: m.x, y2: m.y });
    else setDrag({ ...drag, x2: m.sx, y2: m.sy });
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
    } else if (d.kind === "rotate") {
      if (Math.abs(d.drot) < 1) return;
      p.onRotate(d.o, Math.round(sample(d.o.rot, p.t)[0] + d.drot));
    } else if (p.tool === "camera") {
      const w = Math.abs(d.x2 - d.x1), h = Math.abs(d.y2 - d.y1);
      if (Math.max(w, h) < 30) { p.onInsert("camera to 960 540 zoom 1 over 1s ease smooth"); return; }
      const a = toScene(tl, p.t, Math.min(d.x1, d.x2), Math.min(d.y1, d.y2));
      const b = toScene(tl, p.t, Math.max(d.x1, d.x2), Math.max(d.y1, d.y2));
      const z = r2(Math.min(8, Math.max(0.2, Math.min(WIDTH / (b.x - a.x), HEIGHT / (b.y - a.y)))));
      p.onInsert(`camera to ${r10((a.x + b.x) / 2)} ${r10((a.y + b.y) / 2)} zoom ${z} over 1s ease smooth`);
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
    if (v && textAt) p.onInsert(`say "${v}" at ${r10(textAt.x)} ${r10(textAt.y)} enter pop`);
    setTextAt(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropping(false);
    const m = at(e);
    const asset = e.dataTransfer.getData("application/x-asset");
    if (asset) return p.onDropAsset(asset);
    const el = e.dataTransfer.getData("application/x-element");
    if (el) {
      const v: Record<string, number> = { x: r10(m.sx), y: r10(m.sy), x2: r10(m.sx + 260), y2: r10(m.sy - 140) };
      return p.onInsert(el.replace(/\{(x2|y2|x|y)\}/g, (_s, k: string) => String(v[k])));
    }
    const cmd = e.dataTransfer.getData("application/x-cmd");
    if (cmd) return p.onInsert(cmd);
    const fx = e.dataTransfer.getData("application/x-fx");
    if (fx) {
      const o = hit(m.sx, m.sy);
      if (!o) return p.onNotice("Drop animations onto an object on the video.");
      p.onSelect(o.id);
      return p.onFx(o, JSON.parse(fx) as FxDrop);
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (files.length) p.onDropFiles(files);
  };

  // selection box in canvas coords, adjusted for live drag
  let sel: number[] | null = null;
  if (selected) {
    let [bx, by, bw, bh] = canvasBox(selected);
    const z = toCanvas(tl, p.t, 0, 0).z;
    if (drag?.kind === "move") { bx += drag.dx * z; by += drag.dy * z; }
    if (drag?.kind === "scale" && selected.kind !== "photo") {
      bx = drag.cx + (bx - drag.cx) * drag.mul; by = drag.cy + (by - drag.cy) * drag.mul; bw *= drag.mul; bh *= drag.mul;
    }
    sel = [bx, by, bw, bh];
  }
  const rotNow = selected ? sample(selected.rot, p.t)[0] + (drag?.kind === "rotate" ? drag.drot : 0) : 0;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const cursor = p.tool === "select" ? "default" : p.tool === "text" ? "text" : "crosshair";
  const penPts = drag?.kind === "pen" && p.tool !== "camera"
    ? (() => { const a = toCanvas(tl, p.t, drag.x1, drag.y1), b = toCanvas(tl, p.t, drag.x2, drag.y2); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; })()
    : drag?.kind === "pen" ? drag : null;

  return (
    <div
      ref={wrap}
      className={`relative aspect-video w-full overflow-hidden rounded-xl border bg-card shadow-2xl ${dropping ? "border-primary" : "border-border"}`}
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
        <div className="pointer-events-none absolute rounded-sm border-2 border-primary" style={{ left: pct(sel[0], WIDTH), top: pct(sel[1], HEIGHT), width: pct(sel[2], WIDTH), height: pct(sel[3], HEIGHT) }}>
          <span className="absolute -top-6 left-0 rounded-md bg-primary px-1.5 font-mono text-[11px] text-primary-foreground">
            {selected!.id}{Math.round(rotNow) ? ` · ${Math.round(rotNow)}°` : ""}
          </span>
          <span className="absolute left-1/2 top-[-36px] h-[34px] w-px bg-primary" />
          <span title="Drag to rotate (Shift snaps to 15°)" className="absolute left-1/2 top-[-42px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-primary bg-background" />
          {["-left-1.5 -top-1.5", "-right-1.5 -top-1.5", "-left-1.5 -bottom-1.5", "-right-1.5 -bottom-1.5"].map((c) => (
            <span key={c} className={`absolute h-3 w-3 rounded-full border-2 border-primary bg-background ${c}`} />
          ))}
        </div>
      )}
      {penPts && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <g className="stroke-primary" fill="none" strokeWidth={8} strokeDasharray="16 10">
            {(p.tool === "arrow" || p.tool === "highlight") && <line x1={penPts.x1} y1={penPts.y1} x2={penPts.x2} y2={penPts.y2} />}
            {p.tool === "circle" && <circle cx={penPts.x1} cy={penPts.y1} r={Math.hypot(penPts.x2 - penPts.x1, penPts.y2 - penPts.y1)} />}
            {(p.tool === "box" || p.tool === "camera") && <rect x={Math.min(penPts.x1, penPts.x2)} y={Math.min(penPts.y1, penPts.y2)} width={Math.abs(penPts.x2 - penPts.x1)} height={Math.abs(penPts.y2 - penPts.y1)} rx={p.tool === "camera" ? 16 : 0} />}
          </g>
          {p.tool === "camera" && <text x={Math.min(penPts.x1, penPts.x2) + 16} y={Math.min(penPts.y1, penPts.y2) + 44} className="fill-primary" fontSize={32} fontWeight={600}>Camera frame</text>}
        </svg>
      )}
      {textAt && (() => {
        const c = toCanvas(tl, p.t, textAt.x, textAt.y);
        return (
          <input
            autoFocus
            value={textVal}
            onChange={(e) => setTextVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") setTextAt(null); }}
            onBlur={commitText}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Type, then Enter"
            className="absolute w-64 -translate-x-1/2 -translate-y-1/2 rounded-md border border-primary bg-popover px-2 py-1 text-sm outline-none"
            style={{ left: pct(c.x, WIDTH), top: pct(c.y, HEIGHT) }}
          />
        );
      })()}
      {dropping && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10 text-sm font-medium text-primary">Drop to add at the playhead</div>
      )}
    </div>
  );
}
