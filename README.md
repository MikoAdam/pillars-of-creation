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
4. **Export** to MP4 with the voice and music mixed in: 720p, 1080p, 1440p, 4K, vertical (Shorts,
   Reels, TikTok) or square; 24, 25, 30 or 60 fps; draft, standard or best quality; H.264, HEVC,
   AV1 or VP9 where the browser can encode them; subtitles in the picture or as an `.srt`
   file. The file downloads by itself when it is ready, or (Chrome, Edge) is written straight
   into a folder you choose. Long videos can be split into parts that are saved one by one, and
   **Keep the computer responsive** rests between frames so the machine stays usable during a
   long export; it can be paused. A WebM recording is used where WebCodecs is unavailable.

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

## Quoting sources

`cite "The exact words." from "Article title" by "Publisher" date "12 March 2024" url https://...`
shows a short passage of text as a clipping, with the publisher, title, date, link and (for
Wikipedia and other Creative Commons text) `license "CC BY-SA 4.0"` on screen next to it. The
look follows the project's style. `sources` makes a closing card that lists every `cite` and
`source` in the script, once each (`over 8s` rolls it). The AI reference tells the model to
quote only a sentence or two, word for word, to attribute every quote, and never to use
pictures from the web. This is how quotation and fair use are normally done, not legal advice.

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

- **Machine voice:** write the narration as `narrate "..."` lines. **Make the machine voice** in
  the Audio panel voices them with [Supertonic](https://huggingface.co/Supertone/supertonic), an
  open English text-to-speech model (code MIT, model OpenRAIL) that runs on this computer: about
  260 MB to download once, then about half a second per line, each line made once and kept in
  the browser. The voice is in the preview and in the exported video, and the script is timed to
  it: each `narrate` line waits until it has been said. `narrator voice "F2" speed 1.1` picks
  one of ten voices (F1 to F5, M1 to M5) and the pace; `narrator subtitles` also shows the
  lines as subtitles. Until the clips exist, the browser's own voice reads the lines in the
  preview (it can't be recorded). **Copy the narration** gives the text to record a real
  voiceover, which then replaces the machine voice.
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
