import { describe, expect, it } from "vitest";
import { run } from "./interpreter";
import { sample } from "./timeline";
import { insertAtTime, writeMove, writeOver } from "./writeback";
import { SAMPLE_CODE } from "@/editor/sampleCode";

const tl = (src: string) => {
  const r = run(src);
  if (!r.ok) throw new Error(r.error.message);
  return r.timeline;
};

describe("interpreter", () => {
  it("runs the sample program", () => {
    expect(run(SAMPLE_CODE).ok).toBe(true);
  });
  it("wait moves the time cursor; other commands start at it", () => {
    const t = tl(`say "a" as a\nwait 2s\nsay "b" as b`);
    expect(t.objects.find((o) => o.id === "b")!.start).toBe(2);
  });
  it("cut ends previous objects", () => {
    const t = tl(`say "a" as a\nwait 3s\ncut\nsay "b" as b`);
    expect(t.objects[0].end).toBe(3);
  });
  it("for loops generate objects", () => {
    const t = tl(`for i from 1 to 4\n  circle at (i*100) 200 radius 20\nend`);
    expect(t.objects.length).toBe(4);
    expect(t.objects[3].origin[0]).toBe(400);
  });
  it("reports errors with line and column", () => {
    const r = run(`say "ok"\nmove ghost to 1 2`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ line: 1, col: 5 });
  });
  it("move animates position", () => {
    const t = tl(`say "x" as a\nmove a to 100 200 over 1s`);
    expect(sample(t.objects[0].pos, 1)).toEqual([100, 200]);
  });
});

describe("write back", () => {
  it("drag edits only the move literals and keeps comments", () => {
    const src = `say "x" as a # hi\nmove a to 100 200 over 1s # keep`;
    const t = tl(src);
    expect(writeMove(src, t, t.objects[0], 2, 300, 400)).toBe(`say "x" as a # hi\nmove a to 300 400 over 1s # keep`);
  });
  it("drag without a move appends at to the creation line before its comment", () => {
    const src = `say "x" as a # hi`;
    const t = tl(src);
    expect(writeMove(src, t, t.objects[0], 0, 500, 300)).toBe(`say "x" as a at 500 300 # hi`);
  });
  it("timeline edge edits the over literal, snapped to 0.1s", () => {
    const src = `say "x" as a\nmove a to 1 2 over 1s`;
    const span = tl(src).objects[0].pos.segs[0].overSpan!;
    expect(writeOver(src, span, 2.345)).toBe(`say "x" as a\nmove a to 1 2 over 2.3s`);
  });
  it("insert at playhead adds a delay when between waits", () => {
    const src = `say "a"\nwait 4s`;
    expect(insertAtTime(src, tl(src), 1.5, `say "b"`).code).toBe(`say "a"\nsay "b" delay 1.5s\nwait 4s`);
  });
});
