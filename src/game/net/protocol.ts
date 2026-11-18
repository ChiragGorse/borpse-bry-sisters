/**
 * Wire protocol between the game server (server/) and browsers. Shared by both sides.
 *
 * The server runs the authoritative `Sim` at TICK_HZ and broadcasts a state message every tick:
 * "hot" entity data (positions, timers) as compact value arrays, plus "meta" (shop levels, banners,
 * squad, map…) only when it changed, plus the simulation's one-shot events. Clients send their
 * controls; buttons are edge-triggered and OR-ed together until the server's next tick.
 */
import type { SimEvent } from '../sim/types';
import type { UpgradeId } from '../data';

export const PROTOCOL_VERSION = 1;
export const TICK_HZ = 30;
/** Clients render other entities this far behind the newest snapshot, to interpolate smoothly. */
export const INTERP_DELAY = 0.1;
/** The server stops applying a client's movement if it hears nothing for this long (tab hidden, paused). */
export const INPUT_TIMEOUT = 0.3;
export const MAX_NAME = 16;

/* ───────── which fields of each entity go over the wire ───────── */

export const KEYS = {
  player: ['id', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'heading', 'hp', 'stam', 'action', 't', 'combo', 'hitDone', 'riverRush', 'grounded', 'blink', 'muddy', 'focus', 'zapAura', 'flowCount', 'flowTimer', 'chargeCd', 'zapCd', 'squealCd', 'whipCd', 'rushWindow', 'chainHits', 'hurtTick'],
  playerMeta: ['id', 'name', 'tint', 'maxHp', 'maxStam', 'flowMove', 'prompt', 'shopNpc'],
  allen: ['active', 'x', 'y', 'z', 'heading', 'hp', 'state', 't', 'poise', 'walk', 'flash', 'exposed', 'shielded', 'shieldT', 'tx', 'tz', 'airDur', 'target', 'phase'],
  allenMeta: ['maxHp', 'poiseMax', 'phases', 'potTotal', 'shieldDur', 'enraged'],
  bot: ['id', 'kind', 'x', 'z', 'hp', 'maxHp', 'heading', 'stun', 'chomp', 'flash', 'ph', 'mode', 'mt', 'lx', 'lz', 'hop', 'moving', 'swing', 'behavior'],
  proj: ['id', 'kind', 'x', 'y', 'z', 'vx', 'vz', 'friendly'],
  puddle: ['id', 'x', 'z', 'r', 'life'],
  shock: ['id', 'x', 'z', 'r', 'maxR', 'hostile'],
  pickup: ['id', 'area', 'x', 'y', 'z'],
  kernel: ['id', 'x', 'y', 'z'],
  pot: ['id', 'x', 'z', 'wob', 'ph', 'hp'],
  hazard: ['id', 'x', 'z', 'r', 't', 'dur'],
  memorial: ['id', 'x', 'z', 'life'],
  wild: ['id', 'name', 'look', 'x', 'z', 'heading', 'ph', 'moving', 'spotted'],
  ally: ['id', 'name', 'tint', 'x', 'z', 'heading', 'hp', 'maxHp', 'atk', 'inv', 'ph', 'dying', 'moving'],
} as const;
export type EntityKind = keyof typeof KEYS;

/** Entity lists in a hot snapshot, in this order. */
export const LISTS = ['bot', 'proj', 'puddle', 'shock', 'pickup', 'kernel', 'pot', 'hazard', 'memorial', 'wild', 'ally'] as const;
export type ListKind = (typeof LISTS)[number];

type Wire = number | string | boolean | null;

/** Rounds numbers to centimetres / hundredths: plenty for rendering and roughly halves the payload. */
export function wire(v: unknown): Wire {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  return null;
}

export function pack(o: object, keys: readonly string[]): Wire[] {
  const r = o as Record<string, unknown>;
  return keys.map((k) => wire(r[k]));
}

export function unpack<T>(arr: readonly Wire[], keys: readonly string[]): T {
  const o: Record<string, unknown> = {};
  keys.forEach((k, i) => (o[k] = arr[i] === null ? undefined : arr[i]));
  return o as T;
}

/* ───────── messages ───────── */

export interface LobbyPlayer {
  id: number;
  name: string;
  tint: number;
  bot: boolean;
}

export interface Meta {
  area: 'farm' | 'forest';
  mode: 'intermission' | 'combat';
  course: number;
  tod: number;
  levels: Record<UpgradeId, number>;
  repairCount: number;
  truffles: number;
  recruited: string[];
  hunt: { total: number; caught: number } | null;
  forestHint: string;
  overReason: string | null;
  outcome: 'gameover' | 'victory' | null;
  subtitle: { who: string; text: string } | null;
  banner: { title: string; sub: string; key: number } | null;
  edibleHp: number[];
  players: Wire[][];
  allen: Wire[];
}

export interface Stats {
  time: number;
  dealt: number;
  taken: number;
  earned: number;
  fallen: number;
  ko: number;
}

export interface Hot {
  players: Wire[][];
  allen: Wire[];
  lists: Wire[][][];
  sniffCd: number;
  sniffTime: number;
  sniffTargetId: number;
  kingCast: number;
  turretYaw: number;
  hitstop: number;
}

export type ServerMsg =
  | { t: 'welcome'; v: number; pid: number; room: string }
  | { t: 'lobby'; room: string; host: number; playing: boolean; bots: number; players: LobbyPlayer[] }
  /** One simulation tick: server tick time, hot state, meta when changed, stats about once a second, events. */
  | { t: 's'; st: number; hot: Hot; meta?: Meta; stats?: Stats; ev: SimEvent[] }
  | { t: 'error'; msg: string };

export type ClientMsg =
  | { t: 'in'; mx: number; mz: number; b: number }
  | { t: 'start' }
  | { t: 'retry' }
  | { t: 'restart' }
  | { t: 'farm' }
  | { t: 'closeShop' }
  | { t: 'buy'; id: UpgradeId }
  | { t: 'bots'; n: number };

/** Room codes: four letters, no look-alikes. */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function normalizeRoom(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
}
