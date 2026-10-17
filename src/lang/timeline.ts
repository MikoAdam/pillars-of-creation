import type { Span } from "./parser";

export type ObjKind = "photo" | "count" | "bars" | "line" | "headline" | "say" | "arrow" | "circle" | "box" | "highlight";

/** Easing names usable with `ease <name>` in the script. */
export const EASES: Record<string, (p: number) => number> = {
  smooth: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  snap: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  overshoot: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  spring: (t) => (t >= 1 ? 1 : 1 - Math.exp(-6 * t) * Math.cos(t * Math.PI * 4.5)),
  bounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};
export const EASE_NAMES = Object.keys(EASES);

/** Entrance / exit styles usable with `enter <style>` / `exit <style>`. */
export const FX_STYLES = ["fade", "pop", "rise", "drop", "slide_left", "slide_right", "blur", "spin", "grow", "wipe"] as const;
export type FxStyle = (typeof FX_STYLES)[number];

export const TRANSITIONS = ["crossfade", "slide", "zoom", "wipe", "push", "whip", "blur"] as const;
export type TransKind = Exclude<(typeof TRANSITIONS)[number], never>;

export interface Seg {
  t0: number;
  t1: number;
  from: number[];
  to: number[];
  line: number;
  col: number;
  /** literal spans of the target values (undefined entries = non-literal) */
  toSpans: (Span | undefined)[];
  overSpan?: Span | undefined;
  label: string;
  ease?: string | undefined;
  /** sideways bend for 2D moves (px) */
  curve?: number | undefined;
  /** time cursor when the line ran (start without delay) */
  base: number;
  delaySpan?: Span | undefined;
  hasDelay: boolean;
  lineEnd: number;
}

export interface Track {
  base: number[];
  segs: Seg[];
}

export interface Trans {
  t: number;
  d: number;
  kind: TransKind;
}

export interface Fx { style: FxStyle; d: number; span?: Span | undefined }
export interface Pulse { t0: number; t1: number; amt: number; kind: "pulse" | "wiggle" }

export interface TObj {
  id: string;
  kind: ObjKind;
  start: number;
  end: number;
  origin: [number, number];
  pos: Track;
  scale: Track;
  opacity: Track;
  rot: Track;
  /** 0..1 build progress for the creation "over" */
  progress: Track;
  data: any;
  lines: number[];
  createLine: number;
  createLineEnd: number; // offset where appended keywords go
  createSpans: {
    at?: (Span | undefined)[] | undefined; scale?: Span | undefined; from?: (Span | undefined)[] | undefined; to?: (Span | undefined)[] | undefined;
    rotate?: Span | undefined; opacity?: Span | undefined; delay?: Span | undefined; hasDelay?: boolean;
  };
  /** cursor time when the creation line ran */
  base: number;
  enterFx?: Fx | undefined;
  exitFx?: Fx | undefined;
  pulses: Pulse[];
  enter?: Trans | undefined;
  exit?: Trans | undefined;
  /** local bounding box before transform [x, y, w, h] */
  box: [number, number, number, number];
}

export interface StmtInfo {
  line: number;
  endLine: number;
  before: number;
  after: number;
}

export interface Camera {
  pos: Track;
  zoom: Track;
  shakes: { t0: number; t1: number; amt: number }[];
}

export interface Timeline {
  title: string;
  themeId: string;
  themeSpan?: Span | undefined;
  /** `style` overrides on top of the theme defaults */
  style: Partial<Record<string, { value: string | number | boolean; span: Span; line: number }>>;
  projectLine?: number | undefined;
  duration: number;
  objects: TObj[];
  stmts: StmtInfo[];
  transitions: (Trans | { t: number; d: 0; kind: "cut" })[];
  camera: Camera;
}

export const emptyCamera = (): Camera => ({ pos: { base: [960, 540], segs: [] }, zoom: { base: [1], segs: [] }, shakes: [] });

export function sample(track: Track, t: number, linear = false): number[] {
  let v = track.base;
  for (const s of track.segs) {
    if (t < s.t0) break;
    if (t >= s.t1) v = s.to;
    else {
      const p = (t - s.t0) / Math.max(1e-6, s.t1 - s.t0);
      const e = linear ? p : (EASES[s.ease ?? "smooth"] ?? EASES["smooth"])(p);
      v = s.from.map((f, i) => f + (s.to[i] - f) * e);
      if (s.curve && v.length === 2) {
        const dx = s.to[0] - s.from[0], dy = s.to[1] - s.from[1];
        const len = Math.hypot(dx, dy) || 1;
        const k = s.curve * Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
        v = [v[0] + (-dy / len) * k, v[1] + (dx / len) * k];
      }
    }
  }
  return v;
}

export function addSeg(track: Track, seg: Seg) {
  track.segs.push(seg);
  track.segs.sort((a, b) => a.t0 - b.t0);
}

/** Camera state at time t: center, zoom and shake offset. */
export function cameraAt(tl: Timeline, t: number) {
  const cam = tl.camera ?? emptyCamera();
  const [cx, cy] = sample(cam.pos, t);
  const z = Math.max(0.05, sample(cam.zoom, t)[0]);
  let sx = 0, sy = 0;
  for (const s of cam.shakes) {
    if (t < s.t0 || t >= s.t1) continue;
    const p = (t - s.t0) / Math.max(1e-6, s.t1 - s.t0);
    const a = s.amt * (1 - p);
    sx += a * Math.sin(t * 91.7) * Math.cos(t * 37.3);
    sy += a * Math.sin(t * 73.1 + 1.3) * Math.cos(t * 51.9);
  }
  return { cx, cy, z, sx, sy };
}

/** Canvas pixel → scene coordinates (undo the camera). */
export function toScene(tl: Timeline, t: number, x: number, y: number) {
  const c = cameraAt(tl, t);
  return { x: (x - 960 - c.sx) / c.z + c.cx, y: (y - 540 - c.sy) / c.z + c.cy, z: c.z };
}
/** Scene → canvas pixel coordinates. */
export function toCanvas(tl: Timeline, t: number, x: number, y: number) {
  const c = cameraAt(tl, t);
  return { x: (x - c.cx) * c.z + 960 + c.sx, y: (y - c.cy) * c.z + 540 + c.sy, z: c.z };
}

/** World-space bounding box of an object at time t. */
export function worldBox(o: TObj, t: number): [number, number, number, number] {
  const [px, py] = sample(o.pos, t);
  const s = o.kind === "photo" ? 1 : sample(o.scale, t)[0];
  const [x, y, w, h] = o.box;
  return [px + (x - o.origin[0]) * s, py + (y - o.origin[1]) * s, w * s, h * s];
}

export const alive = (o: TObj, t: number) => t >= o.start && t < o.end;

/** Theme overrides as plain values. */
export function styleValues(tl: Timeline): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(tl.style ?? {}).map(([k, v]) => [k, v!.value]));
}
