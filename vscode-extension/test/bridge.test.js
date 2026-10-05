const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../src/core/projectManager');
const { ConfigManager } = require('../src/config/configManager');
const { tempProject, FakeChrome } = require('./helpers');
const logger = require('../src/utils/logger');

logger.setSink(() => {});
const EXT_ORIGIN = `chrome-extension://${'a'.repeat(32)}`;

async function setup({ maxTokens, pairingTtlMs, confirm = true } = {}) {
  const root = tempProject();
  const config = new ConfigManager();
  await config.set('chromeBridgePort', 0);
  if (maxTokens) await config.set('maxTokens', maxTokens);
  const pm = new ProjectManager({ root, config, confirmPairing: async () => confirm, bridgeOptions: { heartbeatMs: 60_000, pairingTtlMs } });
  await pm.load();
  await pm.initialize('Shop');
  await pm.scan();
  const status = await pm.bridge.start();
  return { root, pm, port: status.port };
}
async function pairedChrome(pm, port, origin = EXT_ORIGIN) {
  const { token } = await pm.bridge.startPairing();
  const chrome = new FakeChrome(port, origin);
  await chrome.connect();
  const res = await chrome.pair(token);
  assert.strictEqual(res.payload.accepted, true, JSON.stringify(res.payload));
  await chrome.waitFor('PROJECT_REGISTER');
  return chrome;
}

// A well-formed knowledge package for the given analysis, including deliberately false claims.
function knowledgePackage(pm, analysisId, root, hashOf) {
  const svc = 'server/services/orderService.js';
  return {
    packageType: 'KNOWLEDGE_PACKAGE', schemaVersion: '1.0', projectId: pm.project.projectId, analysisId,
    source: { provider: 'TestAI', model: 'test-model' },
    knowledge: {
      files: [
        { path: svc, sha256: hashOf(svc), purpose: 'Creates and finds orders', role: 'service', claims: [
          { claim: 'createOrder writes an order via Order.create', status: 'VERIFIED', subject: 'Order.create', evidence: [{ file: svc, symbol: 'createOrder', lineStart: 12, lineEnd: 17 }] },
          { claim: 'orders table has payment_status column', status: 'VERIFIED', subject: 'payment_status', evidence: [{ file: 'db/schema.sql', lineStart: 12, lineEnd: 16 }] },
          { claim: 'orders has a shipped_at column', status: 'VERIFIED', subject: 'shipped_at', evidence: [{ file: 'db/schema.sql', lineStart: 90, lineEnd: 99 }] },
          { claim: 'Claimed with no evidence at all', status: 'VERIFIED', evidence: [] },
        ], unknowns: [] },
        { path: '../../etc/passwd', purpose: 'nope', claims: [] },
        { path: 'server/controllers/orderController.js', sha256: 'sha256:' + '0'.repeat(64), purpose: 'stale hash', claims: [{ claim: 'createOrder responds 201', status: 'VERIFIED', evidence: [{ file: 'server/controllers/orderController.js', symbol: 'createOrder' }] }] },
      ],
      features: [], workflows: [],
      database: {
        entities: [{ name: 'orders', purpose: 'Customer orders', fields: [{ name: 'total', type: 'decimal' }, { name: 'payment_status', type: 'varchar', evidence: [{ file: 'db/schema.sql', lineStart: 12, lineEnd: 16 }] }] }],
        relationships: [{ from: 'payments', to: 'orders', type: 'many-to-one' }, { from: 'payments', to: 'users', type: 'one-to-one' }],
      },
      architecture: { overview: 'Express + React shop', claims: [] },
      dependencies: [{ from: 'client/src/components/Checkout.jsx', to: 'client/src/services/orderService.js' }, { from: 'client/src/components/Checkout.jsx', to: 'server/models/Order.js' }],
    },
    evidence: [], unknowns: [],
  };
}

test('origin policy: web pages cannot reach the bridge', async () => {
  const { pm, port } = await setup();
  const evil = new FakeChrome(port, 'https://evil.example');
  await assert.rejects(evil.connect(), /403|Unexpected/);
  const noOrigin = new FakeChrome(port, null);
  await assert.rejects(noOrigin.connect(), /403|Unexpected/);
  await pm.bridge.stop();
});

test('unauthenticated messages are refused; invalid messages get errors', async () => {
  const { pm, port } = await setup();
  const c = new FakeChrome(port, EXT_ORIGIN);
  await c.connect();
  c.send('ANALYSIS_ACCEPTED', { analysisId: 'analysis-001' }, { sessionId: null, projectId: null });
  assert.strictEqual((await c.waitFor('ERROR')).payload.code, 'UNAUTHENTICATED');
  c.sendRaw('not json');
  assert.strictEqual((await c.waitFor('ERROR')).payload.code, 'INVALID_MESSAGE');
  c.sendRaw(JSON.stringify({ protocol: 'ai-project', protocolVersion: '2.0', messageId: 'm1', messageType: 'PING', timestamp: new Date().toISOString(), payload: {} }));
  assert.strictEqual((await c.waitFor('ERROR')).payload.code, 'PROTOCOL_MISMATCH');
  await c.close();
  await pm.bridge.stop();
});

test('pairing: wrong token, expired token, rejection, then success (token is single use)', async () => {
  const { pm, port } = await setup({ pairingTtlMs: 300 });
  let { token } = await pm.bridge.startPairing();
  let c = new FakeChrome(port, EXT_ORIGIN); await c.connect();
  assert.strictEqual((await c.pair('WRONGTOKEN123')).payload.accepted, false);
  await c.close();

  await new Promise((r) => setTimeout(r, 400)); // let the token expire
  c = new FakeChrome(port, EXT_ORIGIN); await c.connect();
  const expired = await c.pair(token);
  assert.strictEqual(expired.payload.code, 'TOKEN_EXPIRED');
  await c.close();

  pm.bridge.security.ttlMs = 60_000;
  ({ token } = await pm.bridge.startPairing());
  c = new FakeChrome(port, EXT_ORIGIN); await c.connect();
  const ok = await c.pair(token);
  assert.strictEqual(ok.payload.accepted, true);
  assert.ok(ok.payload.connectionId && ok.payload.sessionId && ok.payload.sessionKey);
  const reg = await c.waitFor('PROJECT_REGISTER');
  assert.strictEqual(reg.payload.projectId, pm.project.projectId);
  const c2 = new FakeChrome(port, EXT_ORIGIN); await c2.connect();
  assert.strictEqual((await c2.pair(token)).payload.accepted, false); // reuse refused
  await c.close(); await c2.close();
  await pm.bridge.stop();
});

test('pairing requires user confirmation in VS Code', async () => {
  const { pm, port } = await setup({ confirm: false });
  const { token } = await pm.bridge.startPairing();
  const c = new FakeChrome(port, EXT_ORIGIN); await c.connect();
  const res = await c.pair(token);
  assert.strictEqual(res.payload.code, 'PAIRING_REJECTED');
  await pm.bridge.stop();
});

test('session/project ids are enforced after pairing', async () => {
  const { pm, port } = await setup();
  const c = await pairedChrome(pm, port);
  c.send('PING', {}, { sessionId: 'session-forged' });
  assert.strictEqual((await c.waitFor('ERROR')).payload.code, 'SESSION_MISMATCH');
  c.send('PING', {}, { projectId: 'project-other' });
  assert.strictEqual((await c.waitFor('ERROR')).payload.code, 'PROJECT_MISMATCH');
  c.send('PING', { nonce: 'x' });
  assert.strictEqual((await c.waitFor('PONG')).payload.nonce, 'x');
  await c.close(); await pm.bridge.stop();
});

test('end to end: analysis, secret redaction, checkpoints, knowledge verification and reconciliation', async () => {
  const { root, pm, port } = await setup();
  const chrome = await pairedChrome(pm, port);
  const snap = await pm.startAnalysis({ mode: 'FOLDER', selection: { folders: ['server'] }, purpose: 'server analysis' });
  assert.strictEqual(snap.analysisId, 'analysis-001');

  const req = await chrome.waitFor('ANALYSIS_REQUEST');
  assert.strictEqual(req.payload.analysisId, 'analysis-001');
  assert.ok(req.payload.secretsRedacted > 0);
  assert.ok(!JSON.stringify(req).includes('hunter2pass') && !JSON.stringify(req).includes('sk_live_'));
  chrome.send('ANALYSIS_ACCEPTED', { analysisId: 'analysis-001', provider: 'TestAI' });

  const batch = await chrome.waitFor('ANALYSIS_BATCH');
  const wire = JSON.stringify(batch);
  assert.ok(!wire.includes('hunter2pass'), 'DB password must not be sent');
  assert.ok(!wire.includes('sk_live_abcdefghijklmnopqrstuvwx'), 'API key must not be sent');
  assert.ok(wire.includes('[REDACTED_SECRET]'));
  assert.ok(!batch.payload.context.files.some((f) => f.path.startsWith('client/')), 'only the selected folder (plus dependencies) is sent');
  assert.ok(batch.payload.context.files.every((f) => /^sha256:/.test(f.hash)));

  chrome.send('ANALYSIS_BATCH_ACK', { analysisId: 'analysis-001', batchId: batch.payload.batchId });
  chrome.send('ANALYSIS_PROGRESS', { analysisId: 'analysis-001', batchId: batch.payload.batchId, stage: 'WAITING_AI', percent: 40 });
  chrome.send('AI_RESPONSE', { analysisId: 'analysis-001', batchId: batch.payload.batchId, status: 'COMPLETED', knowledge: { files: [] } });
  const ack = await chrome.waitFor('AI_RESPONSE_ACK');
  assert.strictEqual(ack.payload.checkpointed, true);
  assert.strictEqual(pm.history.completedBatchIds(await pm.history.get('analysis-001')).has(batch.payload.batchId), true);

  chrome.send('ANALYSIS_COMPLETE', { analysisId: 'analysis-001', status: 'COMPLETED' });
  const hashes = Object.fromEntries((await pm.knowledge.getFiles()).map((f) => [f.path, f.hash]));
  chrome.send('KNOWLEDGE_PACKAGE', { package: knowledgePackage(pm, 'analysis-001', root, (p) => hashes[p]) });
  const pkgAck = await chrome.waitFor('KNOWLEDGE_PACKAGE_ACK');
  assert.strictEqual(pkgAck.payload.accepted, true, JSON.stringify(pkgAck.payload));
  const merge = await chrome.waitFor('KNOWLEDGE_MERGE_RESULT');

  // Source verification results
  const know = await pm.knowledge.getFileKnowledge('server/services/orderService.js');
  const byClaim = Object.fromEntries(know.claims.map((c) => [c.claim, c.status]));
  assert.strictEqual(byClaim['createOrder writes an order via Order.create'], 'VERIFIED');
  assert.strictEqual(byClaim['orders table has payment_status column'], 'UNKNOWN', 'fabricated column must not become verified');
  assert.strictEqual(byClaim['orders has a shipped_at column'], 'UNKNOWN', 'evidence outside the file must not verify');
  assert.strictEqual(byClaim['Claimed with no evidence at all'], 'INFERRED');
  assert.ok(pkgAck.payload.rejected.some((r) => r.path === '../../etc/passwd'), 'path traversal rejected');
  assert.ok(pkgAck.payload.stale.includes('server/controllers/orderController.js'), 'hash mismatch flagged stale');
  assert.ok(merge.payload.unverified.some((u) => u.field === 'payment_status'));
  assert.ok(merge.payload.unverified.some((u) => u.kind === 'relationship' && u.from === 'payments' && u.to === 'users'));
  assert.ok(merge.payload.unverified.some((u) => u.kind === 'dependency' && u.to === 'server/models/Order.js'));

  const ents = (await pm.store.readJson('database/entities.json')).entities;
  const orders = ents.find((e) => e.name === 'orders');
  assert.ok(orders.knowledge.fields.some((f) => f.name === 'total' && f.status === 'VERIFIED'));
  assert.ok(!orders.knowledge.fields.some((f) => f.name === 'payment_status'));

  const files = await pm.knowledge.getFileMap();
  assert.strictEqual(files['server/services/orderService.js'].status === 'PARTIAL' || files['server/services/orderService.js'].status === 'ANALYZED', true);
  assert.strictEqual(files['server/controllers/orderController.js'].status, 'NOT_ANALYZED', 'stale package must not mark the file analyzed');
  assert.strictEqual(files['client/src/components/Checkout.jsx'].status, 'NOT_ANALYZED');
  const cov = await pm.knowledge.coverage(await pm.history.list());
  assert.strictEqual(cov.coverageStatus, 'PARTIAL');
  assert.ok(cov.filesAnalyzed >= 1 && cov.filesAnalyzed < cov.sourceFilesTotal);

  await chrome.close(); await pm.bridge.stop();
});

test('knowledge packages for unknown projects/analyses or invalid schema are refused', async () => {
  const { root, pm, port } = await setup();
  const chrome = await pairedChrome(pm, port);
  const good = knowledgePackage(pm, 'analysis-999', root, () => undefined);
  chrome.send('KNOWLEDGE_PACKAGE', { package: good });
  assert.strictEqual((await chrome.waitFor('KNOWLEDGE_PACKAGE_ACK')).payload.code, 'ANALYSIS_UNKNOWN');
  chrome.send('KNOWLEDGE_PACKAGE', { package: { ...good, projectId: 'project-other' } });
  assert.strictEqual((await chrome.waitFor('KNOWLEDGE_PACKAGE_ACK')).payload.code, 'PROJECT_MISMATCH');
  chrome.send('KNOWLEDGE_PACKAGE', { package: { packageType: 'KNOWLEDGE_PACKAGE' } });
  assert.strictEqual((await chrome.waitFor('KNOWLEDGE_PACKAGE_ACK')).payload.code, 'SCHEMA_INVALID');
  await chrome.close(); await pm.bridge.stop();
});

test('disconnect, reconnect and resume skips completed batches', async () => {
  const { pm, port } = await setup({ maxTokens: 250 });
  let chrome = await pairedChrome(pm, port);
  const creds = chrome.session;
  await pm.startAnalysis({ mode: 'PROJECT', selection: {}, purpose: 'whole project' });
  const req = await chrome.waitFor('ANALYSIS_REQUEST');
  assert.ok(req.payload.totalBatches > 1, `need multiple batches, got ${req.payload.totalBatches}`);
  chrome.send('ANALYSIS_ACCEPTED', { analysisId: req.payload.analysisId, provider: 'TestAI' });
  const b1 = await chrome.waitFor('ANALYSIS_BATCH');
  assert.strictEqual(b1.payload.batchNumber, 1);
  chrome.send('AI_RESPONSE', { analysisId: req.payload.analysisId, batchId: b1.payload.batchId, status: 'COMPLETED', knowledge: {} });
  await chrome.waitFor('AI_RESPONSE_ACK');
  const b2 = await chrome.waitFor('ANALYSIS_BATCH'); // sent, but Chrome drops before answering
  assert.strictEqual(b2.payload.batchNumber, 2);
  await chrome.close();
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(pm.bridge.runner.runs.get(req.payload.analysisId).status, 'DISCONNECTED');
  assert.strictEqual((await pm.history.get(req.payload.analysisId)).status, 'DISCONNECTED');

  chrome = new FakeChrome(port, EXT_ORIGIN);
  await chrome.connect();
  const bad = await chrome.resume({ connectionId: creds.connectionId, sessionKey: 'wrong' });
  assert.strictEqual(bad.payload.accepted, false);
  chrome = new FakeChrome(port, EXT_ORIGIN);
  await chrome.connect();
  const res = await chrome.resume(creds);
  assert.strictEqual(res.payload.accepted, true);
  assert.strictEqual(res.payload.sessionId, creds.sessionId || res.payload.sessionId);
  assert.ok(res.payload.resumable.some((r) => r.analysisId === req.payload.analysisId && r.completedBatchIds.includes(b1.payload.batchId)));
  const again = await chrome.waitFor('ANALYSIS_REQUEST');
  assert.strictEqual(again.payload.resume, true);
  assert.deepStrictEqual(again.payload.completedBatchIds, [b1.payload.batchId]);
  chrome.send('ANALYSIS_ACCEPTED', { analysisId: again.payload.analysisId });
  const next = await chrome.waitFor('ANALYSIS_BATCH');
  assert.strictEqual(next.payload.batchId, b2.payload.batchId, 'resumes at the first incomplete batch');
  assert.notStrictEqual(next.payload.batchId, b1.payload.batchId, 'completed batch is not duplicated');
  await chrome.close(); await pm.bridge.stop();
});

test('pause, cancel and retry controls', async () => {
  const { pm, port } = await setup({ maxTokens: 250 });
  const chrome = await pairedChrome(pm, port);
  await pm.startAnalysis({ mode: 'PROJECT', selection: {} });
  const req = await chrome.waitFor('ANALYSIS_REQUEST');
  const id = req.payload.analysisId;
  chrome.send('ANALYSIS_ACCEPTED', { analysisId: id });
  const b1 = await chrome.waitFor('ANALYSIS_BATCH');
  pm.bridge.runner.pause(id);
  await chrome.waitFor('PAUSE_REQUEST');
  chrome.send('AI_RESPONSE', { analysisId: id, batchId: b1.payload.batchId, status: 'COMPLETED', knowledge: {} });
  await chrome.waitFor('AI_RESPONSE_ACK');
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!chrome.queue.some((m) => m.messageType === 'ANALYSIS_BATCH'), 'no new batch while paused');
  pm.bridge.runner.resume(id);
  await chrome.waitFor('RESUME_REQUEST');
  const b2 = await chrome.waitFor('ANALYSIS_BATCH');
  chrome.send('AI_RESPONSE', { analysisId: id, batchId: b2.payload.batchId, status: 'FAILED', error: 'selectors changed' });
  await chrome.waitFor('AI_RESPONSE_ACK');
  assert.deepStrictEqual(pm.bridge.runner.runs.get(id).failed.has(b2.payload.batchId), true);
  pm.bridge.runner.retry(id, b2.payload.batchId);
  assert.strictEqual((await chrome.waitFor('ANALYSIS_BATCH')).payload.batchId, b2.payload.batchId);
  pm.bridge.runner.cancel(id);
  await chrome.waitFor('CANCEL_REQUEST');
  assert.strictEqual(pm.bridge.runner.runs.get(id).status, 'CANCELLED');
  await chrome.close(); await pm.bridge.stop();
});

test('a failed batch stops the run, and Resume restarts from that batch (not the next one)', async () => {
  const { pm, port } = await setup({ maxTokens: 250 });
  const chrome = await pairedChrome(pm, port);
  await pm.startAnalysis({ mode: 'PROJECT', selection: {} });
  const req = await chrome.waitFor('ANALYSIS_REQUEST');
  const id = req.payload.analysisId;
  assert.ok(req.payload.totalBatches >= 3, 'needs at least three batches');
  chrome.send('ANALYSIS_ACCEPTED', { analysisId: id });
  const b1 = await chrome.waitFor('ANALYSIS_BATCH');
  chrome.send('AI_RESPONSE', { analysisId: id, batchId: b1.payload.batchId, status: 'COMPLETED', knowledge: {} });
  await chrome.waitFor('AI_RESPONSE_ACK');
  const b2 = await chrome.waitFor('ANALYSIS_BATCH');
  chrome.send('AI_RESPONSE', { analysisId: id, batchId: b2.payload.batchId, status: 'FAILED', error: 'usage cap reached' });
  await chrome.waitFor('AI_RESPONSE_ACK');
  const run = pm.bridge.runner.runs.get(id);
  assert.strictEqual(run.status, 'FAILED');
  assert.strictEqual((await pm.history.get(id)).status, 'FAILED');
  assert.ok((await pm.bridge.runner.resumableFor()).some((r) => r.analysisId === id), 'failed analysis is resumable');
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!chrome.queue.some((m) => m.messageType === 'ANALYSIS_BATCH'), 'nothing is sent after a failure');
  pm.bridge.runner.resume(id);
  const again = await chrome.waitFor('ANALYSIS_BATCH');
  assert.strictEqual(again.payload.batchId, b2.payload.batchId, 'resume restarts from the failed batch');
  assert.strictEqual(run.status, 'IN_PROGRESS');
  chrome.send('AI_RESPONSE', { analysisId: id, batchId: again.payload.batchId, status: 'COMPLETED', knowledge: {} });
  await chrome.waitFor('AI_RESPONSE_ACK');
  const next = await chrome.waitFor('ANALYSIS_BATCH');
  assert.notStrictEqual(next.payload.batchId, b2.payload.batchId, 'the run carries on to the following batch');
  await chrome.close(); await pm.bridge.stop();
});

test('incremental analyses share one projectId and one knowledge base', async () => {
  const { root, pm, port } = await setup();
  const chrome = await pairedChrome(pm, port);
  const hashes = () => pm.knowledge.getFiles().then((fs_) => Object.fromEntries(fs_.map((f) => [f.path, f.hash])));

  async function runAnalysis(folder, file, claim) {
    await pm.startAnalysis({ mode: 'FOLDER', selection: { folders: [folder] } });
    const req = await chrome.waitFor('ANALYSIS_REQUEST');
    chrome.send('ANALYSIS_ACCEPTED', { analysisId: req.payload.analysisId });
    for (let i = 0; i < req.payload.totalBatches; i++) {
      const b = await chrome.waitFor('ANALYSIS_BATCH');
      chrome.send('AI_RESPONSE', { analysisId: req.payload.analysisId, batchId: b.payload.batchId, status: 'COMPLETED', knowledge: {} });
      await chrome.waitFor('AI_RESPONSE_ACK');
    }
    const h = await hashes();
    chrome.send('KNOWLEDGE_PACKAGE', { package: { packageType: 'KNOWLEDGE_PACKAGE', schemaVersion: '1.0', projectId: pm.project.projectId, analysisId: req.payload.analysisId, source: { provider: 'TestAI' }, knowledge: { files: [{ path: file, sha256: h[file], purpose: claim, claims: [] }], features: [], workflows: [], database: {}, architecture: {}, dependencies: [] }, evidence: [], unknowns: [] } });
    const ack = await chrome.waitFor('KNOWLEDGE_PACKAGE_ACK');
    assert.strictEqual(ack.payload.accepted, true, JSON.stringify(ack.payload));
    await chrome.waitFor('KNOWLEDGE_MERGE_RESULT');
    return req.payload.analysisId;
  }
  const a1 = await runAnalysis('server/controllers', 'server/controllers/orderController.js', 'HTTP layer for orders');
  const a2 = await runAnalysis('client', 'client/src/components/Checkout.jsx', 'Checkout UI');
  assert.notStrictEqual(a1, a2);
  const hist = await pm.history.list();
  assert.deepStrictEqual(hist.map((h) => h.projectId), [pm.project.projectId, pm.project.projectId]);
  const files = await pm.knowledge.getFileMap();
  assert.strictEqual(files['server/controllers/orderController.js'].status, 'ANALYZED');
  assert.strictEqual(files['client/src/components/Checkout.jsx'].status, 'ANALYZED');
  assert.deepStrictEqual(files['server/controllers/orderController.js'].analysisIds, [a1]);
  assert.deepStrictEqual(files['client/src/components/Checkout.jsx'].analysisIds, [a2]);
  assert.ok(await pm.knowledge.getFileKnowledge('server/controllers/orderController.js'), 'first analysis knowledge preserved after second merge');
  assert.ok(await pm.knowledge.getFileKnowledge('client/src/components/Checkout.jsx'));

  // modify source -> rescan -> OUTDATED + impact
  fs.appendFileSync(path.join(root, 'server/controllers/orderController.js'), '\n// changed\n');
  await pm.scan();
  const after = await pm.knowledge.getFileMap();
  assert.strictEqual(after['server/controllers/orderController.js'].status, 'OUTDATED');
  assert.strictEqual(after['client/src/components/Checkout.jsx'].status, 'ANALYZED');
  const docs = await pm.knowledge.getDocStatus();
  assert.strictEqual(docs.items['files/server/controllers/orderController.js'].status, 'OUTDATED');
  assert.strictEqual(docs.items['files/client/src/components/Checkout.jsx'].status, 'ANALYZED');
  assert.ok(pm.lastDelta.impact.dependents.includes('server/routes/orderRoutes.js'), 'dependents flagged as impacted');
  assert.ok(pm.lastDelta.impact.workflows.length >= 1);
  const cov = await pm.knowledge.coverage(await pm.history.list());
  assert.strictEqual(cov.filesOutdated, 1);
  await chrome.close(); await pm.bridge.stop();
});
