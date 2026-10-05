// Per-socket connection state machine + heartbeat.
const EventEmitter = require('events');
const { RateLimiter } = require('./securityManager');
const { MessageType, createMessage } = require('./bridgeProtocol');

const State = Object.freeze({ UNAUTHENTICATED: 'UNAUTHENTICATED', PAIRING: 'PAIRING', CONNECTED: 'CONNECTED', CLOSED: 'CLOSED' });

class Connection {
  constructor(socket) {
    this.socket = socket;
    this.state = State.UNAUTHENTICATED;
    this.connectionId = null;
    this.session = null;
    this.extensionId = null;
    this.limiter = new RateLimiter();
    this.lastPong = Date.now();
    this.violations = 0;
    this.openedAt = Date.now();
  }
  send(msg) { this.socket.send(JSON.stringify(msg)); }
  close(code, reason) { this.state = State.CLOSED; this.socket.close(code, reason); }
}

class ConnectionManager extends EventEmitter {
  constructor({ heartbeatMs = 15_000, timeoutMs = 45_000, authTimeoutMs = 150_000 } = {}) {
    super();
    this.connections = new Map(); // socket id -> Connection
    this.heartbeatMs = heartbeatMs;
    this.timeoutMs = timeoutMs;
    this.authTimeoutMs = authTimeoutMs;
    this.timer = null;
  }

  add(socket) {
    const c = new Connection(socket);
    this.connections.set(socket.id, c);
    socket.on('close', () => { this.connections.delete(socket.id); c.state = State.CLOSED; this.emit('closed', c); });
    return c;
  }

  active() { return [...this.connections.values()].find((c) => c.state === State.CONNECTED) || null; }
  all() { return [...this.connections.values()]; }

  startHeartbeat() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const c of this.connections.values()) {
        if (c.state === State.CONNECTED) {
          if (now - c.lastPong > this.timeoutMs) { this.emit('timeout', c); c.socket.terminate && c.socket.terminate(); continue; }
          c.send(createMessage(MessageType.PING, { sessionId: c.session && c.session.sessionId, projectId: c.session && c.session.projectId, payload: {} }));
        } else if (now - c.openedAt > this.authTimeoutMs) {
          c.close(4001, 'authentication timeout');
        }
      }
    }, this.heartbeatMs);
    if (this.timer.unref) this.timer.unref();
  }

  stopHeartbeat() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  closeAll(code = 1001, reason = 'bridge stopping') { for (const c of this.connections.values()) c.close(code, reason); }
}

module.exports = { ConnectionManager, Connection, State };
