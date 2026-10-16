import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Type, MoveUpRight, Circle, Square, Highlighter, Play, Pause, Undo2, Redo2 } from "lucide-react";
import { run, THEME_NAMES } from "@/lang/interpreter";
import type { Timeline, TObj } from "@/lang/timeline";
import { insertAtTime, setTheme, writeMove, writeOver, writeScale } from "@/lang/writeback";
import { getTheme, THEMES } from "@/render/theme";
import { loadFonts } from "@/render/assets";
import type { Assets } from "@/render/types";
import { CodeEditor } from "@/editor/CodeEditor";
import { Stage, type Tool } from "@/editor/Stage";
import { TimelinePanel } from "@/editor/TimelinePanel";
import { MediaBin } from "@/editor/MediaBin";
import { SAMPLE_CODE } from "@/editor/sampleCode";
import { DEMOS } from "@/editor/demos";
import { useHistory } from "@/editor/useHistory";
import { BUILTIN_MEDIA, fileToDataUrl, loadSaved, saveCode, saveMedia, uniqueName, type MediaItem } from "@/editor/assets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Paint and Turtle — Pillars of Creation" },
      { name: "description", content: "Make explainer videos by painting on a canvas and writing turtle-style code, both at once." },
      { property: "og:title", content: "Paint and Turtle — Pillars of Creation" },
      { property: "og:description", content: "Paint on the canvas or write code: every hand action rewrites the script." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

const TOOLS: { id: Tool; icon: typeof Type; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select / move", key: "v" },
  { id: "text", icon: Type, label: "Text", key: "t" },
  { id: "arrow", icon: MoveUpRight, label: "Arrow", key: "a" },
  { id: "circle", icon: Circle, label: "Circle", key: "c" },
  { id: "box", icon: Square, label: "Box", key: "b" },
  { id: "highlight", icon: Highlighter, label: "Highlighter", key: "h" },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;
const THEME_BY_ID = Object.fromEntries(Object.entries(THEME_NAMES).map(([k, v]) => [v, k]));

function Studio() {
  const hist = useHistory(SAMPLE_CODE);
  const { code } = hist;
  const [timeline, setTimeline] = useState<Timeline>(() => {
    const r = run(SAMPLE_CODE);
    return r.ok ? r.timeline : { title: "", themeId: "clean-modern", style: {}, duration: 1, objects: [], stmts: [], transitions: [] };
  });
  const [ui, setUi] = useState("pro");
  useEffect(() => { const v = localStorage.getItem("pnt:ui"); if (v) setUi(v); }, []);
  useEffect(() => {
    if (ui === "pro") delete document.documentElement.dataset["ui"]; else document.documentElement.dataset["ui"] = ui;
    try { localStorage.setItem("pnt:ui", ui); } catch { /* ignore */ }
  }, [ui]);
  const [error, setError] = useState<{ line: number; col: number; len: number; message: string } | null>(null);
  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>(BUILTIN_MEDIA);
  const [assets, setAssets] = useState<Assets>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const loaded = useRef(false);

  // load autosave
  useEffect(() => {
    const saved = loadSaved();
    if (saved.code !== null) hist.reset(saved.code);
    if (saved.media.length) setMedia([...BUILTIN_MEDIA, ...saved.media]);
    loaded.current = true;
    loadFonts(THEMES).then(() => setAssets((a) => new Map(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autosave code
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => saveCode(code), 400);
    return () => clearTimeout(id);
  }, [code]);

  // re-run program 300ms after typing stops; keep last good timeline on error
  useEffect(() => {
    const id = setTimeout(() => {
      const r = run(code);
      if (r.ok) { setTimeline(r.timeline); setError(null); }
      else setError(r.error);
    }, 300);
    return () => clearTimeout(id);
  }, [code]);

  // load images for media items
  useEffect(() => {
    media.forEach((m) => {
      const key = "@" + m.name;
      if (assets.has(key)) return;
      const img = new Image();
      img.onload = () => setAssets((a) => new Map(a).set(key, img));
      img.src = m.src;
    });
  }, [media, assets]);

  const theme = getTheme(timeline.themeId);
  const total = timeline.duration;

  const seek = useCallback((v: number) => { tRef.current = v; setT(v); }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const next = tRef.current + (now - last) / 1000;
      last = now;
      if (next >= total) { seek(total); setPlaying(false); return; }
      seek(next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, seek]);

  const toggle = useCallback(() => {
    if (!playing && tRef.current >= total - 0.01) seek(0);
    setPlaying((p) => !p);
  }, [playing, total, seek]);

  // global shortcuts (outside text fields)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); hist.redo(); return; }
      if (e.code === "Space") { e.preventDefault(); toggle(); return; }
      if (e.key === "Escape") setSelectedId(null);
      const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tl && !mod) setTool(tl.id);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [toggle, hist]);

  // hand actions: all go through code
  const hand = (next: string) => { if (next !== hist.codeRef.current) hist.setHand(next); };
  const onMove = (o: TObj, x: number, y: number) => hand(writeMove(hist.codeRef.current, timeline, o, t, x, y));
  const onScale = (o: TObj, s: number) => hand(writeScale(hist.codeRef.current, timeline, o, t, s));
  const onInsert = (cmd: string) => hand(insertAtTime(hist.codeRef.current, timeline, t, cmd).code);
  const insertPhoto = (name: string) => {
    const taken = timeline.objects.map((o) => o.id);
    const id = uniqueName(name, taken);
    onInsert(`show photo @${name} as ${id}`);
  };

  const addFiles = async (files: File[]) => {
    const added: MediaItem[] = [];
    for (const f of files) {
      try {
        const src = await fileToDataUrl(f);
        const name = uniqueName(f.name, [...media, ...added].map((m) => m.name));
        added.push({ name, src });
      } catch { setNotice(`Couldn't read ${f.name}`); }
    }
    if (!added.length) return [];
    const next = [...media, ...added];
    setMedia(next);
    if (!saveMedia(next)) setNotice("Browser storage is full: new photos won't survive a reload.");
    return added;
  };

  const onDropFiles = async (files: File[]) => {
    const added = await addFiles(files);
    let next = hist.codeRef.current;
    const taken = timeline.objects.map((o) => o.id);
    for (const a of added) {
      const id = uniqueName(a.name, taken);
      taken.push(id);
      next = insertAtTime(next, timeline, t, `show photo @${a.name} as ${id}`).code;
    }
    hand(next);
  };

  const selectedLines = useMemo(() => {
    const o = timeline.objects.find((x) => x.id === selectedId);
    return new Set(o?.lines ?? []);
  }, [timeline, selectedId]);

  const onCaretLine = (line: number) => {
    const o = timeline.objects.find((x) => x.createLine === line) ?? timeline.objects.find((x) => x.lines.includes(line));
    if (o) {
      setSelectedId(o.id);
      if (t < o.start || t >= o.end) seek(o.start + 0.01);
    }
  };

  return (
    <main className="flex h-screen min-h-[640px] flex-col bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg font-semibold tracking-tight">Paint &amp; Turtle</h1>
          <span className="truncate text-xs text-muted-foreground">{timeline.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {notice && <button onClick={() => setNotice(null)} className="text-destructive">{notice} ✕</button>}
          <button onClick={hist.undo} title="Undo (Ctrl+Z)" className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Undo2 className="h-4 w-4" /></button>
          <button onClick={hist.redo} title="Redo (Ctrl+Shift+Z)" className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Redo2 className="h-4 w-4" /></button>
          <select
            value=""
            onChange={(e) => { const d = DEMOS.find((x) => x.id === e.target.value); if (d) hand(d.code); }}
            title="Load a demo (undo with Ctrl+Z)"
            className="rounded-md border border-border bg-secondary px-2 py-1 text-foreground"
          >
            <option value="" disabled>Load demo…</option>
            {DEMOS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select
            value={THEME_BY_ID[timeline.themeId]}
            onChange={(e) => hand(setTheme(hist.codeRef.current, timeline, e.target.value))}
            className="rounded-md border border-border bg-secondary px-2 py-1 text-foreground"
          >
            {THEMES.map((th) => <option key={th.id} value={THEME_BY_ID[th.id]}>{th.name}</option>)}
          </select>
          <select value={ui} onChange={(e) => setUi(e.target.value)} title="Studio look" className="rounded-md border border-border bg-secondary px-2 py-1 text-foreground">
            <option value="pro">Studio: Professional</option>
            <option value="clean">Studio: Clean Modern</option>
            <option value="soft">Studio: Soft Rounded</option>
            <option value="editorial">Studio: Warm Editorial</option>
          </select>
          <Link to="/preview" className="text-muted-foreground hover:text-foreground">Scene preview</Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[420px] shrink-0 flex-col border-r border-border">
          <MediaBin
            media={media}
            onUpload={(f) => void addFiles(f)}
            onInsert={insertPhoto}
            onRemove={(n) => { const next = media.filter((m) => m.name !== n); setMedia(next); saveMedia(next); }}
          />
          <div className="min-h-0 flex-1">
            <CodeEditor
              value={code}
              onChange={hist.setTyped}
              onUndo={hist.undo}
              onRedo={hist.redo}
              error={error}
              selectedLines={selectedLines}
              onCaretLine={onCaretLine}
              assetNames={media.map((m) => m.name)}
              objectIds={timeline.objects.map((o) => o.id)}
            />
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 gap-3 p-4">
            <div className="flex shrink-0 flex-col gap-1 self-start rounded-md border border-border bg-card p-1">
              {TOOLS.map((tl) => (
                <button
                  key={tl.id}
                  onClick={() => setTool(tl.id)}
                  title={`${tl.label} (${tl.key.toUpperCase()})`}
                  className={`rounded p-2 ${tool === tl.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                >
                  <tl.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
              <div className="w-full max-w-[min(100%,calc((100vh-360px)*16/9))]">
                <Stage
                  timeline={timeline}
                  theme={theme}
                  assets={assets}
                  t={t}
                  tool={tool}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onMove={onMove}
                  onScale={onScale}
                  onInsert={onInsert}
                  onDropFiles={(f) => void onDropFiles(f)}
                  onDropAsset={insertPhoto}
                />
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={toggle} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {playing ? "Pause" : "Play"}
                  </button>
                  <input type="range" min={0} max={total} step={1 / 30} value={Math.min(t, total)} onChange={(e) => seek(Number(e.target.value))} className="flex-1 accent-primary" />
                  <span className="w-28 text-right font-mono text-xs tabular-nums text-muted-foreground">{fmt(t)} / {fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="h-48 shrink-0 border-t border-border">
            <TimelinePanel
              timeline={timeline}
              t={t}
              selectedId={selectedId}
              onSeek={seek}
              onSelect={setSelectedId}
              onOver={(span, d) => hand(writeOver(hist.codeRef.current, span, d))}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
