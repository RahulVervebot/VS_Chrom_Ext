import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { VsCodeBridge } from '../src/bridge/vscodeBridge.js';
import { Orchestrator, keyOf } from '../src/background/orchestrator.js';
import { parsePairingCode } from '../src/bridge/vscodeBridge.js';
import { knowledgeStore } from '../src/knowledge/knowledgeStore.js';
import { storage } from '../src/utils/storage.js';
import { saveSettings } from '../src/utils/settings.js';
import { scriptedAi, asReply, answerFor } from './support/scriptedAi.js';

const require = createRequire(import.meta.url);
const { ProjectManager } = require('../../vscode-extension/src/core/projectManager');
const { ConfigManager } = require('../../vscode-extension/src/config/configManager');
const { tempProject } = require('../../vscode-extension/test/helpers');
require('../../vscode-extension/src/utils/logger').setSink(() => {});

const until = async (fn, ms = 8000, what = 'condition') => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`); await new Promise((r) => setTimeout(r, 40)); } };

let currentPid = null;
const K = (id) => keyOf(currentPid, id); // analyses are stored per project

async function setup({ maxTokens, script, settings } = {}) {
  storage._reset();
  await saveSettings({ stableSec: 1, responseTimeoutSec: 10, ...(settings || {}) });
  const root = tempProject();
  const config = new ConfigManager();
  await config.set('chromeBridgePort', 0);
  if (maxTokens) await config.set('maxTokens', maxTokens);
  const pm = new ProjectManager({ root, config, confirmPairing: async () => true, allowNoOrigin: true, bridgeOptions: { heartbeatMs: 60_000 } });
  await pm.load(); await pm.initialize('Shop'); await pm.scan();
  currentPid = pm.project.projectId;
  const st = await pm.bridge.start();
  const ai = scriptedAi({ script });
  const bridge = new VsCodeBridge({ onStatus: () => {} });
  const orch = new Orchestrator({ bridge, ai });
  const { token } = await pm.bridge.startPairing();
  await bridge.pair({ port: st.port, token });
  const cleanup = async () => { bridge.disconnect(); await pm.bridge.stop(); };
  return { root, pm, bridge, orch, ai, port: st.port, cleanup };
}
const analysisOf = (id) => knowledgeStore.getAnalysis(K(id));

test('pairing stores credentials, registers the project, and tokens are single use', async () => {
  const e = await setup();
  assert.strictEqual(e.bridge.state, 'CONNECTED');
  assert.ok((await storage.get('pairing')).sessionKey);
  await until(async () => Object.keys(await knowledgeStore.getProjects()).length === 1, 3000, 'PROJECT_REGISTER');
  const other = new VsCodeBridge({ onStatus: () => {} });
  await assert.rejects(other.pair({ port: e.port, token: 'NOTATOKEN123' }), /Invalid pairing token|Pairing failed/);
  await e.cleanup();
});

test('full analysis: user confirms, prompt is redacted and specialized, answer validated, checkpoints kept, VS Code verifies', async () => {
  const e = await setup();
  const snap = await e.pm.startAnalysis({ mode: 'FOLDER', selection: { folders: ['server'] }, purpose: 'server workflows' });
  const id = snap.analysisId;
  await until(async () => (await analysisOf(id) || {}).status === 'AWAITING_USER', 4000, 'request to reach Chrome');
  const a0 = await analysisOf(id);
  assert.ok(a0.secretsRedacted > 0 && a0.files.length > 0, 'privacy summary data present');
  assert.strictEqual(e.ai.calls.length, 0, 'nothing is sent to the AI before the user confirms');
  await e.orch.confirmAnalysis(K(id));
  await until(async () => (await e.pm.history.get(id)).status === 'COMPLETED', 15000, 'VS Code to finish reconciling');

  for (const p of e.ai.calls) {
    assert.ok(!p.includes('hunter2pass') && !p.includes('sk_live_abcdefghijklmnopqrstuvwx'), 'no secret reached the AI');
    assert.match(p, /What starts this workflow/, 'workflow-specialized prompt used for FOLDER mode');
    assert.match(p, /\[REDACTED_SECRET\]/);
  }
  // VS Code finishes before its ack / merge-result messages reach Chrome: wait for them instead of racing.
  await until(async () => { const x = await analysisOf(id); return x.status === 'COMPLETED' && x.mergeResult; }, 8000, 'ack and merge result to reach Chrome');
  const a = await analysisOf(id);
  assert.strictEqual(a.status, 'COMPLETED');
  assert.ok(Object.values(a.batches).every((b) => b.status === 'completed' && b.knowledge && b.timestamp), 'checkpoint per batch');
  // VS Code verification results
  const know = await e.pm.knowledge.getFileKnowledge('server/services/orderService.js');
  const byClaim = Object.fromEntries(know.claims.map((c) => [c.claim, c.status]));
  assert.strictEqual(byClaim['the orders table has a payment_status column'], 'UNKNOWN', 'fabricated claim rejected by VS Code');
  assert.ok(Object.entries(byClaim).some(([c, s]) => /defines/.test(c) && s === 'VERIFIED'), 'real evidence verified');
  const files = await e.pm.knowledge.getFileMap();
  assert.ok(['ANALYZED', 'PARTIAL'].includes(files['server/services/orderService.js'].status));
  assert.strictEqual(files['client/src/components/Checkout.jsx'].status, 'NOT_ANALYZED');
  assert.ok(a.mergeResult && a.mergeResult.unverified.length > 0, 'Chrome sees what VS Code refused');
  await e.cleanup();
});

test('malformed answer: correction is requested once, then the batch is marked failed and never sent as knowledge', async () => {
  let n = 0;
  const e = await setup({ script: async () => { n++; return { ok: true, text: 'Sorry, here is my analysis in prose.', codeBlocks: [], provider: 'chatgpt' }; } });
  const snap = await e.pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/controllers/orderController.js'] } });
  await until(async () => (await analysisOf(snap.analysisId) || {}).status === 'AWAITING_USER');
  await e.orch.confirmAnalysis(K(snap.analysisId));
  const a = await until(async () => { const x = await analysisOf(snap.analysisId); return x.status === 'NEEDS_ATTENTION' && x; }, 8000, 'failure');
  assert.strictEqual(n, 2, 'exactly one correction attempt');
  assert.strictEqual(a.attention.code, 'INVALID_JSON');
  assert.ok(e.ai.calls[1].includes('could not be used'), 'correction prompt sent in the same chat');
  await until(() => e.pm.bridge.runner.runs.get(snap.analysisId).failed.size === 1, 4000, 'VS Code records the failure');
  const rec = await e.pm.knowledge.getFileKnowledge('server/controllers/orderController.js');
  assert.strictEqual(rec, null, 'malformed output produced no knowledge in VS Code');
  await e.cleanup();
});

test('correction succeeds when the second answer is valid; retry after failure completes the batch', async () => {
  let n = 0;
  const e = await setup({ script: async (prompt) => { n++; if (n === 1) return { ok: true, text: '{"files": [', codeBlocks: [], provider: 'chatgpt' }; if (n === 2) return null; return null; } });
  const snap = await e.pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/controllers/orderController.js'] } });
  await until(async () => (await analysisOf(snap.analysisId) || {}).status === 'AWAITING_USER');
  await e.orch.confirmAnalysis(K(snap.analysisId));
  await until(async () => (await e.pm.history.get(snap.analysisId)).status === 'COMPLETED', 15000, 'completion after correction');
  assert.ok(n >= 2);

  // a provider failure then a user retry
  let fail = true;
  const f = await setup({ script: async () => (fail ? { ok: false, code: 'LIMIT', message: 'usage cap reached', provider: 'chatgpt' } : null) });
  const s2 = await f.pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/controllers/orderController.js'] } });
  await until(async () => (await analysisOf(s2.analysisId) || {}).status === 'AWAITING_USER');
  await f.orch.confirmAnalysis(K(s2.analysisId));
  const a = await until(async () => { const x = await analysisOf(s2.analysisId); return x.status === 'NEEDS_ATTENTION' && x; }, 8000);
  assert.strictEqual(a.attention.code, 'LIMIT');
  fail = false;
  await f.orch.retryBatch(K(s2.analysisId), a.attention.batchId);
  await until(async () => (await f.pm.history.get(s2.analysisId)).status === 'COMPLETED', 15000, 'completion after retry');
  await e.cleanup(); await f.cleanup();
});

test('truncated answers and oversized prompts cause the batch to be split, not lost', async () => {
  let cut = 2; // the first answer AND the correction are both cut off, so the batch must be split
  const e = await setup({ script: async () => { if (cut-- > 0) return { ok: true, text: '```json\n{"files":[{"path":"server/app.js","purpose":"long long', codeBlocks: [], provider: 'chatgpt' }; return null; } });
  const snap = await e.pm.startAnalysis({ mode: 'FOLDER', selection: { folders: ['server'] } });
  await until(async () => (await analysisOf(snap.analysisId) || {}).status === 'AWAITING_USER');
  await e.orch.confirmAnalysis(K(snap.analysisId));
  await until(async () => (await e.pm.history.get(snap.analysisId)).status === 'COMPLETED', 20000, 'completion after split');
  assert.ok(e.ai.calls.length >= 3, `expected split calls, got ${e.ai.calls.length}`);
  const a = await analysisOf(snap.analysisId);
  const k = Object.values(a.batches)[0].knowledge;
  assert.ok(k.files.length >= 2, 'both halves merged');
  await e.cleanup();

  const g = await setup({ settings: { maxTokensPerRequest: 1500 } });
  const s2 = await g.pm.startAnalysis({ mode: 'FOLDER', selection: { folders: ['server'] } });
  await until(async () => (await analysisOf(s2.analysisId) || {}).status === 'AWAITING_USER');
  await g.orch.confirmAnalysis(K(s2.analysisId));
  await until(async () => { const x = await analysisOf(s2.analysisId); return x.status === 'NEEDS_ATTENTION' || (await g.pm.history.get(s2.analysisId)).status === 'COMPLETED'; }, 20000);
  assert.ok(g.ai.calls.every((p) => p.length / 3.6 < 1500 * 1.05), 'every prompt respected maxTokensPerRequest');
  await g.cleanup();
});

test('decline: nothing is sent to the AI and VS Code is told', async () => {
  const e = await setup();
  const snap = await e.pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/app.js'] } });
  await until(async () => (await analysisOf(snap.analysisId) || {}).status === 'AWAITING_USER');
  await e.orch.declineAnalysis(K(snap.analysisId));
  await until(() => e.pm.bridge.runner.runs.get(snap.analysisId).status === 'CANCELLED', 4000, 'VS Code sees decline');
  assert.strictEqual(e.ai.calls.length, 0);
  await e.cleanup();
});

test('disconnect mid-analysis: results are queued, session resumes, completed batches are not repeated', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let calls = 0;
  const e = await setup({ maxTokens: 900, script: async (prompt) => { calls++; if (calls === 2) await gate; return null; } });
  const snap = await e.pm.startAnalysis({ mode: 'PROJECT', selection: {} });
  const id = snap.analysisId;
  await until(async () => (await analysisOf(id) || {}).status === 'AWAITING_USER');
  await e.orch.confirmAnalysis(K(id));
  await until(async () => Object.values((await analysisOf(id)).batches).some((b) => b.status === 'completed'), 10000, 'first batch');
  // Chrome loses its connection while batch 2 is being answered (auto-reconnect off so the queued-result path is exercised)
  e.bridge.wantConnected = false;
  e.bridge.ws.close(); // a real network drop: goes through the onclose path
  await until(() => e.pm.bridge.runner.runs.get(id).status === 'DISCONNECTED', 4000, 'VS Code notices');
  release();
  await until(async () => (await storage.get('outbox', [])).length > 0, 6000, 'result queued while offline');
  await e.bridge.connect();
  await until(async () => (await e.pm.history.get(id)).status === 'COMPLETED', 30000, 'analysis to complete after resume');
  const a = await analysisOf(id);
  const done = Object.values(a.batches).filter((b) => b.status === 'completed');
  assert.strictEqual(done.length, a.totalBatches);
  // each batch was sent to the AI once (plus at most the one interrupted call)
  const perBatch = e.ai.calls.filter((p) => p.includes('batch 1 of')).length;
  assert.strictEqual(perBatch, 1, 'batch 1 was not repeated after resume');
  await e.cleanup();
});

test('change plan: proposal reaches VS Code with Chrome-injected hashes and is reviewable, not applied', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const e = await setup();
  const snap = await e.pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/services/orderService.js'] }, purpose: 'Reject negative quantities', intent: 'CHANGE_PLAN' });
  await until(async () => (await analysisOf(snap.analysisId) || {}).status === 'AWAITING_USER');
  const before = fs.readFileSync(path.join(e.root, 'server/services/orderService.js'), 'utf8');
  await e.orch.confirmAnalysis(K(snap.analysisId));
  await until(async () => (await e.pm.changes.list()).length === 1, 15000, 'change proposal');
  const [p] = await e.pm.changes.list();
  assert.strictEqual(p.status, 'PROPOSED', 'hash injected by Chrome matches the real file');
  const rec = await e.pm.changes.get(p.proposalId);
  assert.match(rec.files[0].diff, /\+\s+if \(items\.some/);
  assert.strictEqual(fs.readFileSync(path.join(e.root, 'server/services/orderService.js'), 'utf8'), before, 'nothing applied by Chrome');
  assert.match(e.ai.calls[0], /changeProposal/);
  await e.cleanup();
});

test('comparison job: user runs it, scores are stripped, VS Code stores it; oversize jobs fail clearly', async () => {
  const e = await setup({ script: async (prompt) => asReply({ commonApproaches: ['REST APIs'], differences: ['A uses Mongoose, B uses SQL'], score: 92, ranking: ['A', 'B'], conflicts: [{ topic: 'auth', claims: [{ project: 'A', claim: 'jwt' }, { project: 'B', claim: 'session' }] }] }) });
  e.pm.bridge.send('COMPARISON_REQUEST', { kind: 'PROJECT', projects: [{ project: { projectId: 'p1', name: 'A' } }, { project: { projectId: 'p2', name: 'B' } }], structural: {}, selection: [] });
  const job = await until(async () => (await storage.get('jobs', []))[0], 4000, 'job');
  assert.strictEqual(job.status, 'AWAITING_USER');
  assert.strictEqual(e.ai.calls.length, 0);
  await e.orch.runJob(job.id);
  await until(async () => (await e.pm.store.listDir('comparisons')).some((n) => n.endsWith('.json')), 8000, 'stored in VS Code');
  const rec = await e.pm.store.readJson('comparisons/comparison-001.json');
  assert.ok(!('score' in rec.result) && !('ranking' in rec.result));
  assert.deepStrictEqual(rec.result.commonApproaches, ['REST APIs']);
  assert.strictEqual(rec.conflicts.length, 1);
  assert.match(e.ai.calls[0], /Do not score, rank or declare a winner/);

  await saveSettings({ maxTokensPerRequest: 200 });
  e.pm.bridge.send('BLUEPRINT_REQUEST', { projects: [{ project: { projectId: 'p1', name: 'A' } }], requirements: 'x'.repeat(4000) });
  const job2 = await until(async () => (await storage.get('jobs', [])).find((j) => j.kind === 'blueprint'), 4000);
  await e.orch.runJob(job2.id);
  const j2 = (await storage.get('jobs', [])).find((j) => j.id === job2.id);
  assert.strictEqual(j2.status, 'FAILED');
  assert.match(j2.error, /exceeds your limit/);
  await e.cleanup();
});

test('pairing code carries the port; a bare code still works with the port field', () => {
  assert.deepStrictEqual(parsePairingCode('47822-7k3m9qx2lpwa', 1), { port: 47822, token: '7K3M9QX2LPWA' });
  assert.deepStrictEqual(parsePairingCode(' 47822 - ABCDEFGH1234 ', 1), { port: 47822, token: 'ABCDEFGH1234' });
  assert.deepStrictEqual(parsePairingCode('abcdefgh1234', 47821), { port: 47821, token: 'ABCDEFGH1234' });
});

test('two projects: second VS Code window falls back to the next port; switching pauses project A without losing it, never mixes results, and A resumes later', async () => {
  storage._reset();
  await saveSettings({ stableSec: 1, responseTimeoutSec: 10 });
  const mk = async (name, maxTokens) => {
    const config = new ConfigManager();
    await config.set('chromeBridgePort', 47931); // both windows want the same default port
    if (maxTokens) await config.set('maxTokens', maxTokens);
    const pm = new ProjectManager({ root: tempProject(), config, confirmPairing: async () => true, allowNoOrigin: true, bridgeOptions: { heartbeatMs: 60_000 } });
    await pm.load(); await pm.initialize(name); await pm.scan();
    return pm;
  };
  const A = await mk('Alpha', 900);
  const B = await mk('Beta');
  const pa = await A.bridge.startPairing();
  const pb = await B.bridge.startPairing();
  assert.strictEqual(pa.port, 47931);
  assert.strictEqual(pb.port, 47932, 'second window moved to the next free port instead of failing');
  assert.match(pb.code, /^47932-[A-Z0-9]{12}$/);

  let release; const gate = new Promise((r) => { release = r; });
  let alphaCalls = 0;
  const ai = scriptedAi({ script: async (prompt) => { if (prompt.includes('"name":"Alpha"') && ++alphaCalls === 2) await gate; return null; } });
  let cancelled = 0; ai.cancel = () => { cancelled++; };
  const bridge = new VsCodeBridge({ onStatus: () => {} });
  const orch = new Orchestrator({ bridge, ai });
  const pair = (p) => { const { port, token } = parsePairingCode(p.code, 0); return bridge.pair({ port, token }); };

  // --- project A: first batch done, second batch in flight ---
  await pair(pa);
  const sa = await A.startAnalysis({ mode: 'PROJECT', selection: {} });
  const keyA = keyOf(A.project.projectId, sa.analysisId);
  await until(async () => (await knowledgeStore.getAnalysis(keyA) || {}).status === 'AWAITING_USER', 6000, 'A request');
  await orch.confirmAnalysis(keyA);
  await until(async () => alphaCalls === 2, 15000, 'A batch 2 in flight');

  // --- user connects Chrome to project B while A is mid-batch ---
  await pair(pb);
  const a1 = await knowledgeStore.getAnalysis(keyA);
  assert.strictEqual(a1.status, 'PAUSED');
  assert.strictEqual(a1.attention.code, 'SWITCHED');
  assert.ok(cancelled >= 1, 'Chrome stopped waiting on the old project’s answer');
  await assert.rejects(orch.confirmAnalysis(keyA), /not waiting|another project/);

  // A's in-flight answer arrives now: it is stored and queued for A, NOT sent into B's session.
  release();
  await until(async () => (await storage.get('outbox', [])).some((m) => m.type === 'AI_RESPONSE' && m.projectId === A.project.projectId), 8000, 'A result queued for A');

  // --- project B works normally, even though both projects have an "analysis-001" ---
  const sb = await B.startAnalysis({ mode: 'FILE', selection: { files: ['server/controllers/orderController.js'] } });
  assert.strictEqual(sb.analysisId, sa.analysisId, 'both projects use the same analysis id');
  const keyB = keyOf(B.project.projectId, sb.analysisId);
  await until(async () => (await knowledgeStore.getAnalysis(keyB) || {}).status === 'AWAITING_USER', 6000, 'B request');
  await orch.confirmAnalysis(keyB);
  await until(async () => (await B.history.get(sb.analysisId)).status === 'COMPLETED', 30000, 'B completes');
  const all = await knowledgeStore.getAnalyses();
  assert.ok(all[keyA] && all[keyB] && keyA !== keyB, 'two separate records');
  assert.strictEqual((await A.history.get(sa.analysisId)).status !== 'COMPLETED', true, 'A is not finished by B’s session');
  assert.deepStrictEqual((await storage.get('notices', [])).filter((n) => n.level === 'error'), [], 'B never received (or reported) a message meant for A');
  assert.strictEqual((await B.history.list()).length, 1);

  // --- back to project A: pairing again delivers the queued result; Resume Analysis finishes the work ---
  await pair({ code: `${pa.port}-${(await A.bridge.startPairing()).token}` });
  await until(async () => (await storage.get('outbox', [])).every((m) => m.projectId !== A.project.projectId), 8000, 'queued result delivered to A');
  await A.resumeAnalysis(sa.analysisId);
  await until(async () => (await A.history.get(sa.analysisId)).status === 'COMPLETED', 40000, 'A completes after resume');
  const done = Object.values((await knowledgeStore.getAnalysis(keyA)).batches).filter((b) => b.status === 'completed');
  assert.strictEqual(done.length, (await knowledgeStore.getAnalysis(keyA)).totalBatches);
  assert.strictEqual(ai.calls.filter((p) => p.includes('"name":"Alpha"') && p.includes('batch 1 of')).length, 1, 'A’s first batch was not redone');

  bridge.disconnect(); await A.bridge.stop(); await B.bridge.stop();
});

test('Resume on a failed run restarts the failed batch', async () => {
  let fail = true;
  const f = await setup({ script: async () => (fail ? { ok: false, code: 'LIMIT', message: 'usage cap reached', provider: 'chatgpt' } : null) });
  const s = await f.pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/controllers/orderController.js'] } });
  await until(async () => (await analysisOf(s.analysisId) || {}).status === 'AWAITING_USER');
  await f.orch.confirmAnalysis(K(s.analysisId));
  await until(async () => (await analysisOf(s.analysisId) || {}).status === 'NEEDS_ATTENTION', 8000);
  fail = false;
  await f.orch.control('resume', K(s.analysisId));
  await until(async () => (await f.pm.history.get(s.analysisId)).status === 'COMPLETED', 15000, 'completion after resume');
  await f.cleanup();
});
