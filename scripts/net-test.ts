/**
 * End-to-end test of online play: starts the real game server, connects several WebSocket clients to
 * one room exactly like browsers would (each mirrors the game through NetSim and plays with the bot AI
 * from what it sees), and checks the room behaves.
 *
 *   npm run net:test -- [seconds=40]
 */
import { spawn } from 'node:child_process';
import { headlessMaps } from '../server/maps';
import { NetSim } from '../src/game/net/NetSim';
import { BotBrain } from '../src/game/sim/botBrain';
import { PROTOCOL_VERSION, type ClientMsg, type LobbyPlayer, type ServerMsg } from '../src/game/net/protocol';
import type { PlayerInput } from '../src/game/sim/types';

const SECONDS = Number(process.argv[2] ?? 40);
const PORT = 18000 + Math.floor(Math.random() * 1000);
const URL_BASE = `ws://127.0.0.1:${PORT}/ws`;

const fail = (msg: string): never => {
  console.error('FAIL:', msg);
  server.kill();
  process.exit(1);
};
const ok = (msg: string) => console.log('ok  ', msg);

const server = spawn(process.execPath, ['scripts/run-ts.mjs', 'server/index.ts'], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'inherit'] });
const serverLog: string[] = [];
server.stdout.on('data', (d) => serverLog.push(...String(d).trim().split('\n')));

class TestClient {
  name: string;
  ws: WebSocket;
  sim: NetSim | null = null;
  lobby: { host: number; playing: boolean; players: LobbyPlayer[] } | null = null;
  pid = 0;
  bytes = 0;
  snaps = 0;
  events = 0;
  errors: string[] = [];
  brain: BotBrain;
  closed = false;

  constructor(name: string, room: string, ringBell: boolean) {
    this.name = name;
    this.brain = new BotBrain({ ringBell, bellDelay: 2 });
    this.ws = new WebSocket(`${URL_BASE}?${new URLSearchParams({ room, name, v: String(PROTOCOL_VERSION) })}`);
    this.ws.onmessage = (e) => {
      const text = String(e.data);
      this.bytes += text.length;
      const msg = JSON.parse(text) as ServerMsg;
      if (msg.t === 'welcome') {
        this.pid = msg.pid;
        this.sim = new NetSim(msg.pid, headlessMaps(), (m) => this.send(m));
      } else if (msg.t === 'lobby') this.lobby = msg;
      else if (msg.t === 'error') this.errors.push(msg.msg);
      else if (msg.t === 's') {
        this.snaps++;
        this.events += msg.ev.length;
        this.sim?.receive(msg);
      }
    };
    this.ws.onclose = () => (this.closed = true);
  }

  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** One client frame: think from the mirrored state, then step the mirror (which sends the input). */
  frame(dt: number) {
    const sim = this.sim;
    if (!sim) return;
    const me = sim.player(this.pid);
    const input: PlayerInput = me && this.lobby?.playing ? this.brain.think(sim, me, dt) : { mx: 0, mz: 0, buttons: 0 };
    sim.step(dt, new Map([[this.pid, input]]));
    sim.drainEvents();
    if (me?.shopNpc) sim.closeShop();
  }
}

const until = async (what: string, cond: () => boolean, ms = 8000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
};

async function main() {
  await until('the server to start', () => serverLog.some((l) => l.includes('server on')), 20000);
  ok(`server listening on ${PORT}`);

  const a = new TestClient('Alice', 'TEST', true);
  await until('Alice to join', () => !!a.lobby && a.pid > 0);
  if (a.lobby!.host !== a.pid) fail('first player should host the room');
  ok(`Alice joined room TEST as host (pid ${a.pid})`);

  a.send({ t: 'bots', n: 2 });
  await until('bots to join', () => a.lobby!.players.filter((p) => p.bot).length === 2);
  ok('host added 2 bot pigs');

  const b = new TestClient('Bob', 'test', false);
  const c = new TestClient('Cleo<script>', 'TEST', false);
  await until('Bob and Cleo to join', () => [a, b, c].every((x) => x.lobby?.players.length === 5));
  if (b.lobby!.host === b.pid) fail('Bob should not be host');
  const cleo = c.lobby!.players.find((p) => p.id === c.pid);
  if (!cleo || /[<>]/.test(cleo.name)) fail(`names should be sanitised, got ${cleo?.name}`);
  ok(`5 pigs in the lobby (3 people, 2 bots); names sanitised ("${cleo!.name}")`);

  b.send({ t: 'start' });
  await new Promise((r) => setTimeout(r, 300));
  if (a.lobby!.playing) fail('only the host may start the game');
  a.send({ t: 'start' });
  await until('the game to start', () => [a, b, c].every((x) => x.lobby?.playing));
  ok('host started the game; non-host start was ignored');

  const ws = new WebSocket(`${URL_BASE}?room=TEST&name=Old&v=0`);
  let rejected = '';
  ws.onmessage = (e) => (rejected = (JSON.parse(String(e.data)) as ServerMsg & { msg?: string }).msg ?? '');
  await until('an outdated client to be turned away', () => rejected.length > 0);
  ok(`outdated client rejected: "${rejected}"`);

  // play
  const clients = [a, b, c];
  const t0 = Date.now();
  let last = Date.now();
  let combatSeen = false;
  let moved = false;
  const start = new Map<number, { x: number; z: number }>();
  let left = false;
  let bytesAtStart = 0;
  let measureFrom = 0;
  while (Date.now() - t0 < SECONDS * 1000) {
    await new Promise((r) => setTimeout(r, 16));
    const now = Date.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const cl of clients) if (!cl.closed) cl.frame(dt);
    const sim = a.sim!;
    if (sim.mode === 'combat') combatSeen = true;
    for (const p of sim.players) {
      const s = start.get(p.id);
      if (!s) start.set(p.id, { x: p.x, z: p.z });
      else if (Math.hypot(p.x - s.x, p.z - s.z) > 3) moved = true;
    }
    if (!measureFrom && now - t0 > 5000) {
      measureFrom = now;
      bytesAtStart = b.bytes;
    }
    if (!left && now - t0 > SECONDS * 600) {
      left = true;
      c.ws.close();
      await until('Cleo to leave', () => a.lobby?.players.length === 4);
      ok('Cleo left mid-game; the room carried on with 4 pigs');
    }
    if (a.sim!.outcome) break;
  }
  const secs = (Date.now() - measureFrom) / 1000;
  const sim = a.sim!;
  if (!moved) fail('nobody moved');
  ok('pigs move');
  if (!combatSeen) fail('the bell was never rung (no combat seen)');
  ok(`course started; Allen seen with ${sim.A.maxHp} HP`);
  if (sim.stats.dealt <= 0) fail('nobody landed a hit');
  ok(`herd dealt ${sim.stats.dealt} damage, took ${sim.stats.taken}`);
  const rate = b.snaps / ((Date.now() - t0) / 1000);
  if (rate < 20) fail(`snapshot rate too low: ${rate.toFixed(1)}/s`);
  ok(`snapshots ~${rate.toFixed(0)}/s, ${b.events} events received by Bob`);
  ok(`bandwidth per client ≈ ${((b.bytes - bytesAtStart) / secs / 1024).toFixed(1)} KB/s (uncompressed JSON)`);
  const pa = a.sim!.players.map((p) => p.id).sort().join();
  const pb = b.sim!.players.map((p) => p.id).sort().join();
  if (pa !== pb) fail(`clients disagree on who is playing: ${pa} vs ${pb}`);
  ok('clients agree on the herd');
  for (const cl of clients) if (cl.errors.length) fail(`${cl.name} got errors: ${cl.errors.join('; ')}`);

  a.ws.close();
  await until('Bob to become host', () => b.lobby?.host === b.pid);
  ok('host left; Bob took over as host');
  b.ws.close();
  await until('the room to close', () => serverLog.some((l) => l.includes('room TEST closed')));
  ok('empty room closed');
  server.kill();
  console.log('PASS');
  process.exit(0);
}

main().catch((e) => fail(String(e?.stack ?? e)));
