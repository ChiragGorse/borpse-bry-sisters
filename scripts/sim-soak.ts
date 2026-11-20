/**
 * Headless soak test: a herd of bot-controlled pigs plays the real game simulation in Node, with no
 * browser, renderer or audio. It checks the simulation can run server-side for any party size.
 *
 *   npm run sim:soak -- [players=7] [minutes=12] [seed=7]
 *
 * Exits non-zero if the simulation throws, a position goes NaN, or an entity escapes the map.
 */
import { headlessMaps } from '../server/maps';
import { Sim } from '../src/game/sim/Sim';
import { BotBrain } from '../src/game/sim/botBrain';
import { BTN, type PlayerInput } from '../src/game/sim/types';
import { FOREST_EXIT, SPOT } from '../src/game/layout';
import { COURSES } from '../src/game/data';

const players = Number(process.argv[2] ?? 7);
const minutes = Number(process.argv[3] ?? 12);
const seed = Number(process.argv[4] ?? 7);
const DT = 1 / 30;

const t0 = Date.now();
const sim = new Sim(headlessMaps(), { seed });
for (let i = 0; i < players; i++) sim.addPlayer();
const brain = new BotBrain({ ringBell: true, bellDelay: 3 });
sim.start({ opening: false });
// a richer run: give the herd a few upgrades so the special moves get exercised too
sim.truffles = 2000;
const shop: [number, Parameters<Sim['buy']>[1], Parameters<Sim['openShop']>[1]][] = [
  [0, 'zap', 'kingger'],
  [0, 'squeal', 'kingger'],
  [0, 'cannon', 'kingger'],
  [0, 'cyclone', 'trout'],
  [0, 'tailwhip', 'trout'],
  [0, 'slop', 'rickley'],
];
for (const [idx, id, npc] of shop) {
  const pid = sim.players[idx].id;
  sim.openShop(pid, npc);
  sim.buy(pid, id);
  sim.closeShop(pid);
}

const events = new Map<string, number>();
let bought = 0;
let steps = 0;
let forest: 'todo' | 'going' | 'there' | 'done' = 'todo';
let forestT = 0;
let maxBots = 0;
const shopOpen = new Map<number, number>();
let lastCourse = -1;
let lastMode = sim.mode;
const log = (s: string) => console.log(`[${(sim.time / 60).toFixed(1).padStart(4)}m] ${s}`);

function check() {
  const bound = sim.mapBound() + 1;
  const all: { x: number; z: number; what: string }[] = [
    ...sim.players.map((p) => ({ x: p.x, z: p.z, what: `player ${p.id}` })),
    ...sim.bots.map((b) => ({ x: b.x, z: b.z, what: `bot ${b.kind}` })),
    ...sim.allies.map((a) => ({ x: a.x, z: a.z, what: `ally ${a.name}` })),
  ];
  if (sim.A.active) all.push({ x: sim.A.x, z: sim.A.z, what: 'Allen' });
  for (const e of all) {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) throw new Error(`${e.what} has a non-finite position`);
    if (Math.abs(e.x) > bound + 25 || Math.abs(e.z) > bound + 25) throw new Error(`${e.what} escaped the map at ${e.x.toFixed(1)},${e.z.toFixed(1)}`);
  }
  for (const p of sim.players) if (!Number.isFinite(p.hp) || p.hp < 0 || p.hp > p.maxHp) throw new Error(`player ${p.id} hp out of range: ${p.hp}`);
}

while (sim.time < minutes * 60 && !sim.outcome) {
  const inputs = new Map<number, PlayerInput>();
  for (const p of sim.players) inputs.set(p.id, brain.think(sim, p, DT));

  // script the first pig through a forest trip before the first course
  const lead = sim.players[0];
  if (forest === 'todo' && sim.mode === 'intermission' && sim.time > 1) forest = 'going';
  if (forest === 'going') {
    const d = Math.hypot(SPOT.hunt.x - lead.x, SPOT.hunt.z - lead.z);
    inputs.set(lead.id, { mx: (SPOT.hunt.x - lead.x) / d, mz: (SPOT.hunt.z - lead.z) / d, buttons: d < 5 ? BTN.interact : 0 });
    for (const p of sim.players.slice(1)) inputs.set(p.id, { mx: 0, mz: 0, buttons: 0 });
    if (sim.area === 'forest') {
      forest = 'there';
      log(`herd travelled to the forest (guide: ${sim.wild.map((w) => w.name).join(', ')}, ${sim.hunt?.total} caches)`);
    }
  } else if (forest === 'there') {
    forestT += DT;
    const target = forestT < 25 ? { x: -11, z: 32 } : FOREST_EXIT;
    const d = Math.hypot(target.x - lead.x, target.z - lead.z) || 1;
    const near = d < 5;
    inputs.set(lead.id, { mx: (target.x - lead.x) / d, mz: (target.z - lead.z) / d, buttons: (near && forestT >= 25 ? BTN.interact : 0) | (forestT % 1 < DT ? BTN.attack : 0) });
    if (sim.area === 'farm') {
      forest = 'done';
      log(`back on the farm with ${sim.truffles} truffles`);
    }
    if (forestT > 90) throw new Error('herd got stuck in the forest');
  }

  sim.step(DT, inputs);
  steps++;
  for (const e of sim.drainEvents()) {
    const key = e.t === 'vfx' ? `vfx.${e.m}` : e.t === 'sfx' ? `sfx.${e.n}` : e.t;
    events.set(key, (events.get(key) ?? 0) + 1);
    if (key === 'sfx.buy') bought++;
  }
  // bots go shopping between courses, but must never leave a shop hanging open
  for (const p of sim.players) {
    shopOpen.set(p.id, p.shopNpc ? (shopOpen.get(p.id) ?? 0) + DT : 0);
    if ((shopOpen.get(p.id) ?? 0) > 10) throw new Error(`player ${p.id} left ${p.shopNpc}'s shop open`);
  }
  maxBots = Math.max(maxBots, sim.bots.length);
  if (sim.course !== lastCourse) {
    lastCourse = sim.course;
    log(`course ${sim.course + 1}/${COURSES.length} up next · farm ${sim.farmPct().toFixed(0)}% · truffles ${sim.truffles}`);
  }
  if (sim.mode !== lastMode) {
    lastMode = sim.mode;
    if (sim.mode === 'combat') log(`Allen arrives with ${sim.A.maxHp} HP for ${sim.players.length} pigs`);
  }
  if (steps % 30 === 0) check();
}
check();

const alive = sim.living().length;
log(`finished: outcome=${sim.outcome ?? 'still playing'} over=${sim.overReason ?? '-'} course=${sim.course + 1} alive=${alive}/${sim.players.length}`);
log(`stats ${JSON.stringify(sim.stats)} · peak bots ${maxBots}`);
const top = [...events.entries()].sort((a, b) => b[1] - a[1]);
console.log(`events (${top.reduce((a, [, n]) => a + n, 0)} total): ${top.slice(0, 14).map(([k, n]) => `${k}=${n}`).join(' ')}`);
console.log(`the bots bought ${bought} upgrades on their own`);
console.log(`${steps} steps (${(steps * DT / 60).toFixed(1)} sim-minutes) in ${((Date.now() - t0) / 1000).toFixed(1)}s wall time`);
if (forest !== 'done') throw new Error(`forest trip did not complete (state: ${forest})`);
if (sim.stats.dealt <= 0) throw new Error('the herd never landed a hit');
