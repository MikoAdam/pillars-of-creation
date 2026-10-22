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
