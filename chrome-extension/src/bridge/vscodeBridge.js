// WebSocket client to the VS Code bridge (loopback only). Handles pairing, session resume, heartbeat, reconnect and an outbox
// so results produced while disconnected are delivered after the session is resumed.
import { T, PROTOCOL_VERSION, createMessage, parseMessage } from './bridgeProtocol.js';
import { storage, update } from '../utils/storage.js';
import { log } from '../utils/logger.js';

const DURABLE = new Set([T.AI_RESPONSE, T.KNOWLEDGE_PACKAGE, T.ANALYSIS_COMPLETE, T.CHANGE_PROPOSAL, T.DOCUMENTATION_RESPONSE, T.COMPARISON_RESPONSE, T.BLUEPRINT_RESPONSE]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// VS Code shows "<port>-<code>" so the port never has to be typed; a bare code plus the port field also works.
export function parsePairingCode(input, fallbackPort) {
  const raw = String(input || '').trim().toUpperCase();
  const m = /^(\d{2,5})\s*-\s*([A-Z0-9]{8,32})$/.exec(raw);
  if (m) return { port: Number(m[1]), token: m[2] };
  return { port: fallbackPort, token: raw };
}

export class VsCodeBridge {
  constructor({ onStatus, WebSocketImpl } = {}) {
    this.WS = WebSocketImpl || WebSocket;
    this.onStatus = onStatus || (() => {});
    this.handlers = new Map();
    this.waiters = [];
    this.state = 'DISCONNECTED'; // DISCONNECTED | CONNECTING | PAIRING | CONNECTED
    this.ws = null;
    this.session = null; // { sessionId, projectId, connectionId }
    this.creds = null;   // { port, connectionId, sessionKey }
    this.wantConnected = false;
    this.attempt = 0;
    this.lastError = null;
  }

  on(type, fn) { this.handlers.set(type, fn); return this; }
  setState(s, err) { this.state = s; if (err !== undefined) this.lastError = err; this.onStatus({ state: s, session: this.session, error: this.lastError }); }

  async loadCreds() { this.creds = await storage.get('pairing', null); return this.creds; }

  // ---- pairing (user typed the code shown in VS Code) ----
  async pair({ port, token }) {
    this.wantConnected = false; // no auto-reconnect while pairing
    this.close();
    this.setState('PAIRING', null);
    let ws;
    try { ws = await this.open(port); } catch (e) { this.setState('DISCONNECTED', e.message); throw e; }
    const responded = this.waitFor(T.PAIR_RESPONSE, 180000);
    ws.send(JSON.stringify(createMessage(T.PAIR_REQUEST, { payload: { pairingToken: token.trim(), clientName: 'AI Project Bridge (Chrome)', clientVersion: typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : 'dev', protocolVersion: PROTOCOL_VERSION } })));
    let res;
    try { res = await responded; } catch (e) { this.close(); this.setState('DISCONNECTED', e.message); throw e; }
    const p = res.payload;
    if (!p.accepted) { this.close(); this.setState('DISCONNECTED', p.message || 'Pairing failed'); throw new Error(p.message || 'Pairing failed'); }
    const previousProject = this.creds ? this.creds.projectId : null;
    this.creds = { port, connectionId: p.connectionId, sessionKey: p.sessionKey, projectId: p.projectId };
    await storage.set('pairing', this.creds);
    this.session = { sessionId: p.sessionId, projectId: p.projectId, connectionId: p.connectionId, projectName: p.projectName };
    this.wantConnected = true; this.attempt = 0;
    this.setState('CONNECTED', null);
    await log('info', 'BRIDGE', 'paired with VS Code');
    // Pairing to a different project: work for the previous one is suspended, never mixed into this session.
    if (previousProject && previousProject !== p.projectId && this.handlers.has('switched')) await this.handlers.get('switched')({ from: previousProject, to: p.projectId });
    this.flushOutbox();
    return p;
  }

  // ---- reconnect with the stored session (no new pairing) ----
  async connect() {
    if (!this.creds) await this.loadCreds();
    if (!this.creds) throw new Error('Not paired yet. Pair with VS Code first.');
    this.wantConnected = true;
    if (this.state === 'CONNECTED' || this.state === 'CONNECTING') return;
    this.setState('CONNECTING', null);
    try {
      const ws = await this.open(this.creds.port);
      const responded = this.waitFor(T.SESSION_RESUME_RESPONSE, 15000);
      ws.send(JSON.stringify(createMessage(T.SESSION_RESUME, { payload: { connectionId: this.creds.connectionId, sessionKey: this.creds.sessionKey } })));
      const res = await responded;
      if (!res.payload.accepted) {
        this.wantConnected = false; this.close();
        await storage.remove('pairing'); this.creds = null;
        this.setState('DISCONNECTED', res.payload.message || 'VS Code no longer recognizes this browser. Pair again.');
        throw new Error(res.payload.message || 'Resume refused');
      }
      this.session = { sessionId: res.payload.sessionId, projectId: res.payload.projectId, connectionId: this.creds.connectionId };
      this.attempt = 0;
      this.setState('CONNECTED', null);
      await log('info', 'BRIDGE', 'session resumed');
      if (this.handlers.has('resumed')) await this.handlers.get('resumed')(res.payload);
      this.flushOutbox();
    } catch (e) {
      if (this.state !== 'DISCONNECTED') this.setState('DISCONNECTED', e.message);
      this.scheduleReconnect();
      throw e;
    }
  }

  open(port) {
    return new Promise((resolve, reject) => {
      const ws = new this.WS(`ws://127.0.0.1:${port}`);
      let opened = false;
      const timer = setTimeout(() => { try { ws.close(); } catch { /* ignore */ } reject(new Error(`VS Code is not listening on port ${port}. Run "AI Project: Pair Chrome" (or Connect Chrome) in VS Code.`)); }, 8000);
      ws.onopen = () => { opened = true; clearTimeout(timer); this.ws = ws; resolve(ws); };
      ws.onerror = () => { if (!opened) { clearTimeout(timer); reject(new Error(`Could not reach VS Code on 127.0.0.1:${port}. Is the bridge running?`)); } };
      ws.onmessage = (ev) => this.onRaw(ev.data);
      ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.onClosed(); } };
    });
  }

  close() { const ws = this.ws; this.ws = null; if (ws) { try { ws.close(); } catch { /* ignore */ } } }

  disconnect() { this.wantConnected = false; this.close(); this.session = null; this.setState('DISCONNECTED', null); }

  async forget() { this.disconnect(); this.creds = null; await storage.remove('pairing'); }

  onClosed() {
    const was = this.state;
    this.session = was === 'CONNECTED' ? this.session : null;
    this.setState('DISCONNECTED');
    if (this.handlers.has('closed')) this.handlers.get('closed')();
    if (this.wantConnected) this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnecting || !this.wantConnected) return;
    this.reconnecting = true;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.attempt++, 5));
    setTimeout(async () => { this.reconnecting = false; if (!this.wantConnected || this.state === 'CONNECTED') return; try { await this.connect(); } catch { /* connect() reschedules */ } }, delay);
  }

  // ---- messaging ----
  onRaw(raw) {
    const p = parseMessage(raw);
    if (!p.ok) { log('warn', 'BRIDGE', `dropped invalid message: ${p.error}`); return; }
    const m = p.message;
    if (m.messageType === T.PING) { this.sendNow(T.PONG, { nonce: m.payload.nonce }); return; }
    const i = this.waiters.findIndex((w) => w.type === m.messageType);
    if (i >= 0) { const [w] = this.waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(m); return; }
    const h = this.handlers.get(m.messageType);
    if (h) Promise.resolve(h(m)).catch((e) => log('error', 'BRIDGE', `handler for ${m.messageType} failed: ${e.message}`));
  }

  waitFor(type, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters = this.waiters.filter((w) => w.timer !== timer); reject(new Error(`No ${type} from VS Code within ${Math.round(ms / 1000)}s`)); }, ms);
      this.waiters.push({ type, resolve, timer });
    });
  }

  sendNow(type, payload, opts = {}) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(createMessage(type, { sessionId: this.session && this.session.sessionId, projectId: this.session && this.session.projectId, payload, inReplyTo: opts.inReplyTo })));
    return true;
  }

  // Durable messages are queued if the socket is down OR the message belongs to a different project than the current session.
  // opts.projectId names the project a message is for; it is only ever delivered to that project's session.
  async send(type, payload, opts = {}) {
    const target = opts.projectId || null;
    const here = this.session ? this.session.projectId : null;
    if (this.state === 'CONNECTED' && (!target || target === here) && this.sendNow(type, payload, opts)) return true;
    if (DURABLE.has(type)) { await update('outbox', (q) => [...q, { type, payload, opts: { inReplyTo: opts.inReplyTo }, projectId: target || (this.creds && this.creds.projectId) || null, queuedAt: new Date().toISOString() }].slice(-200), []); }
    return false;
  }

  async flushOutbox() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const here = this.session ? this.session.projectId : null;
      const q = await storage.get('outbox', []);
      const mine = q.filter((m) => !m.projectId || m.projectId === here);
      if (!mine.length) return;
      await storage.set('outbox', q.filter((m) => !mine.includes(m)));
      for (const m of mine) { if (!this.sendNow(m.type, m.payload, m.opts)) { await update('outbox', (cur) => [m, ...cur], []); break; } await sleep(20); }
      await log('info', 'BRIDGE', `delivered ${mine.length} queued message(s)`);
    } finally { this.flushing = false; }
  }
}
