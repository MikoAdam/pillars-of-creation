import { LangError, lex, type LexLine, type Tok } from "./lexer";

export type Span = [number, number];

export type Expr =
  | { k: "num"; v: number; tok: Tok }
  | { k: "var"; name: string; tok: Tok }
  | { k: "bin"; op: string; a: Expr; b: Expr; tok: Tok }
  | { k: "neg"; a: Expr; tok: Tok };

export type Arg =
  | { kind: "num"; v: number; isDur: boolean; tok: Tok }
  | { kind: "word"; name: string; tok: Tok }
  | { kind: "expr"; expr: Expr; tok: Tok }
  | { kind: "str"; v: string; tok: Tok }
  | { kind: "asset"; name: string; tok: Tok }
  | { kind: "url"; v: string; tok: Tok };

export interface StmtBase {
  line: number;
  ll: LexLine;
}
export type Stmt =
  | (StmtBase & { kind: "cmd"; name: string; nameTok: Tok; args: Arg[] })
  | (StmtBase & { kind: "let"; name: string; expr: Expr })
  | (StmtBase & { kind: "repeat"; count: Expr; body: Stmt[]; endLine: number })
  | (StmtBase & { kind: "for"; v: string; from: Expr; to: Expr; step?: Expr; body: Stmt[]; endLine: number });

class TokStream {
  i = 0;
  constructor(public toks: Tok[], public line: number) {}
  peek(o = 0) { return this.toks[this.i + o]; }
  next() { return this.toks[this.i++]; }
  done() { return this.i >= this.toks.length; }
}

function parsePrimary(ts: TokStream): Expr {
  const t = ts.next();
  if (!t) throw new LangError("Expected a value", ts.line, 0);
  if (t.kind === "num") return { k: "num", v: t.value as number, tok: t };
  if (t.kind === "ident") return { k: "var", name: t.text, tok: t };
  if (t.kind === "op" && t.text === "-") return { k: "neg", a: parsePrimary(ts), tok: t };
  if (t.kind === "lparen") {
    const e = parseExpr(ts);
    const r = ts.next();
    if (!r || r.kind !== "rparen") throw new LangError("Missing )", t.line, t.col);
    return e;
  }
  throw new LangError(`Unexpected "${t.text}" in expression`, t.line, t.col, t.text.length);
}
function parseTerm(ts: TokStream): Expr {
  let a = parsePrimary(ts);
  while (ts.peek()?.kind === "op" && "*/%".includes(ts.peek().text)) {
    const op = ts.next();
    a = { k: "bin", op: op.text, a, b: parsePrimary(ts), tok: op };
  }
  return a;
}
export function parseExpr(ts: TokStream): Expr {
  let a = parseTerm(ts);
  while (ts.peek()?.kind === "op" && "+-".includes(ts.peek().text)) {
    const op = ts.next();
    a = { k: "bin", op: op.text, a, b: parseTerm(ts), tok: op };
  }
  return a;
}

function parseArgs(ts: TokStream): Arg[] {
  const args: Arg[] = [];
  while (!ts.done()) {
    const t = ts.peek();
    const nextIsOp = ts.peek(1)?.kind === "op";
    if (t.kind === "str") { ts.next(); args.push({ kind: "str", v: t.value as string, tok: t }); continue; }
    if (t.kind === "asset") { ts.next(); args.push({ kind: "asset", name: t.value as string, tok: t }); continue; }
    if (t.kind === "url") { ts.next(); args.push({ kind: "url", v: t.text, tok: t }); continue; }
    if (t.kind === "num" && !nextIsOp) { ts.next(); args.push({ kind: "num", v: t.value as number, isDur: !!t.isDur, tok: t }); continue; }
    if (t.kind === "ident" && !nextIsOp) { ts.next(); args.push({ kind: "word", name: t.text, tok: t }); continue; }
    if (t.kind === "num" || t.kind === "ident" || t.kind === "lparen" || t.kind === "op") {
      args.push({ kind: "expr", expr: parseExpr(ts), tok: t });
      continue;
    }
    throw new LangError(`Unexpected "${t.text}"`, t.line, t.col, t.text.length);
  }
  return args;
}

export interface Program {
  stmts: Stmt[];
  lines: LexLine[];
}

export function parse(src: string): Program {
  const lines = lex(src);
  let idx = 0;
  function block(top: boolean): { body: Stmt[]; endLine: number } {
    const body: Stmt[] = [];
    while (idx < lines.length) {
      const ll = lines[idx];
      const toks = ll.tokens;
      if (!toks.length) { idx++; continue; }
      const first = toks[0];
      if (first.kind === "ident" && first.text === "end") {
        if (top) throw new LangError('"end" without a matching repeat/for', ll.line, first.col, 3);
        idx++;
        return { body, endLine: ll.line };
      }
      idx++;
      const ts = new TokStream(toks, ll.line);
      if (first.kind !== "ident") throw new LangError("Line must start with a command", ll.line, first.col, first.text.length);
      ts.next();
      if (first.text === "let") {
        const name = ts.next();
        if (!name || name.kind !== "ident") throw new LangError("Expected variable name after let", ll.line, first.end - ll.lineStart + 1);
        const eq = ts.next();
        if (!eq || eq.kind !== "eq") throw new LangError('Expected "=" in let', ll.line, name.col + name.text.length + 1);
        const expr = parseExpr(ts);
        if (!ts.done()) throw new LangError("Unexpected extra input", ll.line, ts.peek().col, ts.peek().text.length);
        body.push({ kind: "let", name: name.text, expr, line: ll.line, ll });
      } else if (first.text === "repeat") {
        const count = parseExpr(ts);
        const b = block(false);
        body.push({ kind: "repeat", count, body: b.body, endLine: b.endLine, line: ll.line, ll });
      } else if (first.text === "for") {
        const v = ts.next();
        if (!v || v.kind !== "ident") throw new LangError("Expected loop variable", ll.line, first.col + 4);
        const kwFrom = ts.next();
        if (!kwFrom || kwFrom.text !== "from") throw new LangError('Expected "from"', ll.line, v.col + v.text.length + 1);
        const from = parseExpr(ts);
        const kwTo = ts.next();
        if (!kwTo || kwTo.text !== "to") throw new LangError('Expected "to"', ll.line, kwFrom.col);
        const to = parseExpr(ts);
        let step: Expr | undefined;
        if (ts.peek()?.text === "step") { ts.next(); step = parseExpr(ts); }
        const b = block(false);
        body.push({ kind: "for", v: v.text, from, to, step, body: b.body, endLine: b.endLine, line: ll.line, ll });
      } else {
        body.push({ kind: "cmd", name: first.text, nameTok: first, args: parseArgs(ts), line: ll.line, ll });
      }
    }
    if (!top) throw new LangError('Missing "end" for block', lines.length - 1, 0);
    return { body, endLine: lines.length - 1 };
  }
  return { stmts: block(true).body, lines };
}
