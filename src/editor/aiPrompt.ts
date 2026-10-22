/** A complete script in the studio language. The test suite parses it, so the reference can't drift from the parser. */
export const EXAMPLE_SCRIPT = `project "The Price of Coffee" theme clean_modern

headline "Coffee prices hit a record high" paper "THE MORNING LEDGER" body "Drought cut supply just as demand kept climbing." mark "record high" over 3s enter drop
camera zoom 1.15 over 4s ease smooth
wait 4.5s
push 0.6

line "Arabica price, $ per lb" "2019" 1.0 "2020" 1.1 "2021" 1.9 "2022" 2.2 over 3s as price enter blur
unverified price
wait 3.5s
whip 0.5

count 70 suffix "%" label "Share of beans from five countries" over 2s as share enter pop
source share "Example Report" https://example.org
wiggle share over 0.8s delay 2s
wait 3.5s
wipe 0.6

say "Your morning cup is a *climate* story" beat 0.35s enter rise
wait 3s
`;

/** A map scene. Needs the bundled country outlines; the test loads them. */
export const EXAMPLE_MAP_SCRIPT = `project "Balkans, 1991" theme clean_modern

map 44 18 zoom 5.2 as balkans
year "1991"
wait 1s

country slovenia green pulse
pin 46.05 14.5 flag green
legend "Slovenia" green
wait 1.2s

country serbia red pulse
pin 44.8 20.46 troops red
wait 1.2s

country croatia blue sweep
attack serbia croatia red bend 0.2 width 1.4
pin 45.35 19.0 battle red delay 1s
legend "Croatia" blue
wait 2.8s

fly 44.1 19.2 zoom 6.6 tilt 35 over 2s
year "1995" highlight
bubble 44.35 19.3 "Srebrenica, July 1995" red delay 0.4s
wait 3.5s

remove labels
tag 43.86 18.75 "NATO air campaign" left blue
wait 2.5s
`;

const REFERENCE = `You write scripts for "Pillars of Creation Studio", a tool that turns a plain-text script into an animated explainer video. Output ONE code block containing the script, and nothing else. Use only the commands listed below.

RULES
- One command per line. "#" starts a comment. Text in double quotes. Multi-word country or region names are quoted: "bosnia and herzegovina".
- Canvas is 1920 x 1080 pixels; the centre is 960 540.
- Durations: "2s", "500ms", or a bare number of seconds.
- "wait 3s" advances the timeline. "delay 2s" at the end of any line starts that line later without waiting.
- Name anything you will refer to later with "as name", then use that name in later lines.
- Scenes end with a transition command (crossfade, whip, push, wipe, blur, slide, zoom, or cut).
- The COMMANDS list shows syntax forms. Notes after two spaces or inside brackets are for you: never copy them into the script. The EXAMPLE at the end is the most reliable guide.

COMMANDS
project "Title" theme clean_modern
style radius 12                       (style keys: background text accent display body radius grain caps)
show photo @reactor_wide as reactor enter fade      (built-in photos: @reactor_wide @pillars @telescope)
zoom reactor 1.0 to 1.15 over 6s ease smooth
caption reactor "Reactor 4, April 1986"
fade reactor to 0.85 over 1s
count 3.6 unit "roentgen per hour" over 2s as dose enter pop    (also: prefix "$", suffix "%", label "...")
bars "Title" "Label A" 31 "Label B" 4000 over 3s enter rise
line "Title" "2020" 1.0 "2021" 1.9 over 3s as price enter blur
headline "Headline text" paper "PAPER NAME" body "Body text" mark "phrase to highlight" over 3s enter drop
say "Text with *emphasis* on words" at 960 540 beat 0.4s enter blur
arrow from 300 900 to 500 800 over 0.5s
highlight from 300 300 to 700 320 over 0.5s
circle at 1500 560 radius 160 over 0.6s
box at 400 300 size 300 180 over 0.6s
source name "Publisher" https://example.org          (a citation line for a named object)
unverified name                                        (marks a figure as not yet checked)
move name to 960 480 curve 120 over 1.2s ease spring
scale name 1.5 over 0.5s
rotate name 45 over 0.5s
pulse name over 0.6s
wiggle name over 0.8s
camera zoom 1.3 over 3s ease smooth
camera to 960 540 zoom 1 over 1.5s ease out
wait 3s
crossfade 0.8    (also: whip, push, wipe, blur, slide, zoom; "cut" for a hard cut)
for i from 0 to 2
  arrow from (300 + i*500) 900 to (500 + i*500) 800 over 0.5s
  wait 0.4s
end

Entrance and exit styles (enter X / exit X): fade pop rise drop slide_left slide_right blur spin grow wipe
Easing names (ease X): smooth linear in out snap overshoot spring bounce

MAPS (only if the script is about places)
map 44 18 zoom 5.2 as balkans          (lat lng, decimal degrees; optional tilt 35 turn 10 labels off)
map france                             (start on a country, auto-framed)
fly 44.1 19.2 zoom 6.6 tilt 35 over 2s
country slovenia green pulse           (animations: pulse fade radial sweep none)
region crimea ukraine red occupied     (region name, then its country)
attack serbia croatia red bend 0.2 width 1.4     (arrow between two countries or "lat lng" places)
route germany poland blue              (dashed connection line)
pin 46.05 14.5 flag green              (symbols: explosion battle bombing fire skull nuke tank troops plane naval oil factory port flag capital shield treaty uprising occupation)
bubble 44.35 19.3 "Caption text" red
label 42.25 20.9 "Place" size 20
tag 43.86 18.75 "NATO air campaign" left blue
year "1991" highlight
legend "Label" green
legend auto
remove last | arrows | pins | labels | colors | effects | lines | legend | year | all

COLOURS
Map palette: red orange yellow gold green teal cyan blue indigo purple pink magenta brown gray white maroon coral salmon tan navy lime
Or any standard CSS colour name (goldenrod, skyblue, crimson ...), or "#rrggbb".

EXAMPLE
${EXAMPLE_SCRIPT}`;

/** The reference an LLM needs to write a script the editor accepts. */
export const AI_PROMPT = REFERENCE;

/** The script in an AI reply: the first fenced code block if there is one, otherwise the whole reply. */
export function extractScript(reply: string): string {
  const fence = /```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/.exec(reply);
  return (fence ? fence[1]! : reply).trim();
}
