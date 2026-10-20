export type TokKind = "ident" | "num" | "str" | "asset" | "url" | "op" | "lparen" | "rparen" | "eq" | "colon" | "comma" | "color";

export interface Tok {
  kind: TokKind;
  text: string;
  /** numeric value for num, decoded string for str, name for asset */
  value: number | string;
  isDur?: boolean;
  start: number;
  end: number;
  line: number; // 0-based
  col: number; // 0-based
}

export class LangError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number,
    public len = 1,
  ) {
    super(message);
  }
}

export interface LexLine {
  line: number;
  tokens: Tok[];
  /** offset where code content ends (before trailing comment / whitespace) */
  contentEnd: number;
  lineStart: number;
  lineEnd: number;
  indent: string;
}

const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

/** Lex source into per-line token lists. */
export function lex(src: string): LexLine[] {
  const out: LexLine[] = [];
  let lineStart = 0;
  const rawLines = src.split("\n");
  rawLines.forEach((raw, line) => {
    const tokens: Tok[] = [];
    let i = 0;
    let contentEnd = lineStart;
    while (i < raw.length) {
      const c = raw[i];
      const startCol = i;
      const push = (kind: TokKind, text: string, value: number | string, extra: Partial<Tok> = {}) => {
        tokens.push({ kind, text, value, start: lineStart + startCol, end: lineStart + i, line, col: startCol, ...extra });
        contentEnd = lineStart + i;
      };
      if (c === " " || c === "\t" || c === "\r") {
        i++;
        continue;
      }
      if (c === "#") {
        // legacy hex colour like #003fa3 — otherwise a comment
        const hexM = /^([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_])/.exec(raw.slice(i + 1));
        if (hexM) {
          const text = raw.slice(i, i + 1 + hexM[0].length);
          i += text.length;
          push("color", text, text);
          continue;
        }
        break;
      }
      if (c === '"') {
        i++;
        let s = "";
        while (i < raw.length && raw[i] !== '"') {
          if (raw[i] === "\\" && i + 1 < raw.length) i++;
          s += raw[i++];
        }
        if (i >= raw.length) throw new LangError("Unterminated string", line, startCol, raw.length - startCol);
        i++;
        push("str", raw.slice(startCol, i), s);
        continue;
      }
      if (raw.startsWith("http://", i) || raw.startsWith("https://", i)) {
        while (i < raw.length && !/\s/.test(raw[i])) i++;
        push("url", raw.slice(startCol, i), raw.slice(startCol, i));
        continue;
      }
      if (c === "@") {
        i++;
        while (i < raw.length && /[A-Za-z0-9_\-]/.test(raw[i])) i++;
        if (i === startCol + 1) throw new LangError("Expected asset name after @", line, startCol);
        push("asset", raw.slice(startCol, i), raw.slice(startCol + 1, i));
        continue;
      }
      const prevChar = startCol > 0 ? raw[startCol - 1] : " ";
      const negNum = c === "-" && isDigit(raw[i + 1] ?? "") && /[\s(]/.test(prevChar);
      if (isDigit(c) || (c === "." && isDigit(raw[i + 1] ?? "")) || negNum) {
        if (negNum) i++;
        while (i < raw.length && (isDigit(raw[i]) || raw[i] === ".")) i++;
        const numText = raw.slice(startCol, i);
        let v = Number(numText);
        if (Number.isNaN(v)) throw new LangError(`Bad number "${numText}"`, line, startCol, i - startCol);
        let isDur = false;
        if (raw[i] === "s" && !isId(raw[i + 1] ?? "")) {
          isDur = true;
          i += 1;
        } else if (raw.startsWith("ms", i) && !isId(raw[i + 2] ?? "")) {
          isDur = true;
          i += 2;
          v = v / 1000; // milliseconds become seconds
        }
        push("num", raw.slice(startCol, i), v, { isDur });
        continue;
      }
      if (isIdStart(c)) {
        while (i < raw.length && isId(raw[i])) i++;
        // legacy place names keep hyphens together: Nordrhein-Westfalen
        while (raw[i] === "-" && /[A-Za-z]/.test(raw[i + 1] ?? "")) {
          i++;
          while (i < raw.length && isId(raw[i])) i++;
        }
        push("ident", raw.slice(startCol, i), raw.slice(startCol, i));
        continue;
      }
      if ("+-*/%".includes(c)) {
        i++;
        push("op", c, c);
        continue;
      }
      if (c === "(") { i++; push("lparen", c, c); continue; }
      if (c === ")") { i++; push("rparen", c, c); continue; }
      if (c === "=") { i++; push("eq", c, c); continue; }
      if (c === ":") { i++; push("colon", c, c); continue; }
      if (c === ",") { i++; push("comma", c, c); continue; }
      throw new LangError(`Unexpected character "${c}"`, line, startCol);
    }
    const indent = /^[ \t]*/.exec(raw)![0];
    out.push({ line, tokens, contentEnd: tokens.length ? contentEnd : lineStart + raw.length, lineStart, lineEnd: lineStart + raw.length, indent });
    lineStart += raw.length + 1;
  });
  return out;
}
