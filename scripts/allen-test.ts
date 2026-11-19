/**
 * Headless test of a person playing Allen: a scripted controller presses Allen's buttons against a
 * herd of bot pigs in the real simulation.
 *
 *   npm run allen:test -- [pigs=3] [minutes=8] [seed=5]
 */
import { headlessMaps } from '../server/maps';
import { Sim } from '../src/game/sim/Sim';
import { BotBrain } from '../src/game/sim/botBrain';
import { ALLEN_ID, BTN, type PlayerInput } from '../src/game/sim/types';

const pigs = Number(process.argv[2] ?? 3);
const minutes = Number(process.argv[3] ?? 8);
const seed = Number(process.argv[4] ?? 5);
const DT = 1 / 30;

const fail = (m: string): never => {
  console.error('FAIL:', m);
  process.exit(1);
};

const sim = new Sim(headlessMaps(), { seed });
for (let i = 0; i < pigs; i++) sim.addPlayer(`Bot ${i + 1}`);
sim.setAllenPlayer(true);
sim.start({ opening: false });
const brain = new BotBrain();

let r = seed;
const rnd = () => ((r = (Math.imul(r, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
const moves: [number, number][] = [ // [button, unused weight]
  [BTN.attack, 0.5],
  [BTN.jump, 0.08],
  [BTN.charge, 0.06],
  [BTN.roll, 0.03],
  [BTN.zap, 0.06],
  [BTN.squeal, 0.03],
  [BTN.whip, 0.05],
  [BTN.listen, 0.04],
];
const stateNames: Record<number, string> = { [BTN.attack]: 'swipeWind', [BTN.jump]: 'slamWind', [BTN.charge]: 'dashWind', [BTN.roll]: 'guard', [BTN.zap]: 'throwWind', [BTN.squeal]: 'summon', [BTN.whip]: 'rainCast', [BTN.listen]: 'spinWind' };
const seen = new Set<string>();
let courses = 0;
let lastMode = sim.mode;
let ate = 0;
let snack = 0;
let turn = 0;

/** A rough human Allen: chase the nearest pig, mash moves, and stop for a snack now and then. */
function allenInput(): PlayerInput {
  const A = sim.A;
  const out: PlayerInput = { mx: 0, mz: 0, buttons: 0 };
  if (!A.active || A.state !== 'chase') return out;
  snack -= DT;
  if (snack <= 0 && sim.allenPrompt) {
    snack = 25;
    out.buttons = BTN.interact;
    return out;
  }
  // every so often wander to the nearest crop instead
  if (snack <= 0) {
    const e = sim.edibles.filter((x) => x.hp > 0).sort((a, b) => Math.hypot(a.x - A.x, a.z - A.z) - Math.hypot(b.x - A.x, b.z - A.z))[0];
    if (e) {
      const d = Math.hypot(e.x - A.x, e.z - A.z) || 1;
      return { mx: (e.x - A.x) / d, mz: (e.z - A.z) / d, buttons: 0 };
    }
  }
  const target = sim.living().sort((a, b) => Math.hypot(a.x - A.x, a.z - A.z) - Math.hypot(b.x - A.x, b.z - A.z))[0];
  if (!target) return out;
  const d = Math.hypot(target.x - A.x, target.z - A.z) || 1;
  out.mx = (target.x - A.x) / d;
  out.mz = (target.z - A.z) / d;
  // work through the moves that are ready, in turn, the way a player learning Allen would try everything
  const cds: Record<number, number> = { [BTN.attack]: A.cdSwipe, [BTN.jump]: A.cdSlam, [BTN.charge]: A.cdDash, [BTN.roll]: A.cdGuard, [BTN.zap]: A.cdThrow, [BTN.squeal]: A.cdSummon, [BTN.whip]: A.cdRain, [BTN.listen]: A.cdSpin };
  const ready = moves.map(([b]) => b).filter((b) => cds[b] <= 0 && (b !== BTN.attack || d < 5));
  if (ready.length && rnd() < 0.08) {
    out.buttons = ready[turn % ready.length];
    turn++;
  }
  return out;
}

let games = 0;
const results: string[] = [];
const allSeen = () => Object.values(stateNames).every((n) => seen.has(n));
while (sim.time < minutes * 60 * (games + 1) && !(allSeen() && games > 0 && sim.outcome)) {
  if (sim.outcome) {
    // keep playing new games until every move has had a turn (or time runs out)
    results.push(`${sim.outcome}${sim.overReason ? ` (${sim.overReason})` : ''} on course ${sim.course + 1}`);
    games++;
    if (allSeen() || games >= 6) break;
    sim.start({ opening: false });
  }
  const inputs = new Map<number, PlayerInput>();
  for (const p of sim.players) inputs.set(p.id, brain.think(sim, p, DT));
  inputs.set(ALLEN_ID, allenInput());
  const before = sim.A.state;
  const farmBefore = sim.farmPct();
  sim.step(DT, inputs);
  sim.drainEvents();
  if (sim.A.state !== before) seen.add(sim.A.state);
  if (sim.A.state === 'eating' && sim.farmPct() < farmBefore) ate += farmBefore - sim.farmPct();
  for (const p of sim.players) if (p.shopNpc) sim.closeShop(p.id);
  if (sim.mode !== lastMode) {
    lastMode = sim.mode;
    if (sim.mode === 'combat') {
      courses++;
      console.log(`[${(sim.time / 60).toFixed(1)}m] course ${sim.course + 1} began on its own (Allen ${sim.A.maxHp} HP vs ${pigs} pigs)`);
    }
  }
  for (const e of [sim.A, ...sim.players]) if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) fail('non-finite position');
}

if (!sim.outcome || results.length === 0) results.push(`${sim.outcome ?? 'still playing'} on course ${sim.course + 1}`);
console.log(`games: ${results.join('; ')}`);
console.log(`stats ${JSON.stringify(sim.stats)} · farm eaten ${ate.toFixed(1)}%`);
if (courses < 1) fail('no course started by itself');
const missing = Object.values(stateNames).filter((s) => !seen.has(s));
if (missing.length) fail(`moves never triggered: ${missing.join(', ')}`);
console.log('ok   every Allen move was triggered by buttons:', Object.values(stateNames).join(', '));
if (sim.stats.taken <= 0) fail('Allen never hurt a pig');
console.log(`ok   Allen dealt ${sim.stats.taken} damage to pigs; pigs dealt ${sim.stats.dealt}`);
console.log(`ok   during play Allen ate ${ate.toFixed(1)}% of the farm`);

// eating, on its own: Allen next to a crop presses E
{
  const t = new Sim(headlessMaps(), { seed: 1 });
  t.addPlayer('Far pig');
  t.setAllenPlayer(true);
  t.start({ opening: false });
  const step = (input: PlayerInput, secs: number) => {
    for (let i = 0; i < secs / DT; i++) t.step(DT, new Map([[ALLEN_ID, input]]));
  };
  step({ mx: 0, mz: 0, buttons: 0 }, 12); // course starts, Allen walks in
  if (t.A.state !== 'chase') fail(`Allen should be ready to play, but is ${t.A.state}`);
  const e = t.edibles[0];
  t.players[0].x = -45;
  t.players[0].z = -45;
  t.A.x = e.x + e.r + 1;
  t.A.z = e.z;
  step({ mx: 0, mz: 0, buttons: 0 }, 0.1);
  if (!t.allenPrompt?.startsWith('E|Eat')) fail(`no eat prompt next to the ${e.name} (prompt: ${t.allenPrompt})`);
  const hp0 = e.hp;
  step({ mx: 0, mz: 0, buttons: BTN.interact }, DT);
  step({ mx: 0, mz: 0, buttons: 0 }, 2);
  if (!(e.hp < hp0)) fail(`pressing E next to the ${e.name} didn't eat it (${hp0} → ${e.hp})`);
  step({ mx: 1, mz: 0, buttons: 0 }, 0.2);
  if (t.A.state === 'eating') fail('walking off should stop Allen eating');
  console.log(`ok   E next to the ${e.name} eats it (${hp0} → ${Math.round(e.hp)} HP); walking off stops`);
}
console.log('PASS');
