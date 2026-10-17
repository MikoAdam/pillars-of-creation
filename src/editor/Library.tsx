import { useEffect, useState, type DragEvent } from "react";
import { FX_STYLES, sample, type TObj } from "@/lang/timeline";
import type { FxDrop } from "./Stage";

export const ELEMENTS: { label: string; cmd: string }[] = [
  { label: "Text", cmd: 'say "Your *big* idea" at {x} {y} enter pop' },
  { label: "Counter", cmd: 'count 100 label "Label" at {x} {y} over 1.5s enter rise' },
  { label: "Bar chart", cmd: 'bars "Title" "A" 30 "B" 70 "C" 50 at {x} {y} over 2s enter rise' },
  { label: "Line chart", cmd: 'line "Title" "2020" 1 "2021" 3 "2022" 2 "2023" 6 at {x} {y} over 2s enter blur' },
  { label: "Headline", cmd: 'headline "A headline worth reading" paper "THE DAILY" mark "worth" at {x} {y} over 2s enter drop' },
  { label: "Arrow", cmd: "arrow from {x} {y} to {x2} {y2} over 0.5s" },
  { label: "Circle", cmd: "circle at {x} {y} radius 100 over 0.6s" },
  { label: "Box", cmd: "box at {x} {y} size 300 180 over 0.6s" },
];

const TRANS: { label: string; cmd: string }[] = [
  { label: "Crossfade", cmd: "crossfade 0.6" },
  { label: "Whip pan", cmd: "whip 0.5" },
  { label: "Push up", cmd: "push 0.6" },
  { label: "Wipe", cmd: "wipe 0.6" },
  { label: "Blur", cmd: "blur 0.6" },
  { label: "Slide", cmd: "slide 0.6" },
  { label: "Zoom through", cmd: "zoom 0.6" },
  { label: "Hard cut", cmd: "cut" },
];

const CAMERA: { label: string; cmd: string }[] = [
  { label: "Push in", cmd: "camera zoom 1.3 over 3s ease smooth" },
  { label: "Snap zoom", cmd: "camera zoom 1.6 over 0.4s ease snap" },
  { label: "Pull out", cmd: "camera to 960 540 zoom 1 over 1.5s ease out" },
  { label: "Drift left", cmd: "camera to 860 540 over 4s ease linear" },
  { label: "Shake", cmd: "shake 24 over 0.5s" },
];

const nice = (s: string) => s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());

type Tab = "elements" | "animate" | "transitions" | "camera";

interface Props {
  selected: TObj | undefined;
  onInsertCenter: (cmd: string) => void;
  onInsert: (cmd: string) => void;
  onFx: (o: TObj, fx: FxDrop) => void;
  onNotice: (m: string) => void;
}

function Chip({ label, data, onClick, title }: { label: string; data: [string, string]; onClick: () => void; title: string }) {
  return (
    <button
      draggable
      onDragStart={(e: DragEvent) => { e.dataTransfer.setData(data[0], data[1]); e.dataTransfer.effectAllowed = "copy"; }}
      onClick={onClick}
      title={title}
      className="shrink-0 cursor-grab rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-foreground transition hover:border-primary hover:text-primary active:cursor-grabbing"
    >
      {label}
    </button>
  );
}

/** Drag-and-drop library. Every chip writes the same command you could type. */
export function Library(p: Props) {
  const [tab, setTab] = useState<Tab>("elements");
  const fx = (f: FxDrop) => () => (p.selected ? p.onFx(p.selected, f) : p.onNotice("Select an object first, or drag the animation onto it."));
  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-card px-2 py-1.5">
      <div className="flex shrink-0 rounded-lg bg-secondary p-0.5 text-xs">
        {(["elements", "animate", "transitions", "camera"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2 py-1 capitalize ${tab === t ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}>{t}</button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
        {tab === "elements" && ELEMENTS.map((e) => (
          <Chip key={e.label} label={e.label} data={["application/x-element", e.cmd]} onClick={() => p.onInsertCenter(e.cmd)} title="Drag onto the video, or click to add in the middle" />
        ))}
        {tab === "animate" && (
          <>
            <span className="shrink-0 text-[11px] text-muted-foreground">In</span>
            {FX_STYLES.map((s) => <Chip key={"i" + s} label={nice(s)} data={["application/x-fx", JSON.stringify({ kind: "enter", style: s })]} onClick={fx({ kind: "enter", style: s })} title="Entrance: drop onto an object" />)}
            <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">Out</span>
            {FX_STYLES.map((s) => <Chip key={"o" + s} label={nice(s)} data={["application/x-fx", JSON.stringify({ kind: "exit", style: s })]} onClick={fx({ kind: "exit", style: s })} title="Exit: drop onto an object" />)}
            <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">At playhead</span>
            <Chip label="Pulse" data={["application/x-fx", JSON.stringify({ kind: "pulse" })]} onClick={fx({ kind: "pulse" })} title="Quick emphasis pulse" />
            <Chip label="Wiggle" data={["application/x-fx", JSON.stringify({ kind: "wiggle" })]} onClick={fx({ kind: "wiggle" })} title="Attention wiggle" />
          </>
        )}
        {tab === "transitions" && TRANS.map((e) => (
          <Chip key={e.label} label={e.label} data={["application/x-cmd", e.cmd]} onClick={() => p.onInsert(e.cmd)} title="Ends the scene at the playhead: drag onto the video or click" />
        ))}
        {tab === "camera" && (
          <>
            {CAMERA.map((e) => <Chip key={e.label} label={e.label} data={["application/x-cmd", e.cmd]} onClick={() => p.onInsert(e.cmd)} title="Camera move at the playhead" />)}
            <span className="shrink-0 pl-1 text-[11px] text-muted-foreground">Tip: use the camera tool (K) to draw a frame on the video.</span>
          </>
        )}
      </div>
    </div>
  );
}

interface InspProps {
  o: TObj;
  t: number;
  onFx: (which: "enter" | "exit", style: string | null) => void;
  onRotate: (deg: number) => void;
  onOpacity: (v: number) => void;
  onPreviewOpacity: (v: number | undefined) => void;
}

/** Properties of the selected object. Each control edits the script. */
export function Inspector({ o, t, onFx, onRotate, onOpacity, onPreviewOpacity }: InspProps) {
  const rot = Math.round(sample(o.rot, t)[0]);
  const op = Math.round(sample(o.opacity, t)[0] * 100) / 100;
  const [r, setR] = useState(rot);
  const [a, setA] = useState(op);
  useEffect(() => setR(rot), [rot]);
  useEffect(() => setA(op), [op]);
  const sel = (which: "enter" | "exit", cur?: string) => (
    <select value={cur ?? ""} onChange={(e) => onFx(which, e.target.value || null)} className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-xs text-foreground">
      <option value="">{which === "enter" ? "No entrance" : "No exit"}</option>
      {FX_STYLES.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
    </select>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs">
      <span className="font-mono font-semibold text-primary">{o.id}</span>
      <label className="flex items-center gap-1.5 text-muted-foreground">In {sel("enter", o.enterFx?.style)}</label>
      <label className="flex items-center gap-1.5 text-muted-foreground">Out {sel("exit", o.exitFx?.style)}</label>
      <label className="flex items-center gap-1.5 text-muted-foreground">
        Rotate
        <input type="range" min={-180} max={180} value={r} onChange={(e) => setR(Number(e.target.value))}
          onPointerUp={() => r !== rot && onRotate(r)} onKeyUp={() => r !== rot && onRotate(r)} className="w-20 accent-primary" />
        <span className="w-8 font-mono">{r}°</span>
      </label>
      <label className="flex items-center gap-1.5 text-muted-foreground">
        Opacity
        <input type="range" min={0} max={1} step={0.05} value={a}
          onChange={(e) => { setA(Number(e.target.value)); onPreviewOpacity(Number(e.target.value)); }}
          onPointerUp={() => { onPreviewOpacity(undefined); if (a !== op) onOpacity(a); }}
          onKeyUp={() => { onPreviewOpacity(undefined); if (a !== op) onOpacity(a); }} className="w-20 accent-primary" />
        <span className="w-8 font-mono">{Math.round(a * 100)}%</span>
      </label>
    </div>
  );
}
