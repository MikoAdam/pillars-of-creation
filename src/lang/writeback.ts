import type { Span } from "./parser";
import { anchorAt, geoEnds, mapCamAt, sample, type TObj, type Timeline } from "./timeline";
import { makeProjection } from "@/render/geo";

export interface Edit { span: Span; text: string }

/** Apply edits to exact spans only; never touches anything else. */
export function applyEdits(code: string, edits: Edit[]) {
  const sorted = [...edits].sort((a, b) => b.span[0] - a.span[0]);
  let out = code;
  for (const e of sorted) out = out.slice(0, e.span[0]) + e.text + out.slice(e.span[1]);
  return out;
}

const r0 = (v: number) => String(Math.round(v));
const r2 = (v: number) => String(Math.round(v * 100) / 100);
export const fmtDur = (v: number) => `${Math.round(v * 10) / 10}s`;

/** Keep a duration literal's "s" suffix style when replacing it. */
function durText(code: string, span: Span, v: number) {
  const old = code.slice(span[0], span[1]);
  const n = String(Math.round(v * 10) / 10);
  return old.endsWith("s") ? n + "s" : n;
}

function lineEnd(code: string, line: number) {
  let off = 0;
  for (let i = 0; i < line; i++) {
    const n = code.indexOf("\n", off);
    if (n < 0) return code.length;
    off = n + 1;
  }
  const n = code.indexOf("\n", off);
  return n < 0 ? code.length : n;
}

export function insertLineAfter(code: string, line: number, text: string) {
  const at = lineEnd(code, line);
  return code.slice(0, at) + "\n" + text + code.slice(at);
}

/** Insert a command so it starts at time T, adding a "delay" if needed. */
export function insertAtTime(code: string, tl: Timeline, T: number, text: string) {
  let pick: (typeof tl.stmts)[number] | undefined;
  for (const s of tl.stmts) if (s.after <= T + 1e-6) pick = s;
  const delay = pick ? T - pick.after : T;
  const line = text + (delay > 0.05 ? ` delay ${fmtDur(delay)}` : "");
  if (!pick) {
    if (tl.projectLine !== undefined) return { code: insertLineAfter(code, tl.projectLine, line), line: tl.projectLine + 1 };
    return { code: line + "\n" + code, line: 0 };
  }
  return { code: insertLineAfter(code, pick.endLine, line), line: pick.endLine + 1 };
}

function appendToCreate(code: string, o: TObj, text: string) {
  return code.slice(0, o.createLineEnd) + text + code.slice(o.createLineEnd);
}

/** Drag result: object should be at (nx, ny) at time T. */
export function writeMove(code: string, tl: Timeline, o: TObj, T: number, nx: number, ny: number): string {
  const segs = o.pos.segs.filter((s) => s.t0 <= T + 1e-6);
  const last = segs[segs.length - 1];
  if (last) {
    if (last.toSpans[0] && last.toSpans[1]) {
      return applyEdits(code, [{ span: last.toSpans[0], text: r0(nx) }, { span: last.toSpans[1], text: r0(ny) }]);
    }
    return insertAtTime(code, tl, T, `move ${o.id} to ${r0(nx)} ${r0(ny)} over 0.3s`).code;
  }
  const [cx, cy] = sample(o.pos, T);
  const dx = nx - cx, dy = ny - cy;
  const cs = o.createSpans;
  if (cs.from && cs.to) {
    if (cs.from.every(Boolean) && cs.to.every(Boolean)) {
      const v = (sp: Span, d: number) => ({ span: sp, text: r0(Number(code.slice(sp[0], sp[1])) + d) });
      return applyEdits(code, [v(cs.from[0]!, dx), v(cs.from[1]!, dy), v(cs.to[0]!, dx), v(cs.to[1]!, dy)]);
    }
    return insertAtTime(code, tl, T, `move ${o.id} to ${r0(nx)} ${r0(ny)} over 0.3s`).code;
  }
  const off = (o.data.cornerOffset as number[] | undefined) ?? [0, 0];
  const ax = nx - off[0], ay = ny - off[1];
  if (cs.at) {
    if (cs.at[0] && cs.at[1]) return applyEdits(code, [{ span: cs.at[0], text: r0(ax) }, { span: cs.at[1], text: r0(ay) }]);
    return insertAtTime(code, tl, T, `move ${o.id} to ${r0(nx)} ${r0(ny)} over 0.3s`).code;
  }
  return appendToCreate(code, o, ` at ${r0(ax)} ${r0(ay)}`);
}

export function writeScale(code: string, tl: Timeline, o: TObj, T: number, ns: number): string {
  const segs = o.scale.segs.filter((s) => s.t0 <= T + 1e-6);
  const last = segs[segs.length - 1];
  if (last) {
    if (last.toSpans[0]) return applyEdits(code, [{ span: last.toSpans[0], text: r2(ns) }]);
    return insertAtTime(code, tl, T, `scale ${o.id} ${r2(ns)} over 0.3s`).code;
  }
  if (o.createSpans.scale) return applyEdits(code, [{ span: o.createSpans.scale, text: r2(ns) }]);
  return appendToCreate(code, o, ` scale ${r2(ns)}`);
}

export function writeOver(code: string, span: Span, d: number) {
  const v = Math.max(0.1, Math.round(d * 10) / 10);
  return applyEdits(code, [{ span, text: durText(code, span, v) }]);
}

export function setTheme(code: string, tl: Timeline, name: string): string {
  if (tl.themeSpan) return applyEdits(code, [{ span: tl.themeSpan, text: name }]);
  if (tl.projectLine !== undefined) {
    const end = lineEnd(code, tl.projectLine);
    const lineText = code.slice(code.lastIndexOf("\n", end - 1) + 1, end);
    const hash = lineText.search(/\s*#/);
    const at = hash >= 0 ? end - lineText.length + hash : end;
    return code.slice(0, at) + ` theme ${name}` + code.slice(at);
  }
  return `project "Untitled" theme ${name}\n` + code;
}

/** Set one style value: edit its literal if the line exists, otherwise add a style line near the top. */
export function setStyle(code: string, tl: Timeline, key: string, valueText: string): string {
  const cur = tl.style[key];
  if (cur) return applyEdits(code, [{ span: cur.span, text: valueText }]);
  const lines = Object.values(tl.style).map((v) => v!.line);
  const after = lines.length ? Math.max(...lines) : tl.projectLine;
  const text = `style ${key} ${valueText}`;
  if (after === undefined) return text + "\n" + code;
  return insertLineAfter(code, after, text);
}

/** Back to the theme default: delete that style line. */
export function resetStyle(code: string, tl: Timeline, key: string): string {
  const cur = tl.style[key];
  if (!cur) return code;
  const ls = code.split("\n");
  ls.splice(cur.line, 1);
  return ls.join("\n");
}

type PropTrack = "rot" | "opacity";
const PROP = {
  rot: { create: "rotate" as const, cmd: (id: string, v: string) => `rotate ${id} ${v} over 0.3s`, fmt: r0 },
  opacity: { create: "opacity" as const, cmd: (id: string, v: string) => `fade ${id} to ${v} over 0.3s`, fmt: r2 },
};

/** Rotation / opacity from the canvas: edit the latest literal, else add a keyword or a command. */
export function writeProp(code: string, tl: Timeline, o: TObj, T: number, which: PropTrack, v: number): string {
  const cfg = PROP[which];
  const segs = o[which].segs.filter((s) => s.t0 <= T + 1e-6);
  const last = segs[segs.length - 1];
  if (last) {
    if (last.toSpans[0]) return applyEdits(code, [{ span: last.toSpans[0], text: cfg.fmt(v) }]);
    return insertAtTime(code, tl, T, cfg.cmd(o.id, cfg.fmt(v))).code;
  }
  const sp = o.createSpans[cfg.create];
  if (sp) return applyEdits(code, [{ span: sp, text: cfg.fmt(v) }]);
  return appendToCreate(code, o, ` ${cfg.create} ${cfg.fmt(v)}`);
}

/** Entrance / exit style on the creation line. `null` removes nothing but sets "fade". */
export function writeFx(code: string, o: TObj, which: "enter" | "exit", style: string): string {
  const fx = which === "enter" ? o.enterFx : o.exitFx;
  if (fx?.span) return applyEdits(code, [{ span: fx.span, text: style }]);
  return appendToCreate(code, o, ` ${which} ${style}`);
}

/** Remove an entrance / exit keyword pair from the creation line. */
export function removeFx(code: string, o: TObj, which: "enter" | "exit"): string {
  const fx = which === "enter" ? o.enterFx : o.exitFx;
  if (!fx?.span) return code;
  const kwStart = code.lastIndexOf(which, fx.span[0]);
  let a = kwStart;
  while (a > 0 && code[a - 1] === " ") a--;
  return code.slice(0, a) + code.slice(fx.span[1]);
}

/** Dragging a timeline block: make a line start at newStart by editing or adding its delay. */
export function writeStart(code: string, info: { base: number; delaySpan?: Span | undefined; hasDelay?: boolean | undefined; lineEnd: number }, newStart: number): string {
  const d = Math.max(0, Math.round((newStart - info.base) * 10) / 10);
  if (info.delaySpan) return applyEdits(code, [{ span: info.delaySpan, text: durText(code, info.delaySpan, d) }]);
  if (info.hasDelay) return code; // delay is an expression: leave it alone
  if (d < 0.05) return code;
  return code.slice(0, info.lineEnd) + ` delay ${fmtDur(d)}` + code.slice(info.lineEnd);
}

// ---------- maps ----------

const r2s = (v: number) => String(Math.round(v * 100) / 100);

/** Drag a map pin / bubble / label / tag: rewrite its lat lng literals. */
export function writeGeoMove(code: string, tl: Timeline, o: TObj, T: number, nx: number, ny: number): string {
  if (o.kind === "map") return writeMapPan(code, tl, o, T, nx - 960, ny - 540);
  const pr = makeProjection(mapCamAt(o.data.map, T));
  if (o.kind === "attack" || o.kind === "route") {
    const [ax, ay] = anchorAt(o, T);
    const dx = nx - ax, dy = ny - ay;
    const { a, b } = geoEnds(o, T);
    const ea = pr.unproject(a[0] + dx, a[1] + dy), eb = pr.unproject(b[0] + dx, b[1] + dy);
    return endEdits(code, o, [["a", ea], ["b", eb]]);
  }
  const at = o.createSpans.at;
  if (!at?.[0] || !at?.[1]) return code;
  const [lng, lat] = pr.unproject(nx, ny);
  return applyEdits(code, [{ span: at[0], text: r2s(lat) }, { span: at[1], text: r2s(lng) }]);
}

function endEdits(code: string, o: TObj, ends: ["a" | "b", [number, number]][]) {
  const edits: Edit[] = [];
  for (const [k, [lng, lat]] of ends) {
    const e = o.data.ends[k];
    if (e.spans[0] && e.spans[1]) edits.push({ span: e.spans[0], text: r2s(lat) }, { span: e.spans[1], text: r2s(lng) });
    else if (e.nameSpan) edits.push({ span: e.nameSpan, text: `${r2s(lat)} ${r2s(lng)}` });
  }
  return applyEdits(code, edits);
}

/** Drag an attack's start / end handle to a screen point. */
export function writeGeoEnd(code: string, o: TObj, T: number, which: "a" | "b", x: number, y: number): string {
  const pr = makeProjection(mapCamAt(o.data.map, T));
  return endEdits(code, o, [[which, pr.unproject(x, y)]]);
}

/** Drag an attack's curve handle: bend = sideways offset / length. */
export function writeBend(code: string, o: TObj, T: number, x: number, y: number): string {
  const { a, b } = geoEnds(o, T);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  // control point of a quadratic is twice as far out as the curve's midpoint
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const off = ((x - mx) * -dy + (y - my) * dx) / len2;
  const v = r2s(Math.max(-1, Math.min(1, off * 2)));
  if (o.data.bendSpan) return applyEdits(code, [{ span: o.data.bendSpan, text: v }]);
  return appendToCreate(code, o, ` bend ${v}`);
}

type CamKey = "pos" | "zoom" | "tilt" | "turn";

/** Map camera from the canvas: edit the latest fly literal at T, else the map line, else add a fly. */
export function writeMapCam(code: string, tl: Timeline, m: TObj, T: number, key: CamKey, vals: number[]): string {
  const fmt = key === "pos" || key === "zoom" ? r2s : r0;
  const txt = vals.map(fmt);
  const segs = (m.data.cam[key].segs as { t0: number; toSpans: (Span | undefined)[] }[]).filter((s) => s.t0 <= T + 1e-6);
  const last = segs[segs.length - 1];
  const kw = key === "pos" ? "" : ` ${key}`;
  if (last) {
    if (last.toSpans.length === vals.length && last.toSpans.every(Boolean)) return applyEdits(code, last.toSpans.map((sp, i) => ({ span: sp!, text: txt[i] })));
    return insertAtTime(code, tl, T, `fly${kw} ${txt.join(" ")} over 1s`).code;
  }
  const cs = m.data.camSpans;
  const spans: (Span | undefined)[] = key === "pos" ? cs.pos : [cs[key]];
  if (spans.length === vals.length && spans.every(Boolean)) return applyEdits(code, spans.map((sp, i) => ({ span: sp!, text: txt[i] })));
  if (key === "pos") return insertAtTime(code, tl, T, `fly ${txt.join(" ")} over 1s`).code;
  return appendToCreate(code, m, `${kw} ${txt[0]}`);
}

/** Drag the map itself: pan so the grabbed point follows the pointer. */
export function writeMapPan(code: string, tl: Timeline, m: TObj, T: number, dx: number, dy: number): string {
  const pr = makeProjection(mapCamAt(m, T));
  const [lng, lat] = pr.unproject(960 - dx, 540 - dy);
  return writeMapCam(code, tl, m, T, "pos", [lat, lng]);
}

/** Delete an object: remove every source line that created or later touched it. */
export function writeDelete(code: string, o: TObj): string {
  const remove = new Set(o.lines);
  remove.add(o.createLine);
  return code.split("\n").filter((_, i) => !remove.has(i)).join("\n");
}

function endSpan(e: { spans: (Span | undefined)[]; nameSpan?: Span }): Span | undefined {
  if (e.nameSpan) return e.nameSpan;
  const [s0, s1] = e.spans;
  if (s0 && s1) return [Math.min(s0[0], s1[0]), Math.max(s0[1], s1[1])];
  return undefined;
}

/** Swap an attack/route's start and end point by exchanging their source text. */
export function writeReverse(code: string, o: TObj): string {
  const ends = o.data.ends as { a: { spans: (Span | undefined)[]; nameSpan?: Span }; b: { spans: (Span | undefined)[]; nameSpan?: Span } } | undefined;
  if (!ends) return code;
  const sa = endSpan(ends.a), sb = endSpan(ends.b);
  if (!sa || !sb) return code;
  const ta = code.slice(sa[0], sa[1]), tb = code.slice(sb[0], sb[1]);
  return applyEdits(code, [{ span: sa, text: tb }, { span: sb, text: ta }]);
}

/** Recolour a map marker or arrow: edit its colour literal, or append one if it never had one. */
export function writeColor(code: string, o: TObj, value: string): string {
  const sp = o.data.colorSpan as Span | undefined;
  if (sp) return applyEdits(code, [{ span: sp, text: value }]);
  return appendToCreate(code, o, ` ${value}`);
}
