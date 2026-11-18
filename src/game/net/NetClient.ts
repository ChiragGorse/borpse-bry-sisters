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
  error: string | null;
}

/** Where the game server lives: the page's own host when the server is serving it, or ?server=… */
export function defaultServerUrl(): string | null {
  const q = new URLSearchParams(window.location.search).get('server');
  if (q) return q.replace(/^http/, 'ws').replace(/\/?$/, '/ws').replace(/\/ws\/ws$/, '/ws');
  const { protocol, host, port } = window.location;
  if (protocol !== 'http:' && protocol !== 'https:') return null;
  // Vite's dev server: talk to a game server running next to it
  if (port === '5173') return `ws://${window.location.hostname}:8080/ws`;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
}

export class NetClient {
  status: NetStatus;
  sim: NetSim | null = null;
  private ws: WebSocket;
  private maps: SimMaps;
  private onStatus: (s: NetStatus) => void;
  private onSim: (sim: NetSim) => void;

  constructor(url: string, room: string, name: string, maps: SimMaps, onStatus: (s: NetStatus) => void, onSim: (sim: NetSim) => void) {
    this.maps = maps;
    this.onStatus = onStatus;
    this.onSim = onSim;
    this.status = { state: 'connecting', room, pid: 0, host: false, players: [], bots: 0, error: null };
    const qs = new URLSearchParams({ room, name, v: String(PROTOCOL_VERSION) });
    this.ws = new WebSocket(`${url}?${qs}`);
    this.ws.onmessage = (e) => this.onMessage(e.data);
    this.ws.onclose = () => this.update({ state: 'closed', error: this.status.error ?? (this.status.state === 'connecting' ? "Couldn't reach the game server." : 'Disconnected from the game server.') });
    this.ws.onerror = () => undefined;
    this.onStatus(this.status);
  }

  send(m: ClientMsg) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.ws.onclose = null;
    this.ws.close();
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
        this.update({ pid: msg.pid, room: msg.room, state: 'lobby' });
        this.onSim(this.sim);
        break;
      case 'lobby':
        this.update({ room: msg.room, host: msg.host === this.status.pid, players: msg.players, bots: msg.bots, state: msg.playing ? 'playing' : 'lobby' });
        break;
      case 's':
        this.sim?.receive(msg);
        break;
      case 'error':
        this.update({ error: msg.msg });
        break;
    }
  }
}
