/**
 * Headless test of the finale: beating the Grand Feast plays Allen's call for backup, the final course
 * brings Earwhen, his attacks land on the herd, and the farm is saved only once both are down.
 *
 *   npm run finale:test -- [pigs=3] [seed=7]
 */
import { headlessMaps } from '../server/maps';
import { COURSES, EARWHEN_STAGES, FINALE, LAST_COURSE } from '../src/game/data';
import { BACKUP_CALL_END } from '../src/game/sim/Sim';
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
    // (the finale hits hard: keep the test herd standing so the scripted steps can be checked)
    if (tough) for (const p of sim.players) p.hp = p.maxHp = 5000;
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
  sim.course = FINALE - 1;
  S.beginCourse();
  run(sim, 2);
  S.defeatAllen();
  if (!run(sim, 4, () => sim.A.state === 'calling')) fail('Allen never called for backup after the Grand Feast');
  ok('Grand Feast beaten: Allen gets on the phone');
  let landed = false;
  run(sim, BACKUP_CALL_END + 4, () => {
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
  const allenHp1 = sim.A.maxHp;
  // compared with the Grand Feast's health for this herd size
  if (sim.A.maxHp >= COURSES[FINALE].hp * (1 + 0.6 * (pigs - 1))) fail('Allen should come back weakened');
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
    run(sim, 3, undefined, true);
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
  if (!run(sim, 8, () => sim.mode === 'intermission', true)) fail('stage 1 never ended after both went down');
  if (sim.outcome) fail(`stage 1 of ${EARWHEN_STAGES.length} should not end the game (got ${sim.outcome})`);
  if (sim.course !== FINALE + 1) fail(`expected Earwhen stage 2 next, got course ${sim.course}`);
  ok(`both down: stage 1 cleared, on to Earwhen 2/${EARWHEN_STAGES.length}`);

  /* 3b. a middle stage: Earwhen and a stronger Allen, with the Cream Quake and kitchen bots */
  const firstHp = W!.maxHp;
  const firstAllen = allenHp1;
  sim.course = FINALE + 4;
  S.beginCourse();
  const W5 = earwhen(sim);
  if (!W5) fail('no Earwhen in stage 5');
  if (!sim.A.active) fail('Allen should fight beside Earwhen in every stage');
  if (sim.A.maxHp <= firstAllen) fail(`Allen should be stronger in stage 5 (${sim.A.maxHp} vs ${firstAllen})`);
  if (W5!.maxHp <= firstHp) fail('Earwhen should get tougher stage by stage');
  const acts5 = new Set<string>();
  let kitchen = 0;
  run(sim, 70, () => {
    const w5 = earwhen(sim);
    if (w5) acts5.add(w5.act);
    kitchen = Math.max(kitchen, sim.bots.filter((b) => b.kind !== 'earwhen').length);
    return acts5.has('leap') && kitchen > 0;
  }, true);
  if (!acts5.has('leap')) fail(`never saw the Cream Quake in stage 5 (saw ${[...acts5].join(', ')})`);
  if (!kitchen) fail('kitchen bots should join the fight');
  S.damageBot(earwhen(sim), 1e6, 0, 0, true);
  S.defeatAllen();
  if (!run(sim, 8, () => sim.mode === 'intermission', true) || sim.course !== FINALE + 5) fail(`clearing stage 5 should lead to stage 6, got course ${sim.course} mode ${sim.mode}`);
  ok(`stage 5: Earwhen (${W5!.maxHp} HP vs ${firstHp}) with Allen (${sim.A.maxHp} HP vs ${firstAllen}), Cream Quake and kitchen bots; both down clears to stage 6`);

  /* 3c. the last stage: both of them, and beating both wins the game */
  sim.course = LAST_COURSE;
  S.beginCourse();
  if (!sim.A.active || !earwhen(sim)) fail('Allen and Earwhen should both be in the last stage');
  run(sim, 2, undefined, true); // let him land: he can't be hit mid-leap
  S.damageBot(earwhen(sim), 1e6, 0, 0, true);
  if (earwhen(sim)) fail('Earwhen survived a million damage in the last stage');
  run(sim, 2, undefined, true);
  S.defeatAllen();
  if (!run(sim, 8, () => !!sim.outcome, true) || sim.outcome !== 'victory') fail(`beating the last stage should win the game, got ${sim.outcome}`);
  ok(`last stage (${EARWHEN_STAGES.length}/${EARWHEN_STAGES.length}): both down, victory`);
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
  if (!run(sim, 8, () => sim.mode === 'intermission', true) || sim.course !== FINALE + 1 || sim.outcome) fail(`expected stage 2 next, got course ${sim.course} outcome ${sim.outcome}`);
  ok('Earwhen down first, then Allen: stage cleared');
}
console.log('PASS');
