/**
 * One game room: an authoritative simulation shared by everyone who joined with the same room code.
 * Runs at a fixed TICK_HZ, applies each player's latest controls, and broadcasts state + events.
 */
import { Sim, MAX_PLAYERS } from '../src/game/sim/Sim';
import { BotBrain } from '../src/game/sim/botBrain';
import { UPGRADES } from '../src/game/data';
import { ALLEN_ID, POSE_KEYS, type Pose, type PlayerInput, type SimEvent, type Strike, type StrikeFn } from '../src/game/sim/types';
import { encodeHot, encodeMeta, encodeStats } from '../src/game/net/encode';
import { MAX_NAME, PROTOCOL_VERSION, TICK_HZ, unpack, type ClientMsg, type LobbyPlayer, type Relayed, type ServerMsg } from '../src/game/net/protocol';
import { headlessMaps } from './maps';
import type { WsConnection } from './ws';

const DT = 1 / TICK_HZ;
/** Most messages one client may send per second before it's cut off (poses arrive at up to ~60/s). */
const MAX_MSGS_PER_SEC = 150;
const STRIKES: StrikeFn[] = ['attack', 'upStart', 'flopStart', 'whipStart', 'charge', 'chargeHit', 'headbutt', 'cyclone', 'uppercut', 'whip', 'flop', 'zap', 'squeal'];
/** Effect kinds a browser may relay to the others. */
const RELAYABLE = new Set<SimEvent['t']>(['vfx', 'sfx', 'text', 'troutLeap', 'dummyHit']);

interface Member {
  conn: WsConnection;
  pid: number;
  name: string;
  /** Button presses collected since the last tick (the pig itself is driven by the browser). */
  buttons: number;
  msgCount: number;
  msgWindow: number;
}

export class Room {
  readonly code: string;
  private sim: Sim;
  private members: Member[] = [];
  private hostPid = 0;
  private playing = false;
  private botCount = 0;
  private botIds: number[] = [];
  /** The person playing Allen (0 = the AI), and their latest controls. */
  private allenPid = 0;
  private allenInput = { mx: 0, mz: 0 };
  private allenButtons = 0;
  private allenLast = 0;
  private brain = new BotBrain();
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private lastMeta = '';
  private metaAge = 0;
  private statsAge = 0;
  private onEmpty: () => void;
  /** Effects browsers showed since the last broadcast, to pass on to everyone else. */
  private relay: Relayed[] = [];
  private log: (s: string) => void;

  constructor(code: string, onEmpty: () => void, log: (s: string) => void = () => undefined) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.log = (s) => log(`[room ${code}] ${s}`);
    this.sim = new Sim(headlessMaps());
  }

  get size() {
    return this.members.length;
  }

  /* ───────── membership ───────── */

  join(conn: WsConnection, rawName: string): boolean {
    if (this.sim.players.length >= MAX_PLAYERS) {
      // make room by dropping a stand-in bot, if there is one
      const bot = this.botIds.pop();
      if (bot === undefined) {
        this.sendTo(conn, { t: 'error', msg: `Room ${this.code} is full (${MAX_PLAYERS} pigs).` });
        conn.close(4001, 'room full');
        return false;
      }
      this.sim.removePlayer(bot);
      this.botCount = this.botIds.length;
    }
    const name = (rawName.replace(/[^\p{L}\p{N} _.'-]/gu, '').trim() || `Pig ${this.members.length + 1}`).slice(0, MAX_NAME);
    const p = this.sim.addPlayer(name)!;
    // this browser drives its own pig from now on
    this.sim.setClientDriven(p.id);
    const m: Member = { conn, pid: p.id, name, buttons: 0, msgCount: 0, msgWindow: 0 };
    this.members.push(m);
    if (!this.hostPid) this.hostPid = p.id;
    conn.onMessage = (text) => this.onMessage(m, text);
    conn.onClose = () => this.leave(m);
    this.sendTo(conn, { t: 'welcome', v: PROTOCOL_VERSION, pid: p.id, room: this.code });
    this.lastMeta = ''; // the newcomer needs the full picture on the next tick
    this.broadcastLobby();
    this.broadcastState([]);
    if (!this.timer) this.startTicking();
    this.log(`${name} joined (${this.members.length} online)`);
    return true;
  }

  private leave(m: Member) {
    if (!this.members.includes(m)) return;
    this.members = this.members.filter((o) => o !== m);
    this.sim.removePlayer(m.pid);
    if (this.allenPid === m.pid) {
      // Allen's player left: the AI takes him back
      this.allenPid = 0;
      this.sim.setAllenPlayer(false);
    }
    this.log(`${m.name} left: ${m.conn.reason} (${this.members.length} online)`);
    if (!this.members.length) {
      this.stop();
      this.onEmpty();
      return;
    }
    if (this.hostPid === m.pid) this.hostPid = this.members[0].pid;
    this.lastMeta = '';
    this.broadcastLobby();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const m of this.members) m.conn.close(1001, 'server shutting down');
  }

  private setBots(n: number) {
    const want = Math.max(0, Math.min(MAX_PLAYERS - this.members.length, Math.floor(n) || 0));
    for (const id of this.botIds) this.sim.removePlayer(id);
    this.botIds = [];
    for (let i = 0; i < want; i++) {
      const p = this.sim.addPlayer(`Bot ${i + 1}`);
      if (p) this.botIds.push(p.id);
    }
    this.botCount = this.botIds.length;
    this.lastMeta = '';
    this.broadcastLobby();
    this.broadcastState([]);
  }

  /* ───────── messages ───────── */

  private onMessage(m: Member, text: string) {
    const now = Date.now();
    if (now - m.msgWindow > 1000) {
      m.msgWindow = now;
      m.msgCount = 0;
    }
    if (++m.msgCount > MAX_MSGS_PER_SEC) {
      m.conn.close(4002, 'too many messages');
      return;
    }
    let msg: ClientMsg;
    try {
      msg = JSON.parse(text) as ClientMsg;
    } catch {
      return;
    }
    const isHost = m.pid === this.hostPid;
    switch (msg.t) {
      case 'pose': {
        if (!Array.isArray(msg.p) || msg.p.length !== POSE_KEYS.length) break;
        const pose = unpack<Pose>(msg.p, POSE_KEYS);
        const strikes: Strike[] = [];
        for (const k of Array.isArray(msg.k) ? msg.k.slice(0, 32) : []) {
          if (!Array.isArray(k) || !STRIKES.includes(k[0] as StrikeFn) || !Array.isArray(k[2]) || k[2].length !== POSE_KEYS.length) continue;
          strikes.push({ fn: k[0] as StrikeFn, arg: Number(k[1]) || 0, pose: unpack<Pose>(k[2], POSE_KEYS) });
        }
        this.sim.remoteUpdate(m.pid, Number(msg.ep) || 0, pose, strikes);
        m.buttons |= (Number(msg.b) | 0) & 0x1ff;
        if (Array.isArray(msg.ev) && msg.ev.length) {
          const ev = msg.ev.filter((e) => e && RELAYABLE.has(e.t)).slice(0, 80);
          if (ev.length) this.relay.push({ by: m.pid, ev });
        }
        break;
      }
      case 'ain': {
        if (m.pid !== this.allenPid) break;
        const mx = Number(msg.mx) || 0;
        const mz = Number(msg.mz) || 0;
        const l = Math.hypot(mx, mz);
        this.allenInput = l > 1 ? { mx: mx / l, mz: mz / l } : { mx, mz };
        this.allenButtons |= (Number(msg.b) | 0) & 0x1ff;
        this.allenLast = now;
        break;
      }
      case 'allen':
        if (isHost && !this.playing) this.setAllen(Number(msg.pid) || 0);
        break;
      case 'start':
        if (isHost && !this.playing && this.sim.players.length === 0) {
          this.sendTo(m.conn, { t: 'error', msg: 'Allen needs someone to chase: add a bot pig or wait for another player.' });
          break;
        }
        if (isHost && !this.playing) {
          this.playing = true;
          this.sim.start({ opening: false });
          this.log(`started with ${this.sim.players.length} pigs`);
          this.broadcastLobby();
        }
        break;
      case 'restart':
        if (this.playing && (this.sim.outcome || isHost)) this.sim.start({ opening: false });
        break;
      case 'retry':
        if (this.playing && this.sim.outcome) this.sim.retryCourse();
        break;
      case 'farm':
        if (this.playing) this.sim.returnToFarm();
        break;
      case 'closeShop':
        this.sim.closeShop(m.pid);
        break;
      case 'buy':
        if (UPGRADES.some((u) => u.id === msg.id)) this.sim.buy(m.pid, msg.id);
        break;
      case 'bots':
        if (isHost && !this.playing) this.setBots(msg.n);
        break;
    }
  }

  /** Puts a person in charge of Allen (their pig leaves the herd), or hands him back to the AI with 0. */
  private setAllen(pid: number) {
    const prev = this.members.find((o) => o.pid === this.allenPid);
    if (prev) {
      // the old Allen gets their pig back, with the same id
      this.sim.addPlayer(prev.name, prev.pid);
      this.sim.setClientDriven(prev.pid);
    }
    const next = this.members.find((o) => o.pid === pid);
    this.allenPid = next ? next.pid : 0;
    if (next) this.sim.removePlayer(next.pid);
    this.sim.setAllenPlayer(!!next);
    this.lastMeta = '';
    this.broadcastLobby();
    this.broadcastState([]);
    this.log(next ? `${next.name} will play Allen` : 'Allen is back to the AI');
  }

  /* ───────── simulation ───────── */

  private startTicking() {
    this.lastTick = performance.now();
    this.timer = setInterval(() => {
      // catch up on late timer callbacks, but never spiral after a long stall
      const now = performance.now();
      let n = Math.min(4, Math.floor((now - this.lastTick) / (1000 / TICK_HZ)));
      if (n <= 0) return;
      this.lastTick += n * (1000 / TICK_HZ);
      if (now - this.lastTick > 500) this.lastTick = now;
      while (n-- > 0) this.step();
    }, 1000 / TICK_HZ / 2);
  }

  private step() {
    if (!this.playing) {
      // the lobby just shows the herd on the title screen
      if (++this.tick % TICK_HZ === 0) this.broadcastState([]);
      return;
    }
    this.tick++;
    const inputs = new Map<number, PlayerInput>();
    for (const m of this.members) {
      inputs.set(m.pid, { mx: 0, mz: 0, buttons: m.buttons });
      m.buttons = 0;
    }
    for (const id of this.botIds) {
      const p = this.sim.player(id);
      if (p) inputs.set(id, this.brain.think(this.sim, p, DT));
    }
    if (this.allenPid) {
      const stale = Date.now() - this.allenLast > 300;
      inputs.set(ALLEN_ID, { mx: stale ? 0 : this.allenInput.mx, mz: stale ? 0 : this.allenInput.mz, buttons: this.allenButtons });
      this.allenButtons = 0;
    }
    this.sim.step(DT, inputs);
    this.broadcastState(this.sim.drainEvents());
  }

  private broadcastState(ev: ReturnType<Sim['drainEvents']>) {
    if (!this.members.length) return;
    const msg: ServerMsg = { t: 's', st: this.tick / TICK_HZ, hot: encodeHot(this.sim), ev };
    if (this.relay.length) {
      msg.rev = this.relay;
      this.relay = [];
    }
    const meta = encodeMeta(this.sim);
    const metaJson = JSON.stringify(meta);
    this.metaAge += DT;
    if (metaJson !== this.lastMeta || this.metaAge > 2) {
      msg.meta = meta;
      this.lastMeta = metaJson;
      this.metaAge = 0;
    }
    this.statsAge += DT;
    if (this.statsAge >= 1 || msg.meta) {
      msg.stats = encodeStats(this.sim);
      this.statsAge = 0;
    }
    const text = JSON.stringify(msg);
    for (const m of this.members) {
      // a client that can't keep up skips snapshots rather than falling further behind
      if (m.conn.buffered < 512 * 1024 || msg.meta) m.conn.send(text);
    }
  }

  private broadcastLobby() {
    const players: LobbyPlayer[] = this.sim.players.map((p) => ({ id: p.id, name: p.name, tint: p.tint, bot: this.botIds.includes(p.id) }));
    const allenName = this.members.find((o) => o.pid === this.allenPid)?.name ?? '';
    const msg: ServerMsg = { t: 'lobby', room: this.code, host: this.hostPid, playing: this.playing, bots: this.botCount, players, allen: this.allenPid, allenName };
    const text = JSON.stringify(msg);
    for (const m of this.members) m.conn.send(text);
  }

  private sendTo(conn: WsConnection, msg: ServerMsg) {
    conn.send(JSON.stringify(msg));
  }
}
