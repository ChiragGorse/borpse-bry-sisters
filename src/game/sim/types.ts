/**
 * Plain-data types for the headless game simulation. Nothing here may depend on THREE.js, the DOM or audio
 * at runtime (type-only imports are fine), so the simulation can run on a server and its state can be sent
 * over the network.
 */
import type { SfxName } from '../audio';
import type { CombatVfx } from '../vfx';
import type { BotKind, HogName, NpcId } from '../data';
import type { Collider } from '../layout';

export type KAction = 'none' | 'attack' | 'roll' | 'charge' | 'zap' | 'squeal' | 'uppercut' | 'bellyflop' | 'tailwhip' | 'hurt' | 'dead';
export type AState =
  | 'gone'
  | 'enter'
  | 'chase'
  | 'swipeWind'
  | 'swipe'
  | 'slamWind'
  | 'slamAir'
  | 'throwWind'
  | 'dashWind'
  | 'dash'
  | 'summon'
  | 'toEat'
  | 'eating'
  | 'recover'
  | 'stunned'
  | 'defeated'
  | 'leaving'
  | 'ko'
  | 'shielded'
  | 'guard'
  | 'rainCast'
  | 'spinWind'
  | 'spin';

export type Area = 'farm' | 'forest';

/** Buttons pressed since the previous simulation step (edge-triggered). */
export const BTN = {
  attack: 1,
  charge: 2,
  roll: 4,
  jump: 8,
  zap: 16,
  squeal: 32,
  whip: 64,
  interact: 128,
  listen: 256,
} as const;

/** One player's controls for one simulation step. Movement is a world-space direction with length ≤ 1. */
export interface PlayerInput {
  mx: number;
  mz: number;
  buttons: number;
}

export const NO_INPUT: PlayerInput = { mx: 0, mz: 0, buttons: 0 };

/** A pig controlled by a person (or a stand-in bot). Player 0 is the original Kenji. */
export interface Player {
  id: number;
  name: string;
  /** Skin colour of this pig. */
  tint: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  hp: number;
  maxHp: number;
  stam: number;
  maxStam: number;
  stamDelay: number;
  action: KAction;
  t: number;
  combo: number;
  comboTimer: number;
  buffered: boolean;
  hitDone: boolean;
  hitDone2: boolean;
  invuln: number;
  blink: number;
  chargeCd: number;
  zapCd: number;
  zapAura: number;
  squealCd: number;
  whipCd: number;
  focus: number;
  dodged: boolean;
  rollChain: number;
  chainHits: number;
  rushWindow: number;
  riverRush: boolean;
  flowCount: number;
  flowTimer: number;
  flowMove: string;
  muddy: number;
  rdx: number;
  rdz: number;
  grounded: boolean;
  /** Ids of bots already hit by the current Hog Charge. */
  chargeHit: Set<number>;
  dummyChargeHit: boolean;
  /** Increments every time this pig takes damage (drives the HUD hurt flash). */
  hurtTick: number;
  /** Interaction prompt for this player ("E|Trade with Rickley"). */
  prompt: string | null;
  /** Shop this player has open, if any. */
  shopNpc: NpcId | null;
}

interface BotBody {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  rad: number;
  heading: number;
  bite: number;
  stun: number;
  kx: number;
  kz: number;
  chomp: number;
  flash: number;
  ph: number;
  /** Sub-state for special enemies: idle, wind (skewer/tenderizer windup), lunge (skewer dash), fuse (bomber countdown). */
  mode: 'idle' | 'wind' | 'lunge' | 'fuse';
  mt: number;
  lx: number;
  lz: number;
  strafe: number;
  /** Vertical hop of the model this step (animation only). */
  hop: number;
  /** Walking this step (Path Guppy animation). */
  moving: boolean;
  /** Arm swing (Path Guppy animation). */
  swing: number;
}
export type GuppyState = 'waiting' | 'chasing' | 'windup' | 'recovering' | 'returning';
export type PathGuppy = BotBody & { kind: 'guppy'; behavior: GuppyState };
export type KitchenBot = BotBody & { kind: BotKind };
export type Bot = KitchenBot | PathGuppy;

export interface Puddle {
  id: number;
  x: number;
  z: number;
  r: number;
  life: number;
  maxLife: number;
  tick: number;
  dmg: number;
}
export interface Memorial {
  id: number;
  x: number;
  z: number;
  life: number;
}
export interface Proj {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  dmg: number;
  kind: 'chopstick' | 'chili';
  friendly?: boolean;
}
export interface Shock {
  id: number;
  x: number;
  z: number;
  r: number;
  maxR: number;
  speed: number;
  hostile: boolean;
  hitPlayers: Set<number>;
  hitAllies: Set<number>;
  dmg: number;
}
export interface Pickup {
  id: number;
  area: Area;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  value: number;
}
export interface Kernel {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Bot this corn kernel homes in on, or null for Allen. */
  botId: number | null;
  dmg: number;
}
export interface Pot {
  id: number;
  x: number;
  z: number;
  hp: number;
  wob: number;
  hitCd: number;
  ph: number;
}
export interface Hazard {
  id: number;
  x: number;
  z: number;
  r: number;
  t: number;
  dur: number;
  dmg: number;
}
export interface Wild {
  id: number;
  name: HogName;
  /** Index into the wild-hog colour table. */
  look: number;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  wait: number;
  ph: number;
  home: { x: number; z: number; r: number };
  spotted: boolean;
  oinkT: number;
  calm: number;
  moving: boolean;
}
export interface Ally {
  id: number;
  name: HogName;
  tint: number;
  x: number;
  z: number;
  heading: number;
  hp: number;
  maxHp: number;
  cd: number;
  atk: number;
  inv: number;
  ph: number;
  /** >0 while playing permanent death tumble before removal. */
  dying: number;
  moving: boolean;
}

/** A crop or pie Allen can eat. */
export interface SimEdible {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  hp: number;
  maxHp: number;
  crumb: number;
  collider?: Collider;
}

/** What the simulation needs to know about a map. */
export interface EdibleSpec {
  id: string;
  name: string;
  x: number;
  z: number;
  r: number;
  hp: number;
  maxHp: number;
  crumb: number;
  collider?: Collider;
}
export interface SimMaps {
  farm: { colliders: Collider[]; edibles: EdibleSpec[] };
  /** Called the first time the party travels to the forest. */
  loadForest: () => { colliders: Collider[] };
}

type VfxMethods = 'emit' | 'chunks' | 'sparks' | 'dust' | 'dustRing' | 'motes' | 'waterBurst' | 'slash' | 'hitBurst' | 'flash' | 'lightning' | 'shockWall' | 'groundMark' | 'chargeTrail';
/** The fire-and-forget part of CombatVfx. The simulation records these calls as events for the view to replay. */
export type VfxApi = Pick<CombatVfx, VfxMethods>;
export type VfxMethod = VfxMethods;

/**
 * One-shot things that happened during a simulation step, for the view to present.
 * `only` limits an event to the player it concerns (e.g. the "denied" buzz or a hit's camera shake).
 */
export type SimEvent =
  | { t: 'vfx'; m: VfxMethod; a: unknown[] }
  | { t: 'sfx'; n: SfxName; only?: number }
  | { t: 'text'; x: number; y: number; z: number; s: string; c: string }
  | { t: 'shake'; a: number; only?: number }
  | { t: 'troutLeap' }
  | { t: 'bell' }
  | { t: 'dummyHit'; dx: number; dz: number }
  | { t: 'area'; area: Area; changed: boolean }
  | { t: 'teleport'; heading: number }
  | { t: 'lookAt'; x: number; z: number };
