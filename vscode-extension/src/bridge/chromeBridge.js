// Facade over the bridge. The rest of the extension only knows this class (and BRIDGE-PROTOCOL.md).
// It contains no AI-provider knowledge: `provider` is an opaque string reported by Chrome.
const EventEmitter = require('events');
const { WebSocketTransport } = require('./bridgeServer');
const { ConnectionManager, State } = require('./connectionManager');
const { SessionManager } = require('./sessionManager');
const { SecurityManager } = require('./securityManager');
const { MessageManager } = require('./messageManager');
const { RequestManager } = require('./requestManager');
const { ResponseManager } = require('./responseManager');
const { AnalysisRunner } = require('./analysisRunner');
const { MessageType, PRE_AUTH, ErrorCode, PROTOCOL_VERSION, parseMessage, createMessage } = require('./bridgeProtocol');
const logger = require('../utils/logger');

class ChromeBridge extends EventEmitter {
  /**
   * @param {object} o
   * @param {() => object|null} o.getProject           current project {projectId,name,...} or null
   * @param {(info) => Promise<boolean>} o.confirmPairing  user confirmation UI
   * @param {object} o.services                        { history, onKnowledgePackage, onChangeProposal, onDocumentation, onComparison, onBlueprint }
   * @param {object} [o.secretStore]                   VS Code SecretStorage-shaped store
   * @param {Function} [o.transportFactory]            (opts) => transport; defaults to WebSocketTransport
   */
  constructor({ getProject, confirmPairing, services = {}, secretStore, host = '127.0.0.1', port = 47821, transportFactory, allowNoOrigin = false, heartbeatMs, timeoutMs, pairingTtlMs }) {
    super();
    this.getProject = getProject;
    this.confirmPairing = confirmPairing;
    this.services = services;
    this.host = host;
    this.port = port;
    this.security = new SecurityManager({ secretStore, allowNoOrigin, ttlMs: pairingTtlMs });
    this.connections = new ConnectionManager({ heartbeatMs, timeoutMs });
    this.sessions = new SessionManager();
    this.messages = new MessageManager();
    this.requests = new RequestManager();
    this.router = new ResponseManager({ messages: this.messages });
    this.transportFactory = transportFactory || ((o) => new WebSocketTransport(o));
    this.transport = null;
    this.pairingRecord = null;
    this.runner = new AnalysisRunner({ bridge: this, history: services.history });
    this._registerHandlers();
    this.connections.on('closed', (c) => this._onClosed(c));
    this.connections.on('timeout', (c) => logger.warn('BRIDGE', 'heartbeat timeout', { connectionId: c.connectionId }));
  }

  // ---- lifecycle ----
  // Listens on the configured port; if another VS Code window (another project) already uses it, the next free port is taken.
  // The pairing code includes the port, so the user never has to know which one was chosen.
  async start() {
    if (this.transport) return this.getStatus();
    const base = this.port;
    for (let i = 0; i < 10; i++) {
      const port = base === 0 ? 0 : base + i;
      const t = this.transportFactory({ host: this.host, port, originCheck: (origin) => this._originAllowed(origin) });
      t.on('connection', (sock) => this._onConnection(sock));
      t.on('error', (err) => { logger.error('BRIDGE', 'transport error', { error: err.message }); this.emit('status', this.getStatus()); });
      let bound;
      try { bound = await t.start(); } catch (err) {
        if (err.code === 'EADDRINUSE' && base !== 0) { logger.warn('BRIDGE', `port ${port} is in use (another project window?); trying the next one`); continue; }
        throw err;
      }
      this.transport = t;
      this.port = bound.port;
      this.connections.startHeartbeat();
      logger.info('BRIDGE', 'listening', { host: bound.host, port: bound.port });
      this.emit('status', this.getStatus());
      return this.getStatus();
    }
    const e = new Error(`Ports ${base}-${base + 9} are all in use. Close the other AI Project windows or change aiProject.chromeBridgePort.`);
    e.code = 'EADDRINUSE';
    throw e;
  }

  async stop() {
    this.runner.onBridgeStopped();
    this.connections.stopHeartbeat();
    this.connections.closeAll();
    this.requests.rejectAll('bridge stopped');
    this.security.cancelPairing();
    if (this.transport) { await this.transport.stop(); this.transport = null; }
    this.emit('status', this.getStatus());
  }

  async startPairing() {
    const project = this.getProject();
    if (!project) { const e = new Error('Initialize the project before pairing Chrome.'); e.code = 'NOT_INITIALIZED'; throw e; }
    await this.start();
    const { token, expiresAt } = this.security.createPairingToken(project.projectId);
    this.pairingRecord = { expiresAt };
    logger.info('BRIDGE', 'pairing started', { expiresAt });
    this.emit('status', this.getStatus());
    return { token, code: `${this.port}-${token}`, expiresAt, host: this.host, port: this.port, projectId: project.projectId };
  }

  async disconnect({ revoke = false } = {}) {
    const c = this.connections.active();
    if (c) {
      if (revoke && c.connectionId) { await this.security.revokeConnection(c.connectionId); this.sessions.closeByConnection(c.connectionId); }
      c.close(1000, 'disconnected by VS Code');
    } else if (revoke) await this.security.revokeAll();
    this.emit('status', this.getStatus());
  }

  getStatus() {
    const c = this.connections.active();
    const project = this.getProject && this.getProject();
    let state = 'STOPPED';
    if (this.transport) state = c ? 'CONNECTED' : (this.security.hasPendingToken() ? 'PAIRING' : 'LISTENING');
    return {
      state,
      host: this.host,
      port: this.port,
      protocolVersion: PROTOCOL_VERSION,
      projectId: project ? project.projectId : null,
      sessionId: c && c.session ? c.session.sessionId : null,
      connectionId: c ? c.connectionId : null,
      provider: c && c.session ? c.session.provider : null,
      extensionId: c ? c.extensionId : null,
      pairingExpiresAt: this.security.hasPendingToken() && this.pairingRecord ? this.pairingRecord.expiresAt : null,
      activeAnalysis: this.runner.summary(),
    };
  }

  // ---- sending ----
  activeConnection() { return this.connections.active(); }

  send(type, payload, { inReplyTo } = {}) {
    const c = this.connections.active();
    if (!c) { const e = new Error('Chrome is not connected.'); e.code = 'CHROME_UNAVAILABLE'; throw e; }
    const msg = createMessage(type, { sessionId: c.session.sessionId, projectId: c.session.projectId, payload, inReplyTo });
    c.send(msg);
    return msg;
  }

  // Send and wait for the correlated reply.
  request(type, payload, { timeoutMs } = {}) {
    const c = this.connections.active();
    if (!c) return Promise.reject(Object.assign(new Error('Chrome is not connected.'), { code: 'CHROME_UNAVAILABLE' }));
    const msg = createMessage(type, { sessionId: c.session.sessionId, projectId: c.session.projectId, payload });
    const p = this.requests.expect(msg.messageId, { type, timeoutMs });
    c.send(msg);
    return p;
  }

  // ---- inbound ----
  _originAllowed(origin) {
    // A previously paired extension id is pinned once known; before that any chrome-extension:// origin may attempt to pair (a token is still required).
    return this.security.checkOrigin(origin, this._pinnedExtensionId);
  }

  _onConnection(sock) {
    if (this.security.isBlocked(sock.remote)) { sock.close(4029, 'too many failed attempts'); return; }
    const conn = this.connections.add(sock);
    conn.extensionId = this.security.extensionIdFromOrigin(sock.origin);
    sock.on('message', (raw) => this._onRaw(conn, raw));
    sock.on('error', (err) => logger.warn('BRIDGE', 'socket error', { error: err.message }));
    sock.on('pong', () => { conn.lastPong = Date.now(); });
    this.emit('status', this.getStatus());
  }

  async _onRaw(conn, raw) {
    if (!conn.limiter.allow()) {
      conn.send(this.messages.error(ErrorCode.RATE_LIMITED, 'Too many messages.', {}));
      if (++conn.violations > 3) conn.close(4008, 'rate limited');
      return;
    }
    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      conn.send(this.messages.error(parsed.code, parsed.error, {}));
      if (++conn.violations > 5) conn.close(4000, 'protocol violations');
      return;
    }
    const msg = parsed.message;
    conn.lastPong = Date.now();

    if (conn.state !== State.CONNECTED && !PRE_AUTH.has(msg.messageType)) {
      conn.send(this.messages.error(ErrorCode.UNAUTHENTICATED, 'Pair or resume the session first.', { inReplyTo: msg.messageId }));
      if (++conn.violations > 3) conn.close(4003, 'unauthenticated');
      return;
    }
    if (conn.state === State.CONNECTED) {
      const project = this.getProject();
      if (msg.sessionId !== conn.session.sessionId) { conn.send(this.messages.error(ErrorCode.SESSION_MISMATCH, 'sessionId does not match this connection.', { sessionId: conn.session.sessionId, inReplyTo: msg.messageId })); return; }
      if (!project || (msg.projectId && msg.projectId !== project.projectId)) { conn.send(this.messages.error(ErrorCode.PROJECT_MISMATCH, 'projectId does not match the open project.', { sessionId: conn.session.sessionId, inReplyTo: msg.messageId })); return; }
      this.sessions.touch(conn.session.sessionId);
    }

    if (this.requests.fulfil(msg)) return;
    const replies = await this.router.dispatch(msg, { conn, session: conn.session, projectId: conn.session && conn.session.projectId, bridge: this });
    for (const r of replies) conn.send(r);
  }

  _onClosed(conn) {
    if (conn.session) {
      this.sessions.detach(conn.session.sessionId);
      this.runner.onDisconnected(conn.session.sessionId);
    }
    this.emit('status', this.getStatus());
  }

  // ---- handlers ----
  _registerHandlers() {
    const M = MessageType;
    const r = this.router;
    r.on(M.PING, async (m, ctx) => this.messages.build(M.PONG, { sessionId: ctx.session && ctx.session.sessionId, projectId: ctx.projectId, payload: { nonce: m.payload.nonce } }));
    r.on(M.PONG, async (m, ctx) => { ctx.conn.lastPong = Date.now(); });
    r.on(M.PAIR_REQUEST, (m, ctx) => this._handlePair(m, ctx));
    r.on(M.SESSION_RESUME, (m, ctx) => this._handleResume(m, ctx));
    r.on(M.PROJECT_REGISTER_RESPONSE, async () => {});
    r.on(M.ERROR, async (m) => { logger.warn('BRIDGE', 'peer reported error', { code: m.payload.code }); this.emit('peer-error', m.payload); });
    r.on(M.WARNING, async (m) => { logger.warn('BRIDGE', 'peer warning', { code: m.payload.code }); this.emit('peer-warning', m.payload); });
    r.on(M.CHANGE_PROPOSAL, (m, ctx) => this._svc('onChangeProposal', m, ctx));
    r.on(M.DOCUMENTATION_RESPONSE, (m, ctx) => this._svc('onDocumentation', m, ctx));
    r.on(M.COMPARISON_RESPONSE, (m, ctx) => this._svc('onComparison', m, ctx));
    r.on(M.BLUEPRINT_RESPONSE, (m, ctx) => this._svc('onBlueprint', m, ctx));
    this.runner.register(r);
  }

  // Service handlers return undefined, or { code, message } which is relayed to Chrome as a WARNING (informational) message.
  async _svc(name, m, ctx) {
    const base = { sessionId: ctx.session.sessionId, projectId: ctx.projectId };
    const fn = this.services[name];
    if (!fn) return this.messages.warning('NOT_SUPPORTED', `${name} is not available`, base);
    try {
      const out = await fn(m.payload, ctx);
      this.emit(name, m.payload);
      return out && out.code ? this.messages.warning(out.code, out.message, base) : undefined;
    } catch (err) {
      const code = { SCHEMA_MISMATCH: ErrorCode.SCHEMA_INVALID, PROJECT_MISMATCH: ErrorCode.PROJECT_MISMATCH }[err.code] || ErrorCode.INTERNAL;
      return this.messages.error(code, err.message, { ...base, details: err.details });
    }
  }

  async _handlePair(m, ctx) {
    const conn = ctx.conn;
    const p = m.payload;
    const fail = (code, message) => { this.security.recordFailure(conn.socket.remote); return [this.messages.build(MessageType.PAIR_RESPONSE, { payload: { accepted: false, code, message } })]; };
    const ver = String(p.protocolVersion || m.protocolVersion);
    if (ver.split('.')[0] !== PROTOCOL_VERSION.split('.')[0]) { const out = fail(ErrorCode.PROTOCOL_MISMATCH, `Compatible versions required: VS Code speaks ${PROTOCOL_VERSION}, Chrome sent ${ver}.`); setTimeout(() => conn.close(4002, 'protocol mismatch'), 50); return out; }
    const res = this.security.consumePairingToken(p.pairingToken);
    if (!res.ok) { const out = fail(res.reason === 'expired' ? ErrorCode.TOKEN_EXPIRED : ErrorCode.PAIRING_FAILED, res.reason === 'expired' ? 'Pairing token expired. Run "AI Project: Pair Chrome" again.' : 'Invalid pairing token.'); setTimeout(() => conn.close(4003, 'pairing failed'), 50); return out; }
    const project = this.getProject();
    if (!project || project.projectId !== res.projectId) return fail(ErrorCode.PROJECT_MISMATCH, 'The pairing token was issued for a different project.');

    conn.state = State.PAIRING;
    const info = { extensionId: conn.extensionId, clientName: String(p.clientName || 'Chrome extension').slice(0, 80), clientVersion: String(p.clientVersion || '').slice(0, 20), projectName: project.name };
    let accepted = false;
    try { accepted = await this.confirmPairing(info); } catch { accepted = false; }
    if (!accepted) { setTimeout(() => conn.close(4004, 'pairing rejected'), 50); return [this.messages.build(MessageType.PAIR_RESPONSE, { payload: { accepted: false, code: ErrorCode.PAIRING_REJECTED, message: 'Pairing was rejected in VS Code.' } })]; }

    const { connectionId, sessionKey } = await this.security.registerConnection({ projectId: project.projectId, extensionId: conn.extensionId, label: info.clientName });
    return this._establish(conn, { connectionId, projectId: project.projectId, extensionId: conn.extensionId }, (session) => this.messages.build(MessageType.PAIR_RESPONSE, {
      sessionId: session.sessionId, projectId: project.projectId,
      payload: { accepted: true, connectionId, sessionId: session.sessionId, sessionKey, projectId: project.projectId, projectName: project.name, protocolVersion: PROTOCOL_VERSION },
    }));
  }

  async _handleResume(m, ctx) {
    const conn = ctx.conn;
    const p = m.payload;
    const rec = await this.security.verifyConnection(p.connectionId, p.sessionKey);
    const project = this.getProject();
    if (!rec || !project || rec.projectId !== project.projectId) {
      this.security.recordFailure(conn.socket.remote);
      setTimeout(() => conn.close(4003, 'resume failed'), 50);
      return [this.messages.build(MessageType.SESSION_RESUME_RESPONSE, { payload: { accepted: false, code: ErrorCode.UNAUTHENTICATED, message: 'Unknown or revoked connection. Pair again.' } })];
    }
    if (rec.extensionId && conn.extensionId && rec.extensionId !== conn.extensionId) { setTimeout(() => conn.close(4003, 'origin mismatch'), 50); return [this.messages.build(MessageType.SESSION_RESUME_RESPONSE, { payload: { accepted: false, code: ErrorCode.UNAUTHENTICATED, message: 'Extension identity changed. Pair again.' } })]; }
    this.security.clearFailures(conn.socket.remote);
    return this._establish(conn, { connectionId: rec.connectionId, projectId: rec.projectId, extensionId: rec.extensionId }, async (session) => {
      const resumable = await this.runner.resumableFor(session);
      return this.messages.build(MessageType.SESSION_RESUME_RESPONSE, { sessionId: session.sessionId, projectId: project.projectId, payload: { accepted: true, connectionId: rec.connectionId, sessionId: session.sessionId, projectId: project.projectId, resumable } });
    }, { resumed: true });
  }

  async _establish(conn, { connectionId, projectId, extensionId }, buildReply, { resumed = false } = {}) {
    // Only one active Chrome connection: a new authenticated socket replaces the old one.
    for (const other of this.connections.all()) if (other !== conn && other.state === State.CONNECTED) other.close(4005, 'replaced by a newer connection');
    const session = this.sessions.open({ connectionId, projectId, extensionId });
    this.sessions.attach(session.sessionId, conn.socket.id);
    conn.connectionId = connectionId;
    conn.session = session;
    conn.state = State.CONNECTED;
    conn.lastPong = Date.now();
    this._pinnedExtensionId = extensionId || this._pinnedExtensionId;
    const reply = await buildReply(session);
    const project = this.getProject();
    // Register the project with Chrome right after establishing the session.
    const register = createMessage(MessageType.PROJECT_REGISTER, { sessionId: session.sessionId, projectId, payload: { projectId, name: project.name, schemaVersion: '1.0', ...(this.services.projectSummary ? await this.services.projectSummary() : {}) } });
    logger.info('BRIDGE', resumed ? 'session resumed' : 'paired', { connectionId });
    // Replies are flushed by the caller first; then any interrupted analysis is re-offered to Chrome.
    if (resumed) setImmediate(() => this.runner.resumeAfterReconnect());
    this.emit('connected', { connectionId, sessionId: session.sessionId, resumed });
    this.emit('status', this.getStatus());
    return [reply, register];
  }

  setProvider(provider) {
    const c = this.connections.active();
    if (c && c.session) { c.session.provider = provider; this.emit('status', this.getStatus()); }
  }
}

module.exports = { ChromeBridge };
