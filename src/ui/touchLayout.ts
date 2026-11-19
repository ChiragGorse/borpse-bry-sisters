/**
 * Where the on-screen touch buttons sit, as the player arranged them (saved on this device).
 * Positions are each button's centre as a fraction of the screen, so they survive rotation and resizes.
 */
import { useSyncExternalStore } from 'react';

export interface TouchLayout {
  /** Button id → centre (0-1 across, 0-1 down). Buttons without an entry use their default spot. */
  pos: Record<string, { x: number; y: number }>;
  /** Size multiplier for every button. */
  scale: number;
  /** Joystick on the right half of the screen (and the buttons default to the left). */
  stickRight: boolean;
}

const STORE = 'borpse.touchLayout';
export const DEFAULT_LAYOUT: TouchLayout = { pos: {}, scale: 1, stickRight: false };
export const SCALE_MIN = 0.75;
export const SCALE_MAX = 1.5;

function load(): TouchLayout {
  try {
    const raw = window.localStorage.getItem(STORE);
    if (!raw) return DEFAULT_LAYOUT;
    const v = JSON.parse(raw) as Partial<TouchLayout>;
    const pos: TouchLayout['pos'] = {};
    for (const [k, p] of Object.entries(v.pos ?? {})) {
      if (p && typeof p.x === 'number' && typeof p.y === 'number') pos[k] = { x: clamp01(p.x), y: clamp01(p.y) };
    }
    return { pos, scale: typeof v.scale === 'number' ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, v.scale)) : 1, stickRight: !!v.stickRight };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

const clamp01 = (v: number) => Math.min(0.98, Math.max(0.02, v));

let current: TouchLayout = typeof window === 'undefined' ? DEFAULT_LAYOUT : load();
const listeners = new Set<() => void>();

export function getTouchLayout(): TouchLayout {
  return current;
}

export function setTouchLayout(l: TouchLayout) {
  current = { pos: { ...l.pos }, scale: l.scale, stickRight: l.stickRight };
  try {
    window.localStorage.setItem(STORE, JSON.stringify(current));
  } catch {
    /* lasts until the page closes */
  }
  for (const f of listeners) f();
}

export function resetTouchLayout() {
  setTouchLayout(DEFAULT_LAYOUT);
}

export function useTouchLayout(): TouchLayout {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => current,
  );
}

export { clamp01 };
