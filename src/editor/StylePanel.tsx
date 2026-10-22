import { useEffect, useRef, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { Theme } from "@/render/types";
import { FONT_CHOICES } from "@/render/theme";

interface Props {
  /** theme defaults (before overrides) */
  base: Theme;
  /** theme with overrides applied */
  theme: Theme;
  overridden: Set<string>;
  onSet: (key: string, valueText: string) => void;
  onReset: (key: string) => void;
}

/** Look settings. Every change writes a `style` line in the script. */
export function StylePanel({ base, theme, overridden, onSet, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  const Reset = ({ k }: { k: string }) =>
    overridden.has(k) ? (
      <button onClick={() => onReset(k)} title="Back to the look's default" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    ) : <span className="w-[22px]" />;

  const Row = ({ label, k, children }: { label: string; k: string; children: React.ReactNode }) => (
    <div className="flex items-center gap-2">
      <span className={`w-24 text-xs ${overridden.has(k) ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
      <Reset k={k} />
    </div>
  );

  const color = (k: "background" | "text" | "accent", label: string) => (
    <Row label={label} k={k}>
      <input type="color" value={theme.colors[k]} onChange={(e) => onSet(k, `"${e.target.value}"`)} className="h-7 w-10 cursor-pointer rounded border border-border bg-transparent" />
      <span className="font-mono text-xs text-muted-foreground">{theme.colors[k]}</span>
    </Row>
  );

  const font = (k: "display" | "body", label: string) => (
    <Row label={label} k={k}>
      <select value={theme.fonts[k]} onChange={(e) => onSet(k, `"${e.target.value}"`)} className="w-full rounded-md border border-border bg-secondary px-2 py-1 text-xs text-foreground">
        {FONT_CHOICES.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
      </select>
    </Row>
  );

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} title="Adjust this look" className={`flex items-center gap-1.5 rounded-md border border-border px-2 py-1 ${open ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
        <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust
        {overridden.size > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{overridden.size}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-80 space-y-2.5 rounded-lg border border-border bg-card p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{base.name}</p>
            {overridden.size > 0 && (
              <button onClick={() => [...overridden].forEach(onReset)} className="text-xs text-muted-foreground hover:text-foreground">Reset all</button>
            )}
          </div>
          {color("background", "Background")}
          {color("text", "Text")}
          {color("accent", "Accent")}
          {font("display", "Headings")}
          {font("body", "Body text")}
          <Row label="Headings caps" k="caps">
            <button onClick={() => onSet("caps", theme.fonts.displayUpper ? "off" : "on")} className={`rounded-md border border-border px-2 py-0.5 text-xs ${theme.fonts.displayUpper ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
              {theme.fonts.displayUpper ? "ON" : "Off"}
            </button>
          </Row>
          <Row label={`Corners ${theme.radius ?? 0}`} k="radius">
            <input type="range" min={0} max={48} step={2} value={theme.radius ?? 0} onChange={(e) => onSet("radius", e.target.value)} className="w-full accent-primary" />
          </Row>
          <Row label={`Grain ${Math.round(theme.grain * 100)}%`} k="grain">
            <input type="range" min={0} max={0.15} step={0.01} value={theme.grain} onChange={(e) => onSet("grain", String(Number(e.target.value)))} className="w-full accent-primary" />
          </Row>
          <p className="pt-1 text-[11px] leading-snug text-muted-foreground">Changes appear as <span className="font-mono">style</span> lines in your script. Picking another look keeps them.</p>
        </div>
      )}
    </div>
  );
}
