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
