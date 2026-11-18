import { describe, expect, it } from "vitest";
import { estimateBytes, toSrt, videoBitrate } from "./exportVideo";
import type { Timeline } from "@/lang/timeline";

describe("export settings", () => {
  it("writes subtitles as .srt, timed from the start of the exported stretch", () => {
    const tl = { subs: [{ t0: 1, t1: 2.5, text: "Hello", line: 1 }, { t0: 65.25, t1: 3700, text: "Later", line: 2 }] } as unknown as Timeline;
    expect(toSrt(tl, 0, 4000)).toBe("1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:01:05,250 --> 01:01:40,000\nLater\n");
    expect(toSrt(tl, 60, 70)).toBe("1\n00:00:05,250 --> 00:00:10,000\nLater\n");
  });
  it("scales the bitrate with size, frame rate, quality and codec", () => {
    expect(videoBitrate("1080p", 30, "standard", "avc")).toBe(8e6);
    expect(videoBitrate("4k", 30, "standard", "avc")).toBeGreaterThan(2.5 * 8e6);
    expect(videoBitrate("1080p", 60, "standard", "avc")).toBeGreaterThan(8e6);
    expect(videoBitrate("1080p", 30, "standard", "av1")).toBeLessThan(8e6);
    expect(videoBitrate("1080p", 30, "draft", "avc")).toBeLessThan(videoBitrate("1080p", 30, "best", "avc"));
    // a minute of standard 1080p with sound is about 61 MB
    expect(estimateBytes(60, "1080p", 30, "standard", "avc", true) / 1e6).toBeCloseTo(61.4, 0);
  });
});
