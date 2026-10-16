import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { validateProject } from "@/render/schema";
import { renderFrame } from "@/render/renderer";
import { THEMES, getTheme } from "@/render/theme";
import { sceneStarts, totalDuration } from "@/render/timeline";
import { loadAssets, loadFonts } from "@/render/assets";
import { HEIGHT, WIDTH, type Assets } from "@/render/types";
import { sampleProject } from "@/sample/project";

export const Route = createFileRoute("/preview")({
  head: () => ({
    meta: [
      { title: "Scene Preview — Pillars of Creation" },
      { name: "description", content: "Turn a JSON script into a polished animated explainer video, rendered frame by frame on canvas." },
      { property: "og:title", content: "Scene Preview — Pillars of Creation" },
      { property: "og:description", content: "Turn a JSON script into a polished animated explainer video." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Preview,
});

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${Math.floor((s % 1) * 10)}`;

function Preview() {
  const result = useMemo(() => validateProject(sampleProject), []);
  const project = result.ok ? result.project : null;
  const total = project ? totalDuration(project) : 0;
  const starts = project ? sceneStarts(project.scenes) : [];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [assets, setAssets] = useState<Assets | null>(null);
  const tRef = useRef(0);

  useEffect(() => {
    if (!project) return;
    Promise.all([loadAssets(project), loadFonts(THEMES)]).then(([a]) => setAssets(a));
  }, [project]);

  // draw whenever time/theme changes
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !project || !assets) return;
    renderFrame(c.getContext("2d")!, project, getTheme(themeId), assets, t);
  }, [t, themeId, assets, project]);

  // rAF only advances t; rendering is a pure function of t
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const next = tRef.current + (now - last) / 1000;
      last = now;
      if (next >= total) {
        tRef.current = total;
        setT(total);
        setPlaying(false);
        return;
      }
      tRef.current = next;
      setT(next);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  const seek = (v: number) => {
    tRef.current = v;
    setT(v);
  };
  const toggle = () => {
    if (!playing && tRef.current >= total - 0.01) seek(0);
    setPlaying((p) => !p);
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const activeIdx = starts.findLastIndex((s) => s <= t);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Studio</Link>
          <h1 className="truncate whitespace-nowrap font-display text-xl">Pillars of Creation</h1>
          <span className="hidden whitespace-nowrap text-sm text-muted-foreground sm:inline">Scene preview</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex">
            {[getTheme(themeId).colors.background, getTheme(themeId).colors.text, getTheme(themeId).colors.accent].map((c, i) => (
              <span key={i} className="-ml-1 h-3 w-3 rounded-full border border-border first:ml-0" style={{ background: c }} />
            ))}
          </span>
          <select
            value={themeId}
            onChange={(e) => setThemeId(e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            {THEMES.map((th) => <option key={th.id} value={th.id}>{th.name}</option>)}
          </select>
        </label>
      </header>

      {!result.ok ? (
        <div className="m-6 rounded-md border border-destructive p-4">
          <h2 className="mb-2 font-semibold text-destructive">Script has errors</h2>
          <ul className="list-disc pl-5 font-mono text-sm">
            {result.errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      ) : (
        <section className="mx-auto max-w-6xl p-6" style={{ maxWidth: "min(72rem, calc((100vh - 190px) * 16 / 9 + 48px))" }}>
          <div className="relative overflow-hidden rounded-md border border-border bg-card shadow-2xl">
            <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block aspect-video w-full" onClick={toggle} />
            {!assets && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Loading fonts and images…</div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button onClick={toggle} className="w-20 shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {playing ? "Pause" : "Play"}
            </button>
            <div className="relative flex-1">
              <input
                type="range"
                min={0}
                max={total}
                step={1 / 30}
                value={t}
                onChange={(e) => seek(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-2">
                {starts.slice(1).map((s) => (
                  <span key={s} className="absolute h-2 w-px bg-muted-foreground" style={{ left: `${(s / total) * 100}%` }} />
                ))}
              </div>
            </div>
            <span className="shrink-0 whitespace-nowrap text-right font-mono text-sm tabular-nums text-muted-foreground">
              {fmt(t)} / {fmt(total)}
            </span>
          </div>

          <ol className="mt-6 grid grid-cols-3 gap-2 text-sm md:grid-cols-5 lg:grid-cols-9 [&_button]:min-w-0">
            {project!.scenes.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => seek(starts[i] + 0.001)}
                  className={`w-full rounded-md border px-2 py-2 text-left transition-colors ${
                    i === activeIdx ? "border-primary bg-secondary" : "border-border hover:bg-secondary"
                  }`}
                >
                  <div className="truncate font-medium">{s.type}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.duration}s · {s.transition}
                    {"unverified" in s && s.unverified && <span className="ml-1 text-destructive">⚠</span>}
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
