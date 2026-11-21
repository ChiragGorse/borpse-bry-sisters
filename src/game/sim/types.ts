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
  | 'spin'
  /** Sent to the Backrooms by Kioff's portal: gone from the farm for a few seconds. */
  | 'backrooms'
  /** Beaten at his last solo course, he phones Earwhen for backup (a story moment). */
  | 'calling';

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
  portal: 512,
  decoy: 1024,
  potion: 2048,
  smash: 4096,
} as const;
/** Every button bit, for validating what a browser sends. */
export const BTN_ALL = 0x1fff;

/** One player's controls for one simulation step. Movement is a world-space direction with length ≤ 1. */
export interface PlayerInput {
  mx: number;
  mz: number;
  buttons: number;
}

export const NO_INPUT: PlayerInput = { mx: 0, mz: 0, buttons: 0 };

/** Key in the inputs map for a person playing Allen (pigs use their player ids, which are positive). */
export const ALLEN_ID = -1;

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
  /** Adrenaline Gulp: seconds of hitting 30% harder. */
  rushT: number;
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
  /** Kioff's and Charig's active abilities. */
  portalCd: number;
  decoyCd: number;
  potionCd: number;
  smashCd: number;
  /** Seconds since this pig last took a hit (out-of-combat regen). */
  calmT: number;
  /** Keyframe Rewinds used this course. */
  rewinds: number;
  /**
   * Bumped whenever the simulation moves this pig by force (respawn, travel, knock-out, revival).
   * Online, a browser drives its own pig and ignores-then-adopts state with a newer epoch.
   */
  epoch: number;
}

/** The parts of a pig its owner's browser drives in online play (position, motion, actions, timers). */
export const POSE_KEYS = [
  'x', 'y', 'z', 'vx', 'vy', 'vz', 'heading', 'stam', 'stamDelay', 'action', 't', 'combo', 'comboTimer', 'buffered',
  'hitDone', 'hitDone2', 'invuln', 'blink', 'chargeCd', 'zapCd', 'zapAura', 'squealCd', 'whipCd', 'focus', 'dodged',
  'rollChain', 'chainHits', 'rushWindow', 'riverRush', 'flowCount', 'flowTimer', 'flowMove', 'muddy', 'rdx', 'rdz',
  'grounded', 'dummyChargeHit', 'portalCd', 'decoyCd', 'potionCd', 'smashCd', 'rushT',
] as const;
export type Pose = Partial<Pick<Player, (typeof POSE_KEYS)[number]>>;

/**
 * A move a browser-driven pig made: the server replays it, at the pose it happened, against the shared world.
 * `fn` names the move; `arg` distinguishes variants (the cyclone's first or second hit).
 */
export type StrikeFn =
  | 'attack'
  | 'upStart'
  | 'flopStart'
  | 'whipStart'
  | 'charge'
  | 'chargeHit'
  | 'headbutt'
  | 'cyclone'
  | 'uppercut'
  | 'whip'
  | 'flop'
  | 'zap'
  | 'squeal'
  | 'portal'
  | 'decoy'
  | 'potion'
  | 'smash';
export interface Strike {
  fn: StrikeFn;
  arg: number;
  pose: Pose;
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
/** `scare` and `vanish`: the jump-scare Guppy of the Hog Hunt (his `mode` is 'lunge'). */
export type GuppyState = 'waiting' | 'chasing' | 'windup' | 'recovering' | 'returning' | 'scare' | 'vanish';
export type PathGuppy = BotBody & { kind: 'guppy'; behavior: GuppyState };
export type KitchenBot = BotBody & { kind: BotKind };
/**
 * What Earwhen is doing: leaping in, stalking, his three cream attacks (a wide Spray, a rapid Stream of
 * pellets, a charged Mega Dollop blob), wandering off to snack, or staggered.
 */
export type EarwhenAct = 'arrive' | 'stalk' | 'sprayWind' | 'spray' | 'streamWind' | 'stream' | 'blobWind' | 'blob' | 'robotWind' | 'robots' | 'leapWind' | 'leap' | 'toEat' | 'eating' | 'stagger';
export type EarwhenBot = BotBody & {
  kind: 'earwhen';
  act: EarwhenAct;
  /** Aim of the cream cannon (world angle). */
  aim: number;
  cdSpray: number;
  cdStream: number;
  cdBlob: number;
  /** Cooldown of the Flaming Robots volley. */
  cdRobots: number;
  /** Cooldown of his Cream Quake leap (from stage 3 on). */
  cdLeap: number;
  /** Seconds he can't be staggered or properly stunned again (after a stagger or a stun). */
  steady: number;
  hunger: number;
  /** Edible he's heading for or eating, or -1. */
  target: number;
  shots: number;
  /** Damage taken towards the next stagger. */
  poise: number;
  /** Where his leap lands, or where his Mega Dollop is headed. */
  tx: number;
  tz: number;
  /** Allen is down: Earwhen fights angrier. */
  rage: boolean;
};
export type Bot = KitchenBot | PathGuppy | EarwhenBot;

export interface Puddle {
  id: number;
  x: number;
  z: number;
  r: number;
  life: number;
  maxLife: number;
  tick: number;
  dmg: number;
  /** A splat of Earwhen's cream rather than Sriracha. */
  cream?: boolean;
}
/** Kioff's wireframe pig: kitchen bots and Allen chase it until it expires. */
export interface Decoy {
  id: number;
  x: number;
  z: number;
  life: number;
  maxLife: number;
  /** Bursts into damaging pixels when it expires (level 2). */
  burst: boolean;
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
  /** `cream`: a pellet from Earwhen's Stream; `blob`: his arcing Mega Dollop; `robot`: a burning robot he fires that explodes where it lands. */
  kind: 'chopstick' | 'chili' | 'cream' | 'blob' | 'robot';
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
  /** Path Guppy just jumped out at this player. */
  | { t: 'scare'; only: number }
  | { t: 'bell' }
  | { t: 'dummyHit'; dx: number; dz: number }
  | { t: 'area'; area: Area; changed: boolean }
  | { t: 'teleport'; heading: number }
  | { t: 'lookAt'; x: number; z: number }
  /** Online: the server tells a pig's owner it was hit (or dodged), so the owner applies the knockback. */
  | { t: 'knock'; only: number; fx: number; fz: number; knock: number; dodge: boolean };
