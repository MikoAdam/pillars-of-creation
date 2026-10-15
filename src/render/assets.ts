import type { Assets, Project, Theme } from "./types";

export function collectImageUrls(p: Project): string[] {
  const urls = new Set<string>();
  for (const s of p.scenes) if ((s.type === "PhotoZoom" || s.type === "HeadlineHighlight") && s.imageUrl) urls.add(s.imageUrl);
  return [...urls];
}

export async function loadAssets(p: Project, existing?: Assets): Promise<Assets> {
  const out: Assets = new Map(existing);
  await Promise.all(
    collectImageUrls(p)
      .filter((u) => !out.has(u))
      .map(
        (u) =>
          new Promise<void>((res) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              out.set(u, img);
              res();
            };
            img.onerror = () => res();
            img.src = u;
          }),
      ),
  );
  return out;
}

export async function loadFonts(themes: Theme[]) {
  await Promise.all(
    themes.flatMap((t) => [
      document.fonts.load(`${t.fonts.displayWeight} 64px "${t.fonts.display}"`),
      document.fonts.load(`500 32px "${t.fonts.body}"`),
      document.fonts.load(`700 32px "${t.fonts.body}"`),
    ]),
  ).catch(() => undefined);
}
