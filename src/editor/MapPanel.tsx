import { useEffect, useState } from "react";
import { mapCamAt, type TObj } from "@/lang/timeline";

type Key = "zoom" | "tilt" | "turn";

/** Map camera controls for the selected map. Each slider edits the script on release. */
export function MapInspector({ o, t, onSet }: { o: TObj; t: number; onSet: (k: Key, v: number) => void }) {
  const cam = mapCamAt(o, t);
  const cur: Record<Key, number> = { zoom: Math.round(cam.zoom * 10) / 10, tilt: Math.round(cam.tilt), turn: Math.round(cam.turn) };
  const [v, setV] = useState(cur);
  useEffect(() => setV(cur), [cur.zoom, cur.tilt, cur.turn]); // eslint-disable-line react-hooks/exhaustive-deps
  const row = (k: Key, label: string, min: number, max: number, step: number, unit = "") => (
    <label className="flex items-center gap-1.5 text-muted-foreground">
      {label}
      <input type="range" min={min} max={max} step={step} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
        onPointerUp={() => v[k] !== cur[k] && onSet(k, v[k])} onKeyUp={() => v[k] !== cur[k] && onSet(k, v[k])} className="w-24 accent-primary" />
      <span className="w-10 font-mono">{v[k]}{unit}</span>
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs">
      <span className="font-mono font-semibold text-primary">{o.id}</span>
      {row("zoom", "Zoom", 0.5, 10, 0.1)}
      {row("tilt", "Tilt", 0, 60, 1, "°")}
      {row("turn", "Turn", -180, 180, 1, "°")}
      <span className="text-muted-foreground">Drag the map to pan · corners zoom · knob turns</span>
    </div>
  );
}
