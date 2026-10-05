// Transport layer: secure localhost WebSocket. Everything above this file sees only the Transport interface:
//   transport.start() / stop() ; transport.on('connection', conn)
//   conn: { id, remote, origin, send(text), close(code, reason), on('message'|'close'|'error') }
// Replace this file (e.g. with native messaging) without touching the rest of the bridge.
const EventEmitter = require('events');
const { WebSocketServer } = require('ws');
const { randomId } = require('../utils/ids');
const { MAX_MESSAGE_BYTES } = require('./bridgeProtocol');
const logger = require('../utils/logger');

class WsConnection extends EventEmitter {
  constructor(ws, req) {
    super();
    this.ws = ws;
    this.id = randomId('sock');
    this.remote = req.socket.remoteAddress;
    this.origin = req.headers.origin || null;
    ws.on('message', (data) => this.emit('message', data.toString()));
    ws.on('close', () => this.emit('close'));
    ws.on('error', (err) => this.emit('error', err));
    ws.on('pong', () => this.emit('pong'));
  }
  send(text) { if (this.ws.readyState === 1) this.ws.send(text); }
  close(code = 1000, reason = '') { try { this.ws.close(code, reason.slice(0, 100)); } catch { /* already closed */ } }
  terminate() { try { this.ws.terminate(); } catch { /* already closed */ } }
}

class WebSocketTransport extends EventEmitter {
  // originCheck(origin) -> boolean : decided by SecurityManager before the socket is accepted
  constructor({ host = '127.0.0.1', port, originCheck }) {
    super();
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`Bridge host must be loopback, got ${host}`);
    this.host = host;
    this.port = port;
    this.originCheck = originCheck;
    this.server = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        host: this.host,
        port: this.port,
        maxPayload: MAX_MESSAGE_BYTES,
        verifyClient: (info, cb) => {
          const ok = this.originCheck ? this.originCheck(info.origin) : false;
          if (!ok) logger.warn('BRIDGE', 'rejected connection from disallowed origin');
          cb(ok, 403, 'Origin not allowed');
        },
      });
      server.once('error', reject);
      server.once('listening', () => {
        this.server = server;
        this.port = server.address().port;
        server.on('connection', (ws, req) => this.emit('connection', new WsConnection(ws, req)));
        server.on('error', (err) => this.emit('error', err));
        resolve({ host: this.host, port: this.port });
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      for (const c of this.server.clients) c.terminate();
      this.server.close(() => { this.server = null; resolve(); });
    });
  }
}

module.exports = { WebSocketTransport, WsConnection };
