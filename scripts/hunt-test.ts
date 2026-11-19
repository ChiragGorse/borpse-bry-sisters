/**
 * Headless test of the Hog Hunt: Herb leads the herd to each truffle cache, digging pays out truffles,
 * Path Guppy jumps out (and vanishes again), and the hunt can only be done once per break.
 *
 *   npm run hunt:test -- [pigs=2] [seed=3]
 */
import { headlessMaps } from '../server/maps';
import { FOREST_EXIT, SPOT } from '../src/game/layout';
import { Sim } from '../src/game/sim/Sim';
import { BTN, type PlayerInput, type SimEvent } from '../src/game/sim/types';

const pigs = Number(process.argv[2] ?? 2);
const seed = Number(process.argv[3] ?? 3);
const DT = 1 / 30;
const fail = (m: string): never => {
  console.error('FAIL:', m);
  process.exit(1);
};
const ok = (m: string) => console.log('ok  ', m);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Internals = any;

const sim = new Sim(headlessMaps(), { seed });
for (let i = 0; i < pigs; i++) sim.addPlayer(`Pig ${i + 1}`);
sim.start({ opening: false });
const S = sim as Internals;
const events: SimEvent[] = [];

/** Every pig walks towards (x, z), pressing `buttons` once it's within `near` metres. */
function drive(x: number, z: number, buttons = 0, near = 2.5) {
  const inputs = new Map<number, PlayerInput>();
  for (const p of sim.players) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    inputs.set(p.id, d > 1.2 ? { mx: dx / d, mz: dz / d, buttons: d < near ? buttons : 0 } : { mx: 0, mz: 0, buttons });
  }
  sim.step(DT, inputs);
  events.push(...sim.drainEvents());
}

// to the trailhead
for (let t = 0; t < 30 && sim.area !== 'forest'; t += DT) drive(SPOT.hunt.x, SPOT.hunt.z, BTN.interact, 5);
if (sim.area !== 'forest' || !sim.hunt) fail('never got to the forest');
const herb = sim.wild.find((w) => w.name === 'Herb');
if (!herb || sim.wild.length !== 1) fail(`expected only Herb in the woods, got ${sim.wild.map((w) => w.name).join(', ')}`);
ok(`Hog Hunt started with Herb: ${sim.hunt!.total} caches to find`);

const truffles0 = sim.truffles;
S.scareT = 4; // the first jump scare comes early for the test
let scared = false;
let vanished = false;
let leadDist = 0;
for (let t = 0; t < 400 && !sim.hunt!.done; t += DT) {
  const h = sim.hunt!;
  const w = sim.wild[0];
  // follow Herb; once he's rooting at the cache, walk over and dig
  if (w.spotted) drive(h.tx, h.tz, BTN.interact, 3);
  else drive(w.x, w.z);
  leadDist = Math.max(leadDist, Math.hypot(w.x - sim.players[0].x, w.z - sim.players[0].z));
  for (const p of sim.players) p.hp = p.maxHp;
  if (events.some((e) => e.t === 'scare')) scared = true;
  if (scared && !sim.bots.some((b) => b.kind === 'guppy')) vanished = true;
}
if (!sim.hunt!.done) fail(`only dug ${sim.hunt!.found}/${sim.hunt!.total} caches`);
ok(`Herb led the herd to all ${sim.hunt!.total} caches (he never got more than ${Math.round(leadDist)} m ahead)`);
if (!scared) fail('Path Guppy never jumped out');
if (!vanished) fail('Path Guppy never vanished again');
ok('Path Guppy jumped out, swung, and vanished into the dark');

// pick up the truffles, then head home
for (let t = 0; t < 8; t += DT) drive(sim.hunt!.tx, sim.hunt!.tz);
for (let t = 0; t < 60 && sim.area === 'forest'; t += DT) drive(FOREST_EXIT.x, FOREST_EXIT.z, BTN.interact, 5);
if (sim.area !== 'farm') fail('never made it home');
const gained = sim.truffles - truffles0;
if (gained < 30) fail(`only ${gained} truffles from the hunt`);
ok(`back on the farm, +${gained} truffles`);

// once per break
for (let t = 0; t < 10 && sim.area !== 'forest'; t += DT) drive(SPOT.hunt.x, SPOT.hunt.z, BTN.interact, 5);
if (sim.area === 'forest') fail('a second hunt in the same break');
ok("Herb's resting until the next course");
console.log('PASS');
