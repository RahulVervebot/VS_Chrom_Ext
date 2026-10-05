// Test helpers: temp project copy + a fake "Chrome" WebSocket client speaking the bridge protocol.
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { createMessage, PROTOCOL_VERSION } = require('../src/bridge/bridgeProtocol');

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.ai-project') continue; // never let a previous manual run leak into a test project
    const s = path.join(src, e.name); const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function tempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-'));
  copyDir(path.join(__dirname, 'fixtures/shop'), dir);
  return dir;
}

class FakeChrome {
  constructor(port, origin) { this.port = port; this.origin = origin; this.queue = []; this.waiters = []; this.session = null; }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`, this.origin ? { origin: this.origin } : {});
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      this.ws.on('message', (d) => this._on(JSON.parse(d.toString())));
      this.closed = new Promise((r) => this.ws.on('close', (code) => r(code)));
    });
  }
  _on(msg) {
    if (msg.messageType === 'PING') { this.send('PONG', {}); }
    const i = this.waiters.findIndex((w) => w.type === msg.messageType && (!w.pred || w.pred(msg)));
    if (i >= 0) { const [w] = this.waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(msg); } else this.queue.push(msg);
  }
  send(type, payload = {}, ctx = {}) {
    const msg = createMessage(type, { sessionId: ctx.sessionId ?? (this.session && this.session.sessionId), projectId: ctx.projectId ?? (this.session && this.session.projectId), payload });
    this.ws.send(JSON.stringify(msg));
    return msg;
  }
  sendRaw(text) { this.ws.send(text); }
  waitFor(type, pred, timeoutMs = 5000) {
    const i = this.queue.findIndex((m) => m.messageType === type && (!pred || pred(m)));
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeoutMs);
      this.waiters.push({ type, pred, resolve, timer });
    });
  }
  async pair(token, extra = {}) {
    this.send('PAIR_REQUEST', { pairingToken: token, clientName: 'Fake Chrome', protocolVersion: PROTOCOL_VERSION, ...extra }, { sessionId: null, projectId: null });
    const res = await this.waitFor('PAIR_RESPONSE');
    if (res.payload.accepted) this.session = { sessionId: res.payload.sessionId, projectId: res.payload.projectId, connectionId: res.payload.connectionId, sessionKey: res.payload.sessionKey };
    return res;
  }
  async resume(creds) {
    this.send('SESSION_RESUME', { connectionId: creds.connectionId, sessionKey: creds.sessionKey }, { sessionId: null, projectId: null });
    const res = await this.waitFor('SESSION_RESUME_RESPONSE');
    if (res.payload.accepted) this.session = { sessionId: res.payload.sessionId, projectId: res.payload.projectId, connectionId: creds.connectionId, sessionKey: creds.sessionKey };
    return res;
  }
  close() { try { this.ws.close(); } catch { /* ignore */ } return this.closed; }
}

module.exports = { tempProject, FakeChrome };
