/**
 * Worst case for stunlocks: every upgrade maxed, and every pig fires whichever stun ability is ready the
 * moment it's ready (Smash Battles, Tail-Whip, Squeal, Zap, Portal), in a long fight. Neither Allen nor
 * Earwhen may spend most of the fight stunned.
 *
 *   npm run stun:test
 */
import { headlessMaps } from '../server/maps';
import { COURSES, FINALE, UPGRADES, maxLevel } from '../src/game/data';
import { Sim } from '../src/game/sim/Sim';
import { BotBrain } from '../src/game/sim/botBrain';
import { BTN, type EarwhenBot, type PlayerInput } from '../src/game/sim/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const fail = (m: string): never => {
  console.error('FAIL:', m);
  process.exit(1);
};
const ok = (m: string) => console.log('ok  ', m);
const SECONDS = 70;

/** Share of fighting time the boss spends stunned or staggered. */
function measure(pigs: number, course: number, boss: 'allen' | 'earwhen'): number {
  let fight = 0;
  let down = 0;
  for (const seed of [1, 2]) {
    const sim = new Sim(headlessMaps(), { seed });
    for (let i = 0; i < pigs; i++) sim.addPlayer(`Pig ${i + 1}`);
    sim.start({ opening: false });
    const S = sim as Any;
    for (const u of UPGRADES) if (!u.repeatable) S.levels[u.id] = maxLevel(u);
    S.applyStats(true);
    sim.course = course;
    S.beginCourse();
    // a long fight: the steady state, not one stun in a short fight
    if (boss === 'allen') {
      sim.A.maxHp *= 10;
      sim.A.hp = sim.A.maxHp;
      sim.A.phases = 1;
    }
    const brain = new BotBrain();
    for (let t = 0; t < SECONDS && !sim.outcome && sim.course === course; t += 1 / 30) {
      const inputs = new Map<number, PlayerInput>();
      for (const p of sim.players) {
        const base = brain.think(sim, p, 1 / 30);
        const ready = ([
          [BTN.smash, p.smashCd],
          [BTN.whip, p.whipCd],
          [BTN.squeal, p.squealCd],
          [BTN.zap, p.zapCd],
          [BTN.portal, p.portalCd],
        ] as [number, number][]).find(([, cd]) => cd <= 0);
        inputs.set(p.id, { ...base, buttons: ready ? ready[0] : base.buttons });
        p.hp = p.maxHp; // keep the herd up so the fight lasts
      }
      sim.step(1 / 30, inputs);
      sim.drainEvents();
      if (boss === 'allen') {
        const A = sim.A;
        if (A.active && !A.shielded && !['ko', 'defeated', 'leaving', 'gone', 'calling', 'enter', 'backrooms'].includes(A.state)) {
          fight++;
          if (A.state === 'stunned') down++;
        }
      } else {
        const W = sim.bots.find((b): b is EarwhenBot => b.kind === 'earwhen');
        if (W && W.act !== 'arrive') {
          fight++;
          if (W.act === 'stagger' || W.stun > 0) down++;
        }
      }
    }
  }
  if (!fight) fail(`no fighting happened (${boss}, course ${course + 1})`);
  return down / fight;
}

for (const pigs of [1, 3, 6]) {
  const a = measure(pigs, COURSES.length - 1, 'allen');
  if (a > 0.27) fail(`${pigs} maxed pigs kept Allen stunned ${(a * 100).toFixed(0)}% of the fight`);
  ok(`${pigs} maxed pig${pigs > 1 ? 's' : ''} spamming stuns: Allen stunned ${(a * 100).toFixed(0)}% of the fight`);
}
for (const pigs of [3, 6]) {
  const w = measure(pigs, FINALE + 1, 'earwhen');
  if (w > 0.15) fail(`${pigs} maxed pigs kept Earwhen stunned or staggered ${(w * 100).toFixed(0)}% of the fight`);
  ok(`${pigs} maxed pigs spamming stuns: Earwhen stunned or staggered ${(w * 100).toFixed(0)}% of the fight`);
}
console.log('PASS');
