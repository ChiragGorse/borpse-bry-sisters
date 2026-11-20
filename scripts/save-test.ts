/**
 * Saved progress: a run saved between courses comes back exactly (course, truffles, upgrades, farm,
 * stats, Herb's rest), only saves at sensible moments, and survives a JSON round trip (localStorage).
 *
 *   npm run save:test
 */
import { headlessMaps } from '../server/maps';
import { FINALE, UPGRADES } from '../src/game/data';
import { Sim } from '../src/game/sim/Sim';
import type { SaveData } from '../src/game/save';

const fail = (m: string): never => {
  console.error('FAIL:', m);
  process.exit(1);
};
const ok = (m: string) => console.log('ok  ', m);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const a = new Sim(headlessMaps(), { seed: 3 });
a.addPlayer('Ann');
a.addPlayer('Bot 1');
a.start({ opening: false });
const A = a as Any;

/* 1. mid-run progress round-trips */
a.course = 4;
a.truffles = 321;
a.levels.slop = 2;
a.levels.zap = 1;
a.levels.tailwhip = 1;
a.repairCount = 2;
a.edibles[0].hp = a.edibles[0].maxHp * 0.25;
a.edibles[2].hp = 0;
a.stats.dealt = 9876;
A.huntedCourse = 4;
const prog = a.progress();
if (!prog) fail('progress should be available between courses on the farm');
const save: SaveData = JSON.parse(JSON.stringify({ ...prog, at: Date.now(), version: 'test', loadout: ['zap', null], bots: 1 }));

const b = new Sim(headlessMaps(), { seed: 9 });
b.addPlayer('Ann');
b.addPlayer('Bot 1');
b.resume(save);
if (b.course !== 4 || b.truffles !== 321) fail(`course/truffles: ${b.course}/${b.truffles}`);
for (const u of UPGRADES) if (b.levels[u.id] !== a.levels[u.id]) fail(`upgrade ${u.id}: ${b.levels[u.id]} vs ${a.levels[u.id]}`);
if (b.repairCount !== 2) fail('repair count');
if (Math.abs(b.edibles[0].hp - a.edibles[0].hp) > 0.1 || b.edibles[2].hp !== 0) fail('farm damage');
if (b.stats.dealt !== 9876) fail('stats');
if ((b as Any).huntedCourse !== 4) fail('Herb should still be resting');
if (b.players[0].maxHp <= 100) fail('Hearty Slop should raise max health');
if (b.mode !== 'intermission' || b.area !== 'farm' || b.opening || b.outcome) fail('should resume on the farm between courses');
ok('course 5, truffles, upgrades, farm damage, stats and Herb’s rest all come back');

/* 2. ringing the bell starts the saved course */
(b as Any).beginCourse();
if (b.mode !== 'combat' || b.course !== 4 || !b.A.active) fail('the bell should start course 5');
if (b.progress()) fail('must not save mid-course');
ok('the bell starts the saved course, and nothing saves mid-fight');

/* 3. Earwhen stages resume too */
const c = new Sim(headlessMaps(), { seed: 2 });
c.addPlayer('Ann');
c.resume({ ...save, course: FINALE + 3 });
if (c.course !== FINALE + 3) fail('finale stage');
(c as Any).beginCourse();
for (let i = 0; i < 60; i++) c.step(1 / 30, new Map());
if (!c.bots.some((x) => x.kind === 'earwhen')) fail('Earwhen should be back for his stage');
ok('an Earwhen stage resumes with Earwhen');

/* 4. bad data can't break the run */
const d = new Sim(headlessMaps(), { seed: 4 });
d.addPlayer('Ann');
d.resume({ ...save, course: 999, truffles: -50, levels: { slop: 99, zap: Number.NaN } as Any, edibleHp: [] });
if (d.course > 20 || d.truffles !== 0 || d.levels.slop > 5 || d.levels.zap !== 0) fail(`clamping: ${d.course} ${d.truffles} ${d.levels.slop} ${d.levels.zap}`);
ok('out-of-range saves are clamped');
console.log('PASS');
