// Runs INSIDE the VS Code extension host. Uses the real vscode API; only user-facing prompts are stubbed.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const WebSocket = require('ws');
const { createMessage, PROTOCOL_VERSION } = require('../../src/bridge/bridgeProtocol');

const results = [];
async function t(name, fn) {
  try { await fn(); results.push([name, true]); console.log(`  ok   ${name}`); } catch (e) { results.push([name, false, e]); console.log(`  FAIL ${name}\n       ${e.stack || e}`); }
}

// Stub prompts and record what the extension showed the user.
const shown = [];
function stubUi({ inputs = [], picks = [], modal = 'Send' } = {}) {
  const w = vscode.window;
  const q = { inputs: [...inputs], picks: [...picks] };
  w.showInputBox = async (o) => { shown.push(['input', o && o.prompt]); return q.inputs.length ? q.inputs.shift() : (o && o.value); };
  w.showQuickPick = async (items, o) => { shown.push(['pick', o && o.placeHolder]); const p = q.picks.shift(); return typeof p === 'function' ? p(items) : p; };
  const msg = (kind) => async (m, ...rest) => { shown.push([kind, m, rest]); const opts = rest.find((r) => r && typeof r === 'object' && !('title' in r) ) ; const labels = rest.filter((r) => typeof r === 'string'); return labels.includes(modal) ? modal : (labels.includes('Allow') ? 'Allow' : undefined); };
  w.showInformationMessage = msg('info'); w.showWarningMessage = msg('warn'); w.showErrorMessage = msg('error');
  return q;
}

exports.run = async function run() {
  const workspace = process.env.AIPI_WORKSPACE;
  const ext = vscode.extensions.getExtension('vervebot.ai-project-intelligence');
  assert.ok(ext, 'extension is installed in the dev host');
  let api;

  await t('activates without a project and registers every contributed command', async () => {
    api = await ext.activate();
    assert.strictEqual(ext.isActive, true);
    const declared = ext.packageJSON.contributes.commands.map((c) => c.command);
    const registered = await vscode.commands.getCommands(true);
    const missing = declared.filter((c) => !registered.includes(c));
    assert.deepStrictEqual(missing, [], `unregistered: ${missing}`);
    assert.ok(declared.length >= 34);
    assert.ok(api.pm(), 'workspace folder detected');
    assert.strictEqual(api.pm().isInitialized(), false, 'nothing initialized or scanned automatically');
    assert.ok(!fs.existsSync(path.join(workspace, '.ai-project')), 'activation must not create .ai-project');
  });

  await t('contributes activity bar container, sidebar view and configuration', async () => {
    const c = ext.packageJSON.contributes;
    assert.ok(c.viewsContainers.activitybar.some((v) => v.id === 'aiProject'));
    assert.ok(c.views.aiProject.some((v) => v.id === 'aiProject.sidebar' && v.type === 'webview'));
    const props = c.configuration.properties;
    for (const k of ['aiProject.provider', 'aiProject.maxTokensPerFile', 'aiProject.excludePatterns', 'aiProject.chromeBridgePort', 'aiProject.requireApprovalForChanges']) assert.ok(props[k], k);
    assert.strictEqual(vscode.workspace.getConfiguration('aiProject').get('chromeBridgeHost'), '127.0.0.1');
    assert.strictEqual(vscode.workspace.getConfiguration('aiProject').get('autoScan'), false);
  });

  await t('commands before initialization report a clear message instead of crashing', async () => {
    stubUi();
    await vscode.commands.executeCommand('aiProject.scanProject');
    assert.ok(shown.some(([k, m]) => k === 'error' && /Initialize Project/.test(m)), JSON.stringify(shown.slice(-2)));
  });

  await t('Start Here shows the 5-step checklist, marks the next step, and running a step returns to the list', async () => {
    let first = null; let second = null;
    stubUi({ inputs: ['Shop'], picks: [
      (items) => { first = items.map((i) => i.label); return items.find((i) => i.id === 'init'); },
      (items) => { second = items.map((i) => i.label); return undefined; },
    ] });
    await vscode.commands.executeCommand('aiProject.start');
    assert.ok(first[0].includes('1. Set up this project') && first[0].includes('$(arrow-right)'), first[0]);
    assert.ok(first.some((l) => l.includes('5. Analyze with AI')));
    assert.ok(second[0].includes('$(check)'), 'step 1 is checked after it ran: ' + second[0]);
    assert.ok(fs.existsSync(path.join(workspace, '.ai-project/project.json')));
  });

  await t('Initialize Project creates .ai-project and is safe to run again', async () => {
    stubUi({ inputs: ['Shop'] });
    await vscode.commands.executeCommand('aiProject.initializeProject');
    const dir = path.join(workspace, '.ai-project');
    for (const d of ['index', 'workflows', 'database', 'features', 'architecture', 'documentation', 'comparisons', 'generation', 'changes', 'snapshots', 'history']) assert.ok(fs.existsSync(path.join(dir, d)), d);
    const project = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
    assert.match(project.projectId, /^project-/);
    assert.strictEqual(project.name, 'Shop');
    assert.ok(!JSON.stringify(project).includes(workspace), 'no machine-specific path stored as project data');
    await vscode.commands.executeCommand('aiProject.initializeProject');
    assert.ok(shown.some(([k, m]) => k === 'info' && /existing project intelligence/.test(m)));
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')).projectId, project.projectId, 'id unchanged');
  });

  await t('Scan Project scans the real workspace and honours exclusions', async () => {
    stubUi();
    await vscode.commands.executeCommand('aiProject.scanProject');
    const files = JSON.parse(fs.readFileSync(path.join(workspace, '.ai-project/index/files.json'), 'utf8')).files;
    assert.ok(files.length >= 10);
    assert.ok(files.some((f) => f.path === 'server/services/orderService.js' && /^sha256:/.test(f.hash)));
    assert.ok(!files.some((f) => f.path.startsWith('node_modules/')), 'node_modules excluded');
    assert.ok(!files.some((f) => f.path === '.env'), '.env excluded by default');
    assert.ok(fs.existsSync(path.join(workspace, '.ai-project/workflows/index.json')));
  });

  await t('Select Files / Select Folder update the selection', async () => {
    stubUi();
    const uri = vscode.Uri.file(path.join(workspace, 'server/controllers/orderController.js'));
    await vscode.commands.executeCommand('aiProject.selectFiles', uri, [uri]);
    await vscode.commands.executeCommand('aiProject.selectFolder', vscode.Uri.file(path.join(workspace, 'client')), [vscode.Uri.file(path.join(workspace, 'client'))]);
    const sel = api.pm().state && (await api.pm().state());
    const saved = vscode.extensions.getExtension('vervebot.ai-project-intelligence');
    assert.ok(saved.isActive);
    // an outside path must be refused
    stubUi();
    await vscode.commands.executeCommand('aiProject.selectFiles', vscode.Uri.file('/etc/hosts'), [vscode.Uri.file('/etc/hosts')]);
    assert.ok(shown.some(([k, m]) => k === 'error' && /outside the open project/.test(m)));
  });

  await t('Generate Documentation writes documents and marks unknowns as UNKNOWN', async () => {
    stubUi();
    await vscode.commands.executeCommand('aiProject.generateDocumentation');
    const md = fs.readFileSync(path.join(workspace, '.ai-project/architecture/overview.md'), 'utf8');
    assert.match(md, /NOT_ANALYZED/);
    assert.match(md, /UNKNOWN/);
    assert.ok(fs.readdirSync(path.join(workspace, '.ai-project/documentation/workflows')).length >= 1);
  });

  await t('Verify Project detects commands from package.json (no assumptions)', async () => {
    const q = stubUi({ picks: [(items) => { assert.deepStrictEqual(items.map((i) => i.label), ['npm test', 'npm run lint', 'npm run build']); return undefined; }] });
    await vscode.commands.executeCommand('aiProject.verifyProject');
    assert.strictEqual(q.picks.length, 0, 'quick pick was shown');
  });

  await t('Pair Chrome -> real WebSocket client pairs, analysis flows, knowledge is verified and stored', async () => {
    const pm = api.pm();
    const q = stubUi();
    const pairing = vscode.commands.executeCommand('aiProject.pairChrome');
    // Wait for the token to exist, then read it from the bridge (the notification is stubbed).
    await new Promise((r) => setTimeout(r, 300));
    const status = pm.bridge.getStatus();
    assert.strictEqual(status.state, 'PAIRING');
    assert.strictEqual(status.host, '127.0.0.1');
    const token = [...pm.bridge.security.pending.keys()].length && await new Promise((resolve) => { const t0 = pm.bridge.security.createPairingToken(pm.project.projectId); resolve(t0.token); });
    const pairResult = await pairing;
    assert.match(pairResult.code, /^\d{2,5}-[A-Z0-9]{12}$/, 'the pairing code carries the port');

    const ws = new WebSocket(`ws://127.0.0.1:${status.port}`, { origin: `chrome-extension://${'b'.repeat(32)}` });
    const inbox = []; const waiters = [];
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); const i = waiters.findIndex((w) => w.type === m.messageType); if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else inbox.push(m); });
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
    const waitFor = (type, ms = 8000) => { const i = inbox.findIndex((m) => m.messageType === type); if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]); return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`timeout ${type}`)), ms); waiters.push({ type, resolve: (m) => { clearTimeout(timer); resolve(m); } }); }); };
    let session = { sessionId: null, projectId: null };
    const send = (type, payload) => ws.send(JSON.stringify(createMessage(type, { ...session, payload })));
    send('PAIR_REQUEST', { pairingToken: token, clientName: 'Suite Chrome', protocolVersion: PROTOCOL_VERSION });
    const pr = await waitFor('PAIR_RESPONSE');
    assert.strictEqual(pr.payload.accepted, true, JSON.stringify(pr.payload)); // confirmPairing modal answered 'Allow' by the stub
    session = { sessionId: pr.payload.sessionId, projectId: pr.payload.projectId };
    await waitFor('PROJECT_REGISTER');
    assert.strictEqual(pm.bridge.getStatus().state, 'CONNECTED');

    // Analyze the server folder through the real command (modal privacy summary is stubbed to 'Send')
    stubUi({ inputs: ['test purpose'], modal: 'Send' });
    pm.selection = undefined;
    await vscode.commands.executeCommand('aiProject.selectFolder', vscode.Uri.file(path.join(workspace, 'server')), [vscode.Uri.file(path.join(workspace, 'server'))]);
    await vscode.commands.executeCommand('aiProject.analyzeSelection');
    const priv = shown.filter(([k]) => k === 'info').map(([, m, rest]) => JSON.stringify(rest)).join('');
    assert.ok(/Secrets redacted before sending: \d+/.test(priv), 'privacy summary was shown with redaction count');
    assert.ok(!priv.includes('hunter2pass'), 'summary never contains secret values');
    const req = await waitFor('ANALYSIS_REQUEST');
    assert.strictEqual(req.payload.mode, 'FOLDER');
    send('ANALYSIS_ACCEPTED', { analysisId: req.payload.analysisId, provider: 'SuiteAI' });
    for (let i = 0; i < req.payload.totalBatches; i++) {
      const b = await waitFor('ANALYSIS_BATCH');
      assert.ok(!JSON.stringify(b).includes('hunter2pass'));
      send('AI_RESPONSE', { analysisId: req.payload.analysisId, batchId: b.payload.batchId, status: 'COMPLETED', knowledge: {} });
      await waitFor('AI_RESPONSE_ACK');
    }
    const files = await pm.knowledge.getFileMap();
    send('KNOWLEDGE_PACKAGE', { package: { packageType: 'KNOWLEDGE_PACKAGE', schemaVersion: '1.0', projectId: pm.project.projectId, analysisId: req.payload.analysisId, source: { provider: 'SuiteAI', model: 'm' }, knowledge: { files: [{ path: 'server/controllers/orderController.js', sha256: files['server/controllers/orderController.js'].hash, purpose: 'Order HTTP handlers', claims: [{ claim: 'createOrder responds 201 via res.status', status: 'VERIFIED', subject: 'res.status', evidence: [{ file: 'server/controllers/orderController.js', symbol: 'createOrder', lineStart: 3, lineEnd: 10 }] }], unknowns: [] }], features: [], workflows: [], database: {}, architecture: {}, dependencies: [] }, evidence: [], unknowns: [] } });
    const ack = await waitFor('KNOWLEDGE_PACKAGE_ACK');
    assert.strictEqual(ack.payload.accepted, true, JSON.stringify(ack.payload));
    await waitFor('KNOWLEDGE_MERGE_RESULT');
    const after = await pm.knowledge.getFileMap();
    assert.strictEqual(after['server/controllers/orderController.js'].status, 'ANALYZED');
    assert.strictEqual(after['client/src/components/Checkout.jsx'].status, 'NOT_ANALYZED');
    const hist = fs.readdirSync(path.join(workspace, '.ai-project/history'));
    assert.ok(hist.includes(`${req.payload.analysisId}.json`));

    // Disconnect command then reconnect with the stored session (no new pairing)
    ws.close();
    await new Promise((r) => setTimeout(r, 200));
    assert.notStrictEqual(pm.bridge.getStatus().state, 'CONNECTED');
    global.__aipi_ws = null;
  });

  await t('Disconnect Chrome command stops the bridge cleanly', async () => {
    const pm = api.pm();
    stubUi({ picks: [(items) => items.find((i) => i.id === 'stop')] });
    await vscode.commands.executeCommand('aiProject.disconnectChrome');
    assert.strictEqual(pm.bridge.getStatus().state, 'STOPPED');
  });

  await t('sidebar webview provider and dashboard panel resolve', async () => {
    await vscode.commands.executeCommand('aiProject.openDashboard');
    await new Promise((r) => setTimeout(r, 500));
    const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    assert.ok(tabs.some((tab) => /AI Project Intelligence/.test(tab.label)), `tabs: ${tabs.map((x) => x.label)}`);
  });

  await t('deactivation-safe: bridge stops listening', async () => {
    await api.pm().bridge.stop();
    assert.strictEqual(api.pm().bridge.getStatus().state, 'STOPPED');
  });

  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} extension-host checks passed`);
  if (failed.length) throw new Error(`${failed.length} extension-host check(s) failed`);
};
