import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { run } from "@/lang/interpreter";
import { setGeoData } from "@/render/geo";
import { AI_PROMPT, EXAMPLE_MAP_SCRIPT, EXAMPLE_SCRIPT, extractScript } from "./aiPrompt";

const SCENE_SMOKE = `project "Smoke" theme clean_modern
style radius 12
show photo @reactor_wide as reactor enter fade
zoom reactor 1.0 to 1.15 over 6s ease smooth
caption reactor "Reactor 4, April 1986"
fade reactor to 0.85 over 1s
count 3.6 prefix "$" suffix "%" unit "roentgen per hour" label "Dose" over 2s as dose enter pop
source dose "IAEA" https://example.org
unverified dose
bars "Deaths" "Official" 31 "Estimate" 4000 over 3s enter rise
line "Price" "2020" 1.0 "2021" 1.9 over 3s as price enter blur
headline "A headline" paper "THE DAILY" body "Body" mark "headline" over 3s enter drop
say "One *idea*" at 960 540 beat 0.4s enter blur
title "Chapter *one*" sub "A smaller line"
lower "Jane Doe" "Astrophysicist"
lower "Only a name"
quote "Words worth *remembering*" by "Someone"
credits "Thanks for watching" "Script" "Jane Doe" "Music" "A. Composer" over 8s
credits "Script" "Jane Doe"
icon tank at 960 540 size 240 color red as armour enter pop
icon radar
image @logo at 1600 160 size 300
narrator speed 1.1 lang "en-US" subtitles
narrate "One or two short sentences the narrator says."
narrate "Spoken without holding things up." nowait
cite "The exact words, one or two sentences." from "Title of the article" by "Publisher" date "12 March 2024" url https://example.org/article
cite "Words from Wikipedia." from "Article title" by "Wikipedia" date "accessed 12 March 2024" url https://en.wikipedia.org/wiki/Article_title license "CC BY-SA 4.0"
sources
sources "Further reading" over 8s
music @song volume 0.3
arrow from 300 900 to 500 800 over 0.5s
highlight from 300 300 to 700 320 over 0.5s
circle at 1500 560 radius 160 over 0.6s
box at 400 300 size 300 180 over 0.6s
move reactor to 960 480 curve 120 over 1.2s ease spring
scale reactor 1.5 over 0.5s
rotate reactor 45 over 0.5s
pulse reactor over 0.6s
wiggle reactor over 0.8s
shake 18 over 0.5s
camera zoom 1.3 over 3s ease smooth
camera to 960 540 zoom 1 over 1.5s ease out
crossfade 0.8
whip 0.5
push 0.6
wipe 0.6
blur 0.6
slide 0.6
zoom 0.6
cut
for i from 0 to 2
  arrow from (300 + i*500) 900 to (500 + i*500) 800 over 0.5s
  wait 0.4s
end
wait 2s
`;

beforeAll(() => {
  setGeoData("countries", JSON.parse(readFileSync("public/geo/countries.json", "utf8")));
  setGeoData("regions", JSON.parse(readFileSync("public/geo/regions.json", "utf8")));
});

describe("AI reference", () => {
  it("the example script parses", () => {
    const r = run(EXAMPLE_SCRIPT);
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
  });

  it("the example map script parses", () => {
    const r = run(EXAMPLE_MAP_SCRIPT);
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
  });

  it("every scene-level command in the reference parses", () => {
    const r = run(SCENE_SMOKE);
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
  });

  it("the map commands in the reference parse", () => {
    const src = `project "Maps" theme clean_modern
map france
map 44 18 zoom 5.2 as balkans tilt 35 turn 10 labels off
fly 44.1 19.2 zoom 6.6 tilt 35 over 2s
country slovenia green pulse
region crimea ukraine red occupied
attack serbia croatia red bend 0.2 width 1.4
route germany poland blue
pin 46.05 14.5 flag green
bubble 44.35 19.3 "Caption text" red
label 42.25 20.9 "Place" size 20
tag 43.86 18.75 "NATO air campaign" left blue
year "1991" highlight
legend "Label" green
legend auto
remove arrows
`;
    const r = run(src);
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
  });

  it("the prompt carries the example and the rules", () => {
    expect(AI_PROMPT).toContain(EXAMPLE_SCRIPT.trim());
    expect(AI_PROMPT).toContain("ONE code block");
    expect(AI_PROMPT).toContain("goldenrod");
  });
});

describe("credits, icons and pictures", () => {
  const tl = (src: string, opts = {}) => {
    const r = run(src, opts);
    if (!r.ok) throw new Error(r.error.message);
    return r.timeline;
  };
  it("credits take a heading and role/name pairs, and roll only with over", () => {
    const still = tl('credits "The end" "Script" "Jane" "Music" "Ann"').objects[0]!;
    expect(still.data.heading).toBe("The end");
    expect(still.data.rows).toEqual([{ role: "Script", name: "Jane" }, { role: "Music", name: "Ann" }]);
    expect(still.data.roll).toBe(false);
    const rolling = tl('credits "Script" "Jane" over 6s').objects[0]!;
    expect(rolling.data.heading).toBe("");
    expect(rolling.data.roll).toBe(true);
  });
  it("an icon keeps its place, size and colour", () => {
    const o = tl("icon tank at 400 300 size 200 color red").objects[0]!;
    expect(o.kind).toBe("icon");
    expect(o.pos.base).toEqual([400, 300]);
    expect(o.box[2]).toBe(200);
    expect(o.data.color).toBe("#dc2626");
  });
  it("an unknown icon is an error that lists the names", () => {
    const r = run("icon unicorn");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("tank");
  });
  it("a picture takes the shape of its file once the size is known", () => {
    const o = tl("image @logo size 400", { assetSize: () => [800, 200] as [number, number] }).objects[0]!;
    expect(o.box[2]).toBe(400);
    expect(o.box[3]).toBe(100);
  });
});

describe("narration and sources", () => {
  const tl = (src: string) => {
    const r = run(src);
    if (!r.ok) throw new Error(r.error.message);
    return r.timeline;
  };
  it("narrate waits as long as the words take to say, nowait does not", () => {
    const t = tl('narrate "One two three four five six seven eight nine ten eleven twelve thirteen"\nsay "after"\nnarrate "Quick." nowait\nsay "same time"');
    const [n1, n2] = t.narration!;
    expect(n1!.t1 - n1!.t0).toBeCloseTo(13 / 2.6, 1);
    const after = t.objects.find((o) => o.kind === "say" && o.data.text === "after")!;
    expect(after.start).toBeCloseTo(n1!.t1 + 0.25, 5);
    const same = t.objects.find((o) => o.kind === "say" && o.data.text === "same time")!;
    expect(same.start).toBeCloseTo(n2!.t0, 5);
  });
  it("narrator speed shortens the lines, and subtitles mirrors them", () => {
    const slow = tl('narrate "A sentence of about eight words, said here."').narration![0]!;
    const fast = tl('narrator speed 2 subtitles\nnarrate "A sentence of about eight words, said here."');
    const f = fast.narration![0]!;
    expect(f.t1 - f.t0).toBeCloseTo((slow.t1 - slow.t0) / 2, 1);
    expect(fast.subs?.[0]?.text).toBe("A sentence of about eight words, said here.");
  });
  it("cite needs to say where the words are from", () => {
    expect(run('cite "Words."').ok).toBe(false);
    expect(run('cite "Words." url example').ok).toBe(false);
  });
  it("sources lists every cite and source once, including ones after it", () => {
    const t = tl(`count 5 as a
source a "Example Report" https://example.org
cite "Words." from "Page" by "Wikipedia" date "1 May 2025" url https://en.wikipedia.org/wiki/Page license "CC BY-SA 4.0"
sources
cite "Again." from "Page" by "Wikipedia" date "1 May 2025" url https://en.wikipedia.org/wiki/Page license "CC BY-SA 4.0"
cite "Later." from "Other" by "A Paper" url https://example.org/other`);
    const items = t.objects.find((o) => o.kind === "sources")!.data.items as { by: string; license: string }[];
    expect(items.map((i) => i.by)).toEqual(["Example Report", "Wikipedia", "A Paper"]);
    expect(items[1]!.license).toBe("CC BY-SA 4.0");
  });
});

describe("extracting a script from a reply", () => {
  it("takes the first fenced block", () => {
    expect(extractScript('Here you go:\n```\nproject "A"\nwait 1s\n```\nThanks')).toBe('project "A"\nwait 1s');
  });
  it("takes a language-tagged block", () => {
    expect(extractScript('```text\nwait 2s\n```')).toBe("wait 2s");
  });
  it("uses the whole reply when there is no block", () => {
    expect(extractScript("  wait 3s  ")).toBe("wait 3s");
  });
});
