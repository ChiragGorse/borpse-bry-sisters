/**
 * Headless test of the finale: beating the Grand Feast plays Allen's call for backup, the final course
 * brings Earwhen, his attacks land on the herd, and the farm is saved only once both are down.
 *
 *   npm run finale:test -- [pigs=3] [seed=7]
 */
import { headlessMaps } from '../server/maps';
import { COURSES, FINALE } from '../src/game/data';
import { Sim } from '../src/game/sim/Sim';
import { BotBrain } from '../src/game/sim/botBrain';
import type { EarwhenBot, PlayerInput } from '../src/game/sim/types';

const pigs = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 7);
const DT = 1 / 30;

const fail = (m: string): never => {
  console.error('FAIL:', m);
  process.exit(1);
};
const ok = (m: string) => console.log('ok  ', m);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Internals = any;

function setup() {
  const sim = new Sim(headlessMaps(), { seed });
  for (let i = 0; i < pigs; i++) sim.addPlayer(`Bot ${i + 1}`);
  sim.start({ opening: false });
  return sim;
}

const brain = new BotBrain();
function run(sim: Sim, seconds: number, until?: () => boolean, tough = false) {
  for (let t = 0; t < seconds; t += DT) {
    const inputs = new Map<number, PlayerInput>();
    for (const p of sim.players) inputs.set(p.id, brain.think(sim, p, DT));
    if (tough) for (const p of sim.players) p.hp = Math.max(p.hp, p.maxHp * 0.5);
    sim.step(DT, inputs);
    if (until?.()) return true;
  }
  return false;
}
const earwhen = (sim: Sim) => sim.bots.find((b): b is EarwhenBot => b.kind === 'earwhen') ?? null;

/* 1. the Grand Feast ends with a phone call */
{
  const sim = setup();
  const S = sim as Internals;
  sim.course = COURSES.length - 1;
  S.beginCourse();
  run(sim, 2);
  S.defeatAllen();
  if (!run(sim, 4, () => sim.A.state === 'calling')) fail('Allen never called for backup after the Grand Feast');
  ok('Grand Feast beaten: Allen gets on the phone');
  let landed = false;
  run(sim, 15, () => {
    const W = earwhen(sim);
    if (W && W.act !== 'arrive') landed = true;
    return sim.mode === 'intermission';
  });
  if (!landed) fail('Earwhen never landed during the call');
  if (sim.mode !== 'intermission' || sim.course !== FINALE) fail(`expected the finale break, got mode=${sim.mode} course=${sim.course}`);
  if (earwhen(sim)) fail('Earwhen should leave for the break');
  if (sim.outcome) fail('the game ended early');
  ok('Earwhen leaped in, then a break before the final course');

  /* 2. the final course: Allen (weakened) plus Earwhen */
  S.beginCourse();
  const W = earwhen(sim);
  if (!W) fail('no Earwhen in the final course');
  if (sim.A.maxHp >= COURSES[COURSES.length - 1].hp) fail('Allen should come back weakened');
  ok(`final course: Earwhen ${W!.maxHp} HP, Allen ${sim.A.maxHp} HP`);
  const acts = new Set<string>();
  const hp0 = sim.players.reduce((a, p) => a + p.hp, 0);
  let taken = 0;
  for (let t = 0; t < 60; t += DT) {
    const before = sim.players.reduce((a, p) => a + p.hp, 0);
    run(sim, DT, undefined, true);
    taken += Math.max(0, before - sim.players.reduce((a, p) => a + p.hp, 0));
    const w = earwhen(sim);
    if (w) acts.add(w.act);
    if (!w || sim.outcome) break;
  }
  for (const a of ['spray', 'stream', 'blob', 'robots']) if (!acts.has(a)) fail(`never saw Earwhen's ${a} (saw ${[...acts].join(', ')})`);
  if (taken < 30) fail(`the herd barely got hurt (${Math.round(taken)} HP, from ${hp0})`);
  ok(`Earwhen used ${[...acts].join(', ')}; the herd lost ${Math.round(taken)} HP over the fight`);

  /* 3. Allen down first: no victory until Earwhen falls */
  if (sim.A.state !== 'ko') {
    S.defeatAllen();
    run(sim, 3);
  }
  if (sim.A.state !== 'ko') fail(`Allen should be down, is ${sim.A.state}`);
  const w = earwhen(sim);
  if (w) {
    if (!w.rage) fail('Earwhen should be enraged once Allen is down');
    run(sim, 6, undefined, true);
    if (sim.outcome) fail('won with Earwhen still standing');
    ok('Allen is down but Earwhen fights on, enraged');
    S.damageBot(w, 1e6, 0, 0, true);
  }
  if (!run(sim, 6, () => !!sim.outcome)) fail('no victory after both went down');
  if (sim.outcome !== 'victory') fail(`expected victory, got ${sim.outcome}`);
  ok('both down: victory');
}

/* 4. Earwhen down first: Allen fights on, livid */
{
  const sim = setup();
  const S = sim as Internals;
  sim.course = FINALE;
  S.beginCourse();
  run(sim, 3, undefined, true);
  const W = earwhen(sim);
  if (!W) fail('no Earwhen');
  S.damageBot(W, 1e6, 0, 0, true);
  if (earwhen(sim)) fail('Earwhen survived a million damage');
  if (!(sim.A.tilt > 0)) fail('Allen should be tilted after Earwhen falls');
  run(sim, 5, undefined, true);
  if (sim.outcome) fail('won with Allen still standing');
  S.defeatAllen();
  if (!run(sim, 8, () => !!sim.outcome) || sim.outcome !== 'victory') fail(`expected victory, got ${sim.outcome}`);
  ok('Earwhen down first, then Allen: victory');
}
console.log('PASS');
