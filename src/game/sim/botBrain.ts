/**
 * Stand-in players: a small AI that produces the same PlayerInput a person would. Used to fill a herd for
 * local testing (`?bots=N` in the browser), on the server for empty seats, and by the headless tests.
 *
 * A bot pig walks planned routes round fences, buildings and trees; between courses it picks up nearby
 * truffles and goes shopping for random upgrades it can afford (leaving some truffles for the rest of the
 * herd); in a fight it reads telegraphs and incoming shots, gets out of the way (rolling through when it
 * has to), piles in when the boss is stunned or winded, and uses whatever abilities the herd has bought.
 */
import { COURSES, UPGRADES, costOf, maxLevel, type NpcId, type UpgradeId } from '../data';
import { BOUND, FOREST_BOUND, SPOT } from '../layout';
import type { GameSim } from './gameSim';
import { PathFollower } from './nav';
import { BTN, type EarwhenBot, type Player, type PlayerInput, type Proj } from './types';

/** Gravity on arcing shots (chili, Mega Dollops, robots); matches the Sim. */
const PROJ_GRAV = 22;
/** How far a landing shot hurts, by kind, plus a little margin. */
const LAND_R: Partial<Record<Proj['kind'], number>> = { chili: 2.3, blob: 3.6, robot: 3.8 };
/** Where to stand to talk to each shopkeeper. */
const SHOP_SPOT: Record<NpcId, { x: number; z: number }> = {
  rickley: { x: SPOT.rickley.x, z: SPOT.rickley.z + 3 },
  kingger: { x: SPOT.kingger.x - 3, z: SPOT.kingger.z },
  trout: SPOT.troutDock,
  kioff: { x: SPOT.kioff.x - 3, z: SPOT.kioff.z + 1 },
  charig: { x: SPOT.charig.x, z: SPOT.charig.z + 3 },
};
/** Allen's moves that hurt to be near, and how far they reach. */
const ALLEN_DANGER: Record<string, number> = { slamWind: 7.5, slamAir: 7.5, dashWind: 9, dash: 6, spinWind: 7, spin: 7 };
/** Allen's states where he can't fight back: go all in. */
const ALLEN_OPEN = new Set(['stunned', 'recover', 'eating', 'toEat', 'summon', 'rainCast']);

interface Shopping {
  npc: NpcId;
  id: UpgradeId;
  /** Seconds since we started on this errand (give up if it takes too long). */
  t: number;
  /** Seconds the shop has been open. */
  open: number;
  bought: boolean;
}

interface Memory {
  nav: PathFollower;
  strafe: number;
  flipT: number;
  attackT: number;
  wanderX: number;
  wanderZ: number;
  wanderT: number;
  /** Seconds spent chasing truffles without picking one up; after a while the bot gives up for a bit. */
  chaseT: number;
  ignoreT: number;
  /** Seconds idling on the farm with nothing to pick up. */
  idleT: number;
  truffles: number;
  /** Seconds before this bot thinks about shopping again. */
  shopCd: number;
  shop: Shopping | null;
  /** The garden plot this bot is off to tend, and seconds before it thinks about the garden again. */
  plot: number;
  gardenCd: number;
  /** A dodge in progress: keep moving this way for a moment instead of dithering. */
  dodgeX: number;
  dodgeZ: number;
  dodgeT: number;
  /** Reaction delay: a bot notices a new threat a beat late, like a person would. */
  react: number;
  /** 0.6–1.4: how keen this bot is to get stuck in (and how carefully it dodges). */
  nerve: number;
  /** Seconds before it may use another ability, so it doesn't dump everything at once. */
  abilityT: number;
}

export interface BotBrainOptions {
  /** Ring the dinner bell when nobody else does (headless runs have no humans to do it). */
  ringBell?: boolean;
  /** Seconds to idle on the farm before walking to the bell. */
  bellDelay?: number;
  /** Let bots spend the herd's truffles in the shops (default on). */
  shop?: boolean;
}

export class BotBrain {
  private mem = new Map<number, Memory>();
  private opts: BotBrainOptions;
  private seed = 1;

  constructor(opts: BotBrainOptions = {}) {
    this.opts = opts;
  }

  private rnd() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    return (this.seed >>> 0) / 4294967296;
  }

  private memory(sim: GameSim, p: Player): Memory {
    let m = this.mem.get(p.id);
    if (!m) {
      m = {
        nav: new PathFollower(),
        strafe: p.id % 2 ? 1 : -1,
        flipT: 2,
        attackT: 0,
        wanderX: p.x,
        wanderZ: p.z,
        wanderT: 0,
        chaseT: 0,
        ignoreT: 0,
        idleT: 0,
        truffles: sim.truffles,
        shopCd: 2 + this.rnd() * 4,
        shop: null,
        plot: -1,
        gardenCd: 3 + this.rnd() * 6,
        dodgeX: 0,
        dodgeZ: 0,
        dodgeT: 0,
        react: 0,
        nerve: 0.6 + this.rnd() * 0.8,
        abilityT: 0,
      };
      this.mem.set(p.id, m);
    }
    return m;
  }

  /** A random upgrade the herd can afford without spending everything, or null. */
  private pickUpgrade(sim: GameSim): { id: UpgradeId; npc: NpcId } | null {
    // leave a good share of the pot for everyone else (people included)
    const budget = sim.truffles * 0.55;
    const options = UPGRADES.filter((u) => {
      const lvl = sim.levels[u.id];
      if (lvl >= maxLevel(u)) return false;
      if (u.repeatable && sim.farmPct() > 80) return false;
      return costOf(u, lvl, sim.repairCount) <= budget;
    });
    if (!options.length) return null;
    // a slight lean toward things the herd doesn't have yet
    const weighted = options.flatMap((u) => (sim.levels[u.id] === 0 ? [u, u] : [u]));
    const u = weighted[Math.floor(this.rnd() * weighted.length)];
    return { id: u.id, npc: u.npc };
  }

  /** Inputs for one step for the given bot-controlled player. */
  think(sim: GameSim, p: Player, dt: number): PlayerInput {
    const out: PlayerInput = { mx: 0, mz: 0, buttons: 0 };
    if (p.action === 'dead' || sim.opening) {
      if (p.action === 'dead') this.mem.get(p.id)?.nav.reset();
      return out;
    }
    const m = this.memory(sim, p);
    m.flipT -= dt;
    m.attackT -= dt;
    m.dodgeT -= dt;
    m.abilityT -= dt;
    if (m.flipT <= 0) {
      m.flipT = 1.5 + this.rnd() * 2.5;
      m.strafe = -m.strafe;
    }
    const bound = sim.area === 'forest' ? FOREST_BOUND - 2 : BOUND - 1;
    const steerDirect = (tx: number, tz: number, stopAt = 0.5) => {
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > stopAt) {
        out.mx = dx / d;
        out.mz = dz / d;
      }
      return d;
    };
    /** Walk to (tx, tz) the long way round if something's in the way. */
    const go = (tx: number, tz: number, stopAt = 0.5) => {
      const d = Math.hypot(tx - p.x, tz - p.z);
      if (d <= stopAt) return d;
      const wp = m.nav.next(sim.colliders(), bound, p.x, p.z, tx, tz, dt);
      steerDirect(wp.x, wp.z, 0.05);
      return d;
    };
    const flee = (fx: number, fz: number) => {
      const dx = p.x - fx;
      const dz = p.z - fz;
      const d = Math.hypot(dx, dz) || 1;
      out.mx = dx / d + (-dz / d) * 0.4 * m.strafe;
      out.mz = dz / d + (dx / d) * 0.4 * m.strafe;
      // don't back into the fence
      if (Math.abs(p.x) > bound - 3) out.mx = -Math.sign(p.x) * 0.6;
      if (Math.abs(p.z) > bound - 3) out.mz = -Math.sign(p.z) * 0.6;
    };
    const roll = (chance = 1) => {
      if (p.stam > 30 && (p.action === 'none' || p.action === 'attack') && this.rnd() < chance) out.buttons |= BTN.roll;
    };
    const dodge = (dx: number, dz: number, secs: number) => {
      const d = Math.hypot(dx, dz) || 1;
      m.dodgeX = dx / d;
      m.dodgeZ = dz / d;
      m.dodgeT = secs;
    };

    // ── things to get out of the way of, wherever we are ──
    // shockwaves rolling out toward us: time the jump so we're up when the ring passes (or roll through it)
    for (const s of sim.shocks) {
      if (!s.hostile || s.hitPlayers?.has(p.id)) continue;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < s.r - 0.5 || d > s.maxR + 1) continue;
      const arrive = (d - s.r) / Math.max(1, s.speed);
      if (arrive > 0.1 && arrive < 0.42) out.buttons |= BTN.jump;
      else if (arrive <= 0.1 && p.grounded) roll();
    }
    // a committed dodge: keep going
    if (m.dodgeT > 0) {
      out.mx = m.dodgeX;
      out.mz = m.dodgeZ;
      return out;
    }
    for (const h of sim.hazards) {
      if (Math.hypot(p.x - h.x, p.z - h.z) < h.r + 1) {
        flee(h.x, h.z);
        return out;
      }
    }
    if (this.dodgeShots(sim, p, m, dt, out, dodge, roll)) return out;
    // kitchen bots winding up: a Tenderizer's slam lands where it marked; a Skewer Hound lunges straight ahead
    for (const b of sim.bots) {
      if (b.kind === 'tenderizer' && b.mode === 'wind' && Math.hypot(p.x - b.lx, p.z - b.lz) < 4.3) {
        flee(b.lx, b.lz);
        if (Math.hypot(p.x - b.lx, p.z - b.lz) < 2.5) roll(dt * 8);
        return out;
      }
      if (b.kind === 'skewer' && b.mode === 'wind') {
        const hx = Math.sin(b.heading);
        const hz = Math.cos(b.heading);
        const along = (p.x - b.x) * hx + (p.z - b.z) * hz;
        const off = (p.x - b.x) * hz - (p.z - b.z) * hx;
        if (along > 0 && along < 16 && Math.abs(off) < 1.8) {
          const side = off >= 0 ? 1 : -1;
          dodge(hz * side, -hx * side, 0.3);
          out.mx = m.dodgeX;
          out.mz = m.dodgeZ;
          return out;
        }
      }
      if (b.kind === 'bomber' && b.mode === 'fuse' && Math.hypot(b.x - p.x, b.z - p.z) < 6) {
        flee(b.x, b.z);
        return out;
      }
    }
    // don't stand around in chili or cream puddles
    for (const pd of sim.puddles) {
      if (Math.hypot(p.x - pd.x, p.z - pd.z) < pd.r + 0.4) {
        flee(pd.x, pd.z);
        return out;
      }
    }

    const A = sim.A;
    // Allen, if he's up and fighting; Earwhen, in his stages
    const allen = A.active && !['ko', 'defeated', 'leaving', 'gone', 'calling', 'backrooms'].includes(A.state);
    const W = sim.bots.find((b): b is EarwhenBot => b.kind === 'earwhen' && b.act !== 'arrive');
    if (sim.mode === 'combat' && (allen || W || sim.bots.length)) {
      m.shop = null;
      if (p.shopNpc) sim.closeShop(p.id);
      return this.fight(sim, p, m, dt, out, { allen, W, go, steerDirect, flee, roll, dodge });
    }

    if (sim.area === 'forest') {
      const lead = sim.players.find((o) => o.id !== p.id && o.action !== 'dead');
      if (lead) go(lead.x + Math.sin(p.id) * 3, lead.z + Math.cos(p.id) * 3, 1.5);
      return out;
    }

    // ── intermission on the farm ──
    m.shopCd -= dt;
    m.ignoreT -= dt;
    if (this.gardening(sim, p, m, dt, out, go)) return out;
    if (this.opts.shop !== false && this.shopping(sim, p, m, dt, out, go)) return out;

    // truffles lying close by
    if (sim.truffles !== m.truffles) {
      m.truffles = sim.truffles;
      m.chaseT = 0;
    }
    if (m.chaseT > 6) {
      // that one must be out of reach (in the lake, say): leave truffles alone for a while
      m.chaseT = 0;
      m.ignoreT = 12;
    }
    let best = Infinity;
    let px = 0;
    let pz = 0;
    for (const t of m.ignoreT > 0 ? [] : sim.pickups) {
      if (t.area !== 'farm') continue;
      const dd = Math.hypot(t.x - p.x, t.z - p.z);
      if (dd < best && dd < 16) {
        best = dd;
        px = t.x;
        pz = t.z;
      }
    }
    if (best < Infinity) {
      m.chaseT += dt;
      go(px, pz, 0.3);
      return out;
    }
    m.idleT += dt;
    if (this.opts.ringBell && m.idleT > (this.opts.bellDelay ?? 2)) {
      if (go(SPOT.bell.x, SPOT.bell.z + 2, 1) < 3.5) {
        out.buttons |= BTN.interact;
        m.idleT = 0;
      }
      return out;
    }
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = 2 + this.rnd() * 3;
      m.wanderX = SPOT.start.x + (this.rnd() - 0.5) * 14;
      m.wanderZ = SPOT.start.z + (this.rnd() - 0.5) * 10;
    }
    go(m.wanderX, m.wanderZ, 1);
    return out;
  }

  /**
   * Rickley's garden: harvest anything ripe, water dry plots, plant empty ones while the herd has truffles
   * to spare. One chore at a time, then off to do something else for a bit. True while busy with it.
   */
  private gardening(sim: GameSim, p: Player, m: Memory, dt: number, out: PlayerInput, go: (x: number, z: number, stop?: number) => number): boolean {
    m.gardenCd -= dt;
    if (m.plot < 0) {
      if (m.gardenCd > 0) return false;
      m.gardenCd = 6 + this.rnd() * 8;
      // someone else already on it? leave that plot to them
      const taken = new Set([...this.mem.entries()].filter(([id]) => id !== p.id).map(([, o]) => o.plot));
      const free = sim.plots.filter((pl) => !taken.has(pl.id));
      const pick =
        free.find((pl) => pl.planted && pl.g >= 1) ??
        free.find((pl) => pl.planted && pl.g < 0.9 && pl.wet <= 0) ??
        (sim.truffles >= 40 ? free.find((pl) => !pl.planted) : undefined);
      if (!pick) return false;
      m.plot = pick.id;
      m.idleT = 0;
    }
    const pl = sim.plots[m.plot];
    const want = !pl ? 'none' : !pl.planted ? (sim.truffles >= 40 ? 'plant' : 'none') : pl.g >= 1 ? 'harvest' : pl.wet <= 0 ? 'water' : 'none';
    if (want === 'none') {
      m.plot = -1;
      return false;
    }
    if (go(pl.x, pl.z, 0.5) < 1.3) out.buttons |= BTN.interact;
    return true;
  }

  /** Walk to a shop, browse a moment, buy something, leave. True while busy with it. */
  private shopping(sim: GameSim, p: Player, m: Memory, dt: number, out: PlayerInput, go: (x: number, z: number, stop?: number) => number): boolean {
    if (!m.shop) {
      if (m.shopCd > 0) return false;
      const pick = this.pickUpgrade(sim);
      if (!pick) {
        m.shopCd = 4 + this.rnd() * 4;
        return false;
      }
      m.shop = { ...pick, t: 0, open: 0, bought: false };
    }
    const s = m.shop;
    s.t += dt;
    const done = (cd: number) => {
      if (p.shopNpc) sim.closeShop(p.id);
      m.shop = null;
      m.shopCd = cd;
      m.idleT = 0;
    };
    if (s.t > 40) {
      // couldn't get there: try something else later
      done(6);
      return false;
    }
    if (p.shopNpc === s.npc) {
      s.open += dt;
      if (!s.bought && s.open > 0.8 + this.rnd() * 0.05) {
        // still affordable? someone else may have spent the truffles meanwhile
        const def = UPGRADES.find((u) => u.id === s.id)!;
        const lvl = sim.levels[s.id];
        if (lvl < maxLevel(def) && costOf(def, lvl, sim.repairCount) <= sim.truffles) sim.buy(p.id, s.id);
        s.bought = true;
      }
      if (s.open > 1.5) done(6 + this.rnd() * 8);
      return true;
    }
    if (p.shopNpc) sim.closeShop(p.id);
    const spot = SHOP_SPOT[s.npc];
    if (go(spot.x, spot.z, 1.2) < 4.4) out.buttons |= BTN.interact;
    return true;
  }

  /**
   * Incoming shots: sidestep flat ones (chopsticks, cream pellets) and get clear of where arcing ones
   * (chili, Mega Dollops, robots) will land. True if we're dodging this step.
   */
  private dodgeShots(
    sim: GameSim,
    p: Player,
    m: Memory,
    dt: number,
    out: PlayerInput,
    dodge: (dx: number, dz: number, secs: number) => void,
    roll: (chance?: number) => void,
  ): boolean {
    let threat = false;
    for (const pr of sim.projs) {
      if (pr.friendly) continue;
      const r = LAND_R[pr.kind];
      if (r !== undefined) {
        // solve y + vy·t − ½g·t² = 0 for when it comes down
        const disc = pr.vy * pr.vy + 2 * PROJ_GRAV * Math.max(0, pr.y);
        const t = (pr.vy + Math.sqrt(disc)) / PROJ_GRAV;
        const lx = pr.x + pr.vx * t;
        const lz = pr.z + pr.vz * t;
        const dd = Math.hypot(p.x - lx, p.z - lz);
        if (dd < r && t < 1.6) {
          threat = true;
          // straight out of the ring, or sideways if we're right under it
          const ax = dd > 0.3 ? p.x - lx : -pr.vz;
          const az = dd > 0.3 ? p.z - lz : pr.vx;
          if (m.react <= 0) m.react = 0.08 + this.rnd() * 0.12;
          m.react -= dt;
          if (m.react > 0) continue;
          dodge(ax, az, Math.min(0.5, (r - dd) / 7 + 0.15));
          if (t < 0.35) roll(0.6);
          out.mx = m.dodgeX;
          out.mz = m.dodgeZ;
          return true;
        }
        continue;
      }
      // flat shots: where's its closest pass?
      const sp2 = pr.vx * pr.vx + pr.vz * pr.vz;
      if (sp2 < 1) continue;
      const rx = p.x - pr.x;
      const rz = p.z - pr.z;
      const t = (rx * pr.vx + rz * pr.vz) / sp2;
      if (t < 0 || t > 0.8) continue;
      const cx = rx - pr.vx * t;
      const cz = rz - pr.vz * t;
      const miss = Math.hypot(cx, cz);
      if (miss > 1.4) continue;
      threat = true;
      if (m.react <= 0) m.react = 0.1 + this.rnd() * 0.15;
      m.react -= dt;
      if (m.react > 0) continue;
      // step off its line, on whichever side we're already leaning
      const side = miss > 0.15 ? 1 : m.strafe;
      const sx = miss > 0.15 ? cx : -pr.vz;
      const sz = miss > 0.15 ? cz : pr.vx;
      dodge(sx * side, sz * side, 0.3);
      if (t < 0.2) roll(0.5);
      out.mx = m.dodgeX;
      out.mz = m.dodgeZ;
      return true;
    }
    if (!threat) m.react = 0;
    return false;
  }

  private fight(
    sim: GameSim,
    p: Player,
    m: Memory,
    dt: number,
    out: PlayerInput,
    h: {
      allen: boolean;
      W: EarwhenBot | undefined;
      go: (x: number, z: number, stop?: number) => number;
      steerDirect: (x: number, z: number, stop?: number) => number;
      flee: (x: number, z: number) => void;
      roll: (chance?: number) => void;
      dodge: (dx: number, dz: number, secs: number) => void;
    },
  ): PlayerInput {
    const { allen, W, go, steerDirect, flee, roll, dodge } = h;
    const A = sim.A;
    const lv = sim.levels;
    const hpFrac = p.hp / p.maxHp;
    const useAbility = (bit: number, cd = 1.2) => {
      if (m.abilityT > 0) return false;
      out.buttons |= bit;
      m.abilityT = cd + this.rnd() * 1.5;
      return true;
    };

    // patch ourselves up
    if (lv.potion > 0 && p.potionCd <= 0 && hpFrac < 0.4) out.buttons |= BTN.potion;

    // ── Earwhen's telegraphs ──
    if (W) {
      const dW = Math.hypot(W.x - p.x, W.z - p.z);
      const toUs = Math.atan2(p.x - W.x, p.z - W.z);
      const facing = Math.cos(toUs - W.aim) > 0.7;
      if ((W.act === 'sprayWind' || W.act === 'spray') && dW < 11 && facing) {
        // out of the cone sideways, not straight back along it
        const sx = Math.cos(toUs) * m.strafe;
        const sz = -Math.sin(toUs) * m.strafe;
        dodge(sx + (p.x - W.x) / (dW || 1) * 0.3, sz + (p.z - W.z) / (dW || 1) * 0.3, 0.35);
        if (dW < 4) roll(0.5);
        out.mx = sx;
        out.mz = sz;
        return out;
      }
      if ((W.act === 'leapWind' || W.act === 'leap') && Math.hypot(W.tx - p.x, W.tz - p.z) < 5.8) {
        flee(W.tx, W.tz);
        if (W.act === 'leap') roll(dt * 6);
        return out;
      }
      if (W.act === 'robotWind' && dW < 6 && m.nerve < 1) {
        // back off before the volley; the landing rings are dodged as they come
        flee(W.x, W.z);
        return out;
      }
    }

    // ── Allen's telegraphs ──
    const dA = Math.hypot(A.x - p.x, A.z - p.z);
    const reachDanger = ALLEN_DANGER[A.state];
    if (allen && A.state === 'swipeWind' && dA < 6.2) {
      const fx = Math.sin(A.heading);
      const fz = Math.cos(A.heading);
      const inFront = ((p.x - A.x) * fx + (p.z - A.z) * fz) / (dA || 1) > 0.15;
      const tele = COURSES[Math.min(sim.course, COURSES.length - 1)].tele * (A.enraged ? 0.82 : 1);
      const left = 0.55 * tele - A.t;
      if (inFront) {
        if (left < 0.3 && p.stam > 25 && (p.action === 'none' || p.action === 'attack')) {
          // too late to get clear: roll so we're untouchable when the claws land
          dodge(p.x - A.x, p.z - A.z, 0.2);
          out.buttons |= BTN.roll;
        } else {
          // out of the arc: sideways and back
          const side = (p.x - A.x) * fz - (p.z - A.z) * fx >= 0 ? 1 : -1;
          out.mx = fz * side + (p.x - A.x) / (dA || 1) * 0.6;
          out.mz = -fx * side + (p.z - A.z) / (dA || 1) * 0.6;
        }
        return out;
      }
      // behind him while he swings at someone else: free hits
    } else if (allen && reachDanger !== undefined && A.state !== 'swipeWind' && dA < reachDanger) {
      if (A.state === 'slamWind' || A.state === 'slamAir') {
        flee(A.tx, A.tz);
        if (A.state === 'slamAir' && Math.hypot(A.tx - p.x, A.tz - p.z) < 4) roll(dt * 8);
      } else if (A.state === 'dashWind' || A.state === 'dash') {
        // get off the line he's charging along
        const hx = Math.sin(A.heading);
        const hz = Math.cos(A.heading);
        const side = (p.x - A.x) * hz - (p.z - A.z) * hx >= 0 ? 1 : -1;
        out.mx = hz * side;
        out.mz = -hx * side;
        if (A.state === 'dash' && dA < 4) roll(0.7);
      } else {
        flee(A.x, A.z);
        if (dA < 3.5) roll(dt * 6);
      }
      return out;
    }

    // ── pick a foe ──
    const open = allen && ALLEN_OPEN.has(A.state);
    let tx = allen ? A.x : W ? W.x : p.x;
    let tz = allen ? A.z : W ? W.z : p.z;
    let reach = allen ? 3.2 : W ? 2.6 : 2.2;
    let bossTarget = allen || !!W;
    const pest = sim.bots.find((b) => b.kind !== 'earwhen' && b.kind !== 'guppy' && !(b.kind === 'bomber' && b.mode === 'fuse') && Math.hypot(b.x - p.x, b.z - p.z) < 3.5);
    if (allen && A.shielded && sim.pots.length && !pest) {
      // sauce jars first (unless something's chewing on us)
      let bd = Infinity;
      for (const o of sim.pots) {
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d < bd) {
          bd = d;
          tx = o.x;
          tz = o.z;
        }
      }
      reach = 2.2;
      bossTarget = false;
    } else {
      // a bot in the way (or nothing else to hit); never while Allen's wide open
      const dBoss = bossTarget ? Math.hypot(tx - p.x, tz - p.z) : Infinity;
      let bd = open ? 0 : Math.min(dBoss, bossTarget ? 7 : Infinity);
      for (const b of sim.bots) {
        if (b.kind === 'earwhen' || b.kind === 'guppy') continue;
        const d = Math.hypot(b.x - p.x, b.z - p.z);
        if (b.kind === 'bomber' && b.mode === 'fuse') continue;
        if (d < bd) {
          bd = d;
          tx = b.x;
          tz = b.z;
          reach = 2.2;
          bossTarget = false;
        }
      }
    }
    if (!allen && !W && tx === p.x && tz === p.z) return out;

    const d = Math.hypot(tx - p.x, tz - p.z);
    // close the gap (planned route when far, straight in when close); circle a little while in reach
    if (d > 6) go(tx, tz, reach * 0.8);
    else steerDirect(tx, tz, reach * 0.8);
    if (d < reach + 0.4 && !open) {
      const ux = (tx - p.x) / (d || 1);
      const uz = (tz - p.z) / (d || 1);
      out.mx = ux * 0.5 + -uz * 0.5 * m.strafe;
      out.mz = uz * 0.5 + ux * 0.5 * m.strafe;
    }
    // hang back a touch if hurt and the boss isn't open
    if (bossTarget && !open && hpFrac < 0.3 * m.nerve && d < 5 && !lv.potion) {
      flee(tx, tz);
      return out;
    }

    // ── hit it ──
    const inReach = d < reach + 0.6;
    if (inReach && m.attackT <= 0 && p.action === 'none') {
      out.buttons |= BTN.attack;
      m.attackT = open ? 0.05 : 0.12 + this.rnd() * 0.25;
    } else if (inReach && p.action === 'attack') {
      out.buttons |= BTN.attack; // buffer the combo
    }
    if (d > 4 && d < 11 && p.chargeCd <= 0 && this.rnd() < dt * (open ? 4 : 1.2)) out.buttons |= BTN.charge;

    // ── combos: a bot that knows the tricks ──
    if (p.zapAura > 0 && m.abilityT <= 0) {
      // still crackling from a zap: squeal into a crowd (Static Shriek) or charge in (Thunder Charge)
      const crowd = sim.bots.filter((b) => b.kind !== 'earwhen' && Math.hypot(b.x - p.x, b.z - p.z) < 10).length;
      if (lv.squeal > 0 && p.squealCd <= 0 && (crowd >= 1 || dA < 9)) {
        useAbility(BTN.squeal);
        return out;
      }
      if (p.chargeCd <= 0 && d > 2.5 && d < 12) {
        out.buttons |= BTN.charge;
        return out;
      }
    }
    // a Perfect Dodge with a potion ready: Adrenaline Gulp
    if (p.focus > 0 && lv.potion > 0 && p.potionCd <= 0 && hpFrac < 0.85) out.buttons |= BTN.potion;
    // ram our own decoy when Allen's on it (Pigsplosion)
    if (p.chargeCd <= 0) {
      for (const dc of sim.decoys) {
        const dd = Math.hypot(dc.x - p.x, dc.z - p.z);
        if (dd > 3 && dd < 12 && allen && Math.hypot(A.x - dc.x, A.z - dc.z) < 5) {
          steerDirect(dc.x, dc.z, 0);
          out.buttons |= BTN.charge;
          return out;
        }
      }
    }
    // the corn cannon's firing: zap the kernels for Popcorn Storm
    if (lv.zap > 0 && p.zapCd <= 0 && sim.kernels.length >= 2 && this.rnd() < dt * 3) useAbility(BTN.zap);

    // ── abilities, used with some sense ──
    const bossStunnable = allen && A.state !== 'stunned' && A.stunImmune <= 0 && !A.shielded;
    if (lv.smash > 0 && p.smashCd <= 0 && bossStunnable && dA < 14 && this.rnd() < dt * 0.6) useAbility(BTN.smash, 3);
    else if (lv.tailwhip > 0 && p.whipCd <= 0 && p.stam > 20 && inReach && this.rnd() < dt * (open ? 3 : 1)) useAbility(BTN.whip);
    else if (lv.zap > 0 && p.zapCd <= 0 && d < 16 && (open || this.rnd() < dt * 0.5)) useAbility(BTN.zap);
    else if (lv.squeal > 0 && p.squealCd <= 0) {
      const near = sim.bots.filter((b) => b.kind !== 'earwhen' && Math.hypot(b.x - p.x, b.z - p.z) < 7).length;
      if (near >= 2 || (bossTarget && dA < 5 && this.rnd() < dt * 0.4)) useAbility(BTN.squeal);
    } else if (lv.decoy > 0 && p.decoyCd <= 0 && hpFrac < 0.55 && dA < 8) useAbility(BTN.decoy);
    else if (lv.portal > 0 && p.portalCd <= 0 && allen && A.state === 'chase' && dA < 7 && this.rnd() < dt * 0.3) useAbility(BTN.portal, 3);
    return out;
  }
}
