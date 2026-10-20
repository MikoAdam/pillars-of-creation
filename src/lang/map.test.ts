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

describe("legacy map commands (colon form)", () => {
  const name = (o: { kind: string }) => o.kind;
  it("parses the colon form and colors a country", () => {
    const t = tl('map 48 15 zoom 4\npoland: #dc2626');
    const m = t.objects.find(name)["kind"] === "map" ? t.objects.find((o) => o.kind === "map") : undefined;
    expect(m).toBeTruthy();
    expect(m!.data.fills.length).toBe(1);
    expect(m!.data.fills[0].color).toBe("#dc2626");
    expect(m!.data.fills[0].anim).toBe("none");
  });
  it("fly blocks the cursor for 1.2s and re-aims the camera", () => {
    const t = tl("map 48 15 zoom 4\nfly: 52 13, 6\npin 52 13 tank red");
    expect(t.objects.find((o) => o.kind === "pin")!.start).toBeCloseTo(1.2, 5);
  });
  it("zoom: frames a country in 0.6s", () => {
    const t = tl("map 20 10 zoom 2\nzoom: france\npin 48.85 2.35 tank red");
    expect(t.objects.find((o) => o.kind === "pin")!.start).toBeCloseTo(0.6, 5);
  });
  it("attack with two countries and the named coordinate form", () => {
    const t = tl("map 45 15 zoom 4\nattack: poland, belarus, #ca8a03");
    const a = t.objects.find((o) => o.kind === "attack")!;
    expect(a.data.color).toBe("#ca8a03");
    const t2 = tl("map 30 10 zoom 5\nattack: from 52 13, to 50 20, color red, width 2, head 2, dur 500");
    const a2 = t2.objects.find((o) => o.kind === "attack")!;
    expect(a2.data.a).toEqual([13, 52]);
    expect(a2.data.width).toBe(2);
    expect(a2.data.head).toBe(2);
    expect(a2.progress.segs[0].t1 - a2.progress.segs[0].t0).toBe(0.5);
  });
  it("line between two countries makes a straight dashed route", () => {
    const t = tl("map 45 15 zoom 4\nline: germany, poland");
    const r = t.objects.find((o) => o.kind === "route")!;
    expect(r.data.straight).toBe(true);
  });
  it("bubble without coordinates is a screen-fixed subtitle", () => {
    const t = tl('map 45 15 zoom 4\nbubble "Something happened"');
    const b = t.objects.find((o) => o.kind === "bubble")!;
    expect(b.data.subtitle).toBe(true);
    expect(b.pos.base[0]).toBe(960);
    expect(b.pos.base[1]).toBe(1067);
  });
  it("label becomes a pointer tag and year becomes a top-left pill", () => {
    const t = tl('map 45 15 zoom 4\nlabel: 52 13, "Checkpoint Charlie"\nyear: 1989');
    const tag = t.objects.find((o) => o.kind === "tag")!;
    expect(tag.data.dir).toBe("right");
    const y = t.objects.find((o) => o.kind === "year")!;
    expect(y.data.text).toBe("1989");
    expect(y.pos.base[0]).toBe(32);
  });
  it("legend auto snapshots country fills in command order", () => {
    const t = tl('map 45 15 zoom 4\nlegend: auto\npoland: red\nserbia: blue');
    const l = t.objects.find((o) => o.kind === "legend")!;
    expect(l.data.entries.map((e: any) => e.label)).toEqual(["Poland", "Serbia"]);
    expect(l.data.entries.map((e: any) => e.color)).toEqual(["#dc2626", "#2563eb"]);
  });
  it("effects are typed and unknown ones are silently skipped", () => {
    const t = tl("map 45 15 zoom 4\neffect: 44.8 20.46, explosion, red");
    const e = t.objects.find((o) => o.kind === "effect")!;
    expect(e.data.symbol).toBe("explosion");
    const r = run("map 45 15 zoom 4\neffect: 44.8 20.46, zombie, red");
    expect(r.ok).toBe(true);
  });
  it("remove effects / lines / colors end their own kinds", () => {
    const t = tl("map 45 15 zoom 4\neffect: 44.8 20.46, tank\nattack: poland, belarus, red\nline: germany, poland\npoland: blue\nwait 1s\nremove effects\nremove lines\nclear poland");
    const e = t.objects.find((o) => o.kind === "effect")!;
    const a = t.objects.find((o) => o.kind === "attack")!;
    const r = t.objects.find((o) => o.kind === "route")!;
    expect(e.end).toBe(1);
    expect(a.end).toBe(1);
    expect(r.end).toBe(1);
    expect(t.objects.find((o) => o.kind === "map")!.data.fills[0].end).toBe(1);
  });
  it("rename replaces a country label and unrename removes it", () => {
    const t = tl('map 45 15 zoom 4\nrename britain "United Kingdom"\nwait 1s\nunrename britain');
    const m = t.objects.find((o) => o.kind === "map")!;
    expect(m.data.renames[0].text).toBe("United Kingdom");
    expect(m.data.renames[0].end).toBe(1);
  });
  it("unknown legacy commands never crash the run", () => {
    expect(tl("map 45 15 zoom 4\natlantis: red\nzoom: atlantis").objects.find((o) => o.kind === "map")).toBeTruthy();
  });
});
