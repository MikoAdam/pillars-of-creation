import { LangError } from "./lexer";
import { FONT_CHOICES } from "@/render/theme";
import { parse, type Arg, type Expr, type Span, type Stmt } from "./parser";
import { MAP_COLORS, MAP_COLOR_NAMES, findCountry, findRegion, fitBbox, geoReady, normName, suggest, territoriesOf, type GeoFeature } from "@/render/geo";
import { EFFECTS, type EffectName } from "@/render/effectsSymbols";
import { SYMBOLS, type SymbolName } from "@/render/symbols";
import type { MapFill } from "@/render/scenes/map";
import { addSeg, emptyCamera, sample, EASES, EASE_NAMES, FX_STYLES, type FxStyle, type ObjKind, type Seg, type TObj, type Timeline, type Track, type Trans } from "./timeline";

export const THEME_NAMES: Record<string, string> = {
  clean_modern: "clean-modern",
};

export const STYLE_KEYS = ["background", "text", "accent", "display", "body", "radius", "grain", "caps"] as const;
export type StyleKey = (typeof STYLE_KEYS)[number];

export const COMMANDS = [
  "project", "style", "show", "zoom", "scale", "move", "fade", "caption", "source", "unverified", "wait",
  "cut", "crossfade", "slide", "count", "bars", "line", "headline", "say", "arrow", "circle", "box",
  "highlight", "voice", "subtitle", "rotate", "camera", "shake", "pulse", "wiggle", "wipe", "push", "whip", "blur",
  "map", "fly", "country", "region", "attack", "route", "pin", "bubble", "label", "tag", "year", "legend", "remove",
  "cinematic", "effect", "clear", "clearregions", "rename", "unrename",
  "let", "repeat", "for", "end",
];

export type RunResult =
  | { ok: true; timeline: Timeline }
  | { ok: false; error: { message: string; line: number; col: number; len: number } };

interface NumV { v: number; span?: Span }

const MAX_ITER = 5000;
const MAX_OBJECTS = 2000;
const W = 1920, H = 1080;

/** Per-command keyword arity. Words not listed are positional. */
const KW: Record<string, Record<string, number>> = {
  _common: { over: 1, as: 1, delay: 1, scale: 1, enter: 1, exit: 1, rotate: 1, ease: 1, curve: 1, opacity: 1 },
  camera: { to: 2, zoom: 1 },
  show: { at: 2, vignette: 1 },
  count: { unit: 1, prefix: 1, suffix: 1, label: 1, at: 2 },
  bars: { unit: 1, at: 2 },
  line: { unit: 1, at: 2 },
  headline: { body: 1, paper: 1, mark: 1, at: 2 },
  say: { at: 2, beat: 1 },
  arrow: { from: 2, to: 2 },
  highlight: { from: 2, to: 2 },
  circle: { at: 2, radius: 1 },
  box: { at: 2, size: 2 },
  move: { to: 2 },
  zoom: { to: 1 },
  fade: { to: 1 },
  map: { zoom: 1, tilt: 1, turn: 1, labels: 1 },
  fly: { zoom: 1, tilt: 1, turn: 1 },
  attack: { bend: 1, width: 1, head: 1 },
  pin: { size: 1 },
  label: { size: 1 },
  rename: { at: 2 },
};

export const MAP_ANIMS = ["pulse", "fade", "radial", "sweep", "none"] as const;
export const REMOVE_WHAT = ["last", "arrows", "pins", "labels", "colors", "effects", "lines", "legend", "year", "all"] as const;

interface Parsed {
  pos: Arg[];
  kw: Record<string, Arg[][]>; // keyword may repeat (mark)
}

export function run(src: string): RunResult {
  try {
    return { ok: true, timeline: interpret(src) };
  } catch (e) {
    if (e instanceof LangError) return { ok: false, error: { message: e.message, line: e.line, col: e.col, len: e.len } };
    return { ok: false, error: { message: String((e as Error)?.message ?? e), line: 0, col: 0, len: 1 } };
  }
}

export function interpret(src: string): Timeline {
  const prog = parse(src);
  const tl: Timeline = { title: "Untitled", themeId: "clean-modern", style: {}, duration: 0, objects: [], stmts: [], transitions: [], camera: emptyCamera() };
  const vars = new Map<string, number>();
  const objs = new Map<string, TObj>();
  const counters: Record<string, number> = {};
  let cursor = 0;
  let maxT = 0;
  let iter = 0;
  let pendingEnter: Trans | undefined;
  let curBase = 0, curDelaySpan: Span | undefined, curHasDelay = false, curLineEnd = 0;
  const bump = (t: number) => { if (t > maxT) maxT = t; };
  let curMap: TObj | undefined, legendObj: TObj | undefined, yearObj: TObj | undefined;
  const mapElems: (TObj | (MapFill & { line: number }))[] = [];
  const markerStack: TObj[] = []; // pins / bubbles / labels / tags / effects, in script order
  const needGeo = new Set<"countries" | "regions">();

  const err = (msg: string, a: { tok: { line: number; col: number; text: string } }) => {
    throw new LangError(msg, a.tok.line, a.tok.col, Math.max(1, a.tok.text.length));
  };

  function evalExpr(e: Expr): number {
    switch (e.k) {
      case "num": return e.v;
      case "var": {
        if (!vars.has(e.name)) throw new LangError(`Unknown variable "${e.name}"`, e.tok.line, e.tok.col, e.name.length);
        return vars.get(e.name)!;
      }
      case "neg": return -evalExpr(e.a);
      case "bin": {
        const a = evalExpr(e.a), b = evalExpr(e.b);
        switch (e.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": if (b === 0) throw new LangError("Division by zero", e.tok.line, e.tok.col); return a / b;
          case "%": return a % b;
        }
      }
    }
    return 0;
  }

  function num(a: Arg | undefined, what: string, near: { tok: any }): NumV {
    if (!a) return err(`Expected ${what}`, near);
    if (a.kind === "num") return { v: a.v, span: [a.tok.start, a.tok.end] };
    if (a.kind === "word") {
      if (!vars.has(a.name)) err(`Unknown variable "${a.name}" (expected ${what})`, a);
      return { v: vars.get(a.name)! };
    }
    if (a.kind === "expr") {
      const e = a.expr;
      // a plain negative literal keeps an editable span
      if (e.k === "neg" && e.a.k === "num") return { v: -e.a.v, span: [e.tok.start, e.a.tok.end] };
      return { v: evalExpr(e) };
    }
    return err(`Expected ${what}`, a);
  }
  function str(a: Arg | undefined, what: string, near: { tok: any }): string {
    if (!a || a.kind !== "str") return err(`Expected ${what} in quotes`, a ?? near);
    return a.v;
  }
  function word(a: Arg | undefined, what: string, near: { tok: any }): string {
    if (!a || a.kind !== "word") return err(`Expected ${what}`, a ?? near);
    return a.name;
  }

  function split(name: string, args: Arg[]): Parsed {
    const spec = { ...KW["_common"], ...(KW[name] ?? {}) };
    const out: Parsed = { pos: [], kw: {} };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.kind === "word" && spec[a.name] !== undefined) {
        const n = spec[a.name];
        const group = args.slice(i + 1, i + 1 + n);
        if (group.length < n) err(`"${a.name}" needs ${n} value${n > 1 ? "s" : ""}`, a);
        (out.kw[a.name] ??= []).push([a, ...group]);
        i += n;
      } else out.pos.push(a);
    }
    return out;
  }
  const kw1 = (p: Parsed, k: string) => p.kw[k]?.[0];

  function getObj(a: Arg | undefined, near: { tok: any }) {
    const id = word(a, "an object name", near);
    const o = objs.get(id);
    if (!o) err(`Unknown object "${id}"`, a!);
    return o!;
  }

  const track = (base: number[]): Track => ({ base, segs: [] });

  function makeObj(kind: ObjKind, p: Parsed, stmt: Extract<Stmt, { kind: "cmd" }>, start: number, origin: [number, number], box: TObj["box"], data: any): TObj {
    if (objs.size >= MAX_OBJECTS) err("Too many objects", { tok: stmt.nameTok });
    const asG = kw1(p, "as");
    let id: string;
    if (asG) id = word(asG[1], "a name after as", asG[0]);
    else {
      counters[kind] = (counters[kind] ?? 0) + 1;
      id = `${kind}${counters[kind]}`;
    }
    const atG = kw1(p, "at");
    let pos: [number, number] = origin;
    const createSpans: TObj["createSpans"] = {};
    if (atG) {
      const x = num(atG[1], "x", atG[0]), y = num(atG[2], "y", atG[0]);
      pos = [x.v, y.v];
      createSpans.at = [x.span, y.span];
    }
    const scG = kw1(p, "scale");
    let sc = 1;
    if (scG) {
      const s = num(scG[1], "scale", scG[0]);
      sc = s.v;
      createSpans.scale = s.span;
    }
    let rot = 0, opa = 1;
    const rG = kw1(p, "rotate");
    if (rG) { const r = num(rG[1], "degrees", rG[0]); rot = r.v; createSpans.rotate = r.span; }
    const oG = kw1(p, "opacity");
    if (oG) { const r = num(oG[1], "opacity 0..1", oG[0]); opa = Math.min(1, Math.max(0, r.v)); createSpans.opacity = r.span; }
    createSpans.delay = curDelaySpan;
    createSpans.hasDelay = curHasDelay;
    const fx = (k: "enter" | "exit") => {
      const g = kw1(p, k);
      if (!g) return undefined;
      const st = word(g[1], `an ${k} style`, g[0]) as FxStyle;
      if (!FX_STYLES.includes(st)) err(`Unknown ${k} style "${st}". Use ${FX_STYLES.join(", ")}`, g[1]);
      return { style: st, d: 0.6, span: [g[1].tok.start, g[1].tok.end] as Span };
    };
    const o: TObj = {
      id, kind, start, end: Infinity, origin, pos: track(pos), scale: track([sc]), opacity: track([opa]), rot: track([rot]),
      progress: track([1]), data, lines: [stmt.line], createLine: stmt.line, createLineEnd: stmt.ll.contentEnd,
      createSpans, box, base: curBase, enterFx: fx("enter"), exitFx: fx("exit"), pulses: [],
    };
    const overG = kw1(p, "over");
    if (overG) {
      const d = num(overG[1], "duration", overG[0]);
      o.progress = track([0]);
      addSeg(o.progress, { t0: start, t1: start + Math.max(0, d.v), from: [0], to: [1], line: stmt.line, col: overG[0].tok.col, toSpans: [], overSpan: d.span, label: "build", ...segMeta(p) });
      bump(start + d.v);
    }
    if (pendingEnter && start < pendingEnter.t + pendingEnter.d) o.enter = pendingEnter;
    objs.set(id, o);
    tl.objects.push(o);
    bump(start);
    return o;
  }

  function segMeta(p: Parsed) {
    const eG = kw1(p, "ease");
    let ease: string | undefined;
    if (eG) {
      ease = word(eG[1], "an ease name", eG[0]);
      if (!EASES[ease]) err(`Unknown ease "${ease}". Use ${EASE_NAMES.join(", ")}`, eG[1]);
    }
    const cG = kw1(p, "curve");
    const curve = cG ? num(cG[1], "a curve amount", cG[0]).v : undefined;
    return { ease, curve, base: curBase, delaySpan: curDelaySpan, hasDelay: curHasDelay, lineEnd: curLineEnd };
  }

  function animate(o: TObj, which: "pos" | "scale" | "opacity" | "rot", to: NumV[], p: Parsed, stmt: Extract<Stmt, { kind: "cmd" }>, start: number, from?: number[]) {
    const overG = kw1(p, "over");
    const d = overG ? num(overG[1], "duration", overG[0]) : { v: 0 };
    const tr = o[which];
    const f = from ?? sample(tr, start);
    const seg: Seg = {
      t0: start, t1: start + Math.max(0, d.v), from: f, to: to.map((x) => x.v), line: stmt.line, col: stmt.nameTok.col,
      toSpans: to.map((x) => x.span), overSpan: d.span, label: stmt.name, ...segMeta(p),
    };
    if (from) tr.base = from;
    addSeg(tr, seg);
    o.lines.push(stmt.line);
    bump(seg.t1);
  }

  /** each new scene starts with the camera back at rest */
  function resetCamera(at: number) {
    const c = tl.camera;
    const meta = { line: -1, col: 0, toSpans: [], label: "camera reset", base: at, hasDelay: false, lineEnd: 0 };
    if (c.pos.segs.length) addSeg(c.pos, { t0: at, t1: at, from: [960, 540], to: [960, 540], ...meta });
    if (c.zoom.segs.length) addSeg(c.zoom, { t0: at, t1: at, from: [1], to: [1], ...meta });
  }

  function endScene(at: number, trans?: Trans) {
    resetCamera(trans ? at + trans.d : at);
    if (curMap) for (const f of curMap.data.fills as (MapFill & { line: number })[]) if (f.end === Infinity) f.end = trans ? at + trans.d : at;
    curMap = undefined; legendObj = undefined; yearObj = undefined;
    for (const o of tl.objects) if (o.end === Infinity) {
      o.end = trans ? at + trans.d : at;
      if (trans) o.exit = trans;
    }
  }

  function exec(stmts: Stmt[], top: boolean) {
    for (const s of stmts) {
      if (++iter > MAX_ITER * 4) throw new LangError("Program too long (loop limit reached)", s.line, 0);
      const before = cursor;
      if (s.kind === "let") vars.set(s.name, evalExpr(s.expr));
      else if (s.kind === "repeat") {
        const n = Math.floor(evalExpr(s.count));
        if (n > MAX_ITER) throw new LangError(`repeat ${n} is too large`, s.line, 0, 6);
        for (let i = 0; i < n; i++) exec(s.body, false);
      } else if (s.kind === "for") {
        const a = evalExpr(s.from), b = evalExpr(s.to), st = s.step ? evalExpr(s.step) : a <= b ? 1 : -1;
        if (st === 0) throw new LangError("step cannot be 0", s.line, 0);
        if (Math.abs((b - a) / st) > MAX_ITER) throw new LangError("for loop is too large", s.line, 0, 3);
        for (let v = a; st > 0 ? v <= b + 1e-9 : v >= b - 1e-9; v += st) {
          vars.set(s.v, v);
          exec(s.body, false);
        }
      } else command(s);
      if (top) tl.stmts.push({ line: s.line, endLine: s.kind === "repeat" || s.kind === "for" ? s.endLine : s.line, before, after: cursor });
    }
  }

  function command(s: Extract<Stmt, { kind: "cmd" }>) {
    const p = split(s.name, s.args);
    const near = { tok: s.nameTok };
    const delayG = kw1(p, "delay");
    const dv = delayG ? num(delayG[1], "delay", delayG[0]) : undefined;
    const start = cursor + (dv ? Math.max(0, dv.v) : 0);
    curBase = cursor; curDelaySpan = dv?.span; curHasDelay = !!delayG; curLineEnd = s.ll.contentEnd;
    const src = (pAt: number) => p.pos[pAt];

    switch (s.name) {
      case "project": {
        tl.title = str(src(0), "a title", near);
        tl.projectLine = s.line;
        const th = p.pos.findIndex((a) => a.kind === "word" && a.name === "theme");
        if (th >= 0) {
          const name = word(p.pos[th + 1], "a theme name", p.pos[th]);
          if (!THEME_NAMES[name]) err(`Unknown theme "${name}". Use ${Object.keys(THEME_NAMES).join(", ")}`, p.pos[th + 1]);
          tl.themeId = THEME_NAMES[name];
          tl.themeSpan = [p.pos[th + 1].tok.start, p.pos[th + 1].tok.end];
        }
        return;
      }
      case "style": {
        const k = word(s.args[0], `a style name (${STYLE_KEYS.join(", ")})`, near) as StyleKey;
        if (!STYLE_KEYS.includes(k)) err(`Unknown style "${k}". Use ${STYLE_KEYS.join(", ")}`, s.args[0]);
        const v = s.args[1];
        if (!v) err(`Expected a value for style ${k}`, s.args[0]);
        const span: Span = [v.tok.start, v.tok.end];
        let value: string | number | boolean;
        if (k === "background" || k === "text" || k === "accent") {
          value = str(v, 'a color like "#ff6b4a"', near);
          if (!/^#[0-9a-f]{6}$/i.test(value)) err(`Color must look like "#ff6b4a"`, v);
        } else if (k === "display" || k === "body") {
          value = str(v, "a font name", near);
          if (!FONT_CHOICES.some((f) => f.name === value)) err(`Unknown font. Use ${FONT_CHOICES.map((f) => f.name).join(", ")}`, v);
        } else if (k === "caps") {
          value = word(v, "on or off", near);
          if (value !== "on" && value !== "off") err("Use on or off", v);
          value = value === "on";
        } else {
          value = num(v, "a number", near).v;
          value = k === "grain" ? Math.min(1, Math.max(0, value)) : Math.min(80, Math.max(0, value));
        }
        tl.style[k] = { value, span, line: s.line };
        return;
      }
      case "voice": {
        const a = src(0);
        if (!a || a.kind !== "asset") err("Expected an @audio name after voice", a ?? near);
        tl.voice = (a as { name: string }).name;
        return;
      }
      case "subtitle": {
        const a = num(src(0), "a start time", near).v, b = num(src(1), "an end time", near).v;
        const text = str(src(2), "subtitle text", near);
        if (b <= a) err("End time must be after start time", src(1)!);
        (tl.subs ??= []).push({ t0: Math.max(0, a), t1: b, text, line: s.line });
        bump(b);
        return;
      }
      case "wait": {
        const d = num(src(0), "a duration", near);
        cursor += Math.max(0, d.v);
        bump(cursor);
        return;
      }
      case "cut": endScene(start); pendingEnter = undefined; tl.transitions.push({ t: start, d: 0, kind: "cut" }); return;
      case "crossfade":
      case "slide":
      case "wipe":
      case "push":
      case "whip":
      case "blur": {
        const d = src(0) ? num(src(0), "a duration", near).v : 0.5;
        const tr: Trans = { t: start, d, kind: s.name as Trans["kind"] };
        endScene(start, tr);
        pendingEnter = tr;
        tl.transitions.push(tr);
        return;
      }
      case "show": {
        const kindW = word(src(0), '"photo"', near);
        if (kindW !== "photo") err('Only "show photo" is supported', src(0)!);
        const a = src(1);
        if (!a || a.kind !== "asset") err("Expected an @asset after show photo", a ?? src(0)!);
        const vg = kw1(p, "vignette");
        const o = makeObj("photo", p, s, start, [W / 2, H / 2], [0, 0, W, H], {
          asset: (a as any).name, vignette: !(vg && vg[1].kind === "word" && vg[1].name === "off"),
        });
        o.data.assetSpan = [a!.tok.start, a!.tok.end];
        return;
      }
      case "count": {
        const v = num(src(0), "a number", near);
        const dec = src(0)?.kind === "num" ? ((src(0)!.tok.text.replace(/s$/, "").split(".")[1] ?? "").length) : 0;
        const g = (k: string) => (kw1(p, k) ? str(kw1(p, k)![1], k, kw1(p, k)![0]) : "");
        makeObj("count", p, s, start, [W / 2, H / 2], [360, 220, 1200, 640], {
          value: v.v, decimals: dec, unit: g("unit"), prefix: g("prefix"), suffix: g("suffix"), label: g("label"),
        });
        return;
      }
      case "bars": {
        const title = str(src(0), "a chart title", near);
        const bars: { label: string; value: number }[] = [];
        for (let i = 1; i < p.pos.length; i += 2) {
          bars.push({ label: str(p.pos[i], "a bar label", near), value: num(p.pos[i + 1], "a bar value", p.pos[i]).v });
        }
        if (!bars.length) err("bars needs at least one label and value", near);
        const unit = kw1(p, "unit") ? str(kw1(p, "unit")![1], "unit", near) : "";
        makeObj("bars", p, s, start, [W / 2, H / 2], [80, 60, 1760, 980], { title, bars, unit });
        return;
      }
      case "line": {
        if (s.legacy) { mapCommand({ ...s, name: "route" }, p, start); return; } // connection line
        const title = str(src(0), "a chart title", near);
        const points: { x: string; y: number }[] = [];
        for (let i = 1; i < p.pos.length; i += 2) {
          const xa = p.pos[i];
          const x = xa.kind === "str" ? xa.v : xa.kind === "num" ? xa.tok.text : err("Expected a point label", xa);
          points.push({ x, y: num(p.pos[i + 1], "a y value", xa).v });
        }
        if (points.length < 2) err("line needs at least two points", near);
        const unit = kw1(p, "unit") ? str(kw1(p, "unit")![1], "unit", near) : "";
        makeObj("line", p, s, start, [W / 2, H / 2], [80, 60, 1760, 980], { title, points, unit });
        return;
      }
      case "headline": {
        const headline = str(src(0), "a headline", near);
        const body = kw1(p, "body") ? str(kw1(p, "body")![1], "body text", near) : "";
        const paper = kw1(p, "paper") ? str(kw1(p, "paper")![1], "paper name", near) : "";
        const marks = (p.kw["mark"] ?? []).map((g) => str(g[1], "a phrase", g[0]));
        makeObj("headline", p, s, start, [W / 2, H / 2], [300, 150, 1320, 780], { headline, body, paper, marks });
        return;
      }
      case "say": {
        const text = str(src(0), "text", near);
        const beatG = kw1(p, "beat");
        const beat = beatG ? num(beatG[1], "beat", beatG[0]).v : 0.3;
        const len = text.length;
        const w = Math.min(1640, len * 150 * 0.45);
        const lines = Math.max(1, Math.ceil((len * 150 * 0.45) / 1640));
        const h = Math.min(820, lines * 162);
        makeObj("say", p, s, start, [W / 2, H / 2], [W / 2 - w / 2, H / 2 - h / 2, w, h], { text, beat: Math.max(0.05, beat) });
        return;
      }
      case "arrow":
      case "highlight": {
        if (s.legacy && s.name === "arrow") { mapCommand({ ...s, name: "tag" }, p, start); return; } // pointer label
        const fg = kw1(p, "from"), tg = kw1(p, "to");
        if (!fg || !tg) err(`${s.name} needs "from x y to x y"`, near);
        const x1 = num(fg![1], "x", fg![0]), y1 = num(fg![2], "y", fg![0]);
        const x2 = num(tg![1], "x", tg![0]), y2 = num(tg![2], "y", tg![0]);
        const pad = s.name === "highlight" ? 30 : 30;
        const minx = Math.min(x1.v, x2.v) - pad, miny = Math.min(y1.v, y2.v) - pad;
        const o = makeObj(s.name, p, s, start, [(x1.v + x2.v) / 2, (y1.v + y2.v) / 2],
          [minx, miny, Math.abs(x2.v - x1.v) + pad * 2, Math.abs(y2.v - y1.v) + pad * 2],
          { a: [x1.v, y1.v], b: [x2.v, y2.v] });
        o.createSpans.from = [x1.span, y1.span];
        o.createSpans.to = [x2.span, y2.span];
        return;
      }
      case "circle": {
        const ag = kw1(p, "at");
        if (!ag) err('circle needs "at x y"', near);
        const r = kw1(p, "radius") ? num(kw1(p, "radius")![1], "radius", near).v : 80;
        const cx = num(ag![1], "x", ag![0]).v, cy = num(ag![2], "y", ag![0]).v;
        makeObj("circle", p, s, start, [cx, cy], [cx - r - 10, cy - r - 10, 2 * r + 20, 2 * r + 20], { r });
        return;
      }
      case "box": {
        const ag = kw1(p, "at");
        if (!ag) err('box needs "at x y size w h"', near);
        const sg = kw1(p, "size");
        const w = sg ? num(sg[1], "width", sg[0]).v : 200, h = sg ? num(sg[2], "height", sg[0]).v : 120;
        const x = num(ag![1], "x", ag![0]).v, y = num(ag![2], "y", ag![0]).v;
        makeObj("box", p, s, start, [x + w / 2, y + h / 2], [x - 6, y - 6, w + 12, h + 12], { w, h });
        // "at" is the top-left corner; position track uses the center
        const o = tl.objects[tl.objects.length - 1];
        o.pos.base = [x + w / 2, y + h / 2];
        o.data.cornerOffset = [w / 2, h / 2];
        return;
      }
      case "caption": {
        const o = getObj(src(0), near);
        o.data.caption = str(src(1), "caption text", src(0)!);
        o.lines.push(s.line);
        return;
      }
      case "source": {
        const o = getObj(src(0), near);
        const text = str(src(1), "source name", src(0)!);
        const u = src(2);
        o.data.source = { text, url: u && u.kind === "url" ? u.v : "" };
        o.lines.push(s.line);
        return;
      }
      case "unverified": {
        const o = getObj(src(0), near);
        o.data.unverified = true;
        o.lines.push(s.line);
        return;
      }
      case "move": {
        const o = getObj(src(0), near);
        const tg = kw1(p, "to");
        if (!tg) err('move needs "to x y"', near);
        animate(o, "pos", [num(tg![1], "x", tg![0]), num(tg![2], "y", tg![0])], p, s, start);
        return;
      }
      case "zoom": {
        if (s.legacy && src(0)?.kind === "word") {
          // zoom: COUNTRY — frame the country smoothly, block 0.6s
          if (!geoReady("countries")) { needGeo.add("countries"); return; }
          const f = country(src(0), s);
          if (f) {
            const m = needMap(s);
            const c = fitBbox(f.bbox, 0.07);
            camSeg(m.data.cam.pos, [{ v: c.lat }, { v: c.lng }], p, s, start, { v: 0.6 }, "smooth");
            camSeg(m.data.cam.zoom, [{ v: Math.min(8, c.zoom) }], p, s, start, { v: 0.6 }, "smooth");
            cursor = Math.max(cursor, start + 0.6);
            bump(cursor);
            m.lines.push(s.line);
          }
          return;
        }
        const first = src(0);
        if (!first || first.kind === "num") {
          // zoom transition
          const d = first ? num(first, "a duration", near).v : 0.5;
          const tr: Trans = { t: start, d, kind: "zoom" };
          endScene(start, tr);
          pendingEnter = tr;
          tl.transitions.push(tr);
          return;
        }
        const o = getObj(first, near);
        const tg = kw1(p, "to");
        const fromV = src(1) ? num(src(1), "start scale", near).v : undefined;
        const target = tg ? num(tg[1], "scale", tg[0]) : src(1) ? num(src(1), "scale", near) : err("zoom needs a target scale", near);
        animate(o, "scale", [target], p, s, start, tg && fromV !== undefined ? [fromV] : undefined);
        return;
      }
      case "scale": {
        const o = getObj(src(0), near);
        animate(o, "scale", [num(src(1), "a scale", src(0)!)], p, s, start);
        return;
      }
      case "rotate": {
        const o = getObj(src(0), near);
        animate(o, "rot", [num(src(1), "degrees", src(0)!)], p, s, start);
        return;
      }
      case "camera": {
        const tg = kw1(p, "to"), zg = kw1(p, "zoom");
        if (!tg && !zg) err('camera needs "to x y" and/or "zoom k"', near);
        const cam = tl.camera;
        const mk = (tr: Track, to: NumV[]) => {
          const overG = kw1(p, "over");
          const d = overG ? num(overG[1], "duration", overG[0]) : { v: 0, span: undefined };
          addSeg(tr, { t0: start, t1: start + Math.max(0, d.v), from: sample(tr, start), to: to.map((x) => x.v), line: s.line, col: s.nameTok.col,
            toSpans: to.map((x) => x.span), overSpan: d.span, label: "camera", ...segMeta(p) });
          bump(start + d.v);
        };
        if (tg) mk(cam.pos, [num(tg[1], "x", tg[0]), num(tg[2], "y", tg[0])]);
        if (zg) mk(cam.zoom, [num(zg[1], "zoom", zg[0])]);
        return;
      }
      case "shake": {
        const amt = src(0) ? num(src(0), "a shake amount", near).v : 20;
        const overG = kw1(p, "over");
        const d = overG ? num(overG[1], "duration", overG[0]).v : 0.5;
        tl.camera.shakes.push({ t0: start, t1: start + d, amt });
        bump(start + d);
        return;
      }
      case "pulse":
      case "wiggle": {
        const o = getObj(src(0), near);
        const amt = src(1) ? num(src(1), "an amount", src(0)!).v : s.name === "pulse" ? 0.15 : 8;
        const overG = kw1(p, "over");
        const d = overG ? num(overG[1], "duration", overG[0]).v : 0.6;
        o.pulses.push({ t0: start, t1: start + d, amt, kind: s.name as "pulse" | "wiggle" });
        o.lines.push(s.line);
        bump(start + d);
        return;
      }
      case "fade": {
        const o = getObj(src(0), near);
        const tg = kw1(p, "to");
        const w = src(1);
        const target = tg ? num(tg[1], "opacity", tg[0]) : w?.kind === "word" && w.name === "out" ? { v: 0 } : w?.kind === "word" && w.name === "in" ? { v: 1 } : err('fade needs "to 0..1", "in" or "out"', near);
        animate(o, "opacity", [target], p, s, start);
        return;
      }
      default:
        if (mapCommand(s, p, start)) return;
        err(`Unknown command "${s.name}"`, near);
    }
  }

  // ---------- maps ----------
  const measureBubble = (text: string) => {
    // dark card: 20px text, padding 21x29, max width 506px (380 CSS px scaled)
    const lines = Math.max(1, Math.ceil((text.length * 10.4) / 448));
    return { w: Math.min(506, Math.max(160, text.length * 10.4 + 58)), h: lines * 32 + 42 };
  };
  const measureSubtitle = (text: string) => {
    // subtitle bubble: fixed 72% width capped at 1146px, bottom-centre
    const lines = Math.max(1, Math.ceil((text.length * 10.4) / 1060));
    return { w: 1146, h: lines * 34 + 42 };
  };
  const nearOf = (s: Extract<Stmt, { kind: "cmd" }>) => ({ tok: s.nameTok });

  function needMap(s: Extract<Stmt, { kind: "cmd" }>): TObj {
    if (!curMap) err(`Start a map first, for example: map 48 15 zoom 4`, nearOf(s));
    return curMap!;
  }

  function country(a: Arg, s: Extract<Stmt, { kind: "cmd" }>): GeoFeature | null {
    const name = a.kind === "str" ? a.v : word(a, "a country name", nearOf(s));
    if (!geoReady("countries")) { needGeo.add("countries"); return null; }
    const f = findCountry(name);
    if (!f) {
      const sg = suggest("countries", name);
      err(`Unknown country "${name}"${sg.length ? `. Did you mean ${sg.map((x) => (x.includes(" ") ? `"${x.toLowerCase()}"` : x.toLowerCase())).join(", ")}?` : ". Use quotes for names with spaces"}`, a);
    }
    return f!;
  }

  function color(a: Arg | undefined, s: Extract<Stmt, { kind: "cmd" }>, fallback?: string): string {
    if (!a) { if (fallback) return fallback; err(`Expected a colour (${MAP_COLOR_NAMES.slice(0, 8).join(", ")}…)`, nearOf(s)); }
    if (a!.kind === "str" && /^#[0-9a-f]{6}$/i.test(a!.v)) return a!.v;
    if (a!.kind === "word" && /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(a!.name)) return a!.name;
    if (a!.kind === "word" && MAP_COLORS[a!.name]) return MAP_COLORS[a!.name];
    return err(`Unknown colour. Use ${MAP_COLOR_NAMES.join(", ")} or "#rrggbb"`, a!);
  }

  /** A place: "lat lng" numbers or a country name. Returns [lng, lat] and how many args it used. */
  function place(args: Arg[], i: number, s: Extract<Stmt, { kind: "cmd" }>) {
    const a = args[i];
    if (!a) return err("Expected a place: lat lng, or a country", nearOf(s));
    if (a.kind === "num" || a.kind === "expr") {
      const lat = num(a, "latitude", nearOf(s)), lng = num(args[i + 1], "longitude", a);
      return { ll: [lng.v, lat.v] as [number, number], used: 2, spans: [lat.span, lng.span] as (Span | undefined)[], nameSpan: undefined as Span | undefined };
    }
    const f = country(a, s);
    return { ll: (f?.center ?? [0, 0]) as [number, number], used: 1, spans: [] as (Span | undefined)[], nameSpan: [a.tok.start, a.tok.end] as Span };
  }

  function camSeg(tr: Track, to: NumV[], p: Parsed, s: Extract<Stmt, { kind: "cmd" }>, start: number, d: NumV, ease?: string) {
    const meta = segMeta(p);
    addSeg(tr, { t0: start, t1: start + Math.max(0, d.v), from: sample(tr, start), to: to.map((x) => x.v), line: s.line, col: s.nameTok.col,
      toSpans: to.map((x) => x.span), overSpan: d.span, label: "fly", ...meta, ease: meta.ease ?? ease });
    bump(start + d.v);
  }

  function geoObj(kind: ObjKind, p: Parsed, s: Extract<Stmt, { kind: "cmd" }>, start: number, data: any): TObj {
    const m = needMap(s);
    const o = makeObj(kind, p, s, start, [0, 0], [0, 0, 0, 0], { geo: true, map: m, ...data });
    mapElems.push(o);
    if (kind === "pin" || kind === "bubble" || kind === "label" || kind === "tag" || kind === "effect") markerStack.push(o);
    return o;
  }

  /** Original fill-in durations, in seconds (executor + renderer.js). */
  const FILL_DUR: Record<MapFill["anim"], number> = { none: 0.05, pulse: 1.8, fade: 1.5, radial: 1.8, sweep: 1.8 };

  function applyFill(m: TObj, f: GeoFeature | null, col: string, anim: MapFill["anim"], d: number, occupied: boolean, isRegion: boolean, start: number, line: number) {
    const fills = m.data.fills as (MapFill & { line: number; key: string; isRegion: boolean })[];
    const fill = { feature: f, color: col, anim, t0: start, d, end: Infinity, occupied, isRegion, line, key: f?.name ?? "" };
    fills.push(fill);
    mapElems.push(fill);
    m.lines.push(line);
    bump(start + d);
  }

  function mapCommand(s: Extract<Stmt, { kind: "cmd" }>, p: Parsed, start: number): boolean {
    const near = nearOf(s);
    const A = p.pos;
    switch (s.name) {
      case "map": {
        if (curMap) endScene(start);
        let lat: NumV = { v: 30 }, lng: NumV = { v: 10 }, zoom: NumV = { v: 1.3 };
        let center: (Span | undefined)[] = [];
        if (A[0] && (A[0].kind === "num" || A[0].kind === "expr")) {
          lat = num(A[0], "latitude", near); lng = num(A[1], "longitude", A[0]); center = [lat.span, lng.span];
        } else if (A[0]) {
          const f = country(A[0], s);
          if (f) { const c = fitBbox(f.bbox); lat = { v: c.lat }; lng = { v: c.lng }; zoom = { v: c.zoom }; }
        }
        const zg = kw1(p, "zoom"); if (zg) zoom = num(zg[1], "zoom", zg[0]);
        const tg = kw1(p, "tilt"), bg = kw1(p, "turn");
        const tilt = tg ? num(tg[1], "tilt degrees", tg[0]) : { v: 0 };
        const turn = bg ? num(bg[1], "turn degrees", bg[0]) : { v: 0 };
        const lg = kw1(p, "labels");
        const o = makeObj("map", p, s, start, [W / 2, H / 2], [0, 0, W, H], {
          cam: { pos: track([lat.v, lng.v]), zoom: track([zoom.v]), tilt: track([tilt.v]), turn: track([turn.v]) },
          camSpans: { pos: center, zoom: zoom.span, tilt: tilt.span, turn: turn.span },
          fills: [], labels: !(lg && lg[1].kind === "word" && lg[1].name === "off"),
        });
        o.data.camSpans.hasZoom = !!zg; o.data.camSpans.hasTilt = !!tg; o.data.camSpans.hasTurn = !!bg;
        curMap = o;
        return true;
      }
      case "fly": {
        const m = needMap(s);
        const cam = m.data.cam;
        if (s.legacy) {
          // fly: LAT, LNG, ZOOM — smooth flyTo, blocks the script for 1.2s
          const lat = A[0] && (A[0].kind === "num" || A[0].kind === "expr") ? num(A[0], "latitude", near).v : NaN;
          const lng = A[1] && (A[1].kind === "num" || A[1].kind === "expr") ? num(A[1], "longitude", A[0]).v : NaN;
          const z = A[2] && (A[2].kind === "num" || A[2].kind === "expr") ? num(A[2], "zoom", A[1] ?? near).v : NaN;
          if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(z)) return true; // original silently skips
          camSeg(cam.pos, [{ v: lat }, { v: lng }], p, s, start, { v: 1.2 }, "smooth");
          camSeg(cam.zoom, [{ v: z }], p, s, start, { v: 1.2 }, "smooth");
          camSeg(cam.tilt, [{ v: 0 }], p, s, start, { v: 1.2 }, "smooth");
          camSeg(cam.turn, [{ v: 0 }], p, s, start, { v: 1.2 }, "smooth");
          cursor = Math.max(cursor, start + 1.2);
          bump(cursor);
          m.lines.push(s.line);
          return true;
        }
        const overG = kw1(p, "over");
        const d = overG ? num(overG[1], "duration", overG[0]) : { v: 1.5 };
        let any = false;
        if (A[0]) {
          if (A[0].kind === "num" || A[0].kind === "expr") {
            camSeg(cam.pos, [num(A[0], "latitude", near), num(A[1], "longitude", A[0])], p, s, start, d);
          } else {
            const f = country(A[0], s);
            const c = f ? fitBbox(f.bbox) : { lat: 0, lng: 0, zoom: 2 };
            camSeg(cam.pos, [{ v: c.lat }, { v: c.lng }], p, s, start, d);
            if (!kw1(p, "zoom")) camSeg(cam.zoom, [{ v: c.zoom }], p, s, start, d);
          }
          any = true;
        }
        for (const k of ["zoom", "tilt", "turn"] as const) {
          const g = kw1(p, k);
          if (g) { camSeg(cam[k], [num(g[1], k, g[0])], p, s, start, d); any = true; }
        }
        if (!any) err("fly needs a place (lat lng or a country) and/or zoom, tilt, turn", near);
        m.lines.push(s.line);
        return true;
      }
      case "country":
      case "region": {
        const m = needMap(s);
        let f: GeoFeature | null = null;
        let i = 1;
        if (s.name === "country") {
          if (!A[0]) err("Expected a country name", near);
          f = country(A[0], s);
        } else {
          const rn = A[0], cn = A[1];
          if (!rn || !cn) err("region needs a region name and its country, e.g. region crimea ukraine red occupied", near);
          const rname = rn.kind === "str" ? rn.v : word(rn, "a region name", near);
          const cname = cn.kind === "str" ? cn.v : word(cn, "a country name", rn);
          i = 2;
          if (!geoReady("regions") || !geoReady("countries")) { needGeo.add("regions"); needGeo.add("countries"); f = null; }
          else {
            f = findRegion(rname, cname) ?? null;
            if (!f && !s.legacy) { const sg = suggest("regions", rname, cname); err(`Unknown region "${rname}" in ${cname}${sg.length ? `. Try ${sg.join(", ")}` : ""}`, rn); }
          }
        }
        if (s.legacy) {
          // the original silently skips unknown features
          if (!f) return true;
          const col = color(A[i], s);
          let anim: MapFill["anim"] = "none";
          let occupied = false;
          for (const a of A.slice(i + 1)) {
            if (a.kind !== "word") continue;
            if (a.name === "occupied") occupied = true;
            else if ((MAP_ANIMS as readonly string[]).includes(a.name)) anim = a.name as MapFill["anim"];
          }
          const d = FILL_DUR[anim];
          if (s.name === "country") {
            // countries also colour nearby territories of the same sovereign
            applyFill(m, f, col, anim, d, occupied, false, start, s.line);
            for (const t of territoriesOf(f)) applyFill(m, t, col, anim, d, false, false, start, s.line);
          } else applyFill(m, f, col, anim, d, occupied, true, start, s.line);
          return true;
        }
        if (!f) err(`Unknown ${s.name} "${A[0]!.kind === "str" ? A[0]!.v : (A[0] as any).text ?? (A[0] as any).name}"`, A[0]!);
        const col = color(A[i], s);
        let anim: MapFill["anim"] = "fade", occupied = false;
        for (const a of A.slice(i + 1)) {
          const w = word(a, `an animation (${MAP_ANIMS.join(", ")}) or occupied`, near);
          if (w === "occupied") occupied = true;
          else if ((MAP_ANIMS as readonly string[]).includes(w)) anim = w as MapFill["anim"];
          else err(`Unknown option "${w}". Use ${MAP_ANIMS.join(", ")} or occupied`, a);
        }
        const overG = kw1(p, "over");
        const d = overG ? num(overG[1], "duration", overG[0]).v : FILL_DUR[anim];
        // fills stack: a later colour simply draws over the earlier one
        applyFill(m, f, col, anim, d, occupied, s.name === "region", start, s.line);
        return true;
      }
      case "attack":
      case "route": {
        if (s.legacy) {
          if (s.name === "route") {
            // line: ORIGIN, TARGET, COLOR — two countries → dashed straight line; coordinates → thin arrow
            if (!geoReady("countries")) { needGeo.add("countries"); return true; }
            if (A[0] && (A[0].kind === "num" || A[0].kind === "expr")) {
              const aLL: [number, number] = [num(A[1], "longitude", A[0]).v, num(A[0], "latitude", near).v];
              const bLL: [number, number] = A[3] ? [num(A[3], "longitude", A[2]).v, num(A[2], "latitude", A[1] ?? near).v] : aLL;
              const col = A[4] ? color(A[4], s) : MAP_COLORS["blue"];
              p.kw["over"] = [[{ kind: "word", name: "over", tok: s.nameTok }, { kind: "num", v: 0.8, isDur: true, tok: s.nameTok }]];
              geoObj("attack", p, s, start, { a: aLL, b: bLL, color: col, bend: 0, width: 0.5, head: 0.5 });
              return true;
            }
            const f1 = A[0] ? country(A[0], s) : null;
            const f2 = A[1] ? country(A[1], s) : null;
            const col = A[2] ? color(A[2], s) : MAP_COLORS["blue"];
            if (!f1 || !f2) return true; // the original silently skips unresolved endpoints
            p.kw["over"] = [[{ kind: "word", name: "over", tok: s.nameTok }, { kind: "num", v: 0.8, isDur: true, tok: s.nameTok }]];
            geoObj("route", p, s, start, { a: f1.center, b: f2.center, color: col, bend: 0, width: 2, head: 0, straight: true });
            return true;
          }
          // attack: E1, E2, COLOR[, CURVE, WIDTH, HEAD, DUR] — or the named form:
          // attack: from LAT LNG, to LAT LNG, color C, curve N, width N, head N, dur MS
          let ai = 0;
          let aLL: [number, number], bLL: [number, number];
          let aSpans: (Span | undefined)[] = [], bSpans: (Span | undefined)[] = [];
          let aName: Span | undefined, bName: Span | undefined;
          if (A[0]?.kind === "word" && A[0].name === "from") {
            const la = num(A[1], "latitude", A[0]), ln = num(A[2], "longitude", A[1] ?? A[0]);
            aLL = [ln.v, la.v]; aSpans = [la.span, ln.span]; ai = 3;
          } else {
            const pl = place(A, 0, s); aLL = pl.ll; aSpans = pl.spans; aName = pl.nameSpan; ai = pl.used;
          }
          const toArg = A[ai];
          if (toArg?.kind === "word" && toArg.name === "to") {
            const la = num(A[ai + 1], "latitude", toArg), ln = num(A[ai + 2], "longitude", A[ai + 1] ?? toArg);
            bLL = [ln.v, la.v]; bSpans = [la.span, ln.span]; ai += 3;
          } else {
            const pl = place(A, ai, s); bLL = pl.ll; bSpans = pl.spans; bName = pl.nameSpan; ai += pl.used;
          }
          let curve = kw1(p, "curve") ? num(kw1(p, "curve")![1], "curve", kw1(p, "curve")![0]).v : 0.15;
          let width = 1, head = NaN, dur = 0.8, slot = 0;
          let col = MAP_COLORS["red"];
          const FIELD = ["curve", "width", "head", "dur", "anim"];
          const colArg = A[ai];
          if (colArg && (colArg.kind === "word" || colArg.kind === "str") && !(colArg.kind === "word" && FIELD.includes(colArg.name))) { col = color(colArg, s); ai++; }
          while (ai < A.length) {
            const a2 = A[ai];
            if (a2.kind === "word" && FIELD.includes(a2.name)) {
              if (a2.name === "curve") { curve = num(A[ai + 1], "curve", a2).v; slot = 1; }
              else if (a2.name === "width") { width = num(A[ai + 1], "width", a2).v; slot = 2; }
              else if (a2.name === "head") { head = num(A[ai + 1], "head", a2).v; }
              else if (a2.name === "dur") { dur = num(A[ai + 1], "duration", a2).v; }
              ai += 2;
            } else if (a2.kind === "num" || a2.kind === "expr") {
              const v = num(a2, "a number", near).v;
              if (slot === 0) { curve = v; slot = 1; }
              else if (slot === 1) { width = v; slot = 2; }
              else if (slot === 2) { head = v; slot = 3; }
              else { dur = v; }
              ai++;
            } else ai++; // stray animation word etc.
          }
          head = Number.isNaN(head) ? width : head;
          p.kw["over"] = [[{ kind: "word", name: "over", tok: s.nameTok }, { kind: "num", v: Math.max(0.05, dur), isDur: true, tok: s.nameTok }]];
          const o = geoObj("attack", p, s, start, { a: aLL, b: bLL, color: col, bend: curve, width, head });
          o.data.ends = { a: { spans: aSpans, nameSpan: aName }, b: { spans: bSpans, nameSpan: bName } };
          return true;
        }
        const a = place(A, 0, s);
        const b = place(A, a.used, s);
        const col = color(A[a.used + b.used], s, s.name === "route" ? MAP_COLORS["blue"] : MAP_COLORS["red"]);
        const g = (k: string, def: number) => (kw1(p, k) ? num(kw1(p, k)![1], k, kw1(p, k)![0]) : { v: def });
        const bend = g("bend", 0.18), width = g("width", 1), head = g("head", 1);
        if (!kw1(p, "over")) p.kw["over"] = [[{ kind: "word", name: "over", tok: s.nameTok }, { kind: "num", v: s.name === "attack" ? 1.2 : 1, isDur: true, tok: s.nameTok }]];
        const o = geoObj(s.name, p, s, start, { a: a.ll, b: b.ll, color: col, bend: bend.v, width: width.v, head: head.v });
        o.progress.segs[0].overSpan = kw1(p, "over")![1].tok === s.nameTok ? undefined : o.progress.segs[0].overSpan;
        o.data.ends = { a: { spans: a.spans, nameSpan: a.nameSpan }, b: { spans: b.spans, nameSpan: b.nameSpan } };
        o.data.bendSpan = bend.span;
        return true;
      }
      case "pin":
      case "bubble":
      case "label":
      case "tag": {
        // subtitle-style bubble: no coordinates — fixed to the bottom-centre of the frame
        const sub = s.name === "bubble" && (s.legacy || !A[0] || A[0].kind === "str");
        if (sub) {
          const text = str(A[0], "bubble text", near);
          const col = A[1] ? color(A[1], s) : "#4cd964";
          const lay = measureSubtitle(text);
          const o = geoObj("bubble", p, s, start, { text, color: col, subtitle: true, rel: [-lay.w / 2, -lay.h, lay.w, lay.h] });
          o.origin = [W / 2, H - 13];
          o.pos.base = [W / 2, H - 13];
          o.box = [W / 2 - lay.w / 2, H - 13 - lay.h, lay.w, lay.h];
          return true;
        }
        const lat = num(A[0], "latitude", near), lng = num(A[1], "longitude", A[0] ?? near);
        let data: any = { lat: lat.v, lng: lng.v };
        let rel: number[];
        if (s.name === "pin") {
          const sym = word(A[2], `a symbol (${SYMBOLS.join(", ")})`, A[1] ?? near) as SymbolName;
          if (!SYMBOLS.includes(sym)) err(`Unknown symbol "${sym}". Use ${SYMBOLS.join(", ")}`, A[2]);
          const size = kw1(p, "size") ? num(kw1(p, "size")![1], "size", kw1(p, "size")![0]).v : 1;
          data = { ...data, symbol: sym, color: color(A[3], s, MAP_COLORS["red"]), size };
          const r = 30 * size;
          rel = [-r, -r, 2 * r, 2 * r];
        } else if (s.name === "bubble") {
          const text = str(A[2], "bubble text", A[1] ?? near);
          data = { ...data, text, color: color(A[3], s, "#4cd964") };
          const lay = measureBubble(text);
          rel = [-lay.w / 2, -lay.h - 13, lay.w, lay.h + 13];
        } else if (s.name === "label") {
          const text = str(A[2], "label text", A[1] ?? near);
          const size = kw1(p, "size") ? num(kw1(p, "size")![1], "size", kw1(p, "size")![0]).v : s.legacy ? 14 : 18;
          data = { ...data, text, size, color: color(A[3], s, s.legacy ? "#ffffff" : "#0f172a") };
          const w = text.length * size * 1.15 + 20;
          rel = [-w / 2, -size * 1.3, w, size * 2.6];
        } else {
          const text = str(A[2], "tag text", A[1] ?? near);
          const dir = A[3] ? word(A[3], "left or right", A[2]) : "right";
          if (dir !== "left" && dir !== "right") err("Use left or right", A[3]);
          data = { ...data, text, dir, color: color(A[4], s, s.legacy ? "#ffffff" : MAP_COLORS["red"]) };
          const cw = Math.min(426, text.length * 10 + 48), ch = 60;
          rel = dir === "right" ? [0, -ch / 2, 80 + cw, ch] : [-80 - cw, -ch / 2, 80 + cw, ch];
        }
        const o = geoObj(s.name as ObjKind, p, s, start, { ...data, rel });
        o.createSpans.at = [lat.span, lng.span];
        return true;
      }
      case "year": {
        const text = s.legacy && A[0] && (A[0].kind === "num" || A[0].kind === "expr")
          ? String(num(A[0], "a year", near).v)
          : str(A[0], "a year or date", near);
        const hl = A[1]?.kind === "word" && A[1].name === "highlight";
        if (yearObj && yearObj.end === Infinity) yearObj.end = start;
        // pill badge, 28 CSS px font, padding 14/32 → top-left at 32,32 in the frame
        const w = text.length * 22 + 100, h = 74;
        yearObj = makeObj("year", p, s, start, [32, 32], [32, 32, w, h], { text, highlight: hl });
        yearObj.pos.base = [32, 32];
        return true;
      }
      case "legend": {
        const a = A[0];
        if (a?.kind === "word" && a.name === "hide") { if (legendObj && legendObj.end === Infinity) legendObj.end = start; legendObj = undefined; return true; }
        if (!legendObj) {
          // card hangs from the top-right corner
          legendObj = makeObj("legend", p, s, start, [W - 19, 19], [W - 460, 19, 440, 260], { entries: [], auto: false, map: curMap });
          legendObj.pos.base = [W - 19, 19];
        } else legendObj.lines.push(s.line);
        if (a?.kind === "word" && a.name === "auto") { legendObj.data.auto = true; legendObj.data.autoFrom = start; return true; }
        const label = str(a, 'a legend label, or auto / hide', near);
        legendObj.data.entries.push({ label, color: color(A[1], s, MAP_COLORS["blue"]), t0: start });
        const n = legendObj.data.entries.length;
        const w = Math.max(160, ...legendObj.data.entries.map((e: any) => e.label.length * 10 + 64));
        const h = n * 34 + 32;
        legendObj.box = [W - 19 - w, 19, w, h];
        return true;
      }
      case "remove": {
        const what = A[0] ? word(A[0], REMOVE_WHAT.join(", "), near) : "last";
        if (!(REMOVE_WHAT as readonly string[]).includes(what)) err(`Use remove ${REMOVE_WHAT.join(" / ")}`, A[0]);
        const isFill = (x: any): x is MapFill & { line: number } => !("kind" in x);
        const live = mapElems.filter((x) => x.end === Infinity);
        const kill = (x: (typeof mapElems)[number]) => { x.end = start; };
        if (what === "last") {
          if (s.legacy) {
            // the original removes the last placed marker only (labels, bubbles, tags, effects)
            for (let k = markerStack.length - 1; k >= 0; k--) if (markerStack[k].end === Infinity) { kill(markerStack[k]); break; }
          } else { const x = live[live.length - 1]; if (x) kill(x); }
        }
        for (const x of live) {
          if (isFill(x)) { if (what === "colors" || what === "all") kill(x); continue; }
          const k = x.kind;
          if ((what === "arrows" && k === "attack") || (what === "lines" && k === "route") ||
            ((what === "pins" || what === "effects") && (k === "pin" || k === "effect")) ||
            (what === "labels" && (k === "bubble" || k === "label" || k === "tag")) || what === "all") kill(x);
        }
        if ((what === "legend" || what === "all") && legendObj) { legendObj.end = start; legendObj = undefined; }
        if ((what === "year" || what === "all") && yearObj) { yearObj.end = start; yearObj = undefined; }
        return true;
      }
      case "effect": {
        const lat = num(A[0], "latitude", near), lng = num(A[1], "longitude", A[0] ?? near);
        const sym = word(A[2], "an effect name", A[1] ?? near).toLowerCase();
        if (!EFFECTS[sym]) {
          if (s.legacy) return true; // the original silently skips unknown effects
          err(`Unknown effect "${sym}". Use ${Object.keys(EFFECTS).join(", ")}`, A[2]);
        }
        const col = A[3] ? color(A[3], s, MAP_COLORS["red"]) : MAP_COLORS["red"];
        const size = A[4] ? num(A[4], "a size", A[3] ?? near).v : 1.5;
        const r = 32 * size;
        const o = geoObj("effect", p, s, start, { lat: lat.v, lng: lng.v, symbol: sym, color: col, size, rel: [-r, -r, 2 * r, 2 * r] });
        o.createSpans.at = [lat.span, lng.span];
        return true;
      }
      case "cinematic": {
        const m = needMap(s);
        const numAt = (k: number) => (A[k] && (A[k]!.kind === "num" || A[k]!.kind === "expr") ? num(A[k]!, "a number", near).v : NaN);
        const lat = numAt(0), lng = numAt(1), z = numAt(2);
        if (Number.isNaN(lat) || Number.isNaN(lng) || Number.isNaN(z)) return true; // the original silently skips
        let pitch = numAt(3);
        if (Number.isNaN(pitch)) pitch = 30;
        pitch = pitch === 0 ? 30 : Math.min(30, Math.max(0, pitch));
        const bearing = Number.isNaN(numAt(4)) ? 0 : numAt(4);
        const cam = m.data.cam;
        camSeg(cam.pos, [{ v: lat }, { v: lng }], p, s, start, { v: 2 }, "smooth");
        camSeg(cam.zoom, [{ v: z }], p, s, start, { v: 2 }, "smooth");
        camSeg(cam.tilt, [{ v: pitch }], p, s, start, { v: 2 }, "smooth");
        camSeg(cam.turn, [{ v: bearing }], p, s, start, { v: 2 }, "smooth");
        cursor = Math.max(cursor, start + 2);
        bump(cursor);
        m.lines.push(s.line);
        return true;
      }
      case "clear": {
        const m = needMap(s);
        if (!geoReady("countries")) { needGeo.add("countries"); return true; }
        if (!A[0]) return true;
        const f = country(A[0], s);
        if (!f) return true; // silently skips unknown names
        const nn = normName(f.name);
        for (const x of m.data.fills as (MapFill & { line: number })[]) {
          if (x.end === Infinity && x.feature && (normName(x.feature.name) === nn || normName(x.feature.sovereign ?? "") === nn)) x.end = start;
        }
        m.lines.push(s.line);
        return true;
      }
      case "clearregions": {
        const m = needMap(s);
        if (!geoReady("countries")) { needGeo.add("countries"); return true; }
        if (!A[0]) return true;
        const f = country(A[0], s);
        if (!f) return true;
        const nn = normName(f.name);
        for (const x of m.data.fills as (MapFill & { line: number; isRegion?: boolean })[]) {
          if (x.end === Infinity && x.isRegion && x.feature && (normName(x.feature.country ?? "") === nn || normName(x.feature.sovereign ?? "") === nn)) x.end = start;
        }
        m.lines.push(s.line);
        return true;
      }
      case "rename": {
        const m = needMap(s);
        if (!geoReady("countries")) { needGeo.add("countries"); return true; }
        if (!A[0]) err("rename needs a country and a label, e.g. rename britain \"United Kingdom\"", near);
        const f = country(A[0], s);
        if (!f) return true;
        const text = str(A[1], "a label", near);
        const ag = kw1(p, "at");
        const at: [number, number] | undefined = ag ? [num(ag[2], "longitude", ag[0]).v, num(ag[1], "latitude", ag[0]).v] : undefined;
        const renames: any[] = (m.data.renames ??= []);
        const prev = renames.find((r) => r.name === f!.name && r.end === Infinity);
        if (prev) prev.end = start;
        renames.push({ name: f!.name, text, at, t0: start, end: Infinity, line: s.line });
        m.lines.push(s.line);
        return true;
      }
      case "unrename": {
        const m = needMap(s);
        if (!geoReady("countries")) { needGeo.add("countries"); return true; }
        if (!A[0]) return true;
        const f = country(A[0], s);
        if (!f) return true;
        for (const r of (m.data.renames ?? []) as any[]) if (r.name === f.name && r.end === Infinity) r.end = start;
        m.lines.push(s.line);
        return true;
      }
    }
    // legacy country-prefix fill: `poland: red occupied pulse` — silent when unknown
    if (s.legacy && !geoReady("countries")) { needGeo.add("countries"); return true; }
    if (s.legacy) {
      const f = findCountry(s.name) ?? null;
      if (!f) return true;
      const col = A[0] ? color(A[0], s) : MAP_COLORS["blue"];
      let anim: MapFill["anim"] = "none", occupied = false;
      for (const a of A.slice(1)) {
        if (a.kind !== "word") continue;
        if (a.name === "occupied") occupied = true;
        else if ((MAP_ANIMS as readonly string[]).includes(a.name)) anim = a.name as MapFill["anim"];
      }
      const m = needMap(s);
      applyFill(m, f, col, anim, FILL_DUR[anim], occupied, false, start, s.line);
      for (const t of territoriesOf(f)) applyFill(m, t, col, anim, FILL_DUR[anim], false, false, start, s.line);
      return true;
    }
    return false;
  }

  exec(prog.stmts, true);
  if (needGeo.size) tl.needsGeo = [...needGeo];
  // legend auto: snapshot every country fill in command order, one per colour
  if (legendObj?.data.auto) {
    const entries: { label: string; color: string; t0: number }[] = [];
    const seen = new Set<string>();
    for (const o of tl.objects) {
      if (o.kind !== "map") continue;
      for (const f of o.data.fills as (MapFill & { isRegion?: boolean })[]) {
        if (f.isRegion || !f.feature || seen.has(f.color)) continue;
        seen.add(f.color);
        entries.push({ label: f.feature.name, color: f.color, t0: legendObj.data.autoFrom });
      }
    }
    legendObj.data.entries = entries;
    const w = Math.max(160, ...entries.map((e) => e.label.length * 10 + 64));
    legendObj.box = [W - 19 - w, 19, w, entries.length * 34 + 32];
  }
  bump(cursor);
  tl.duration = Math.max(1, maxT + 0.5);
  for (const o of tl.objects) if (o.end === Infinity) o.end = tl.duration;
  return tl;
}
