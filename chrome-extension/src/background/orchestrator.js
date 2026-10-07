// Runs analyses and jobs: VS Code batch -> specialized prompt -> AI website -> validated knowledge -> checkpoint -> VS Code.
// Dependencies are injected so the whole flow is testable without a browser:
//   bridge: VsCodeBridge   ai: { run(prompt, { onProgress }) -> result, cancel(), provider() }
import { T } from '../bridge/bridgeProtocol.js';
import { knowledgeStore } from '../knowledge/knowledgeStore.js';
import { mergeKnowledge } from '../knowledge/knowledgeMerger.js';
import { sanitizeKnowledge } from '../knowledge/sanitizer.js';
import { validateOutboundPackage } from '../knowledge/schemaValidator.js';
import { buildBatchPrompt, batchPromptBlocks, buildCorrectionPrompt } from '../ai/promptBuilder.js';
import { planParts, isSendFailure, blocksFromText, MIN_PART_CHARS } from '../ai/multipart.js';
const SMALL_MESSAGE = 4000;
import { buildCrossBatch } from '../batching/contextManager.js';
import { applyLimits, splitBatch } from '../batching/batchManager.js';
import { parseAiResponse, parseAnyJson } from '../ai/responseParser.js';
import { buildDocumentationPrompt, validateDocumentationResponse } from '../documentation/documentationManager.js';
import { comparisonPrompt, validateComparison, FOCUS } from '../comparison/projectComparator.js';
import { blueprintPrompt, validateBlueprint } from '../comparison/blueprintBuilder.js';
import { redactText } from '../utils/secrets.js';
import { estimateTokens } from '../utils/text.js';
import { getSettings } from '../utils/settings.js';
import { storage, update } from '../utils/storage.js';
import { log } from '../utils/logger.js';
import { randomId } from '../utils/ids.js';

const LIVE = new Set(['AWAITING_USER', 'RUNNING', 'PAUSED', 'NEEDS_ATTENTION', 'AWAITING_ACK']);

// Analyses are stored under "<projectId>~<analysisId>": two projects both have an "analysis-001".
export const keyOf = (projectId, analysisId) => `${projectId}~${analysisId}`;
export const aidOf = (key) => key.slice(key.indexOf('~') + 1);
export const pidOf = (key) => key.slice(0, key.indexOf('~'));

export class Orchestrator {
  constructor({ bridge, ai, onChange }) {
    this.bridge = bridge;
    this.ai = ai;
    this.onChange = onChange || (() => {});
    this.chains = new Map(); // analysisId -> promise chain (batches run one at a time)
    this.paused = new Set();
    this.cancelled = new Set();
    this.suspended = new Set(); // runs paused because the user connected to another project
    this.inFlight = new Set(); // `${analysisId}/${batchId}` currently queued or being answered: never run the same batch twice
    this.batchStore = new Map(); // `${analysisId}/${batchId}` -> raw batch payload (in memory + persisted for retry)
    this.register();
  }

  register() {
    const b = this.bridge;
    b.on(T.PROJECT_REGISTER, async (m) => { await knowledgeStore.registerProject(m.payload); b.sendNow(T.PROJECT_REGISTER_RESPONSE, { accepted: true, projectId: m.payload.projectId }, { inReplyTo: m.messageId }); this.changed(); });
    b.on(T.ANALYSIS_REQUEST, (m) => this.onAnalysisRequest(m.payload));
    b.on(T.ANALYSIS_BATCH, (m) => this.onBatch(m.payload));
    b.on(T.AI_RESPONSE_ACK, (m) => this.onAck(m.payload));
    b.on(T.KNOWLEDGE_PACKAGE_ACK, (m) => this.onPackageAck(m.payload));
    b.on(T.KNOWLEDGE_MERGE_RESULT, (m) => this.onMergeResult(m.payload));
    b.on(T.PAUSE_REQUEST, (m) => this.control('pause', this.key(m.payload.analysisId)));
    b.on(T.RESUME_REQUEST, (m) => this.control('resume', this.key(m.payload.analysisId)));
    b.on(T.CANCEL_REQUEST, (m) => this.control('stop', this.key(m.payload.analysisId)));
    b.on(T.RETRY_REQUEST, (m) => this.retryBatch(this.key(m.payload.analysisId), m.payload.batchId));
    b.on(T.DOCUMENTATION_REQUEST, (m) => this.queueJob('documentation', m.payload));
    b.on(T.COMPARISON_REQUEST, (m) => this.queueJob('comparison', m.payload));
    b.on(T.BLUEPRINT_REQUEST, (m) => this.queueJob('blueprint', m.payload));
    b.on(T.ERROR, (m) => this.notice('error', m.payload.code, m.payload.message));
    b.on(T.WARNING, (m) => this.notice('info', m.payload.code, m.payload.message));
    b.on('resumed', (p) => this.onResumed(p));
    b.on('switched', (p) => this.onSwitched(p));
    b.on('closed', () => this.onDisconnected());
  }

  changed() { this.onChange(); }
  curProject() { return this.bridge.session ? this.bridge.session.projectId : null; }
  key(analysisId) { return keyOf(this.curProject(), analysisId); }
  // Every outbound message about a run is addressed to that run's project, never to whichever session is current.
  out(key, type, payload) { return this.bridge.send(type, { analysisId: aidOf(key), ...payload }, { projectId: pidOf(key) }); }
  inSession(key) { return this.curProject() === pidOf(key); }
  async setStatus(patch) { await update('status', (s) => ({ ...s, ...patch }), {}); this.changed(); }
  async notice(level, code, message) { await update('notices', (n) => [...n, { at: new Date().toISOString(), level, code, message }].slice(-30), []); await log(level === 'error' ? 'error' : 'info', 'VSCODE', `${code}: ${message}`); this.changed(); }

  // ---------- analyses ----------
  // `key` = "<projectId>~<analysisId>". UI commands pass keys; VS Code messages carry plain analysisIds for the current session's project.

  async onAnalysisRequest(p) {
    const pid = this.curProject();
    const key = keyOf(pid, p.analysisId);
    const existing = await knowledgeStore.getAnalysis(key);
    const resumed = !!p.resume && existing && ['RUNNING', 'PAUSED', 'NEEDS_ATTENTION', 'AWAITING_ACK', 'DISCONNECTED'].includes(existing.status);
    const record = {
      key, analysisId: p.analysisId, projectId: pid, mode: p.mode, purpose: p.purpose || null, intent: p.intent || 'UNDERSTAND',
      totalBatches: p.totalBatches, estimatedTokens: p.estimatedTokens, files: p.files || [], secretsRedacted: p.secretsRedacted || 0, secrets: p.secrets || [],
      campaign: p.campaign ? { id: String(p.campaign.id).slice(0, 80), run: Number(p.campaign.run) || 1, estimatedRuns: Number(p.campaign.estimatedRuns) || 1, filesInRun: Number(p.campaign.filesInRun) || 0, filesDone: Number(p.campaign.filesDone) || 0, filesTotal: Number(p.campaign.filesTotal) || 0 } : null,
      providerHint: p.providerHint, createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      status: resumed ? 'RUNNING' : 'AWAITING_USER', batches: (existing && existing.batches) || {}, attention: null,
    };
    await knowledgeStore.saveAnalysis(key, record);
    this.cancelled.delete(key); this.paused.delete(key); this.suspended.delete(key);
    if (resumed) {
      // The user already approved this analysis. Replay batches we completed that VS Code doesn't know about, then accept.
      const vsDone = new Set(p.completedBatchIds || []);
      for (const b of Object.values(record.batches)) {
        if (b.status === 'completed' && b.knowledge && !vsDone.has(b.batchId)) await this.out(key, T.AI_RESPONSE, { batchId: b.batchId, status: 'COMPLETED', knowledge: b.knowledge, provider: b.provider, model: b.model });
      }
      await this.out(key, T.ANALYSIS_ACCEPTED, { accepted: true, provider: await this.currentProviderName(), resumed: true });
      await log('info', 'ANALYSIS', `resumed ${p.analysisId}`);
      // Everything finished while this project was not connected: nothing more will arrive, so send the package now.
      const nDone = Object.values(record.batches).filter((b) => b.status === 'completed').length;
      if (record.totalBatches && nDone >= record.totalBatches) await this.finalize(key);
    } else {
      // A later run of an analysis the user already approved (in its first run) and has not stopped starts by itself.
      const c = p.campaign ? ((await storage.get('campaigns', {}))[String(p.campaign.id).slice(0, 80)] || null) : null;
      if (p.campaign && p.campaign.autoAccept && c && c.approved && !c.stopped && c.projectId === pid) {
        await this.notice('info', 'CAMPAIGN', `Run ${p.campaign.run} of about ${p.campaign.estimatedRuns}: continuing automatically (${p.files ? p.files.length : '?'} files). You approved this analysis in its first run; Stop ends it.`);
        await this.confirmAnalysis(key);
      } else {
        await this.notice('info', 'ANALYSIS_REQUEST', `${p.analysisId}: VS Code wants to send ${p.files ? p.files.length : '?'} file(s) to your AI provider.${p.campaign ? ` This is run ${p.campaign.run} of about ${p.campaign.estimatedRuns} of an automatic analysis: if you confirm, the next runs start by themselves until everything is analyzed.` : ''} Review and confirm in the panel.`);
      }
    }
    this.changed();
  }

  async currentProviderName() { const s = await getSettings(); const t = this.ai.provider ? await this.ai.provider() : null; return t || s.provider; }

  // User clicked "Start" after seeing the privacy summary.
  async confirmAnalysis(key) {
    const a = await knowledgeStore.getAnalysis(key);
    if (!a || a.status !== 'AWAITING_USER') throw new Error('This analysis is not waiting for confirmation.');
    if (!this.inSession(key)) throw new Error('This analysis belongs to another project. Connect to that project in VS Code first.');
    await knowledgeStore.saveAnalysis(key, { status: 'RUNNING', confirmedAt: new Date().toISOString() });
    if (a.campaign) await update('campaigns', (all) => ({ ...all, [a.campaign.id]: { approved: true, stopped: false, projectId: a.projectId, approvedAt: new Date().toISOString() } }), {}); // the user's OK covers the following runs of this analysis
    await this.out(key, T.ANALYSIS_ACCEPTED, { accepted: true, provider: await this.currentProviderName() });
    this.changed();
  }

  async declineAnalysis(key, reason = 'Declined by user') {
    await knowledgeStore.saveAnalysis(key, { status: 'CANCELLED', attention: null });
    await this.out(key, T.ANALYSIS_ACCEPTED, { accepted: false, reason });
    this.changed();
  }

  async onBatch(batch) {
    const key = this.key(batch.analysisId);
    const a = await knowledgeStore.getAnalysis(key);
    if (!a || this.cancelled.has(key) || a.status === 'CANCELLED') return;
    await this.out(key, T.ANALYSIS_BATCH_ACK, { batchId: batch.batchId, received: true });
    const done = a.batches && a.batches[batch.batchId];
    if (done && done.status === 'completed' && done.knowledge) { // never redo a completed batch
      await log('info', 'ANALYSIS', `${batch.batchId} already completed: re-sending stored result`);
      await this.out(key, T.AI_RESPONSE, { batchId: batch.batchId, status: 'COMPLETED', knowledge: done.knowledge, provider: done.provider, model: done.model });
      return;
    }
    const bkey = `${key}/${batch.batchId}`;
    if (this.inFlight.has(bkey)) { await log('info', 'ANALYSIS', `${batch.batchId} is already being processed; duplicate delivery ignored`); return; }
    await update('batchPayloads', (all) => ({ ...all, [bkey]: batch }), {});
    this.batchStore.set(bkey, batch);
    await knowledgeStore.checkpoint(key, batch.batchId, { status: 'received', batchNumber: batch.batchNumber, files: batch.context.files.length });
    this.startBatch(key, batch);
    this.changed();
  }

  startBatch(key, batch) {
    const bkey = `${key}/${batch.batchId}`;
    if (this.inFlight.has(bkey)) return;
    this.inFlight.add(bkey);
    this.enqueue(key, () => this.runBatch(key, batch)).finally(() => this.inFlight.delete(bkey));
  }

  enqueue(key, fn) {
    const prev = this.chains.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn).catch((e) => log('error', 'ANALYSIS', `batch failed unexpectedly: ${e.message}`));
    this.chains.set(key, next);
    return next;
  }

  async waitWhilePaused(key) {
    while (this.paused.has(key) && !this.cancelled.has(key) && !this.suspended.has(key)) await new Promise((r) => setTimeout(r, 300));
  }

  async runBatch(key, batch) {
    await this.waitWhilePaused(key);
    if (this.cancelled.has(key) || this.suspended.has(key)) return;
    const settings = await getSettings();
    const aid = aidOf(key);
    await knowledgeStore.saveAnalysis(key, { status: 'RUNNING', attention: null });
    await this.setStatus({ current: { key, analysisId: aid, batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches, stage: 'PREPARING' } });
    const { batch: limited, warnings } = applyLimits(batch, settings);
    const res = await this.processWithSplitting(key, limited, settings, 0);
    if (this.cancelled.has(key)) return;
    if (this.suspended.has(key) && !res.ok) { await knowledgeStore.checkpoint(key, batch.batchId, { status: 'received', batchNumber: batch.batchNumber }); return; } // interrupted by a project switch: VS Code re-sends it on resume
    if (!res.ok) return this.failBatch(key, batch, res);
    const knowledge = res.knowledge;
    knowledge.unknowns = [...(knowledge.unknowns || []), ...warnings.map((w) => `NOTE: ${w}`)];
    await knowledgeStore.checkpoint(key, batch.batchId, { status: 'completed', batchNumber: batch.batchNumber, knowledge, provider: res.provider, model: res.model, redactions: res.redactions, warnings });
    await this.out(key, T.AI_RESPONSE, { batchId: batch.batchId, status: 'COMPLETED', knowledge, provider: res.provider, model: res.model }); // queued if this project is not the connected one
    await this.setStatus({ current: { key, analysisId: aid, batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches, stage: 'CHECKPOINTED' } });
    const a = await knowledgeStore.getAnalysis(key);
    const completed = Object.values(a.batches).filter((b) => b.status === 'completed').length;
    if (!this.suspended.has(key) && (batch.batchNumber >= batch.totalBatches || completed >= batch.totalBatches)) await this.finalize(key);
    this.changed();
  }

  // One AI round trip for a (possibly split) batch. Returns { ok, knowledge, provider, model } or { ok:false, code, message }.
  async processWithSplitting(key, batch, settings, depth) {
    const own = await knowledgeStore.batchKnowledge(key);
    const crossBatch = buildCrossBatch(batch, own);
    let prompt = buildBatchPrompt(batch, crossBatch);
    const red = redactText(prompt); // final safety net; VS Code already redacted
    prompt = red.text;
    if (red.findings.length) await this.notice('info', 'SECRETS', `${red.findings.length} possible secret(s) were removed from the prompt before sending (${[...new Set(red.findings.map((f) => f.type))].join(', ')}).`);
    if (estimateTokens(prompt) > settings.maxTokensPerRequest) {
      const parts = depth < 3 ? splitBatch(batch) : null;
      if (parts) return this.runParts(key, parts, settings, depth);
      return { ok: false, code: 'CONTEXT_TOO_LARGE', message: `The prompt (~${estimateTokens(prompt)} tokens) exceeds your limit of ${settings.maxTokensPerRequest} and cannot be split further.` };
    }
    // A prompt over the per-message limit goes out in parts from the start; one the chat box refuses is retried in smaller parts.
    const blocks = batchPromptBlocks(batch, crossBatch).map((b) => ({ ...b, text: redactText(b.text).text }));
    let first;
    if (prompt.length > settings.maxCharsPerMessage) {
      await this.notice('info', 'PARTS', `${batch.batchId}: ${Math.round(prompt.length / 1000)}k characters is too large for one chat message; sending it in parts, file by file.`);
      first = await this.sendInParts(key, batch, blocks, settings, settings.maxCharsPerMessage);
    } else {
      first = await this.askAi(key, batch, prompt, settings);
      if (isSendFailure(first) && prompt.length >= MIN_PART_CHARS * 1.5) {
        await this.notice('info', 'PARTS', `${batch.batchId}: the chat box would not accept a ${Math.round(prompt.length / 1000)}k character message. Splitting it into parts and retrying; the AI is told that more files follow.`);
        first = await this.sendInParts(key, batch, blocks, settings, Math.floor(prompt.length / 2));
      }
    }
    if (!first.ok) {
      if ((first.code === 'CONTEXT_TOO_LARGE' || first.code === 'TRUNCATED') && depth < 3) { const parts = splitBatch(batch); if (parts) { await this.notice('info', 'SPLIT', `${batch.batchId}: reducing the batch and retrying.`); return this.runParts(key, parts, settings, depth); } }
      return first;
    }
    let parsed = parseAiResponse(first);
    let last = first;
    if (!parsed.ok) {
      await this.setStatus({ current: { ...(await this.current()), stage: 'REQUESTING_CORRECTION' } });
      const second = await this.askAi(key, batch, buildCorrectionPrompt(parsed.errors, parsed.truncated), settings);
      if (!second.ok) return second;
      parsed = parseAiResponse(second); last = second;
      if (!parsed.ok) {
        if (parsed.truncated && depth < 3) { const parts = splitBatch(batch); if (parts) return this.runParts(key, parts, settings, depth); }
        return { ok: false, code: 'INVALID_JSON', message: `The AI's answer could not be validated even after a correction request: ${parsed.errors.slice(0, 3).join('; ')}` };
      }
    }
    const { knowledge, notes } = sanitizeKnowledge(parsed.knowledge, batch.context.files);
    return { ok: true, knowledge, provider: last.provider, model: last.model || null, redactions: red.findings.length, notes };
  }

  async runParts(key, parts, settings, depth) {
    const results = [];
    for (const p of parts) {
      const r = await this.processWithSplitting(key, p, settings, depth + 1);
      if (!r.ok) return r;
      results.push(r);
    }
    const merged = mergeKnowledge(results.map((r) => r.knowledge));
    const flat = { ...merged.knowledge, evidence: merged.evidence, unknowns: merged.unknowns, ...(merged.changeProposals[0] ? { changeProposal: merged.changeProposals[0] } : {}) };
    return { ok: true, knowledge: flat, provider: results[0].provider, model: results[0].model, redactions: results.reduce((n, r) => n + r.redactions, 0) };
  }

  // Sends the prompt as part 1..N messages in the same chat; only the final part asks for the answer, whose reply is returned.
  // If the chat box refuses a part, everything restarts with parts half the size (the AI is told to ignore the earlier ones).
  async partsLoop(blocks, startMax, sendOne, { what = 'request' } = {}) {
    let max = startMax;
    let last = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const parts = planParts(blocks, max, { restart: attempt > 0, what });
      let failed = null;
      for (const part of parts) {
        const res = await sendOne(part.text, part);
        if (!res.ok) { failed = res; break; }
        if (part.index === part.total) return res;
      }
      if (!failed) return { ok: false, code: 'PARTS_FAILED', message: 'No part was sent.' };
      if (!isSendFailure(failed)) return failed;
      last = { failed, max };
      if (max <= SMALL_MESSAGE || max <= MIN_PART_CHARS) break; // refused even a small message: the size is not the cause
      max = Math.max(MIN_PART_CHARS, Math.floor(max / 2));
      await this.notice('info', 'PARTS', `A part was refused by the chat box. Retrying with smaller parts (${Math.round(max / 100) / 10}k characters).`);
    }
    const n = last ? last.max : startMax;
    return { ok: false, code: 'UI_CHANGED', message: `The chat box refused even a ${n.toLocaleString('en-US')}-character message, so the size is not the problem. ${last ? last.failed.message : ''} Check the AI tab: you are logged in, no dialog, banner or "usage limit" notice is open, the previous reply has finished and the message box is visible. If all of that looks normal the website layout probably changed: Settings → "Send a test message" shows what the extension sees.` };
  }

  async sendInParts(key, batch, blocks, settings, startMax) {
    return this.partsLoop(blocks, startMax, (text, part) => this.askAi(key, batch, text, settings, { stage: part.total > 1 ? `SENDING_PART_${part.index}_OF_${part.total}` : null }), { what: 'analysis request' });
  }

  async askAi(key, batch, prompt, settings, extra = {}) {
    const cur = { key, analysisId: aidOf(key), batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches };
    await this.setStatus({ current: { ...cur, stage: extra.stage || 'WAITING_AI' } });
    const res = await this.ai.run(prompt, {
      timeoutMs: settings.responseTimeoutSec * 1000, stableMs: settings.stableSec * 1000,
      onProgress: (p) => { if (this.inSession(key)) this.bridge.sendNow(T.ANALYSIS_PROGRESS, { analysisId: aidOf(key), batchId: batch.batchId, stage: extra.stage || p.stage || 'RECEIVING', provider: this.lastProvider }); this.setStatus({ current: { ...cur, stage: extra.stage || p.stage || 'RECEIVING', chars: p.chars } }); },
    });
    if (res.provider) this.lastProvider = res.provider;
    return res;
  }

  async current() { return ((await storage.get('status', {})).current) || {}; }

  async failBatch(key, batch, res) {
    await log('error', 'ANALYSIS', `${batch.batchId} failed: ${res.code} ${res.message}`);
    await knowledgeStore.checkpoint(key, batch.batchId, { status: 'failed', batchNumber: batch.batchNumber, error: res.message, code: res.code });
    await knowledgeStore.saveAnalysis(key, { status: 'NEEDS_ATTENTION', attention: { batchId: batch.batchId, code: res.code, message: res.message } });
    await this.out(key, T.AI_RESPONSE, { batchId: batch.batchId, status: 'FAILED', error: res.message, code: res.code, provider: this.lastProvider });
    await this.setStatus({ current: { key, analysisId: aidOf(key), batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches, stage: 'FAILED' } });
  }

  // Builds the final package from all completed batches and sends it to VS Code.
  async finalize(key) {
    const a = await knowledgeStore.getAnalysis(key);
    const done = Object.values(a.batches).filter((b) => b.status === 'completed').sort((x, y) => x.batchNumber - y.batchNumber);
    if (!done.length) throw new Error('No completed batches to finalize.');
    const merged = mergeKnowledge(done.map((b) => b.knowledge));
    const incomplete = a.totalBatches - done.length;
    const unknowns = [...merged.unknowns];
    if (incomplete > 0) unknowns.push(`${incomplete} of ${a.totalBatches} batches were not completed (failed or skipped); the knowledge is partial.`);
    const provider = done[done.length - 1].provider || this.lastProvider || 'unknown';
    const pkg = { packageType: 'KNOWLEDGE_PACKAGE', schemaVersion: '1.0', projectId: a.projectId, analysisId: a.analysisId, source: { provider, model: done[done.length - 1].model || 'unknown' }, knowledge: merged.knowledge, evidence: merged.evidence, unknowns };
    const v = validateOutboundPackage(pkg);
    if (!v.valid) { await this.notice('error', 'PACKAGE_INVALID', `Refusing to send malformed knowledge to VS Code: ${v.errors.slice(0, 3).join('; ')}`); await knowledgeStore.saveAnalysis(key, { status: 'NEEDS_ATTENTION', attention: { code: 'PACKAGE_INVALID', message: v.errors.join('; ') } }); return; }
    await this.out(key, T.ANALYSIS_COMPLETE, { status: incomplete ? 'PARTIAL' : 'COMPLETED', batchesCompleted: done.length, totalBatches: a.totalBatches });
    await this.out(key, T.KNOWLEDGE_PACKAGE, { package: pkg });
    for (const cp of merged.changeProposals) await this.out(key, T.CHANGE_PROPOSAL, { ...cp });
    await knowledgeStore.saveAnalysis(key, { status: 'AWAITING_ACK', sentPackageAt: new Date().toISOString(), packageSummary: { files: pkg.knowledge.files.length, workflows: pkg.knowledge.workflows.length, entities: pkg.knowledge.database ? pkg.knowledge.database.entities.length : 0, unknowns: unknowns.length } });
    await this.setStatus({ current: { key, analysisId: a.analysisId, stage: 'PACKAGE_SENT' } });
    this.changed();
  }

  async onAck(p) { await log('info', 'ANALYSIS', `VS Code checkpointed ${p.batchId}${p.failed ? ' (failure recorded)' : ''}`); }

  async onPackageAck(p) {
    if (!p.analysisId) return;
    const key = this.key(p.analysisId);
    if (p.accepted) await knowledgeStore.saveAnalysis(key, { status: 'COMPLETED', ack: { counts: p.counts, stale: p.stale, rejected: p.rejected } });
    else await knowledgeStore.saveAnalysis(key, { status: 'NEEDS_ATTENTION', attention: { code: p.code || 'PACKAGE_REJECTED', message: `VS Code rejected the package: ${(p.errors || []).slice(0, 3).join('; ')}` } });
    this.changed();
  }

  async onMergeResult(p) { await knowledgeStore.saveAnalysis(this.key(p.analysisId), { mergeResult: { changes: p.changes, conflicts: p.conflicts, unverified: p.unverified, coverage: p.coverage } }); this.changed(); }

  // ---------- controls (from the panel or VS Code) ----------

  async control(kind, key) {
    if (kind === 'pause') { this.paused.add(key); await knowledgeStore.saveAnalysis(key, { status: 'PAUSED' }); }
    if (kind === 'resume') {
      this.paused.delete(key); this.suspended.delete(key);
      const a = await knowledgeStore.getAnalysis(key);
      const failed = a && a.batches ? Object.values(a.batches).filter((b) => b.status === 'failed').sort((x, y) => x.batchNumber - y.batchNumber) : [];
      await knowledgeStore.saveAnalysis(key, { status: 'RUNNING', attention: null });
      if (failed.length) await this.retryBatch(key, failed[0].batchId || failed[0].id).catch((e) => log('warn', 'ANALYSIS', `resume could not restart the failed batch: ${e.message}`)); // continue from the batch that failed, not the next one
    }
    if (kind === 'stop') {
      const cur = await knowledgeStore.getAnalysis(key);
      if (cur && cur.campaign) await update('campaigns', (all) => ({ ...all, [cur.campaign.id]: { ...(all[cur.campaign.id] || {}), stopped: true } }), {}); // stopping a run stops the automatic continuation too
      this.cancelled.add(key); this.paused.delete(key); if (this.ai.cancel) this.ai.cancel(); await knowledgeStore.saveAnalysis(key, { status: 'CANCELLED' });
    }
    this.changed();
  }

  // Panel actions echo to VS Code (when it is the connected project) so both sides agree.
  async panelControl(kind, key) {
    await this.control(kind, key);
    const t = { pause: T.PAUSE_REQUEST, resume: T.RESUME_REQUEST, stop: T.CANCEL_REQUEST }[kind];
    if (t && this.inSession(key)) await this.out(key, t, {});
  }

  async retryBatch(key, batchId) {
    const bkey = `${key}/${batchId}`;
    const batch = this.batchStore.get(bkey) || (await storage.get('batchPayloads', {}))[bkey];
    if (!batch) throw new Error(`Batch ${batchId} is no longer stored; ask VS Code to retry it.`);
    this.cancelled.delete(key); this.suspended.delete(key);
    await knowledgeStore.checkpoint(key, batchId, { status: 'received' });
    this.startBatch(key, batch);
  }

  async skipBatch(key, batchId) {
    await knowledgeStore.checkpoint(key, batchId, { status: 'skipped' });
    await knowledgeStore.saveAnalysis(key, { status: 'RUNNING', attention: null });
    await this.out(key, T.RETRY_REQUEST, { batchId, skip: true });
    this.changed();
  }

  async onResumed(payload) {
    await log('info', 'BRIDGE', `VS Code lists ${payload.resumable ? payload.resumable.length : 0} resumable analysis(es)`);
    this.changed();
  }

  async onDisconnected() {
    const all = await knowledgeStore.getAnalyses();
    for (const a of Object.values(all)) if (['RUNNING', 'AWAITING_ACK'].includes(a.status)) await knowledgeStore.saveAnalysis(a.key || keyOf(a.projectId, a.analysisId), { status: a.status, disconnected: true });
    this.changed();
  }

  // The user paired with a different project. Work for the old project is suspended (not lost) and resumes when that project reconnects.
  async onSwitched({ from, to }) {
    const all = await knowledgeStore.getAnalyses();
    let n = 0;
    for (const a of Object.values(all)) {
      if (a.projectId !== from || !['RUNNING', 'AWAITING_USER', 'NEEDS_ATTENTION', 'PAUSED', 'AWAITING_ACK'].includes(a.status)) continue;
      const key = a.key || keyOf(a.projectId, a.analysisId);
      this.suspended.add(key);
      if (a.status !== 'AWAITING_ACK' && a.status !== 'AWAITING_USER') await knowledgeStore.saveAnalysis(key, { status: 'PAUSED', attention: { code: 'SWITCHED', message: 'Paused because you connected to another project. Open this project in VS Code, connect Chrome to it, and run "AI Project: Resume Analysis". Nothing is lost.' } });
      n++;
    }
    if (n && this.ai.cancel) this.ai.cancel(); // stop waiting on an answer that belongs to the old project
    await this.notice('info', 'PROJECT_SWITCHED', `Connected to a different project. ${n} unfinished analysis(es) of the previous project were paused and keep their progress.`);
    this.changed();
  }

  // ---------- documentation / comparison / blueprint jobs ----------

  async queueJob(kind, payload) {
    const job = { id: randomId('job'), kind, payload, projectId: this.curProject(), status: 'AWAITING_USER', createdAt: new Date().toISOString(), projects: (payload.projects || []).map((p) => (p.project ? p.project.name : p.name)).filter(Boolean) };
    await update('jobs', (jobs) => [...jobs, job].slice(-30), []);
    await this.notice('info', `${kind.toUpperCase()}_REQUEST`, `VS Code requested a ${kind}. Review and run it in the panel.`);
    this.changed();
  }

  async setJob(id, patch) { await update('jobs', (jobs) => jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)), []); this.changed(); }

  async runJob(id) {
    const jobs = await storage.get('jobs', []);
    const job = jobs.find((j) => j.id === id);
    if (!job || job.status !== 'AWAITING_USER') throw new Error('This job is not waiting to run.');
    if (job.projectId && job.projectId !== this.curProject()) throw new Error('This request belongs to another project. Connect to that project in VS Code first.');
    await this.setJob(id, { status: 'RUNNING' });
    const settings = await getSettings();
    const p = job.payload;
    const build = { documentation: () => buildDocumentationPrompt(p), comparison: () => comparisonPrompt(p, FOCUS[p.kind] || FOCUS.PROJECT), blueprint: () => blueprintPrompt(p) }[job.kind];
    let prompt = redactText(build()).text;
    if (estimateTokens(prompt) > settings.maxTokensPerRequest) { await this.setJob(id, { status: 'FAILED', error: `The request (~${estimateTokens(prompt)} tokens) exceeds your limit of ${settings.maxTokensPerRequest}. Raise "maxTokensPerRequest" in Settings or compare fewer projects.` }); return; }
    const ask1 = (text) => this.ai.run(text, { timeoutMs: settings.responseTimeoutSec * 1000, stableMs: settings.stableSec * 1000, onProgress: (pr) => this.setStatus({ job: { id, stage: pr.stage || 'RECEIVING' } }) });
    // Large prompts (specifications, documentation) go out in parts, the same way as analysis batches.
    const ask = async (text) => {
      const inParts = () => this.partsLoop(blocksFromText(text), Math.max(MIN_PART_CHARS, Math.min(settings.maxCharsPerMessage, Math.floor(text.length / 2))), (t, part) => { this.setStatus({ job: { id, stage: part.total > 1 ? `SENDING_PART_${part.index}_OF_${part.total}` : 'SUBMITTING' } }); return ask1(t); }, { what: `${job.kind} request` });
      if (text.length > settings.maxCharsPerMessage) { await this.notice('info', 'PARTS', `The ${job.kind} request is ${Math.round(text.length / 1000)}k characters; sending it in parts.`); return this.partsLoop(blocksFromText(text), settings.maxCharsPerMessage, (t, part) => { this.setStatus({ job: { id, stage: `SENDING_PART_${part.index}_OF_${part.total}` } }); return ask1(t); }, { what: `${job.kind} request` }); }
      const r = await ask1(text);
      if (isSendFailure(r) && text.length >= MIN_PART_CHARS * 1.5) { await this.notice('info', 'PARTS', `The chat box would not accept the ${job.kind} request in one message. Splitting it into parts and retrying.`); return inParts(); }
      return r;
    };
    let res = await ask(prompt);
    if (!res.ok) { await this.setJob(id, { status: 'FAILED', error: res.message, code: res.code }); return; }
    const check = (r) => { const j = parseAnyJson(r); if (!j.ok) return { ok: false, errors: j.errors }; const v = { documentation: () => validateDocumentationResponse(j.value, p.key), comparison: () => validateComparison(j.value), blueprint: () => validateBlueprint(j.value) }[job.kind](); return v; };
    let v = check(res);
    if (!v.ok) {
      res = await ask(`Your previous reply could not be used: ${v.errors.join('; ')}. Reply again with ONLY the corrected JSON object in one \`\`\`json code block.`);
      if (!res.ok) { await this.setJob(id, { status: 'FAILED', error: res.message, code: res.code }); return; }
      v = check(res);
      if (!v.ok) { await this.setJob(id, { status: 'FAILED', error: `Invalid answer after correction: ${v.errors.join('; ')}`, code: 'INVALID_JSON' }); return; }
    }
    const provider = res.provider || this.lastProvider || 'unknown';
    if (job.kind === 'documentation') { await this.bridge.send(T.DOCUMENTATION_RESPONSE, { key: v.doc.key, kind: p.kind, markdown: v.doc.markdown, provider }, { projectId: job.projectId }); await knowledgeStore.addResult('documentation', { key: v.doc.key, markdown: v.doc.markdown, provider }); }
    if (job.kind === 'comparison') { const projects = (p.projects || []).map((x) => ({ projectId: (x.project || x).projectId, name: (x.project || x).name })); await this.bridge.send(T.COMPARISON_RESPONSE, { kind: p.kind, projects, ...(p.scopes ? { scopes: p.scopes } : {}), ...(p.ref ? { ref: p.ref } : {}), result: v.result, conflicts: v.conflicts, provider }, { projectId: job.projectId }); await knowledgeStore.addResult('comparison', { kind: p.kind, projects, ...(p.scopes ? { scopes: p.scopes } : {}), ...(p.ref ? { ref: p.ref } : {}), result: v.result, conflicts: v.conflicts, provider }); }
    if (job.kind === 'blueprint') { const projects = (p.projects || []).map((x) => ({ projectId: (x.project || x).projectId, name: (x.project || x).name })); await this.bridge.send(T.BLUEPRINT_RESPONSE, { projects, requirements: p.requirements, blueprint: v.blueprint, provider }, { projectId: job.projectId }); await knowledgeStore.addResult('blueprint', { projects, requirements: p.requirements, blueprint: v.blueprint, provider }); }
    await this.setJob(id, { status: 'COMPLETED', completedAt: new Date().toISOString(), provider });
  }

  async dismissJob(id) { await update('jobs', (jobs) => jobs.filter((j) => j.id !== id), []); this.changed(); }
}
