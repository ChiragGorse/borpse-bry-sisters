/**
 * Regression test: in online play a pig's own browser sends its pose many times a second. A pose sent
 * just before the server moves the pig by force (retrying a course, travelling to Folk Valley and
 * back) must not undo that move: e.g. a "knocked out" pose arriving right before Retry used to leave
 * everyone knocked out on the retried course.
 *
 *   npm run respawn:test
 */
import { headlessMaps } from '../server/maps';
import { POSE_KEYS, type Pose } from '../src/game/sim/types';
import { Sim } from '../src/game/sim/Sim';

const fail = (m: string): never => {
  console.error('FAIL:', m);
  process.exit(1);
};
const ok = (m: string) => console.log('ok  ', m);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const sim = new Sim(headlessMaps(), { seed: 1 });
const p = sim.addPlayer('Ann')!;
sim.setClientDriven(p.id);
sim.start({ opening: false });
const S = sim as Any;
const pose = (o: Partial<Pose>): Pose => {
  const out: Record<string, unknown> = {};
  for (const k of POSE_KEYS) out[k] = (p as unknown as Record<string, unknown>)[k];
  return { ...(out as Pose), ...o };
};
const step = () => sim.step(1 / 30, new Map());

/* 1. knocked out, game over, Retry: a "dead" pose already queued must not stick */
S.beginCourse();
step();
S.hurtPlayer(p, 9999, p.x + 1, p.z, 5);
if (p.action !== 'dead') fail('the pig should be knocked out');
for (let i = 0; i < 90 && !sim.outcome; i++) step();
if (sim.outcome !== 'gameover') fail(`expected game over, got ${sim.outcome}`);
// the browser keeps sending its (dead) pose for the epoch it knows...
sim.remoteUpdate(p.id, p.epoch, pose({ action: 'dead' }), []);
// ...and the retry lands before the next tick
sim.retryCourse();
step();
step();
if (p.action === 'dead') fail('after Retry the pig is still knocked out (a stale pose was applied)');
if (p.hp !== p.maxHp) fail(`after Retry the pig should have full health, has ${p.hp}`);
ok('Retry brings a knocked-out pig back, even with a stale pose queued');

/* 2. a stale position from before travelling to Folk Valley doesn't drag the pig back to the farm */
const farmX = p.x;
const farmZ = p.z;
sim.remoteUpdate(p.id, p.epoch, pose({ x: farmX, z: farmZ }), []);
S.startHunt();
step();
if (Math.hypot(p.x - farmX, p.z - farmZ) < 5) fail('a stale pose pulled the pig back to where it was before travelling');
ok('travel isn’t undone by a pose sent just before it');

/* 3. poses for the current epoch still apply */
sim.remoteUpdate(p.id, p.epoch, pose({ x: p.x + 2, action: 'none' }), []);
const before = p.x;
step();
if (Math.abs(p.x - before) < 1) fail('a current pose should still move the pig');
ok('current poses still apply');
console.log('PASS');
