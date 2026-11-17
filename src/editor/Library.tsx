import { useEffect, useState } from "react";
import { FX_STYLES, sample, type TObj } from "@/lang/timeline";
import { MAP_COLORS, MAP_COLOR_NAMES } from "@/render/geo";

const nice = (s: string) => s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());

interface InspProps {
  o: TObj;
  t: number;
  onFx: (which: "enter" | "exit", style: string | null) => void;
  onRotate: (deg: number) => void;
  onOpacity: (v: number) => void;
  onPreviewOpacity: (v: number | undefined) => void;
  /** map markers / arrows only: recolour in place */
  onColor?: ((c: string) => void) | undefined;
}

/** Properties of the selected object. Each control edits the script. */
export function Inspector({ o, t, onFx, onRotate, onOpacity, onPreviewOpacity, onColor }: InspProps) {
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
      {onColor && (
        <label className="flex items-center gap-1 text-muted-foreground" title="Recolour (edits the script line)">
          Colour
          <span className="flex items-center gap-0.5">
            {MAP_COLOR_NAMES.map((c) => (
              <button
                key={c}
                onClick={() => onColor(c)}
                title={c}
                className="h-3.5 w-3.5 rounded-full border border-border"
                style={{ background: MAP_COLORS[c] }}
              />
            ))}
          </span>
        </label>
      )}
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

export function MapLocked({ name, onEdit }: { name: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-xs">
      <span className="text-muted-foreground">
        <span className="font-semibold text-foreground">Map: {name || "unnamed"}</span> plays from its own script. Change it in the map tool.
      </span>
      <button onClick={onEdit} disabled={!name} className="shrink-0 rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground disabled:opacity-50">Edit map</button>
    </div>
  );
}
