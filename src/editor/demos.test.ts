import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setGeoData } from "@/render/geo";

beforeAll(() => {
  setGeoData("countries", JSON.parse(readFileSync("public/geo/countries.json", "utf8")));
  setGeoData("regions", JSON.parse(readFileSync("public/geo/regions.json", "utf8")));
});
import { DEMOS } from "./demos";
import { run } from "@/lang/interpreter";

describe("demo scripts", () => {
  for (const d of DEMOS) it(`${d.name} runs without errors`, () => {
    const r = run(d.code, { resolveMap: (n) => d.maps?.[n] });
    expect(r.ok ? "ok" : r.error.message + " @ line " + r.error.line).toBe("ok");
  });
});

import { resetStyle, setStyle } from "@/lang/writeback";
import { styleValues } from "@/lang/timeline";
import { applyStyle, getTheme, THEMES } from "@/render/theme";

describe("looks", () => {
  it("there is exactly one look", () => expect(THEMES.length).toBe(1));
  it("there are three examples", () => expect(DEMOS.length).toBe(3));
  for (const d of DEMOS) it(`${d.name} runs for at least 10 seconds`, () => {
    const r = run(d.code, { resolveMap: (n) => d.maps?.[n] });
    expect(r.ok ? r.timeline.duration : 0).toBeGreaterThan(10);
  });
  it("style lines override the look and reset removes them", () => {
    const base = 'project "X" theme clean_modern\nsay "hi"\n';
    const tl1 = (run(base) as any).timeline;
    const c2 = setStyle(base, tl1, "accent", '"#00ff00"');
    const tl2 = (run(c2) as any).timeline;
    expect(applyStyle(getTheme(tl2.themeId), styleValues(tl2)).colors.accent).toBe("#00ff00");
    expect(applyStyle(getTheme(tl2.themeId), styleValues(tl2)).colors.background).toBe("#f7f8fa");
    const c3 = setStyle(c2, tl2, "accent", '"#123456"');
    expect(c3).toContain('style accent "#123456"');
    expect(resetStyle(c3, (run(c3) as any).timeline, "accent")).toBe(base);
  });
});
