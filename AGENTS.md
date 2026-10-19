<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- All video drawing lives in `src/render/` (no React); one file per scene type in `src/render/scenes/`. Why: preview and export must share identical render code.
- Every scene is a pure function of time `t`; never use CSS/timer animation for video content. Why: export steps frames deterministically.
- Scripts are validated with the zod schema in `src/render/schema.ts`; types derive from it. Why: single source of truth for script format.
- `noUncheckedIndexedAccess` is off. Why: render code indexes arrays heavily with bounds already guaranteed by loops/timeline math.
- The studio script language lives in `src/lang/` (lexer → parser → interpreter → Timeline); the program runs once per edit, never per frame. Why: renderTimeline must stay a pure function of t.
- Hand actions only modify code via `src/lang/writeback.ts`, editing exact literal spans or inserting lines. Why: code is the single source of truth and user formatting/comments must survive.
- `src/engine/renderTimeline.ts` layers the scene renderers with `transparent: true`. Why: reuse scene drawing without changing it.
- Every drag-and-drop action in the studio has a matching script command/keyword (enter/exit, rotate, opacity, delay, camera, shake, pulse, wiggle, transitions); new hand features must add the script form first. Why: script and hand editing stay equal in power.
- Camera, entrance/exit effects and transitions are applied in `src/engine/renderTimeline.ts`, not in scene renderers; the camera resets at each scene change. Why: scene renderers stay untouched and pure.
- Export (`src/engine/exportVideo.ts`) renders through `renderTimeline` with a `scale` option for larger outputs; never a separate render path. Why: export must match the preview.
- Speech-to-text runs locally with Whisper via transformers.js in a web worker (`src/editor/whisperWorker.ts`); subtitles are written into the script as `subtitle t0 t1 "text"` lines. Why: user wants open-source, no paid service, and code stays the single source of truth.
- The app is fully client-side: no Lovable Cloud, no server functions or API routes; the script autosaves to localStorage and voiceovers to IndexedDB. Why: user wants nothing uploaded and no accounts or paid services — introduce a backend only when the user asks.
- Maps are drawn on the canvas from bundled Natural Earth outlines (`public/geo/*.json`, loaded once via `src/render/geo.ts`) with our own Web Mercator projection, never a tile map library. Why: map frames must stay a pure function of t so preview and export match; tiles load asynchronously.
- Map items (pins, bubbles, labels, tags, attacks) store lat/lng and are projected through their map's camera at draw time (`anchorAt` in `src/lang/timeline.ts`); hand edits rewrite the lat/lng literals. Why: items stay glued to places while the map camera flies.
