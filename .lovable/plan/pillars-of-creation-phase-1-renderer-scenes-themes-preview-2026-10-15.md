&nbsp;

# Pillars of Creation — Phase 1: Renderer, Scenes, Themes, Preview

Scope for this step only: the canvas renderer, the six scene types, the theme system and a preview page that plays a sample script. The editor, AI generation, export and Cloud features wait for your go-ahead.

## What you will see

- A dark preview page at `/` with a 16:9 canvas that draws internally at 1920x1080 and scales down to fit the screen.
- Play/pause, a timeline you can drag, the current time and total length, plus markers showing where each scene starts.
- A theme switcher with three presets: Dark Documentary, Clean News, Bold Pop.
- A sample script of about 45 seconds that uses all six scene types and all four transitions. It includes an "unverified" stat so you can judge how the warning badge looks.
- Sample photos generated for the photo and headline scenes.

## Scene types

1. PhotoZoom: slow zoom and pan between a start frame and an end frame, an optional caption bar that slides in, and an optional vignette.
2. StatCounter: a number that counts up with easing (with prefix/suffix, unit and decimals), a label, a source line, and a badge if the figure is unverified.
3. BarChart: a title, then bars that grow one after another, with labels and values counting up, and a source line.
4. LineChart: a line that draws itself across the chart, a pulsing highlighted end point with its value, axes and a source line.
5. HeadlineHighlight: an article image or a text block drawn in a newspaper style, with a highlighter sweeping across the key phrases one at a time and a gentle zoom.
6. KineticText: words that appear on a beat with scale and fade, emphasis words in the accent color, and automatic line wrapping.

## Theme system

Each theme has: a display font and a body font (Google Fonts), a background color, a text color, an accent color, a set of easing curves, and film grain strength. Planned fonts:

- Dark Documentary: Anton + Inter Tight
- Clean News: Playfair Display + Source Sans 3
- Bold Pop: Archivo Black + DM Sans

## Technical details

- `src/render/` holds no React code:
  - `types.ts`: Project, Scene union and Theme types.
  - `schema.ts`: zod schema plus a function that turns validation problems into readable path-based messages.
  - `theme.ts`: the three presets.
  - `easing.ts`: easing and interpolation helpers.
  - `timeline.ts`: maps global time to the active scene, its local time and the transition progress.
  - `renderer.ts`: `renderFrame(ctx, project, theme, assets, t)` handles transitions (cut, crossfade, slide, zoom over 0.5s) by drawing the two scenes onto offscreen canvases, then adds grain.
  - `grain.ts`: seeded noise tile picked from the frame number, so the same time always gives the same grain.
  - `text.ts`: helpers for wrapping text, drawing the source line and the unverified badge.
  - `assets.ts`: preloads images and fonts before rendering starts.
  - `scenes/`: one file per scene type, each `renderX(ctx, scene, t, theme, assets)`.
- Every scene is a pure function of time `t`. There are no CSS or timer animations. The preview loop uses requestAnimationFrame only to move `t` forward and then calls the same `renderFrame`, so export can reuse it later.
- `src/sample/project.ts` holds the sample JSON and is validated through the schema. Any validation errors show up in a panel.
- `src/routes/index.tsx` is the preview UI, which is the only React code. It uses a dark UI and sets its own page title and description.
- The fonts load through `<link>` tags in the root page head and wait on `document.fonts.load` before drawing.
- Small tests cover the timeline mapping and the schema validation.