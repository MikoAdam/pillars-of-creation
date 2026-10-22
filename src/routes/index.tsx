import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Type, MoveUpRight, Circle, Square, Highlighter, Play, Pause, Undo2, Redo2, Video, RotateCcw, Film, Globe2, Moon, Sun } from "lucide-react";
import { featureAt, geoReady, loadGeo, toNorm } from "@/render/geo";
import { MapInspector } from "@/editor/MapPanel";
import { ExportDialog } from "@/editor/ExportDialog";
import { VoicePanel } from "@/editor/VoicePanel";
import { deleteAudio, loadAudio, saveAudio, type AudioItem } from "@/editor/audioStore";
import { cuesToCode, transcribe } from "@/editor/transcribe";
import { run } from "@/lang/interpreter";
import { mapCamAt, styleValues, type Timeline, type TObj } from "@/lang/timeline";
import { insertAtTime, removeFx, resetStyle, setStyle, writeFx, writeMove, writeOver, writeProp, writeScale, writeStart, writeGeoMove, writeGeoEnd, writeBend, writeMapCam } from "@/lang/writeback";
import { Library, Inspector } from "@/editor/Library";
import { applyStyle, getTheme, THEMES } from "@/render/theme";
import { StylePanel } from "@/editor/StylePanel";
import { loadFonts } from "@/render/assets";
import type { Assets } from "@/render/types";
import { CodeEditor } from "@/editor/CodeEditor";
import { Stage, type FxDrop, type Tool } from "@/editor/Stage";
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
  { id: "camera", icon: Video, label: "Camera: draw a frame to zoom to (on a map: fly there)", key: "k" },
  { id: "map", icon: Globe2, label: "Map: click a country to colour it (Shift = region), drag between places for an attack arrow", key: "m" },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;

function Studio() {
  const hist = useHistory(SAMPLE_CODE);
  const { code } = hist;
  const [timeline, setTimeline] = useState<Timeline>(() => {
    const r = run(SAMPLE_CODE);
    return r.ok ? r.timeline : { title: "", themeId: "clean-modern", style: {}, duration: 1, objects: [], stmts: [], transitions: [], camera: { pos: { base: [960, 540], segs: [] }, zoom: { base: [1], segs: [] }, shakes: [] } };
  });
  const [previewOpacity, setPreviewOpacity] = useState<number | undefined>(undefined);
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
  const [voices, setVoices] = useState<AudioItem[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => { void loadAudio().then(setVoices); }, []);

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
  const [geoVersion, setGeoVersion] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => {
      const r = run(code);
      if (r.ok) {
        setTimeline(r.timeline); setError(null);
        // map outlines load once in the background, then the script runs again
        const need = new Set(r.timeline.needsGeo ?? []);
        if (r.timeline.objects.some((o) => o.kind === "map") && !geoReady("countries")) need.add("countries");
        if (need.size) void Promise.all([...need].map(loadGeo)).then(() => setGeoVersion((v) => v + 1)).catch(() => setNotice("Couldn't load the map outlines. Check your connection and reload."));
      } else {
        setError(r.error);
        // a map script can fail before the outlines arrive: load them, then run again
        if (!geoReady("countries") && /^\s*(map|country|region|attack|fly|pin|[\w .-]+:)/m.test(code))
          void loadGeo("countries").then(() => setGeoVersion((v) => v + 1)).catch(() => setNotice("Couldn't load the map outlines. Check your connection and reload."));
      }
    }, 300);
    return () => clearTimeout(id);
  }, [code, geoVersion]);
  const [mapColor, setMapColor] = useState("blue");
  const [mapAnim, setMapAnim] = useState("fade");

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

  const baseTheme = getTheme(timeline.themeId);
  const theme = useMemo(() => applyStyle(baseTheme, styleValues(timeline)), [baseTheme, timeline]);
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

  // voiceover follows the playhead
  const voice = voices.find((v) => v.name === timeline.voice);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing && voice) { a.currentTime = tRef.current; void a.play().catch(() => {}); } else a.pause();
  }, [playing, voice]);
  const scrub = useCallback((v: number) => {
    seek(v);
    const a = audioRef.current;
    if (a && playing) a.currentTime = v;
  }, [seek, playing]);

  const appendLines = (base: string, lines: string) => base.replace(/\s*$/, "") + "\n\n" + lines + "\n";
  const useVoice = (name: string, base = hist.codeRef.current) =>
    /^voice\s+@\S+/m.test(base) ? base.replace(/^voice\s+@\S+/m, `voice @${name}`) : appendLines(base, `voice @${name}`);
  const makeSubtitles = (name: string) => {
    const item = voicesRef.current.find((v) => v.name === name);
    if (item) void makeSubtitlesFor(item);
  };
  const uploadVoice = async (f: File) => {
    const name = uniqueName(f.name, [...voices.map((v) => v.name), ...media.map((m) => m.name)]);
    try { await saveAudio(name, f); } catch { setNotice("Couldn't save the audio in this browser; it will be lost on reload."); }
    const item = { name, blob: f as Blob, url: URL.createObjectURL(f) };
    setVoices((v) => [...v, item]);
    hand(useVoice(name));
    void makeSubtitlesFor(item);
  };
  const voicesRef = useRef<AudioItem[]>([]);
  voicesRef.current = voices;
  const makeSubtitlesFor = async (item: AudioItem) => {
    setVoiceStatus("Preparing speech recognition…");
    try {
      const cues = await transcribe(item.blob, (p) =>
        setVoiceStatus(p.stage === "download" ? `Downloading speech model (first time only)… ${Math.round(p.progress)}%` : "Listening and writing subtitles…"));
      if (!cues.length) { setVoiceStatus("No speech found in this audio."); return; }
      let next = hist.codeRef.current.replace(/\n*# Subtitles \(made automatically[^\n]*\n(subtitle [^\n]*\n?)*/g, "\n");
      next = appendLines(useVoice(item.name, next), cuesToCode(cues, item.name));
      hand(next);
      setVoiceStatus(`Added ${cues.length} subtitle lines to the end of the script.`);
    } catch (e) {
      setVoiceStatus(`Couldn't make subtitles: ${(e as Error).message}`);
    }
  };

  // global shortcuts (outside text fields)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); hist.redo(); return; }
      if (e.code === "Space") { e.preventDefault(); toggle(); return; }
      if (e.key.toLowerCase() === "r" && !mod) { seek(0); setPlaying(true); return; }
      if (e.key === "Escape") setSelectedId(null);
      const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tl && !mod) setTool(tl.id);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [toggle, hist, seek]);

  // hand actions: all go through code
  const hand = (next: string) => { if (next !== hist.codeRef.current) hist.setHand(next); };
  const onMove = (o: TObj, x: number, y: number) =>
    hand(o.data?.geo || o.kind === "map" ? writeGeoMove(hist.codeRef.current, timeline, o, t, x, y) : writeMove(hist.codeRef.current, timeline, o, t, x, y));
  const onScale = (o: TObj, s: number) =>
    hand(o.kind === "map" ? writeMapCam(hist.codeRef.current, timeline, o, t, "zoom", [Math.min(14, Math.max(0.3, mapCamAt(o, t).zoom + Math.log2(s)))]) : writeScale(hist.codeRef.current, timeline, o, t, s));
  const placeName = (name: string) => (/^[a-z][a-z0-9_]*$/i.test(name) ? name.toLowerCase() : `"${name.toLowerCase()}"`);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const onMapClick = async (lng: number, lat: number, region: boolean) => {
    const [x, y] = toNorm(lng, lat);
    if (region) {
      await loadGeo("regions");
      const rf = featureAt("regions", x, y);
      if (!rf) return setNotice("No region there. Shift-click inside a country.");
      const cf = featureAt("countries", x, y);
      return onInsert(`region ${placeName(rf.name)} ${placeName(cf?.name ?? rf.country ?? "")} ${mapColor} ${mapAnim}`);
    }
    const f = featureAt("countries", x, y);
    if (!f) return setNotice("That's sea. Click inside a country to colour it.");
    onInsert(`country ${placeName(f.name)} ${mapColor} ${mapAnim}`);
  };
  const onMapDrag = (a: [number, number], b: [number, number]) => {
    const fa = featureAt("countries", ...toNorm(a[0], a[1])), fb = featureAt("countries", ...toNorm(b[0], b[1]));
    const pa = fa && fb && fa !== fb ? placeName(fa.name) : `${r2(a[1])} ${r2(a[0])}`;
    const pb = fa && fb && fa !== fb ? placeName(fb.name) : `${r2(b[1])} ${r2(b[0])}`;
    onInsert(`attack ${pa} ${pb} ${mapColor === "blue" ? "red" : mapColor}`);
  };
  const onGeoHandle = (o: TObj, w: "a" | "b" | "bend", x: number, y: number) =>
    hand(w === "bend" ? writeBend(hist.codeRef.current, o, t, x, y) : writeGeoEnd(hist.codeRef.current, o, t, w, x, y));
  const onInsert = (cmd: string) => hand(insertAtTime(hist.codeRef.current, timeline, t, cmd).code);
  const onInsertCenter = (cmd: string) => {
    if (/\{(lat|lng)\}/.test(cmd)) {
      const m = [...timeline.objects].reverse().find((o) => o.kind === "map" && t >= o.start && t < o.end);
      if (!m) return setNotice("Map items need a map: add a map first.");
      const c = mapCamAt(m, t);
      cmd = cmd.replace("{lat}", String(r2(c.lat))).replace("{lng}", String(r2(c.lng)));
    }
    onInsert(cmd.replace("{x2}", "1220").replace("{y2}", "400").replace("{x}", "960").replace("{y}", "540"));
  };
  const onRotate = (o: TObj, deg: number) =>
    hand(o.kind === "map" ? writeMapCam(hist.codeRef.current, timeline, o, t, "turn", [Math.round(mapCamAt(o, t).turn - deg)]) : writeProp(hist.codeRef.current, timeline, o, t, "rot", deg));
  const onOpacity = (o: TObj, v: number) => hand(writeProp(hist.codeRef.current, timeline, o, t, "opacity", v));
  const onFx = (o: TObj, f: FxDrop) => {
    const c = hist.codeRef.current;
    if (f.kind === "pulse" || f.kind === "wiggle") return onInsert(`${f.kind} ${o.id} over 0.6s`);
    hand(writeFx(c, o, f.kind, f.style ?? "pop"));
  };
  const selectedObj = timeline.objects.find((o) => o.id === selectedId);
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
      {voice && <audio ref={audioRef} src={voice.url} preload="auto" hidden />}
      {exporting && <ExportDialog timeline={timeline} theme={theme} assets={assets} voice={voice?.blob} onClose={() => setExporting(false)} />}
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
          <StylePanel
            base={baseTheme}
            theme={theme}
            overridden={new Set(Object.keys(timeline.style ?? {}))}
            onSet={(k, v) => { const next = setStyle(hist.codeRef.current, timeline, k, v); if (next !== hist.codeRef.current) hist.setTyped(next); }}
            onReset={(k) => hand(resetStyle(hist.codeRef.current, timeline, k))}
          />
          <button onClick={() => { setPlaying(false); setExporting(true); }} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground"><Film className="h-3.5 w-3.5" /> Export</button>
          <ThemeToggle />
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
          <VoicePanel
            voices={voices}
            active={timeline.voice}
            status={voiceStatus}
            onUpload={(f) => void uploadVoice(f)}
            onUse={(n) => hand(useVoice(n))}
            onSubtitles={makeSubtitles}
            onRemove={(n) => { setVoices((v) => v.filter((x) => x.name !== n)); void deleteAudio(n); }}
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
          <div className="px-4 pt-3">
            <Library selected={selectedObj} mapColor={mapColor} mapAnim={mapAnim} onMapColor={setMapColor} onMapAnim={setMapAnim} onInsert={onInsert} onInsertCenter={onInsertCenter} onFx={onFx} onNotice={setNotice} />
          </div>
          <div className="flex min-h-0 flex-1 gap-3 px-4 pb-3 pt-3">
            <div className="flex shrink-0 flex-col gap-1 self-start rounded-md border border-border bg-card p-1">
              {TOOLS.map((tl) => (
                <button
                  key={tl.id}
                  onClick={() => {
                    setTool(tl.id);
                    if (tl.id === "map" && !timeline.objects.some((o) => o.kind === "map" && t >= o.start && t < o.end)) {
                      onInsert("map 48 15 zoom 4");
                      setNotice("Added a map of Europe. Click a country to colour it, drag between places for an attack arrow.");
                    }
                  }}
                  title={`${tl.label} (${tl.key.toUpperCase()})`}
                  className={`rounded p-2 ${tool === tl.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
                >
                  <tl.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
              <div className="w-full max-w-[min(100%,calc((100vh-440px)*16/9))]">
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
                  onRotate={onRotate}
                  onFx={onFx}
                  onNotice={setNotice}
                  previewOpacity={previewOpacity}
                  onInsert={onInsert}
                  onDropFiles={(f) => void onDropFiles(f)}
                  onDropAsset={insertPhoto}
                  onMapClick={(lng, lat, r) => void onMapClick(lng, lat, r)}
                  onMapDrag={onMapDrag}
                  onGeoHandle={onGeoHandle}
                />
                <div className="mt-3 flex items-center gap-3">
                  <button onClick={() => { seek(0); setPlaying(true); }} title="Restart from the beginning (R)" className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-accent">
                    <RotateCcw className="h-4 w-4" /> Restart
                  </button>
                  <button onClick={toggle} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {playing ? "Pause" : "Play"}
                  </button>
                  <input type="range" min={0} max={total} step={1 / 30} value={Math.min(t, total)} onChange={(e) => scrub(Number(e.target.value))} className="flex-1 accent-primary" />
                  <span className="w-28 text-right font-mono text-xs tabular-nums text-muted-foreground">{fmt(t)} / {fmt(total)}</span>
                </div>
                {selectedObj?.kind === "map" && (
                  <div className="mt-2">
                    <MapInspector o={selectedObj} t={t} onSet={(k, v) => hand(writeMapCam(hist.codeRef.current, timeline, selectedObj, t, k, [v]))} />
                  </div>
                )}
                {selectedObj && selectedObj.kind !== "map" && (
                  <div className="mt-2">
                    <Inspector
                      o={selectedObj}
                      t={t}
                      onFx={(w, st) => hand(st ? writeFx(hist.codeRef.current, selectedObj, w, st) : removeFx(hist.codeRef.current, selectedObj, w))}
                      onRotate={(d) => onRotate(selectedObj, d)}
                      onOpacity={(v) => onOpacity(selectedObj, v)}
                      onPreviewOpacity={setPreviewOpacity}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="h-48 shrink-0 border-t border-border">
            <TimelinePanel
              timeline={timeline}
              t={t}
              selectedId={selectedId}
              onSeek={scrub}
              onSelect={setSelectedId}
              onOver={(span, d) => hand(writeOver(hist.codeRef.current, span, d))}
              onStart={(info, s0) => hand(writeStart(hist.codeRef.current, info, s0))}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

/** Studio light/dark switch; dark by default, remembered in this browser. */
function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => { setDark(localStorage.getItem("studio-mode") !== "light"); }, []);
  useEffect(() => {
    if (dark) document.documentElement.removeAttribute("data-ui");
    else document.documentElement.setAttribute("data-ui", "clean");
    localStorage.setItem("studio-mode", dark ? "dark" : "light");
  }, [dark]);
  return (
    <button onClick={() => setDark((d) => !d)} title={dark ? "Switch to light mode" : "Switch to dark mode"} aria-label="Toggle dark mode" className="rounded-md border border-border bg-secondary p-1.5 text-foreground hover:bg-accent">
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}
