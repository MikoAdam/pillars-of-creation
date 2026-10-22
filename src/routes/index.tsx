import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Type, MoveUpRight, Circle, Square, Highlighter, Play, Pause, Undo2, Redo2, Video, RotateCcw, Film } from "lucide-react";
import { geoReady, loadGeo } from "@/render/geo";
import { MapInspector } from "@/editor/MapPanel";
import { ExportDialog } from "@/editor/ExportDialog";
import { VoicePanel } from "@/editor/VoicePanel";
import { deleteAudio, loadAudio, saveAudio, type AudioItem } from "@/editor/audioStore";
import { cuesToCode, transcribe } from "@/editor/transcribe";
import { run } from "@/lang/interpreter";
import { activeLinesAt, mapCamAt, styleValues, type Timeline, type TObj } from "@/lang/timeline";
import { insertAtTime, removeFx, resetStyle, setStyle, writeFx, writeMove, writeOver, writeProp, writeScale, writeStart, writeGeoMove, writeGeoEnd, writeBend, writeMapCam, writeDelete, writeReverse, writeColor } from "@/lang/writeback";
import { Library, Inspector, MapLocked } from "@/editor/Library";
import { getMapCode, listMaps, saveMap, uniqueMapName } from "@/editor/mapStore";
import { applyStyle, getTheme, THEMES } from "@/render/theme";
import { StylePanel } from "@/editor/StylePanel";
import { loadFonts } from "@/render/assets";
import type { Assets } from "@/render/types";
import { CodeEditor } from "@/editor/CodeEditor";
import { Stage, type FxDrop, type Tool } from "@/editor/Stage";
import { TimelinePanel } from "@/editor/TimelinePanel";
import { MediaBin } from "@/editor/MediaBin";
import { AI_PROMPT } from "@/editor/aiPrompt";
import { DEMOS, type Demo } from "@/editor/demos";
import { useHistory } from "@/editor/useHistory";
import { BUILTIN_MEDIA, fileToDataUrl, loadSaved, saveCode, saveMedia, takeHandoff, uniqueName, type MediaItem } from "@/editor/assets";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pillars of Creation Studio" },
      { name: "description", content: "Write a script, adjust it by hand, export an explainer video. Every change on the canvas rewrites the script." },
      { property: "og:title", content: "Pillars of Creation Studio" },
      { property: "og:description", content: "Every change on the canvas rewrites the script." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

const STARTER = DEMOS[0]!.code;

const TOOLS: { id: Tool; icon: typeof Type; label: string; key: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select / move: click an object to select it, drag to move, corner handles to resize", key: "v" },
  { id: "text", icon: Type, label: "Text: click on the video to type a caption", key: "t" },
  { id: "arrow", icon: MoveUpRight, label: "Arrow: drag on the video to draw one", key: "a" },
  { id: "circle", icon: Circle, label: "Circle: drag on the video to draw one", key: "c" },
  { id: "box", icon: Square, label: "Box: drag on the video to draw one", key: "b" },
  { id: "highlight", icon: Highlighter, label: "Highlighter: drag on the video to mark an area", key: "h" },
  { id: "camera", icon: Video, label: "Camera: draw a frame to zoom to (on a map: fly there)", key: "k" },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;

function Studio() {
  const hist = useHistory(STARTER);
  const { code } = hist;
  const [timeline, setTimeline] = useState<Timeline>(() => {
    const r = run(STARTER);
    return r.ok ? r.timeline : { title: "", themeId: "clean-modern", style: {}, duration: 1, objects: [], stmts: [], transitions: [], camera: { pos: { base: [960, 540], segs: [] }, zoom: { base: [1], segs: [] }, shakes: [] } };
  });
  const [ready, setReady] = useState(false);
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
  /** set right before a hand-driven code change, so the next run() happens on the next tick
   * instead of waiting out the typing-debounce — see the run effect below. */
  const runImmediate = useRef(false);
  const [voices, setVoices] = useState<AudioItem[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [voiceProgress, setVoiceProgress] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => { void loadAudio().then(setVoices); }, []);

  // load autosave (a handoff from the classic Map Creator at /map-tool/ wins once, if present).
  // Guarded on loaded.current so React 18 StrictMode's dev-mode double-invoke can't consume
  // the one-shot handoff on the first pass and then clobber it with stale autosave on the second.
  useEffect(() => {
    if (loaded.current) return;
    const handoff = takeHandoff();
    const saved = loadSaved();
    if (handoff !== null) hist.reset(handoff);
    else if (saved.code !== null) hist.reset(saved.code);
    if (saved.media.length) setMedia([...BUILTIN_MEDIA, ...saved.media]);
    loaded.current = true;
    const readyTimer = setTimeout(() => setReady(true), 4000);
    loadFonts(THEMES).then(() => setAssets((a) => new Map(a))).finally(() => { clearTimeout(readyTimer); setReady(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // autosave code
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(() => saveCode(code), 400);
    return () => clearTimeout(id);
  }, [code]);

  // Re-run the program after an edit, then sync the timeline (so the canvas's hit-boxes,
  // selection, etc. match what's on screen). Typed edits debounce 300ms so we don't re-parse
  // on every keystroke; a hand action (click, drag, chip insert) runs on the next tick instead —
  // otherwise a click right after e.g. inserting an element would hit-test against the
  // not-yet-updated timeline and silently do nothing.
  // (The flag is consumed inside the timeout callback, not before scheduling it, so that dev-mode
  // effect double-invocation — mount, cleanup, mount again — can't cancel the immediate run and
  // silently fall back to the slow path: the cleanup only ever cancels a run that hasn't fired yet.)
  const [geoVersion, setGeoVersion] = useState(0);
  const [mapsVersion, setMapsVersion] = useState(0);
  useEffect(() => {
    const delay = runImmediate.current ? 0 : 300;
    const id = setTimeout(() => {
      runImmediate.current = false;
      const r = run(code, { resolveMap: getMapCode });
      if (r.ok) {
        setTimeline(r.timeline); setError(null);
        // map outlines load once in the background, then the script runs again
        const need = new Set(r.timeline.needsGeo ?? []);
        if (r.timeline.objects.some((o) => o.kind === "map") && !geoReady("countries")) need.add("countries");
        if (need.size) void Promise.all([...need].map(loadGeo)).then(() => setGeoVersion((v) => v + 1)).catch(() => setNotice("Couldn't load the map outlines. Check your connection and reload."));
      } else {
        // a map script can fail before the outlines arrive: say so, load what it needs, then run again
        const wanted = new Set<"countries" | "regions">();
        if (/^\s*(include|map|country|region|attack|fly|pin|[\w .-]+:)/m.test(code)) wanted.add("countries");
        if (/^\s*region\b/m.test(code)) { wanted.add("countries"); wanted.add("regions"); }
        const missing = [...wanted].filter((k) => !geoReady(k));
        if (missing.length) {
          setNotice("Loading map outlines…");
          void Promise.all(missing.map(loadGeo))
            .then(() => { setNotice(null); setGeoVersion((v) => v + 1); })
            .catch(() => setNotice("Couldn't load the map outlines. Check your connection and reload."));
        } else setError(r.error);
      }
    }, 300);
    return () => clearTimeout(id);
  }, [code, geoVersion, mapsVersion]);
  const [promptCopied, setPromptCopied] = useState(false);
  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 1800);
    } catch {
      setNotice("Your browser blocked copying. Try again, or open the app over https.");
    }
  };

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
      const cues = await transcribe(item.blob, (p) => {
        if (p.stage === "download") {
          setVoiceStatus(`Downloading the speech model (first time only): ${Math.round(p.progress)}%`);
          setVoiceProgress(p.progress);
        } else {
          const heard = p.text ? ` · “${p.text.slice(0, 60)}”` : "";
          setVoiceStatus(`Transcribing ${item.name}: ${Math.round(p.progress)}%${heard}`);
          setVoiceProgress(p.progress);
        }
      });
      setVoiceProgress(null);
      if (!cues.length) { setVoiceStatus("No speech found in this audio."); return; }
      let next = hist.codeRef.current.replace(/\n*# Subtitles \(made automatically[^\n]*\n(subtitle [^\n]*\n?)*/g, "\n");
      next = appendLines(useVoice(item.name, next), cuesToCode(cues, item.name));
      hand(next);
      setVoiceStatus(`Added ${cues.length} subtitle lines to the end of the script.`);
    } catch (e) {
      setVoiceProgress(null);
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
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const step = (e.shiftKey ? 1 : 1 / 30) * (e.key === "ArrowRight" ? 1 : -1);
        seek(Math.min(timeline.duration, Math.max(0, tRef.current + step)));
        return;
      }
      if (e.key === "Home") { e.preventDefault(); seek(0); return; }
      if (e.key === "End") { e.preventDefault(); seek(timeline.duration); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
        const o = timeline.objects.find((x) => x.id === selectedId);
        if (o && editable(o)) {
          e.preventDefault();
          const next = writeDelete(hist.codeRef.current, o);
          if (next !== hist.codeRef.current) { runImmediate.current = true; hist.setHand(next); }
          setSelectedId(null);
          return;
        }
      }
      if (e.key.toLowerCase() === "r" && !mod) {
        const o = timeline.objects.find((x) => x.id === selectedId);
        if (o && editable(o) && (o.kind === "attack" || o.kind === "route")) {
          const next = writeReverse(hist.codeRef.current, o);
          if (next !== hist.codeRef.current) { runImmediate.current = true; hist.setHand(next); }
          return;
        }
        seek(0); setPlaying(true); return;
      }
      if (e.key === "Escape") setSelectedId(null);
      const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tl && !mod) setTool(tl.id);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [toggle, hist, seek, timeline, selectedId]);

  // hand actions: all go through code, and re-run on the next tick (not debounced — see the run effect)
  const hand = (next: string) => { if (next !== hist.codeRef.current) { runImmediate.current = true; hist.setHand(next); } };
  const loadScript = (code: string) => { setPlaying(false); seek(0); hand(code); };
  const loadDemo = (d: Demo) => {
    for (const [name, code] of Object.entries(d.maps ?? {})) saveMap(name, code);
    if (d.maps) setMapsVersion((v) => v + 1);
    loadScript(d.code);
  };
  const editable = (o: TObj) => {
    if (!o.locked) return true;
    setNotice(`"${o.from ?? "This map"}" plays from its own script. Edit it in the map tool.`);
    return false;
  };
  const [mapEdit, setMapEdit] = useState<{ name: string; isNew: boolean } | null>(null);
  const mapFrame = useRef<HTMLIFrameElement>(null);
  const pendingMapCode = useRef<((code: string) => void) | null>(null);
  const openMap = (name?: string) => {
    if (!name) return;
    setPlaying(false);
    setMapEdit({ name, isNew: false });
  };
  const saveMapFlow = (addToVideo: boolean) => {
    if (!mapEdit) return;
    const { name, isNew } = mapEdit;
    pendingMapCode.current = (code) => {
      if (!code.trim()) return setNotice("The map is empty: add some commands in the map tool first.");
      if (!name.trim()) return setNotice("Give the map a name first.");
      if (isNew && listMaps().includes(name)) return setNotice(`A map called "${name}" already exists. Choose another name.`);
      if (!saveMap(name, code)) return setNotice("Browser storage is full: the map was not saved.");
      setMapsVersion((v) => v + 1);
      if (addToVideo) {
        const line = `include map "${name}"`;
        setPlaying(false);
        seek(0);
        if (!hist.codeRef.current.includes(line)) hand(`${hist.codeRef.current.trimEnd()}\n\n${line}\n`);
      }
      setMapEdit(null);
      setNotice(addToVideo ? `"${name}" is in the video. Press Play to see it.` : `"${name}" saved.`);
    };
    mapFrame.current?.contentWindow?.postMessage({ type: "pnt-request-code" }, window.location.origin);
  };
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: unknown; code?: unknown } | null;
      if (e.origin !== window.location.origin || e.source !== mapFrame.current?.contentWindow) return;
      if (d?.type !== "pnt-map-code" || typeof d.code !== "string") return;
      const next = pendingMapCode.current;
      pendingMapCode.current = null;
      next?.(d.code);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const activeLines = useMemo(() => activeLinesAt(timeline, t), [timeline, t]);
  const onMove = (o: TObj, x: number, y: number) => {
    if (!editable(o)) return;
    hand(o.data?.geo || o.kind === "map" ? writeGeoMove(hist.codeRef.current, timeline, o, t, x, y) : writeMove(hist.codeRef.current, timeline, o, t, x, y));
  };
  const onScale = (o: TObj, s: number) => {
    if (!editable(o)) return;
    hand(o.kind === "map" ? writeMapCam(hist.codeRef.current, timeline, o, t, "zoom", [Math.min(14, Math.max(0.3, mapCamAt(o, t).zoom + Math.log2(s)))]) : writeScale(hist.codeRef.current, timeline, o, t, s));
  };
  const onGeoHandle = (o: TObj, w: "a" | "b" | "bend", x: number, y: number) => {
    if (!editable(o)) return;
    hand(w === "bend" ? writeBend(hist.codeRef.current, o, t, x, y) : writeGeoEnd(hist.codeRef.current, o, t, w, x, y));
  };
  const onInsert = (cmd: string) => hand(insertAtTime(hist.codeRef.current, timeline, t, cmd).code);
  const onInsertCenter = (cmd: string) => {
    onInsert(cmd.replace("{x2}", "1220").replace("{y2}", "400").replace("{x}", "960").replace("{y}", "540"));
  };
  const onRotate = (o: TObj, deg: number) => {
    if (!editable(o)) return;
    hand(o.kind === "map" ? writeMapCam(hist.codeRef.current, timeline, o, t, "turn", [Math.round(mapCamAt(o, t).turn - deg)]) : writeProp(hist.codeRef.current, timeline, o, t, "rot", deg));
  };
  const onOpacity = (o: TObj, v: number) => {
    if (!editable(o)) return;
    hand(writeProp(hist.codeRef.current, timeline, o, t, "opacity", v));
  };
  const onColor = (o: TObj, c: string) => {
    if (!editable(o)) return;
    hand(writeColor(hist.codeRef.current, o, c));
  };
  const onFx = (o: TObj, f: FxDrop) => {
    if (!editable(o)) return;
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
      {!ready && (
        <div role="status" className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#f7f8fa] text-[#111827]" style={{ fontFamily: "system-ui, sans-serif" }}>
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#2f6bff] border-t-transparent" />
          <p className="text-sm">Loading the studio…</p>
        </div>
      )}
      {voice && <audio ref={audioRef} src={voice.url} preload="auto" hidden />}
      {exporting && <ExportDialog timeline={timeline} theme={theme} assets={assets} voice={voice?.blob} onClose={() => setExporting(false)} />}
      {mapEdit && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
            <span className="font-display text-lg font-semibold tracking-tight">Map</span>
            <input
              value={mapEdit.name}
              disabled={!mapEdit.isNew}
              onChange={(e) => setMapEdit({ ...mapEdit, name: e.target.value.replace(/"/g, "'") })}
              title="The name the video script uses"
              className="w-56 rounded-md border border-border bg-secondary px-2 py-0.5 text-sm text-foreground disabled:opacity-60"
            />
            <span className="min-w-0 truncate text-xs text-muted-foreground">Build the map here. The video plays it from its script and can't change it.</span>
            <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
              <button onClick={() => saveMapFlow(false)} className="rounded-md border border-border bg-secondary px-3 py-1 text-foreground hover:bg-accent">Save</button>
              <button onClick={() => saveMapFlow(true)} className="rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground">Save and add to video</button>
              <button onClick={() => setMapEdit(null)} className="rounded-md border border-border px-3 py-1 text-muted-foreground hover:text-foreground">Close</button>
            </div>
          </div>
          <iframe
            ref={mapFrame}
            src="/map-tool/index.html?embed=1"
            title="Map tool"
            onLoad={() => mapFrame.current?.contentWindow?.postMessage({ type: "pnt-load-map", code: getMapCode(mapEdit.name) ?? "" }, window.location.origin)}
            className="min-h-0 flex-1 border-0"
          />
        </div>
      )}
      <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
        <div className="flex min-w-0 shrink items-baseline gap-3">
          <h1 className="shrink-0 whitespace-nowrap font-display text-lg font-semibold tracking-tight">Pillars of Creation Studio</h1>
          <span className="truncate text-xs text-muted-foreground">{timeline.title}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap text-xs">
          {notice && <button onClick={() => setNotice(null)} className="max-w-[46ch] truncate text-primary">{notice} ✕</button>}
          <button onClick={hist.undo} title="Undo (Ctrl+Z)" className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Undo2 className="h-4 w-4" /></button>
          <button onClick={hist.redo} title="Redo (Ctrl+Shift+Z)" className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Redo2 className="h-4 w-4" /></button>
          <select
            value=""
            onChange={(e) => { const d = DEMOS.find((x) => x.id === e.target.value); if (d) loadDemo(d); }}
            title="Replace the script with an example (undo with Ctrl+Z)"
            className="rounded-md border border-border bg-secondary px-2 py-1 text-foreground"
          >
            <option value="" disabled>Examples…</option>
            {DEMOS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button
            onClick={() => void copyAiPrompt()}
            title="Copy a prompt that teaches any AI chat this script language. Paste it into the chat, then paste the script it writes back into the editor."
            className="rounded-md border border-border bg-secondary px-2.5 py-1 text-foreground hover:bg-accent"
          >
            {promptCopied ? "Copied" : "Copy AI prompt"}
          </button>
          <StylePanel
            base={baseTheme}
            theme={theme}
            overridden={new Set(Object.keys(timeline.style ?? {}))}
            onSet={(k, v) => { const next = setStyle(hist.codeRef.current, timeline, k, v); if (next !== hist.codeRef.current) hist.setTyped(next); }}
            onReset={(k) => hand(resetStyle(hist.codeRef.current, timeline, k))}
          />
          <button onClick={() => { setPlaying(false); setExporting(true); }} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 font-semibold text-primary-foreground"><Film className="h-3.5 w-3.5" /> Export</button>
          <Link to="/preview" className="text-muted-foreground hover:text-foreground">Scene preview</Link>
          <button onClick={() => { setPlaying(false); setMapEdit({ name: uniqueMapName("New map"), isNew: true }); }} title="Build a map in the map tool. The video plays it from its script." className="rounded-md border border-border bg-secondary px-2.5 py-1 text-foreground hover:bg-accent">+ Map</button>
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
            progress={voiceProgress}
            onUpload={(f) => void uploadVoice(f)}
            onUse={(n) => hand(useVoice(n))}
            onSubtitles={makeSubtitles}
            onRemove={(n) => { setVoices((v) => v.filter((x) => x.name !== n)); void deleteAudio(n); }}
          />
          <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-1.5">
            <span className="text-xs font-semibold text-foreground">Script</span>
            <span className="truncate text-[11px] text-muted-foreground">The source of truth: every change on the video rewrites this</span>
          </div>
          <div className="min-h-0 flex-1">
            <CodeEditor
              value={code}
              onChange={hist.setTyped}
              onUndo={hist.undo}
              onRedo={hist.redo}
              error={error}
              selectedLines={selectedLines}
              activeLines={activeLines}
              onCaretLine={onCaretLine}
              assetNames={media.map((m) => m.name)}
              objectIds={timeline.objects.map((o) => o.id)}
            />
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="px-4 pt-3">
            <p className="mb-1.5 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Add to the video</span> at the playhead: click a chip, or drag it onto the preview</p>
            <Library selected={selectedObj} onInsert={onInsert} onInsertCenter={onInsertCenter} onFx={onFx} onNotice={setNotice} />
          </div>
          <div className="flex min-h-0 flex-1 gap-3 px-4 pb-3 pt-3">
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
              <div className="w-full max-w-[min(100%,calc((100vh-440px)*16/9))]">
                <p className="mb-1.5 truncate text-xs text-muted-foreground" title={TOOLS.find((x) => x.id === tool)?.label}>
                  {TOOLS.find((x) => x.id === tool)?.label}
                </p>
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
                {selectedObj?.locked && (
                  <div className="mt-2">
                    <MapLocked name={selectedObj.from ?? ""} onEdit={() => openMap(selectedObj.from)} />
                  </div>
                )}
                {selectedObj?.kind === "map" && !selectedObj.locked && (
                  <div className="mt-2">
                    <MapInspector o={selectedObj} t={t} onSet={(k, v) => hand(writeMapCam(hist.codeRef.current, timeline, selectedObj, t, k, [v]))} />
                  </div>
                )}
                {selectedObj && !selectedObj.locked && selectedObj.kind !== "map" && (
                  <div className="mt-2">
                    <Inspector
                      o={selectedObj}
                      t={t}
                      onFx={(w, st) => hand(st ? writeFx(hist.codeRef.current, selectedObj, w, st) : removeFx(hist.codeRef.current, selectedObj, w))}
                      onRotate={(d) => onRotate(selectedObj, d)}
                      onOpacity={(v) => onOpacity(selectedObj, v)}
                      onPreviewOpacity={setPreviewOpacity}
                      onColor={selectedObj.data?.geo ? (c) => onColor(selectedObj, c) : undefined}
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
