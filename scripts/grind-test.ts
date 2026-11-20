/**
 * Farming and grinding: Rickley's truffle garden, Hog Rank, and every ability combo (each must fire,
 * count toward mastery, and get stronger with it). Also checks they survive a save.
 *
 *   npm run grind:test
 */
import { headlessMaps } from '../server/maps';
import { COMBOS, GROW_TIME, HARVEST_BASE, PLANT_COST, xpForRank, type ComboId } from '../src/game/data';
import { SPOT } from '../src/game/layout';
import { Sim } from '../src/game/sim/Sim';
import { BTN, type PlayerInput } from '../src/game/sim/types';

const fail = (m: string): never => {
  console.error('FAIL:', m);
  process.exit(1);
};
const ok = (m: string) => console.log('ok  ', m);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const sim = new Sim(headlessMaps(), { seed: 5 });
const p = sim.addPlayer('Ann')!;
sim.start({ opening: false });
const S = sim as Any;
const press = (buttons: number, steps = 1) => {
  for (let i = 0; i < steps; i++) sim.step(1 / 30, new Map<number, PlayerInput>([[p.id, { mx: 0, mz: 0, buttons: i === 0 ? buttons : 0 }]]));
};
const idle = (secs: number) => {
  for (let t = 0; t < secs; t += 1 / 30) sim.step(1 / 30, new Map());
};

/* ── the garden ── */
const plot = sim.plots[0];
p.x = plot.x;
p.z = plot.z;
sim.truffles = 100;
press(0);
if (!p.prompt?.includes('Plant')) fail(`expected a planting prompt, got ${p.prompt}`);
press(BTN.interact, 2);
if (!plot.planted || sim.truffles !== 100 - PLANT_COST) fail('E should plant spores for 5 truffles');
press(BTN.interact, 2);
if (!(plot.wet > 0)) fail('E again should water it');
idle(GROW_TIME * 0.3);
const watered = plot.g;
const plot2 = sim.plots[1];
plot2.planted = true;
plot2.g = 0;
idle(GROW_TIME * 0.6);
if (plot.g < 1) fail(`watered plot should be ripe by now (${plot.g.toFixed(2)})`);
if (plot2.g > 0.75 || watered < 0.55) fail(`watering should double growth (dry ${plot2.g.toFixed(2)} after 0.6, wet ${watered.toFixed(2)} after 0.3)`);
p.x = plot.x;
p.z = plot.z;
const before = sim.truffles;
press(BTN.interact, 2);
if (sim.truffles - before < HARVEST_BASE || plot.planted) fail(`harvest should pay ${HARVEST_BASE}+ (got ${sim.truffles - before})`);
ok(`plant (${PLANT_COST}), water (2x speed), harvest (+${sim.truffles - before})`);
S.levels.compost = 3;
plot.planted = true;
plot.g = 0;
idle(GROW_TIME / 2 + 1);
if (plot.g < 1) fail('max compost should grow twice as fast');
ok('Truffle Compost speeds the garden up');

/* ── Hog Rank ── */
const hp0 = p.maxHp;
const t0 = sim.truffles;
S.gainXp(xpForRank(1) + xpForRank(2) + 1);
if (sim.rank !== 3) fail(`expected rank 3, got ${sim.rank}`);
if (p.maxHp <= hp0 || sim.truffles <= t0) fail('ranking up should raise max health and pay truffles');
ok(`XP → Hog Rank 3: +${p.maxHp - hp0} max health, +${sim.truffles - t0} truffles`);

/* ── every combo ── */
for (const id of ['zap', 'squeal', 'decoy', 'cannon', 'potion', 'bellyflop', 'portal'] as const) S.levels[id] = 1;
S.applyStats(true);
const addBot = (x: number, z: number) => {
  const b: Any = { id: S.id(), kind: 'grill', x, z, hp: 400, maxHp: 400, rad: 0.6, heading: 0, bite: 9, stun: 0, kx: 0, kz: 0, chomp: 0, flash: 0, ph: 0, mode: 'idle', mt: 0, lx: 0, lz: -1, strafe: 1, hop: 0, moving: false, swing: 0 };
  sim.bots.push(b);
  return b;
};
const reset = () => {
  sim.bots = [];
  sim.decoys = [];
  sim.kernels = [];
  p.x = 0;
  p.z = 0;
  p.y = 0;
  p.action = 'none';
  p.zapAura = 0;
  p.focus = 0;
  p.zapCd = p.squealCd = p.potionCd = p.decoyCd = p.chargeCd = 0;
};
const fired = (id: ComboId, what: () => void) => {
  const n = sim.comboUses[id];
  what();
  if (sim.comboUses[id] !== n + 1) fail(`${id} did not fire`);
};

reset();
let b = addBot(3, 0);
// zap, then squeal with the aura still up (both through the real buttons)
press(BTN.zap, 2);
for (let i = 0; i < 60 && p.action !== 'none'; i++) press(0);
if (!(p.zapAura > 0)) fail(`zap should leave an aura (action ${p.action})`);
const hpB = b.hp;
fired('staticShriek', () => press(BTN.squeal, 2));
if (b.hp >= hpB) fail('Static Shriek should hurt the bot');
ok('Static Shriek: zap, then squeal');

reset();
p.zapAura = 2;
b = addBot(0, 1.5);
fired('thunderCharge', () => S.beginCharge(p, 0, 1, true, false, 0));
S.chargeContact(p, 0);
ok('Thunder Charge: charge while crackling');

reset();
b = addBot(4, 0);
sim.decoys.push({ id: S.id(), x: 0.5, z: 0, life: 6, maxLife: 6, burst: false });
const hpP = b.hp;
fired('pigsplosion', () => S.chargeContact(p, 0));
if (sim.decoys.length || b.hp >= hpP) fail('the decoy should blow up and hurt the bot');
ok('Pigsplosion: ram your own decoy');

reset();
b = addBot(10, 10);
sim.kernels.push({ id: S.id(), x: 10, y: 1.2, z: 10.5, botId: b.id, dmg: 5 });
const hpK = b.hp;
fired('popcorn', () => S.doLightningZap(p));
if (sim.kernels.length || b.hp >= hpK) fail('kernels should pop and hurt the bot');
ok('Popcorn Storm: zap the corn in flight');

reset();
p.focus = 2;
p.stam = 5;
p.hp = 10;
fired('adrenaline', () => S.drinkPotion(p));
if (p.stam !== p.maxStam || !(p.rushT > 0)) fail('Adrenaline Gulp should refill stamina and hit harder');
const m1 = S.attackMul(p);
p.rushT = 0;
if (S.attackMul(p) >= m1) fail('rush should raise damage');
ok('Adrenaline Gulp: potion right after a Perfect Dodge');

reset();
p.x = SPOT.mud.x;
p.z = SPOT.mud.z;
b = addBot(SPOT.mud.x + 7, SPOT.mud.z);
fired('mudBomb', () => S.bellyFlopLand(p));
if (!(b.stun > 1)) fail('Mud Bomb should stun bots around');
ok('Mud Bomb: belly flop into the mud');

reset();
S.beginCourse();
const A = sim.A;
A.state = 'enter';
A.pounce = 2;
const hpA = A.hp;
fired('portalPounce', () => S.damageAllen(20, 0, { by: p }));
const pounce = hpA - A.hp;
const hpA2 = A.hp;
S.damageAllen(20, 0, { by: p });
if (pounce < 1.8 * (hpA2 - A.hp)) fail(`pounce should double the hit (${pounce} vs ${hpA2 - A.hp})`);
ok('Portal Pounce: hit him as he leaves the Backrooms');

/* ── mastery ── */
const p1 = S.comboPower('mudBomb');
sim.comboUses.mudBomb = 49;
fired('mudBomb', () => {
  p.x = SPOT.mud.x;
  p.z = SPOT.mud.z;
  S.bellyFlopLand(p);
});
if (!(S.comboPower('mudBomb') > p1 + 0.5)) fail('mastery should make a combo stronger');
ok(`mastery: Mud Bomb x${p1.toFixed(2)} → x${S.comboPower('mudBomb').toFixed(2)} after 50 uses`);
if (COMBOS.some((c) => sim.comboUses[c.id] < 1)) fail('every combo should have been found');

/* ── it all saves ── */
sim.mode = 'intermission';
sim.A.active = false;
sim.bots = [];
const prog = sim.progress()!;
const back = new Sim(headlessMaps(), { seed: 1 });
back.addPlayer('Ann');
back.resume(JSON.parse(JSON.stringify(prog)));
if (back.rank !== sim.rank || back.comboUses.mudBomb !== 50 || back.plots[0].planted !== sim.plots[0].planted) fail('rank, mastery and garden should save');
ok('rank, combo mastery and the garden come back from a save');
console.log('PASS');
