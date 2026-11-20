/**
 * Saved progress for single-player (and local-bot) runs, kept in this browser's localStorage. The game
 * saves itself between courses: which course is next, truffles, upgrades, the state of the farm, and
 * the pig's ability loadout. No THREE or DOM beyond localStorage, which may be missing or blocked.
 */
import { type ComboId, type HogName, type UpgradeId } from './data';

export interface SaveData {
  v: 1;
  /** When it was saved (ms since epoch). */
  at: number;
  /** The game version that wrote it, for display. */
  version: string;
  course: number;
  truffles: number;
  levels: Partial<Record<UpgradeId, number>>;
  repairCount: number;
  edibleHp: number[];
  squad: { name: HogName; tint: number; hp: number; maxHp: number }[];
  stats: { time: number; dealt: number; taken: number; earned: number; fallen: number; ko: number };
  /** The break whose Hog Hunt is already done (Herb is resting), or -1. */
  huntedCourse: number;
  /** Ability slots, by id. */
  loadout: (string | null)[];
  /** Stand-in bot pigs in the herd when saved. */
  bots: number;
  /** Hog Rank and XP toward the next (older saves: rank 1). */
  rank?: number;
  xp?: number;
  /** Combo mastery: uses of each combo. */
  comboUses?: Partial<Record<ComboId, number>>;
  /** Rickley's garden plots, in order. */
  plots?: { g: number; planted: boolean; wet: number; gold: boolean }[];
}

const KEY = 'borpse.save.v1';

/** The saved run, or null if there isn't one (or it can't be read). */
export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (d?.v !== 1 || !Number.isFinite(d.course) || d.course < 0 || !Number.isFinite(d.truffles) || typeof d.levels !== 'object') return null;
    return d;
  } catch {
    return null;
  }
}

let last = '';

/** Saves the run (skipped if nothing changed since the last save). Returns whether it was written. */
export function writeSave(d: SaveData): boolean {
  // ignore the timestamp when deciding whether anything changed
  const key = JSON.stringify({ ...d, at: 0, stats: { ...d.stats, time: Math.floor(d.stats.time / 30) } });
  if (key === last) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    last = key;
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  last = '';
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing to clear */
  }
}
