/**
 * One game room: an authoritative simulation shared by everyone who joined with the same room code.
 * Runs at a fixed TICK_HZ, applies each player's latest controls, and broadcasts state + events.
 */
import { Sim, MAX_PLAYERS } from '../src/game/sim/Sim';
import { BotBrain } from '../src/game/sim/botBrain';
import { UPGRADES } from '../src/game/data';
import type { PlayerInput } from '../src/game/sim/types';
import { encodeHot, encodeMeta, encodeStats } from '../src/game/net/encode';
import { INPUT_TIMEOUT, MAX_NAME, PROTOCOL_VERSION, TICK_HZ, type ClientMsg, type LobbyPlayer, type ServerMsg } from '../src/game/net/protocol';
import { headlessMaps } from './maps';
import type { WsConnection } from './ws';

const DT = 1 / TICK_HZ;
/** Most messages one client may send per second before it's cut off (inputs arrive at ~30/s). */
const MAX_MSGS_PER_SEC = 120;

interface Member {
  conn: WsConnection;
  pid: number;
  name: string;
  input: PlayerInput;
  /** Button presses collected since the last tick. */
  buttons: number;
  lastInput: number;
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
  private brain = new BotBrain();
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private lastMeta = '';
  private metaAge = 0;
  private statsAge = 0;
  private onEmpty: () => void;
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
    const m: Member = { conn, pid: p.id, name, input: { mx: 0, mz: 0, buttons: 0 }, buttons: 0, lastInput: 0, msgCount: 0, msgWindow: 0 };
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
    this.log(`${m.name} left (${this.members.length} online)`);
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
      case 'in': {
        const mx = Number(msg.mx) || 0;
        const mz = Number(msg.mz) || 0;
        const l = Math.hypot(mx, mz);
        // never trust a client to move faster than a full stick
        m.input = l > 1 ? { mx: mx / l, mz: mz / l, buttons: 0 } : { mx, mz, buttons: 0 };
        m.buttons |= (Number(msg.b) | 0) & 0x1ff;
        m.lastInput = now;
        break;
      }
      case 'start':
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
    const now = Date.now();
    const inputs = new Map<number, PlayerInput>();
    for (const m of this.members) {
      const stale = now - m.lastInput > INPUT_TIMEOUT * 1000;
      inputs.set(m.pid, { mx: stale ? 0 : m.input.mx, mz: stale ? 0 : m.input.mz, buttons: m.buttons });
      m.buttons = 0;
    }
    for (const id of this.botIds) {
      const p = this.sim.player(id);
      if (p) inputs.set(id, this.brain.think(this.sim, p, DT));
    }
    this.sim.step(DT, inputs);
    this.broadcastState(this.sim.drainEvents());
  }

  private broadcastState(ev: ReturnType<Sim['drainEvents']>) {
    if (!this.members.length) return;
    const msg: ServerMsg = { t: 's', st: this.tick / TICK_HZ, hot: encodeHot(this.sim), ev };
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
    const msg: ServerMsg = { t: 'lobby', room: this.code, host: this.hostPid, playing: this.playing, bots: this.botCount, players };
    const text = JSON.stringify(msg);
    for (const m of this.members) m.conn.send(text);
  }

  private sendTo(conn: WsConnection, msg: ServerMsg) {
    conn.send(JSON.stringify(msg));
  }
}
