// Drives an analysis over the bridge: request -> accepted -> batch -> ack -> AI response -> checkpoint -> next batch -> knowledge package.
// Chrome may pause/cancel/retry too; VS Code is the source of truth for progress and checkpoints.
const EventEmitter = require('events');
const { MessageType, ErrorCode } = require('./bridgeProtocol');
const { validateKnowledgePackage } = require('../knowledge/schemaValidator');
const logger = require('../utils/logger');

const Status = Object.freeze({ AWAITING_ACCEPT: 'AWAITING_ACCEPT', IN_PROGRESS: 'IN_PROGRESS', PAUSED: 'PAUSED', WAITING_PACKAGE: 'WAITING_PACKAGE', COMPLETED: 'COMPLETED', FAILED: 'FAILED', CANCELLED: 'CANCELLED', DISCONNECTED: 'DISCONNECTED' });
const LIVE = new Set([Status.AWAITING_ACCEPT, Status.IN_PROGRESS, Status.PAUSED, Status.WAITING_PACKAGE, Status.DISCONNECTED, Status.FAILED]);

class AnalysisRunner extends EventEmitter {
  constructor({ bridge, history }) {
    super();
    this.bridge = bridge;
    this.history = history;
    this.runs = new Map(); // analysisId -> run
  }

  register(router) {
    const M = MessageType;
    router.on(M.ANALYSIS_ACCEPTED, (m, c) => this._accepted(m, c));
    router.on(M.ANALYSIS_BATCH_ACK, (m, c) => this._batchAck(m, c));
    router.on(M.ANALYSIS_PROGRESS, (m, c) => this._progress(m, c));
    router.on(M.AI_RESPONSE, (m, c) => this._aiResponse(m, c));
    router.on(M.ANALYSIS_COMPLETE, (m, c) => this._complete(m, c));
    router.on(M.KNOWLEDGE_PACKAGE, (m, c) => this._package(m, c));
    router.on(M.KNOWLEDGE_MERGE_REQUEST, (m, c) => this._package({ ...m, payload: { package: m.payload.package || m.payload } }, c));
    router.on(M.PAUSE_REQUEST, (m, c) => this._peerControl('pause', m, c));
    router.on(M.RESUME_REQUEST, (m, c) => this._peerControl('resume', m, c));
    router.on(M.CANCEL_REQUEST, (m, c) => this._peerControl('cancel', m, c));
    router.on(M.RETRY_REQUEST, (m, c) => this._peerControl('retry', m, c));
  }

  // ---- public API ----

  // batches: from contextBuilder. Sends ANALYSIS_REQUEST; batches follow once Chrome accepts.
  async start({ analysisId, mode, purpose, intent = 'UNDERSTAND', batches, stats, provider, completedBatchIds = [], resume = false, campaign = null }) {
    if (this.runs.has(analysisId) && LIVE.has(this.runs.get(analysisId).status) && !resume) throw new Error(`${analysisId} is already running`);
    const done = new Set(completedBatchIds);
    const run = { analysisId, mode, purpose, intent, batches, stats, provider: provider || null, status: Status.AWAITING_ACCEPT, done, failed: new Set(), current: null, paused: false, partials: {}, startedAt: Date.now(), error: null, stage: 'Waiting for Chrome to accept', progress: null, campaign };
    this.runs.set(analysisId, run);
    await this.history.update(analysisId, { status: 'SENT', provider: run.provider, batches: batches.map((b) => ({ batchId: b.batchId, files: b.context.files.map((f) => ({ path: f.path, hash: f.hash })), estimatedTokens: b.estimatedTokens })) });
    this.bridge.send(MessageType.ANALYSIS_REQUEST, {
      analysisId, mode, purpose, intent, providerHint: run.provider, resume, ...(campaign ? { campaign } : {}),
      totalBatches: batches.length, completedBatchIds: [...done],
      estimatedTokens: batches.reduce((n, b) => n + b.estimatedTokens, 0),
      files: [...new Map(batches.flatMap((b) => b.context.files.map((f) => [f.path, { path: f.path, hash: f.hash }]))).values()],
      secretsRedacted: stats ? stats.secretsRedacted : 0,
      secrets: stats ? stats.secrets : [],
    });
    this._emit(run);
    return this.snapshot(run);
  }

  pause(analysisId) { const r = this._run(analysisId); r.paused = true; r.status = Status.PAUSED; r.stage = 'Paused'; this._safeSend(MessageType.PAUSE_REQUEST, { analysisId }); this._persist(r, 'PAUSED'); this._emit(r); }
  resume(analysisId) {
    const r = this._run(analysisId);
    r.failed.clear(); r.error = null; // failed batches go back in the queue: the run continues from the first batch that is not done
    r.paused = false; r.status = Status.IN_PROGRESS; r.stage = 'Resumed';
    this._safeSend(MessageType.RESUME_REQUEST, { analysisId });
    this._persist(r, 'IN_PROGRESS');
    if (!r.current) this._sendNext(r);
    this._emit(r);
  }
  cancel(analysisId) { const r = this._run(analysisId); r.status = Status.CANCELLED; r.stage = 'Cancelled'; this._safeSend(MessageType.CANCEL_REQUEST, { analysisId }); this._persist(r, 'CANCELLED'); this._emit(r); }
  retry(analysisId, batchId) {
    const r = this._run(analysisId);
    const id = batchId || (r.current && r.current.batchId) || [...r.failed][0];
    const b = r.batches.find((x) => x.batchId === id);
    if (!b) throw new Error(`No batch to retry in ${analysisId}`);
    r.failed.delete(id); r.done.delete(id); r.status = Status.IN_PROGRESS; r.error = null; r.paused = false;
    this._sendBatch(r, b);
    this._emit(r);
  }
  skip(analysisId, batchId) {
    const r = this._run(analysisId);
    const id = batchId || (r.current && r.current.batchId) || [...r.failed][0];
    if (!id) throw new Error('No batch to skip');
    r.failed.delete(id); r.done.add(id); r.current = null;
    if (r.status === Status.FAILED) r.status = Status.IN_PROGRESS;
    this._sendNext(r);
    this._emit(r);
  }

  summary() {
    const live = [...this.runs.values()].filter((r) => LIVE.has(r.status)).pop();
    return live ? this.snapshot(live) : null;
  }
  list() { return [...this.runs.values()].map((r) => this.snapshot(r)); }
  snapshot(r) {
    return { analysisId: r.analysisId, mode: r.mode, purpose: r.purpose, status: r.status, stage: r.stage, provider: r.provider, batchNumber: r.current ? r.current.batchNumber : Math.min(r.done.size + 1, r.batches.length), totalBatches: r.batches.length, completedBatches: [...r.done], failedBatches: [...r.failed], estimatedTokens: r.batches.reduce((n, b) => n + b.estimatedTokens, 0), filesTotal: new Set(r.batches.flatMap((b) => b.context.files.map((f) => f.path))).size, filesDone: new Set(r.batches.filter((b) => r.done.has(b.batchId)).flatMap((b) => b.context.files.map((f) => f.path))).size, error: r.error, progress: r.progress };
  }

  // ---- session recovery ----
  async resumableFor() {
    const out = [];
    for (const r of this.runs.values()) if ([Status.DISCONNECTED, Status.IN_PROGRESS, Status.AWAITING_ACCEPT, Status.PAUSED, Status.FAILED].includes(r.status)) out.push({ analysisId: r.analysisId, completedBatchIds: [...r.done], totalBatches: r.batches.length, status: r.status });
    if (this.history) for (const h of await this.history.resumable()) if (!out.some((o) => o.analysisId === h.analysisId)) out.push({ analysisId: h.analysisId, completedBatchIds: [...this.history.completedBatchIds(h)], totalBatches: h.batches.length, status: h.status, inMemory: false });
    return out;
  }

  // Continue every in-memory analysis that lost its Chrome connection.
  resumeAfterReconnect() {
    for (const r of this.runs.values()) {
      if (r.status !== Status.DISCONNECTED) continue;
      r.status = Status.AWAITING_ACCEPT;
      r.stage = 'Reconnected: waiting for Chrome to accept';
      r.current = null;
      this.bridge.send(MessageType.ANALYSIS_REQUEST, { analysisId: r.analysisId, mode: r.mode, purpose: r.purpose, intent: r.intent, providerHint: r.provider, resume: true, ...(r.campaign ? { campaign: r.campaign } : {}), totalBatches: r.batches.length, completedBatchIds: [...r.done], estimatedTokens: r.batches.reduce((n, b) => n + b.estimatedTokens, 0), files: [] });
      this._persist(r, 'SENT');
      this._emit(r);
    }
  }

  onDisconnected() {
    for (const r of this.runs.values()) if ([Status.AWAITING_ACCEPT, Status.IN_PROGRESS, Status.PAUSED, Status.WAITING_PACKAGE].includes(r.status)) {
      r.status = Status.DISCONNECTED; r.stage = 'Chrome disconnected: progress saved'; r.current = null;
      this._persist(r, 'DISCONNECTED');
      this._emit(r);
    }
  }
  onBridgeStopped() { this.onDisconnected(); }

  // ---- inbound handlers ----
  _find(m) { const id = m.payload.analysisId; const r = id && this.runs.get(id); return r || null; }
  _unknown(m, ctx) { return this.bridge.messages.error(ErrorCode.ANALYSIS_UNKNOWN, `Unknown analysisId ${String(m.payload.analysisId).slice(0, 40)}`, { sessionId: ctx.session.sessionId, projectId: ctx.projectId, inReplyTo: m.messageId }); }

  async _accepted(m, ctx) {
    const r = this._find(m);
    if (!r) return this._unknown(m, ctx);
    if (m.payload.provider) { r.provider = String(m.payload.provider).slice(0, 60); this.bridge.setProvider(r.provider); }
    if (m.payload.accepted === false) { r.status = Status.CANCELLED; r.stage = `Chrome declined: ${String(m.payload.reason || 'no reason given').slice(0, 200)}`; await this._persist(r, 'CANCELLED'); this._emit(r); return; }
    r.status = Status.IN_PROGRESS; r.stage = 'Sending batches';
    await this._persist(r, 'IN_PROGRESS');
    this._sendNext(r);
    this._emit(r);
  }

  async _batchAck(m, ctx) {
    const r = this._find(m);
    if (!r) return this._unknown(m, ctx);
    r.stage = `Batch ${m.payload.batchId} received by Chrome`;
    this._emit(r);
  }

  async _progress(m, ctx) {
    const r = this._find(m);
    if (!r) return this._unknown(m, ctx);
    r.stage = String(m.payload.stage || m.payload.message || r.stage).slice(0, 200);
    r.progress = typeof m.payload.percent === 'number' ? m.payload.percent : r.progress;
    if (m.payload.provider) r.provider = String(m.payload.provider).slice(0, 60);
    this._emit(r);
  }

  async _aiResponse(m, ctx) {
    const r = this._find(m);
    if (!r) return this._unknown(m, ctx);
    const { batchId, status } = m.payload;
    const batch = r.batches.find((b) => b.batchId === batchId);
    if (!batch) return this.bridge.messages.error(ErrorCode.SCHEMA_INVALID, `Unknown batch ${String(batchId).slice(0, 40)}`, { sessionId: ctx.session.sessionId, projectId: ctx.projectId, inReplyTo: m.messageId });
    if (status === 'COMPLETED') {
      r.done.add(batchId); r.failed.delete(batchId);
      if (r.status === Status.FAILED) { r.status = Status.IN_PROGRESS; r.error = null; } // a retried batch succeeded: carry on
      if (m.payload.knowledge && typeof m.payload.knowledge === 'object') r.partials[batchId] = m.payload.knowledge; // used for cross-batch context only; final truth comes via KNOWLEDGE_PACKAGE
      await this.history.checkpoint(r.analysisId, { batchId, status: 'completed', responseReceived: true, knowledgeMerged: false });
      r.current = null;
      r.stage = `Batch ${batch.batchNumber}/${r.batches.length} complete`;
      const ack = this.bridge.messages.build(MessageType.AI_RESPONSE_ACK, { sessionId: ctx.session.sessionId, projectId: ctx.projectId, payload: { analysisId: r.analysisId, batchId, checkpointed: true } });
      this._emit(r);
      // Next batch goes out after the ack so Chrome sees ack first.
      setImmediate(() => { if (!r.paused && r.status === Status.IN_PROGRESS) this._sendNext(r); });
      return ack;
    }
    r.failed.add(batchId);
    r.error = String(m.payload.error || 'AI response failed').slice(0, 500);
    r.stage = `Batch ${batch.batchNumber} failed: ${r.error}`;
    r.current = null;
    r.status = Status.FAILED; // stops here; Resume or Retry restarts from this batch
    await this.history.checkpoint(r.analysisId, { batchId, status: 'failed', responseReceived: false, knowledgeMerged: false });
    await this._persist(r, 'FAILED');
    this._emit(r);
    return this.bridge.messages.build(MessageType.AI_RESPONSE_ACK, { sessionId: ctx.session.sessionId, projectId: ctx.projectId, payload: { analysisId: r.analysisId, batchId, checkpointed: false, failed: true } });
  }

  async _complete(m, ctx) {
    const r = this._find(m);
    if (!r) return this._unknown(m, ctx);
    r.status = Status.WAITING_PACKAGE; r.stage = 'Waiting for knowledge package';
    this._emit(r);
  }

  async _package(m, ctx) {
    const pkg = m.payload.package || m.payload;
    const M = MessageType;
    const base = { sessionId: ctx.session.sessionId, projectId: ctx.projectId };
    const reject = (code, errors) => [this.bridge.messages.build(M.KNOWLEDGE_PACKAGE_ACK, { ...base, payload: { analysisId: pkg && pkg.analysisId, accepted: false, code, errors } })];
    const v = validateKnowledgePackage(pkg);
    if (!v.valid) return reject(ErrorCode.SCHEMA_INVALID, v.errors);
    if (pkg.projectId !== ctx.projectId) return reject(ErrorCode.PROJECT_MISMATCH, ['projectId does not match the open project']);
    const r = this.runs.get(pkg.analysisId);
    const rec = r ? null : await this.history.get(pkg.analysisId);
    if (!r && !rec) return reject(ErrorCode.ANALYSIS_UNKNOWN, [`analysisId ${pkg.analysisId} was not issued by this project`]);
    if (r && [Status.CANCELLED].includes(r.status)) return reject(ErrorCode.ANALYSIS_UNKNOWN, ['analysis was cancelled']);
    if (!this.bridge.services.onKnowledgePackage) return reject(ErrorCode.INTERNAL, ['knowledge processing is not available']);

    let result;
    try { result = await this.bridge.services.onKnowledgePackage(pkg, { provider: pkg.source.provider, run: r }); } catch (err) { logger.error('KNOWLEDGE', 'package processing failed', { error: err.message }); return reject(ErrorCode.INTERNAL, [err.message]); }
    if (r) { r.status = Status.COMPLETED; r.stage = 'Knowledge reconciled'; r.progress = 100; await this._persist(r, 'COMPLETED'); this._emit(r); }
    return [
      this.bridge.messages.build(M.KNOWLEDGE_PACKAGE_ACK, { ...base, payload: { analysisId: pkg.analysisId, accepted: true, counts: result.report.counts, stale: result.report.stale, rejected: result.report.rejected } }),
      this.bridge.messages.build(M.KNOWLEDGE_MERGE_RESULT, { ...base, payload: { analysisId: pkg.analysisId, changes: result.changes, conflicts: result.report.conflicts, unverified: result.report.unverified, coverage: result.coverage } }),
    ];
  }

  async _peerControl(kind, m, ctx) {
    const r = this._find(m);
    if (!r) return this._unknown(m, ctx);
    // Chrome-initiated control: apply locally without echoing it back.
    if (kind === 'pause') { r.paused = true; r.status = Status.PAUSED; r.stage = 'Paused from Chrome'; await this._persist(r, 'PAUSED'); }
    if (kind === 'resume') { r.failed.clear(); r.error = null; r.paused = false; r.status = Status.IN_PROGRESS; r.stage = 'Resumed from Chrome'; await this._persist(r, 'IN_PROGRESS'); if (!r.current) this._sendNext(r); }
    if (kind === 'cancel') { r.status = Status.CANCELLED; r.stage = 'Cancelled from Chrome'; await this._persist(r, 'CANCELLED'); }
    if (kind === 'retry' && m.payload.skip) { r.failed.delete(m.payload.batchId); r.done.add(m.payload.batchId); r.current = null; if (r.status === Status.FAILED) r.status = Status.IN_PROGRESS; await this.history.checkpoint(r.analysisId, { batchId: m.payload.batchId, status: 'skipped', responseReceived: false, knowledgeMerged: false }); this._emit(r); this._sendNext(r); return; }
    if (kind === 'retry') { const id = m.payload.batchId; const b = r.batches.find((x) => x.batchId === id); if (b) { r.failed.delete(id); r.done.delete(id); r.status = Status.IN_PROGRESS; this._sendBatch(r, b); } }
    this._emit(r);
  }

  // ---- internals ----
  _sendNext(r) {
    if (r.paused || r.status === Status.CANCELLED) return;
    const next = r.batches.find((b) => !r.done.has(b.batchId) && !r.failed.has(b.batchId));
    if (!next) {
      if (r.failed.size === 0) { r.status = Status.WAITING_PACKAGE; r.stage = 'All batches complete: waiting for knowledge package'; }
      else { r.status = Status.FAILED; r.stage = 'Some batches failed'; this._persist(r, 'FAILED'); }
      this._emit(r);
      return;
    }
    this._sendBatch(r, next);
  }

  _sendBatch(r, batch) {
    r.current = batch;
    r.stage = `Sent batch ${batch.batchNumber}/${r.batches.length}`;
    try { this.bridge.send(MessageType.ANALYSIS_BATCH, { ...batch, crossBatchFindings: this._priorFindings(r, batch) }); } catch (err) { this.onDisconnected(); return; }
    this._emit(r);
  }

  // Partial knowledge from earlier batches, summarized as structured context for later ones.
  _priorFindings(r, batch) {
    return batch.batchNumber > 1 ? r.batches.filter((b) => b.batchNumber < batch.batchNumber && r.partials[b.batchId]).map((b) => ({ batchId: b.batchId, knowledge: r.partials[b.batchId] })) : [];
  }

  _run(id) { const r = this.runs.get(id); if (!r) throw new Error(`Unknown analysis ${id}`); return r; }
  _safeSend(type, payload) { try { this.bridge.send(type, payload); } catch { /* not connected: state is still recorded locally */ } }
  async _persist(r, status) { try { await this.history.update(r.analysisId, { status }); } catch (e) { logger.warn('ANALYSIS', 'history update failed', { error: e.message }); } }
  _emit(r) { this.emit('updated', this.snapshot(r)); this.bridge.emit('analysis', this.snapshot(r)); this.bridge.emit('status', this.bridge.getStatus()); }
}

module.exports = { AnalysisRunner, Status };
