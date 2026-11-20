/**
 * Client side of online play: a stand-in for `Sim` that mirrors the server's simulation.
 *
 * It buffers the server's snapshots and renders the shared world INTERP_DELAY behind the newest one,
 * blending positions between snapshots so movement stays smooth at any frame rate.
 *
 * Your own pig is yours: a private copy of the simulation (`shadow`) runs its movement and moves every
 * frame against the newest world the server sent, so controls respond instantly. Each frame the pig's
 * state, the moves it made and the effects it showed go to the server, which replays the moves against
 * the shared world and passes the effects on to everyone else. The server still owns health; it tells
 * this pig when it got hit (`knock`) and moves it by force (respawn, travel) by bumping its epoch.
 */
import type { ComboId, GameOverReason, HogName, Plot, UpgradeId } from '../data';
import { GARDEN_PLOTS } from '../layout';
import { emptyLevels } from '../data';
import type { Collider } from '../layout';
import { Sim, emptyComboUses, newAllen, newPlayer, poseOf, type AllenState } from '../sim/Sim';
import type { EdibleState, GameSim } from '../sim/gameSim';
import { ALLEN_ID, NO_INPUT, POSE_KEYS, type Ally, type Area, type Bot, type Decoy, type Hazard, type Kernel, type Memorial, type Pickup, type Player, type PlayerInput, type Pot, type Proj, type Puddle, type Shock, type SimEvent, type SimMaps, type Strike, type Wild } from '../sim/types';
import { INTERP_DELAY, KEYS, LISTS, TICK_HZ, pack, unpack, type ClientMsg, type Hot, type Meta, type ServerMsg, type Stats, type WireStrike } from './protocol';

const TAU = Math.PI * 2;
const angLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
};

interface Frame {
  st: number;
  /** Client clock when it arrived. */
  at: number;
  players: Player[];
  allen: Partial<AllenState>;
  lists: Record<string, { id: number }[]>;
  hot: Hot;
}

type Positioned = { id: number; x: number; z: number; y?: number; heading?: number };

export class NetSim implements GameSim {
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
  edibles: EdibleState[];

  time = 0;
  area: Area = 'farm';
  mode: 'intermission' | 'combat' = 'intermission';
  course = 0;
  tod = 0;
  levels = emptyLevels();
  repairCount = 0;
  truffles = 0;
  plots: Plot[] = GARDEN_PLOTS.map((p, i) => ({ id: i, x: p.x, z: p.z, g: 0, planted: false, wet: 0, gold: false }));
  rank = 1;
  xp = 0;
  comboUses: Record<ComboId, number> = emptyComboUses();
  stats: Stats = { time: 0, dealt: 0, taken: 0, earned: 0, fallen: 0, ko: 0 };
  recruitedHogs = new Set<HogName>();
  hunt: { total: number; found: number; tx: number; tz: number; done: boolean } | null = null;
  forestHint = '';
  sniffCd = 0;
  sniffTime = 0;
  sniffTargetId = -1;
  overReason: GameOverReason | null = null;
  outcome: 'gameover' | 'victory' | null = null;
  subtitle: { who: string; text: string; t: number } | null = null;
  banner: { title: string; sub: string; key: number; t: number } | null = null;
  opening: { step: number; t: number } | null = null;
  kingCast = 0;
  turretYaw = 0;
  hitstop = 0;
  dirty = true;
  allenPlayer = false;
  allenPrompt: string | null = null;
  allenBreak = 0;
  /** This browser plays Allen: send his controls instead of driving a pig. */
  allenMode = false;

  /** The pig this browser controls. */
  readonly localId: number;
  private send: (m: ClientMsg) => void;
  private maps: SimMaps;
  private forestColliders: Collider[] | null = null;
  private frames: Frame[] = [];
  private renderT: number | null = null;
  private clock = 0;
  private pending: { st: number; ev: SimEvent[] }[] = [];
  private ready: SimEvent[] = [];
  private meta: Meta | null = null;
  private playerMeta = new Map<number, Record<string, unknown>>();
  private allenMeta: Partial<AllenState> = {};
  private btn = 0;
  private sendT = 0;
  /** Private simulation that runs this browser's pig. */
  private shadow: Sim;
  /** This browser's pig, as it drives it. */
  private pig: Player | null = null;
  private strikes: Strike[] = [];
  private relayOut: SimEvent[] = [];
  /** Set after closing a shop until the server confirms it, so the shop doesn't flash back open. */
  private closingShop = false;

  constructor(localId: number, maps: SimMaps, send: (m: ClientMsg) => void) {
    this.localId = localId;
    this.maps = maps;
    this.send = send;
    this.edibles = maps.farm.edibles.map((e) => ({ id: e.id, name: e.name, x: e.x, z: e.z, hp: e.maxHp, maxHp: e.maxHp }));
    // the shadow adds its own NPC colliders, so give it its own list
    this.shadow = new Sim({ ...maps, farm: { ...maps.farm, colliders: [...maps.farm.colliders] } });
  }

  /* ───────── incoming ───────── */

  /** Feeds one server message in. */
  receive(msg: Extract<ServerMsg, { t: 's' }>) {
    if (msg.meta) this.applyMeta(msg.meta);
    if (msg.stats) this.stats = msg.stats;
    const lists: Record<string, { id: number }[]> = {};
    LISTS.forEach((k, i) => (lists[k] = (msg.hot.lists[i] ?? []).map((a) => unpack<{ id: number }>(a, KEYS[k]))));
    const frame: Frame = {
      st: msg.st,
      at: this.clock,
      players: msg.hot.players.map((a) => this.withPlayerMeta(unpack<Player>(a, KEYS.player))),
      allen: unpack<Partial<AllenState>>(msg.hot.allen, KEYS.allen),
      lists,
      hot: msg.hot,
    };
    // a restarted room (new run) starts its clock again
    if (this.frames.length && frame.st < this.frames[this.frames.length - 1].st) {
      this.frames = [];
      this.renderT = null;
    }
    this.frames.push(frame);
    if (this.frames.length > 12) this.frames.shift();
    const ev: SimEvent[] = [];
    for (const e of msg.ev) {
      // knockback for our own pig applies right away; it's ours to move
      if (e.t === 'knock') {
        if (e.only === this.localId && this.pig) this.shadow.applyKnock(this.localId, e.fx, e.fz, e.knock, e.dodge);
      } else ev.push(e);
    }
    for (const r of msg.rev ?? []) if (r.by !== this.localId) ev.push(...r.ev);
    if (ev.length) this.pending.push({ st: msg.st, ev });
    this.adoptServerPig(frame);
    // with no frame drawn yet (title screen), show the newest state straight away
    if (this.renderT === null) this.present(frame, frame, 1);
  }

  /**
   * Takes over the server's version of our pig when it moved it by force (or when we first see it).
   * Health always comes from the server.
   */
  private adoptServerPig(frame: Frame) {
    const srv = frame.players.find((p) => p.id === this.localId);
    if (!srv || this.allenMode) return;
    if (!this.pig || srv.epoch > this.pig.epoch) {
      const pig = this.pig ?? newPlayer(this.localId, srv.name, srv.tint);
      for (const k of POSE_KEYS) (pig as unknown as Record<string, unknown>)[k] = (srv as unknown as Record<string, unknown>)[k] ?? (pig as unknown as Record<string, unknown>)[k];
      pig.epoch = srv.epoch;
      this.pig = pig;
      this.strikes = [];
    }
    const pig = this.pig;
    pig.hp = srv.hp;
    pig.maxHp = srv.maxHp ?? pig.maxHp;
    pig.maxStam = srv.maxStam ?? pig.maxStam;
    pig.hurtTick = srv.hurtTick;
    pig.prompt = srv.prompt;
    pig.shopNpc = srv.shopNpc;
    pig.name = srv.name;
    pig.tint = srv.tint;
    if (srv.action === 'dead' && pig.action !== 'dead') pig.action = 'dead';
  }

  /** Points the shadow simulation at the newest world the server sent, with our own pig in it. */
  private mirror(f: Frame) {
    const sh = this.shadow;
    const pig = this.pig!;
    const copy = <T,>(list: { id: number }[] | undefined) => (list ?? []).map((e) => ({ ...e })) as unknown as T[];
    if (sh.area !== this.area) sh.showArea(this.area);
    sh.mode = this.mode;
    sh.course = this.course;
    sh.setLevels(this.levels);
    sh.rank = this.rank;
    sh.comboUses = this.comboUses;
    sh.kernels = copy<Kernel>(f.lists.kernel);
    sh.hunt = this.hunt;
    sh.overReason = this.overReason;
    sh.recruitedHogs = this.recruitedHogs;
    this.edibles.forEach((e, i) => sh.edibles[i] && (sh.edibles[i].hp = e.hp));
    sh.players = [pig, ...f.players.filter((p) => p.id !== this.localId).map((p) => ({ ...p }))];
    sh.bots = copy<Bot>(f.lists.bot);
    sh.projs = copy<Proj>(f.lists.proj);
    sh.puddles = copy<Puddle>(f.lists.puddle);
    sh.pots = copy<Pot>(f.lists.pot);
    sh.wild = copy<Wild>(f.lists.wild);
    sh.allies = copy<Ally>(f.lists.ally);
    sh.decoys = copy<Decoy>(f.lists.decoy);
    sh.shocks = [];
    sh.pickups = [];
    Object.assign(sh.A, this.allenMeta, f.allen);
    if (sh.A.target === undefined) sh.A.target = -1;
  }

  private withPlayerMeta(p: Player): Player {
    const m = this.playerMeta.get(p.id);
    if (m) Object.assign(p, m);
    p.prompt ??= null;
    p.shopNpc ??= null;
    if (p.id === this.localId && this.closingShop) {
      if (!p.shopNpc) this.closingShop = false;
      p.shopNpc = null;
    }
    p.chargeHit = new Set();
    return p;
  }

  private applyMeta(m: Meta) {
    const prev = this.meta;
    this.meta = m;
    this.area = m.area;
    this.mode = m.mode;
    this.course = m.course;
    this.tod = m.tod;
    this.levels = m.levels;
    this.repairCount = m.repairCount;
    this.truffles = m.truffles;
    if (m.grind) {
      this.rank = m.grind.rank;
      this.xp = m.grind.xp;
      this.comboUses = { ...emptyComboUses(), ...(m.grind.combos as Record<ComboId, number>) };
      m.grind.plots.forEach(([planted, g, wet, gold], i) => {
        const pl = this.plots[i];
        if (!pl) return;
        pl.planted = !!planted;
        pl.g = g;
        pl.wet = wet ? 1 : 0;
        pl.gold = !!gold;
      });
    }
    this.recruitedHogs = new Set(m.recruited as HogName[]);
    this.hunt = m.hunt;
    this.forestHint = m.forestHint;
    this.overReason = m.overReason as GameOverReason | null;
    this.outcome = m.outcome;
    this.allenPlayer = m.allenPlayer;
    this.allenPrompt = m.allenPrompt;
    this.allenBreak = m.allenBreak;
    this.subtitle = m.subtitle ? { ...m.subtitle, t: 1 } : null;
    this.banner = m.banner ? { ...m.banner, t: 1 } : null;
    m.edibleHp.forEach((hp, i) => {
      const e = this.edibles[i];
      if (!e) return;
      e.hp = hp;
      const c = this.maps.farm.edibles[i]?.collider;
      if (c) c.enabled = hp > 0;
    });
    this.playerMeta.clear();
    for (const a of m.players) {
      const pm = unpack<Record<string, unknown>>(a, KEYS.playerMeta);
      this.playerMeta.set(pm.id as number, pm);
    }
    this.allenMeta = unpack<Partial<AllenState>>(m.allen, KEYS.allenMeta);
    if (m.area === 'forest' && !this.forestColliders) this.forestColliders = this.maps.loadForest().colliders;
    if (!prev || prev.area !== m.area) this.dirty = true;
    this.dirty = true;
  }

  /* ───────── per frame ───────── */

  step(dt: number, inputs?: Map<number, PlayerInput>) {
    this.clock += dt;
    const inp = inputs?.get(this.allenMode ? ALLEN_ID : this.localId) ?? NO_INPUT;
    this.btn |= inp.buttons;
    if (this.allenMode) {
      // playing Allen: the server moves him; we send the stick and buttons
      this.sendT -= dt;
      if (this.sendT <= 0 || this.btn) {
        this.send({ t: 'ain', mx: Math.round(inp.mx * 100) / 100, mz: Math.round(inp.mz * 100) / 100, b: this.btn });
        this.btn = 0;
        this.sendT = 1 / TICK_HZ;
      }
    }
    const frames = this.frames;
    if (!frames.length) return;
    const newest = frames[frames.length - 1];

    // our own pig: move it right here against the newest world, and note every move it makes
    if (this.pig && !this.allenMode) {
      this.mirror(newest);
      this.shadow.predict(this.localId, dt, inp, (s) => this.strikes.push(s));
      for (const e of this.shadow.drainEvents()) {
        this.ready.push(e);
        // personal cues (the "denied" buzz) stay ours; everything else others should see too
        if (!('only' in e && e.only !== undefined)) this.relayOut.push(e);
      }
      this.sendT -= dt;
      if (this.sendT <= 0 || this.strikes.length || this.btn) {
        const k: WireStrike[] = this.strikes.map((s) => [s.fn, s.arg, pack(s.pose, POSE_KEYS)]);
        this.send({ t: 'pose', ep: this.pig.epoch, p: pack(poseOf(this.pig), POSE_KEYS), b: this.btn, k, ev: this.relayOut.slice(-80) });
        this.strikes = [];
        this.relayOut = [];
        this.btn = 0;
        this.sendT = 1 / TICK_HZ;
      }
    }

    const target = newest.st - INTERP_DELAY;
    if (this.renderT === null || Math.abs(this.renderT - target) > 0.6) this.renderT = target;
    else this.renderT += dt + (target - this.renderT) * Math.min(1, dt * 2);
    const rt = this.renderT;
    let a = frames[0];
    let b = newest;
    for (let i = 0; i < frames.length - 1; i++) {
      if (frames[i].st <= rt && frames[i + 1].st >= rt) {
        a = frames[i];
        b = frames[i + 1];
        break;
      }
    }
    if (rt >= newest.st) a = b = newest;
    const span = b.st - a.st;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (rt - a.st) / span)) : 1;
    this.present(a, b, alpha);

    // playing Allen: draw him from the newest snapshot, without the interpolation delay
    if (this.allenMode && newest.allen.active) Object.assign(this.A, this.allenMeta, newest.allen);

    // the local pig is drawn exactly as this browser drives it
    if (this.pig) {
      const i = this.players.findIndex((p) => p.id === this.localId);
      if (i >= 0) this.players[i] = { ...this.pig };
    }

    // release events once the moment they happened is on screen
    while (this.pending.length && this.pending[0].st <= rt + 1e-6) this.ready.push(...this.pending.shift()!.ev);
    if (this.pending.length > 90) this.ready.push(...this.pending.splice(0, this.pending.length - 90).flatMap((p) => p.ev));
  }

  private present(a: Frame, b: Frame, t: number) {
    this.time = b.st;
    const blend = <T extends Positioned>(from: T[], to: T[]): T[] => {
      if (t >= 1) return to.map((e) => ({ ...e }));
      const prev = new Map(from.map((e) => [e.id, e]));
      return to.map((e) => {
        const p = prev.get(e.id);
        if (!p) return { ...e };
        const o = { ...e, x: p.x + (e.x - p.x) * t, z: p.z + (e.z - p.z) * t };
        if (e.y !== undefined && p.y !== undefined) o.y = p.y + (e.y - p.y) * t;
        if (e.heading !== undefined && p.heading !== undefined) o.heading = angLerp(p.heading, e.heading, t);
        return o;
      });
    };
    this.players = blend(a.players, b.players);
    const lists: Record<string, Positioned[]> = {};
    for (const k of LISTS) lists[k] = blend((a.lists[k] ?? []) as Positioned[], (b.lists[k] ?? []) as Positioned[]);
    this.bots = lists.bot as unknown as Bot[];
    this.projs = lists.proj as unknown as Proj[];
    this.puddles = lists.puddle as unknown as Puddle[];
    this.shocks = lists.shock as unknown as Shock[];
    this.pickups = lists.pickup as unknown as Pickup[];
    this.kernels = lists.kernel as unknown as Kernel[];
    this.pots = lists.pot as unknown as Pot[];
    this.hazards = lists.hazard as unknown as Hazard[];
    this.memorials = lists.memorial as unknown as Memorial[];
    this.wild = lists.wild as unknown as Wild[];
    this.allies = lists.ally as unknown as Ally[];
    this.decoys = lists.decoy as unknown as Decoy[];
    const A = Object.assign(this.A, this.allenMeta, b.allen);
    if (t < 1 && a.allen.active && b.allen.active) {
      A.x = a.allen.x! + (b.allen.x! - a.allen.x!) * t;
      A.y = a.allen.y! + (b.allen.y! - a.allen.y!) * t;
      A.z = a.allen.z! + (b.allen.z! - a.allen.z!) * t;
      A.heading = angLerp(a.allen.heading!, b.allen.heading!, t);
    }
    if (A.target === undefined) A.target = -1;
    const h = b.hot;
    this.sniffCd = h.sniffCd;
    this.sniffTime = h.sniffTime;
    this.sniffTargetId = h.sniffTargetId;
    this.kingCast = h.kingCast;
    this.turretYaw = h.turretYaw;
    this.hitstop = h.hitstop;
    const op = h.op ? { step: h.op[0], t: h.op[1] } : null;
    if (!!op !== !!this.opening || (op && this.opening && op.step !== this.opening.step)) this.dirty = true;
    this.opening = op;
  }

  drainEvents(): SimEvent[] {
    const e = this.ready;
    this.ready = [];
    return e;
  }

  /** Forget buffered snapshots (e.g. after the tab was hidden) so rendering snaps to the present. */
  resync() {
    this.renderT = null;
    this.ready.push(...this.pending.flatMap((p) => p.ev).filter((e) => e.t === 'area' || e.t === 'teleport'));
    this.pending = [];
  }

  /* ───────── queries ───────── */

  player(id: number) {
    return this.players.find((p) => p.id === id);
  }

  living() {
    return this.players.filter((p) => p.action !== 'dead');
  }

  colliders(): Collider[] {
    return this.area === 'forest' && this.forestColliders ? this.forestColliders : this.maps.farm.colliders;
  }

  flowBonusPct(p: Player): number {
    if (p.flowCount < 2 || p.flowTimer <= 0) return 0;
    const per = this.levels.riverrush >= 2 ? 7 : 4;
    const cap = this.levels.riverrush >= 2 ? 42 : 24;
    return Math.min(cap, (p.flowCount - 1) * per);
  }

  livingAlliesCount() {
    return this.allies.filter((a) => a.dying <= 0 && a.hp > 0).length;
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

  /* ───────── commands (sent to the server) ───────── */

  start() {
    this.send({ t: 'start' });
  }
  finishOpening() {
    if (this.opening) this.send({ t: 'opening', skip: true });
  }
  advanceOpening() {
    if (this.opening) this.send({ t: 'opening', skip: false });
  }
  retryCourse() {
    this.send({ t: this.overReason ? 'retry' : 'restart' });
  }
  restart() {
    this.send({ t: 'restart' });
  }
  /** Host: end the run and bring everyone back to the room's lobby. */
  toLobby() {
    this.send({ t: 'lobby' });
  }
  returnToFarm() {
    this.send({ t: 'farm' });
  }
  closeShop() {
    this.closingShop = true;
    const me = this.player(this.localId);
    if (me) me.shopNpc = null;
    this.send({ t: 'closeShop' });
  }
  buy(_pid: number, id: UpgradeId) {
    this.send({ t: 'buy', id });
  }
  setBots(n: number) {
    this.send({ t: 'bots', n });
  }
}
