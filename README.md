# Pillars of Creation — Script-to-Video Studio

Turn a text script into a polished animated explainer video, entirely in your browser.
One canvas, two ways to work at the same time: **by hand** (drag, drop, paint) and **by code** (a small
script language). The code is the single source of truth — every hand action rewrites it.

Nothing is uploaded anywhere. No accounts, no server, no paid services.

## Features

### Script language
- Imperative, one command per line, `#` comments. Runs once per edit and produces a timeline of
  keyframed objects; rendering is a pure function of time, so preview and export are pixel-identical.
- Variables (`let`), `repeat` and `for` loops for generated patterns.
- Every drag-and-drop action has a matching script command, and vice versa.

```text
project "Chernobyl Explained" theme clean_modern
show photo @reactor_wide as reactor
zoom reactor 1.0 to 1.15 over 6s
count 3.6 unit "roentgen per hour" over 2s as dose
source dose "IAEA" https://example.org
repeat 3 { arrow from 100 100 to 400 300 over 0.5s } end
```

### Scenes
Photo zoom, animated stat counters, bar charts, line charts, headline highlight, kinetic text,
and a full **map scene**: country/region fills, attack arrows, routes, symbol pins (19 badges),
bubbles, labels, year badges and a legend, with camera flights between them.

### Motion (the fun part)
- Entrances/exits: `fade`, `pop`, `rise`, `drop`, `slide`, `blur`, `spin`, `grow`, `wipe`
- Scene transitions: `crossfade`, `slide`, `zoom`, `wipe`, `push`, `whip`, `blur`
- Camera moves (`camera to x y zoom k over 1s`), `shake`, `pulse`, `wiggle`, arc curves, 9 easings.

### Hand tools
Drag objects on the canvas, corner handles to scale, rotate knob, pen tools (arrow, circle, box,
highlighter), text tool, image drop, camera frame tool, and a full map tool (click a country to
colour it, drag for attack arrows, pan/zoom the map). Every action writes the code — never
reformats your lines, keeps your comments. One shared 50-step undo stack.

### Export & audio
- Export 1080p / 4K / vertical (Shorts) MP4 via WebCodecs, with progress and estimated time;
  falls back to WebM recording when WebCodecs is unavailable. Partial-range export supported.
- Upload a voiceover; automatic subtitles via open-source Whisper running locally in a web worker —
  your audio never leaves the machine.

### Privacy
Fully client-side: scripts autosave to `localStorage`, voiceovers to IndexedDB. The only network
uses are loading the app itself, the one-time Whisper model download, and the bundled map outlines
in `public/geo/` (Natural Earth, simplified).

## Development

```sh
npm i
npm run dev
```

```sh
npm test        # language, writeback, map and demo tests
```

## Tech

TypeScript, React 19, TanStack Start, Tailwind CSS v4, canvas 2D, WebCodecs,
@huggingface/transformers (Whisper). Render code lives in `src/render/` (no React, one file per
scene type); the script language in `src/lang/` (lexer → parser → interpreter → timeline);
the studio UI in `src/editor/`.
