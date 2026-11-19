/**
 * The Borpse Bry Sisters game simulation: every rule of the game, for any number of players, with no
 * rendering, DOM or audio. The browser view (../Game.ts) and a future multiplayer server both drive it by
 * calling `step(dt, inputs)` and presenting `drainEvents()` plus the public state.
 */
import { COURSES, EARWHEN, FINALE, HOG_NAMES, OPENING_BEATS, UPGRADES, costOf, maxLevel, emptyLevels, type BotKind, type GameOverReason, type HogName, type NpcId, type UpgradeId } from '../data';
import type { SfxName } from '../audio';
import {
  BOUND,
  COIL,
  FOREST_BOUND,
  FOREST_EXIT,
  HUNT_CACHES,
  TRUFFLE_SPOTS,
  FOREST_START,
  GUPPY_END,
  GUPPY_HP,
  GUPPY_SWING,
  SPOT,
  isOnLakeDock,
  type Collider,
} from '../layout';
import {
  ALLEN_ID,
  BTN,
  NO_INPUT,
  POSE_KEYS,
  type Pose,
  type Strike,
  type StrikeFn,
  type AState,
  type Ally,
  type Area,
  type Bot,
  type Decoy,
  type EarwhenBot,
  type Hazard,
  type Kernel,
  type KitchenBot,
  type Memorial,
  type PathGuppy,
  type Pickup,
  type Player,
  type PlayerInput,
  type Pot,
  type Proj,
  type Puddle,
  type Shock,
  type SimEdible,
  type SimEvent,
  type SimMaps,
  type VfxApi,
  type VfxMethod,
  type Wild,
} from './types';

const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const approach = (a: number, b: number, step: number) => (a < b ? Math.min(a + step, b) : Math.max(a - step, b));
const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > PI) d -= TAU;
  if (d < -PI) d += TAU;
  return d;
};
const angLerp = (a: number, b: number, t: number) => a + angDiff(a, b) * Math.min(1, t);

/** Small fast seeded PRNG so a headless run can be replayed exactly. */
function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAX_SQUAD = HOG_NAMES.length;

/* balance: Allen does the heavy lifting, the kitchen brigade backs him up */
/** Allen's damage on top of each course's numbers. */
const ALLEN_DMG = 1.18;
/** Kitchen bots' damage, and how much longer between their waves. */
const KITCHEN_DMG = 0.62;
const KITCHEN_WAVE_GAP = 1.3;
/** Seconds after a stun when Allen resists light stuns and his stagger bar won't fill. */
const STUN_IMMUNITY = 10;
/** Heavy (forced) stuns in that window last only this share of their usual time. */
const STUN_RECOVERING = 0.35;
export const MAX_PLAYERS = 8;
export const HOG_TINTS = [0xf2b38a, 0xe8a0b4, 0xffc9a8, 0xd9a0a0, 0xf7d0b0, 0xe9b9d9];
/** Skin colours for players 1..8 (player 1 is the classic pink Kenji). */
export const PLAYER_TINTS = [0xf7a8b8, 0xb8d8f7, 0xc9f2a6, 0xffd98a, 0xd9b8ff, 0xffb48a, 0x9fe8de, 0xf2f2f2];
const GUPPY_ALERT_RANGE = 9;
const GUPPY_TERRITORY = 26;
const GUPPY_DROPS = 5;
const VFX_METHODS: VfxMethod[] = ['emit', 'chunks', 'sparks', 'dust', 'dustRing', 'motes', 'waterBurst', 'slash', 'hitBurst', 'flash', 'lightning', 'shockWall', 'groundMark', 'chargeTrail'];

export function botStats(kind: BotKind, course: number): { hp: number; rad: number } {
  switch (kind) {
    case 'spitter':
      return { hp: 42 + course * 9, rad: 0.62 };
    case 'skewer':
      return { hp: 46 + course * 10, rad: 0.68 };
    case 'tenderizer':
      return { hp: 105 + course * 24, rad: 0.95 };
    case 'bomber':
      return { hp: 36 + course * 7, rad: 0.62 };
    default:
      return { hp: 38 + course * 9, rad: 0.6 };
  }
}

export function zapCooldown(lv: number): number {
  return lv >= 3 ? 6.0 : lv >= 2 ? 7.5 : 9.5;
}

export function newPlayer(id: number, name: string, tint: number): Player {
  return {
    id,
    name,
    tint,
    x: SPOT.start.x,
    y: 0,
    z: SPOT.start.z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: PI,
    hp: 100,
    maxHp: 100,
    stam: 100,
    maxStam: 100,
    stamDelay: 0,
    action: 'none',
    t: 0,
    combo: 0,
    comboTimer: 0,
    buffered: false,
    hitDone: false,
    hitDone2: false,
    invuln: 0,
    blink: 0,
    chargeCd: 0,
    zapCd: 0,
    zapAura: 0,
    squealCd: 0,
    whipCd: 0,
    focus: 0,
    dodged: false,
    rollChain: 0,
    chainHits: 0,
    rushWindow: 0,
    riverRush: false,
    flowCount: 0,
    flowTimer: 0,
    flowMove: '',
    muddy: 0,
    rdx: 0,
    rdz: -1,
    grounded: true,
    chargeHit: new Set(),
    dummyChargeHit: false,
    hurtTick: 0,
    prompt: null,
    shopNpc: null,
    epoch: 0,
    portalCd: 0,
    decoyCd: 0,
    potionCd: 0,
    smashCd: 0,
    calmT: 0,
    rewinds: 0,
  };
}

/** Copies the owner-driven fields of a pig. */
export function poseOf(p: Player): Pose {
  const o: Record<string, unknown> = {};
  for (const k of POSE_KEYS) o[k] = p[k];
  return o as Pose;
}

export function newAllen() {
  return {
    active: false,
    x: 0,
    y: 0,
    z: 66,
    heading: PI,
    hp: 1,
    maxHp: 1,
    state: 'gone' as AState,
    t: 0,
    poise: 0,
    poiseMax: 100,
    poiseDelay: 0,
    cdSwipe: 0,
    cdSlam: 0,
    cdThrow: 0,
    cdDash: 0,
    cdSummon: 0,
    globalCd: 0,
    decideT: 0,
    hunger: 20,
    /** Index into `edibles` of the snack Allen is heading for, or -1. */
    target: -1,
    /** Player Allen is fighting right now, or -1. */
    focusId: -1,
    eatX: 0,
    eatZ: 0,
    eatDmg: 0,
    chompT: 0,
    enraged: false,
    dropAcc: 0,
    stunDur: 0,
    stunImmune: 0,
    recoverDur: 0,
    sx: 0,
    sz: 0,
    tx: 0,
    tz: 0,
    airDur: 0.9,
    slamChain: 0,
    swipes: 0,
    volleys: 0,
    /** Players already flattened by the current dash. */
    dashHits: [] as number[],
    summoned: false,
    avoidT: 0,
    avoidDir: 1,
    walk: 0,
    flash: 0,
    phase: 0,
    phases: 1,
    shielded: false,
    shieldT: 0,
    shieldDur: 1,
    potTotal: 0,
    exposed: 0,
    immuneCd: 0,
    cdGuard: 0,
    cdRain: 0,
    cdSpin: 0,
    rainT: 0,
    rainLeft: 0,
    /** Per-player cooldown so one spin doesn't shred the same pig every frame. */
    spinHits: {} as Record<number, number>,
    spinRibbonT: 0,
    /** Tilted by Smash Battles: faster and angrier for this many seconds. */
    tilt: 0,
    /** A Smash Battles stun ends in a tilt. */
    tiltQueued: false,
    /** Seconds left wandering the Backrooms. */
    backroomsT: 0,
  };
}
export type AllenState = ReturnType<typeof newAllen>;

type Target = { x: number; z: number };

export class Sim {
  /* ───────── public, read-only for presenters ───────── */
  players: Player[] = [];
  A: AllenState = newAllen();
  bots: Bot[] = [];
  projs: Proj[] = [];
  puddles: Puddle[] = [];
  memorials: Memorial[] = [];
  shocks: Shock[] = [];
  pickups: Pickup[] = [];
  kernels: Kernel[] = [];
  pots: Pot[] = [];
  hazards: Hazard[] = [];
  wild: Wild[] = [];
  allies: Ally[] = [];
  decoys: Decoy[] = [];
  edibles: SimEdible[];

  time = 0;
  area: Area = 'farm';
  mode: 'intermission' | 'combat' = 'intermission';
  course = 0;
  tod = 0;
  levels = emptyLevels();
  repairCount = 0;
  truffles = 0;
  stats = { time: 0, dealt: 0, taken: 0, earned: 0, fallen: 0, ko: 0 };
  recruitedHogs = new Set<HogName>();
  /** The current Hog Hunt: caches dug up so far, and where the next one is (tx, tz). */
  hunt: { total: number; found: number; tx: number; tz: number; done: boolean } | null = null;
  /** Caches still to dig this hunt (the first is the one Herb is heading for). */
  private caches: { x: number; z: number; name: string }[] = [];
  /** Course whose break already had a hunt (Herb needs his rest). */
  private huntedCourse = -1;
  /** Seconds until Path Guppy's next jump scare. */
  private scareT = 0;
  forestHint = 'Follow Herb into the dark.';
  sniffCd = 0;
  sniffTime = 0;
  sniffTargetId = -1;
  overReason: GameOverReason | null = null;
  /** Set once the run ends; the view shows the matching screen. */
  outcome: 'gameover' | 'victory' | null = null;
  subtitle: { who: string; text: string; t: number } | null = null;
  banner: { title: string; sub: string; key: number; t: number } | null = null;
  opening: { step: number; t: number } | null = null;
  /** Kingger is casting a zap (arm raised) for this many seconds. */
  kingCast = 0;
  turretYaw = 0;
  /** Hit-stop: the whole simulation runs in slow motion for a moment after a big hit. */
  hitstop = 0;
  /** True when something changed that the HUD should show right away. */
  dirty = true;
  /** A person plays Allen (inputs keyed ALLEN_ID) instead of the AI. */
  allenPlayer = false;
  /** Allen's interaction prompt when a person plays him ("E|Eat the pumpkins"). */
  allenPrompt: string | null = null;
  /** With a person playing Allen, seconds until he comes back for the next course (pigs can ring the bell sooner). */
  allenBreak = 0;

  /* ───────── internal ───────── */
  private maps: SimMaps;
  private farmColliders: Collider[];
  private forestColliders: Collider[] | null = null;
  private turretCollider: Collider;
  private rnd: () => number;
  private nextId = 1;
  private events: SimEvent[] = [];
  private inputs = new Map<number, PlayerInput>();
  private snapshot: {
    levels: Record<UpgradeId, number>;
    repairCount: number;
    truffles: number;
    edibleHp: number[];
    squad: { name: HogName; tint: number; hp: number; maxHp: number }[];
    fallen: number;
    ko: number;
  } | null = null;
  private courseFallen = 0;
  private waveT = 10;
  private overTimer = 0;
  private bannerKey = 0;
  private greeted = { rickley: false, kingger: false, trout: false, kioff: false, charig: false };
  private barkT = 12;
  private dummyCoachCd = 0;
  private turretT = 0;
  private kingZapT = 3.5;
  private kingBarkCd = 0;
  private tips = new Set<string>();
  /** Records CombatVfx calls as events. */
  private fx: VfxApi;
  /** Where each pig was, and its health, over the last few seconds (Keyframe Rewind). */
  private history = new Map<number, { t: number; x: number; z: number; hp: number }[]>();
  private historyT = 0;
  /** Pigs driven by their owner's browser (online play), with moves waiting to be replayed. */
  private remote = new Map<number, { strikes: Strike[]; pose: Pose | null; guard: number }>();
  /** Set while replaying a browser's move: no re-aiming, no hit-stop, no events (the owner already showed them). */
  private replaying = false;
  /** Client-side prediction: receives the moves the predicted pig makes. */
  private recorder: ((s: Strike) => void) | null = null;

  constructor(maps: SimMaps, opts: { seed?: number } = {}) {
    this.maps = maps;
    this.rnd = mulberry32(opts.seed ?? (Math.random() * 2 ** 31) | 0);
    this.farmColliders = maps.farm.colliders;
    this.edibles = maps.farm.edibles.map((e) => ({ id: e.id, name: e.name, x: e.x, z: e.z, r: e.r, hp: e.hp, maxHp: e.maxHp, crumb: e.crumb, collider: e.collider }));
    // The shopkeepers stand in the way, and the corn cannon is solid once it's built.
    this.farmColliders.push({ kind: 'c', x: SPOT.rickley.x, z: SPOT.rickley.z, r: 0.9, hx: 0, hz: 0, h: 2.8, enabled: true });
    this.farmColliders.push({ kind: 'c', x: SPOT.kingger.x, z: SPOT.kingger.z, r: 0.8, hx: 0, hz: 0, h: 2.6, enabled: true });
    this.farmColliders.push({ kind: 'c', x: SPOT.kioff.x, z: SPOT.kioff.z, r: 0.8, hx: 0, hz: 0, h: 2.6, enabled: true });
    this.farmColliders.push({ kind: 'c', x: SPOT.charig.x, z: SPOT.charig.z, r: 0.8, hx: 0, hz: 0, h: 2.6, enabled: true });
    this.turretCollider = { kind: 'c', x: SPOT.turret.x, z: SPOT.turret.z, r: 0.9, hx: 0, hz: 0, h: 3, enabled: false };
    this.farmColliders.push(this.turretCollider);
    const fx = {} as Record<VfxMethod, (...a: unknown[]) => void>;
    for (const m of VFX_METHODS) fx[m] = (...a: unknown[]) => void this.events.push({ t: 'vfx', m, a });
    this.fx = fx as unknown as VfxApi;
  }

  /* ───────────────────────── players ───────────────────────── */

  /** Adds a pig to the party. Returns null when the party is full. */
  addPlayer(name?: string, id?: number): Player | null {
    if (this.players.length >= MAX_PLAYERS) return null;
    if (id !== undefined && this.players.some((o) => o.id === id)) return null;
    const used = new Set(this.players.map((p) => p.tint));
    const tint = PLAYER_TINTS.find((t) => !used.has(t)) ?? PLAYER_TINTS[0];
    const p = newPlayer(id ?? this.nextId++, name ?? (this.players.length === 0 ? 'Kenji' : `Pig ${this.players.length + 1}`), tint);
    this.players.push(p);
    this.applyStats(true);
    const slot = this.players.length - 1;
    // someone joining mid-game turns up beside the first pig, wherever the herd is
    const lead = this.players[0];
    const pos = slot > 0 ? this.spawnSpot(slot, lead.x, lead.z, lead.heading) : this.spawnSpot(0);
    p.x = pos.x;
    p.z = pos.z;
    this.dirty = true;
    return p;
  }

  /** Lets a person play Allen (true) or hands him back to the AI (false). */
  setAllenPlayer(on: boolean) {
    this.allenPlayer = on;
    this.allenPrompt = null;
    if (on && this.mode === 'intermission') this.allenBreak = Math.max(this.allenBreak, 4);
    this.dirty = true;
  }

  removePlayer(id: number) {
    this.players = this.players.filter((p) => p.id !== id);
    this.remote.delete(id);
    this.inputs.delete(id);
    if (this.A.focusId === id) this.A.focusId = -1;
    this.dirty = true;
  }

  player(id: number): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  /** Players still on their feet. */
  living(): Player[] {
    return this.players.filter((p) => p.action !== 'dead');
  }

  private spawnSpot(slot: number, cx = SPOT.start.x, cz = SPOT.start.z, heading = PI) {
    if (slot === 0) return this.safePosition(cx, cz);
    // fan the rest of the herd out in a little arc behind the first pig
    const row = Math.floor((slot - 1) / 4);
    const col = (slot - 1) % 4;
    const ang = heading + PI + (col - 1.5) * 0.55;
    const r = 2.6 + row * 1.8;
    return this.safePosition(cx + Math.sin(ang) * r, cz + Math.cos(ang) * r);
  }

  private nearestPlayer(x: number, z: number, maxD = Infinity, list = this.living()): Player | null {
    let best: Player | null = null;
    let bd = maxD;
    for (const p of list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /* ───────────────────────── events ───────────────────────── */

  /** Everything that happened since the last call, in order. */
  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private sound(n: SfxName, only?: Player) {
    this.events.push(only ? { t: 'sfx', n, only: only.id } : { t: 'sfx', n });
  }

  private floatText(x: number, y: number, z: number, s: string, c: string) {
    this.events.push({ t: 'text', x, y, z, s, c });
  }

  private addShake(a: number, only?: Player) {
    this.events.push(only ? { t: 'shake', a, only: only.id } : { t: 'shake', a });
  }

  private say(who: string, text: string, dur = 3.4) {
    this.subtitle = { who, text, t: dur };
    this.dirty = true;
  }

  private showBanner(title: string, sub: string) {
    this.banner = { title, sub, key: ++this.bannerKey, t: 3.4 };
    this.dirty = true;
  }

  private rand(a: number, b: number) {
    return a + this.rnd() * (b - a);
  }

  private pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rnd() * arr.length)];
  }

  private id() {
    return this.nextId++;
  }

  /* ───────────────────────── commands ───────────────────────── */

  /** Starts a fresh run. The opening story only plays for single-player games. */
  start(opts: { opening?: boolean } = {}) {
    this.resetAll();
    this.allenBreak = 4;
    this.mode = 'intermission';
    this.scatterTruffles(8);
    if (opts.opening ?? this.players.length <= 1) {
      this.opening = { step: 0, t: 4.8 };
      this.showBanner('THE LAST HOG', 'An opening story · press Space, Enter, E, or click to skip');
      this.say('Charig', "Before the farm, before the bell, before any of this, there was school. Let me tell you how it went wrong.", 4.8);
    } else {
      this.opening = { step: 0, t: 0 };
      this.finishOpening();
    }
    this.dirty = true;
  }

  finishOpening() {
    if (!this.opening) return;
    this.opening = null;
    this.subtitle = null;
    this.showBanner('SUPPERTIME IS COMING', 'Grab truffles · gear up · ring the Dinner Bell');
    const who = this.players.length > 1 ? 'Hogs' : 'Kenji';
    this.say('Rickley', `${who}! That Hwang fella's sniffin' round the gate again. Come see me 'fore you ring that bell.`, 6.5);
    this.dirty = true;
  }

  advanceOpening() {
    if (!this.opening) return;
    if (this.opening.step >= OPENING_BEATS - 1) {
      this.finishOpening();
    } else {
      this.opening = { step: this.opening.step + 1, t: 4.8 };
      this.dirty = true;
    }
  }

  retryCourse() {
    if (this.overReason === 'guppy') {
      this.recoverFromGuppy();
      return;
    }
    const s = this.snapshot;
    if (!s) {
      this.start();
      return;
    }
    this.clearEnemies();
    this.pickups = this.pickups.filter((p) => p.area === 'forest');
    this.clearSquad();
    this.setArea('farm');
    for (let i = 0; i < s.squad.length; i++) {
      const sv = s.squad[i];
      this.spawnAllyPig(SPOT.start.x + (i - 2) * 1.4, SPOT.start.z + 2.4, PI, sv.tint, sv.name, sv.hp, sv.maxHp);
    }
    this.stats.fallen = s.fallen;
    this.stats.ko = s.ko;
    this.courseFallen = 0;
    this.levels = { ...s.levels };
    this.repairCount = s.repairCount;
    this.truffles = s.truffles;
    this.edibles.forEach((e, i) => {
      e.hp = s.edibleHp[i];
      this.refreshEdible(e);
    });
    this.applyStats(true);
    this.resetPlayers();
    this.mode = 'intermission';
    this.overReason = null;
    this.overTimer = 0;
    this.outcome = null;
    this.greeted = { rickley: false, kingger: false, trout: false, kioff: false, charig: false };
    this.showBanner('ONE MORE TRY', `Ring the bell when you're ready for Course ${this.course + 1}`);
    this.dirty = true;
  }

  /** Leave the forest early (pause menu). */
  returnToFarm() {
    if (this.area !== 'forest') return;
    if (this.overReason === 'guppy') {
      this.recoverFromGuppy();
      return;
    }
    this.endHunt();
  }

  openShop(pid: number, npc: NpcId) {
    const p = this.player(pid);
    if (!p) return;
    p.shopNpc = npc;
    this.sound('truffle', p);
    this.dirty = true;
  }

  closeShop(pid: number) {
    const p = this.player(pid);
    if (!p || !p.shopNpc) return;
    p.shopNpc = null;
    this.dirty = true;
  }

  /** Buys an upgrade from the shop this player has open. Truffles and upgrades are shared by the whole herd. */
  buy(pid: number, id: UpgradeId) {
    const p = this.player(pid);
    const def = UPGRADES.find((u) => u.id === id);
    if (!p || !def || def.npc !== p.shopNpc) return;
    const lvl = this.levels[id];
    const cost = costOf(def, lvl, this.repairCount);
    const squadDamaged = this.allies.some((a) => a.dying <= 0 && a.hp < a.maxHp);
    if (lvl >= maxLevel(def) || this.truffles < cost || (id === 'repair' && this.farmPct() >= 99.5 && !squadDamaged)) {
      this.sound('deny', p);
      return;
    }
    this.truffles -= cost;
    if (def.repeatable) {
      this.repairCount++;
      this.repairFarm(0.25);
      this.healSurvivors(20);
    } else {
      this.levels[id] = lvl + 1;
      if (id === 'slop') this.healSurvivors(999);
    }
    this.applyStats(id === 'slop');
    this.sound('buy', p);
    if (def.npc === 'trout') this.leapTrout();
    if (id === 'zap') {
      this.sound('thunder');
      this.kingCast = 0.8;
      // celebratory high-voltage arc between Kingger and his Tesla coil!
      this.fx.lightning(SPOT.kingger.x, 2.7, SPOT.kingger.z, COIL.x, 3.3, COIL.z, 0x62f4ff, 0.09, 0.45);
      this.fx.lightning(COIL.x, 16, COIL.z, COIL.x, 3.3, COIL.z, 0xb8fcff, 0.12, 0.45);
      this.fx.hitBurst(COIL.x, 3.3, COIL.z, 0x5ff2ff, 1.6);
    }
    this.dirty = true;
  }

  /* ───────────────────────── state helpers ───────────────────────── */

  private resetPlayer(p: Player, slot: number) {
    p.epoch++;
    p.portalCd = p.decoyCd = p.potionCd = p.smashCd = 0;
    p.calmT = 0;
    p.rewinds = 0;
    this.history.delete(p.id);
    const pos = this.spawnSpot(slot);
    p.x = pos.x;
    p.z = pos.z;
    p.y = 0;
    p.vx = p.vy = p.vz = 0;
    p.heading = PI;
    p.hp = p.maxHp;
    p.stam = p.maxStam;
    p.action = 'none';
    p.t = 0;
    p.combo = 0;
    p.invuln = 0;
    p.blink = 0;
    p.chargeCd = 0;
    p.zapCd = 0;
    p.zapAura = 0;
    p.squealCd = 0;
    p.whipCd = 0;
    p.focus = 0;
    p.dodged = false;
    p.rollChain = 0;
    p.chainHits = 0;
    p.rushWindow = 0;
    p.riverRush = false;
    p.flowCount = 0;
    p.flowTimer = 0;
    p.flowMove = '';
    p.muddy = 0;
    p.grounded = true;
    p.hurtTick = 0;
    p.prompt = null;
    p.shopNpc = null;
  }

  private resetPlayers() {
    this.players.forEach((p, i) => this.resetPlayer(p, i));
    this.events.push({ t: 'teleport', heading: PI });
  }

  private resetAll() {
    this.clearEnemies();
    this.clearSquad();
    this.setArea('farm');
    this.pickups = [];
    this.levels = emptyLevels();
    this.repairCount = 0;
    this.truffles = 0;
    this.course = 0;
    this.tod = 0;
    this.snapshot = null;
    this.recruitedHogs.clear();
    this.courseFallen = 0;
    this.tips.clear();
    this.stats = { time: 0, dealt: 0, taken: 0, earned: 0, fallen: 0, ko: 0 };
    this.overReason = null;
    this.overTimer = 0;
    this.outcome = null;
    this.subtitle = null;
    this.opening = null;
    this.banner = null;
    this.greeted = { rickley: false, kingger: false, trout: false, kioff: false, charig: false };
    for (const e of this.edibles) {
      e.hp = e.maxHp;
      this.refreshEdible(e);
    }
    this.applyStats(true);
    this.resetPlayers();
  }

  private clearEnemies() {
    this.decoys = [];
    this.bots = [];
    this.projs = [];
    this.puddles = [];
    this.memorials = [];
    this.shocks = [];
    this.kernels = [];
    this.A.active = false;
    this.A.state = 'gone';
    this.clearStageProps();
    this.A.shielded = false;
    this.A.exposed = 0;
  }

  private applyStats(heal: boolean) {
    const lv = this.levels;
    for (const p of this.players) {
      p.maxHp = 100 + [0, 25, 50, 80, 115][Math.min(lv.slop, 4)];
      p.maxStam = 100 + [0, 30, 60, 95][Math.min(lv.trotters, 3)];
      if (heal && p.action !== 'dead') p.hp = p.maxHp;
      p.hp = Math.min(p.hp, p.maxHp);
      p.stam = Math.min(p.stam, p.maxStam);
    }
    this.turretCollider.enabled = lv.cannon > 0;
  }

  /** Colliders of the map the party is on. */
  colliders(): Collider[] {
    return this.area === 'forest' && this.forestColliders ? this.forestColliders : this.farmColliders;
  }

  mapBound() {
    return this.area === 'forest' ? FOREST_BOUND : BOUND;
  }

  private setArea(area: Area) {
    if (area === 'forest' && !this.forestColliders) this.forestColliders = this.maps.loadForest().colliders;
    const changed = this.area !== area;
    this.area = area;
    for (const p of this.players) {
      p.flowCount = 0;
      p.flowTimer = 0;
      p.chainHits = 0;
      p.rushWindow = 0;
      p.prompt = null;
    }
    this.shocks = [];
    this.hitstop = 0;
    this.sniffCd = this.sniffTime = 0;
    this.sniffTargetId = -1;
    this.events.push({ t: 'area', area, changed });
  }

  safePosition(x: number, z: number, rad = 0.7) {
    const bound = this.mapBound() - 1;
    for (let i = 0; i < 70; i++) {
      const a = i * 2.4;
      const r = i === 0 ? 0 : Math.sqrt(i) * 0.6;
      const px = clamp(x + Math.sin(a) * r, -bound, bound);
      const pz = clamp(z + Math.cos(a) * r, -bound, bound);
      if (!this.resolve(px, pz, rad).hit) return { x: px, z: pz };
    }
    return this.resolve(clamp(x, -bound, bound), clamp(z, -bound, bound), rad);
  }

  /** Moves the whole herd (players and squad) to a spot, e.g. when travelling between maps. */
  private travelTo(x: number, z: number, heading: number) {
    this.players.forEach((p, i) => {
      p.epoch++;
      const pos = i === 0 ? this.safePosition(x, z) : this.spawnSpot(i, x, z, heading);
      p.x = pos.x;
      p.z = pos.z;
      p.y = p.vx = p.vy = p.vz = 0;
      if (p.action !== 'dead') p.action = 'none';
      p.t = p.comboTimer = 0;
      p.buffered = false;
      p.grounded = true;
      p.heading = heading;
    });
    const lead = this.players[0] ?? { x, z };
    this.allies.forEach((a, i) => {
      const ang = heading + PI + i * 1.1;
      const pos = this.safePosition(lead.x + Math.sin(ang) * 3.5, lead.z + Math.cos(ang) * 3.5);
      a.x = pos.x;
      a.z = pos.z;
      a.heading = heading;
    });
    this.events.push({ t: 'teleport', heading });
  }

  farmPct() {
    let hp = 0;
    let max = 0;
    for (const e of this.edibles) {
      hp += e.hp;
      max += e.maxHp;
    }
    return (hp / max) * 100;
  }

  private repairFarm(frac: number) {
    let pool = frac * this.edibles.reduce((a, e) => a + e.maxHp, 0);
    const sorted = [...this.edibles].sort((a, b) => a.hp - b.hp);
    for (const e of sorted) {
      const add = Math.min(pool, e.maxHp - e.hp);
      e.hp += add;
      pool -= add;
      this.refreshEdible(e);
      if (pool <= 0) break;
    }
  }

  private refreshEdible(e: SimEdible) {
    if (e.collider) e.collider.enabled = e.hp > 0;
  }

  resolve(x: number, z: number, rad: number) {
    let hit = false;
    let cx = 0;
    let cz = 0;
    const onDock = this.area === 'farm' && rad < 1.0 && isOnLakeDock(x, z);
    for (const c of this.colliders()) {
      if (!c.enabled) continue;
      if (onDock && c.lakeWater) continue;
      if (c.kind === 'c') {
        const dx = x - c.x;
        const dz = z - c.z;
        const min = rad + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.0001;
          x = c.x + (dx / d) * min;
          z = c.z + (dz / d) * min;
          hit = true;
          cx = c.x;
          cz = c.z;
        }
      } else {
        const px = clamp(x, c.x - c.hx, c.x + c.hx);
        const pz = clamp(z, c.z - c.hz, c.z + c.hz);
        const dx = x - px;
        const dz = z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < rad * rad) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = px + (dx / d) * rad;
            z = pz + (dz / d) * rad;
          } else {
            const ox = c.hx - Math.abs(x - c.x);
            const oz = c.hz - Math.abs(z - c.z);
            if (ox < oz) x = c.x + (x < c.x ? -1 : 1) * (c.hx + rad);
            else z = c.z + (z < c.z ? -1 : 1) * (c.hz + rad);
          }
          hit = true;
          cx = c.x;
          cz = c.z;
        }
      }
    }
    return { x, z, hit, cx, cz };
  }

  private spawnTruffle(x: number, z: number, burst: boolean) {
    const a = this.rnd() * TAU;
    const sp = burst ? 3 + this.rnd() * 5 : 0;
    this.pickups.push({
      id: this.id(),
      area: this.area,
      x,
      y: burst ? 2.6 : 0.5,
      z,
      vx: Math.cos(a) * sp,
      vz: Math.sin(a) * sp,
      vy: burst ? 8 + this.rnd() * 4 : 0,
      age: burst ? 0 : 1,
      value: 5 + (this.levels.magnet > 0 ? 1 : 0),
    });
  }

  private scatterTruffles(n: number) {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = this.rand(-46, 46);
        const z = this.rand(-46, 46);
        const near = this.players.some((p) => Math.hypot(x - p.x, z - p.z) <= 8);
        if (!this.resolve(x, z, 1.5).hit && !near) {
          this.spawnTruffle(x, z, false);
          break;
        }
      }
    }
  }

  private spawnShock(x: number, z: number, maxR: number, speed: number, hostile: boolean, dmg: number) {
    this.shocks.push({ id: this.id(), x, z, r: hostile ? 3 : 1, maxR, speed, hostile, hitPlayers: new Set(), hitAllies: new Set(), dmg });
  }

  /* ───────────────────────── course flow ───────────────────────── */

  private beginCourse() {
    if (this.area !== 'farm' || this.mode !== 'intermission' || this.hunt) return;
    const finale = this.course >= FINALE;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    const A = this.A;
    // Purge any still-animating fallen hogs before snapshotting survivors
    this.allies = this.allies.filter((a) => !(a.dying > 0 || a.hp <= 0));
    this.snapshot = {
      levels: { ...this.levels },
      repairCount: this.repairCount,
      truffles: this.truffles,
      edibleHp: this.edibles.map((e) => e.hp),
      squad: this.allies.map((a) => ({ name: a.name, tint: a.tint, hp: a.hp, maxHp: a.maxHp })),
      fallen: this.stats.fallen,
      ko: this.stats.ko,
    };
    // the bell calls everyone out of the shops
    for (const p of this.players) {
      p.shopNpc = null;
      p.rewinds = 0;
    }
    this.courseFallen = 0;
    this.mode = 'combat';
    const fresh = newAllen();
    Object.assign(A, fresh);
    A.active = true;
    A.x = 0;
    A.y = 0;
    A.z = 68;
    A.heading = PI;
    // a bigger herd faces a heartier Allen
    A.hp = A.maxHp = Math.round(c.hp * this.hpScale());
    A.state = 'enter';
    A.poiseMax = (150 + 40 * this.course) * (1 + 0.4 * (this.players.length - 1));
    A.cdSlam = 2.2;
    A.cdThrow = 2.8;
    A.cdDash = 4.5;
    A.cdSummon = 6.5;
    A.globalCd = 0.8;
    A.hunger = c.hunger * 0.72;
    A.phases = c.phases;
    A.cdGuard = 4;
    A.cdRain = 5.5;
    A.cdSpin = 7;
    this.waveT = 4.5; // first vanguard of kitchen enemies rushes through the gate early!
    this.kingZapT = 3.2;
    this.clearStageProps();
    this.tod = Math.min(this.course, 7);
    this.barkT = 10;
    this.sound('bell');
    this.events.push({ t: 'bell' });
    if (finale) {
      // a battered Allen, with backup
      A.hp = A.maxHp = Math.round(c.hp * this.hpScale() * EARWHEN.allenHp);
      A.phases = 1;
      this.spawnEarwhen(5, 78, 4.5, 58);
      this.showBanner(`FINAL COURSE · ${EARWHEN.name.toUpperCase()}`, 'Allen brought backup');
      this.say('Allen', 'EARWHEN! Cream them!', 4.4);
    } else {
      this.showBanner(`COURSE ${this.course + 1}/${COURSES.length} · ${c.name.toUpperCase()}`, c.newFoe ?? 'Allen B. Hwang is at the gate');
      this.say('Allen', c.intro, 4.4);
    }
    this.events.push({ t: 'lookAt', x: A.x, z: 60 });
  }

  /** Allen's health multiplier for the size of the herd: +60% per extra player. */
  private hpScale() {
    return 1 + 0.6 * Math.max(0, this.players.length - 1);
  }

  private defeatAllen() {
    const A = this.A;
    A.hp = 0;
    A.shielded = false;
    A.exposed = 0;
    this.clearStageProps();
    this.setA('defeated');
    // in the finale Earwhen fights on, cream and all
    const finale = this.course >= FINALE;
    const keep = (b: Bot) => finale && b.kind === 'earwhen';
    for (const b of this.bots) if (!keep(b)) this.fx.emit(b.x, 1, b.z, 12, 0xff7a1a, 8, 0.3, 0.6);
    this.bots = this.bots.filter(keep);
    this.projs = finale ? this.projs.filter((p) => p.kind === 'cream' || p.kind === 'blob') : [];
    this.puddles = finale ? this.puddles.filter((p) => p.cream) : [];
    const last = this.course >= COURSES.length - 1;
    const W = this.earwhen();
    const farm = this.farmPct();
    const bonus = 28 + 14 * this.course + Math.round(farm / 6);
    this.truffles += bonus;
    this.stats.earned += bonus;
    this.sound('bighit');
    this.hitstop = 0.28;
    this.addShake(1);
    this.fx.hitBurst(A.x, 3.0, A.z, 0xffc93c, 2.4);
    this.fx.shockWall(A.x, 0.1, A.z, 0xffb347, 1.8, 12, 1.4, 4.4, 0.65, 5);
    this.fx.shockWall(A.x, 0.1, A.z, 0x7df9ff, 1.2, 8.5, 2.0, 5.2, 0.52, -7);
    this.fx.sparks(A.x, 3, A.z, 55, 0xffd23f, 18, 0.24, 0.9, { grav: 14, up: 1.0, hdr: 4.5, stretch: 5.2, altColor: 0xff7a1a });
    this.fx.dustRing(A.x, 0.1, A.z, 16, 1.6, 0xe8d9be, 10, 2.6, 0.95);
    const lossNote = this.courseFallen > 0 ? ` · ${this.courseFallen} hog${this.courseFallen > 1 ? 's' : ''} fallen` : '';
    if (finale) {
      this.say('Allen', W ? 'Earwhen… finish them… for me…' : 'Fine… FINE! I\'ll… I\'ll try the tofu.', 4);
      if (W) {
        W.rage = true;
        this.floatText(W.x, 5, W.z, 'ENRAGED!', 'hurt');
      }
      this.showBanner('ALLEN IS DOWN', W ? `+${bonus} truffles · now take down Earwhen!` : `+${bonus} truffles · farm ${Math.round(farm)}%${lossNote}`);
    } else {
      this.say('Allen', last ? "No. NO! I am NOT trying the tofu!" : this.pick(["I'll be back with hotter woks!", "This isn't over, bacon!", 'Next course is gonna HURT, Kenji!']), last ? 2.6 : 4.5);
      this.showBanner(last ? 'THE GRAND FEAST IS OVER' : 'COURSE CLEARED', last ? '…or is it?' : `+${bonus} truffles · farm ${Math.round(farm)}%${lossNote}`);
    }
  }

  private endCourse() {
    this.bots = this.bots.filter((b) => b.kind !== 'earwhen');
    this.allenBreak = 20;
    this.A.active = false;
    this.A.state = 'gone';
    this.mode = 'intermission';
    this.course++;
    this.tod = Math.min(this.course, 7);
    // modest breather heal — dead hogs stay dead, surviving hogs patch up +18 HP; knocked-out players get back up
    for (const p of this.players) this.revive(p, 0.4, 20);
    this.healSurvivors(18);
    this.scatterTruffles(7);
    this.greeted = { rickley: false, kingger: false, trout: false, kioff: false, charig: false };
    if (this.course === FINALE) {
      this.showBanner('BACKUP IS ON THE WAY', 'Allen called Earwhen · gear up, then ring the bell for the final course');
      this.say('Kingger', 'Earwhen?! He fires whipped cream at four hundred PSI. Upgrade. EVERYTHING.', 5.5);
      return;
    }
    this.say(
      this.course === 1 ? 'Trout' : 'Kingger',
      this.course === 1
        ? "Psst! Over at the lake, porkchop! Come to the dock — I'll teach you combos that'll fold Hwang in half."
        : this.pick(['Data suggests he returns hungrier. Upgrades are advised.', 'I logged his attack patterns. Come by the lab.', "Technically that was only a tactical retreat. He'll be back."]),
      5.2,
    );
  }

  /** Gets a knocked-out pig back on its feet with a share of its health, or patches up a standing one. */
  private revive(p: Player, frac: number, heal: number) {
    if (p.action === 'dead') {
      p.epoch++;
      p.action = 'none';
      p.t = 0;
      p.hp = Math.ceil(p.maxHp * frac);
      p.invuln = 1.5;
      p.blink = 1.5;
    } else {
      p.hp = Math.min(p.maxHp, p.hp + heal);
    }
  }

  private gameOver(reason: GameOverReason) {
    if (this.overReason) return;
    this.overReason = reason;
    this.overTimer = reason === 'farm' ? 1.4 : 1.8;
    if (reason === 'farm') this.say('Allen', 'Mmm. Compliments to the farmer.', 4);
  }

  /* ───────────────────────── main loop ───────────────────────── */

  /**
   * Advances the game by `dt` seconds. `inputs` maps player id → that player's controls for this step;
   * players without an entry stand still.
   */
  step(dt: number, inputs?: Map<number, PlayerInput>) {
    if (this.outcome) return;
    this.inputs = inputs ?? new Map();
    this.time += dt;
    if (this.opening) {
      this.opening.t -= dt;
      if (this.opening.t <= 0) this.advanceOpening();
      return;
    }

    let sdt = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      sdt = dt * 0.05;
    }
    if (this.mode === 'combat' || this.bots.some((b) => b.kind === 'guppy' && b.behavior !== 'waiting' && b.behavior !== 'returning')) {
      this.stats.time += dt;
    }

    for (const p of this.players) {
      if (this.remote.has(p.id)) this.applyRemote(p, dt);
      else this.updatePlayer(p, sdt);
    }
    this.separatePlayers();
    this.updatePassives(dt);
    this.updateDecoys(sdt);
    this.updateAllen(sdt);
    this.updateBots(sdt);
    this.updateProjectiles(sdt);
    this.sniffCd = Math.max(0, this.sniffCd - dt);
    this.sniffTime = Math.max(0, this.sniffTime - dt);
    if (this.area === 'forest') {
      const listener = this.players.find((p) => this.input(p).buttons & BTN.listen);
      if (listener) this.askHerb(listener);
    }
    this.updateWild(sdt);
    this.updateAllies(sdt);
    this.updatePuddles(sdt);
    this.updateMemorials(sdt);
    this.updatePots(sdt);
    this.updateHazards(sdt);
    this.updateShocks(sdt);
    this.updateTurret(sdt);
    this.updatePickups(sdt);
    for (const p of this.players) this.updateInteract(p);
    // a person playing Allen doesn't wait for the bell forever: he comes back after a short break
    if (this.allenPlayer && this.mode === 'intermission' && this.area === 'farm' && !this.hunt && !this.overReason && this.players.length) {
      const before = Math.ceil(this.allenBreak);
      this.allenBreak -= dt;
      if (Math.ceil(this.allenBreak) !== before) this.dirty = true;
      if (this.allenBreak <= 0) this.beginCourse();
    }
    this.dummyCoachCd = Math.max(0, this.dummyCoachCd - dt);

    // timers
    if (this.subtitle) {
      this.subtitle.t -= dt;
      if (this.subtitle.t <= 0) this.subtitle = null;
    }
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.mode === 'combat' && this.A.active && !this.overReason) {
      this.barkT -= dt;
      if (this.barkT <= 0 && !this.subtitle) {
        this.barkT = this.rand(11, 18);
        const st = this.A.state;
        if (st === 'chase' || st === 'recover')
          this.say(
            'Allen',
            this.pick([
              'Come here, little char siu!',
              'Crispy outside, tender inside…',
              "You'd pair so well with fried rice.",
              'Just one bite. ONE!',
              'Stop running — you are tenderizing yourself!',
              'I can already hear the sizzle.',
            ]),
          );
      }
    }
    if (this.overTimer > 0) {
      this.overTimer -= dt;
      if (this.overTimer <= 0) {
        this.outcome = 'gameover';
        this.sound('lose');
        this.dirty = true;
      }
    }
  }

  private input(p: Player): PlayerInput {
    return this.inputs.get(p.id) ?? NO_INPUT;
  }

  /** Pigs bump each other gently instead of stacking up. */
  private separatePlayers() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        if (a.action === 'dead' || b.action === 'dead' || Math.abs(a.y - b.y) > 1) continue;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const d = Math.hypot(dx, dz);
        const min = 1.25;
        if (d < min && d > 0.001) {
          // browser-driven pigs push themselves (see predict); only move the ones this simulation drives
          const push = (min - d) * 0.5;
          if (!this.remote.has(a.id)) {
            a.x += (dx / d) * push;
            a.z += (dz / d) * push;
          }
          if (!this.remote.has(b.id)) {
            b.x -= (dx / d) * push;
            b.z -= (dz / d) * push;
          }
        }
      }
    }
  }

  /* ───────────────────────── players: combat ───────────────────────── */

  private nearestEnemy(p: Player, maxD: number): Target | null {
    let best: Target | null = null;
    let bd = maxD;
    const A = this.A;
    for (const o of this.pots) {
      const d = Math.hypot(o.x - p.x, o.z - p.z) - 0.6;
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (A.active && !A.shielded && A.state !== 'leaving' && A.state !== 'ko' && A.state !== 'backrooms' && A.y < 3) {
      const d = Math.hypot(A.x - p.x, A.z - p.z) - 1.6;
      if (d < bd) {
        bd = d;
        best = A;
      }
    }
    for (const b of this.bots) {
      const d = Math.hypot(b.x - p.x, b.z - p.z) - (b.kind === 'guppy' ? 0.75 : 0);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    if (this.area === 'farm' && this.mode === 'intermission') {
      const d = Math.hypot(SPOT.dummy.x - p.x, SPOT.dummy.z - p.z);
      if (d < Math.min(bd, 5.8)) best = SPOT.dummy;
    }
    return best;
  }

  flowBonusPct(p: Player): number {
    if (p.flowCount < 2 || p.flowTimer <= 0) return 0;
    const per = this.levels.riverrush >= 2 ? 7 : 4;
    const cap = this.levels.riverrush >= 2 ? 42 : 24;
    return Math.min(cap, (p.flowCount - 1) * per);
  }

  private attackMul(p: Player): number {
    const tuskBonus = [0, 0.22, 0.44, 0.66, 0.9][Math.min(this.levels.tusks, 4)];
    return (1 + tuskBonus) * (1 + this.flowBonusPct(p) / 100) * (p.focus > 0 ? 1.35 : 1);
  }

  private recordCombo(p: Player, move: string, chainAdd = 1) {
    p.flowCount++;
    p.flowTimer = 3.5;
    p.flowMove = move;
    if (chainAdd > 0) {
      p.chainHits += chainAdd;
      p.rushWindow = 0.9;
    } else {
      p.chainHits = 0;
      p.rushWindow = 0;
    }
  }

  private strikeDummy(p: Player, dmg: number, radius: number, fx = 0, fz = 0, coneMin = -2, callout?: string): boolean {
    if (this.area !== 'farm' || this.mode !== 'intermission') return false;
    const dx = SPOT.dummy.x - p.x;
    const dz = SPOT.dummy.z - p.z;
    const d = Math.hypot(dx, dz) || 0.001;
    if (d > radius) return false;
    if (coneMin > -1 && (dx * fx + dz * fz) / d <= coneMin) return false;
    const rounded = Math.max(1, Math.round(dmg));
    const ddx = dx / d;
    const ddz = dz / d;
    this.events.push({ t: 'dummyHit', dx: ddx, dz: ddz });
    this.fx.hitBurst(SPOT.dummy.x, 1.85, SPOT.dummy.z, callout ? 0x5ff2ff : 0xffd23f, callout ? 1.15 : 0.85, ddx, ddz);
    this.fx.chunks(SPOT.dummy.x, 1.75, SPOT.dummy.z, 7, 0xe3bd55, 7.5, 0.18, 0.5);
    this.floatText(SPOT.dummy.x + this.rand(-0.4, 0.4), 3.1, SPOT.dummy.z, String(rounded), callout ? 'crit' : 'dmg');
    if (callout === 'TAIL-WHIP!') this.floatText(SPOT.dummy.x, 3.85, SPOT.dummy.z, callout, 'info');
    if (this.dummyCoachCd <= 0 && (callout || p.flowCount >= 2)) {
      this.dummyCoachCd = 8.5;
      this.leapTrout();
      this.say(
        'Trout',
        this.pick([
          'Clean form, pig! Right in the orange shirt!',
          "Felt that splash from the lake! Hwang's shins are cooked.",
          'Flow like river water, hit like a cast-iron skillet!',
          "Now THAT'S Trout-Fu! Keep chaining those hits!",
        ]),
        3.2,
      );
    }
    return true;
  }

  private aim(p: Player, mx: number, mz: number, moving: boolean, range = 6.5, cone = 1.4) {
    if (this.replaying) return; // the owner already aimed
    if (moving) p.heading = Math.atan2(mx, mz);
    const e = this.nearestEnemy(p, range);
    if (e) {
      const to = Math.atan2(e.x - p.x, e.z - p.z);
      if (!moving || Math.abs(angDiff(p.heading, to)) < cone) p.heading = to;
    }
  }

  private beginAttack(p: Player, mx: number, mz: number, moving: boolean) {
    const k = p;
    k.action = 'attack';
    k.t = 0;
    k.hitDone = false;
    k.hitDone2 = false;
    k.buffered = false;
    this.aim(k, mx, mz, moving, 6.5, 1.4);
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    if (k.combo === 3) {
      const cycR = this.levels.cyclone >= 2 ? 4.3 : 3.5;
      this.sound('splash');
      this.sound('oink');
      this.spawnShock(k.x, k.z, this.levels.cyclone >= 2 ? 5.6 : 4.6, 26, false, 0);
      this.fx.slash({ x: k.x, y: k.y + 0.85, z: k.z, heading: k.heading, color: 0x3ae8ff, radius: cycR, full: true, spin: 16, dur: 0.46, rise: 1.4, hdr: 3.8 });
      this.fx.slash({ x: k.x, y: k.y + 1.35, z: k.z, heading: k.heading + PI, color: 0xffd24d, radius: cycR * 0.84, full: true, tiltZ: 0.2, spin: 19, dur: 0.48, rise: 1.9, hdr: 3.5 });
      this.fx.shockWall(k.x, k.y + 0.1, k.z, 0x4be3ff, 1.1, cycR * 1.18, 0.7, 2.5, 0.42, 9);
      this.fx.waterBurst(k.x, k.y + 0.6, k.z, 1.15, 9);
      this.floatText(k.x, 2.55, k.z, 'TROUT CYCLONE!', 'info');
    } else if (k.combo === 2) {
      // 3rd-hit Tusk Smash: blazing crimson-gold heavy cleave + wind-up sparks
      this.sound('oink');
      this.fx.slash({
        x: k.x + fx * 0.65,
        y: k.y + 1.05,
        z: k.z + fz * 0.65,
        heading: k.heading,
        color: k.focus > 0 ? 0x62f4ff : 0xff9d2e,
        radius: 2.95,
        wide: true,
        tiltZ: 0.42,
        tiltX: 0.18,
        spin: 9.5,
        dur: 0.3,
        hdr: 4.0,
      });
      this.fx.sparks(k.x + fx * 1.1, k.y + 1.0, k.z + fz * 1.1, 10, 0xffd24d, 10, 0.14, 0.28, { dirX: fx, dirZ: fz, focus: 0.65, hdr: 3.8 });
    } else {
      // crisp alternating left/right slash arcs on combo hits 1 & 2
      this.sound('swing');
      const dir = k.combo === 0 ? 1 : -1;
      const col = k.focus > 0 ? 0x6ff7ff : k.flowCount >= 3 ? 0xffc84a : 0xfff0c4;
      this.fx.slash({
        x: k.x + fx * 0.55,
        y: k.y + 0.92,
        z: k.z + fz * 0.55,
        heading: k.heading - dir * 0.25,
        color: col,
        radius: 2.25,
        tiltZ: 0.24 * dir,
        spin: 8.5 * dir,
        dur: 0.21,
        hdr: 3.2,
      });
    }
  }

  private beginUppercut(p: Player, mx: number, mz: number, moving: boolean) {
    const k = p;
    k.action = 'uppercut';
    k.t = 0;
    k.hitDone = false;
    k.rollChain = 0;
    this.aim(k, mx, mz, moving, 7.5, 1.7);
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    k.vy = 11.6;
    k.grounded = false;
    k.invuln = Math.max(k.invuln, 0.26);
    this.sound('splash');
    this.sound('oink');
    // steeply tilted rising corkscrew water-blade + geyser ring
    this.fx.slash({ x: k.x + fx * 0.7, y: k.y + 0.9, z: k.z + fz * 0.7, heading: k.heading, color: 0x3ae8ff, radius: 2.9, wide: true, tiltZ: 1.05, spin: 12, dur: 0.34, rise: 6.8, hdr: 4.2 });
    this.fx.slash({ x: k.x, y: k.y + 0.45, z: k.z, heading: k.heading + PI * 0.5, color: 0xc2fbff, radius: 2.2, full: true, tiltZ: 0.35, spin: 15, dur: 0.32, rise: 5.2, hdr: 3.4 });
    this.fx.shockWall(k.x, k.y + 0.08, k.z, 0x4fd6e8, 0.7, 2.8, 0.5, 3.4, 0.32, 10);
    this.fx.waterBurst(k.x + fx * 0.4, k.y + 0.5, k.z + fz * 0.4, 1.15, 7);
    this.fx.flash(k.x + fx * 0.6, k.y + 1.4, k.z + fz * 0.6, 0x4be3ff, 9, 0.24, 10);
    this.floatText(k.x, 2.6, k.z, 'UPSTREAM UPPERCUT!', 'info');
  }

  private beginBellyFlop(p: Player) {
    const k = p;
    k.action = 'bellyflop';
    k.t = 0;
    k.hitDone = false;
    k.vy = 3.2;
    this.sound('swing');
    this.fx.slash({ x: k.x, y: k.y + 0.9, z: k.z, heading: k.heading, color: 0x7df9ff, radius: 2.0, full: true, spin: -14, dur: 0.24, hdr: 3.6 });
    this.fx.sparks(k.x, k.y + 0.8, k.z, 12, 0x7df9ff, 8, 0.16, 0.3, { grav: 4, hdr: 3.8, altColor: 0xffffff });
  }

  private beginTailWhip(p: Player) {
    const k = p;
    const lv = this.levels.tailwhip;
    k.stam = Math.max(0, k.stam - 14);
    k.stamDelay = 0.45;
    k.action = 'tailwhip';
    k.t = 0;
    k.hitDone = false;
    k.whipCd = lv >= 2 ? 1.5 : 2.3;
    k.invuln = Math.max(k.invuln, 0.22);
    const R = lv >= 2 ? 5.6 : 4.4;
    this.sound('splash');
    this.sound('swing');
    this.spawnShock(k.x, k.z, R, 30, false, 0);
    this.fx.slash({ x: k.x, y: k.y + 0.9, z: k.z, heading: k.heading, color: 0x3ef0ff, radius: R * 0.78, full: true, spin: -20, dur: 0.28, hdr: 4.0 });
    this.fx.slash({ x: k.x, y: k.y + 1.15, z: k.z, heading: k.heading + PI, color: 0xd8feff, radius: R * 0.62, wide: true, tiltZ: -0.18, spin: -22, dur: 0.24, hdr: 3.6 });
    this.fx.waterBurst(k.x, k.y + 0.75, k.z, lv >= 2 ? 1.15 : 0.9, -10);
    this.fx.flash(k.x, k.y + 1.2, k.z, 0x4ef0ff, 8, 0.2, 10);
  }

  private headbuttStrike(p: Player) {
    const k = p;
    const A = this.A;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const mul = this.attackMul(k);
    const dmg = [12, 13, 24][k.combo] * mul;
    const poise = [9, 9, 24][k.combo];
    const moveName = ['Headbutt', 'Snout Jab', 'Tusk Smash'][k.combo] ?? 'Headbutt';
    let hit = false;
    if (A.active && A.y < 3) {
      const dx = A.x - k.x;
      const dz = A.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 4.5 && (dx * fx + dz * fz) / d > 0.15) {
        if (this.damageAllen(dmg, poise, { heavy: k.combo === 2, by: k })) {
          hit = true;
          const ix = k.x + fx * 1.55;
          const iy = 1.45 + k.y;
          const iz = k.z + fz * 1.55;
          this.fx.hitBurst(ix, iy, iz, k.combo === 2 ? 0xff9a2e : 0xffe14d, k.combo === 2 ? 1.55 : 0.95, fx, fz);
          if (k.combo === 2) this.fx.dustRing(ix, 0.08, iz, 8, 0.6, 0xe8d9be, 5.5, 1.5, 0.5);
        }
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < 2.9 + b.rad * 0.35 && (dx * fx + dz * fz) / d > 0) {
        this.damageBot(b, dmg, fx * 10, fz * 10, k.combo === 2);
        hit = true;
      }
    }
    if (this.strikeDummy(k, dmg, 3.1, fx, fz, 0.05)) hit = true;
    if (this.hitPots(k.x, k.z, 3.4, dmg, fx, fz, 0.05)) hit = true;
    if (hit) {
      this.recordCombo(k, moveName);
      this.sound(k.combo === 2 ? 'bighit' : 'hit');
      this.hitstop = Math.max(this.hitstop, k.combo === 2 ? 0.1 : 0.05);
      this.addShake(k.combo === 2 ? 0.5 : 0.22, k);
    }
  }

  private cycloneStrike(p: Player, second: boolean) {
    const k = p;
    const A = this.A;
    const lv = this.levels.cyclone;
    const mul = this.attackMul(k);
    const dmg = (lv >= 2 ? 27 : 19) * mul;
    const poise = lv >= 2 ? 24 : 17;
    const rAllen = lv >= 2 ? 5.6 : 4.7;
    const rSmall = lv >= 2 ? 4.4 : 3.6;
    let hit = false;
    if (second) {
      this.spawnShock(k.x, k.z, rAllen, 30, false, 0);
      this.fx.slash({ x: k.x, y: k.y + 1.1, z: k.z, heading: k.heading, color: 0xffcf40, radius: rSmall * 1.05, full: true, spin: 20, dur: 0.3, rise: 1.2, hdr: 4.2 });
      this.fx.shockWall(k.x, k.y + 0.1, k.z, 0x62f4ff, 1.4, rAllen, 0.9, 2.9, 0.36, 12);
      this.fx.waterBurst(k.x, k.y + 0.85, k.z, 1.3, 12);
    } else {
      this.fx.sparks(k.x, 1.0 + k.y, k.z, 16, 0x4fd6e8, 12, 0.18, 0.4, { grav: 8, up: 0.5, hdr: 3.8, altColor: 0xffffff });
    }
    if (A.active && A.y < 3.2 && Math.hypot(A.x - k.x, A.z - k.z) < rAllen) {
      if (this.damageAllen(dmg, poise, { by: k })) {
        hit = true;
        this.fx.hitBurst((k.x + A.x) * 0.5, 2.0, (k.z + A.z) * 0.5, second ? 0xffd23f : 0x4be3ff, second ? 1.55 : 1.1);
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < rSmall + b.rad * 0.3) {
        this.damageBot(b, dmg, (dx / d) * 15, (dz / d) * 15, second);
        hit = true;
      }
    }
    if (this.strikeDummy(k, dmg, rSmall, 0, 0, -2, second ? 'CYCLONE!' : undefined)) hit = true;
    if (this.hitPots(k.x, k.z, rSmall + 0.6, dmg)) hit = true;
    if (hit) {
      this.recordCombo(k, 'Trout Cyclone');
      if (second && lv >= 2) k.chargeCd = Math.max(0, k.chargeCd - 1.5);
      this.sound(second ? 'bighit' : 'hit');
      this.hitstop = Math.max(this.hitstop, second ? 0.11 : 0.05);
      this.addShake(second ? 0.6 : 0.3, k);
    }
  }

  private uppercutStrike(p: Player) {
    const k = p;
    const A = this.A;
    const lv = this.levels.uppercut;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const dmg = (lv >= 2 ? 38 : 26) * this.attackMul(k);
    const poise = lv >= 2 ? 40 : 28;
    const reach = lv >= 2 ? 5.5 : 4.8;
    let hit = false;
    if (A.active && A.y < 4.5) {
      const dx = A.x - k.x;
      const dz = A.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < reach && (dx * fx + dz * fz) / d > -0.15) {
        if (this.damageAllen(dmg, poise, { by: k })) {
          hit = true;
          const ix = k.x + fx * 1.6;
          const iz = k.z + fz * 1.6;
          this.fx.hitBurst(ix, 2.3 + k.y, iz, 0x5ff4ff, 1.65, fx * 0.5, fz * 0.5);
          this.fx.waterBurst(ix, 2.0 + k.y, iz, 1.1, 6);
        }
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < reach - 1.0 && (dx * fx + dz * fz) / d > -0.2) {
        this.damageBot(b, dmg * 1.15, fx * 15, fz * 15, true);
        hit = true;
      }
    }
    if (this.strikeDummy(k, dmg, 3.8, fx, fz, -0.2, 'UPPERCUT!')) hit = true;
    if (this.hitPots(k.x, k.z, 4.2, dmg, fx, fz, -0.2)) hit = true;
    if (hit) {
      this.recordCombo(k, 'Upstream Uppercut');
      if (lv >= 2) k.stam = Math.min(k.maxStam, k.stam + 15);
      this.sound('bighit');
      this.hitstop = Math.max(this.hitstop, 0.11);
      this.addShake(0.6, k);
    }
  }

  private bellyFlopLand(p: Player) {
    const k = p;
    const A = this.A;
    const lv = this.levels.bellyflop;
    const R = lv >= 2 ? 6.4 : 4.8;
    const dmg = (lv >= 2 ? 44 : 30) * this.attackMul(k);
    const poise = lv >= 2 ? 42 : 30;
    this.sound('splash');
    this.sound('slam');
    this.addShake(0.7, k);
    this.spawnShock(k.x, k.z, R, 28, false, 0);
    this.fx.shockWall(k.x, k.y + 0.05, k.z, 0x3ae8ff, 0.9, R * 1.05, 0.9, lv >= 2 ? 3.6 : 2.7, 0.45, 7);
    this.fx.shockWall(k.x, k.y + 0.05, k.z, 0xd8feff, 0.6, R * 0.72, 1.3, 3.2, 0.34, -9);
    this.fx.groundMark(k.x, k.y, k.z, R * 0.92, 'splash', 0x62f4ff, 2.2);
    this.fx.waterBurst(k.x, k.y + 0.4, k.z, lv >= 2 ? 2.0 : 1.5, 5);
    this.fx.dustRing(k.x, k.y, k.z, 12, 0.9, 0xc7f7ff, 8.5, 1.9, 0.6);
    this.fx.flash(k.x, k.y + 1.4, k.z, 0x4be3ff, 14, 0.34, 15);
    this.floatText(k.x, 2.4, k.z, lv >= 2 ? 'TIDAL FLOP!' : 'BELLY FLOP!', 'info');
    let hit = false;
    if (A.active && A.y < 3.5 && Math.hypot(A.x - k.x, A.z - k.z) < R + 1.4) {
      if (this.damageAllen(dmg, poise, { heavy: true, by: k })) {
        hit = true;
        this.fx.hitBurst((k.x + A.x) * 0.5, 2.2, (k.z + A.z) * 0.5, 0x62f4ff, 1.7);
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < R + b.rad * 0.3) {
        this.damageBot(b, dmg * 1.2, (dx / d) * 18, (dz / d) * 18, true);
        hit = true;
      }
    }
    if (lv >= 2) {
      this.projs = this.projs.filter((o) => {
        if (!o.friendly && Math.hypot(o.x - k.x, o.z - k.z) < R + 1.2) {
          this.fx.emit(o.x, 1, o.z, 6, 0x7df9ff, 6, 0.22, 0.4);
          return false;
        }
        return true;
      });
      // Tidal wave douses burning Sriracha chili puddles!
      this.puddles = this.puddles.filter((pd) => {
        if (Math.hypot(pd.x - k.x, pd.z - k.z) < R + pd.r * 0.6) {
          this.fx.dust(pd.x, 0.3, pd.z, 6, 0xd8f8ff, { spread: pd.r * 0.5, speed: 3, rise: 2.4, size0: 0.5, size1: 1.9, life: 0.5, glow: true });
          return false;
        }
        return true;
      });
    }
    if (this.strikeDummy(k, dmg, R, 0, 0, -2, 'BELLY FLOP!')) hit = true;
    if (this.hitPots(k.x, k.z, R + 0.6, dmg)) hit = true;
    if (hit) {
      this.recordCombo(k, 'Belly Flop');
      this.hitstop = Math.max(this.hitstop, 0.1);
    }
  }

  private tailWhipStrike(p: Player) {
    const k = p;
    const A = this.A;
    const lv = this.levels.tailwhip;
    const R = lv >= 2 ? 5.6 : 4.4;
    const mul = this.attackMul(k);
    const dmg = (lv >= 2 ? 34 : 22) * mul;
    const poise = lv >= 2 ? 32 : 22;
    let hit = false;
    if (A.active && A.y < 3.2 && Math.hypot(A.x - k.x, A.z - k.z) < R + 1.2) {
      if (this.damageAllen(dmg, poise, { by: k })) {
        hit = true;
        this.fx.hitBurst((k.x + A.x) * 0.5, 1.9, (k.z + A.z) * 0.5, 0x5ff2ff, 1.25);
      }
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < R + b.rad * 0.3) {
        // Extra knockback sends hissing Kettle Bombers flying across the yard!
        const push = b.kind === 'bomber' ? 24 : 16;
        this.damageBot(b, dmg * 1.15, (dx / d) * push, (dz / d) * push);
        hit = true;
      }
    }
    // deflect or reflect flying chopsticks!
    let deflected = 0;
    this.projs = this.projs.filter((o) => {
      if (o.friendly || Math.hypot(o.x - k.x, o.z - k.z) > R + 1.6) return true;
      deflected++;
      if (lv >= 2 && A.active && A.hp > 0 && o.y < 3.2) {
        o.friendly = true;
        const dx = A.x - o.x;
        const dz = A.z - o.z;
        const d = Math.hypot(dx, dz) || 1;
        o.y = 1.25;
        o.vx = (dx / d) * 38;
        o.vy = 0;
        o.vz = (dz / d) * 38;
        o.life = 2.6;
        o.dmg = 36 * mul;
        this.fx.hitBurst(o.x, 1.2, o.z, 0x7df9ff, 1.35, dx / d, dz / d);
        this.fx.lightning(k.x, k.y + 1.0, k.z, o.x, 1.2, o.z, 0x7df9ff, 0.06, 0.2);
        return true;
      }
      this.fx.hitBurst(o.x, 1.15, o.z, 0x7df9ff, 0.9);
      return false;
    });
    if (deflected > 0) {
      this.sound('zap');
      this.floatText(k.x, 2.75, k.z, lv >= 2 ? 'RIPTIDE PARRY!' : 'DEFLECTED!', 'crit');
      this.recordCombo(k, lv >= 2 ? 'Riptide Parry' : 'Tail-Whip');
    }
    if (this.strikeDummy(k, dmg, R, 0, 0, -2, 'TAIL-WHIP!')) hit = true;
    if (this.hitPots(k.x, k.z, R + 0.6, dmg)) hit = true;
    if (hit) {
      this.recordCombo(k, 'Tail-Whip');
      this.sound('hit');
      this.hitstop = Math.max(this.hitstop, 0.07);
      this.addShake(0.4, k);
    }
  }

  private updatePlayer(p: Player, dt: number) {
    const k = p;
    const lv = this.levels;
    const A = this.A;
    const inp = this.input(k);
    k.invuln = Math.max(0, k.invuln - dt);
    k.blink = Math.max(0, k.blink - dt);
    k.chargeCd = Math.max(0, k.chargeCd - dt);
    k.zapCd = Math.max(0, k.zapCd - dt);
    k.zapAura = Math.max(0, k.zapAura - dt);
    k.squealCd = Math.max(0, k.squealCd - dt);
    k.whipCd = Math.max(0, k.whipCd - dt);
    k.portalCd = Math.max(0, k.portalCd - dt);
    k.decoyCd = Math.max(0, k.decoyCd - dt);
    k.potionCd = Math.max(0, k.potionCd - dt);
    k.smashCd = Math.max(0, k.smashCd - dt);
    k.focus = Math.max(0, k.focus - dt);
    k.rollChain = Math.max(0, k.rollChain - dt);
    k.rushWindow = Math.max(0, k.rushWindow - dt);
    if (k.rushWindow <= 0) k.chainHits = 0;
    if (k.flowTimer > 0) {
      k.flowTimer -= dt;
      if (k.flowTimer <= 0) {
        k.flowCount = 0;
        k.flowMove = '';
      }
    }
    k.muddy = Math.max(0, k.muddy - dt);
    k.comboTimer -= dt;
    if (k.stamDelay > 0) k.stamDelay -= dt;
    else k.stam = Math.min(k.maxStam, k.stam + (30 + 10 * lv.trotters) * dt);

    const floor = this.area === 'farm' && isOnLakeDock(k.x, k.z) ? 0.23 : 0;

    if (k.action !== 'dead') {
      let mx = inp.mx;
      let mz = inp.mz;
      const ml = Math.hypot(mx, mz);
      const moving = ml > 0;
      if (moving) {
        mx /= ml;
        mz /= ml;
      }
      const mud = SPOT.mud;
      const inMud = this.area === 'farm' && Math.hypot(k.x - mud.x, k.z - mud.z) < mud.r && k.y < 0.3;
      if (inMud) {
        if (k.muddy <= 0) this.floatText(k.x, 2.2, k.z, 'MUDDY! −15% damage', 'info');
        k.muddy = 14;
        // only heals during peaceful intermissions — no free infinite healing while fighting Allen!
        if (this.mode === 'intermission' && k.hp < k.maxHp) k.hp = Math.min(k.maxHp, k.hp + 3.5 * dt);
        if (moving && this.rnd() < dt * 14) this.fx.emit(k.x, 0.2, k.z, 2, 0x5c4030, 4, 0.22, 0.5);
      }
      const speedrun = [1, 1.12, 1.2][Math.min(lv.speedrun, 2)];
      const speed = (10.5 + 0.7 * lv.trotters) * speedrun * Math.min(ml, 1) * (inMud ? 0.72 : 1);
      const rollCost = [28, 18, 12][Math.min(lv.speedrun, 2)];

      const b = inp.buttons;
      const wantAttack = (b & BTN.attack) !== 0;
      const wantCharge = (b & BTN.charge) !== 0;
      const wantRoll = (b & BTN.roll) !== 0;
      const wantJump = (b & BTN.jump) !== 0;
      const wantZap = (b & BTN.zap) !== 0;
      const wantSqueal = (b & BTN.squeal) !== 0;
      const wantWhip = (b & BTN.whip) !== 0;
      const wantPortal = (b & BTN.portal) !== 0;
      const wantDecoy = (b & BTN.decoy) !== 0;
      const wantPotion = (b & BTN.potion) !== 0;
      const wantSmash = (b & BTN.smash) !== 0;
      const maxCombo = lv.cyclone > 0 ? 3 : 2;
      const free = k.action === 'none';
      const canCancel =
        free ||
        (k.action === 'attack' && k.t > 0.1) ||
        (k.action === 'tailwhip' && k.t > 0.16) ||
        (k.action === 'uppercut' && k.t > 0.22) ||
        (k.action === 'bellyflop' && k.hitDone && k.t > 0.1);
      const rushEligible = lv.riverrush > 0 && k.rushWindow > 0 && k.chainHits >= 2;
      const canFireCharge = k.chargeCd <= 0 || (rushEligible && lv.riverrush >= 2 && k.chargeCd <= 2.5);

      if (wantRoll && canCancel) {
        if (k.stam >= Math.min(25, rollCost)) {
          k.stam = Math.max(0, k.stam - rollCost);
          k.stamDelay = 0.7;
          k.action = 'roll';
          k.t = 0;
          k.dodged = false;
          k.buffered = false;
          if (moving) {
            k.rdx = mx;
            k.rdz = mz;
          } else {
            k.rdx = Math.sin(k.heading);
            k.rdz = Math.cos(k.heading);
          }
          k.heading = Math.atan2(k.rdx, k.rdz);
          k.invuln = Math.max(k.invuln, lv.speedrun >= 2 ? 0.46 : 0.36);
          this.sound('roll');
          this.fx.dust(k.x - k.rdx * 0.4, floor + 0.25, k.z - k.rdz * 0.4, 7, 0xeadec6, { spread: 0.45, speed: 3.6, rise: 1.5, size0: 0.45, size1: 1.75, life: 0.48 });
          this.fx.sparks(k.x, floor + 0.5, k.z, 6, 0xfff5d6, 9, 0.11, 0.22, { dirX: -k.rdx, dirY: 0.12, dirZ: -k.rdz, focus: 0.85, hdr: 2.8, stretch: 4.5, grav: 2 });
        } else {
          this.sound('deny', k);
        }
      } else if (wantWhip && lv.tailwhip > 0 && canCancel) {
        if (k.whipCd <= 0 && k.stam >= 14) this.act('whipStart', k, 0, () => this.beginTailWhip(k), true);
        else this.sound('deny', k);
      } else if (wantCharge && canCancel) {
        if (canFireCharge) {
          this.act('charge', k, 0, () => this.beginCharge(k, mx, mz, moving, rushEligible, floor), true);
        } else {
          this.sound('deny', k);
        }
      } else if (wantZap && canCancel && lv.zap > 0) {
        if (k.zapCd <= 0) this.act('zap', k, 0, () => this.doLightningZap(k));
        else this.sound('deny', k);
      } else if (wantSqueal && canCancel && lv.squeal > 0) {
        if (k.squealCd <= 0) this.act('squeal', k, 0, () => this.doSqueal(k));
        else this.sound('deny', k);
      } else if (wantPortal && canCancel && lv.portal > 0) {
        if (k.portalCd <= 0) this.act('portal', k, 0, () => this.openPortal(k));
        else this.sound('deny', k);
      } else if (wantDecoy && canCancel && lv.decoy > 0) {
        if (k.decoyCd <= 0) this.act('decoy', k, 0, () => this.dropDecoy(k));
        else this.sound('deny', k);
      } else if (wantPotion && lv.potion > 0) {
        if (k.potionCd <= 0) this.act('potion', k, 0, () => this.drinkPotion(k));
        else this.sound('deny', k);
      } else if (wantSmash && canCancel && lv.smash > 0) {
        if (k.smashCd <= 0 && this.smashTarget(k)) this.act('smash', k, 0, () => this.smashBattles(k));
        else this.sound('deny', k);
      } else if (wantAttack) {
        // Upstream Uppercut: roll → attack (buffers early presses so Shift+LMB always feels crisp)
        if (lv.uppercut > 0 && k.action === 'roll') {
          if (k.t >= 0.12) this.act('upStart', k, 0, () => this.beginUppercut(k, mx, mz, moving), true);
          else k.buffered = true;
        } else if (lv.uppercut > 0 && free && k.rollChain > 0) {
          this.act('upStart', k, 0, () => this.beginUppercut(k, mx, mz, moving), true);
        } else if (
          // Tidal Belly Flop: airborne → attack (also chains right out of Uppercut!)
          lv.bellyflop > 0 &&
          !k.grounded &&
          k.y > floor + 0.4 &&
          (free || (k.action === 'uppercut' && k.t >= 0.13) || (k.action === 'attack' && k.t >= 0.13))
        ) {
          this.act('flopStart', k, 0, () => this.beginBellyFlop(k), true);
        } else if (free || (k.action === 'tailwhip' && k.t > 0.18)) {
          k.combo = k.comboTimer > 0 && k.combo < maxCombo ? k.combo + 1 : 0;
          this.act('attack', k, 0, () => this.beginAttack(k, mx, mz, moving), true);
        } else if (k.action === 'attack') {
          k.buffered = true;
        }
      }
      if (wantJump && k.grounded && (k.action === 'none' || k.action === 'attack' || k.action === 'tailwhip')) {
        k.vy = 12.5;
        k.grounded = false;
        this.sound('jump');
      }

      switch (k.action) {
        case 'none': {
          const acc = (k.grounded ? 75 : 45) * dt;
          k.vx = approach(k.vx, mx * speed, acc);
          k.vz = approach(k.vz, mz * speed, acc);
          if (moving) k.heading = angLerp(k.heading, Math.atan2(mx, mz), 14 * dt);
          break;
        }
        case 'attack': {
          k.t += dt;
          if (k.combo === 3) {
            // 4th-hit Trout Cyclone: controllable spinning vortex that strikes twice
            const sp = k.t < 0.4 ? 11 : 4;
            if (moving) k.heading = angLerp(k.heading, Math.atan2(mx, mz), 6 * dt);
            k.vx = Math.sin(k.heading) * sp;
            k.vz = Math.cos(k.heading) * sp;
            if (!k.hitDone && k.t >= 0.1) {
              k.hitDone = true;
              this.act('cyclone', k, 0, () => this.cycloneStrike(k, false));
            }
            if (!k.hitDone2 && k.t >= 0.3) {
              k.hitDone2 = true;
              this.act('cyclone', k, 1, () => this.cycloneStrike(k, true));
            }
            if (k.t >= 0.52) {
              k.action = 'none';
              k.comboTimer = 0;
            }
          } else {
            const dur = k.combo === 2 ? 0.42 : 0.27;
            const lunge = k.t < 0.14 ? (k.combo === 2 ? 15 : 10) : 2;
            k.vx = Math.sin(k.heading) * lunge;
            k.vz = Math.cos(k.heading) * lunge;
            if (!k.hitDone && k.t >= 0.09) {
              k.hitDone = true;
              this.act('headbutt', k, 0, () => this.headbuttStrike(k));
            }
            if (k.t >= dur) {
              if (k.buffered && k.combo < maxCombo) {
                k.combo++;
                this.act('attack', k, 0, () => this.beginAttack(k, mx, mz, moving), true);
              } else {
                k.action = 'none';
                k.comboTimer = k.combo < maxCombo ? 0.5 : 0;
              }
            }
          }
          break;
        }
        case 'uppercut': {
          k.t += dt;
          const lunge = k.t < 0.18 ? 17 : 5;
          k.vx = Math.sin(k.heading) * lunge;
          k.vz = Math.cos(k.heading) * lunge;
          if (k.t < 0.22 && this.rnd() < dt * 45) {
            this.fx.emit(k.x, k.y + 0.6, k.z, 1, 0x4fd6e8, 4, 0.22, 0.35, 6);
          }
          if (!k.hitDone && k.t >= 0.08) {
            k.hitDone = true;
            this.act('uppercut', k, 0, () => this.uppercutStrike(k));
          }
          if (k.t >= 0.4) k.action = 'none';
          break;
        }
        case 'bellyflop': {
          k.t += dt;
          if (!k.hitDone) {
            if (k.t >= 0.07) k.vy = -34;
            k.vx = Math.sin(k.heading) * 7.5;
            k.vz = Math.cos(k.heading) * 7.5;
            if (this.rnd() < dt * 50) this.fx.emit(k.x, k.y + 0.5, k.z, 1, 0x7df9ff, 3, 0.24, 0.32, 3);
          } else {
            k.vx *= Math.exp(-12 * dt);
            k.vz *= Math.exp(-12 * dt);
            if (k.t >= 0.22) k.action = 'none';
          }
          break;
        }
        case 'tailwhip': {
          k.t += dt;
          k.vx = moving ? mx * 6 : k.vx * Math.exp(-10 * dt);
          k.vz = moving ? mz * 6 : k.vz * Math.exp(-10 * dt);
          if (!k.hitDone && k.t >= 0.06) {
            k.hitDone = true;
            this.act('whip', k, 0, () => this.tailWhipStrike(k));
          }
          if (k.t >= 0.28) {
            k.action = 'none';
            k.comboTimer = 0.45;
          }
          break;
        }
        case 'roll': {
          k.t += dt;
          const sp = k.t < 0.3 ? 22 : 10;
          k.vx = k.rdx * sp;
          k.vz = k.rdz * sp;
          if (k.buffered && lv.uppercut > 0 && k.t >= 0.14) {
            k.buffered = false;
            this.act('upStart', k, 0, () => this.beginUppercut(k, mx, mz, moving), true);
          } else if (k.t >= 0.42) {
            k.action = 'none';
            if (lv.uppercut > 0) k.rollChain = 0.38;
          }
          break;
        }
        case 'charge': {
          k.t += dt;
          if (moving) k.heading = angLerp(k.heading, Math.atan2(mx, mz), 2.4 * dt);
          const hx = Math.sin(k.heading);
          const hz = Math.cos(k.heading);
          const rush = k.riverRush;
          const rushSp = rush ? 35 : 30;
          k.vx = hx * rushSp;
          k.vz = hz * rushSp;
          if (this.rnd() < dt * 55) {
            this.fx.chargeTrail(k.x, floor, k.z, hx, hz, rush ? 'river' : lv.rocket > 0 ? 'rocket' : 'dust');
          }
          this.act('chargeHit', k, 0, () => this.chargeContact(k, floor));
          if (k.action === 'charge' && k.t >= (rush ? 0.56 : 0.5)) {
            k.action = 'none';
            k.riverRush = false;
          }
          break;
        }
        case 'zap': {
          k.t += dt;
          k.vx *= Math.exp(-9 * dt);
          k.vz *= Math.exp(-9 * dt);
          if (k.t >= 0.28) {
            k.action = 'none';
            k.comboTimer = 0.48;
          }
          break;
        }
        case 'squeal': {
          k.t += dt;
          k.vx *= Math.exp(-10 * dt);
          k.vz *= Math.exp(-10 * dt);
          if (k.t >= 0.35) k.action = 'none';
          break;
        }
        case 'hurt': {
          k.t += dt;
          k.vx *= Math.exp(-5 * dt);
          k.vz *= Math.exp(-5 * dt);
          if (k.t >= 0.28) k.action = 'none';
          break;
        }
        default:
          break;
      }
    } else {
      k.t += dt;
      k.vx *= Math.exp(-6 * dt);
      k.vz *= Math.exp(-6 * dt);
    }

    // physics
    k.vy -= 34 * dt;
    k.y += k.vy * dt;
    if (k.y <= floor) {
      if (k.action === 'bellyflop' && !k.hitDone) {
        k.y = floor;
        k.vy = 0;
        k.grounded = true;
        k.hitDone = true;
        k.t = 0;
        this.act('flop', k, 0, () => this.bellyFlopLand(k));
      } else {
        if (!k.grounded && k.vy < -8) this.fx.emit(k.x, floor + 0.2, k.z, 5, 0xe9dfc8, 3, 0.22, 0.35, 3);
        k.y = floor;
        k.vy = 0;
        k.grounded = true;
      }
    }
    k.x += k.vx * dt;
    k.z += k.vz * dt;
    const r = this.resolve(k.x, k.z, 0.7);
    if (r.hit && k.action === 'charge' && k.t > 0.05) {
      k.action = 'none';
      this.sound('hit');
      this.addShake(0.3, k);
    }
    const bound = this.mapBound();
    k.x = clamp(r.x, -bound, bound);
    k.z = clamp(r.z, -bound, bound);
    if (A.active && A.y < 2 && A.state !== 'leaving' && A.state !== 'backrooms') {
      const dx = k.x - A.x;
      const dz = k.z - A.z;
      const d = Math.hypot(dx, dz);
      const pr = A.shielded ? 3.6 : 2.1;
      if (d < pr && d > 0.001) {
        k.x = A.x + (dx / d) * pr;
        k.z = A.z + (dz / d) * pr;
      }
    }
  }


  private beginCharge(k: Player, mx: number, mz: number, moving: boolean, rushEligible: boolean, floor: number) {
    const lv = this.levels;
    k.action = 'charge';
    k.t = 0;
    k.riverRush = rushEligible;
    k.chainHits = 0;
    k.rushWindow = 0;
    k.chargeHit.clear();
    k.dummyChargeHit = false;
    this.aim(k, mx, mz, moving, 16, 0.9);
    k.chargeCd = 6 * (1 - 0.175 * lv.rocket);
    this.sound('oink');
    if (k.riverRush) {
      this.sound('splash');
      this.spawnShock(k.x, k.z, 4.4, 28, false, 0);
      this.fx.shockWall(k.x, floor + 0.08, k.z, 0x3ef0ff, 0.8, 3.8, 0.8, 2.6, 0.34, 10);
      this.fx.waterBurst(k.x, floor + 0.6, k.z, 1.25, 6);
      this.fx.flash(k.x, floor + 1.1, k.z, 0x45e6ff, 11, 0.26, 12);
      this.floatText(k.x, 2.65, k.z, 'RIVER RUSH!', 'crit');
    } else {
      this.sound('roll');
      const launchCol = lv.rocket > 0 ? 0xff7a1a : 0xffe49e;
      this.fx.dustRing(k.x, floor, k.z, 8, 0.55, 0xeadcc2, 5.5, 1.5, 0.48);
      this.fx.sparks(k.x, floor + 0.55, k.z, lv.rocket > 0 ? 14 : 8, launchCol, 11, 0.15, 0.3, {
        dirX: -Math.sin(k.heading),
        dirY: 0.2,
        dirZ: -Math.cos(k.heading),
        focus: 0.72,
        hdr: 4.0,
        altColor: 0xffffff,
      });
      if (lv.rocket > 0) this.fx.flash(k.x, floor + 0.9, k.z, 0xff7a1a, 8, 0.2, 9);
    }
  }

  /** Hog Charge contact checks for one step: rams bots, jars, the dummy, wild hogs and Allen. */
  private chargeContact(k: Player, floor: number) {
    const lv = this.levels;
    const A = this.A;
    const hx = Math.sin(k.heading);
    const hz = Math.cos(k.heading);
    const rush = k.riverRush;
    const rushMul = rush ? (lv.riverrush >= 2 ? 1.75 : 1.45) : 1;
    const cd = (38 + 14 * lv.rocket) * rushMul;
    const mul = this.attackMul(k);
    for (const b of [...this.bots]) {
      if (!k.chargeHit.has(b.id) && Math.hypot(b.x - k.x, b.z - k.z) < (rush ? 2.7 : 2.1) + b.rad * 0.4) {
        k.chargeHit.add(b.id);
        this.damageBot(b, (52 + 12 * lv.rocket) * rushMul * mul * 0.75, hx * 20, hz * 20, true);
        this.recordCombo(k, rush ? 'River Rush' : 'Hog Charge', 0);
        this.sound(rush ? 'splash' : 'hit');
      }
    }
    if (this.hitPots(k.x, k.z, 2.8, cd * mul)) {
      this.recordCombo(k, rush ? 'River Rush' : 'Hog Charge', 0);
      this.sound('hit');
      this.addShake(0.4, k);
    }
    if (!k.dummyChargeHit && this.strikeDummy(k, cd * mul, 2.4, hx, hz, -1, rush ? 'RIVER RUSH!' : 'HOG CHARGE!')) {
      k.dummyChargeHit = true;
      this.recordCombo(k, rush ? 'River Rush' : 'Hog Charge', 0);
      this.sound('bighit');
      this.hitstop = Math.max(this.hitstop, 0.11);
      this.addShake(rush ? 0.85 : 0.6, k);
      k.action = 'none';
      k.riverRush = false;
      k.vx = -hx * 8;
      k.vz = -hz * 8;
      k.vy = 6.5;
      k.grounded = false;
    }
    if (k.action === 'charge' && A.active && A.y < 3 && Math.hypot(A.x - k.x, A.z - k.z) < (A.shielded ? 4.3 : rush ? 3.2 : 2.9)) {
      if (this.damageAllen(cd * mul, rush ? 70 : 45, { heavy: true, by: k })) {
        this.recordCombo(k, rush ? 'River Rush' : 'Hog Charge', 0);
        this.sound('bighit');
        if (rush) this.sound('splash');
        this.hitstop = Math.max(this.hitstop, rush ? 0.16 : 0.13);
        this.addShake(rush ? 0.95 : 0.8, k);
        const ix = k.x + hx * 1.5;
        const iz = k.z + hz * 1.5;
        const hitCol = rush ? 0x4ef0ff : lv.rocket > 0 ? 0xff8a24 : 0xffe14d;
        this.fx.hitBurst(ix, 1.75, iz, hitCol, rush ? 2.15 : 1.75, hx, hz);
        this.fx.shockWall(ix, floor + 0.06, iz, hitCol, 0.9, rush ? 6.2 : 4.6, 0.9, rush ? 3.4 : 2.5, 0.38, rush ? 9 : 6);
        if (rush) {
          this.fx.waterBurst(ix, 1.5, iz, 1.65, 8);
          this.fx.groundMark(ix, floor, iz, 4.2, 'splash', 0x5ff2ff, 2.0);
        } else {
          this.fx.dustRing(ix, floor, iz, 10, 0.8, 0xeadcc2, 7.5, 1.8, 0.58);
        }
        this.floatText(A.x, 5.4, A.z, rush ? 'RIVER RUSH!' : 'HOG CHARGE!', rush ? 'crit' : 'info');
        if (lv.tesla > 0) this.teslaZap(k);
        k.action = 'none';
        k.riverRush = false;
        k.vx = -hx * 9;
        k.vz = -hz * 9;
        k.vy = 7;
        k.grounded = false;
        k.invuln = Math.max(k.invuln, 0.35);
      } else if (A.shielded || A.state === 'spin') {
        // bounce off his invincibility stage
        k.action = 'none';
        k.riverRush = false;
        k.vx = -hx * 11;
        k.vz = -hz * 11;
        k.vy = 6.5;
        k.grounded = false;
        this.addShake(0.4, k);
      }
    }
  }

  /* ───────────────────────── online: browser-driven pigs ───────────────────────── */

  /** Runs a move: records it for the server when predicting, and always performs it. */
  private act(fn: StrikeFn, p: Player, arg: number, run: () => void, after = false) {
    const rec = this.recorder;
    if (rec && !after) rec({ fn, arg, pose: poseOf(p) });
    run();
    if (rec && after) rec({ fn, arg, pose: poseOf(p) });
  }

  /** Marks a pig as driven by its owner's browser: the simulation stops moving it and replays its moves instead. */
  setClientDriven(pid: number, on = true) {
    if (on) this.remote.set(pid, { strikes: [], pose: null, guard: 0 });
    else this.remote.delete(pid);
  }

  /** Latest state and moves from a browser-driven pig. Ignored if it predates a forced move (older epoch). */
  remoteUpdate(pid: number, epoch: number, pose: Pose, strikes: Strike[]) {
    const r = this.remote.get(pid);
    const p = this.player(pid);
    if (!r || !p || epoch < p.epoch) return;
    r.pose = pose;
    r.strikes.push(...strikes.slice(0, 32));
    if (r.strikes.length > 64) r.strikes.splice(0, r.strikes.length - 64);
  }

  private applyRemote(p: Player, dt: number) {
    const r = this.remote.get(p.id)!;
    r.guard = Math.max(0, r.guard - dt);
    for (const s of r.strikes) this.replay(p, s);
    r.strikes = [];
    if (r.pose) {
      Object.assign(p, r.pose);
      // keep it on the map whatever arrives
      const bound = this.mapBound();
      p.x = clamp(Number.isFinite(p.x) ? p.x : 0, -bound, bound);
      p.z = clamp(Number.isFinite(p.z) ? p.z : 0, -bound, bound);
      p.y = clamp(Number.isFinite(p.y) ? p.y : 0, 0, 30);
      r.pose = null;
    }
    // the mud's intermission healing is the one health change a pig's own movement causes
    const mud = SPOT.mud;
    if (this.area === 'farm' && this.mode === 'intermission' && p.action !== 'dead' && p.y < 0.3 && Math.hypot(p.x - mud.x, p.z - mud.z) < mud.r) {
      p.hp = Math.min(p.maxHp, p.hp + 3.5 * dt);
    }
  }

  /** Replays one browser-driven move against the shared world, quietly (the owner relays its own effects). */
  private replay(p: Player, s: Strike) {
    if (p.action === 'dead' && s.fn !== 'zap') return;
    Object.assign(p, s.pose);
    const floor = this.area === 'farm' && isOnLakeDock(p.x, p.z) ? 0.23 : 0;
    const events = this.events;
    const hitstop = this.hitstop;
    this.events = [];
    this.replaying = true;
    try {
      switch (s.fn) {
        case 'attack':
          return this.beginAttack(p, 0, 0, false);
        case 'upStart':
          return this.beginUppercut(p, 0, 0, false);
        case 'flopStart':
          return this.beginBellyFlop(p);
        case 'whipStart':
          return this.beginTailWhip(p);
        case 'charge':
          return this.beginCharge(p, 0, 0, false, p.riverRush, floor);
        case 'chargeHit':
          return this.chargeContact(p, floor);
        case 'headbutt':
          return this.headbuttStrike(p);
        case 'cyclone':
          return this.cycloneStrike(p, s.arg === 1);
        case 'uppercut':
          return this.uppercutStrike(p);
        case 'whip':
          return this.tailWhipStrike(p);
        case 'flop':
          return this.bellyFlopLand(p);
        case 'zap':
          return this.doLightningZap(p);
        case 'squeal':
          return this.doSqueal(p);
        case 'portal':
          return this.openPortal(p);
        case 'decoy':
          return this.dropDecoy(p);
        case 'potion':
          return this.drinkPotion(p);
        case 'smash':
          return this.smashBattles(p);
      }
    } finally {
      this.replaying = false;
      this.events = events;
      // one pig's hit shouldn't slow the world down for everyone else
      this.hitstop = hitstop;
    }
  }

  /**
   * Client-side prediction: advances just this browser's pig against the world as it stands, and hands
   * every move it makes to `record` so the server can replay it.
   */
  predict(pid: number, dt: number, input: PlayerInput, record: (s: Strike) => void) {
    const p = this.player(pid);
    if (!p) return;
    this.inputs = new Map([[pid, input]]);
    this.recorder = record;
    const sdt = this.hitstop > 0 ? dt * 0.05 : dt;
    this.hitstop = Math.max(0, this.hitstop - dt);
    try {
      this.updatePlayer(p, sdt);
    } finally {
      this.recorder = null;
    }
    // bump into jars and the rest of the herd
    for (const o of this.pots) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.35 && d > 0.001 && p.y < 1.4) {
        p.x = o.x + (dx / d) * 1.35;
        p.z = o.z + (dz / d) * 1.35;
      }
    }
    for (const o of this.players) {
      if (o === p || o.action === 'dead' || p.action === 'dead' || Math.abs(o.y - p.y) > 1) continue;
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.25 && d > 0.001) {
        p.x += (dx / d) * (1.25 - d) * 0.5;
        p.z += (dz / d) * (1.25 - d) * 0.5;
      }
    }
  }

  /** Applies the server's word that this pig was hit or dodged (prediction side of hurtPlayer). */
  applyKnock(pid: number, fx: number, fz: number, knock: number, dodge: boolean) {
    const k = this.player(pid);
    if (!k || k.action === 'dead') return;
    if (dodge) {
      k.dodged = true;
      k.focus = 3.2;
      k.stam = Math.min(k.maxStam, k.stam + 24);
      this.hitstop = Math.max(this.hitstop, 0.1);
      return;
    }
    let dx = k.x - fx;
    let dz = k.z - fz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    k.vx = dx * knock;
    k.vz = dz * knock;
    k.vy = 6;
    k.grounded = false;
    k.action = 'hurt';
    k.t = 0;
    k.flowCount = 0;
    k.flowTimer = 0;
    k.chainHits = 0;
    k.rushWindow = 0;
    k.riverRush = false;
    k.invuln = 0.9;
    k.blink = 0.9;
  }

  /** Switches maps without any of the travel side effects (prediction mirrors the server's map). */
  showArea(area: Area) {
    if (area === 'forest' && !this.forestColliders) this.forestColliders = this.maps.loadForest().colliders;
    this.area = area;
  }

  /** Sets shared upgrades (prediction mirrors the server's), keeping derived stats in step. */
  setLevels(levels: Record<UpgradeId, number>) {
    this.levels = { ...levels };
    this.turretCollider.enabled = levels.cannon > 0;
  }

  /* ───────────────────────── Kioff's and Charig's abilities ───────────────────────── */

  /** Kioff's Backrooms Portal [V]: kitchen bots nearby noclip out of existence (and, at level 2, Allen for a while). */
  private openPortal(p: Player) {
    const lv = this.levels.portal;
    const R = lv >= 2 ? 8 : 6;
    const A = this.A;
    p.portalCd = lv >= 2 ? 15 : 18;
    p.action = 'squeal';
    p.t = 0;
    const px = p.x + Math.sin(p.heading) * 3;
    const pz = p.z + Math.cos(p.heading) * 3;
    this.sound('shield');
    this.addShake(0.4, p);
    this.fx.groundMark(px, 0, pz, R * 0.8, 'crater', 0xe8d97a, 2.4);
    this.fx.shockWall(px, 0.1, pz, 0xe8d97a, R, 0.6, 3.2, 0.8, 0.6, -6);
    this.fx.motes(px, 1, pz, 30, 0xfff2a8, 4, 0.25, 1.1, -3, 10, R * 0.6, 3);
    this.floatText(px, 3, pz, 'NOCLIP!', 'info');
    let sent = 0;
    this.bots = this.bots.filter((b) => {
      if (b.kind === 'guppy' || b.kind === 'earwhen' || Math.hypot(b.x - px, b.z - pz) > R) return true;
      sent++;
      this.stats.ko++;
      this.fx.sparks(b.x, 1, b.z, 10, 0xe8d97a, 6, 0.15, 0.5, { up: 1, grav: -4, hdr: 3 });
      return false;
    });
    this.projs = this.projs.filter((o) => o.friendly || Math.hypot(o.x - px, o.z - pz) > R);
    this.puddles = this.puddles.filter((o) => Math.hypot(o.x - px, o.z - pz) > R);
    if (sent) this.floatText(px, 4, pz, `${sent} sent to the Backrooms`, 'crit');
    if (lv >= 2 && A.active && !A.shielded && Math.hypot(A.x - px, A.z - pz) < R + 2 && !['gone', 'defeated', 'leaving', 'ko', 'calling', 'backrooms', 'enter'].includes(A.state)) {
      this.fx.flash(A.x, 2, A.z, 0xe8d97a, 14, 0.4, 16);
      this.setA('backrooms');
      A.backroomsT = 4;
      A.y = 0;
      A.target = -1;
      A.tiltQueued = false;
      this.showBanner('ALLEN NOCLIPPED', "He's lost in the Backrooms: smash things while he's gone");
      this.dirty = true;
    }
  }

  private nearestDecoy(x: number, z: number, maxD: number): Decoy | null {
    let best: Decoy | null = null;
    let bd = maxD;
    for (const d of this.decoys) {
      const dd = Math.hypot(d.x - x, d.z - z);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }

  /** Kioff's Wireframe Decoy [G]: a low-poly pig that soaks up attention. */
  private dropDecoy(p: Player) {
    const lv = this.levels.decoy;
    p.decoyCd = 16;
    const pos = this.safePosition(p.x + Math.sin(p.heading) * 2.5, p.z + Math.cos(p.heading) * 2.5, 0.6);
    const life = lv >= 2 ? 8 : 6;
    this.decoys.push({ id: this.id(), x: pos.x, z: pos.z, life, maxLife: life, burst: lv >= 2 });
    if (this.decoys.length > 3) this.decoys.shift();
    this.sound('pop');
    this.fx.sparks(pos.x, 1, pos.z, 16, 0x5ff2ff, 5, 0.12, 0.5, { up: 1, grav: 2, hdr: 3.6 });
    this.floatText(pos.x, 2.4, pos.z, 'DECOY!', 'info');
  }

  private updateDecoys(dt: number) {
    if (!this.decoys.length) return;
    this.decoys = this.decoys.filter((d) => {
      d.life -= dt;
      if (d.life > 0) return true;
      this.fx.sparks(d.x, 1, d.z, 22, 0x5ff2ff, 8, 0.14, 0.5, { hdr: 3.8, altColor: 0xff8fb0 });
      if (d.burst) {
        // a burst of pixels
        this.sound('pop');
        this.fx.shockWall(d.x, 0.1, d.z, 0x5ff2ff, 0.6, 5, 0.6, 2.4, 0.4, 8);
        for (const b of [...this.bots]) if (Math.hypot(b.x - d.x, b.z - d.z) < 5) this.damageBot(b, 40, (b.x - d.x) * 3, (b.z - d.z) * 3, true);
        if (this.A.active && Math.hypot(this.A.x - d.x, this.A.z - d.z) < 5.5) this.damageAllen(22 + 4 * this.course, 15, { fx: d.x, fz: d.z, minor: true });
        this.hitPots(d.x, d.z, 5, 30);
      }
      return false;
    });
  }

  /** Charig's Health Potion [H]: heals you, plus pigs and hogs near you. */
  private drinkPotion(p: Player) {
    const lv = this.levels.potion;
    p.potionCd = lv >= 2 ? 15 : 20;
    const self = lv >= 2 ? 60 : 35;
    const near = lv >= 2 ? 35 : 20;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + self);
    this.sound('buy');
    this.fx.motes(p.x, 1, p.z, 18, 0x7dff8a, 2.5, 0.2, 1, -3, 4, 0.8, 3);
    this.floatText(p.x, 2.6 + p.y, p.z, `+${Math.round(p.hp - before)}`, 'gold');
    for (const o of this.players) {
      if (o === p || o.action === 'dead' || Math.hypot(o.x - p.x, o.z - p.z) > 7) continue;
      o.hp = Math.min(o.maxHp, o.hp + near);
      this.fx.motes(o.x, 1, o.z, 8, 0x7dff8a, 2, 0.18, 0.8, -3, 3, 0.6, 3);
    }
    for (const a of this.allies) {
      if (a.dying > 0 || a.hp <= 0 || Math.hypot(a.x - p.x, a.z - p.z) > 7) continue;
      a.hp = Math.min(a.maxHp, a.hp + near);
    }
    this.dirty = true;
  }

  /** Allen within phone-shoving range in front of this pig. */
  private smashTarget(p: Player): boolean {
    const A = this.A;
    if (!A.active || A.shielded || ['gone', 'defeated', 'leaving', 'ko', 'calling', 'backrooms', 'enter', 'spin', 'slamAir'].includes(A.state)) return false;
    return Math.hypot(A.x - p.x, A.z - p.z) < 6.5;
  }

  /** Charig's Smash Battles [X]: a phone in Allen's face. He's stunned, then Tilted for 15 s. */
  private smashBattles(p: Player) {
    const lv = this.levels.smash;
    const A = this.A;
    p.smashCd = lv >= 2 ? 24 : 30;
    p.action = 'zap';
    p.t = 0;
    if (!this.smashTarget(p)) return;
    p.heading = Math.atan2(A.x - p.x, A.z - p.z);
    this.sound('clang');
    this.sound('stun');
    this.fx.flash(A.x, A.y + 3, A.z, 0xffffff, 12, 0.25, 12);
    this.fx.sparks(A.x, A.y + 3.4, A.z, 18, 0x9fd8ff, 6, 0.14, 0.5, { hdr: 3.6, altColor: 0xff8fb0 });
    this.floatText(A.x, A.y + 5.4, A.z, 'SMASH BATTLES!', 'crit');
    A.tilt = 0;
    this.stunAllen(lv >= 2 ? 3.5 : 2.5, true);
    A.tiltQueued = true;
    if (lv >= 2) {
      for (const b of this.bots) if (Math.hypot(b.x - p.x, b.z - p.z) < 6) b.stun = Math.max(b.stun, 2);
    }
    this.dirty = true;
  }

  /** Passives that tick for every pig: Charig's regen and the history Keyframe Rewind needs. */
  private updatePassives(dt: number) {
    const regen = this.levels.regen;
    this.historyT -= dt;
    const sample = this.historyT <= 0;
    if (sample) this.historyT = 0.2;
    for (const p of this.players) {
      p.calmT += dt;
      if (regen > 0 && p.action !== 'dead' && p.hp < p.maxHp && p.calmT > (regen >= 2 ? 3 : 4)) {
        p.hp = Math.min(p.maxHp, p.hp + (regen >= 2 ? 3 : 1.5) * dt);
      }
      if (sample && this.levels.rewind > 0) {
        const h = this.history.get(p.id) ?? [];
        h.push({ t: this.time, x: p.x, z: p.z, hp: p.hp });
        while (h.length && this.time - h[0].t > 4.5) h.shift();
        this.history.set(p.id, h);
      }
    }
  }

  /** Kioff's Keyframe Rewind: once per course, a knockout hit sends this pig back a few seconds instead. */
  private tryRewind(p: Player): boolean {
    const lv = this.levels.rewind;
    if (lv <= 0 || p.rewinds >= 1 || this.overReason) return false;
    const back = lv >= 2 ? 4 : 3;
    const h = this.history.get(p.id) ?? [];
    const then = h.find((s) => this.time - s.t <= back + 0.1) ?? h[0];
    if (!then) return false;
    p.rewinds++;
    this.fx.sparks(p.x, 1, p.z, 18, 0x9fd8ff, 6, 0.14, 0.6, { hdr: 3.8, altColor: 0xff8fb0 });
    this.fx.lightning(p.x, 1, p.z, then.x, 1, then.z, 0x9fd8ff, 0.06, 0.4);
    p.x = then.x;
    p.z = then.z;
    p.y = 0;
    p.vx = p.vy = p.vz = 0;
    p.hp = Math.max(Math.round(p.maxHp * (lv >= 2 ? 0.5 : 0.25)), Math.round(then.hp));
    p.action = 'none';
    p.t = 0;
    p.invuln = 1.5;
    p.blink = 1.5;
    p.epoch++; // the pig's owner takes the new position
    this.sound('zap');
    this.fx.flash(p.x, 1.5, p.z, 0x9fd8ff, 10, 0.3, 10);
    this.floatText(p.x, 2.8, p.z, 'KEYFRAME REWIND!', 'crit');
    this.history.delete(p.id);
    this.dirty = true;
    return true;
  }

  /**
   * Kingger's Lightning Zap [Q]: calls down a roaring sky & lab-coil thunderbolt onto the nearest target
   * (up to 24m away) and chains jagged lightning across up to 3/5/7 foes, sauce jars, or projectiles!
   */
  private doLightningZap(p: Player) {
    const k = p;
    const lv = this.levels.zap;
    const A = this.A;
    k.action = 'zap';
    k.t = 0;
    k.zapCd = zapCooldown(lv);
    k.zapAura = 2.8 + lv * 0.6;
    k.invuln = Math.max(k.invuln, 0.2);

    const maxTargets = lv >= 3 ? 7 : lv >= 2 ? 5 : 3;
    const range = lv >= 3 ? 26 : lv >= 2 ? 23 : 20;
    const chainR = lv >= 3 ? 16 : 13;
    const mul = this.attackMul(k);
    const baseDmg = [0, 36, 52, 72][Math.min(lv, 3)] * mul;
    const basePoise = [0, 32, 46, 62][Math.min(lv, 3)];

    type ZapTarget = {
      kind: 'allen' | 'bot' | 'pot' | 'dummy' | 'wild';
      x: number;
      y: number;
      z: number;
      bot?: Bot;
      pot?: Pot;
      wild?: Wild;
    };
    const pool: ZapTarget[] = [];
    // Prioritize active Sauce Jars when Allen is shielded
    for (const o of this.pots) {
      if (o.hp > 0) pool.push({ kind: 'pot', x: o.x, y: 1.5, z: o.z, pot: o });
    }
    for (const b of this.bots) {
      if (b.hp > 0) pool.push({ kind: 'bot', x: b.x, y: b.kind === 'tenderizer' ? 1.8 : 1.15, z: b.z, bot: b });
    }
    if (A.active && A.hp > 0 && !A.shielded && A.state !== 'spin' && !['gone', 'defeated', 'leaving', 'ko', 'calling'].includes(A.state)) {
      pool.push({ kind: 'allen', x: A.x, y: A.y + 2.8, z: A.z });
    }
    if (this.area === 'farm' && this.mode === 'intermission') {
      pool.push({ kind: 'dummy', x: SPOT.dummy.x, y: 1.9, z: SPOT.dummy.z });
    }

    // Build sequential chain: pick closest target to Kenji within range, then hop across neighbors!
    const chain: ZapTarget[] = [];
    let curX = k.x;
    let curZ = k.z;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    while (chain.length < maxTargets && pool.length > 0) {
      const limit = chain.length === 0 ? range : chainR;
      let bestIdx = -1;
      let bestScore = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const t = pool[i];
        const dx = t.x - curX;
        const dz = t.z - curZ;
        const d = Math.hypot(dx, dz);
        if (d > limit) continue;
        // slightly prefer targets Kenji is facing & dangerous hissing bombers / sauce jars
        const align = chain.length === 0 && d > 0.1 ? (dx * fx + dz * fz) / d : 0;
        const prio = t.kind === 'pot' ? 0.72 : t.bot?.kind === 'bomber' && t.bot.mode === 'fuse' ? 0.65 : t.kind === 'allen' ? 0.88 : 1;
        const score = d * prio * (1 - align * 0.25);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      const chosen = pool.splice(bestIdx, 1)[0];
      chain.push(chosen);
      curX = chosen.x;
      curZ = chosen.z;
    }

    this.sound('thunder');
    this.sound('zap');
    this.addShake(lv >= 3 ? 0.8 : 0.58, k);

    // Relay arc from Kingger's Tesla Coil into Kenji when fighting on the farm!
    if (this.area === 'farm') {
      this.kingCast = 0.65;
      this.fx.lightning(SPOT.kingger.x, 2.5, SPOT.kingger.z, COIL.x, 3.3, COIL.z, 0x7df9ff, 0.075, 0.3);
      if (Math.hypot(k.x - COIL.x, k.z - COIL.z) < 42) {
        this.fx.lightning(COIL.x, 3.3, COIL.z, k.x, k.y + 1.25, k.z, 0x62f4ff, 0.07, 0.26);
      }
    }
    this.fx.shockWall(k.x, k.y + 0.08, k.z, 0x5ff2ff, 0.7, 3.8 + lv * 0.6, 0.6, 2.4, 0.32, 14);
    this.fx.flash(k.x, k.y + 1.6, k.z, 0x5ff2ff, 11, 0.26, 13);
    this.floatText(k.x, k.y + 2.75, k.z, lv >= 3 ? '⚡ MEGA-ZAP!' : '⚡ LIGHTNING ZAP!', 'crit');

    if (chain.length > 0) {
      // Face the primary target
      k.heading = Math.atan2(chain[0].x - k.x, chain[0].z - k.z);
      let prevX = k.x;
      let prevY = k.y + 1.15;
      let prevZ = k.z;
      let hits = 0;

      chain.forEach((t, idx) => {
        const falloff = idx === 0 ? 1 : Math.max(0.62, 1 - idx * 0.1);
        const dmg = baseDmg * falloff;
        const boltCol = lv >= 3 && idx % 2 === 1 ? 0xffe46b : 0x5ff2ff;
        // Arc from previous link to this target
        this.fx.lightning(prevX, prevY, prevZ, t.x, t.y, t.z, boltCol, idx === 0 ? 0.11 : 0.085, 0.34);
        // Dramatic sky thunderbolt on the primary target (and on extra targets at Lv 3 Mega-Storm!)
        if (idx === 0 || (lv >= 3 && idx <= 2)) {
          this.fx.lightning(t.x + this.rand(-1.5, 1.5), t.y + 16, t.z + this.rand(-1.5, 1.5), t.x, t.y, t.z, 0xc8feff, idx === 0 ? 0.13 : 0.095, 0.38);
          this.fx.groundMark(t.x, 0, t.z, idx === 0 ? 3.8 : 2.6, 'crater', 0x62f4ff, 2.2);
          this.fx.shockWall(t.x, 0.08, t.z, boltCol, 0.7, idx === 0 ? 5.2 : 3.6, 0.7, 3.0, 0.36, 13);
        }
        this.fx.hitBurst(t.x, t.y, t.z, boltCol, idx === 0 ? 1.65 : 1.15);

        if (t.kind === 'allen') {
          if (this.damageAllen(dmg, basePoise * falloff, { heavy: lv >= 2, fx: prevX, fz: prevZ, by: k })) {
            hits++;
            if (lv >= 2) this.stunAllen(lv >= 3 ? 1.9 : 1.3, false);
          }
        } else if (t.kind === 'bot' && t.bot && t.bot.hp > 0) {
          t.bot.stun = Math.max(t.bot.stun, 1.4 + lv * 0.45);
          this.damageBot(t.bot, dmg * 1.25, 0, 0, true);
          hits++;
        } else if (t.kind === 'pot' && t.pot && t.pot.hp > 0) {
          t.pot.hitCd = 0;
          if (this.damagePot(t.pot, dmg * 1.1)) hits++;
        } else if (t.kind === 'dummy') {
          if (this.strikeDummy(k, dmg, 99, 0, 0, -2, 'LIGHTNING ZAP!')) hits++;
        }
        prevX = t.x;
        prevY = t.y;
        prevZ = t.z;
      });

      if (hits > 0) {
        this.recordCombo(k, lv >= 3 ? 'Mega-Zap' : 'Lightning Zap', Math.min(2, hits));
        this.hitstop = Math.max(this.hitstop, 0.09);
      }
    } else {
      // No target in range: strike the ground ahead of Kenji with a dramatic lightning blast!
      const sx = clamp(k.x + fx * 6.5, -this.mapBound() + 1, this.mapBound() - 1);
      const sz = clamp(k.z + fz * 6.5, -this.mapBound() + 1, this.mapBound() - 1);
      this.fx.lightning(sx + this.rand(-1, 1), 17, sz + this.rand(-1, 1), sx, 0.3, sz, 0xc8feff, 0.13, 0.36);
      this.fx.lightning(k.x, k.y + 1.1, k.z, sx, 0.6, sz, 0x5ff2ff, 0.095, 0.32);
      this.fx.hitBurst(sx, 0.8, sz, 0x5ff2ff, 1.6);
      this.fx.shockWall(sx, 0.08, sz, 0x5ff2ff, 0.8, 4.8, 0.7, 2.8, 0.35, 12);
      this.fx.groundMark(sx, 0, sz, 3.4, 'crater', 0x62f4ff, 2.0);
    }

    // Level 2+ vaporizes nearby hostile chopsticks & chili globs with point-defense arcs!
    if (lv >= 2) {
      const zapProjR = lv >= 3 ? 13 : 9.5;
      this.projs = this.projs.filter((o) => {
        if (!o.friendly && Math.hypot(o.x - k.x, o.z - k.z) < zapProjR) {
          this.fx.lightning(k.x, k.y + 1.1, k.z, o.x, o.y, o.z, 0x7df9ff, 0.05, 0.2);
          this.fx.hitBurst(o.x, o.y, o.z, 0x7df9ff, 0.75);
          return false;
        }
        return true;
      });
    }
    this.dirty = true;
  }

  private doSqueal(p: Player) {
    const k = p;
    const lv = this.levels.squeal;
    const R = lv >= 2 ? 13 : 9;
    k.action = 'squeal';
    k.t = 0;
    k.squealCd = lv >= 2 ? 11 : 14;
    this.sound('squeal');
    this.addShake(0.5, k);
    this.spawnShock(k.x, k.z, R, 34, false, 0);
    this.fx.shockWall(k.x, k.y + 0.1, k.z, 0x5ff2ff, 0.9, R * 0.95, 1.0, 3.8, 0.46, 8);
    this.fx.shockWall(k.x, k.y + 0.2, k.z, 0xff9ec4, 0.6, R * 0.7, 1.4, 3.2, 0.36, -11);
    this.fx.hitBurst(k.x, k.y + 1.35, k.z, 0x7df9ff, lv >= 2 ? 1.85 : 1.45);
    this.fx.dustRing(k.x, k.y, k.z, 14, 1.1, 0xd8f8ff, 11, 2.0, 0.55);
    this.floatText(k.x, 2.6, k.z, 'SQUEEEEE!', 'info');
    const A = this.A;
    if (A.active && Math.hypot(A.x - k.x, A.z - k.z) < R + 1.5) {
      if (this.damageAllen(lv >= 2 ? 28 : 12, 20, { by: k })) this.stunAllen(lv >= 2 ? 2.6 : 1.8, false);
    }
    for (const b of [...this.bots]) {
      const dx = b.x - k.x;
      const dz = b.z - k.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < R) {
        b.stun = 2.5;
        this.damageBot(b, 34, (dx / d) * 18, (dz / d) * 18, true);
      }
    }
    this.hitPots(k.x, k.z, R, 30);
    this.projs = this.projs.filter((o) => {
      if (Math.hypot(o.x - k.x, o.z - k.z) < R) {
        this.fx.emit(o.x, 1, o.z, 5, 0xffb057, 5, 0.2, 0.4);
        return false;
      }
      return true;
    });
  }

  private teslaZap(p: Player) {
    const lv = this.levels.tesla;
    const A = this.A;
    const k = p;
    this.sound('zap');
    this.spawnShock(A.x, A.z, 7, 30, false, 0);
    // primary bolt from Kenji's tusks to Allen + sky/crown arcs around Allen
    this.fx.lightning(k.x, k.y + 1.1, k.z, A.x, A.y + 2.8, A.z, 0x5ff2ff, 0.1, 0.28);
    this.fx.lightning(A.x - 1.4, A.y + 4.4, A.z + 0.8, A.x + 1.4, A.y + 1.5, A.z - 0.8, 0xb8fcff, 0.075, 0.24);
    if (lv >= 2) this.fx.lightning(A.x + 0.4, A.y + 8.5, A.z - 0.3, A.x, A.y + 2.6, A.z, 0x7df9ff, 0.11, 0.3);
    this.fx.hitBurst(A.x, A.y + 2.9, A.z, 0x5ff2ff, lv >= 2 ? 1.9 : 1.45);
    this.fx.shockWall(A.x, 0.1, A.z, 0x5ff2ff, 1.2, lv >= 2 ? 7.5 : 5.6, 0.8, 3.0, 0.34, 14);
    if (this.damageAllen(lv >= 2 ? 25 : 10, 10, { by: k })) this.stunAllen(lv >= 2 ? 2.2 : 1.4, false);
    for (const b of [...this.bots]) {
      if (Math.hypot(b.x - A.x, b.z - A.z) < 9) {
        this.fx.lightning(A.x, A.y + 2.5, A.z, b.x, 1.0, b.z, 0x6ff7ff, 0.075, 0.26);
        this.damageBot(b, lv >= 2 ? 60 : 25, 0, 0);
      }
    }
  }

  /** Damages one pig. Returns true when the hit landed. */
  private hurtPlayer(p: Player, dmg: number, fx: number, fz: number, knock: number): boolean {
    const k = p;
    const remote = this.remote.get(k.id);
    // rolling through a hit at the last moment rewards a Perfect Dodge
    if (k.action === 'roll' && k.invuln > 0 && !k.dodged && !this.overReason) {
      if (remote) this.events.push({ t: 'knock', only: k.id, fx, fz, knock, dodge: true });
      k.dodged = true;
      k.focus = 3.2;
      k.stam = Math.min(k.maxStam, k.stam + 24);
      this.hitstop = Math.max(this.hitstop, 0.1);
      this.sound('truffle', k);
      this.floatText(k.x, 2.9 + k.y, k.z, 'PERFECT DODGE!', 'crit');
      this.fx.hitBurst(k.x, 1.05 + k.y, k.z, 0x62f4ff, 1.45);
      this.fx.slash({ x: k.x, y: 0.95 + k.y, z: k.z, heading: k.heading, color: 0x7df9ff, radius: 2.9, full: true, spin: 18, dur: 0.34, rise: 1.4, hdr: 4.2 });
      this.fx.motes(k.x, 0.9 + k.y, k.z, 16, 0x7df9ff, 6, 0.2, 0.7, -3, 8, 0.8, 3.8);
    }
    if (k.invuln > 0 || (remote && remote.guard > 0) || k.action === 'dead' || this.overReason) return false;
    if (remote) {
      // the owner's browser moves the pig: tell it to take the knockback, and don't hit it again before it hears
      remote.guard = 0.9;
      this.events.push({ t: 'knock', only: k.id, fx, fz, knock, dodge: false });
    }
    const def = (1 - 0.1 * this.levels.hide) * (k.muddy > 0 ? 0.85 : 1);
    const d = Math.max(1, Math.round(dmg * def));
    k.calmT = 0;
    if (k.hp - d <= 0 && this.tryRewind(k)) return true;
    k.hp -= d;
    this.stats.taken += d;
    k.hurtTick++;
    let dx = k.x - fx;
    let dz = k.z - fz;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    k.vx = dx * knock;
    k.vz = dz * knock;
    k.vy = 6;
    k.grounded = false;
    k.action = 'hurt';
    k.t = 0;
    k.flowCount = 0;
    k.flowTimer = 0;
    k.chainHits = 0;
    k.rushWindow = 0;
    k.riverRush = false;
    k.invuln = 0.9;
    k.blink = 0.9;
    this.addShake(0.6, k);
    this.sound('hurt');
    this.floatText(k.x, 2.4 + k.y, k.z, `-${d}`, 'hurt');
    this.fx.hitBurst(k.x, 1.1 + k.y, k.z, 0xff5a4a, 1.15, dx, dz);
    if (k.hp <= 0) {
      k.hp = 0;
      k.action = 'dead';
      k.t = 0;
      k.epoch++;
      if (this.living().length > 0) {
        // the rest of the herd fights on; knocked-out pigs get back up when the course ends
        this.floatText(k.x, 3.2, k.z, `${k.name} is down!`, 'hurt hog-callout');
      } else if (this.area === 'forest') {
        this.say('Path Guppy', 'And stay off my path!', 4);
        this.gameOver('guppy');
      } else {
        this.say('Allen', this.pick(['Dinner… is served.', 'Finally. Someone get the grill.']), 4);
        this.gameOver('kenji');
      }
    }
    this.dirty = true;
    return true;
  }

  /** Hurts every pig inside a circle (low enough to be hit). */
  private hurtPlayersNear(x: number, z: number, r: number, maxY: number, dmg: number, fx: number, fz: number, knock: number) {
    let any = false;
    for (const p of this.players) {
      if (p.y < maxY && Math.hypot(p.x - x, p.z - z) < r && this.hurtPlayer(p, dmg, fx, fz, knock)) any = true;
    }
    return any;
  }

  /* ───────────────────────── Allen ───────────────────────── */

  private setA(s: AState) {
    this.A.state = s;
    this.A.t = 0;
  }

  private recover(dur: number) {
    this.setA('recover');
    this.A.recoverDur = dur;
  }

  private stunAllen(dur: number, force: boolean) {
    const A = this.A;
    if (!A.active || A.hp <= 0) return;
    if (['defeated', 'leaving', 'ko', 'calling', 'gone', 'slamAir', 'spin', 'backrooms'].includes(A.state) || A.shielded) return;
    if (A.stunImmune > 0) {
      // fresh out of a stun he shrugs off the light stuff, and even big hits only rattle him briefly
      if (!force) {
        this.floatText(A.x, 5.2, A.z, 'RESISTED', 'info');
        return;
      }
      dur = Math.max(0.5, dur * STUN_RECOVERING);
      this.floatText(A.x, 5.2, A.z, 'SHRUGGED IT OFF', 'info');
    }
    this.setA('stunned');
    A.stunDur = dur;
    A.poise = 0;
    A.slamChain = 0;
    A.swipes = 0;
    A.volleys = 0;
    this.sound('stun');
  }

  /**
   * The pig Allen is fighting. He sticks with his current target unless someone else is clearly closer,
   * so a big herd can bait him around without him twitching between pigs every frame.
   */
  private allenTarget(): Player | null {
    const A = this.A;
    const alive = this.living();
    if (!alive.length) return this.players[0] ?? null;
    const cur = alive.find((p) => p.id === A.focusId);
    const near = this.nearestPlayer(A.x, A.z, Infinity, alive)!;
    if (!cur) {
      A.focusId = near.id;
      return near;
    }
    if (near !== cur && Math.hypot(near.x - A.x, near.z - A.z) + 4 < Math.hypot(cur.x - A.x, cur.z - A.z)) {
      A.focusId = near.id;
      return near;
    }
    return cur;
  }

  /* ───────── invincibility stages: Sauce Shield, Wok Guard, Sizzle Spin ───────── */

  private immuneFx(text: string, sx: number, sz: number) {
    const A = this.A;
    if (A.immuneCd > 0) return;
    A.immuneCd = 0.3;
    this.sound('clang');
    const dx = sx - A.x;
    const dz = sz - A.z;
    const d = Math.hypot(dx, dz) || 1;
    const ix = A.x + (dx / d) * (A.shielded ? 3.2 : 1.9);
    const iz = A.z + (dz / d) * (A.shielded ? 3.2 : 1.9);
    this.floatText(A.x + this.rand(-0.6, 0.6), A.y + 4.7, A.z, text, 'info');
    this.fx.hitBurst(ix, A.y + 2.3, iz, 0xffd24d, 0.9, dx / d, dz / d);
  }

  private clearStageProps() {
    this.pots = [];
    this.hazards = [];
  }

  /**
   * Returns true when damage actually landed. Allen shrugs hits off entirely while his Sauce Shield is up
   * or while he is spinning, and blocks frontal light attacks during Wok Guard.
   * `fx/fz` is where the hit came from (defaults to the attacking pig).
   */
  private damageAllen(dmg: number, poise: number, o: { heavy?: boolean; minor?: boolean; fx?: number; fz?: number; by?: Player } = {}): boolean {
    const A = this.A;
    if (!A.active || ['gone', 'defeated', 'leaving', 'ko', 'calling', 'backrooms'].includes(A.state)) return false;
    const srcX = o.fx ?? o.by?.x ?? A.x + Math.sin(A.heading) * 3;
    const srcZ = o.fz ?? o.by?.z ?? A.z + Math.cos(A.heading) * 3;
    if (A.shielded) {
      this.immuneFx('IMMUNE', o.by?.x ?? srcX, o.by?.z ?? srcZ);
      return false;
    }
    if (A.state === 'spin') {
      this.immuneFx('SPINNING!', o.by?.x ?? srcX, o.by?.z ?? srcZ);
      return false;
    }
    let guardBroken = false;
    if (A.state === 'guard') {
      const sx = srcX - A.x;
      const sz = srcZ - A.z;
      const sd = Math.hypot(sx, sz) || 1;
      const front = (sx * Math.sin(A.heading) + sz * Math.cos(A.heading)) / sd > -0.2;
      if (front && !o.heavy) {
        this.immuneFx('BLOCKED', o.by?.x ?? srcX, o.by?.z ?? srcZ);
        return false;
      }
      if (!o.minor) {
        guardBroken = true;
        dmg *= front ? 0.7 : 1.35;
        this.floatText(A.x, A.y + 5.9, A.z, front ? 'GUARD BREAK!' : 'BACKSTAB!', 'crit');
        this.fx.hitBurst(A.x + Math.sin(A.heading) * (front ? 1.6 : -1.2), A.y + 2.7, A.z + Math.cos(A.heading) * (front ? 1.6 : -1.2), 0xffc83d, 1.85);
        this.fx.shockWall(A.x, 0.1, A.z, 0xffd24d, 1.0, 5.5, 0.9, 3.0, 0.36, 9);
        this.sound('shatter');
        this.addShake(0.5, o.by);
      }
    }
    const crit = A.state === 'stunned';
    const mult = A.exposed > 0 ? 1.35 : crit ? 1.25 : 1;
    let d = Math.min(Math.ceil(A.hp), Math.max(1, Math.round(dmg * mult)));
    // phase gates: Allen cannot be pushed past a phase line until that phase's shield stage is cleared
    const gate = A.phase < A.phases - 1 ? Math.ceil(A.maxHp * (1 - (A.phase + 1) / A.phases)) : 0;
    const gated = gate > 0 && A.hp - d <= gate;
    if (gated) d = Math.max(1, Math.ceil(A.hp - gate));
    A.hp -= d;
    this.stats.dealt += d;
    A.flash = 0.12;
    this.floatText(A.x + this.rand(-0.8, 0.8), A.y + 4.2 + this.rand(0, 1), A.z, String(d), crit || A.exposed > 0 ? 'crit' : 'dmg');
    A.dropAcc += d;
    // truffles drop per 10% of his *base* health, so a big herd doesn't flood the farm with them
    const chunk = (A.maxHp / this.hpScale()) * 0.1;
    while (A.dropAcc >= chunk) {
      A.dropAcc -= chunk;
      this.spawnTruffle(A.x, A.z, true);
      this.spawnTruffle(A.x, A.z, true);
    }
    if (A.hp <= 0) {
      this.defeatAllen();
      return true;
    }
    if (gated) {
      this.beginShield();
      return true;
    }
    if (guardBroken) {
      A.cdGuard = 10;
      this.stunAllen(1.7, true);
      return true;
    }
    if (A.state === 'eating' || A.state === 'toEat') {
      A.eatDmg += d;
      if (A.eatDmg >= 30 + 9 * this.course) {
        A.hunger = COURSES[this.course].hunger;
        A.target = -1;
        this.say('Allen', this.pick(['Hey! I was EATING that!', 'Do you MIND?', 'Rude. So rude.']), 2.6);
        this.floatText(A.x, 5.4, A.z, 'INTERRUPTED!', 'info');
        this.recover(0.5);
      }
    }
    // the stagger bar only fills once he's over his last stun
    if (A.state !== 'stunned' && A.state !== 'slamAir' && A.state !== 'dash' && A.stunImmune <= 0) {
      A.poise += poise;
      A.poiseDelay = 1.6;
      if (A.poise >= A.poiseMax) {
        this.floatText(A.x, 5.6, A.z, 'STAGGERED!', 'crit');
        this.fx.hitBurst(A.x, A.y + 3.2, A.z, 0xffe14d, 1.9);
        this.fx.shockWall(A.x, 0.1, A.z, 0xffe14d, 1.2, 6.4, 0.8, 3.2, 0.4, 8);
        this.stunAllen(1.5, true);
      }
    }
    return true;
  }

  /** Phase line reached: Allen turns invincible until every sauce jar is smashed (or the marinade timer runs out). */
  private beginShield() {
    const A = this.A;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    A.phase++;
    A.shielded = true;
    A.shieldDur = Math.max(12.5, 19.5 - this.course * 0.9);
    A.shieldT = A.shieldDur;
    A.rainT = 1.9;
    A.y = 0;
    A.target = -1;
    A.poise = 0;
    A.exposed = 0;
    A.slamChain = 0;
    A.swipes = 0;
    A.volleys = 0;
    this.setA('shielded');
    // more pigs, more jars to smash
    const jars = c.jars + Math.floor((this.players.length - 1) / 2);
    this.spawnPots(jars);
    // From Course 2 onward, Allen calls kitchen guards to defend his sauce jars!
    if (this.course >= 1) this.spawnBots(Math.min(3, 1 + Math.floor(this.course / 3)), true);
    this.sound('shield');
    this.sound('roar');
    this.addShake(0.7);
    this.spawnShock(A.x, A.z, 9, 22, false, 0);
    this.fx.shockWall(A.x, 0.1, A.z, 0xff9a2e, 1.4, 9.2, 1.2, 4.6, 0.52, 7);
    this.fx.hitBurst(A.x, 3.1, A.z, 0xffaa38, 2.0);
    this.fx.dustRing(A.x, 0.1, A.z, 14, 1.5, 0xffcf88, 9, 2.2, 0.7);
    this.showBanner('SAUCE SHIELD!', `Allen is invincible · smash all ${jars} sauce jars`);
    if (!this.tips.has('shield')) {
      this.tips.add('shield');
      this.say('Kingger', 'His shield is powered by those glowing sauce jars! Smash every one before he finishes marinating!', 5.5);
    } else {
      this.say('Allen', this.pick(["You can't tenderize what's still marinating!", 'Sauce shield! Good luck, bacon.', 'I am UNTOUCHABLE. And delicious.']), 3.6);
    }
    this.dirty = true;
  }

  private spawnPots(n: number) {
    const A = this.A;
    const cx = clamp(A.x, -34, 34);
    const cz = clamp(A.z, -34, 34);
    const start = this.rnd() * TAU;
    const hp = 44 + 13 * this.course;
    for (let i = 0; i < n; i++) {
      const a = start + (i / n) * TAU + this.rand(-0.25, 0.25);
      const r = this.rand(9.5, 13.5);
      const pos = this.safePosition(clamp(cx + Math.sin(a) * r, -48, 48), clamp(cz + Math.cos(a) * r, -48, 48), 0.95);
      this.pots.push({ id: this.id(), x: pos.x, z: pos.z, hp, wob: 0, hitCd: 0, ph: this.rnd() * 6 });
      this.fx.emit(pos.x, 1, pos.z, 12, 0xff7a1a, 7, 0.28, 0.6);
    }
    A.potTotal = n;
  }

  private damagePot(p: Pot, dmg: number): boolean {
    if (p.hp <= 0 || p.hitCd > 0) return false;
    const d = Math.max(1, Math.round(dmg));
    p.hp -= d;
    p.hitCd = 0.22;
    p.wob = 1;
    this.floatText(p.x + this.rand(-0.3, 0.3), 2.7, p.z, String(d), 'dmg');
    this.fx.emit(p.x, 1.2, p.z, 7, 0xe5392b, 7, 0.22, 0.45);
    if (p.hp <= 0) {
      this.pots = this.pots.filter((o) => o !== p);
      const left = this.pots.length;
      this.fx.hitBurst(p.x, 1.4, p.z, 0xff7a24, 1.65);
      this.fx.shockWall(p.x, 0.08, p.z, 0xff5a24, 0.7, 4.4, 0.6, 2.4, 0.36, 8);
      this.fx.chunks(p.x, 1.2, p.z, 16, 0x8a5231, 11, 0.28, 0.7);
      this.fx.sparks(p.x, 1.3, p.z, 24, 0xff4a1f, 14, 0.2, 0.58, { hdr: 4.2, altColor: 0xffd24d });
      // backlash bolt racing down the severed tether into Allen's shield!
      this.fx.lightning(p.x, 1.6, p.z, this.A.x, this.A.y + 2.9, this.A.z, 0xffb347, 0.09, 0.28);
      this.sound('shatter');
      this.addShake(0.35);
      this.spawnTruffle(p.x, p.z, true);
      this.floatText(p.x, 3.5, p.z, left ? `JAR SMASHED · ${left} LEFT` : 'LAST JAR!', 'crit');
    }
    return true;
  }

  private hitPots(x: number, z: number, radius: number, dmg: number, fx = 0, fz = 0, coneMin = -2): boolean {
    let hit = false;
    for (const p of [...this.pots]) {
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz) || 0.001;
      if (d > radius) continue;
      if (coneMin > -1 && (dx * fx + dz * fz) / d <= coneMin) continue;
      if (this.damagePot(p, dmg)) hit = true;
    }
    return hit;
  }

  private updatePots(dt: number) {
    if (!this.pots.length) return;
    for (const o of this.pots) {
      o.hitCd = Math.max(0, o.hitCd - dt);
      o.wob = Math.max(0, o.wob - dt * 3);
      // solid enough to bump into
      for (const k of this.players) {
        if (this.remote.has(k.id)) continue;
        const dx = k.x - o.x;
        const dz = k.z - o.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.35 && d > 0.001 && k.y < 1.4) {
          k.x = o.x + (dx / d) * 1.35;
          k.z = o.z + (dz / d) * 1.35;
        }
      }
    }
  }

  private breakShield(success: boolean) {
    const A = this.A;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    A.shielded = false;
    A.y = 0;
    for (const p of this.pots) this.fx.emit(p.x, 1.2, p.z, 10, 0x8a5231, 7, 0.28, 0.5);
    this.pots = [];
    A.hunger = Math.max(A.hunger, 7);
    A.cdGuard = Math.max(A.cdGuard, 4);
    if (success) {
      A.exposed = 4.8;
      this.stunAllen(2.9, true);
      this.sound('shatter');
      this.sound('bighit');
      this.addShake(0.9);
      this.hitstop = Math.max(this.hitstop, 0.14);
      this.fx.hitBurst(A.x, 3.2, A.z, 0xffc84a, 2.5);
      this.fx.shockWall(A.x, 0.1, A.z, 0xffb347, 2.2, 11.5, 1.8, 5.2, 0.56, 8);
      this.fx.shockWall(A.x, 0.1, A.z, 0x5ff2ff, 1.5, 8.8, 2.2, 4.6, 0.44, -10);
      this.fx.sparks(A.x, 3.1, A.z, 52, 0xffd24d, 18, 0.22, 0.82, { grav: 12, up: 0.95, hdr: 4.5, stretch: 5.0, altColor: 0x7df9ff });
      this.fx.groundMark(A.x, 0, A.z, 5.2, 'crater', 0xffb255, 3.0);
      this.spawnShock(A.x, A.z, 10, 26, false, 0);
      this.showBanner('SHIELD SHATTERED!', 'Allen is EXPOSED · +35% damage — unload your combos!');
      this.say('Allen', this.pick(['My marinade! That took HOURS!', 'Not the chili oil!', 'You broke my sauce… you MONSTER.']), 3.6);
    } else {
      const heal = Math.round(A.maxHp * 0.12);
      A.hp = Math.min(A.maxHp, A.hp + heal);
      this.floatText(A.x, 6, A.z, `+${heal} WELL FED`, 'hurt');
      this.sound('roar');
      this.sound('slam');
      this.addShake(0.9);
      this.spawnShock(A.x, A.z, 22, 21, true, 18 * c.dmg);
      this.showBanner('FULLY MARINATED', `Allen healed ${heal} HP · jump the shockwave and break the jars faster!`);
      this.say('Allen', this.pick(['Mmm. Perfectly marinated.', 'Sauce absorbed. I feel DELICIOUS.']), 3.4);
      this.recover(0.9);
    }
    const hangryPhase = this.course >= 6 ? Math.max(1, A.phases - 2) : A.phases - 1;
    if (A.phase >= hangryPhase && this.course >= 2 && !A.enraged) {
      A.enraged = true;
      this.sound('roar');
      this.floatText(A.x, 6.8, A.z, 'HANGRY!', 'hurt');
    }
    this.dirty = true;
  }

  /** Telegraphed falling dumpling: step out of the circle before it lands. */
  private spawnRain(x: number, z: number, dmg: number, tele: number) {
    const b = BOUND - 1;
    this.hazards.push({ id: this.id(), x: clamp(x, -b, b), z: clamp(z, -b, b), r: 2.7, t: 0, dur: 1.05 * tele, dmg });
  }

  private updateHazards(dt: number) {
    if (!this.hazards.length) return;
    this.hazards = this.hazards.filter((h) => {
      h.t += dt;
      const p = Math.min(1, h.t / h.dur);
      if (p > 0.2 && this.rnd() < dt * 28) {
        this.fx.sparks(h.x, 18 * (1 - p * p) + 0.6 + 0.5, h.z, 1, 0xff8a2e, 5, 0.14, 0.24, { dirY: 1, focus: 0.7, grav: 2, hdr: 3.8, altColor: 0xffe14d });
      }
      if (p < 1) return true;
      this.fx.hitBurst(h.x, 0.85, h.z, 0xff6a24, 1.35);
      this.fx.shockWall(h.x, 0.06, h.z, 0xff7a2e, 0.6, h.r * 1.15, 0.5, 2.2, 0.32, 6);
      this.fx.groundMark(h.x, 0, h.z, h.r * 0.9, 'crater', 0xff8a3c, 2.0);
      this.fx.dustRing(h.x, 0.05, h.z, 8, 0.6, 0xd8bda0, 6.5, 1.7, 0.55);
      this.sound('pop');
      this.addShake(0.25);
      this.hurtPlayersNear(h.x, h.z, h.r + 0.35, 3, h.dmg, h.x, h.z, 11);
      this.hitAlliesNear(h.x, h.z, h.r, h.dmg * 0.6);
      return false;
    });
  }

  private pickEdible(): number {
    const A = this.A;
    const alive = this.edibles.map((e, i) => ({ e, i })).filter(({ e }) => e.hp > 0);
    if (!alive.length) return -1;
    alive.sort((a, b) => Math.hypot(a.e.x - A.x, a.e.z - A.z) - Math.hypot(b.e.x - A.x, b.e.z - A.z));
    return alive[Math.min(alive.length - 1, this.rnd() < 0.65 ? 0 : 1)].i;
  }

  private moveAllen(tx: number, tz: number, speed: number, dt: number, bounded: boolean) {
    const A = this.A;
    const dx = tx - A.x;
    const dz = tz - A.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const base = Math.atan2(dx, dz);
    let ang = base;
    if (A.avoidT > 0) {
      A.avoidT -= dt;
      ang += A.avoidDir * 1.25;
    }
    A.heading = angLerp(A.heading, ang, 8 * dt);
    const step = Math.min(d, speed * dt);
    A.x += Math.sin(ang) * step;
    A.z += Math.cos(ang) * step;
    if (bounded) {
      const r = this.resolve(A.x, A.z, 1.5);
      A.x = clamp(r.x, -BOUND, BOUND);
      A.z = clamp(r.z, -BOUND, BOUND);
      if (r.hit && A.avoidT <= 0) {
        A.avoidT = 0.7;
        A.avoidDir = angDiff(base, Math.atan2(r.cx - A.x, r.cz - A.z)) > 0 ? -1 : 1;
      }
    }
    A.walk += dt * speed * 0.9;
  }

  /** Kitchen bots allowed at once: a bigger herd faces a bigger brigade. */
  private maxBots() {
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    return Math.max(2, c.maxBots - 1) + Math.floor((this.players.length - 1) * 0.6);
  }

  /** Spawns a mixed squad from the current course's kitchen roster (either beside Allen or marching in from the gate). */
  private spawnBots(n: number, fromGate = false) {
    const A = this.A;
    const c = COURSES[Math.min(this.course, COURSES.length - 1)];
    const roster = c.roster;
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      if (this.bots.length >= this.maxBots()) break;
      // pick varied types: cap active Tenderizers at 2 and Bombers at 2 so fights stay thrilling & readable
      let kind = roster[(i + Math.floor(this.rnd() * roster.length)) % roster.length];
      if (kind === 'tenderizer' && this.bots.filter((o) => o.kind === 'tenderizer').length >= 2) kind = 'grill';
      if (kind === 'bomber' && this.bots.filter((o) => o.kind === 'bomber').length >= 2) kind = this.pick(['grill', 'skewer'] as BotKind[]);
      // ensure the signature newest enemy of this course shows up on the first slot when available
      if (i === 0 && roster.length > 1) {
        const sig = roster[roster.length - 1];
        if (!this.bots.some((o) => o.kind === sig)) kind = sig;
      }

      let sx: number;
      let sz: number;
      if (fromGate) {
        sx = (i - (n - 1) / 2) * 3.2 + this.rand(-1.2, 1.2);
        sz = BOUND - 1.5 - this.rand(0, 2);
      } else {
        const a = A.heading + (i - (n - 1) / 2) * 1.05 + PI * 0.5;
        sx = A.x + Math.sin(a) * 4.5;
        sz = A.z + Math.cos(a) * 4.5;
      }
      const { hp, rad } = botStats(kind, this.course);
      const r = this.safePosition(clamp(sx, -BOUND + 2, BOUND - 2), clamp(sz, -BOUND + 2, BOUND - 2), rad);
      const bot: KitchenBot = {
        id: this.id(),
        kind,
        x: r.x,
        z: r.z,
        hp,
        maxHp: hp,
        rad,
        heading: PI,
        bite: this.rand(0.6, 1.3),
        stun: 0.35,
        kx: 0,
        kz: 0,
        chomp: 0,
        flash: 0,
        ph: this.rnd() * 6,
        mode: 'idle',
        mt: 0,
        lx: 0,
        lz: -1,
        strafe: this.rnd() < 0.5 ? 1 : -1,
        hop: 0,
        moving: false,
        swing: 0,
      };
      this.bots.push(bot);
      this.fx.emit(r.x, 1, r.z, 10, kind === 'spitter' ? 0xff3b24 : kind === 'bomber' ? 0xff8a24 : 0x26262b, 6, 0.28, 0.5, 4);
      spawned++;
    }
    if (spawned > 0) this.sound('pop');
  }

  /**
   * Where a person playing Allen is aiming: the nearest standing pig roughly ahead of him (a little aim
   * assist), or a spot a few metres ahead in the direction they're steering.
   */
  private allenAim(inp: PlayerInput): { x: number; z: number; vx: number; vz: number } {
    const A = this.A;
    const ml = Math.hypot(inp.mx, inp.mz);
    const face = ml > 0.2 ? Math.atan2(inp.mx, inp.mz) : A.heading;
    let best: Player | null = null;
    let bd = 28;
    for (const p of this.living()) {
      const d = Math.hypot(p.x - A.x, p.z - A.z);
      if (d < bd && Math.abs(angDiff(face, Math.atan2(p.x - A.x, p.z - A.z))) < 0.6) {
        bd = d;
        best = p;
      }
    }
    if (best) return best;
    return { x: A.x + Math.sin(face) * 9, z: A.z + Math.cos(face) * 9, vx: 0, vz: 0 };
  }

  /** Allen walking about under a person's control, picking moves with buttons instead of the AI. */
  private allenControls(inp: PlayerInput, spd: number, dt: number, kDead: boolean) {
    const A = this.A;
    let mx = inp.mx;
    let mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.05) {
      mx /= ml;
      mz /= ml;
      const face = Math.atan2(mx, mz);
      A.heading = angLerp(A.heading, face, 9 * dt);
      const step = spd * 1.1 * Math.min(1, ml);
      A.x += mx * step * dt;
      A.z += mz * step * dt;
      const r = this.resolve(A.x, A.z, 1.5);
      A.x = clamp(r.x, -BOUND, BOUND);
      A.z = clamp(r.z, -BOUND, BOUND);
      A.walk += dt * step * 0.9;
    }
    // a snack within reach?
    let near = -1;
    let nd = 6.5;
    this.edibles.forEach((e, i) => {
      const d = Math.hypot(e.x - A.x, e.z - A.z) - e.r;
      if (e.hp > 0 && d < nd) {
        nd = d;
        near = i;
      }
    });
    if (near >= 0) this.allenPrompt = `E|Eat the ${this.edibles[near].name.toLowerCase()}`;
    const b = inp.buttons;
    if (!b || kDead) return;
    const deny = () => this.events.push({ t: 'sfx', n: 'deny', only: ALLEN_ID });
    const go = (s: AState) => {
      A.summoned = false;
      A.volleys = 0;
      A.swipes = 0;
      this.setA(s);
    };
    if (b & BTN.interact && near >= 0) {
      A.target = near;
      A.eatDmg = 0;
      A.chompT = 0;
      go('eating');
      this.say('Allen', this.pick(["Don't mind me…", 'Just a little nibble.', 'Mmm, farm to table.']), 2.4);
    } else if (b & BTN.attack) {
      if (A.cdSwipe <= 0) go('swipeWind');
      else deny();
    } else if (b & BTN.charge) {
      if (A.cdDash <= 0) {
        go('dashWind');
        this.sound('roar');
      } else deny();
    } else if (b & BTN.jump) {
      if (A.cdSlam <= 0) go('slamWind');
      else deny();
    } else if (b & BTN.roll) {
      if (A.cdGuard <= 0) {
        go('guard');
        this.sound('clang');
        this.floatText(A.x, 5.7, A.z, 'WOK GUARD!', 'info');
      } else deny();
    } else if (b & BTN.zap) {
      if (A.cdThrow <= 0) go('throwWind');
      else deny();
    } else if (b & BTN.squeal) {
      if (A.cdSummon <= 0 && this.bots.length < this.maxBots()) {
        go('summon');
        this.sound('roar');
      } else deny();
    } else if (b & BTN.whip) {
      if (A.cdRain <= 0) {
        go('rainCast');
        A.rainLeft = 3 + A.phase;
        A.rainT = 0.5;
        this.sound('roar');
        this.floatText(A.x, 6, A.z, 'HOT POT RAIN!', 'hurt');
      } else deny();
    } else if (b & BTN.listen) {
      if (A.cdSpin <= 0) {
        go('spinWind');
        this.sound('roar');
        this.floatText(A.x, 6, A.z, 'SIZZLE SPIN!', 'hurt');
      } else deny();
    }
  }

  private updateAllen(dt: number) {
    const A = this.A;
    this.allenPrompt = null;
    if (!A.active) return;
    const ctl = this.allenPlayer ? (this.inputs.get(ALLEN_ID) ?? NO_INPUT) : null;
    // a wireframe decoy is irresistible to the AI; a person playing Allen aims for themselves
    const lure = ctl ? null : this.nearestDecoy(A.x, A.z, 40);
    const k = ctl ? this.allenAim(ctl) : (lure ? { x: lure.x, z: lure.z, vx: 0, vz: 0 } : this.allenTarget());
    if (!k) return;
    const cBase = COURSES[Math.min(this.course, COURSES.length - 1)];
    const c0 = { ...cBase, dmg: cBase.dmg * ALLEN_DMG };
    // Tilted (after Smash Battles): faster, harder-hitting, quicker wind-ups
    const c = A.tilt > 0 ? { ...c0, dmg: c0.dmg * 1.3, speed: c0.speed * 1.25, tele: c0.tele * 0.85 } : c0;
    if (A.tilt > 0) {
      A.tilt = Math.max(0, A.tilt - dt);
      if (A.tilt === 0) {
        this.floatText(A.x, 5.6, A.z, 'calmed down', 'info');
        this.dirty = true;
      }
    }
    A.t += dt;
    A.flash = Math.max(0, A.flash - dt);
    A.stunImmune = Math.max(0, A.stunImmune - dt);
    A.cdSwipe -= dt;
    A.cdSlam -= dt;
    A.cdThrow -= dt;
    A.cdDash -= dt;
    A.cdSummon -= dt;
    A.cdGuard -= dt;
    A.cdRain -= dt;
    A.cdSpin -= dt;
    A.exposed = Math.max(0, A.exposed - dt);
    A.immuneCd = Math.max(0, A.immuneCd - dt);
    A.globalCd -= dt;
    for (const id in A.spinHits) A.spinHits[id] -= dt;
    if (A.poiseDelay > 0) A.poiseDelay -= dt;
    else A.poise = Math.max(0, A.poise - 22 * dt);
    const kDead = this.living().length === 0;
    const maxBots = this.maxBots();

    // Kitchen reinforcement stream keeps pressure high across every stage!
    if (!kDead && A.hp > 0 && !['enter', 'defeated', 'leaving', 'ko', 'calling'].includes(A.state)) {
      this.waveT -= dt;
      if (this.waveT <= 0) {
        this.waveT = c.waveCd * KITCHEN_WAVE_GAP * (A.enraged ? 0.8 : 1);
        if (this.bots.length < maxBots - 1) {
          const extra = Math.floor((this.players.length - 1) / 3);
          const count = Math.min(Math.max(1, c.bots - 1) + extra, maxBots - this.bots.length, 1 + Math.floor(this.course / 3) + extra);
          this.spawnBots(count, true);
        }
      }
    }

    const dx = k.x - A.x;
    const dz = k.z - A.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const toK = Math.atan2(dx, dz);
    const tele = c.tele * (A.enraged ? 0.82 : 1);
    const spd = c.speed * (A.enraged ? 1.2 : 1) * (1 + 0.05 * A.phase);

    switch (A.state) {
      case 'enter': {
        this.moveAllen(0, 42, spd * 1.3, dt, false);
        if (A.z <= 44 || A.t > 5) this.setA('chase');
        break;
      }
      case 'chase': {
        if (ctl) {
          this.allenControls(ctl, spd, dt, kDead);
          break;
        }
        if (kDead) break;
        A.heading = angLerp(A.heading, toK, 5 * dt);
        if (dist > 3.6) this.moveAllen(k.x, k.z, spd, dt, true);
        A.hunger -= dt;
        if (A.hunger <= 0) {
          const ei = this.pickEdible();
          if (ei >= 0) {
            const e = this.edibles[ei];
            A.target = ei;
            A.eatDmg = 0;
            const ex = A.x - e.x;
            const ez = A.z - e.z;
            const el = Math.hypot(ex, ez) || 1;
            A.eatX = e.x + (ex / el) * e.r;
            A.eatZ = e.z + (ez / el) * e.r;
            this.setA('toEat');
            this.say('Allen', this.pick([`Ooh — the ${e.name.toLowerCase()}! Don't mind if I do.`, `Snack break. ${e.name}, come to papa.`, 'Fighting on an empty stomach? Never.']), 3);
            break;
          }
          A.hunger = 6;
        }
        A.decideT -= dt;
        if (A.decideT <= 0) {
          A.decideT = 0.3;
          // Wok Guard: he turtles up when pressured — flank him or crack it with a finisher
          if ((c.guard || A.phase >= 1) && A.cdGuard <= 0 && dist < 7.5 && (A.poise > A.poiseMax * 0.35 || this.rnd() < 0.22)) {
            this.setA('guard');
            this.sound('clang');
            this.floatText(A.x, 5.7, A.z, 'WOK GUARD!', 'info');
            if (!this.tips.has('guard')) {
              this.tips.add('guard');
              this.say('Rickley', "He's hidin' behind that wok! Roll round behind him — or crack it with a finisher or a Hog Charge!", 5.2);
            }
            break;
          }
          if (dist < 5.6 && A.cdSwipe <= 0) {
            A.swipes = 0;
            this.setA('swipeWind');
            break;
          }
          if (A.globalCd <= 0) {
            const opts: AState[] = [];
            if (dist > 5.2 && dist < 30 && A.cdSlam <= 0) opts.push('slamWind');
            if (c.throwN > 0 && dist > 6.5 && A.cdThrow <= 0) opts.push('throwWind');
            if (c.dash && dist > 8.5 && dist < 32 && A.cdDash <= 0) opts.push('dashWind');
            if (c.bots > 0 && A.cdSummon <= 0 && this.bots.length <= Math.floor(maxBots * 0.45)) opts.push('summon');
            if (c.rain && dist > 4.5 && A.cdRain <= 0) opts.push('rainCast');
            if (c.spin && (A.phase >= 1 || this.course >= 6) && dist < 15 && A.cdSpin <= 0) opts.push('spinWind');
            if (opts.length) {
              const s = this.pick(opts);
              A.globalCd = A.enraged ? 0.72 : 1.25;
              A.summoned = false;
              A.volleys = 0;
              this.setA(s);
              if (s === 'dashWind' || s === 'summon') this.sound('roar');
              if (s === 'rainCast') {
                A.rainLeft = 3 + A.phase;
                A.rainT = 0.5;
                this.sound('roar');
                this.floatText(A.x, 6, A.z, 'HOT POT RAIN!', 'hurt');
              }
              if (s === 'spinWind') {
                this.sound('roar');
                this.floatText(A.x, 6, A.z, 'SIZZLE SPIN!', 'hurt');
                if (!this.tips.has('spin')) {
                  this.tips.add('spin');
                  this.say('Kingger', "Do NOT touch him while he spins — he's invincible! Keep your distance and he'll get dizzy.", 5);
                }
              }
            }
          }
        }
        break;
      }
      case 'swipeWind': {
        if (A.t < 0.32 * tele) A.heading = angLerp(A.heading, toK, 7 * dt);
        if (A.t >= 0.55 * tele) {
          this.setA('swipe');
          this.sound('swing');
          const fx = Math.sin(A.heading);
          const fz = Math.cos(A.heading);
          const flip = A.swipes % 2 === 0 ? 1 : -1;
          this.fx.slash({
            x: A.x + fx * 1.1,
            y: A.y + 1.5,
            z: A.z + fz * 1.1,
            heading: A.heading,
            color: A.enraged ? 0xff4a24 : 0xff9a38,
            radius: 4.5,
            wide: true,
            tiltZ: 0.45 * flip,
            tiltX: 0.22,
            spin: 9 * flip,
            dur: 0.28,
            hdr: 3.8,
          });
          this.fx.sparks(A.x + fx * 3.6, 0.7, A.z + fz * 3.6, 14, 0xffb84d, 12, 0.16, 0.36, { dirX: fx, dirZ: fz, focus: 0.5, hdr: 3.8, altColor: 0xffffff });
          this.fx.dust(A.x + fx * 3.5, 0.25, A.z + fz * 3.5, 6, 0xe2d3b8, { spread: 0.9, speed: 5, rise: 1.8, size0: 0.65, size1: 2.3, life: 0.55 });
          // the wide claw sweep catches every pig in front of him
          for (const p of this.players) {
            const px = p.x - A.x;
            const pz = p.z - A.z;
            const pd = Math.hypot(px, pz) || 0.001;
            if (pd < 5.6 && (px * fx + pz * fz) / pd > 0.25 && p.y < 2.4) this.hurtPlayer(p, 14 * c.dmg, A.x, A.z, 15);
          }
          this.hitAlliesNear(A.x + fx * 2.8, A.z + fz * 2.8, 2.6, 10 * c.dmg);
        }
        break;
      }
      case 'swipe': {
        if (A.t >= 0.24) {
          if (c.doubleSwipe && A.swipes < 1 && dist < 8) {
            A.swipes++;
            this.setA('swipeWind');
            A.t = 0.22 * tele;
          } else {
            A.cdSwipe = 1.2;
            this.recover(0.75 * tele);
          }
        }
        break;
      }
      case 'slamWind': {
        A.heading = angLerp(A.heading, toK, 6 * dt);
        if (A.t >= 0.5 * tele) {
          A.sx = A.x;
          A.sz = A.z;
          let tx = k.x + k.vx * 0.25 - A.x;
          let tz = k.z + k.vz * 0.25 - A.z;
          const tl = Math.hypot(tx, tz) || 1;
          const m = Math.min(tl, 26);
          tx = A.x + (tx / tl) * m;
          tz = A.z + (tz / tl) * m;
          const r = this.resolve(tx, tz, 1.5);
          A.tx = clamp(r.x, -BOUND, BOUND);
          A.tz = clamp(r.z, -BOUND, BOUND);
          A.airDur = 0.9 * tele;
          this.setA('slamAir');
          this.sound('jump');
        }
        break;
      }
      case 'slamAir': {
        const p = Math.min(1, A.t / A.airDur);
        A.x = lerp(A.sx, A.tx, p);
        A.z = lerp(A.sz, A.tz, p);
        A.y = Math.sin(p * PI) * 7.5;
        if (p >= 1) {
          A.y = 0;
          this.addShake(0.9);
          this.sound('slam');
          this.fx.groundMark(A.x, 0, A.z, 5.4, 'crater', 0xff9442, 3.2);
          this.fx.shockWall(A.x, 0.08, A.z, A.enraged ? 0xff4a24 : 0xff822e, 1.8, 9.5, 1.0, 3.4, 0.48, 5);
          this.fx.dustRing(A.x, 0.08, A.z, 18, 2.0, 0xd9c29e, 12, 2.8, 0.88);
          this.fx.chunks(A.x, 0.35, A.z, 18, 0x8a6d4b, 14, 0.32, 0.78, 26, 0.85);
          this.fx.sparks(A.x, 0.6, A.z, 32, 0xff7a24, 16, 0.2, 0.55, { grav: 16, up: 0.75, hdr: 4.2, stretch: 4.8, altColor: 0xffe169 });
          this.fx.flash(A.x, 1.8, A.z, 0xff7a24, 16, 0.36, 17);
          this.hurtPlayersNear(A.x, A.z, 3.8, 2, 24 * c.dmg, A.x, A.z, 18);
          this.hitAlliesNear(A.x, A.z, 3.8, 16 * c.dmg);
          this.spawnShock(A.x, A.z, 15 + this.course, 19, true, 15 * c.dmg);
          A.cdSlam = 6.5;
          if (A.enraged && A.slamChain < 2) {
            A.slamChain++;
            this.setA('slamWind');
            A.t = 0.2 * tele;
          } else {
            A.slamChain = 0;
            this.recover(1.15 * tele);
          }
        }
        break;
      }
      case 'throwWind': {
        A.heading = angLerp(A.heading, toK, 8 * dt);
        if (A.t >= 0.6 * tele) {
          const n = c.throwN;
          const base = Math.atan2(k.x + k.vx * 0.35 - A.x, k.z + k.vz * 0.35 - A.z);
          const speed = 26 + this.course * 1.8;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.19;
            this.projs.push({
              id: this.id(),
              x: A.x + Math.sin(a) * 2,
              y: 1.1,
              z: A.z + Math.cos(a) * 2,
              vx: Math.sin(a) * speed,
              vy: 0,
              vz: Math.cos(a) * speed,
              life: 3.1,
              dmg: 11 * c.dmg,
              kind: 'chopstick',
            });
          }
          this.sound('throw');
          A.volleys++;
          if (A.volleys < c.volleys) A.t = 0.24 * tele;
          else {
            A.cdThrow = Math.max(3.4, 4.8 - this.course * 0.16);
            this.recover(0.44);
          }
        }
        break;
      }
      case 'dashWind': {
        if (A.t < 0.68 * tele) A.heading = angLerp(A.heading, toK, 8 * dt);
        if (A.t >= 0.95 * tele) {
          A.dashHits = [];
          this.setA('dash');
        }
        break;
      }
      case 'dash': {
        const hx = Math.sin(A.heading);
        const hz = Math.cos(A.heading);
        A.x += hx * 38 * dt;
        A.z += hz * 38 * dt;
        const r = this.resolve(A.x, A.z, 1.5);
        const cx = clamp(r.x, -BOUND, BOUND);
        const cz = clamp(r.z, -BOUND, BOUND);
        const blocked = r.hit || cx !== r.x || cz !== r.z;
        A.x = cx;
        A.z = cz;
        A.walk += dt * 40;
        if (this.rnd() < dt * 48) this.fx.chargeTrail(A.x, 0, A.z, hx, hz, 'boss');
        for (const p of this.players) {
          if (A.dashHits.includes(p.id) || Math.hypot(p.x - A.x, p.z - A.z) >= 2.9 || p.y >= 2.2) continue;
          if (this.hurtPlayer(p, 22 * c.dmg, A.x - hx, A.z - hz, 20)) A.dashHits.push(p.id);
        }
        this.hitAlliesNear(A.x + hx * 1.2, A.z + hz * 1.2, 2.6, 12 * c.dmg);
        if (blocked && A.t > 0.08) {
          A.cdDash = 9;
          this.addShake(1);
          this.sound('slam');
          const cx2 = A.x + hx * 1.4;
          const cz2 = A.z + hz * 1.4;
          this.fx.hitBurst(cx2, 2.2, cz2, 0xffd23f, 2.1, -hx, -hz);
          this.fx.shockWall(A.x, 0.08, A.z, 0xffb347, 1.2, 7.2, 1.0, 3.2, 0.42, 7);
          this.fx.groundMark(A.x, 0, A.z, 4.4, 'crater', 0xffaa4d, 2.6);
          this.fx.dustRing(A.x, 0.1, A.z, 14, 1.2, 0xdfd0b5, 9.5, 2.4, 0.78);
          this.floatText(A.x, 5.8, A.z, 'CRASH!', 'crit');
          this.damageAllen(18 + 5 * this.course, 0);
          if (A.hp > 0) this.stunAllen(2.5, true);
        } else if (A.t >= 0.8) {
          A.cdDash = 9;
          this.recover(0.9 * tele);
        }
        break;
      }
      case 'summon': {
        if (!A.summoned && A.t >= 0.45) {
          A.summoned = true;
          this.spawnBots(Math.max(1, c.bots - 1) + Math.floor((this.players.length - 1) / 3));
          this.say(
            'Allen',
            this.pick([
              'Kitchen brigade — ORDER UP!',
              'Sous-chefs, tenderize that pork!',
              'Turn up the heat! Not a single hog leaves!',
              'Bring the skewers, the sauce, AND the mallet!',
            ]),
            2.8,
          );
        }
        if (A.t >= 0.88) {
          A.cdSummon = c.waveCd;
          this.setA('chase');
        }
        break;
      }
      case 'toEat': {
        const e = this.edibles[A.target];
        if (!e || e.hp <= 0) {
          A.hunger = 4;
          this.setA('chase');
          break;
        }
        this.moveAllen(A.eatX, A.eatZ, spd * 1.2, dt, true);
        const de = Math.hypot(A.eatX - A.x, A.eatZ - A.z);
        if (de < 1.6 || Math.hypot(e.x - A.x, e.z - A.z) < e.r + 0.8) {
          A.chompT = 0;
          this.setA('eating');
          const who = this.players.length > 1 ? 'hogs' : 'Kenji';
          this.say('Rickley', this.pick([`He's in the ${e.name.toLowerCase()}! Stop 'im, ${who}!`, `Not my ${e.name.toLowerCase()}!`, `${who === 'hogs' ? 'Hogs' : 'Kenji'}! The ${e.name.toLowerCase()}!`]), 3);
        } else if (A.t > 9) {
          A.hunger = 5;
          this.setA('chase');
        }
        break;
      }
      case 'eating': {
        const e = this.edibles[A.target];
        // a person playing Allen stops eating by walking off
        if (!e || (ctl && Math.hypot(ctl.mx, ctl.mz) > 0.3)) {
          A.target = -1;
          this.setA('chase');
          break;
        }
        A.heading = angLerp(A.heading, Math.atan2(e.x - A.x, e.z - A.z), 6 * dt);
        e.hp = Math.max(0, e.hp - c.eatRate * dt);
        this.refreshEdible(e);
        A.chompT -= dt;
        if (A.chompT <= 0) {
          A.chompT = 0.26;
          this.sound('chomp');
          const fx = Math.sin(A.heading);
          const fz = Math.cos(A.heading);
          this.fx.emit(A.x + fx * 1.8, 3.2, A.z + fz * 1.8, 4, e.crumb, 5, 0.22, 0.6);
        }
        if (this.farmPct() <= 0.01) this.gameOver('farm');
        if (e.hp <= 0) {
          A.hunger = c.hunger;
          A.target = -1;
          this.floatText(e.x, 3, e.z, `${e.name.toUpperCase()} EATEN!`, 'hurt');
          this.say('Allen', this.pick(['*BURP* …needs salt.', 'Delicious. Now for the protein.', 'A fine side dish. Where is my main?']), 3);
          this.recover(0.9);
        } else if (A.t > 6) {
          A.hunger = c.hunger * 0.8;
          A.target = -1;
          this.setA('chase');
        }
        break;
      }
      case 'shielded': {
        // invincible: hovers inside the Sauce Shield and rains dumplings until the jars are smashed
        A.heading = angLerp(A.heading, toK, 4 * dt);
        A.y = lerp(A.y, 1.3 + Math.sin(this.time * 2.4) * 0.22, 1 - Math.exp(-4 * dt));
        A.shieldT -= dt;
        A.rainT -= dt;
        if (A.rainT <= 0 && !kDead) {
          A.rainT = Math.max(0.9, 1.75 - this.course * 0.17);
          // each dumpling hunts a random pig so the whole herd has to keep moving
          const alive = this.living();
          const v = this.pick(alive);
          this.spawnRain(v.x + v.vx * 0.45, v.z + v.vz * 0.45, 14 * c.dmg, tele);
          if (this.course >= 2 && this.rnd() < 0.55) {
            const a = this.rnd() * TAU;
            this.spawnRain(v.x + Math.cos(a) * 5.5, v.z + Math.sin(a) * 5.5, 14 * c.dmg, tele);
          }
        }
        if (this.pots.length === 0) this.breakShield(true);
        else if (A.shieldT <= 0) this.breakShield(false);
        break;
      }
      case 'guard': {
        // he can only turn slowly behind the wok, so a quick roll gets behind him
        A.heading += clamp(angDiff(A.heading, toK), -1.5 * dt, 1.5 * dt);
        if (A.t >= 2.5) {
          A.cdGuard = Math.max(5, 9 - A.phase);
          A.swipes = 0;
          this.setA('swipeWind');
          A.t = 0.3 * tele;
        }
        break;
      }
      case 'rainCast': {
        A.heading = angLerp(A.heading, toK, 5 * dt);
        A.rainT -= dt;
        if (A.rainLeft > 0 && A.rainT <= 0 && !kDead) {
          A.rainLeft--;
          A.rainT = 0.34;
          const j = A.rainLeft % 2 ? 3 : 0;
          const a = this.rnd() * TAU;
          const v: { x: number; z: number; vx: number; vz: number } = this.players.length > 1 && !ctl ? this.pick(this.living()) : k;
          this.spawnRain(v.x + v.vx * 0.5 + Math.cos(a) * j, v.z + v.vz * 0.5 + Math.sin(a) * j, 14 * c.dmg, tele);
        }
        if ((A.rainLeft <= 0 && A.t >= 1.2) || A.t > 5) {
          A.cdRain = 11;
          this.recover(0.7 * tele);
        }
        break;
      }
      case 'spinWind': {
        A.heading = angLerp(A.heading, toK, 6 * dt);
        if (A.t >= 0.85 * tele) {
          A.spinHits = {};
          this.setA('spin');
          this.sound('swing');
        }
        break;
      }
      case 'spin': {
        // invincible whirl that chases the target, then leaves Allen dizzy
        A.heading = angLerp(A.heading, toK, 2.2 * dt);
        const sp = 8.4 + this.course * 0.3;
        A.x += Math.sin(A.heading) * sp * dt;
        A.z += Math.cos(A.heading) * sp * dt;
        const r = this.resolve(A.x, A.z, 1.5);
        A.x = clamp(r.x, -BOUND, BOUND);
        A.z = clamp(r.z, -BOUND, BOUND);
        A.walk += dt * 30;
        A.spinRibbonT -= dt;
        if (A.spinRibbonT <= 0) {
          A.spinRibbonT = 0.12;
          this.fx.slash({ x: A.x, y: 1.3 + this.rand(0, 1.5), z: A.z, heading: this.rnd() * TAU, color: 0xff7a24, radius: 4.1, full: true, tiltZ: this.rand(-0.22, 0.22), spin: 22, dur: 0.22, rise: 1.5, hdr: 3.6 });
        }
        if (this.rnd() < dt * 36) {
          this.fx.sparks(A.x, 1.2 + this.rnd() * 2, A.z, 2, 0xff9a2e, 11, 0.16, 0.32, { grav: 6, hdr: 3.8, altColor: 0xffe169 });
          this.fx.dust(A.x, 0.25, A.z, 1, 0xdcc9ab, { spread: 1.6, speed: 5.5, rise: 1.6, size0: 0.65, size1: 2.2, life: 0.48 });
        }
        for (const p of this.players) {
          if ((A.spinHits[p.id] ?? 0) > 0 || p.y >= 2.6 || Math.hypot(p.x - A.x, p.z - A.z) >= 3.9) continue;
          if (this.hurtPlayer(p, 16 * c.dmg, A.x, A.z, 19)) A.spinHits[p.id] = 0.5;
        }
        this.hitAlliesNear(A.x, A.z, 3.6, 8 * c.dmg);
        if (A.t >= 2.6) {
          A.cdSpin = 15;
          A.poise = 0;
          this.setA('stunned');
          A.stunDur = 2.4;
          this.sound('stun');
          this.floatText(A.x, 5.8, A.z, 'DIZZY!', 'crit');
        }
        break;
      }
      case 'recover': {
        if (A.t >= A.recoverDur) this.setA('chase');
        break;
      }
      case 'stunned': {
        if (A.t >= A.stunDur) {
          A.stunImmune = STUN_IMMUNITY;
          A.globalCd = 0.45;
          this.setA('chase');
          if (A.tiltQueued) {
            // Smash Battles: he comes out of it furious
            A.tiltQueued = false;
            A.tilt = 15;
            this.sound('roar');
            this.addShake(0.5);
            this.floatText(A.x, 6.2, A.z, 'TILTED!', 'hurt');
            this.say('Allen', this.pick(['Who even PLAYS Smash Battles anymore?!', 'That combo was NOT fair!', 'Rematch. RIGHT NOW.']), 3);
            this.fx.shockWall(A.x, 0.1, A.z, 0xff3b30, 1, 6, 1, 3, 0.45, 6);
            this.dirty = true;
          }
        }
        break;
      }
      case 'backrooms': {
        // noclipped out of the farm: back through the gate when he finds his way out
        A.backroomsT -= dt;
        if (A.backroomsT <= 0) {
          A.x = 0;
          A.z = 64;
          A.y = 0;
          A.heading = PI;
          this.setA('enter');
          this.say('Allen', this.pick(['Endless yellow rooms… buzzing lights… I NEED A SNACK.', 'I was in there for YEARS. Probably.', 'Never. Again.']), 3.2);
          this.dirty = true;
        }
        break;
      }
      case 'defeated': {
        if (A.t >= 1.6) {
          if (this.course >= FINALE) this.setA('ko');
          else if (this.course >= COURSES.length - 1) this.setA('calling');
          else {
            A.sx = A.x;
            A.sz = A.z;
            this.setA('leaving');
            this.sound('jump');
          }
        }
        break;
      }
      case 'leaving': {
        const p = Math.min(1, A.t / 1.7);
        A.x = lerp(A.sx, 0, p);
        A.z = lerp(A.sz, 74, p);
        A.y = Math.sin(p * PI) * 16;
        A.heading += dt * 14;
        if (p >= 1) this.endCourse();
        break;
      }
      case 'calling': {
        this.updateBackupCall(A.t - dt, A.t);
        break;
      }
      case 'ko': {
        // in the finale, the farm is only safe once Earwhen is down too
        if (A.t >= 3.4 && !this.outcome && !this.earwhen()) {
          this.outcome = 'victory';
          this.sound('win');
          this.dirty = true;
        }
        break;
      }
      default:
        break;
    }
  }

  /* ───────────────────────── minions + projectiles ───────────────────────── */

  private alertPathGuppy(b: PathGuppy) {
    b.behavior = 'chasing';
    b.mt = 0;
    b.bite = 0.35;
    this.sound('hiss');
    this.say('Path Guppy', 'My path. My truffles!', 2.6);
  }

  private movePathGuppy(b: PathGuppy, x: number, z: number, speed: number, dt: number) {
    const heading = Math.atan2(x - b.x, z - b.z);
    const step = speed * dt;
    for (const offset of [0, 0.55 * b.strafe, -0.55 * b.strafe, 1.2 * b.strafe, -1.2 * b.strafe, 1.8 * b.strafe, -1.8 * b.strafe]) {
      const a = heading + offset;
      const vx = Math.sin(a) * step;
      const vz = Math.cos(a) * step;
      if (this.resolve(b.x + vx * 2, b.z + vz * 2, b.rad).hit) continue;
      b.x += vx;
      b.z += vz;
      b.heading = angLerp(b.heading, a, dt * 11);
      if (offset !== 0) b.strafe = Math.sign(offset);
      return true;
    }
    b.strafe *= -1;
    return false;
  }

  private updatePathGuppy(b: PathGuppy, dt: number) {
    // guards his path against whichever pig is nearest
    const k = this.nearestPlayer(b.x, b.z) ?? this.players[0];
    const playable = !!k && k.action !== 'dead' && !this.overReason;
    const toKenji = k ? Math.hypot(k.x - b.x, k.z - b.z) : Infinity;
    const outOfTerritory = k ? Math.hypot(k.x - GUPPY_END.x, k.z - GUPPY_END.z) > GUPPY_TERRITORY : true;
    let moving = false;
    let swing = 0;
    b.mt += dt;

    if (playable && k) {
      if (b.behavior === 'waiting' && toKenji <= GUPPY_ALERT_RANGE) this.alertPathGuppy(b);
      if (b.behavior !== 'waiting' && b.behavior !== 'returning' && outOfTerritory) {
        b.behavior = 'returning';
        b.mt = 0;
      }

      if (b.stun <= 0) {
        if (b.behavior === 'returning') {
          if (toKenji < GUPPY_ALERT_RANGE && !outOfTerritory) {
            b.behavior = 'chasing';
          } else if (Math.hypot(b.x - GUPPY_END.x, b.z - GUPPY_END.z) < 0.55 || (b.mt > 8 && outOfTerritory && toKenji > 16)) {
            b.x = GUPPY_END.x;
            b.z = GUPPY_END.z;
            b.heading = 0.22;
            b.behavior = 'waiting';
          } else {
            moving = this.movePathGuppy(b, GUPPY_END.x, GUPPY_END.z, 6.8, dt);
          }
        } else if (b.behavior === 'chasing') {
          const a = Math.atan2(k.x - b.x, k.z - b.z);
          b.heading = angLerp(b.heading, a, dt * 12);
          if (toKenji <= 2.75 && b.bite <= 0) {
            b.behavior = 'windup';
            b.mt = 0;
            b.heading = a;
            this.sound('roll');
          } else if (toKenji > 1.75) {
            moving = this.movePathGuppy(b, k.x, k.z, 8.5, dt);
          }
        } else if (b.behavior === 'windup') {
          const fx = Math.sin(b.heading);
          const fz = Math.cos(b.heading);
          const x = b.x + fx * GUPPY_SWING.offset;
          const z = b.z + fz * GUPPY_SWING.offset;
          const progress = clamp(b.mt / GUPPY_SWING.windup, 0, 1);
          swing = -2.2 * Math.pow(progress, 0.7);
          if (progress >= 1) {
            b.behavior = 'recovering';
            b.mt = 0;
            b.bite = 0.95;
            this.sound('swing');
            this.fx.slash({ x: b.x, y: 1.07, z: b.z, heading: b.heading, color: 0xf4b962, radius: 2.95, wide: true, tiltZ: -0.32, spin: 8, dur: 0.26, hdr: 2.5 });
            this.hurtPlayersNear(x, z, GUPPY_SWING.radius, 1.4, 18, b.x, b.z, 11);
          }
        } else if (b.behavior === 'recovering') {
          swing = 0.8 * (1 - clamp(b.mt / 0.57, 0, 1));
          if (b.mt >= 0.57) b.behavior = 'chasing';
        }
      }
    }

    const r = this.resolve(b.x, b.z, b.rad);
    b.x = clamp(r.x, -FOREST_BOUND + b.rad, FOREST_BOUND - b.rad);
    b.z = clamp(r.z, -FOREST_BOUND + b.rad, FOREST_BOUND - b.rad);
    b.ph += moving ? dt * 13 : 0;
    b.moving = moving;
    b.swing = swing;
  }

  private dropGuppyTruffles(b: PathGuppy) {
    for (let i = 0; i < GUPPY_DROPS; i++) {
      const turn = (i * TAU) / GUPPY_DROPS;
      const p = this.safePosition(b.x + 1.4 * Math.sin(turn), b.z + 1.4 * Math.cos(turn), 0.4);
      this.spawnTruffle(p.x, p.z, true);
    }
    this.fx.sparks(b.x, 1.4, b.z, 24, 0xf3bd59, 9, 0.18, 0.65, { altColor: 0xd1ebad });
    this.fx.dust(b.x, 0.4, b.z, 7, 0xbfa679);
    this.sound('pop');
    this.sound('truffle');
    this.forestHint = 'Path Guppy is defeated. Pick up the truffles marked in gold.';
    this.say(this.players.length > 1 ? 'Rickley' : 'Kenji', `Path Guppy dropped ${GUPPY_DROPS} truffles. Better pick them up!`, 4);
  }

  private damageBot(b: Bot, dmg: number, kx: number, kz: number, heavy = false) {
    if (b.hp <= 0) return;
    if (b.kind === 'earwhen') {
      this.hitEarwhen(b, dmg, kx, kz, heavy);
      return;
    }
    const d = Math.max(1, Math.round(dmg));
    b.hp -= d;
    b.flash = 0.12;
    this.stats.dealt += Math.min(d, Math.max(0, Math.ceil(b.hp + d)));
    if (b.kind === 'guppy' && b.mode === 'lunge' && b.hp > 0) {
      this.floatText(b.x, 3.4, b.z, String(d), heavy ? 'crit' : 'dmg');
      this.fx.hitBurst(b.x, 1.72, b.z, 0xf4b962, 0.78);
      this.guppyVanish(b, true);
      return;
    }
    if (b.kind === 'guppy') {
      if (b.hp <= 0) {
        this.stats.ko++;
        this.bots = this.bots.filter((o) => o !== b);
        this.dropGuppyTruffles(b);
      } else {
        if (b.behavior === 'waiting' || b.behavior === 'returning') this.alertPathGuppy(b);
        b.kx = kx * 0.56;
        b.kz = kz * 0.56;
        if (heavy || b.behavior !== 'windup') b.stun = Math.max(b.stun, heavy ? 0.34 : 0.16);
        if (heavy && b.behavior === 'windup') {
          b.behavior = 'recovering';
          b.mt = 0;
          b.bite = 1.0;
        }
        this.floatText(b.x, 3.4, b.z, String(d), heavy ? 'crit' : 'dmg');
        this.fx.hitBurst(b.x, 1.72, b.z, 0xf4b962, 0.78);
      }
      return;
    }
    // Tenderizer Brutes have heavy butcher-block armor that shrugs off light knockback & flinch
    const kbMul = b.kind === 'tenderizer' ? 0.32 : b.kind === 'bomber' && b.mode === 'fuse' ? 1.45 : 1;
    b.kx = kx * kbMul;
    b.kz = kz * kbMul;
    if (b.kind !== 'tenderizer' || heavy) {
      if (b.mode !== 'fuse') b.stun = Math.max(b.stun, b.kind === 'tenderizer' ? 0.25 : 0.35);
      if (b.kind === 'tenderizer' && heavy && b.mode === 'wind') {
        b.mode = 'idle';
        b.bite = 1.4;
      }
    }
    this.floatText(b.x + this.rand(-0.35, 0.35), b.kind === 'tenderizer' ? 3.2 : 2.1, b.z, String(d), heavy ? 'crit' : 'dmg');
    this.fx.hitBurst(b.x, b.kind === 'tenderizer' ? 1.6 : 1.05, b.z, 0xff9a2e, 0.8);
    if (b.hp <= 0) {
      this.stats.ko++;
      this.bots = this.bots.filter((o) => o !== b);
      // Killing a lit Kettle Bomber still pops a smaller blast that damages nearby enemies (not Kenji if sniped!)
      if (b.kind === 'bomber' && b.mode === 'fuse') {
        this.fx.hitBurst(b.x, 1.2, b.z, 0xff4a1f, 1.9);
        this.fx.shockWall(b.x, 0.08, b.z, 0xff6a1f, 0.8, 4.6, 0.8, 2.8, 0.38, 10);
        this.fx.groundMark(b.x, 0, b.z, 3.6, 'crater', 0xff7a2e, 2.2);
        this.sound('slam');
        for (const o of [...this.bots]) {
          if (Math.hypot(o.x - b.x, o.z - b.z) < 4.4) this.damageBot(o, 45, (o.x - b.x) * 4, (o.z - b.z) * 4, true);
        }
        this.hitPots(b.x, b.z, 4.4, 42);
      } else {
        const col = b.kind === 'spitter' ? 0xff3b1f : 0xff6a1a;
        this.fx.hitBurst(b.x, 1.15, b.z, col, b.kind === 'tenderizer' ? 1.9 : 1.45);
        this.fx.shockWall(b.x, 0.08, b.z, col, 0.6, b.kind === 'tenderizer' ? 4.8 : 3.6, 0.5, 2.2, 0.32, 9);
        this.fx.chunks(b.x, 1.0, b.z, 14, b.kind === 'spitter' ? 0xd9251d : b.kind === 'tenderizer' ? 0xc6935a : 0x2f3138, 10, 0.28, 0.7);
        this.fx.dust(b.x, 0.6, b.z, 7, 0x5c524a, { spread: 0.5, speed: 4.5, rise: 2.8, size0: 0.6, size1: 2.3, life: 0.68 });
        this.sound('pop');
      }
      this.spawnTruffle(b.x, b.z, true);
      if (b.kind === 'tenderizer') this.spawnTruffle(b.x, b.z, true);
    }
  }

  /* ───────────────────────── Earwhen (the finale) ───────────────────────── */

  /** Earwhen, if he's on the farm. */
  earwhen(): EarwhenBot | null {
    for (const b of this.bots) if (b.kind === 'earwhen' && b.hp > 0) return b;
    return null;
  }

  /** Earwhen leaps over the fence from (fx, fz) and lands at (tx, tz). */
  private spawnEarwhen(fx: number, fz: number, tx: number, tz: number) {
    this.bots = this.bots.filter((b) => b.kind !== 'earwhen');
    const hp = Math.round(EARWHEN.hp * this.hpScale());
    this.bots.push({
      id: this.id(),
      kind: 'earwhen',
      act: 'arrive',
      x: fx, z: fz, hp, maxHp: hp, rad: 1.5, heading: Math.atan2(tx - fx, tz - fz),
      bite: 1.5, stun: 0, kx: 0, kz: 0, chomp: 0, flash: 0, ph: 0,
      mode: 'idle', mt: 0, lx: fx, lz: fz, strafe: this.rnd() < 0.5 ? -1 : 1, hop: 0, moving: false, swing: 0,
      aim: Math.atan2(tx - fx, tz - fz), cdSpray: 1.5, cdStream: 3, cdBlob: 5, hunger: EARWHEN.hunger, target: -1, shots: 0, poise: 0,
      tx, tz, rage: false,
    });
    this.sound('jump');
  }

  /**
   * The story moment after the Grand Feast: Allen, furious, phones Earwhen, who leaps in over the fence.
   * `was` and `now` are Allen's state clock before and after this step, so each line fires once.
   */
  private updateBackupCall(was: number, now: number) {
    const A = this.A;
    const at = (t: number) => was < t && now >= t;
    A.y = 0;
    if (at(0.05)) {
      // turn to face into the farm, with the gate (and Earwhen's leap) behind him
      A.heading = PI;
      this.sound('roar');
      this.addShake(0.6);
      this.fx.shockWall(A.x, 0.1, A.z, 0xff5a1a, 1, 8, 0.8, 3, 0.6, 5);
      this.say('Allen', "No. NO! I am NOT trying the tofu!", 2.4);
    }
    if (at(2.5)) {
      this.sound('pop');
      this.say('Allen', "*dials* Earwhen? It's me. Bring the cream cannon. The BIG one.", 3.2);
    }
    if (at(4.6)) {
      const tx = clamp(A.x + 4.5, -BOUND + 4, BOUND - 4);
      const tz = clamp(A.z - 2, -BOUND + 4, 52);
      this.spawnEarwhen(tx + 2, 78, tx, tz);
    }
    if (at(6.3)) this.say('Earwhen', 'Did somebody say… DINNER?', 3);
    if (at(8.6)) this.say('Allen', "Next course, bacon. You're getting WHIPPED.", 3);
    if (now >= 10.6) this.endCourse();
  }

  private hitEarwhen(b: EarwhenBot, dmg: number, kx: number, kz: number, heavy: boolean) {
    // untouchable while he's leaping in, and during the story moment
    if (b.act === 'arrive' || this.A.state === 'calling') return;
    const d = Math.max(1, Math.round(dmg));
    b.hp -= d;
    b.flash = 0.12;
    this.stats.dealt += Math.min(d, Math.max(0, Math.ceil(b.hp + d)));
    b.kx = kx * 0.12;
    b.kz = kz * 0.12;
    this.floatText(b.x + this.rand(-0.4, 0.4), 4.4, b.z, String(d), heavy ? 'crit' : 'dmg');
    this.fx.hitBurst(b.x, 2.6, b.z, 0xfff1d6, 1.1);
    if (b.hp <= 0) {
      this.earwhenDown(b);
      return;
    }
    // enough punishment staggers him, even mid-attack
    b.poise += d * (heavy ? 1.5 : 1);
    const poiseMax = 300 * (1 + 0.25 * Math.max(0, this.players.length - 1));
    if (b.poise >= poiseMax && b.act !== 'stagger') {
      b.poise = 0;
      b.act = 'stagger';
      b.mt = 0;
      b.target = -1;
      this.sound('stun');
      this.floatText(b.x, 5.2, b.z, 'STAGGERED!', 'crit');
      this.fx.sparks(b.x, 4.4, b.z, 16, 0xffd23f, 6, 0.15, 0.7, { up: 1, grav: 4, hdr: 3 });
    }
  }

  private earwhenDown(b: EarwhenBot) {
    this.bots = this.bots.filter((o) => o !== b);
    this.stats.ko++;
    this.sound('bighit');
    this.sound('splash');
    this.hitstop = 0.25;
    this.addShake(1);
    this.fx.hitBurst(b.x, 2.6, b.z, 0xfffaf0, 2.4);
    this.fx.shockWall(b.x, 0.1, b.z, 0xfffaf0, 1.6, 11, 1.2, 4, 0.6, 5);
    this.fx.sparks(b.x, 3, b.z, 50, 0xfffaf0, 14, 0.22, 0.9, { up: 1, grav: 12, hdr: 1.3, altColor: 0xffd23f });
    this.fx.groundMark(b.x, 0, b.z, 4.5, 'splash', 0xfffaf0, 4);
    for (let i = 0; i < 5; i++) this.spawnTruffle(b.x, b.z, true);
    this.say('Earwhen', 'My… cream… has… curdled…', 3.6);
    const A = this.A;
    if (A.state === 'ko') {
      A.t = 0; // the farm is saved a moment from now
      this.showBanner('EARWHEN IS DOWN', 'The feast is finally over');
    } else if (A.active && A.hp > 0) {
      A.tilt = Math.max(A.tilt, 12);
      this.showBanner('EARWHEN IS DOWN', 'Just Allen left, and he is LIVID');
      this.say('Allen', 'EARWHEN! …Fine. I will eat you MYSELF!', 3.6);
    }
    this.dirty = true;
  }

  /** A Mega Dollop lands: a big white splash, and a cream puddle left behind. */
  private creamSplash(x: number, z: number, dmg: number) {
    const R = 3.6;
    this.sound('splash');
    this.addShake(0.4);
    this.fx.hitBurst(x, 0.8, z, 0xfffaf0, 1.6);
    this.fx.shockWall(x, 0.08, z, 0xfffaf0, 0.8, R * 1.1, 0.9, 2.6, 0.45, 6);
    this.fx.sparks(x, 0.6, z, 26, 0xfffaf0, 10, 0.2, 0.6, { up: 1, grav: 16, hdr: 1.2 });
    this.fx.groundMark(x, 0, z, R, 'splash', 0xfffaf0, 3);
    this.hurtPlayersNear(x, z, R, 2.4, dmg, x, z, 14);
    this.hitAlliesNear(x, z, R, dmg * 0.9);
    this.spawnPuddle(x, z, dmg * 0.22, true);
  }

  private updateEarwhen(b: EarwhenBot, dt: number) {
    const A = this.A;
    b.mt += dt;
    b.chomp = Math.max(0, b.chomp - dt);
    if (b.act === 'arrive') {
      const p = Math.min(1, b.mt / 1.3);
      b.x = lerp(b.lx, b.tx, p);
      b.z = lerp(b.lz, b.tz, p);
      b.hop = Math.sin(p * PI) * 11;
      b.heading = Math.atan2(b.tx - b.lx, b.tz - b.lz);
      b.aim = b.heading;
      if (p >= 1) {
        b.hop = 0;
        b.act = 'stalk';
        b.mt = 0;
        this.sound('slam');
        this.addShake(0.8);
        this.fx.dustRing(b.x, 0.1, b.z, 16, 1.4, 0xe8d9be, 9, 2.4, 0.8);
        this.fx.shockWall(b.x, 0.1, b.z, 0xfffaf0, 1, 7, 0.8, 2.6, 0.5, 5);
        this.fx.sparks(b.x, 1, b.z, 30, 0xfffaf0, 10, 0.2, 0.7, { up: 1, grav: 14, hdr: 1.2 });
        if (A.state !== 'calling') this.hurtPlayersNear(b.x, b.z, 3.4, 1.5, 12 * EARWHEN.dmg, b.x, b.z, 14);
      }
      return;
    }
    b.hop = 0;
    b.moving = false;
    // during the story moment he just poses next to Allen
    if (A.state === 'calling') {
      b.heading = angLerp(b.heading, PI, 3 * dt);
      b.aim = b.heading;
      return;
    }
    const rage = b.rage ? 0.7 : 1;
    const dm = EARWHEN.dmg * (b.rage ? 1.2 : 1);
    b.cdSpray -= dt;
    b.cdStream -= dt;
    b.cdBlob -= dt;
    b.hunger -= dt;
    const anyAlive = this.living().length > 0;
    if (!anyAlive || this.overReason || this.mode !== 'combat') return;
    // stuns barely slow him down
    b.stun = Math.min(b.stun, 0.5);
    if (b.stun > 0) return;
    const tgt = this.pickBotTarget(b, 0.95);
    const dx = tgt.x - b.x;
    const dz = tgt.z - b.z;
    const d = Math.hypot(dx, dz) || 0.001;
    const toT = Math.atan2(dx, dz);
    const nozzle = () => ({ x: b.x + Math.sin(b.aim) * 2.1, z: b.z + Math.cos(b.aim) * 2.1 });
    const walk = (mx: number, mz: number, sp: number) => {
      const l = Math.hypot(mx, mz);
      if (l < 0.01) return;
      b.x += (mx / l) * sp * dt;
      b.z += (mz / l) * sp * dt;
      b.moving = true;
      b.ph += dt * sp * 1.1;
    };

    switch (b.act) {
      case 'stagger': {
        if (b.mt >= 1.8) {
          b.act = 'stalk';
          b.mt = 0;
          b.bite = 0.6;
        }
        break;
      }
      case 'stalk': {
        b.heading = angLerp(b.heading, toT, 6 * dt);
        b.aim = angLerp(b.aim, toT, 6 * dt);
        // keeps to mid-range, circling
        if (d > 10) walk(dx, dz, EARWHEN.speed);
        else if (d < 5) walk(-dx, -dz, EARWHEN.speed * 0.8);
        else walk(-dz * b.strafe, dx * b.strafe, EARWHEN.speed * 0.6);
        if (this.rnd() < dt * 0.04 && !this.subtitle)
          this.say('Earwhen', this.pick(['Hold still, I need to frost you.', 'Extra cream? Extra cream.', 'You smell like a pork bun.', 'Allen said you were crunchy.']), 2.8);
        if (b.hunger <= 0) {
          let best = -1;
          let bd = Infinity;
          this.edibles.forEach((e, i) => {
            const ed = Math.hypot(e.x - b.x, e.z - b.z);
            if (e.hp > 0 && ed < bd) {
              bd = ed;
              best = i;
            }
          });
          if (best >= 0) {
            b.target = best;
            b.act = 'toEat';
            b.mt = 0;
            this.say('Earwhen', this.pick(['Hang on. Snack break.', 'Is that… a pie?', 'All this spraying makes me hungry.']), 2.6);
            break;
          }
          b.hunger = EARWHEN.hunger;
        }
        if (b.bite > 0) break;
        // whichever attack in range has been waiting longest (point-blank, he favours the spray)
        const opts: ['spray' | 'stream' | 'blob', number][] = [];
        if (d < 10 && b.cdSpray <= 0) opts.push(['spray', b.cdSpray - (d < 6 ? 2 : 0)]);
        if (d < 22 && b.cdStream <= 0) opts.push(['stream', b.cdStream]);
        if (d < 26 && b.cdBlob <= 0) opts.push(['blob', b.cdBlob]);
        if (!opts.length) break;
        opts.sort((x, y) => x[1] - y[1]);
        const pick = opts[0][0];
        b.mt = 0;
        b.shots = 0;
        if (pick === 'spray') {
          b.act = 'sprayWind';
          this.sound('hiss');
          this.floatText(b.x, 5, b.z, 'CREAM SPRAY!', 'hurt');
        } else if (pick === 'stream') {
          b.act = 'streamWind';
          this.sound('clang');
          this.floatText(b.x, 5, b.z, 'CREAM STREAM!', 'hurt');
        } else {
          b.act = 'blobWind';
          this.sound('hiss');
          this.floatText(b.x, 5, b.z, 'MEGA DOLLOP!', 'hurt');
        }
        break;
      }
      case 'sprayWind': {
        b.heading = angLerp(b.heading, toT, 8 * dt);
        b.aim = angLerp(b.aim, toT, 8 * dt);
        const n = nozzle();
        if (this.rnd() < dt * 20) this.fx.sparks(n.x, 2.1, n.z, 1, 0xfffaf0, 2, 0.12, 0.3, { up: 1, grav: -2, hdr: 1.2 });
        if (b.mt >= 0.65 * rage + 0.15) {
          b.act = 'spray';
          b.mt = 0;
          b.shots = 0;
          this.sound('hiss');
        }
        break;
      }
      case 'spray': {
        // the wide one: a cone of cream that sweeps slowly after you
        b.aim = angLerp(b.aim, toT, 1.5 * dt);
        b.heading = b.aim;
        const n = nozzle();
        const fx = Math.sin(b.aim);
        const fz = Math.cos(b.aim);
        if (this.rnd() < dt * 26) this.fx.sparks(n.x, 2.0, n.z, 4, 0xfffaf0, 16, 0.24, 0.5, { dirX: fx, dirZ: fz, focus: 0.5, grav: 7, hdr: 1.2, altColor: 0xfff0d0 });
        const tick = Math.floor(b.mt / 0.22);
        if (tick !== b.shots) {
          b.shots = tick;
          const R = 9.5;
          const HALF = 0.55;
          for (const p of this.players) {
            const px = p.x - b.x;
            const pz = p.z - b.z;
            const pd = Math.hypot(px, pz);
            if (pd > R || p.y > 2.6) continue;
            const off = Math.abs(Math.atan2(Math.sin(Math.atan2(px, pz) - b.aim), Math.cos(Math.atan2(px, pz) - b.aim)));
            if (off < HALF) this.hurtPlayer(p, 4.2 * dm, b.x, b.z, 6);
          }
          for (const a of this.allies) {
            if (a.dying > 0 || a.hp <= 0) continue;
            const ax = a.x - b.x;
            const az = a.z - b.z;
            const off = Math.abs(Math.atan2(Math.sin(Math.atan2(ax, az) - b.aim), Math.cos(Math.atan2(ax, az) - b.aim)));
            if (Math.hypot(ax, az) < R && off < HALF) this.hurtAlly(a, 3.6 * dm);
          }
        }
        if (b.mt >= 1.5) {
          b.act = 'stalk';
          b.mt = 0;
          b.cdSpray = 6.5 * rage;
          b.bite = 1.1 * rage;
        }
        break;
      }
      case 'streamWind': {
        b.heading = angLerp(b.heading, toT, 8 * dt);
        b.aim = angLerp(b.aim, toT, 8 * dt);
        if (b.mt >= 0.45 * rage + 0.1) {
          b.act = 'stream';
          b.mt = 0;
          b.shots = 0;
        }
        break;
      }
      case 'stream': {
        // the middle one: a rapid line of cream pellets, leading his target
        const pk = tgt.player;
        const ax = pk ? pk.x + pk.vx * 0.25 : tgt.x;
        const az = pk ? pk.z + pk.vz * 0.25 : tgt.z;
        b.aim = angLerp(b.aim, Math.atan2(ax - b.x, az - b.z), 5 * dt);
        b.heading = b.aim;
        const due = Math.floor(b.mt / 0.11);
        if (due > b.shots && b.shots < 12) {
          b.shots++;
          const n = nozzle();
          const spread = this.rand(-0.05, 0.05);
          const sp = 26;
          this.projs.push({
            id: this.id(), x: n.x, y: 1.7, z: n.z,
            vx: Math.sin(b.aim + spread) * sp, vy: 0, vz: Math.cos(b.aim + spread) * sp,
            life: 1.1, dmg: 3.4 * dm, kind: 'cream',
          });
          if (b.shots % 3 === 1) this.sound('throw');
        }
        if (b.shots >= 12 && b.mt > 1.45) {
          b.act = 'stalk';
          b.mt = 0;
          b.cdStream = 5.5 * rage;
          b.bite = 1.0 * rage;
        }
        break;
      }
      case 'blobWind': {
        // the concentrated one: charges a huge dollop, then lobs it where you're headed
        b.heading = angLerp(b.heading, toT, 5 * dt);
        b.aim = angLerp(b.aim, toT, 5 * dt);
        const n = nozzle();
        if (this.rnd() < dt * 30) this.fx.motes(n.x, 2.2, n.z, 1, 0xfffaf0, 2.5, 0.2, 0.4, 3, 4, 1.2, 1.2);
        if (b.mt >= 1.1 * rage + 0.2) {
          const pk = tgt.player;
          const tx = clamp(pk ? pk.x + pk.vx * 0.5 : tgt.x, -BOUND + 2, BOUND - 2);
          const tz = clamp(pk ? pk.z + pk.vz * 0.5 : tgt.z, -BOUND + 2, BOUND - 2);
          const flight = clamp(Math.hypot(tx - n.x, tz - n.z) / 16, 0.6, 1.25);
          const y0 = 2.4;
          this.projs.push({
            id: this.id(), x: n.x, y: y0, z: n.z,
            vx: (tx - n.x) / flight, vy: (0.3 - y0 + 0.5 * 22 * flight * flight) / flight, vz: (tz - n.z) / flight,
            life: flight + 0.4, dmg: 19 * dm, kind: 'blob',
          });
          // a white ring shows where it lands
          this.fx.groundMark(tx, 0, tz, 3.6, 'splash', 0xfffaf0, flight + 0.2);
          this.sound('pop');
          this.sound('throw');
          b.act = 'blob';
          b.mt = 0;
        }
        break;
      }
      case 'blob': {
        if (b.mt >= 0.7) {
          b.act = 'stalk';
          b.mt = 0;
          b.cdBlob = 7 * rage;
          b.bite = 0.9 * rage;
        }
        break;
      }
      case 'toEat': {
        const e = this.edibles[b.target];
        if (!e || e.hp <= 0) {
          b.act = 'stalk';
          b.target = -1;
          b.hunger = EARWHEN.hunger * 0.5;
          break;
        }
        const ex = e.x - b.x;
        const ez = e.z - b.z;
        b.heading = angLerp(b.heading, Math.atan2(ex, ez), 6 * dt);
        b.aim = b.heading;
        if (Math.hypot(ex, ez) > e.r + 1.8) walk(ex, ez, EARWHEN.speed * 1.15);
        else {
          b.act = 'eating';
          b.mt = 0;
        }
        break;
      }
      case 'eating': {
        const e = this.edibles[b.target];
        if (!e) {
          b.act = 'stalk';
          break;
        }
        e.hp = Math.max(0, e.hp - EARWHEN.eatRate * dt);
        this.refreshEdible(e);
        if (b.chomp <= 0) {
          b.chomp = 0.3;
          this.sound('chomp');
          this.fx.emit(b.x + Math.sin(b.heading) * 1.6, 3.4, b.z + Math.cos(b.heading) * 1.6, 4, e.crumb, 5, 0.22, 0.6);
        }
        if (this.farmPct() <= 0.01) this.gameOver('farm');
        if (e.hp <= 0 || b.mt > 5) {
          if (e.hp <= 0) this.floatText(e.x, 3, e.z, `${e.name.toUpperCase()} EATEN!`, 'hurt');
          b.hunger = EARWHEN.hunger;
          b.target = -1;
          b.act = 'stalk';
          b.mt = 0;
          b.bite = 0.8;
        }
        break;
      }
    }
    const r = this.resolve(b.x, b.z, b.rad);
    b.x = clamp(r.x, -BOUND, BOUND);
    b.z = clamp(r.z, -BOUND, BOUND);
  }

  /** Kettle Bomber fuse reaches zero: huge fiery steam blast hurting pigs, hogs, and even nearby bots/jars! */
  private detonateBomber(b: Bot, dmgMul: number) {
    if (b.hp <= 0) return;
    b.hp = 0;
    this.bots = this.bots.filter((o) => o !== b);
    const R = 4.6;
    this.sound('slam');
    this.sound('pop');
    this.addShake(0.75);
    this.fx.hitBurst(b.x, 1.2, b.z, 0xff4a1a, 2.2);
    this.fx.shockWall(b.x, 0.08, b.z, 0xff5a1f, 0.9, R * 1.15, 1.0, 3.6, 0.44, 10);
    this.fx.groundMark(b.x, 0, b.z, R * 0.88, 'crater', 0xff7a2e, 2.8);
    this.fx.dustRing(b.x, 0.1, b.z, 14, 1.0, 0xd8c2a6, 10, 2.4, 0.75);
    this.fx.chunks(b.x, 1.0, b.z, 16, 0xd46b34, 13, 0.28, 0.72);
    this.hurtPlayersNear(b.x, b.z, R, 2.6, 21 * dmgMul, b.x, b.z, 19);
    // Devastating to rebel hogs if you don't knock the bomber away or kill it!
    this.hitAlliesNear(b.x, b.z, R, 24 * dmgMul);
    for (const o of [...this.bots]) {
      if (Math.hypot(o.x - b.x, o.z - b.z) < R) this.damageBot(o, 42, (o.x - b.x) * 4, (o.z - b.z) * 4, true);
    }
    this.hitPots(b.x, b.z, R, 45);
  }

  /** Picks a target for an enemy bot: the nearest pig, or a nearby rebel hog (so hogs are genuinely threatened!). */
  private pickBotTarget(b: Bot, hogBias = 0.75): { x: number; z: number; player: Player | null; ally: Ally | null } {
    // a wireframe decoy nearby beats any real pig
    const lure = this.nearestDecoy(b.x, b.z, 22);
    if (lure) return { x: lure.x, z: lure.z, player: null, ally: null };
    const k = this.nearestPlayer(b.x, b.z) ?? this.players[0];
    let bestX = k?.x ?? b.x;
    let bestZ = k?.z ?? b.z;
    let bestAlly: Ally | null = null;
    let bestScore = k ? Math.hypot(k.x - b.x, k.z - b.z) : Infinity;
    for (const a of this.allies) {
      if (a.dying > 0 || a.hp <= 0) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z) * hogBias;
      if (d < bestScore && d < 9) {
        bestScore = d;
        bestX = a.x;
        bestZ = a.z;
        bestAlly = a;
      }
    }
    return { x: bestX, z: bestZ, player: bestAlly ? null : k ?? null, ally: bestAlly };
  }

  private spawnPuddle(x: number, z: number, dmg: number, cream = false) {
    // cap active chili puddles for crisp readability & performance
    while (this.puddles.length >= 6) this.puddles.shift();
    this.puddles.push({ id: this.id(), x, z, r: cream ? 3.1 : 2.75, life: cream ? 6 : 5.2, maxLife: cream ? 6 : 5.2, tick: 0.25, dmg, cream });
    if (cream) return;
    this.sound('sizzle');
    this.fx.sparks(x, 0.35, z, 14, 0xff4a1a, 8, 0.16, 0.4, { grav: 16, up: 0.85, hdr: 3.8, altColor: 0xffc83d });
  }

  private updatePuddles(dt: number) {
    if (!this.puddles.length) return;
    this.puddles = this.puddles.filter((pd) => {
      pd.life -= dt;
      if (pd.life <= 0) return false;
      if (this.rnd() < dt * 10) {
        const a = this.rnd() * TAU;
        const rr = Math.sqrt(this.rnd()) * pd.r * 0.85;
        if (pd.cream) this.fx.motes(pd.x + Math.cos(a) * rr, 0.2, pd.z + Math.sin(a) * rr, 1, 0xfffaf0, 0.5, 0.16, 0.6, -0.6, 0, 0.1, 1.1);
        else this.fx.motes(pd.x + Math.cos(a) * rr, 0.18, pd.z + Math.sin(a) * rr, 1, 0xff5a1a, 1.4, 0.13, 0.42, -2.5, 0, 0.1, 3.6);
      }
      pd.tick -= dt;
      if (pd.tick <= 0) {
        pd.tick = 0.45;
        this.hurtPlayersNear(pd.x, pd.z, pd.r, 0.55, pd.dmg, pd.x, pd.z, 6);
        // Sizzling chili burns rebel hogs who step in it!
        this.hitAlliesNear(pd.x, pd.z, pd.r, pd.dmg * 0.85);
      }
      return true;
    });
  }

  private updateMemorials(dt: number) {
    if (!this.memorials.length) return;
    this.memorials = this.memorials.filter((mm) => {
      mm.life -= dt;
      return mm.life > 0;
    });
  }

  private updateBots(dt: number) {
    // the kitchen brigade backs Allen up; it shouldn't out-fight him
    const c0 = COURSES[Math.min(this.course, COURSES.length - 1)];
    const c = { ...c0, dmg: c0.dmg * KITCHEN_DMG };
    const anyAlive = this.living().length > 0;

    for (const b of [...this.bots]) {
      if (b.hp <= 0) continue;
      b.bite -= dt;
      b.stun = Math.max(0, b.stun - dt);
      b.chomp = Math.max(0, b.chomp - dt);
      b.flash = Math.max(0, b.flash - dt);
      b.x += b.kx * dt;
      b.z += b.kz * dt;
      const damp = Math.exp(-6 * dt);
      b.kx *= damp;
      b.kz *= damp;

      if (b.kind === 'guppy') {
        if (b.mode === 'lunge') this.updateScareGuppy(b, dt);
        else this.updatePathGuppy(b, dt);
        continue;
      }
      if (b.kind === 'earwhen') {
        this.updateEarwhen(b, dt);
        continue;
      }

      const tgt = this.pickBotTarget(b, b.kind === 'skewer' || b.kind === 'grill' ? 0.82 : 0.92);
      const dx = tgt.x - b.x;
      const dz = tgt.z - b.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const toT = Math.atan2(dx, dz);
      const active = b.stun <= 0 && anyAlive && !this.overReason;
      let hop = 0;

      switch (b.kind) {
        case 'grill': {
          if (active) {
            b.heading = angLerp(b.heading, toT, 9 * dt);
            const sp = 8.0 + this.course * 0.22;
            if (d > 1.35) {
              b.x += (dx / d) * sp * dt;
              b.z += (dz / d) * sp * dt;
            }
            if (b.bite <= 0) {
              const pk = this.nearestPlayer(b.x, b.z, 1.95);
              if (pk && pk.y < 1.5) {
                b.bite = 0.95;
                b.chomp = 0.3;
                this.sound('chomp');
                this.hurtPlayer(pk, 7.5 * c.dmg, b.x, b.z, 9);
              } else if (tgt.ally && d < 1.85) {
                b.bite = 1.0;
                b.chomp = 0.3;
                this.sound('chomp');
                this.hurtAlly(tgt.ally, 8 * c.dmg);
              }
            }
          }
          b.ph += dt * 12;
          hop = b.stun > 0 ? 0 : Math.abs(Math.sin(b.ph)) * 0.26;
          break;
        }

        case 'spitter': {
          // Ranged Sriracha bottle: maintains mid-range, strafes, and lobs sizzling chili bombs!
          if (active) {
            b.heading = angLerp(b.heading, toT, 8 * dt);
            const sp = 6.2 + this.course * 0.15;
            let mx = 0;
            let mz = 0;
            if (d > 14.5) {
              mx = dx / d;
              mz = dz / d;
            } else if (d < 7.5) {
              mx = (-dx / d) * 0.85;
              mz = (-dz / d) * 0.85;
            } else {
              mx = (-dz / d) * b.strafe * 0.7;
              mz = (dx / d) * b.strafe * 0.7;
            }
            b.x += mx * sp * dt;
            b.z += mz * sp * dt;
            if (b.bite <= 0 && d < 22) {
              b.bite = Math.max(2.3, 3.4 - this.course * 0.14);
              b.chomp = 0.36;
              // lead the pig slightly if targeting a pig
              const pk = tgt.player;
              const aimX = pk ? clamp(pk.x + pk.vx * 0.32, -BOUND + 2, BOUND - 2) : tgt.x;
              const aimZ = pk ? clamp(pk.z + pk.vz * 0.32, -BOUND + 2, BOUND - 2) : tgt.z;
              const adx = aimX - b.x;
              const adz = aimZ - b.z;
              const flight = clamp(Math.hypot(adx, adz) / 18, 0.45, 1.15);
              this.projs.push({
                id: this.id(),
                x: b.x,
                y: 2.6,
                z: b.z,
                vx: adx / flight,
                vy: (0.2 - 2.6 + 0.5 * 22 * flight * flight) / flight,
                vz: adz / flight,
                life: flight + 0.3,
                dmg: 8.5 * c.dmg,
                kind: 'chili',
              });
              this.sound('throw');
              this.fx.sparks(b.x, 2.7, b.z, 6, 0xff4a1a, 6, 0.13, 0.25, { hdr: 3.6 });
            }
          }
          b.ph += dt * 9;
          hop = b.stun > 0 ? 0 : Math.abs(Math.sin(b.ph)) * 0.14;
          break;
        }

        case 'skewer': {
          // Skewer Hound: stalks, crouches with a red aim flash, then lunges at 27 m/s piercing everything!
          if (!active) {
            b.mode = 'idle';
          } else if (b.mode === 'idle') {
            b.heading = angLerp(b.heading, toT, 9 * dt);
            const sp = 7.6 + this.course * 0.2;
            if (d > 6.5) {
              b.x += (dx / d) * sp * dt;
              b.z += (dz / d) * sp * dt;
            } else {
              b.x += (-dz / d) * b.strafe * sp * 0.75 * dt;
              b.z += (dx / d) * b.strafe * sp * 0.75 * dt;
            }
            if (b.bite <= 0 && d < 12.5 && d > 2.4) {
              b.mode = 'wind';
              b.mt = 0;
              b.heading = toT;
              this.fx.sparks(b.x + Math.sin(toT) * 1.4, 0.7, b.z + Math.cos(toT) * 1.4, 8, 0xff3b24, 7, 0.14, 0.28, { hdr: 4.2, altColor: 0xffe14d });
            }
          } else if (b.mode === 'wind') {
            b.mt += dt;
            if (b.mt < 0.36) b.heading = angLerp(b.heading, toT, 10 * dt);
            if (b.mt >= 0.54 * c.tele) {
              b.mode = 'lunge';
              b.mt = 0;
              b.lx = Math.sin(b.heading);
              b.lz = Math.cos(b.heading);
              b.chomp = 1; // tracks whether a pig was pierced this lunge
              this.sound('swing');
              this.fx.slash({ x: b.x + b.lx * 1.2, y: 0.75, z: b.z + b.lz * 1.2, heading: b.heading, color: 0xff5a24, radius: 1.9, dur: 0.22, spin: 0, hdr: 3.8 });
            }
          } else if (b.mode === 'lunge') {
            b.mt += dt;
            const lsp = 27 + this.course * 0.6;
            b.x += b.lx * lsp * dt;
            b.z += b.lz * lsp * dt;
            if (this.rnd() < dt * 40) {
              this.fx.sparks(b.x - b.lx * 0.6, 0.65, b.z - b.lz * 0.6, 2, 0xff7a24, 7, 0.12, 0.2, { dirX: -b.lx, dirZ: -b.lz, focus: 0.8, hdr: 3.8 });
            }
            if (b.chomp > 0) {
              const pk = this.nearestPlayer(b.x, b.z, 1.85);
              if (pk && pk.y < 1.7 && this.hurtPlayer(pk, 12 * c.dmg, b.x - b.lx, b.z - b.lz, 14)) b.chomp = 0;
            }
            this.hitAlliesNear(b.x + b.lx * 0.6, b.z + b.lz * 0.6, 1.7, 13 * c.dmg);
            if (b.mt >= 0.36) {
              b.mode = 'idle';
              b.bite = Math.max(1.8, 2.7 - this.course * 0.1);
              b.strafe = -b.strafe;
            }
          }
          b.ph += dt * 13;
          break;
        }

        case 'tenderizer': {
          // Armored Tenderizer Brute: relentless march + telegraphed AoE meat-mallet slam!
          const slamDur = 0.68 * c.tele;
          if (!active) {
            /* stunned: the slam telegraph hides */
          } else if (b.mode === 'idle') {
            b.heading = angLerp(b.heading, toT, 6.5 * dt);
            const sp = 5.4 + this.course * 0.18;
            if (d > 2.4) {
              b.x += (dx / d) * sp * dt;
              b.z += (dz / d) * sp * dt;
            }
            if (b.bite <= 0 && d < 3.6) {
              b.mode = 'wind';
              b.mt = 0;
              b.lx = b.x + Math.sin(b.heading) * 1.5;
              b.lz = b.z + Math.cos(b.heading) * 1.5;
              this.sound('roar');
            }
          } else if (b.mode === 'wind') {
            b.mt += dt;
            if (b.mt >= slamDur) {
              b.mode = 'idle';
              b.bite = Math.max(1.7, 2.5 - this.course * 0.08);
              b.chomp = 0.28;
              this.sound('slam');
              this.addShake(0.5);
              this.fx.hitBurst(b.lx, 0.7, b.lz, 0xff7a24, 1.45);
              this.fx.shockWall(b.lx, 0.08, b.lz, 0xff822e, 0.7, 3.8, 0.6, 2.2, 0.34, 6);
              this.fx.groundMark(b.lx, 0, b.lz, 3.2, 'crater', 0xff9a44, 2.2);
              this.fx.dustRing(b.lx, 0.08, b.lz, 10, 0.8, 0xdac4a2, 7.5, 1.9, 0.62);
              this.hurtPlayersNear(b.lx, b.lz, 3.5, 2.1, 16 * c.dmg, b.lx, b.lz, 16);
              this.hitAlliesNear(b.lx, b.lz, 3.5, 17 * c.dmg);
            }
          }
          b.ph += dt * 7;
          hop = b.mode === 'idle' && b.stun <= 0 ? Math.abs(Math.sin(b.ph)) * 0.1 : 0;
          break;
        }

        case 'bomber': {
          // Kettle Bomber: sprints in, triggers screaming 1.05s fuse with blast circle, then BOOM!
          const fuseDur = Math.max(0.88, 1.12 * c.tele);
          if (b.mode === 'fuse') {
            b.mt += dt;
            if (this.rnd() < dt * 30) {
              this.fx.sparks(b.x, 1.95, b.z, 2, 0xff3b1f, 8, 0.14, 0.25, { dirY: 1, focus: 0.7, hdr: 4.2, altColor: 0xffe14d });
            }
            if (b.mt >= fuseDur) {
              this.detonateBomber(b, c.dmg);
              continue;
            }
          } else if (active) {
            b.heading = angLerp(b.heading, toT, 10 * dt);
            const sp = 9.6 + this.course * 0.22;
            b.x += (dx / d) * sp * dt;
            b.z += (dz / d) * sp * dt;
            if (d < 3.3) {
              b.mode = 'fuse';
              b.mt = 0;
              this.sound('hiss');
              this.floatText(b.x, 2.6, b.z, 'HISS!!', 'hurt');
            }
          }
          b.ph += dt * 16;
          hop = b.mode === 'fuse' ? Math.abs(Math.sin(this.time * 36)) * 0.12 : Math.abs(Math.sin(b.ph)) * 0.24;
          break;
        }
      }

      // bot-bot separation & world collision
      for (const o of this.bots) {
        if (o === b || o.hp <= 0) continue;
        const ox = b.x - o.x;
        const oz = b.z - o.z;
        const minD = b.rad + o.rad + 0.35;
        const od = Math.hypot(ox, oz);
        if (od < minD && od > 0.001) {
          b.x += (ox / od) * (minD - od) * 0.5;
          b.z += (oz / od) * (minD - od) * 0.5;
        }
      }
      const r = this.resolve(b.x, b.z, b.rad);
      b.x = clamp(r.x, -BOUND, BOUND);
      b.z = clamp(r.z, -BOUND, BOUND);
      b.hop = hop;
    }
  }

  private updateProjectiles(dt: number) {
    this.projs = this.projs.filter((p) => {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      if ((p.kind === 'chili' || p.kind === 'blob') && !p.friendly) {
        p.vy -= 22 * dt;
        p.y += p.vy * dt;
      }
      p.life -= dt;

      if (this.rnd() < dt * (p.friendly ? 45 : 24)) {
        const cream = p.kind === 'cream' || p.kind === 'blob';
        const col = p.friendly ? 0x62f4ff : cream ? 0xfffaf0 : p.kind === 'chili' ? 0xff3b18 : 0xffaa44;
        this.fx.sparks(p.x, p.y, p.z, p.kind === 'blob' ? 3 : 1, col, 3, p.kind === 'blob' ? 0.2 : 0.11, 0.25, { grav: 4, hdr: p.friendly ? 4.0 : cream ? 1.2 : 3.2 });
      }
      let dead = p.life <= 0 || Math.abs(p.x) > 60 || Math.abs(p.z) > 60;
      // Arcing Sriracha chili glob splashes onto the ground into a burning chili puddle!
      if (!dead && p.kind === 'blob' && !p.friendly && p.y <= 0.3) {
        this.creamSplash(clamp(p.x, -BOUND + 1, BOUND - 1), clamp(p.z, -BOUND + 1, BOUND - 1), p.dmg);
        dead = true;
      }
      if (!dead && p.kind === 'chili' && !p.friendly && p.y <= 0.22) {
        this.spawnPuddle(clamp(p.x, -BOUND + 1, BOUND - 1), clamp(p.z, -BOUND + 1, BOUND - 1), p.dmg * 0.72);
        this.hurtPlayersNear(p.x, p.z, 2.2, 1.8, p.dmg, p.x, p.z, 9);
        this.hitAlliesNear(p.x, p.z, 2.3, p.dmg);
        dead = true;
      }
      if (!dead && p.y < 2.2 && this.resolve(p.x, p.z, 0.25).hit) {
        if (p.kind === 'chili' && !p.friendly) this.spawnPuddle(p.x, p.z, p.dmg * 0.7);
        else if (p.kind === 'blob' && !p.friendly) this.creamSplash(p.x, p.z, p.dmg);
        else this.fx.emit(p.x, p.y, p.z, 5, p.kind === 'cream' ? 0xfffaf0 : 0xffb057, 5, 0.2, 0.4);
        dead = true;
      }
      if (!dead && p.friendly) {
        const A = this.A;
        if (A.active && A.hp > 0 && Math.hypot(p.x - A.x, p.z - A.z) < 2.6) {
          if (this.damageAllen(p.dmg, 32, { fx: p.x, fz: p.z })) {
            this.sound('bighit');
            this.floatText(A.x, 5.6, A.z, 'PARRY HIT!', 'crit');
            this.fx.hitBurst(p.x, 2.2, p.z, 0x62f4ff, 1.75);
          }
          dead = true;
        }
        for (const b of [...this.bots]) {
          if (!dead && Math.hypot(p.x - b.x, p.z - b.z) < 1.5 + b.rad * 0.4) {
            this.damageBot(b, p.dmg * 1.4, p.vx * 0.3, p.vz * 0.3, true);
            dead = true;
          }
        }
      } else if (!dead) {
        if (p.y < 2.2) {
          for (const k of this.players) {
            if (Math.hypot(p.x - k.x, p.z - k.z) < 1.28 && k.y < 2 && this.hurtPlayer(k, p.dmg, p.x - p.vx * 0.1, p.z - p.vz * 0.1, 10)) {
              if (p.kind === 'chili') this.spawnPuddle(p.x, p.z, p.dmg * 0.65);
              else if (p.kind === 'blob') this.creamSplash(p.x, p.z, p.dmg * 0.6);
              else if (p.kind === 'cream') this.fx.emit(p.x, p.y, p.z, 6, 0xfffaf0, 4, 0.2, 0.45, 12);
              dead = true;
              break;
            }
          }
        }
        // Enemy chopsticks can skewer rebel hogs in their flight path!
        if (!dead && (p.kind === 'chopstick' || p.kind === 'cream')) {
          for (const a of this.allies) {
            if (a.dying <= 0 && a.hp > 0 && a.inv <= 0 && Math.hypot(p.x - a.x, p.z - a.z) < 1.05) {
              this.hurtAlly(a, p.dmg * 0.85);
              dead = true;
              break;
            }
          }
        }
      }
      return !dead;
    });

    this.kernels = this.kernels.filter((n) => {
      const A = this.A;
      const bot = n.botId !== null ? this.bots.find((b) => b.id === n.botId) ?? null : null;
      if (n.botId !== null ? !bot || bot.hp <= 0 : !A.active || A.hp <= 0) return false;
      const tx = bot ? bot.x : A.x;
      const ty = bot ? 1.1 : A.y + 2.6;
      const tz = bot ? bot.z : A.z;
      const dx = tx - n.x;
      const dy = ty - n.y;
      const dz = tz - n.z;
      const d = Math.hypot(dx, dy, dz) || 0.001;
      const step = 46 * dt;
      if (d < step + 1.2) {
        if (bot) this.damageBot(bot, n.dmg * 2, 0, 0);
        else this.damageAllen(n.dmg, 2, { minor: true, fx: n.x, fz: n.z });
        this.fx.emit(tx, ty, tz, 4, 0xf2c230, 5, 0.2, 0.35);
        return false;
      }
      n.x += (dx / d) * step;
      n.y += (dy / d) * step;
      n.z += (dz / d) * step;
      return true;
    });
  }

  private updateShocks(dt: number) {
    this.shocks = this.shocks.filter((s) => {
      s.r += s.speed * dt;
      if (s.hostile) {
        for (const k of this.players) {
          if (s.hitPlayers.has(k.id) || k.y >= 0.8) continue;
          const d = Math.hypot(k.x - s.x, k.z - s.z);
          if (Math.abs(d - s.r) < 1.1 && this.hurtPlayer(k, s.dmg, s.x, s.z, 12)) s.hitPlayers.add(k.id);
        }
        // Hostile shockwaves also batter rebel hogs caught in the ring!
        for (const a of this.allies) {
          if (a.dying > 0 || a.hp <= 0 || s.hitAllies.has(a.id)) continue;
          if (Math.abs(Math.hypot(a.x - s.x, a.z - s.z) - s.r) < 1.0) {
            s.hitAllies.add(a.id);
            this.hurtAlly(a, s.dmg * 0.55);
          }
        }
      }
      return s.r < s.maxR;
    });
  }

  /** Kingger personally backs the herd up from Kingger Labs by firing Tesla-coil lightning arcs across the farm! */
  private updateKinggerZap(dt: number) {
    this.kingCast = Math.max(0, this.kingCast - dt);
    this.kingBarkCd = Math.max(0, this.kingBarkCd - dt);
    const lv = this.levels.zap;
    if (lv <= 0 || this.area !== 'farm' || this.mode !== 'combat' || this.overReason) return;
    this.kingZapT -= dt;
    if (this.kingZapT > 0) return;

    const A = this.A;
    // Pick highest-priority target on the farm: lit Bombers -> Sauce Jars -> Kitchen Bots -> Allen
    type KTarget = { kind: 'bot' | 'pot' | 'allen'; x: number; y: number; z: number; bot?: Bot; pot?: Pot; score: number };
    const cands: KTarget[] = [];
    for (const b of this.bots) {
      if (b.hp <= 0) continue;
      const near = this.nearestPlayer(b.x, b.z, Infinity, this.players);
      const d = near ? Math.hypot(b.x - near.x, b.z - near.z) : 20;
      const prio = b.kind === 'bomber' && b.mode === 'fuse' ? 0.25 : b.kind === 'spitter' ? 0.7 : 0.85;
      cands.push({ kind: 'bot', x: b.x, y: b.kind === 'tenderizer' ? 1.8 : 1.1, z: b.z, bot: b, score: d * prio });
    }
    for (const p of this.pots) {
      if (p.hp > 0) cands.push({ kind: 'pot', x: p.x, y: 1.5, z: p.z, pot: p, score: 8 });
    }
    if (A.active && A.hp > 0 && !A.shielded && A.state !== 'spin' && A.z < 56 && !['gone', 'defeated', 'leaving', 'ko', 'calling'].includes(A.state)) {
      cands.push({ kind: 'allen', x: A.x, y: A.y + 2.8, z: A.z, score: 18 });
    }
    if (!cands.length) {
      this.kingZapT = 1.0;
      return;
    }
    cands.sort((a, b) => a.score - b.score);
    const hitCount = lv >= 3 ? Math.min(2, cands.length) : 1;
    const dmg = [0, 20, 30, 42][Math.min(lv, 3)];

    this.kingZapT = [0, 8.5, 6.0, 4.2][Math.min(lv, 3)];
    this.kingCast = 0.75;
    this.sound('zap');

    // Bolt jumps from Kingger's hand -> Lab Tesla Coil -> Target (and chains at Lv 3!)
    this.fx.lightning(SPOT.kingger.x, 2.6, SPOT.kingger.z, COIL.x, COIL.y, COIL.z, 0x7df9ff, 0.08, 0.34);
    this.fx.hitBurst(COIL.x, COIL.y, COIL.z, 0x5ff2ff, 1.05);
    let px = COIL.x;
    let py = COIL.y;
    let pz = COIL.z;
    for (let i = 0; i < hitCount; i++) {
      const t = cands[i];
      this.fx.lightning(px, py, pz, t.x, t.y, t.z, i === 0 ? 0x5ff2ff : 0xffe46b, 0.095, 0.34);
      this.fx.hitBurst(t.x, t.y, t.z, 0x5ff2ff, 1.25);
      if (t.kind === 'bot' && t.bot && t.bot.hp > 0) {
        t.bot.stun = Math.max(t.bot.stun, 1.2);
        this.damageBot(t.bot, dmg, 0, 0, true);
      } else if (t.kind === 'pot' && t.pot && t.pot.hp > 0) {
        this.damagePot(t.pot, dmg * 0.85);
      } else if (t.kind === 'allen') {
        this.damageAllen(dmg * 0.75, 14, { minor: true, fx: COIL.x, fz: COIL.z });
      }
      px = t.x;
      py = t.y;
      pz = t.z;
    }
    if (this.kingBarkCd <= 0 && !this.subtitle && this.rnd() < 0.42) {
      this.kingBarkCd = 20;
      this.say(
        'Kingger',
        this.pick(['1.21 JIGGAWATTS! Eat science, Hwang!', 'Tesla coil at full capacitance — ZAP!', "Taste Ohm's Law, kitchen appliances!", 'Covering fire from Kingger Labs!']),
        2.8,
      );
    }
  }

  private updateTurret(dt: number) {
    this.updateKinggerZap(dt);
    const lv = this.levels.cannon;
    if (lv <= 0 || this.mode !== 'combat') return;
    const A = this.A;
    let tx = 0;
    let tz = 0;
    let bot: Bot | null = null;
    let best = 48;
    let found = false;
    if (A.active && A.hp > 0 && !A.shielded && A.state !== 'spin' && A.state !== 'leaving' && A.z < 58) {
      const d = Math.hypot(A.x - SPOT.turret.x, A.z - SPOT.turret.z);
      if (d < best) {
        best = d;
        tx = A.x;
        tz = A.z;
        found = true;
      }
    }
    for (const b of this.bots) {
      const d = Math.hypot(b.x - SPOT.turret.x, b.z - SPOT.turret.z);
      if (d < best * 0.6) {
        best = d / 0.6;
        tx = b.x;
        tz = b.z;
        bot = b;
        found = true;
      }
    }
    if (!found) return;
    this.turretYaw = angLerp(this.turretYaw, Math.atan2(tx - SPOT.turret.x, tz - SPOT.turret.z), 8 * dt);
    this.turretT -= dt;
    if (this.turretT <= 0) {
      this.turretT = [1.5, 1.1, 0.8][lv - 1];
      this.kernels.push({ id: this.id(), x: SPOT.turret.x, y: 2.3, z: SPOT.turret.z, botId: bot ? bot.id : null, dmg: [5, 7, 10][lv - 1] });
      this.fx.emit(SPOT.turret.x, 2.3, SPOT.turret.z, 3, 0xf2c230, 4, 0.18, 0.3);
    }
  }

  private updatePickups(dt: number) {
    const bound = this.mapBound();
    const magnet = this.levels.magnet > 0 ? 10 : 3;
    this.pickups = this.pickups.filter((p) => {
      if (p.area !== this.area) return true;
      p.age += dt;
      p.vy -= 30 * dt;
      p.y += p.vy * dt;
      if (p.y < 0.5) {
        p.y = 0.5;
        p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.4 : 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      const nx = clamp(p.x + p.vx * dt, -bound, bound);
      const nz = clamp(p.z + p.vz * dt, -bound, bound);
      if (p.area === 'forest') {
        const resolved = this.resolve(nx, nz, 0.35);
        p.x = resolved.x;
        p.z = resolved.z;
        if (resolved.hit) {
          p.vx *= -0.35;
          p.vz *= -0.35;
        }
      } else {
        p.x = nx;
        p.z = nz;
      }
      const k = this.nearestPlayer(p.x, p.z);
      if (k && p.age > 0.5) {
        const dx = k.x - p.x;
        const dz = k.z - p.z;
        const d = Math.hypot(dx, dz) || 0.001;
        if (d < 1.5 && k.y < 2.5) {
          this.truffles += p.value;
          this.stats.earned += p.value;
          this.sound('truffle');
          this.floatText(p.x, 1.8, p.z, `+${p.value}`, 'gold');
          this.fx.emit(p.x, 0.8, p.z, 6, 0xffc93c, 5, 0.18, 0.4, 6);
          this.dirty = true;
          return false;
        }
        if (d < magnet) {
          const pull = (this.levels.magnet > 0 ? 20 : 12) * dt;
          p.x += (dx / d) * pull;
          p.z += (dz / d) * pull;
        }
      }
      return true;
    });
  }

  /* ───────────────────────── interaction ───────────────────────── */

  private updateInteract(k: Player) {
    k.prompt = null;
    if (k.action === 'dead' || this.overReason) return;
    const near = (p: { x: number; z: number }, r: number) => Math.hypot(k.x - p.x, k.z - p.z) < r;
    const e = (this.input(k).buttons & BTN.interact) !== 0;
    if (this.area === 'forest') {
      if (near(FOREST_EXIT, 6.5)) {
        k.prompt = `E|Return to the farm (${this.hunt?.found ?? 0}/${this.hunt?.total ?? 0} caches dug up)`;
        if (e) this.endHunt();
        return;
      }
      const c = this.caches[0];
      const herb = this.herb();
      if (c && herb && herb.spotted && near(c, 3.4)) {
        k.prompt = 'E|Dig up the truffles';
        if (e) this.digCache(k);
      }
      return;
    }
    if (this.mode === 'intermission') {
      if (!this.greeted.rickley && near(SPOT.rickley, 10)) {
        this.greeted.rickley = true;
        this.say('Rickley', this.pick(['Truffles for grit, Kenji. Fair trade.', "Eat up, son. Can't fight on an empty trough.", "Farm's countin' on ya. Let's toughen you up."]), 3.5);
      }
      if (!this.greeted.kingger && near(SPOT.kingger, 10)) {
        this.greeted.kingger = true;
        this.say('Kingger', this.pick(['Ah, test subject K! I have prototypes.', 'My models say rocket trotters raise survival odds 34%.', 'He keeps calling you "char siu". Technically that is a compliment.']), 3.5);
      }
      if (!this.greeted.trout && (near(SPOT.troutDock, 8.5) || near(SPOT.trout, 9.5))) {
        this.greeted.trout = true;
        this.leapTrout();
        this.say(
          'Trout',
          this.pick([
            "Name's Trout. I'm a trout. Step onto my dock and I'll teach you combos that slap.",
            "Blub! Your footwork's sloppy, pig. Come learn the Way of the Wet Fin!",
            'Float like a lily pad, crack ribs like a river rock. Bring truffles to the dock!',
          ]),
          4.4,
        );
      }
      if (!this.greeted.kioff && near(SPOT.kioff, 10)) {
        this.greeted.kioff = true;
        this.say('Kioff', this.pick(['Gen Ed for life. But I render a mean portal.', 'The chickens are my beta testers. Want in?', "I've seen the Backrooms. Allen should too."]), 3.5);
      }
      if (!this.greeted.charig && near(SPOT.charig, 10)) {
        this.greeted.charig = true;
        this.say('Charig', this.pick(['Kenji! I know Allen better than anyone. Let me help.', "Health potions, speedrun strats, and one very cursed phone. Take a look.", 'Back in the lab, Allen was my best friend. Now look at him.']), 3.8);
      }
      if (near(SPOT.rickley, 5.5)) {
        k.prompt = 'E|Trade with Rickley';
        if (e) this.openShop(k.id, 'rickley');
      } else if (near(SPOT.kioff, 5.2)) {
        k.prompt = "E|Kioff's render farm: portals, decoys and the corn cannon";
        if (e) this.openShop(k.id, 'kioff');
      } else if (near(SPOT.charig, 5.2)) {
        k.prompt = "E|Charig's stash: healing and gamer tricks";
        if (e) this.openShop(k.id, 'charig');
      } else if (near(SPOT.kingger, 5.5)) {
        k.prompt = 'E|Browse Kingger Labs';
        if (e) this.openShop(k.id, 'kingger');
      } else if (near(SPOT.troutDock, 5.2) || near(SPOT.trout, 6.2)) {
        k.prompt = 'E|Train with Trout — learn combat moves & combos';
        if (e) {
          this.leapTrout();
          this.openShop(k.id, 'trout');
        }
      } else if (near(SPOT.hunt, 7)) {
        if (this.huntedCourse === this.course) {
          k.prompt = "E|Herb's resting (back after the next course)";
          if (e) this.say('Herb', '*snore*… five more minutes… the truffles will keep…', 3);
        } else {
          k.prompt = 'E|Hog Hunt: hunt truffles in Slopwood Forest with Herb';
          if (e) this.startHunt();
        }
      } else if (near(SPOT.bell, 5)) {
        k.prompt = `E|Ring the Dinner Bell — start ${this.course >= FINALE ? 'the final course' : `Course ${this.course + 1}`}`;
        if (e) this.beginCourse();
      }
    } else if (near(SPOT.rickley, 5.5)) {
      k.prompt = 'E|Rickley (shop closed while Allen is here)';
      if (e) this.say('Rickley', this.pick(["Not now, Kenji — he's right behind ya!", "Shop's closed till that glutton leaves!"]), 2.5);
    } else if (near(SPOT.kingger, 5.5)) {
      k.prompt = 'E|Kingger (lab closed while Allen is here)';
      if (e) this.say('Kingger', this.pick(['Lab is in lockdown! Lead him into a wall when he dashes!', 'Jump the shockwaves! JUMP them!']), 2.8);
    } else if (near(SPOT.troutDock, 5.2) || near(SPOT.trout, 6.2)) {
      k.prompt = 'E|Trout (no lessons mid-brawl!)';
      if (e) {
        this.leapTrout();
        this.say('Trout', this.pick(['Class is OUT — use your combos on him, kid!', 'Roll in, uppercut, belly flop! Remember your kata!']), 2.8);
      }
    } else if (near(SPOT.hunt, 7)) {
      k.prompt = 'E|Forest trail closed - drive Allen off first';
      if (e) this.say('Rickley', 'Not now, Kenji! The farm needs you here.', 3);
    }
  }

  private leapTrout() {
    if (this.area !== 'farm') return;
    this.events.push({ t: 'troutLeap' });
  }

  /* ───────────────────────── hog hunt + squad ───────────────────────── */

  livingAlliesCount() {
    return this.allies.filter((a) => a.dying <= 0 && a.hp > 0).length;
  }

  private clearWild() {
    this.wild = [];
    this.hunt = null;
  }

  private clearSquad() {
    this.clearWild();
    this.allies = [];
  }

  /** Fallen hogs never return to the wild roster. */
  private healSurvivors(amount: number) {
    for (const a of this.allies) {
      if (a.dying <= 0 && a.hp > 0) {
        a.hp = Math.min(a.maxHp, a.hp + amount);
        a.inv = 0;
      }
    }
  }

  private spawnAllyPig(x: number, z: number, heading: number, tint: number, name: HogName, hp = 55, maxHp = 55): Ally {
    const ally: Ally = { id: this.id(), name, tint, x, z, heading, hp, maxHp, cd: 0.6, atk: 0, inv: 0, ph: 0, dying: 0, moving: false };
    this.allies.push(ally);
    return ally;
  }

  private startHunt() {
    if (this.area !== 'farm' || this.hunt || this.mode !== 'intermission' || this.overReason) return;
    this.clearEnemies();
    for (const p of this.players) p.shopNpc = null;
    this.huntedCourse = this.course;
    this.setArea('forest');
    this.travelTo(FOREST_START.x, FOREST_START.z, PI);
    // bury a handful of caches, then visit them nearest-first from the trailhead
    const pool = [...TRUFFLE_SPOTS];
    const chosen: { x: number; z: number; name: string }[] = [];
    while (chosen.length < HUNT_CACHES && pool.length) chosen.push(pool.splice(Math.floor(this.rnd() * pool.length), 1)[0]);
    this.caches = [];
    let cx = FOREST_START.x;
    let cz = FOREST_START.z;
    while (chosen.length) {
      chosen.sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz));
      const n = chosen.shift()!;
      const pos = this.safePosition(n.x + this.rand(-4, 4), n.z + this.rand(-4, 4), 1);
      this.caches.push({ x: pos.x, z: pos.z, name: n.name });
      cx = pos.x;
      cz = pos.z;
    }
    this.hunt = { total: this.caches.length, found: 0, tx: this.caches[0].x, tz: this.caches[0].z, done: false };
    this.wild = [];
    const h = this.safePosition(FOREST_START.x + 2.5, FOREST_START.z - 3);
    this.wild.push({
      id: this.id(), name: 'Herb', look: 0, x: h.x, z: h.z, heading: PI, tx: h.x, tz: h.z, wait: 1.5, ph: 0,
      home: { x: h.x, z: h.z, r: 4 }, spotted: false, oinkT: 6, calm: 0, moving: false,
    });
    this.scareT = this.rand(22, 34);
    this.forestHint = 'Follow Herb and his lantern. When he starts rooting around, dig (E).';
    this.sound('oink');
    this.showBanner('HOG HUNT', 'Slopwood Forest, after dark · follow Herb to the truffles');
    this.say('Herb', "Stay close to my lantern, Kenji. These woods get… weird at night. I can smell truffles this way.", 5);
    this.dirty = true;
  }

  /** Herb, the hunt's guide (he lives in the `wild` list so he's drawn and sent like any forest hog). */
  private herb(): Wild | null {
    return this.wild.find((w) => w.name === 'Herb') ?? null;
  }

  private endHunt(knockedOut = false) {
    const h = this.hunt;
    if (!h || this.area !== 'forest') return;
    this.clearWild();
    this.caches = [];
    this.clearEnemies();
    this.setArea('farm');
    this.travelTo(SPOT.hunt.x - 3, SPOT.hunt.z - 2, -PI / 2);
    // anyone knocked out on the trail limps home
    for (const p of this.players) this.revive(p, 0.5, 0);
    const bonus = h.done ? 20 : 0;
    this.truffles += bonus;
    this.stats.earned += bonus;
    this.showBanner('BACK ON THE FARM', `${h.found}/${h.total} truffle caches dug up${bonus ? ` · +${bonus} truffle bonus from Herb` : ''}`);
    this.say(
      'Rickley',
      knockedOut ? "Rest up, Kenji. Somethin' in them woods ain't right." : h.found ? 'Good haul! Now spend it before that glutton comes back.' : 'The woods will still be there when you need them.',
      4,
    );
    this.sound(h.found ? 'buy' : 'truffle');
    this.dirty = true;
  }

  private recoverFromGuppy() {
    if (this.area !== 'forest' || !this.hunt) return;
    this.players.forEach((p, i) => {
      this.resetPlayer(p, i);
      p.hp = Math.ceil(p.maxHp * 0.5);
    });
    this.overReason = null;
    this.overTimer = 0;
    this.outcome = null;
    this.endHunt(true);
  }

  /** The listen button: Herb sniffs the air and says which way the next cache is. */
  private askHerb(k: Player) {
    const herb = this.herb();
    if (!this.hunt || !herb || this.area !== 'forest' || this.sniffCd > 0) return;
    this.sniffCd = 6;
    this.sniffTime = 4;
    this.sniffTargetId = herb.id;
    this.sound('oink');
    const c = this.caches[0];
    if (!c) {
      this.say('Herb', "That's every truffle I can smell. Back to the trailhead, by the glowing marker!", 4);
      return;
    }
    const dx = c.x - k.x;
    const dz = c.z - k.z;
    const dist = Math.hypot(dx, dz);
    const ns = Math.abs(dz) > dist * 0.35 ? (dz < 0 ? 'north' : 'south') : '';
    const ew = Math.abs(dx) > dist * 0.35 ? (dx < 0 ? 'west' : 'east') : '';
    const dir = `${ns}${ew}`;
    this.say('Herb', `*sniff sniff* ${dir ? `To the ${dir}` : 'Right around here'}, near ${c.name}. About ${Math.round(dist)} metres.`, 4);
    this.dirty = true;
  }

  private digCache(by: Player) {
    const c = this.caches.shift();
    const h = this.hunt;
    const herb = this.herb();
    if (!c || !h) return;
    h.found++;
    for (let i = 0; i < 3; i++) this.spawnTruffle(c.x, c.z, true);
    this.fx.dust(c.x, 0.3, c.z, 10, 0x5c4630, { spread: 1, speed: 4, rise: 2.5, size0: 0.6, size1: 2, life: 0.8 });
    this.fx.sparks(c.x, 0.8, c.z, 20, 0xf3bd59, 8, 0.16, 0.7, { up: 1, grav: 10, hdr: 2.6 });
    this.sound('truffle');
    this.sound('pop');
    this.floatText(c.x, 2.4, c.z, 'TRUFFLES!', 'gold');
    if (herb) herb.spotted = false;
    const next = this.caches[0];
    if (next) {
      h.tx = next.x;
      h.tz = next.z;
      this.forestHint = `${h.found}/${h.total} caches · follow Herb towards ${next.name}`;
      this.say('Herb', this.pick(['Oink! Got it! I smell more this way.', 'Lovely, earthy, perfect. Next!', `Good dig, ${by.name}. Stay close now.`]), 3);
    } else {
      h.done = true;
      h.tx = FOREST_EXIT.x;
      h.tz = FOREST_EXIT.z;
      this.forestHint = 'Every cache dug up! Follow Herb back to the trailhead.';
      this.showBanner('ALL TRUFFLES FOUND', 'Get back to the trailhead, and keep an eye on the dark');
      this.say('Herb', "That's the lot! Let's get out of here before… you know who shows up.", 4);
    }
    this.dirty = true;
  }

  /** Herb walks ahead to the next cache, waits for stragglers, roots around when he's there, and spooks easily. */
  private updateWild(dt: number) {
    const w = this.herb();
    if (!this.hunt || this.area !== 'forest' || !w) return;
    w.calm = Math.max(0, w.calm - dt);
    w.oinkT -= dt;
    const k = this.nearestPlayer(w.x, w.z, Infinity) ?? this.players[0];
    const dK = k ? Math.hypot(k.x - w.x, k.z - w.z) : 0;
    const tx = this.hunt.tx;
    const tz = this.hunt.tz;
    const dT = Math.hypot(tx - w.x, tz - w.z);
    let sp = 0;
    let angle = w.heading;
    const guppy = this.bots.find((b) => b.kind === 'guppy');
    if (w.calm > 0 && guppy) {
      // scared: bolt away from Path Guppy
      angle = Math.atan2(w.x - guppy.x, w.z - guppy.z);
      sp = 8;
    } else if (dK > 11 && k) {
      // too far ahead: wait, and call back
      w.heading = angLerp(w.heading, Math.atan2(k.x - w.x, k.z - w.z), 4 * dt);
      if (w.oinkT <= 0) {
        w.oinkT = 9;
        this.sound('oink');
        if (!this.subtitle) this.say('Herb', this.pick(['Over here! Follow the light!', "Don't wander off, it's dark out there!", 'This way, this way!']), 2.6);
      }
    } else if (dT > 1.4) {
      angle = Math.atan2(tx - w.x, tz - w.z);
      sp = dK > 7 ? 3.2 : 5.4;
      w.spotted = false;
    } else if (!this.hunt.done) {
      // at the cache: nose down, digging
      if (!w.spotted) {
        w.spotted = true;
        this.sound('oink');
        this.say('Herb', this.pick(['Here! Right here! Dig (E)!', 'Oooh, I smell a big one. Dig!', 'Snout says HERE.']), 2.8);
        this.dirty = true;
      }
      if (this.rnd() < dt * 8) this.fx.dust(w.x + Math.sin(w.heading) * 0.8, 0.2, w.z + Math.cos(w.heading) * 0.8, 1, 0x5c4630, { spread: 0.4, speed: 2, rise: 1.4, size0: 0.4, size1: 1, life: 0.5 });
    }
    if (sp > 0) {
      let next = this.resolve(w.x + Math.sin(angle) * sp * dt, w.z + Math.cos(angle) * sp * dt, 0.65);
      if (next.hit) {
        for (const turn of [0.9, -0.9, 1.7, -1.7, PI]) {
          const test = this.resolve(w.x + Math.sin(angle + turn) * sp * dt, w.z + Math.cos(angle + turn) * sp * dt, 0.65);
          if (!test.hit) {
            angle += turn;
            next = test;
            break;
          }
        }
      }
      w.heading = angLerp(w.heading, angle, 8 * dt);
      w.x = clamp(next.x, -FOREST_BOUND + 2, FOREST_BOUND - 2);
      w.z = clamp(next.z, -FOREST_BOUND + 2, FOREST_BOUND - 2);
    }
    w.ph += dt * (sp > 0 ? 10 : 0);
    w.moving = sp > 0;
    this.updateScares(dt);
  }

  /** Every so often Path Guppy leaps out of the dark at someone, swings once, and vanishes again. */
  private updateScares(dt: number) {
    if (this.overReason || this.bots.some((b) => b.kind === 'guppy')) return;
    this.scareT -= dt;
    if (this.scareT > 0) return;
    this.scareT = this.rand(30, 55);
    const alive = this.living();
    if (!alive.length) return;
    const k = this.pick(alive);
    // right in front of them, where the camera is looking
    const a = k.heading + this.rand(-0.5, 0.5);
    const p = this.safePosition(k.x + Math.sin(a) * 3.6, k.z + Math.cos(a) * 3.6, 0.9);
    this.bots.push({
      id: this.id(),
      kind: 'guppy', behavior: 'scare', x: p.x, z: p.z,
      hp: GUPPY_HP, maxHp: GUPPY_HP, rad: 0.85, heading: Math.atan2(k.x - p.x, k.z - p.z),
      bite: 0, stun: 0, kx: 0, kz: 0, chomp: 0, flash: 0, ph: 0,
      mode: 'lunge', mt: 0, lx: k.id, lz: 0, strafe: 1, hop: 0, moving: false, swing: 0,
    });
    this.events.push({ t: 'scare', only: k.id });
    this.sound('roar');
    this.sound('squeal');
    this.addShake(0.9, k);
    this.floatText(p.x, 3.2, p.z, 'BOO!', 'crit');
    const herb = this.herb();
    if (herb && Math.hypot(herb.x - p.x, herb.z - p.z) < 16) {
      herb.calm = 1.6;
      this.say('Herb', this.pick(['EEEEK! HIM AGAIN!', 'AAAH! Path Guppy!', 'NOPE NOPE NOPE!']), 2.2);
    }
  }

  /** A jump-scare Guppy: a short lunge, one telegraphed swing, then back into the dark. */
  private updateScareGuppy(b: PathGuppy, dt: number) {
    b.mt += dt;
    let moving = false;
    let swing = 0;
    const k = this.player(b.lx) ?? this.nearestPlayer(b.x, b.z);
    if (b.behavior === 'scare') {
      if (k) {
        const a = Math.atan2(k.x - b.x, k.z - b.z);
        b.heading = a;
        if (Math.hypot(k.x - b.x, k.z - b.z) > 2.2) moving = this.movePathGuppy(b, k.x, k.z, 7, dt);
      }
      if (b.mt >= 0.45) {
        b.behavior = 'windup';
        b.mt = 0;
        this.sound('roll');
      }
    } else if (b.behavior === 'windup') {
      const progress = clamp(b.mt / GUPPY_SWING.windup, 0, 1);
      swing = -2.2 * Math.pow(progress, 0.7);
      if (progress >= 1) {
        const x = b.x + Math.sin(b.heading) * GUPPY_SWING.offset;
        const z = b.z + Math.cos(b.heading) * GUPPY_SWING.offset;
        b.behavior = 'recovering';
        b.mt = 0;
        this.sound('swing');
        this.fx.slash({ x: b.x, y: 1.07, z: b.z, heading: b.heading, color: 0xf4b962, radius: 2.95, wide: true, tiltZ: -0.32, spin: 8, dur: 0.26, hdr: 2.5 });
        this.hurtPlayersNear(x, z, GUPPY_SWING.radius, 1.4, 14, b.x, b.z, 11);
      }
    } else if (b.behavior === 'recovering') {
      swing = 0.8 * (1 - clamp(b.mt / 0.57, 0, 1));
      if (b.mt >= 0.57) this.guppyVanish(b, false);
    } else {
      // vanishing: scuttle off into the dark, then gone
      const away = k ? Math.atan2(b.x - k.x, b.z - k.z) : b.heading;
      moving = this.movePathGuppy(b, b.x + Math.sin(away) * 10, b.z + Math.cos(away) * 10, 10, dt);
      if (b.mt >= 1.2) {
        this.fx.dust(b.x, 0.6, b.z, 10, 0x1a1d22, { spread: 1, speed: 3, rise: 2, size0: 0.8, size1: 2.6, life: 0.9 });
        this.bots = this.bots.filter((o) => o !== b);
        return;
      }
    }
    const r = this.resolve(b.x, b.z, b.rad);
    b.x = clamp(r.x, -FOREST_BOUND + b.rad, FOREST_BOUND - b.rad);
    b.z = clamp(r.z, -FOREST_BOUND + b.rad, FOREST_BOUND - b.rad);
    b.ph += moving ? dt * 13 : 0;
    b.moving = moving;
    b.swing = swing;
  }

  /** The jump-scare Guppy retreats; if a pig drove him off, he drops a truffle in his hurry. */
  private guppyVanish(b: PathGuppy, hit: boolean) {
    if (b.behavior === 'vanish') return;
    b.behavior = 'vanish';
    b.mt = 0;
    if (hit) {
      this.spawnTruffle(b.x, b.z, true);
      this.floatText(b.x, 3, b.z, 'EEP!', 'info');
      this.say('Path Guppy', this.pick(['This is MY path! …I\'ll be back!', 'You saw nothing!', 'Gah! Not the snout!']), 2.4);
    } else {
      this.say('Path Guppy', this.pick(['Stay off my path…', 'Heh heh heh…', 'Boo.']), 2.2);
    }
  }

  private hitAlliesNear(x: number, z: number, r: number, dmg: number) {
    for (const a of [...this.allies]) {
      if (a.dying <= 0 && a.hp > 0 && a.inv <= 0 && Math.hypot(a.x - x, a.z - z) < r) this.hurtAlly(a, dmg);
    }
  }

  /** Rebel hogs take real damage and permanently die when their HP hits 0! */
  private hurtAlly(a: Ally, dmg: number) {
    if (a.dying > 0 || a.hp <= 0 || a.inv > 0 || this.overReason) return;
    const armor = 1 - 0.12 * this.levels.hide;
    const d = Math.max(1, Math.round(dmg * armor));
    a.hp = Math.max(0, a.hp - d);
    a.inv = 0.75;
    this.floatText(a.x, 2.15, a.z, `-${d}`, 'hurt');
    this.fx.sparks(a.x, 0.95, a.z, 8, 0xff6a5a, 8, 0.14, 0.3, { hdr: 3.4 });
    if (a.hp <= 0) {
      // Permanent death! Start tumble animation, spawn bandana memorial & rising soul motes
      a.dying = 0.001;
      a.inv = 0;
      this.stats.fallen++;
      this.courseFallen++;
      this.sound('hogdie');
      this.addShake(0.45);
      this.fx.hitBurst(a.x, 1.0, a.z, 0xff4a3c, 1.35);
      this.fx.motes(a.x, 0.9, a.z, 18, 0xfff0b8, 3.2, 0.22, 1.2, -4.5, 4, 0.55, 4.0);
      this.fx.chunks(a.x, 0.9, a.z, 8, 0xc2392b, 7, 0.2, 0.65);
      this.floatText(a.x, 3.1, a.z, `${a.name} fell`, 'hurt hog-callout');
      if (this.area === 'farm') this.memorials.push({ id: this.id(), x: a.x, z: a.z, life: 14 });
      this.say(
        this.rnd() < 0.6 ? (this.players.length > 1 ? 'Kingger' : 'Kenji') : 'Rickley',
        this.pick([
          `NOOO! ${a.name}!! You'll pay for that, Hwang!`,
          `${a.name} fell! Rest easy, brave hog…`,
          `We lost ${a.name}! Watch out for his kitchen bots!`,
          `${a.name} is gone… protect the rest of the herd!`,
        ]),
        3.4,
      );
      this.dirty = true;
    }
  }

  private updateAllies(dt: number) {
    if (!this.allies.length) return;
    const A = this.A;
    const combat = this.mode === 'combat' && ((A.active && A.hp > 0 && !['leaving', 'ko', 'defeated', 'calling'].includes(A.state)) || !!this.earwhen());
    const living = this.allies.filter((a) => a.dying <= 0);
    const n = Math.max(1, living.length);
    const lead = this.living()[0] ?? this.players[0];
    let slot = 0;

    this.allies = this.allies.filter((a) => {
      // Permanent death tumble -> fade into spirit sparks and remove forever
      if (a.dying > 0) {
        a.dying += dt;
        if (a.dying >= 0.9) {
          this.fx.motes(a.x, 0.7, a.z, 10, 0xffe8a3, 2.6, 0.18, 0.9, -4, 3, 0.4, 3.8);
          return false;
        }
        return true;
      }

      const mySlot = slot++;
      a.inv = Math.max(0, a.inv - dt);
      a.cd -= dt;
      a.atk = Math.max(0, a.atk - dt);

      // Instinctively back away from a lit Kettle Bomber if close!
      let fleeBomber: Bot | null = null;
      if (combat) {
        for (const b of this.bots) {
          if (b.kind === 'bomber' && b.mode === 'fuse' && Math.hypot(b.x - a.x, b.z - a.z) < 4.2) {
            fleeBomber = b;
            break;
          }
        }
      }

      let foe: { x: number; z: number; bot: Bot | null; pot: Pot | null } | null = null;
      if (combat && !fleeBomber) {
        let bd = 8.5;
        for (const b of this.bots) {
          if (b.kind === 'bomber' && b.mode === 'fuse') continue;
          const d = Math.hypot(b.x - a.x, b.z - a.z);
          if (d < bd) {
            bd = d;
            foe = { x: b.x, z: b.z, bot: b, pot: null };
          }
        }
        if (!foe && A.shielded) {
          let pd = 40;
          for (const p of this.pots) {
            const d = Math.hypot(p.x - a.x, p.z - a.z);
            if (d < pd) {
              pd = d;
              foe = { x: p.x, z: p.z, bot: null, pot: p };
            }
          }
        } else if (!foe && A.state !== 'spin' && Math.hypot(A.x - a.x, A.z - a.z) < 14) {
          foe = { x: A.x, z: A.z, bot: null, pot: null };
        }
      }

      let tx: number;
      let tz: number;
      let speed: number;
      let stop: number;
      if (fleeBomber) {
        // slightly slower panic trot so bombers are still lethal if the herd doesn't swat them away!
        const fx = a.x - fleeBomber.x;
        const fz = a.z - fleeBomber.z;
        const fl = Math.hypot(fx, fz) || 1;
        tx = a.x + (fx / fl) * 4;
        tz = a.z + (fz / fl) * 4;
        speed = 5.2;
        stop = 0.2;
      } else if (foe) {
        tx = foe.x;
        tz = foe.z;
        speed = 9.2;
        stop = foe.bot ? 1.85 + foe.bot.rad * 0.3 : foe.pot ? 1.5 : 2.65;
      } else {
        // the squad trots behind the first pig still standing
        const ang = (lead?.heading ?? PI) + PI + (mySlot - (n - 1) / 2) * 0.75;
        const lx = lead?.x ?? a.x;
        const lz = lead?.z ?? a.z;
        tx = lx + Math.sin(ang) * 2.4;
        tz = lz + Math.cos(ang) * 2.4;
        speed = Math.hypot(tx - a.x, tz - a.z) > 6 ? 13 : 8.5;
        stop = 0.6;
      }
      const dx = tx - a.x;
      const dz = tz - a.z;
      const d = Math.hypot(dx, dz);
      let moving = false;
      if (!foe && !fleeBomber && this.area === 'forest' && d > 25) {
        const pos = this.safePosition(tx, tz, 0.6);
        a.x = pos.x;
        a.z = pos.z;
      }
      if (d > stop) {
        const s = Math.min(d - stop, speed * dt);
        a.x += (dx / d) * s;
        a.z += (dz / d) * s;
        a.heading = angLerp(a.heading, Math.atan2(dx, dz), 10 * dt);
        moving = true;
      }
      if (foe && d < (foe.bot ? 2.4 + foe.bot.rad * 0.35 : foe.pot ? 2.3 : 3.2) && a.cd <= 0) {
        if (foe.bot) {
          if (foe.bot.hp > 0) this.damageBot(foe.bot, 11 + 2 * this.course, (dx / (d || 1)) * 5, (dz / (d || 1)) * 5);
        } else if (foe.pot) {
          this.damagePot(foe.pot, 8 + 2 * this.course);
        } else {
          this.damageAllen(6 + 1.5 * this.course, 7, { minor: true, fx: a.x, fz: a.z });
        }
        a.cd = 1.75;
        a.atk = 0.25;
        a.heading = Math.atan2(dx, dz);
        this.sound('hit');
      }
      // keep the squad from stacking on top of each other, the pigs and Allen
      for (const o of this.allies) {
        if (o === a || o.dying > 0 || o.hp <= 0) continue;
        const ox = a.x - o.x;
        const oz = a.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od < 1.25 && od > 0.001) {
          a.x += (ox / od) * (1.25 - od) * 0.5;
          a.z += (oz / od) * (1.25 - od) * 0.5;
        }
      }
      for (const k of this.players) {
        const kx = a.x - k.x;
        const kz = a.z - k.z;
        const kd = Math.hypot(kx, kz);
        if (kd < 1.5 && kd > 0.001) {
          a.x += (kx / kd) * (1.5 - kd);
          a.z += (kz / kd) * (1.5 - kd);
        }
      }
      if (A.active && A.hp > 0) {
        const ax = a.x - A.x;
        const az = a.z - A.z;
        const ad = Math.hypot(ax, az);
        if (ad < 2.3 && ad > 0.001) {
          a.x += (ax / ad) * (2.3 - ad);
          a.z += (az / ad) * (2.3 - ad);
        }
      }
      const r = this.resolve(a.x, a.z, 0.55);
      const bound = this.mapBound();
      a.x = clamp(r.x, -bound, bound);
      a.z = clamp(r.z, -bound, bound);
      a.ph += dt * (moving ? 10 : 0);
      a.moving = moving;
      return true;
    });
  }
}
