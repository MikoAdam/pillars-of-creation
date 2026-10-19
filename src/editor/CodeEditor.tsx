import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { COMMANDS, STYLE_KEYS, THEME_NAMES } from "@/lang/interpreter";
import { EASE_NAMES, FX_STYLES } from "@/lang/timeline";
import { MAP_COLOR_NAMES, geoFeatures } from "@/render/geo";
import { SYMBOLS } from "@/render/symbols";

const KEYWORDS = ["over", "as", "at", "to", "from", "unit", "prefix", "suffix", "label", "beat", "radius", "size", "scale", "delay", "body", "paper", "mark", "theme", "photo", "step", "vignette", "off", "in", "out", "background", "text", "accent", "display", "radius", "grain", "caps", "on", "enter", "exit", "rotate", "ease", "curve", "opacity", "zoom", "tilt", "turn", "labels", "bend", "width", "head", "occupied", "highlight", "hide", "auto", "left", "right", "pulse", "fade", "radial", "sweep", "none", "arrows", "pins", "colors", "legend", "year", "all", "last", ...MAP_COLOR_NAMES, ...SYMBOLS, ...EASE_NAMES, ...FX_STYLES];
const OBJ_CMDS = new Set(["move", "zoom", "scale", "fade", "caption", "source", "unverified", "rotate", "pulse", "wiggle"]);
const LH = 20;
const PAD = 12;

interface Props {
  value: string;
  onChange: (v: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  error: { line: number; col: number; len: number; message: string } | null;
  selectedLines: Set<number>;
  onCaretLine: (line: number) => void;
  assetNames: string[];
  objectIds: string[];
}

const TOKEN_RE = /(#.*$)|("(?:\\.|[^"\\])*"?)|(https?:\/\/\S+)|(@[\w-]+)|(-?\d+(?:\.\d+)?s?(?![\w]))|([A-Za-z_]\w*)|(\s+)|(.)/g;

function highlightLine(line: string) {
  const out: { t: string; c: string }[] = [];
  let first = true;
  for (const m of line.matchAll(TOKEN_RE)) {
    const [t, com, str, url, asset, num, id] = m;
    let c = "";
    if (com) c = "text-syn-comment italic";
    else if (str) c = "text-syn-str";
    else if (url) c = "text-syn-url underline";
    else if (asset) c = "text-syn-asset";
    else if (num) c = "text-syn-num";
    else if (id) c = first && COMMANDS.includes(id) ? "text-syn-cmd font-semibold" : KEYWORDS.includes(id) || Object.keys(THEME_NAMES).includes(id) ? "text-syn-kw" : "text-foreground";
    if (!/^\s+$/.test(t)) first = false;
    out.push({ t, c });
  }
  return out;
}

export function CodeEditor(p: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [ac, setAc] = useState<{ items: string[]; sel: number; prefix: string; line: number; col: number } | null>(null);
  const lines = useMemo(() => p.value.split("\n"), [p.value]);

  // keep selected lines visible when selection comes from the canvas
  useEffect(() => {
    const el = ta.current;
    if (!el || !p.selectedLines.size || document.activeElement === el) return;
    const first = Math.min(...p.selectedLines);
    const y = first * LH;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - LH * 2) el.scrollTop = Math.max(0, y - LH * 3);
  }, [p.selectedLines]);

  const caretInfo = () => {
    const el = ta.current!;
    const pos = el.selectionStart;
    const before = p.value.slice(0, pos);
    const line = before.split("\n").length - 1;
    const lineText = before.slice(before.lastIndexOf("\n") + 1);
    return { pos, line, lineText, col: lineText.length };
  };

  const updateAc = () => {
    const el = ta.current;
    if (!el || el.selectionStart !== el.selectionEnd) return setAc(null);
    const { line, lineText, col } = caretInfo();
    if (lineText.includes("#") || (lineText.split('"').length - 1) % 2 === 1) return setAc(null);
    const m = /(@?[\w]*)$/.exec(lineText)!;
    const prefix = m[1];
    const beforeWord = lineText.slice(0, lineText.length - prefix.length);
    const words = beforeWord.trim().split(/\s+/).filter(Boolean);
    let pool: string[];
    if (prefix.startsWith("@")) pool = p.assetNames.map((a) => "@" + a);
    else if (!words.length) pool = COMMANDS;
    else if (words[words.length - 1] === "theme") pool = Object.keys(THEME_NAMES);
    else if (words[words.length - 1] === "enter" || words[words.length - 1] === "exit") pool = [...FX_STYLES];
    else if (words[words.length - 1] === "ease") pool = EASE_NAMES;
    else if (words.length === 1 && words[0] === "style") pool = [...STYLE_KEYS];
    else if (words.length === 1 && OBJ_CMDS.has(words[0])) pool = p.objectIds;
    else if (["country", "fly", "map", "attack", "route", "region"].includes(words[0]) && words.length <= 2 && geoFeatures("countries").length)
      pool = [...geoFeatures("countries").map((f) => f.name.toLowerCase()).filter((n) => /^[a-z]+$/.test(n)), ...MAP_COLOR_NAMES];
    else pool = KEYWORDS;
    if (!prefix) return setAc(null);
    const items = pool.filter((x) => x.startsWith(prefix) && x !== prefix).slice(0, 8);
    setAc(items.length ? { items, sel: 0, prefix, line, col: col - prefix.length } : null);
  };

  const accept = (item: string) => {
    const el = ta.current!;
    const pos = el.selectionStart;
    const start = pos - ac!.prefix.length;
    const next = p.value.slice(0, start) + item + p.value.slice(pos);
    p.onChange(next);
    setAc(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + item.length, start + item.length);
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? p.onRedo() : p.onUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      p.onRedo();
      return;
    }
    if (ac) {
      if (e.key === "ArrowDown") { e.preventDefault(); setAc({ ...ac, sel: (ac.sel + 1) % ac.items.length }); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setAc({ ...ac, sel: (ac.sel - 1 + ac.items.length) % ac.items.length }); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); accept(ac.items[ac.sel]); return; }
      if (e.key === "Escape") { e.preventDefault(); setAc(null); return; }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart;
      p.onChange(p.value.slice(0, s) + "  " + p.value.slice(el.selectionEnd));
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  const reportCaret = () => {
    if (!ta.current) return;
    p.onCaretLine(caretInfo().line);
  };

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-editor font-mono text-[13px]" style={{ lineHeight: `${LH}px` }}>
      <div className="w-10 shrink-0 select-none overflow-hidden border-r border-border text-right text-muted-foreground/60">
        <div style={{ transform: `translateY(${PAD - scroll.top}px)` }}>
          {lines.map((_, i) => (
            <div key={i} className={`pr-2 ${p.error?.line === i ? "text-destructive" : p.selectedLines.has(i) ? "text-primary" : ""}`}>{i + 1}</div>
          ))}
        </div>
      </div>
      <div className="relative min-w-0 flex-1">
        <pre aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre" style={{ padding: PAD, tabSize: 2 }}>
          <div style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}>
            {lines.map((l, i) => (
              <div key={i} className={`relative ${p.selectedLines.has(i) ? "bg-primary/10 -mx-3 px-3" : ""}`} style={{ height: LH }}>
                {highlightLine(l).map((tk, j) => <span key={j} className={tk.c}>{tk.t}</span>)}
                {p.error?.line === i && (
                  <span className="absolute bottom-0.5 border-b-2 border-dotted border-destructive" style={{ left: `calc(${p.error.col}ch + ${p.selectedLines.has(i) ? 12 : 0}px)`, width: `${Math.max(1, p.error.len)}ch` }} />
                )}
              </div>
            ))}
          </div>
        </pre>
        <textarea
          ref={ta}
          value={p.value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => { p.onChange(e.target.value); requestAnimationFrame(updateAc); }}
          onKeyDown={onKey}
          onKeyUp={(e) => { if (!["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key) || !ac) reportCaret(); }}
          onClick={() => { reportCaret(); setAc(null); }}
          onBlur={() => setTimeout(() => setAc(null), 150)}
          onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
          className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent text-transparent caret-primary outline-none selection:bg-primary/30"
          style={{ padding: PAD, tabSize: 2, lineHeight: `${LH}px` }}
        />
        {ac && (
          <ul
            className="absolute z-20 min-w-40 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-xl"
            style={{ top: (ac.line + 1) * LH + PAD - scroll.top, left: `calc(${ac.col}ch + ${PAD - scroll.left}px)` }}
          >
            {ac.items.map((it, i) => (
              <li key={it}>
                <button
                  onMouseDown={(e) => { e.preventDefault(); accept(it); }}
                  className={`block w-full px-3 text-left ${i === ac.sel ? "bg-primary/20 text-foreground" : "text-muted-foreground"}`}
                >
                  {it}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {p.error && (
        <div className="absolute inset-x-0 bottom-0 border-t border-destructive/50 bg-destructive/15 px-3 py-1.5 font-sans text-xs text-destructive">
          Line {p.error.line + 1}: {p.error.message}
        </div>
      )}
    </div>
  );
}
