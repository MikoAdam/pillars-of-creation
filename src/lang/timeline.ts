import type { Span } from "./parser";

export type ObjKind = "photo" | "count" | "bars" | "line" | "headline" | "say" | "arrow" | "circle" | "box" | "highlight";

export interface Seg {
  t0: number;
  t1: number;
  from: number[];
  to: number[];
  line: number;
  col: number;
  /** literal spans of the target values (undefined entries = non-literal) */
  toSpans: (Span | undefined)[];
  overSpan?: Span;
  label: string;
}

export interface Track {
  base: number[];
  segs: Seg[];
}

export interface Trans {
  t: number;
  d: number;
  kind: "crossfade" | "slide" | "zoom";
}

export interface TObj {
  id: string;
  kind: ObjKind;
  start: number;
  end: number;
  origin: [number, number];
  pos: Track;
  scale: Track;
  opacity: Track;
  /** 0..1 build progress for the creation "over" */
  progress: Track;
  data: Record<string, any>;
  lines: number[];
  createLine: number;
  createLineEnd: number; // offset where appended keywords go
  createSpans: { at?: (Span | undefined)[]; scale?: Span; from?: (Span | undefined)[]; to?: (Span | undefined)[] };
  enter?: Trans;
  exit?: Trans;
  /** local bounding box before transform [x, y, w, h] */
  box: [number, number, number, number];
}

export interface StmtInfo {
  line: number;
  endLine: number;
  before: number;
  after: number;
}

export interface Timeline {
  title: string;
  themeId: string;
  themeSpan?: Span;
  projectLine?: number;
  duration: number;
  objects: TObj[];
  stmts: StmtInfo[];
  transitions: (Trans | { t: number; d: 0; kind: "cut" })[];
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function sample(track: Track, t: number, linear = false): number[] {
  let v = track.base;
  for (const s of track.segs) {
    if (t < s.t0) break;
    if (t >= s.t1) v = s.to;
    else {
      const p = (t - s.t0) / Math.max(1e-6, s.t1 - s.t0);
      const e = linear ? p : easeInOut(p);
      v = s.from.map((f, i) => f + (s.to[i] - f) * e);
    }
  }
  return v;
}

export function addSeg(track: Track, seg: Seg) {
  track.segs.push(seg);
  track.segs.sort((a, b) => a.t0 - b.t0);
}

/** World-space bounding box of an object at time t. */
export function worldBox(o: TObj, t: number): [number, number, number, number] {
  const [px, py] = sample(o.pos, t);
  const s = o.kind === "photo" ? 1 : sample(o.scale, t)[0];
  const [x, y, w, h] = o.box;
  return [px + (x - o.origin[0]) * s, py + (y - o.origin[1]) * s, w * s, h * s];
}

export const alive = (o: TObj, t: number) => t >= o.start && t < o.end;
