import reactor from "@/assets/sample-reactor.jpg";
import pillars from "@/assets/sample-pillars.jpg";
import telescope from "@/assets/sample-telescope.jpg";

export interface MediaItem {
  name: string;
  src: string;
  builtin?: boolean;
}

export const BUILTIN_MEDIA: MediaItem[] = [
  { name: "reactor_wide", src: reactor, builtin: true },
  { name: "pillars", src: pillars, builtin: true },
  { name: "telescope", src: telescope, builtin: true },
];

const CODE_KEY = "pnt:code";
const MEDIA_KEY = "pnt:media";

export function loadSaved(): { code: string | null; media: MediaItem[] } {
  try {
    const code = localStorage.getItem(CODE_KEY);
    const media = JSON.parse(localStorage.getItem(MEDIA_KEY) ?? "[]") as MediaItem[];
    return { code, media: Array.isArray(media) ? media : [] };
  } catch {
    return { code: null, media: [] };
  }
}

export function saveCode(code: string) {
  try { localStorage.setItem(CODE_KEY, code); } catch { /* ignore */ }
}

/** Returns false when storage is full. */
export function saveMedia(media: MediaItem[]) {
  try {
    localStorage.setItem(MEDIA_KEY, JSON.stringify(media.filter((m) => !m.builtin)));
    return true;
  } catch {
    return false;
  }
}

export function uniqueName(base: string, taken: string[]) {
  let n = base.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "photo";
  if (/^\d/.test(n)) n = "img_" + n;
  let name = n, k = 2;
  while (taken.includes(name)) name = `${n}_${k++}`;
  return name;
}

/** Downscale an image file to max 1920px wide JPEG data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1920 / img.width, 1080 * 1.5 / img.height);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => rej(new Error("Could not read image"));
    img.src = url;
  });
}
