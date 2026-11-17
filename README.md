# Pillars of Creation Studio

Turn a short script into a polished explainer video, entirely in your browser.

The script is the single source of truth. An AI can write the first draft, you adjust it by
hand on the canvas or in the editor, and every hand action rewrites the script. The result is
reproducible: the same script always renders the same video, and it exports to MP4 with sound.

Nothing is uploaded anywhere. No accounts, no server, no paid services.

## The workflow

1. **Copy explanation for LLMs** in the header copies a reference for the script language, with
   a worked example. Paste it into any AI chat together with your topic and ask for a script.
2. **Paste from AI** takes the chat's reply, pulls the script out of its code block, checks it
   line by line, and loads it. Errors show their line number and nothing broken gets loaded.
3. **Adjust.** Click an object on the preview to select it; drag to move, corner handles to resize,
   the knob to rotate. Each action writes the same command you could have typed, and your
   comments and formatting survive. Or edit the script on the right directly: it follows the
   playhead and highlights the block that is running.
4. **Export** to MP4 (1080p, 4K or vertical for Shorts and Reels) with the voiceover and music
   mixed in. A WebM recording is used where WebCodecs is unavailable.

`Save` writes the script, its maps and your photos to one `.pillars.json` file (also `Ctrl+S`);
`Open` loads one.

## The screen

- **Left rail:** *Add* (title cards, lower thirds, quotes, text, counters, charts, headlines, end
  credits, arrows and shapes), *Assets* (your pictures and the icon library, searchable),
  *Motion* (entrances, exits, emphasis, scene transitions, camera moves), *Audio* (narration and
  music) and *Maps*. Click an item to add it at the playhead, or drag it onto the preview to
  place it. Click the open tab again to hide the panel.
- **Centre:** the drawing tools above the preview, the play controls under it, and the
  properties of the selected object.
- **Right:** the script. The arrow in its header hides it when you want a bigger preview.
- **Bottom:** the timeline. Drag a bar to retime it, its edge to change how long it takes.

## Assets

Pictures are used full screen (`show photo @name`, with slow zooms and captions) or placed on
top like a shape (`image @name at 1600 160 size 300`; PNG logos keep their transparency). The
icon library is the designer's hand-drawn set that the maps use, plus the stock symbols:
`icon tank at 960 540 size 240 color red`.

## The script language

One command per line, `#` for comments, text in double quotes, the canvas is 1920 × 1080.
Durations are `2s`, `500ms` or a bare number of seconds. `wait 3s` advances the timeline;
`delay 2s` on any line starts that line later. Name anything you will refer to later with
`as name`.

```text
project "Why the sky is blue" theme midnight

title "Why the sky is *blue*" sub "A two-minute explainer"
wait 4s
crossfade 0.8

show photo @pillars as nebula enter fade
zoom nebula 1.0 to 1.12 over 6s ease smooth
caption nebula "The Pillars of Creation, Eagle Nebula (M16)"
lower "Dr Jane Doe" "Astrophysicist"
wait 6s
wipe 0.6

count 6500 suffix " light years" label "Distance from Earth" over 2s as dist enter rise
source dist "NASA" https://science.nasa.gov
wait 4s
push 0.6

bars "Relative scattering" "Red" 1 "Green" 3 "Blue" 6 "Violet" 9 over 4s enter rise
wait 5s

quote "Air scatters *blue light* more than red" by "Lord Rayleigh, 1871"
wait 5s
```

Scenes: photos with slow zooms and captions, animated counters, bar and line charts, newspaper
headlines with highlighter sweeps, kinetic text, title cards, lower thirds, quotes, end credits
(`credits "Thanks for watching" "Script" "Jane Doe" over 8s` rolls them up the screen), icons,
placed pictures, arrows, circles, boxes and highlighters. Entrances and exits (`enter pop`, `exit fade`), scene
transitions (`crossfade`, `whip`, `push`, `wipe`, `blur`, `slide`, `zoom`, `cut`), camera moves,
`pulse` and `wiggle`, easings, `let` variables and `repeat`/`for` loops. The in-app prompt is the
complete reference; its examples are parsed by the test suite so it cannot drift from the parser.

Two looks ship: `clean_modern` (light) and `midnight` (dark, with grain). The **Style** panel
adjusts colours and fonts and writes `style` lines into the script.

## Maps

Maps are made in the map tool, which opens inside the studio from the **Maps** panel (**New map**). Build the map there
with its own script (`germany: blue, pulse`, attack arrows, symbols, camera flights), then
**Save and add to video**. The map is stored under its name and the video refers to it with
`include map "Name"`. The video plays the map from its script but cannot change it; select it and
press **Edit map** (or the pencil in the Maps panel) to open it in the map tool again. Country names
are placed so they never overlap each other or the pins and callouts, and a callout that would
cover an older one steps aside with a leader line. The classic map tool is also served on its
own at `/map-tool/index.html`.

## Audio

- **Narration:** upload a recording and it becomes the voiceover. Subtitles are written into the
  script automatically by an open-source speech model (Whisper) running in a web worker; the audio
  never leaves the machine.
- **Music:** upload a track and it loops quietly under the whole video. `music @track volume 0.3`
  sets the level; it is mixed into the export together with the voiceover.

## Development

```sh
npm i
npm run dev
npm test        # language, map, demo and AI-reference tests
npm run build
```

Render code lives in `src/render/` (no React, one file per scene type); the script language in
`src/lang/` (lexer → parser → interpreter → timeline); the studio UI in `src/editor/` and
`src/routes/`. Architecture rules are in `AGENTS.md`.

## Tech

TypeScript, React 19, TanStack Start, Tailwind CSS v4, canvas 2D, WebCodecs via mediabunny,
@huggingface/transformers (Whisper). Map outlines are Natural Earth, bundled in `public/geo/`.
