import { describe, expect, it } from "vitest";
import { run } from "./interpreter";
import { sample } from "./timeline";
import { insertAtTime, writeMove, writeOver } from "./writeback";
import { DEMOS } from "@/editor/demos";

const tl = (src: string) => {
  const r = run(src);
  if (!r.ok) throw new Error(r.error.message);
  return r.timeline;
};

describe("interpreter", () => {
  it("runs the sample program", () => {
    expect(run(DEMOS[0]!.code).ok).toBe(true);
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

import { writeFx, writeProp, writeStart, removeFx } from "./writeback";
import { describe as d2, it as i2, expect as e2 } from "vitest";
import { run as run2 } from "./interpreter";
const tlOf = (c: string) => { const r = run2(c); if (!r.ok) throw new Error(r.error.message); return r.timeline; };

d2("drag and drop matches the script", () => {
  i2("dropping an entrance appends then edits the keyword", () => {
    const c = 'say "hi" as a # note\n';
    const c2 = writeFx(c, tlOf(c).objects[0], "enter", "pop");
    e2(c2).toBe('say "hi" as a enter pop # note\n');
    e2(writeFx(c2, tlOf(c2).objects[0], "enter", "blur")).toBe('say "hi" as a enter blur # note\n');
    e2(removeFx(c2, tlOf(c2).objects[0], "enter")).toBe(c);
  });
  i2("rotate handle edits rotate literal", () => {
    const c = 'say "hi" as a rotate 10\n';
    e2(writeProp(c, tlOf(c), tlOf(c).objects[0], 0, "rot", 45)).toBe('say "hi" as a rotate 45\n');
  });
  i2("moving a timeline block edits or adds delay, snapped to 0.1s", () => {
    const c = 'say "a"\nwait 1s\nsay "b" over 1s\n';
    const seg = tlOf(c).objects[1].progress.segs[0];
    const c2 = writeStart(c, seg, 1.73);
    e2(c2).toBe('say "a"\nwait 1s\nsay "b" over 1s delay 0.7s\n');
    e2(writeStart(c2, tlOf(c2).objects[1].progress.segs[0], 2.04)).toBe('say "a"\nwait 1s\nsay "b" over 1s delay 1s\n');
  });
  i2("new commands run", () => {
    const tl = tlOf('say "x" as a enter pop exit blur\ncamera to 900 500 zoom 1.5 over 1s ease snap\nshake 10 over 0.3s\npulse a over 0.5s\nmove a to 100 100 curve 50 over 1s ease spring\nwhip 0.5\n');
    e2(tl.camera.zoom.segs[0].to[0]).toBe(1.5);
    e2(tl.objects[0].enterFx?.style).toBe("pop");
  });
});

import { describe as d3, it as i3, expect as e3 } from "vitest";
import { run as run3 } from "./interpreter";
import { toCues } from "@/editor/transcribe";
d3("voice and subtitles", () => {
  i3("subtitle lines become timed cues and extend the video", () => {
    const r = run3('project "T"\nvoice @narration\nsubtitle 1 2.5 "Hello there"\nsubtitle 9 12 "Bye"');
    e3(r.ok).toBe(true);
    if (!r.ok) return;
    e3(r.timeline.voice).toBe("narration");
    e3(r.timeline.subs?.map((s) => [s.t0, s.t1, s.text])).toEqual([[1, 2.5, "Hello there"], [9, 12, "Bye"]]);
    e3(r.timeline.duration).toBeGreaterThanOrEqual(12);
  });
  i3("rejects a subtitle that ends before it starts", () => {
    e3(run3('subtitle 3 2 "x"').ok).toBe(false);
  });
  i3("long speech is split into short cues covering the same time", () => {
    const cues = toCues([{ timestamp: [0, 10], text: "word ".repeat(40) }], 10, 70);
    e3(cues.length).toBeGreaterThan(1);
    e3(cues[0].t0).toBe(0);
    e3(cues[cues.length - 1].t1).toBe(10);
  });
});
