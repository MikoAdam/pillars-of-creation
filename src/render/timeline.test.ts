import { describe, expect, it } from "vitest";
import { frameState, totalDuration } from "./timeline";
import { validateProject } from "./schema";
import type { Scene } from "./types";

const k = (id: string, duration: number, transition: Scene["transition"] = "cut") =>
  ({ id, type: "KineticText", duration, transition, text: "hi", emphasis: [], wordsPerSecond: 3 }) as Scene;

describe("timeline", () => {
  const scenes = [k("a", 4), k("b", 3, "crossfade"), k("c", 2)];
  it("sums durations", () => expect(totalDuration({ scenes })).toBe(9));
  it("maps time to scene and local time", () => {
    expect(frameState(scenes, 5)).toMatchObject({ index: 1, local: 1 });
    expect(frameState(scenes, 8).index).toBe(2);
  });
  it("crossfade is active for first 0.5s of incoming scene", () => {
    const fs = frameState(scenes, 4.25);
    expect(fs.transition?.prevIndex).toBe(0);
    expect(fs.transition?.progress).toBeCloseTo(0.5);
    expect(frameState(scenes, 7.1).transition).toBeUndefined(); // cut
  });
});

describe("schema", () => {
  it("requires a source on StatCounter with readable path", () => {
    const r = validateProject({ title: "x", scenes: [{ id: "s", type: "StatCounter", duration: 3, value: 5, label: "l" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.startsWith("scenes[0].source"))).toBe(true);
  });
});
