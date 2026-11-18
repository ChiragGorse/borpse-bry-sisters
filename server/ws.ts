/**
 * A small WebSocket server (RFC 6455) on top of node:http, so the game server needs no dependencies.
 * Supports what the game uses: text messages, ping/pong, close, and fragmented frames.
 */
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Clients only ever send small control messages. */
const MAX_MESSAGE = 64 * 1024;
/** A client this far behind on reading gets dropped instead of piling up memory. */
const MAX_BUFFERED = 4 * 1024 * 1024;

export class WsConnection {
  onMessage: (text: string) => void = () => undefined;
  onClose: () => void = () => undefined;
  closed = false;
  private socket: Duplex;
  private buf: Buffer = Buffer.alloc(0);
  private parts: Buffer[] = [];
  private partOp = 0;
  private alive = true;
  private pinger: ReturnType<typeof setInterval>;

  constructor(socket: Duplex) {
    this.socket = socket;
    socket.on('data', (d: Buffer) => this.onData(d));
    socket.on('close', () => this.finish());
    socket.on('error', () => this.finish());
    // drop connections that stop answering pings (laptop lid closed, network gone)
    this.pinger = setInterval(() => {
      if (!this.alive) return this.terminate();
      this.alive = false;
      this.frame(0x9, Buffer.alloc(0));
    }, 15000);
  }

  /** Bytes queued for this client that it hasn't read yet. */
  get buffered(): number {
    return this.socket.writableLength;
  }

  send(text: string) {
    if (this.closed) return;
    if (this.socket.writableLength > MAX_BUFFERED) return this.terminate();
    this.frame(0x1, Buffer.from(text, 'utf8'));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const r = Buffer.from(reason, 'utf8');
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    this.frame(0x8, p);
    this.socket.end();
    this.finish();
  }

  terminate() {
    this.socket.destroy();
    this.finish();
  }

  private finish() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pinger);
    this.onClose();
  }

  private frame(op: number, payload: Buffer) {
    const len = payload.length;
    let head: Buffer;
    if (len < 126) {
      head = Buffer.from([0x80 | op, len]);
    } else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    this.socket.write(Buffer.concat([head, payload]));
  }

  private onData(d: Buffer) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return this.close(1009, 'message too big');
        len = Number(big);
        off = 10;
      }
      // browsers must mask what they send
      if (!masked) return this.close(1002, 'unmasked frame');
      if (len > MAX_MESSAGE) return this.close(1009, 'message too big');
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      this.handle(op, fin, payload);
      if (this.closed) return;
    }
  }

  private handle(op: number, fin: boolean, payload: Buffer) {
    switch (op) {
      case 0x0: // continuation
      case 0x1: // text
      case 0x2: {
        // binary (unused, but must be assembled to stay in sync)
        if (op !== 0x0) {
          this.parts = [];
          this.partOp = op;
        }
        this.parts.push(payload);
        if (this.parts.reduce((a, p) => a + p.length, 0) > MAX_MESSAGE) return this.close(1009, 'message too big');
        if (!fin) return;
        const whole = Buffer.concat(this.parts);
        this.parts = [];
        if (this.partOp === 0x1) this.onMessage(whole.toString('utf8'));
        return;
      }
      case 0x8:
        return this.close();
      case 0x9:
        return this.frame(0xa, payload);
      case 0xa:
        this.alive = true;
        return;
      default:
        return this.close(1003, 'unsupported frame');
    }
  }
}

/** Completes the HTTP upgrade handshake. Returns null (after rejecting) if the request isn't a WebSocket. */
export function acceptWebSocket(req: IncomingMessage, socket: Duplex): WsConnection | null {
  const key = req.headers['sec-websocket-key'];
  if (req.headers.upgrade?.toLowerCase() !== 'websocket' || typeof key !== 'string') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = createHash('sha1')
    .update(key + GUID)
    .digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  return new WsConnection(socket);
}
