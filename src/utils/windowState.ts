export interface WindowGeometry {
  width: number;
  height: number;
  x: number;
  y: number;
}

const KEY = 'any-editor.window.v1';

export function loadWindowGeometry(): WindowGeometry | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WindowGeometry;
    if (
      !parsed ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number' ||
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveWindowGeometry(geo: WindowGeometry): void {
  localStorage.setItem(KEY, JSON.stringify(geo));
}
