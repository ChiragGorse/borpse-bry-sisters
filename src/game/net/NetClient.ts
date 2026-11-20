/** Browser connection to a game server: joins a room, tracks the lobby, and feeds snapshots to a NetSim. */
import type { SimMaps } from '../sim/types';
import { NetSim } from './NetSim';
import { PROTOCOL_VERSION, type ClientMsg, type LobbyPlayer, type ServerMsg } from './protocol';

export interface NetStatus {
  state: 'connecting' | 'lobby' | 'playing' | 'closed';
  room: string;
  /** This browser's pig id once joined. */
  pid: number;
  host: boolean;
  players: LobbyPlayer[];
  bots: number;
  /** Id of the person playing Allen (0 = the AI), and their name. */
  allen: number;
  allenName: string;
  error: string | null;
  /** Smoothed round-trip time to the server in ms, or null until measured (or if the server doesn't answer pings). */
  ping: number | null;
  /** Where the server says it runs ("Frankfurt", "Los Angeles"…), or null if it didn't say. */
  location: string | null;
  /** The server's host name, e.g. "borpse.fly.dev" or "localhost:8080": shown when there's no location. */
  serverHost: string;
}

const PING_EVERY_MS = 2000;

/** Turns "https://host", "host:8080" or "wss://host/ws" into the server's WebSocket address. */
function toWs(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (!/^[a-z]+:\/\//i.test(u)) u = `https://${u}`;
  u = u.replace(/^http/i, 'ws');
  return /\/ws$/.test(u) ? u : `${u}/ws`;
}

/**
 * Where the game server lives, or null when this page has none (e.g. opened from a file or an artifact):
 *  1. `?server=…` in the page address,
 *  2. the page was served by a Borpse game server (it adds a `borpse-server` meta tag),
 *  3. the server baked in at build time (VITE_GAME_SERVER, e.g. for the GitHub Pages build),
 *  4. Vite's dev server, talking to `npm run server` next to it.
 */
export function defaultServerUrl(): string | null {
  const q = new URLSearchParams(window.location.search).get('server');
  if (q) return toWs(q);
  const { protocol, host, hostname, port } = window.location;
  const web = protocol === 'http:' || protocol === 'https:';
  if (web && document.querySelector('meta[name="borpse-server"]')) return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
  const built = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GAME_SERVER;
  if (built) return toWs(built);
  if (web && port === '5173') return `ws://${hostname}:8080/ws`;
  return null;
}

const LOCAL_HOSTS = /^(localhost|127(\.\d+){3}|\[::1\])$/i;

/**
 * Turns what someone typed into the Server box ("192.168.1.23:8080", "abc.trycloudflare.com",
 * "https://borpse.example.com") into a WebSocket address, or explains why this page can't use it.
 * Pages loaded over https may only reach secure (wss://) servers, plus localhost.
 */
export function serverAddress(input: string, pageProtocol = window.location.protocol): { url: string } | { error: string } {
  const raw = input.trim().replace(/\/+$/, '');
  if (!raw) return { error: 'Type the address of the computer running the game server.' };
  const m = /^([a-z]+):\/\/(.*)$/i.exec(raw);
  const scheme = m?.[1].toLowerCase();
  const rest = m ? m[2] : raw;
  const hostPort = rest.split('/')[0];
  const host = hostPort.startsWith('[') ? hostPort.slice(0, hostPort.indexOf(']') + 1) : hostPort.split(':')[0];
  const local = LOCAL_HOSTS.test(host);
  const securePage = pageProtocol === 'https:';
  let secure: boolean;
  if (scheme === 'https' || scheme === 'wss') secure = true;
  else if (scheme === 'http' || scheme === 'ws') secure = false;
  else if (scheme) return { error: `"${scheme}://" isn't a server address. Use something like https://my-server.example.com.` };
  // a bare IP address is almost always the plain game server on someone's computer, not a secure one
  else secure = securePage && !local && !/^(\d+(\.\d+){3}|\[.*\])$/.test(host);
  if (securePage && !secure && !local) {
    return {
      error:
        "This page is loaded over https, so your browser won't let it connect to an unencrypted server like that. " +
        'Give the server a secure address with a tunnel (see Hosting help), or open the game from the server itself: http://' +
        rest.replace(/\/ws$/, ''),
    };
  }
  let path = rest.replace(/\/ws$/, '');
  if (!path) return { error: 'Type the address of the computer running the game server.' };
  path = `${path}/ws`;
  return { url: `${secure ? 'wss' : 'ws'}://${path}` };
}

/** The Server box's starting text for a page that already knows its server. */
export function displayAddress(url: string | null): string {
  if (!url) return '';
  return url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/ws$/, '');
}

export class NetClient {
  status: NetStatus;
  sim: NetSim | null = null;
  private ws: WebSocket;
  private maps: SimMaps;
  private onStatus: (s: NetStatus) => void;
  private onSim: (sim: NetSim) => void;
  private pinger: ReturnType<typeof setInterval> | null = null;

  constructor(url: string, room: string, name: string, maps: SimMaps, onStatus: (s: NetStatus) => void, onSim: (sim: NetSim) => void) {
    this.maps = maps;
    this.onStatus = onStatus;
    this.onSim = onSim;
    let serverHost = '';
    try {
      serverHost = new URL(url).host;
    } catch {
      /* keep it blank */
    }
    this.status = { state: 'connecting', room, pid: 0, host: false, players: [], bots: 0, allen: 0, allenName: '', error: null, ping: null, location: null, serverHost };
    const qs = new URLSearchParams({ room, name, v: String(PROTOCOL_VERSION) });
    this.ws = new WebSocket(`${url}?${qs}`);
    this.ws.onmessage = (e) => this.onMessage(e.data);
    this.ws.onopen = () => {
      this.sendPing();
      this.pinger = setInterval(() => this.sendPing(), PING_EVERY_MS);
    };
    this.ws.onclose = () => {
      this.stopPinging();
      this.update({ state: 'closed', error: this.status.error ?? (this.status.state === 'connecting' ? "Couldn't reach the game server. Check the address, that the server is running, and that its firewall lets players in." : 'Disconnected from the game server.') });
    };
    this.ws.onerror = () => undefined;
    this.onStatus(this.status);
  }

  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.stopPinging();
    this.ws.onclose = null;
    this.ws.close();
  }

  private sendPing() {
    this.send({ t: 'ping', c: performance.now() });
  }

  private stopPinging() {
    if (this.pinger !== null) clearInterval(this.pinger);
    this.pinger = null;
  }

  private update(patch: Partial<NetStatus>) {
    this.status = { ...this.status, ...patch };
    this.onStatus(this.status);
  }

  private onMessage(data: unknown) {
    if (typeof data !== 'string') return;
    let msg: ServerMsg;
    try {
      msg = JSON.parse(data) as ServerMsg;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'welcome':
        this.sim = new NetSim(msg.pid, this.maps, (m) => this.send(m));
        this.update({ pid: msg.pid, room: msg.room, state: 'lobby', location: typeof msg.loc === 'string' && msg.loc ? msg.loc.slice(0, 40) : null });
        this.onSim(this.sim);
        break;
      case 'lobby':
        if (this.sim) this.sim.allenMode = msg.allen === this.status.pid;
        this.update({ room: msg.room, host: msg.host === this.status.pid, players: msg.players, bots: msg.bots, allen: msg.allen, allenName: msg.allenName, state: msg.playing ? 'playing' : 'lobby' });
        break;
      case 's':
        this.sim?.receive(msg);
        break;
      case 'pong': {
        const rtt = performance.now() - Number(msg.c);
        if (!(rtt >= 0 && rtt < 30000)) break;
        // smooth it so the number doesn't flicker every reading, but still reacts within a few seconds
        const prev = this.status.ping;
        const ping = prev === null ? rtt : prev * 0.6 + rtt * 0.4;
        if (prev === null || Math.round(prev) !== Math.round(ping)) this.update({ ping });
        break;
      }
      case 'error':
        this.update({ error: msg.msg });
        break;
    }
  }
}
