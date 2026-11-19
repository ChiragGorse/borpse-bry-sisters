/** Server side of the protocol: turns the live simulation into wire messages. */
import type { Sim } from '../sim/Sim';
import { KEYS, LISTS, pack, wire, type Hot, type ListKind, type Meta, type Stats } from './protocol';

function list(sim: Sim, kind: ListKind): object[] {
  switch (kind) {
    case 'bot':
      return sim.bots;
    case 'proj':
      return sim.projs;
    case 'puddle':
      return sim.puddles;
    case 'shock':
      return sim.shocks;
    case 'pickup':
      return sim.pickups;
    case 'kernel':
      return sim.kernels;
    case 'pot':
      return sim.pots;
    case 'hazard':
      return sim.hazards;
    case 'memorial':
      return sim.memorials;
    case 'wild':
      return sim.wild;
    case 'ally':
      return sim.allies;
  }
}

export function encodeHot(sim: Sim): Hot {
  return {
    players: sim.players.map((p) => pack(p, KEYS.player)),
    allen: pack(sim.A, KEYS.allen),
    lists: LISTS.map((k) => list(sim, k).map((e) => pack(e, KEYS[k]))),
    sniffCd: wire(sim.sniffCd) as number,
    sniffTime: wire(sim.sniffTime) as number,
    sniffTargetId: sim.sniffTargetId,
    kingCast: wire(sim.kingCast) as number,
    turretYaw: wire(sim.turretYaw) as number,
    hitstop: wire(sim.hitstop) as number,
  };
}

export function encodeMeta(sim: Sim): Meta {
  return {
    area: sim.area,
    mode: sim.mode,
    course: sim.course,
    tod: sim.tod,
    levels: { ...sim.levels },
    repairCount: sim.repairCount,
    truffles: sim.truffles,
    recruited: [...sim.recruitedHogs],
    hunt: sim.hunt ? { ...sim.hunt } : null,
    forestHint: sim.forestHint,
    overReason: sim.overReason,
    outcome: sim.outcome,
    subtitle: sim.subtitle ? { who: sim.subtitle.who, text: sim.subtitle.text } : null,
    banner: sim.banner ? { title: sim.banner.title, sub: sim.banner.sub, key: sim.banner.key } : null,
    edibleHp: sim.edibles.map((e) => Math.ceil(e.hp)),
    allenPlayer: sim.allenPlayer,
    allenPrompt: sim.allenPrompt,
    allenBreak: Math.ceil(sim.allenBreak),
    players: sim.players.map((p) => pack(p, KEYS.playerMeta)),
    allen: pack(sim.A, KEYS.allenMeta),
  };
}

export function encodeStats(sim: Sim): Stats {
  const s = sim.stats;
  return { time: Math.round(s.time * 10) / 10, dealt: s.dealt, taken: s.taken, earned: s.earned, fallen: s.fallen, ko: s.ko };
}
