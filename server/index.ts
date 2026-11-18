/**
 * The Borpse Bry Sisters game server.
 *
 *   PORT=8080 node dist-server/server.mjs     (after `npm run build && npm run server:build`)
 *   npm run server                            (straight from the TypeScript sources)
 *
 * Serves the built game (dist/index.html) on http://host:PORT/, and runs rooms over WebSockets at
 * ws://host:PORT/ws?room=CODE&name=NAME. A room exists while someone is in it; an unknown code creates
 * a room with that code, and an empty code creates one with a fresh random code.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { acceptWebSocket } from './ws';
import { Room } from './room';
import { PROTOCOL_VERSION, ROOM_ALPHABET, normalizeRoom } from '../src/game/net/protocol';

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const STATIC_DIR = resolve(process.env.STATIC_DIR || 'dist');
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 100;
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const rooms = new Map<string, Room>();
const log = (s: string) => console.log(`${new Date().toISOString()} ${s}`);

function freshCode(): string {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((a, r) => a + r.size, 0) }));
    return;
  }
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(STATIC_DIR, rel === '/' || rel === '\\' ? 'index.html' : rel);
  if (!file.startsWith(STATIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end(file.endsWith('index.html') ? 'Game files not found. Run `npm run build` first (or set STATIC_DIR).' : 'Not found');
  }
}

const server = createServer((req, res) => {
  serveStatic(req, res).catch(() => res.writeHead(500).end());
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }
  const conn = acceptWebSocket(req, socket);
  if (!conn) return;
  if (Number(url.searchParams.get('v')) !== PROTOCOL_VERSION) {
    conn.send(JSON.stringify({ t: 'error', msg: 'This game page is out of date with the server. Reload the page.' }));
    conn.close(4000, 'version mismatch');
    return;
  }
  const code = normalizeRoom(url.searchParams.get('room') ?? '');
  let room = code.length === 4 ? rooms.get(code) : undefined;
  if (!room) {
    if (rooms.size >= MAX_ROOMS) {
      conn.send(JSON.stringify({ t: 'error', msg: 'The server is full right now. Try again in a bit.' }));
      conn.close(4003, 'server full');
      return;
    }
    const newCode = code.length === 4 ? code : freshCode();
    room = new Room(newCode, () => {
      rooms.delete(newCode);
      log(`room ${newCode} closed (${rooms.size} open)`);
    }, log);
    rooms.set(newCode, room);
    log(`room ${newCode} opened (${rooms.size} open)`);
  }
  room.join(conn, url.searchParams.get('name') ?? '');
});

server.listen(PORT, HOST, () => log(`Borpse Bry Sisters server on http://${HOST}:${PORT}  (game files: ${STATIC_DIR})`));

const shutdown = () => {
  for (const r of rooms.values()) r.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
