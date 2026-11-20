/** Music and sound-effects volume (0-1 each), saved on this device. */
export interface Volume {
  music: number;
  sfx: number;
}

const STORE = 'borpse.volume';
const DEFAULT: Volume = { music: 0.8, sfx: 1 };
const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

function load(): Volume {
  try {
    const v = JSON.parse(window.localStorage.getItem(STORE) ?? 'null') as Partial<Volume> | null;
    return { music: clamp01(v?.music, DEFAULT.music), sfx: clamp01(v?.sfx, DEFAULT.sfx) };
  } catch {
    return { ...DEFAULT };
  }
}

let current: Volume = typeof window === 'undefined' ? { ...DEFAULT } : load();
const listeners = new Set<() => void>();

export function getVolume(): Volume {
  return current;
}

export function setVolume(patch: Partial<Volume>) {
  current = { music: clamp01(patch.music, current.music), sfx: clamp01(patch.sfx, current.sfx) };
  try {
    window.localStorage.setItem(STORE, JSON.stringify(current));
  } catch {
    /* lasts until the page closes */
  }
  for (const f of listeners) f();
}

export function onVolumeChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
