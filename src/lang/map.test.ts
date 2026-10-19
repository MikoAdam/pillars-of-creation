import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { run } from "./interpreter";
import { anchorAt } from "./timeline";
import { writeGeoEnd, writeGeoMove, writeMapCam } from "./writeback";
import { setGeoData, findCountry, findRegion, makeProjection } from "@/render/geo";

beforeAll(() => {
  setGeoData("countries", JSON.parse(readFileSync("public/geo/countries.json", "utf8")));
  setGeoData("regions", JSON.parse(readFileSync("public/geo/regions.json", "utf8")));
});

const tl = (src: string) => {
  const r = run(src);
  if (!r.ok) throw new Error(r.error.message);
  return r.timeline;
};

describe("maps", () => {
  it("finds countries by name and alias, and regions inside a country", () => {
    expect(findCountry("bosnia")?.name).toBe("Bosnia and Herz.");
    expect(findCountry("usa")?.name).toBe("United States of America");
    expect(findRegion("crimea", "ukraine")).toBeTruthy();
  });
  it("map commands need a map first", () => {
    const r = run("country france blue");
    expect(r.ok).toBe(false);
  });
  it("unknown country is a readable error", () => {
    const r = run("map 48 15 zoom 4\ncountry frnace blue");
    expect(r.ok ? "" : r.error.message).toContain('Unknown country "frnace"');
  });
  it("projection round-trips screen ↔ lat/lng, also tilted and turned", () => {
    const pr = makeProjection({ lat: 45, lng: 15, zoom: 5, tilt: 30, turn: 20 });
    const [x, y] = pr.point(18, 44);
    const [lng, lat] = pr.unproject(x, y);
    expect(lng).toBeCloseTo(18, 4);
    expect(lat).toBeCloseTo(44, 4);
  });
  it("dragging a pin rewrites only its lat lng literals", () => {
    const code = "map 45 15 zoom 5\npin 44.8 20.46 tank red # keep me";
    const t = tl(code);
    const pin = t.objects.find((o) => o.kind === "pin")!;
    const [x, y] = anchorAt(pin, 0);
    const next = writeGeoMove(code, t, pin, 0, x, y + 100);
    expect(next).toMatch(/^map 45 15 zoom 5\npin 4\d\.\d+ 20\.46 tank red # keep me$/);
    expect(next).not.toBe(code);
  });
  it("dragging an attack end that names a country replaces it with coordinates", () => {
    const code = "map 45 18 zoom 5\nattack serbia croatia red";
    const t = tl(code);
    const a = t.objects.find((o) => o.kind === "attack")!;
    const next = writeGeoEnd(code, a, 0, "b", 900, 500);
    expect(next).toMatch(/^map 45 18 zoom 5\nattack serbia -?\d+(\.\d+)? -?\d+(\.\d+)? red$/);
  });
  it("map zoom from the canvas edits the zoom literal", () => {
    const code = "map 45 18 zoom 5";
    const t = tl(code);
    expect(writeMapCam(code, t, t.objects[0], 0, "zoom", [6.5])).toBe("map 45 18 zoom 6.5");
  });
  it("remove arrows ends attacks at the playhead", () => {
    const t = tl("map 45 18 zoom 5\nattack serbia croatia red\nwait 2s\nremove arrows\nwait 1s");
    expect(t.objects.find((o) => o.kind === "attack")!.end).toBe(2);
  });
  it("negative coordinates stay editable", () => {
    const code = "map 40 -74 zoom 6\npin 40.7 -74.0 capital blue";
    const t = tl(code);
    expect(t.objects.find((o) => o.kind === "pin")!.createSpans.at!.every(Boolean)).toBe(true);
  });
});
