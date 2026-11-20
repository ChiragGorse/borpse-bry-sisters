/**
 * Stand-in players: a small AI that produces the same PlayerInput a person would. Used to fill a herd for
 * local testing (`?bots=N` in the browser) and by the headless soak test.
 */
import { SPOT } from '../layout';
import type { GameSim } from './gameSim';
import { BTN, type EarwhenBot, type Player, type PlayerInput } from './types';

interface Memory {
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
}

export interface BotBrainOptions {
  /** Ring the dinner bell when nobody else does (headless runs have no humans to do it). */
  ringBell?: boolean;
  /** Seconds to idle on the farm before walking to the bell. */
  bellDelay?: number;
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
      m = { strafe: p.id % 2 ? 1 : -1, flipT: 2, attackT: 0, wanderX: p.x, wanderZ: p.z, wanderT: 0, chaseT: 0, ignoreT: 0, idleT: 0, truffles: sim.truffles };
      this.mem.set(p.id, m);
    }
    return m;
  }

  /** Inputs for one step for the given bot-controlled player. */
  think(sim: GameSim, p: Player, dt: number): PlayerInput {
    const out: PlayerInput = { mx: 0, mz: 0, buttons: 0 };
    if (p.action === 'dead' || sim.opening) return out;
    const m = this.memory(sim, p);
    m.flipT -= dt;
    m.attackT -= dt;
    if (m.flipT <= 0) {
      m.flipT = 1.5 + this.rnd() * 2.5;
      m.strafe = -m.strafe;
    }
    const steer = (tx: number, tz: number, stopAt = 0.5) => {
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > stopAt) {
        out.mx = dx / d;
        out.mz = dz / d;
      }
      return d;
    };
    const flee = (fx: number, fz: number) => {
      const dx = p.x - fx;
      const dz = p.z - fz;
      const d = Math.hypot(dx, dz) || 1;
      out.mx = dx / d + (-dz / d) * 0.4 * m.strafe;
      out.mz = dz / d + (dx / d) * 0.4 * m.strafe;
    };

    // jump hostile shockwaves rolling toward us
    for (const s of sim.shocks) {
      if (s.hostile && !s.hitPlayers?.has(p.id) && Math.abs(Math.hypot(p.x - s.x, p.z - s.z) - s.r) < 2.2) out.buttons |= BTN.jump;
    }
    // step out of falling dumplings and chili puddles
    for (const h of sim.hazards) {
      if (Math.hypot(p.x - h.x, p.z - h.z) < h.r + 1) {
        flee(h.x, h.z);
        return out;
      }
    }

    const A = sim.A;
    // Allen, if he's up and fighting; Earwhen, in his stages
    const allen = A.active && !['ko', 'defeated', 'leaving', 'gone', 'calling', 'backrooms'].includes(A.state);
    const W = sim.bots.find((b): b is EarwhenBot => b.kind === 'earwhen' && b.act !== 'arrive');
    if (sim.mode === 'combat' && (allen || W)) {
      // get out of Earwhen's way: his spray cone, and the ring he's about to land on
      if (W) {
        const dW = Math.hypot(W.x - p.x, W.z - p.z);
        const facing = Math.cos(Math.atan2(p.x - W.x, p.z - W.z) - W.aim) > 0.75;
        if ((W.act === 'sprayWind' || W.act === 'spray') && dW < 10.5 && facing) {
          flee(W.x, W.z);
          return out;
        }
        if ((W.act === 'leapWind' || W.act === 'leap') && Math.hypot(W.tx - p.x, W.tz - p.z) < 5.5) {
          flee(W.tx, W.tz);
          if (p.stam > 40 && this.rnd() < dt * 4) out.buttons |= BTN.roll;
          return out;
        }
      }
      const boss = allen ? A : W!;
      const dA = Math.hypot(boss.x - p.x, boss.z - p.z);
      const danger = allen && ['slamWind', 'slamAir', 'dashWind', 'dash', 'spinWind', 'spin', 'swipeWind'].includes(A.state);
      if (danger && dA < (A.state === 'swipeWind' ? 6.5 : 9)) {
        if (A.state === 'slamAir') flee(A.tx, A.tz);
        else flee(A.x, A.z);
        if (dA < 4.5 && p.stam > 40 && this.rnd() < dt * 6) out.buttons |= BTN.roll;
        return out;
      }
      // pick a foe: sauce jars while he's shielded, else the closest bot, else Allen himself
      let tx = boss.x;
      let tz = boss.z;
      let reach = allen ? 3.2 : 2.6;
      if (allen && A.shielded && sim.pots.length) {
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
      } else {
        let bd = Math.min(dA, 10);
        for (const b of sim.bots) {
          if (b.kind === 'bomber' && b.mode === 'fuse') {
            if (Math.hypot(b.x - p.x, b.z - p.z) < 5.5) {
              flee(b.x, b.z);
              return out;
            }
            continue;
          }
          const d = Math.hypot(b.x - p.x, b.z - p.z);
          if (d < bd) {
            bd = d;
            tx = b.x;
            tz = b.z;
            reach = 2.2;
          }
        }
      }
      const d = steer(tx, tz, reach * 0.8);
      if (d < reach + 0.6 && m.attackT <= 0 && p.action === 'none') {
        out.buttons |= BTN.attack;
        m.attackT = 0.15 + this.rnd() * 0.25;
      } else if (d < reach + 0.6 && p.action === 'attack') {
        out.buttons |= BTN.attack; // buffer the combo
      }
      if (d > 4 && d < 11 && p.chargeCd <= 0 && this.rnd() < dt * 1.5) out.buttons |= BTN.charge;
      if (sim.levels.zap > 0 && p.zapCd <= 0 && d < 18 && this.rnd() < dt * 0.8) out.buttons |= BTN.zap;
      if (sim.levels.squeal > 0 && p.squealCd <= 0 && sim.bots.length >= 3 && this.rnd() < dt * 0.5) out.buttons |= BTN.squeal;
      return out;
    }

    if (sim.area === 'forest') {
      const lead = sim.players.find((o) => o.id !== p.id && o.action !== 'dead');
      if (lead) steer(lead.x + Math.sin(p.id) * 3, lead.z + Math.cos(p.id) * 3, 1.5);
      return out;
    }

    // intermission on the farm: hoover up truffles, mill about, and (if allowed) go ring the bell
    let best = Infinity;
    let px = 0;
    let pz = 0;
    m.ignoreT -= dt;
    if (sim.truffles !== m.truffles) {
      m.truffles = sim.truffles;
      m.chaseT = 0;
    }
    if (m.chaseT > 5) {
      // that one must be out of reach (behind a fence or in the lake): leave truffles alone for a while
      m.chaseT = 0;
      m.ignoreT = 12;
    }
    for (const t of m.ignoreT > 0 ? [] : sim.pickups) {
      if (t.area !== 'farm') continue;
      const dd = Math.hypot(t.x - p.x, t.z - p.z);
      if (dd < best && dd < 30) {
        best = dd;
        px = t.x;
        pz = t.z;
      }
    }
    if (best < Infinity) {
      m.chaseT += dt;
      steer(px, pz, 0.3);
      return out;
    }
    m.idleT += dt;
    if (this.opts.ringBell && m.idleT > (this.opts.bellDelay ?? 2)) {
      if (steer(SPOT.bell.x, SPOT.bell.z + 2, 1) < 3.5) {
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
    steer(m.wanderX, m.wanderZ, 1);
    return out;
  }
}
