const KEY = "pnt:maps";

function read(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function listMaps(): string[] {
  return Object.keys(read()).sort();
}

export function getMapCode(name: string): string | undefined {
  return read()[name];
}

export function saveMap(name: string, code: string): boolean {
  const all = read();
  all[name] = code;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

export function uniqueMapName(base: string): string {
  const taken = new Set(listMaps());
  let name = base, k = 2;
  while (taken.has(name)) name = `${base} ${k++}`;
  return name;
}
