import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Plus, Shapes, Sparkles, AudioLines, Map as MapIcon, Upload, Search, Maximize2, Move, Pencil } from "lucide-react";
import { FX_STYLES, type TObj } from "@/lang/timeline";
import { EFFECTS } from "@/render/effectsSymbols";
import type { FxDrop } from "./Stage";
import type { MediaItem } from "./assets";

export type PanelId = "add" | "assets" | "motion" | "audio" | "maps";

/** Everything the Add panel offers. {x} {y} become the drop point (or the centre on click). */
const ELEMENTS: { label: string; hint: string; cmd: string }[] = [
  { label: "Title card", hint: "Big heading with a line under it", cmd: 'title "A *big* idea" sub "and the line under it" at {x} {y}' },
  { label: "Lower third", hint: "Name plate, bottom left", cmd: 'lower "Jane Doe" "Astrophysicist"' },
  { label: "Quote", hint: "Words and who said them", cmd: 'quote "Something worth *remembering*" by "Who said it" at {x} {y}' },
  { label: "Text", hint: "Kinetic words, *stars* in colour", cmd: 'say "Your *big* idea" at {x} {y} enter pop' },
  { label: "Counter", hint: "A number that counts up", cmd: 'count 100 label "Label" at {x} {y} over 1.5s enter rise' },
  { label: "Bar chart", hint: "Bars that grow in", cmd: 'bars "Title" "A" 30 "B" 70 "C" 50 at {x} {y} over 2s enter rise' },
  { label: "Line chart", hint: "A line that draws itself", cmd: 'line "Title" "2020" 1 "2021" 3 "2022" 2 "2023" 6 at {x} {y} over 2s enter blur' },
  { label: "Headline", hint: "Newspaper with a highlighter", cmd: 'headline "A headline worth reading" paper "THE DAILY" mark "worth" at {x} {y} over 2s enter drop' },
  { label: "End credits", hint: "Roles and names that roll up", cmd: 'credits "Thanks for watching" "Script" "Your name" "Music" "Composer" over 8s' },
  { label: "Arrow", hint: "Points at something", cmd: "arrow from {x} {y} to {x2} {y2} over 0.5s" },
  { label: "Circle", hint: "Rings something", cmd: "circle at {x} {y} radius 100 over 0.6s" },
  { label: "Box", hint: "Frames something", cmd: "box at {x} {y} size 300 180 over 0.6s" },
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
];

const CATEGORY: Record<string, string> = { combat: "Conflict", military: "Military", resources: "Economy", political: "Politics" };

const nice = (s: string) => s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());

const drag = (data: [string, string]) => (e: DragEvent) => { e.dataTransfer.setData(data[0], data[1]); e.dataTransfer.effectAllowed = "copy"; };

function Chip({ label, data, onClick, title }: { label: string; data: [string, string]; onClick: () => void; title: string }) {
  return (
    <button
      draggable
      onDragStart={drag(data)}
      onClick={onClick}
      title={title}
      className="cursor-grab rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-foreground transition hover:border-primary hover:text-primary active:cursor-grabbing"
    >
      {label}
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {hint && <p className="mb-2 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

/** One library icon, drawn from the same paths the video uses. */
export function IconGlyph({ name, className }: { name: string; className?: string }) {
  const d = EFFECTS[name];
  if (!d) return null;
  return (
    <svg viewBox={`0 0 ${d.vb[0]} ${d.vb[1]}`} className={className} aria-hidden>
      {d.paths.map((p, i) => d.stroked
        ? <path key={i} d={p} fill="none" stroke="currentColor" strokeWidth={d.sw} strokeLinecap="round" strokeLinejoin="round" />
        : <path key={i} d={p} fill="currentColor" />)}
    </svg>
  );
}

interface Props {
  panel: PanelId | null;
  onPanel: (p: PanelId | null) => void;
  selected: TObj | undefined;
  onInsert: (cmd: string) => void;
  /** a command with {x} {y} placeholders, placed in the middle of the frame */
  onInsertCenter: (cmd: string) => void;
  onFx: (o: TObj, fx: FxDrop) => void;
  onNotice: (m: string) => void;
  media: MediaItem[];
  onUpload: (files: File[]) => void;
  onPhoto: (name: string) => void;
  onRemoveMedia: (name: string) => void;
  maps: string[];
  mapsInVideo: Set<string>;
  onNewMap: () => void;
  onEditMap: (name: string) => void;
  onAddMap: (name: string) => void;
  audio: ReactNode;
}

const RAIL: { id: PanelId; label: string; icon: typeof Plus }[] = [
  { id: "add", label: "Add", icon: Plus },
  { id: "assets", label: "Assets", icon: Shapes },
  { id: "motion", label: "Motion", icon: Sparkles },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "maps", label: "Maps", icon: MapIcon },
];

/** The left side of the studio: a rail of panels. Everything in them writes the same command you could type. */
export function SidePanel(p: Props) {
  return (
    <div className="flex min-h-0 shrink-0 border-r border-border">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border py-2">
        {RAIL.map((r) => (
          <button
            key={r.id}
            onClick={() => p.onPanel(p.panel === r.id ? null : r.id)}
            title={p.panel === r.id ? `Hide ${r.label}` : r.label}
            className={`flex w-14 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-medium ${p.panel === r.id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}
          >
            <r.icon className="h-[18px] w-[18px]" />
            {r.label}
          </button>
        ))}
      </nav>
      {p.panel && (
        <div className="min-h-0 w-[264px] overflow-y-auto p-3 xl:w-[300px]">
          {p.panel === "add" && <AddPanel {...p} />}
          {p.panel === "assets" && <AssetsPanel {...p} />}
          {p.panel === "motion" && <MotionPanel {...p} />}
          {p.panel === "audio" && <Section title="Audio" hint="Narration becomes the voiceover and is turned into subtitles on this computer. Music loops quietly under the whole video.">{p.audio}</Section>}
          {p.panel === "maps" && <MapsPanel {...p} />}
        </div>
      )}
    </div>
  );
}

function AddPanel(p: Props) {
  return (
    <Section title="Add to the video" hint="Click to add at the playhead, or drag onto the preview to place it.">
      <div className="grid grid-cols-2 gap-1.5">
        {ELEMENTS.map((e) => (
          <button
            key={e.label}
            draggable
            onDragStart={drag(["application/x-element", e.cmd])}
            onClick={() => p.onInsertCenter(e.cmd)}
            className="cursor-grab rounded-lg border border-border bg-card px-2.5 py-2 text-left transition hover:border-primary active:cursor-grabbing"
          >
            <div className="text-xs font-semibold text-foreground">{e.label}</div>
            <div className="text-[10.5px] leading-tight text-muted-foreground">{e.hint}</div>
          </button>
        ))}
      </div>
    </Section>
  );
}

function AssetsPanel(p: Props) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const [name, d] of Object.entries(EFFECTS)) {
      if (q && !`${name} ${d.label} ${d.category}`.toLowerCase().includes(q.toLowerCase())) continue;
      const g = CATEGORY[d.category] ?? "Other";
      out.set(g, [...(out.get(g) ?? []), name]);
    }
    return [...out];
  }, [q]);
  const photos = p.media.filter((m) => !q || m.name.includes(q.toLowerCase()));
  const iconCmd = (n: string) => `icon ${n} at {x} {y} size 220 enter pop`;
  return (
    <>
      <label className="mb-3 flex items-center gap-2 rounded-md border border-border bg-secondary px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons and pictures" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
      </label>
      <Section title="Pictures" hint="Drag onto the preview for a full-screen photo, or use Place to put it on top like a shape.">
        <div className="grid grid-cols-2 gap-1.5">
          {photos.map((m) => (
            <div key={m.name} className="group relative overflow-hidden rounded-md border border-border">
              <button draggable onDragStart={drag(["application/x-asset", m.name])} onClick={() => p.onPhoto(m.name)} title={`Full-screen photo @${m.name}`} className="block w-full cursor-grab">
                <img src={m.src} alt={m.name} className="aspect-video w-full bg-secondary object-cover" />
              </button>
              <div className="flex items-center gap-1 px-1.5 py-1">
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">@{m.name}</span>
                <button onClick={() => p.onPhoto(m.name)} title="Full-screen photo" className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Maximize2 className="h-3 w-3" /></button>
                <button onClick={() => p.onInsertCenter(`image @${m.name} at {x} {y} size 640 enter fade`)} title="Place on top, like a shape" className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Move className="h-3 w-3" /></button>
              </div>
              {!m.builtin && (
                <button onClick={() => p.onRemoveMedia(m.name)} title="Remove from this browser" className="absolute right-1 top-1 hidden rounded bg-background/85 px-1 text-[10px] group-hover:block">✕</button>
              )}
            </div>
          ))}
          <button onClick={() => input.current?.click()} className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-[11px] text-muted-foreground hover:border-primary hover:text-primary">
            <Upload className="h-4 w-4" /> Upload pictures
          </button>
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { p.onUpload([...(e.target.files ?? [])]); e.target.value = ""; }} />
        </div>
      </Section>
      {groups.map(([g, names]) => (
        <Section key={g} title={`Icons · ${g}`}>
          <div className="grid grid-cols-5 gap-1">
            {names.map((n) => (
              <button
                key={n}
                draggable
                onDragStart={drag(["application/x-element", iconCmd(n)])}
                onClick={() => p.onInsertCenter(iconCmd(n))}
                title={`${EFFECTS[n].label} (icon ${n})`}
                className="flex aspect-square cursor-grab items-center justify-center rounded-md border border-border bg-card text-foreground transition hover:border-primary hover:text-primary active:cursor-grabbing"
              >
                <IconGlyph name={n} className="h-6 w-6" />
              </button>
            ))}
          </div>
        </Section>
      ))}
      {!groups.length && !photos.length && <p className="text-xs text-muted-foreground">Nothing matches “{q}”.</p>}
    </>
  );
}

function MotionPanel(p: Props) {
  const fx = (f: FxDrop) => () => (p.selected ? p.onFx(p.selected, f) : p.onNotice("Select an object on the video first, or drag the animation onto it."));
  const target = p.selected ? <span className="font-mono text-primary">{p.selected.id}</span> : "an object";
  return (
    <>
      <Section title="Entrance" hint={<>Click to apply to {target}, or drag onto any object.</>}>
        <div className="flex flex-wrap gap-1.5">
          {FX_STYLES.map((s) => <Chip key={s} label={nice(s)} data={["application/x-fx", JSON.stringify({ kind: "enter", style: s })]} onClick={fx({ kind: "enter", style: s })} title="How it appears" />)}
        </div>
      </Section>
      <Section title="Exit">
        <div className="flex flex-wrap gap-1.5">
          {FX_STYLES.map((s) => <Chip key={s} label={nice(s)} data={["application/x-fx", JSON.stringify({ kind: "exit", style: s })]} onClick={fx({ kind: "exit", style: s })} title="How it leaves" />)}
        </div>
      </Section>
      <Section title="Emphasis" hint="At the playhead.">
        <div className="flex flex-wrap gap-1.5">
          <Chip label="Pulse" data={["application/x-fx", JSON.stringify({ kind: "pulse" })]} onClick={fx({ kind: "pulse" })} title="A quick pulse" />
          <Chip label="Wiggle" data={["application/x-fx", JSON.stringify({ kind: "wiggle" })]} onClick={fx({ kind: "wiggle" })} title="An attention wiggle" />
        </div>
      </Section>
      <Section title="Scene transition" hint="Ends the scene at the playhead and starts the next one.">
        <div className="flex flex-wrap gap-1.5">
          {TRANS.map((e) => <Chip key={e.label} label={e.label} data={["application/x-cmd", e.cmd]} onClick={() => p.onInsert(e.cmd)} title="Transition at the playhead" />)}
        </div>
      </Section>
      <Section title="Camera" hint="A camera move at the playhead. Or pick the camera tool and draw a frame on the video.">
        <div className="flex flex-wrap gap-1.5">
          {CAMERA.map((e) => <Chip key={e.label} label={e.label} data={["application/x-cmd", e.cmd]} onClick={() => p.onInsert(e.cmd)} title="Camera move at the playhead" />)}
        </div>
      </Section>
    </>
  );
}

function MapsPanel(p: Props) {
  return (
    <Section title="Maps" hint="Maps are made in the map tool. The video plays a map from its script; change it with Edit.">
      <button onClick={p.onNewMap} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
        <Plus className="h-3.5 w-3.5" /> New map
      </button>
      {!p.maps.length && <p className="text-xs text-muted-foreground">No maps yet. The EU example comes with one.</p>}
      <div className="flex flex-col gap-1">
        {p.maps.map((n) => (
          <div key={n} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs">
            <MapIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate" title={n}>{n}</span>
            {p.mapsInVideo.has(n)
              ? <span className="text-[10px] text-muted-foreground">in video</span>
              : <button onClick={() => p.onAddMap(n)} className="rounded px-1.5 py-0.5 text-primary hover:bg-secondary">Add</button>}
            <button onClick={() => p.onEditMap(n)} title="Edit in the map tool" className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
    </Section>
  );
}
