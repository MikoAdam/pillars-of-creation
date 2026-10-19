/** Voiceover files live in IndexedDB (too large for localStorage). */
const DB = "pnt-audio", STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export interface AudioItem { name: string; blob: Blob; url: string }

export async function loadAudio(): Promise<AudioItem[]> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const out: AudioItem[] = [];
      const cur = db.transaction(STORE).objectStore(STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return res(out);
        const blob = c.value as Blob;
        out.push({ name: String(c.key), blob, url: URL.createObjectURL(blob) });
        c.continue();
      };
      cur.onerror = () => res(out);
    });
  } catch { return []; }
}

export async function saveAudio(name: string, blob: Blob) {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, name);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function deleteAudio(name: string) {
  try {
    const db = await open();
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(name);
  } catch { /* ignore */ }
}
