const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../src/core/projectManager');
const { ConfigManager } = require('../src/config/configManager');
const { detectCommands } = require('../src/changes/verificationManager');
const { unifiedDiff } = require('../src/changes/diffManager');
const { buildComparisonRequest, storeComparison } = require('../src/comparison/comparisonManager');
const { loadProjectSummary } = require('../src/comparison/projectComparator');
const { storeBlueprint, buildBlueprintRequest } = require('../src/generation/blueprintGenerator');
const { planFromBlueprint, createFromBlueprint } = require('../src/generation/projectGenerator');
const { tempProject } = require('./helpers');
const logger = require('../src/utils/logger');

logger.setSink(() => {});

async function setup() {
  const root = tempProject();
  const pm = new ProjectManager({ root, config: new ConfigManager() });
  await pm.load(); await pm.initialize('Shop'); await pm.scan();
  return { root, pm };
}
const target = 'server/services/orderService.js';
const hashOf = async (pm, p) => (await pm.knowledge.getFileMap())[p].hash;

test('change proposal: valid proposal is stored with diff and impact; nothing is written to source', async () => {
  const { root, pm } = await setup();
  const before = fs.readFileSync(path.join(root, target), 'utf8');
  const rec = await pm.changes.propose({ title: 'Reject negative totals', changes: [{ path: target, operation: 'MODIFY', expectedHash: await hashOf(pm, target), edits: [{ find: "throw new Error('Cart is empty');", replace: "throw new Error('Cart is empty');\n  if (items.some((i) => i.qty < 0)) throw new Error('Negative quantity');" }] }] });
  assert.strictEqual(rec.status, 'PROPOSED');
  assert.match(rec.files[0].diff, /\+\s+if \(items\.some/);
  assert.ok(rec.impact.dependents.some((d) => d.path === 'server/controllers/orderController.js'));
  assert.ok(rec.impact.workflows.length >= 1);
  assert.strictEqual(fs.readFileSync(path.join(root, target), 'utf8'), before, 'proposal must not modify source');
});

test('change proposal validation: traversal, env files, missing hash, ambiguous edits', async () => {
  const { pm } = await setup();
  const h = await hashOf(pm, target);
  const bad = (change) => pm.changes.propose({ title: 't', changes: [change] });
  await assert.rejects(bad({ path: '../outside.js', operation: 'CREATE', newContent: 'x' }), /escapes|not accepted/);
  await assert.rejects(bad({ path: '/etc/passwd', operation: 'CREATE', newContent: 'x' }), /Absolute/);
  await assert.rejects(bad({ path: '.env', operation: 'CREATE', newContent: 'X=1' }), /environment files/);
  await assert.rejects(bad({ path: '.git/config', operation: 'MODIFY', expectedHash: h, newContent: 'x' }), /not allowed/);
  await assert.rejects(bad({ path: target, operation: 'MODIFY', newContent: 'x' }), /expectedHash is required/);
  const amb = await pm.changes.propose({ title: 't', changes: [{ path: target, operation: 'MODIFY', expectedHash: h, edits: [{ find: 'items', replace: 'x' }] }] });
  assert.strictEqual(amb.status, 'STALE', 'ambiguous edit target is not applied');
});

test('change safety: stale hash stops the apply and leaves the file untouched', async () => {
  const { root, pm } = await setup();
  const rec = await pm.changes.propose({ title: 'x', changes: [{ path: target, operation: 'MODIFY', expectedHash: await hashOf(pm, target), newContent: 'module.exports = {};\n' }] });
  fs.appendFileSync(path.join(root, target), '\n// edited by a human after analysis\n');
  const edited = fs.readFileSync(path.join(root, target), 'utf8');
  await assert.rejects(pm.changes.apply(rec.proposalId, { approve: async () => true, runVerification: false }), /File changed since analysis\. Re-analysis required\./);
  assert.strictEqual(fs.readFileSync(path.join(root, target), 'utf8'), edited);
  assert.strictEqual((await pm.changes.get(rec.proposalId)).status, 'STALE');
});

test('change safety: proposals built on a stale hash are marked STALE at proposal time', async () => {
  const { pm } = await setup();
  const rec = await pm.changes.propose({ title: 'x', changes: [{ path: target, operation: 'MODIFY', expectedHash: 'sha256:' + '1'.repeat(64), newContent: 'x' }] });
  assert.strictEqual(rec.status, 'STALE');
  assert.strictEqual(rec.files[0].staleReason, 'File changed since analysis. Re-analysis required.');
});

test('apply requires approval; approved apply writes, rescans and can be rolled back', async () => {
  const { root, pm } = await setup();
  const original = fs.readFileSync(path.join(root, target), 'utf8');
  const mk = async () => pm.changes.propose({ title: 'x', changes: [{ path: target, operation: 'MODIFY', expectedHash: await hashOf(pm, target), newContent: original + '\n// approved change\n' }, { path: 'server/newFile.js', operation: 'CREATE', newContent: 'module.exports = 1;\n' }] });
  await assert.rejects(pm.changes.apply((await mk()).proposalId, {}), /explicit user approval/);
  const declined = await pm.changes.apply((await mk()).proposalId, { approve: async () => false, runVerification: false });
  assert.strictEqual(declined.status, 'REJECTED');
  assert.strictEqual(fs.readFileSync(path.join(root, target), 'utf8'), original);

  const rec = await mk();
  const res = await pm.changes.apply(rec.proposalId, { approve: async (r) => { assert.ok(r.files.every((f) => f.diff)); return true; }, runVerification: false });
  assert.strictEqual(res.status, 'APPLIED');
  assert.ok(fs.readFileSync(path.join(root, target), 'utf8').endsWith('// approved change\n'));
  assert.ok(fs.existsSync(path.join(root, 'server/newFile.js')));
  const files = await pm.knowledge.getFileMap();
  assert.ok(files['server/newFile.js'], 'rescan picked up the new file');
  assert.notStrictEqual(files[target].hash, rec.files[0].expectedHash, 'hash updated after rescan');

  await pm.changes.rollback(rec.proposalId);
  assert.strictEqual(fs.readFileSync(path.join(root, target), 'utf8'), original);
  assert.ok(!fs.existsSync(path.join(root, 'server/newFile.js')));
});

test('rollback refuses to overwrite later human edits', async () => {
  const { root, pm } = await setup();
  const rec = await pm.changes.propose({ title: 'x', changes: [{ path: target, operation: 'MODIFY', expectedHash: await hashOf(pm, target), newContent: 'module.exports = {};\n' }] });
  await pm.changes.apply(rec.proposalId, { approve: async () => true, runVerification: false });
  fs.appendFileSync(path.join(root, target), '// human edit\n');
  await assert.rejects(pm.changes.rollback(rec.proposalId), /refusing to roll back/);
});

test('verification commands are detected from the project, not assumed', async () => {
  const { root, pm } = await setup();
  const cmds = await detectCommands(root, pm.scanResult.packages.commands.scripts);
  assert.deepStrictEqual(cmds.map((c) => c.kind), ['test', 'lint', 'build']);
  assert.ok(cmds.every((c) => c.source.startsWith('package.json scripts.')));
  assert.deepStrictEqual(await detectCommands(root, { 'package.json': { test: 'echo "Error: no test specified" && exit 1' } }), []);
  assert.deepStrictEqual(await detectCommands(root, {}), []);
});

test('unified diff shape', () => {
  const d = unifiedDiff('a\nb\nc', 'a\nB\nc', 'x.js');
  assert.match(d.text, /^--- a\/x\.js\n\+\+\+ b\/x\.js\n@@/);
  assert.ok(d.text.includes('-b') && d.text.includes('+B'));
  assert.strictEqual(unifiedDiff(null, 'new', 'n.js').added, 1);
});

test('documentation: unknowns stay unknown, previous versions are preserved, outdated docs are flagged', async () => {
  const { root, pm } = await setup();
  const first = await pm.documentation.updateAll();
  assert.ok(first.wrote.includes('architecture/overview'));
  const overview = fs.readFileSync(path.join(pm.store.dir, 'architecture/overview.md'), 'utf8');
  assert.match(overview, /coverage is \*\*NOT_ANALYZED\*\*|Analysis coverage is \*\*NOT_ANALYZED\*\*/);
  assert.match(overview, /UNKNOWN: no verified summary yet/);
  assert.ok(!fs.existsSync(path.join(pm.store.dir, 'documentation/files/server__services__orderService.js.md')), 'no file doc without verified knowledge');
  const wfDoc = await pm.documentation.read('workflows/checkout-post-api-orders');
  assert.match(wfDoc, /UNKNOWN: not established/);
  assert.match(wfDoc, /\| 10 \| db-write \| Writes `Order` \(create\)/);

  // change source -> regenerate -> previous version archived
  fs.appendFileSync(path.join(root, target), '\nfunction extraHelper() { return 1; }\n');
  await pm.scan();
  const second = await pm.documentation.updateAll();
  assert.ok(second.wrote.length > 0);
  assert.ok((await pm.documentation.versions('architecture/overview')).length >= 1 || (await pm.documentation.versions('documentation/architecture')).length >= 1 || (await pm.documentation.versions('workflows/checkout-post-api-orders')).length >= 1, 'previous documentation preserved in snapshots');
  const again = await pm.documentation.updateAll();
  assert.deepStrictEqual(again.wrote, [], 'idempotent when nothing changed');
});

test('comparison and blueprint: stored, rankings stripped, source untouched, conflicts kept', async () => {
  const { root, pm } = await setup();
  const other = tempProject();
  fs.rmSync(path.join(other, 'server/controllers'), { recursive: true });
  const pmB = new ProjectManager({ root: other, config: new ConfigManager() });
  await pmB.load(); await pmB.initialize('Shop B'); await pmB.scan();
  const [a, b] = [await loadProjectSummary(root), await loadProjectSummary(other)];
  const req = buildComparisonRequest({ kind: 'PROJECT', summaries: [a, b] });
  assert.ok(req.structural.technologies[0].common.includes('Express'));
  assert.strictEqual(req.instructions.noScoring, true);
  assert.throws(() => buildComparisonRequest({ kind: 'PROJECT', summaries: [a] }), /at least two/);

  const rec = await storeComparison(pm.store, { kind: 'PROJECT', projects: [a.project, b.project], result: { commonApproaches: ['REST'], differences: ['x'], score: 97, ranking: ['A', 'B'], nested: { winner: 'A', ok: 1 } }, conflicts: [{ topic: 'auth', A: 'jwt', B: 'session' }] });
  assert.strictEqual(rec.comparisonId, 'comparison-001');
  assert.ok(!('score' in rec.result) && !('ranking' in rec.result) && !('winner' in rec.result.nested));
  assert.deepStrictEqual(rec.conflicts.length, 1);
  assert.ok(fs.existsSync(path.join(pm.store.dir, 'comparisons/comparison-001.md')));
  await assert.rejects(storeComparison(pm.store, { kind: 'NOPE', result: {} }), /Invalid comparison/);

  const before = fs.readFileSync(path.join(root, target), 'utf8');
  assert.throws(() => buildBlueprintRequest({ summaries: [a], requirements: '  ' }), /requirements/);
  const bp = await storeBlueprint(pm.store, { projects: [a.project], requirements: 'a shop', blueprint: { purpose: 'shop', folderStructure: { src: { 'index.js': null }, 'README.md': null }, conflicts: [{ topic: 'db' }] } });
  assert.ok(bp.missingSections.includes('technologyStack'));
  assert.strictEqual(bp.appliedToSource, false);
  assert.strictEqual(fs.readFileSync(path.join(root, target), 'utf8'), before);
  const plan = planFromBlueprint(bp);
  assert.ok(plan.entries.some((e) => e.path === 'src/index.js' && e.type === 'file'));
  const empty = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bp-'));
  await createFromBlueprint(plan, empty, bp);
  assert.ok(fs.existsSync(path.join(empty, 'src/index.js')));
  await assert.rejects(createFromBlueprint(plan, empty, bp), /not empty/);
  assert.throws(() => planFromBlueprint({ blueprint: { folderStructure: ['../evil.js'] } }), /unsafe/);
});

test('CRLF files keep their line endings through propose, diff and apply', async () => {
  const { root, pm } = await setup();
  const f = 'server/crlf.js';
  const original = 'const a = 1;\r\nconst b = 2;\r\nmodule.exports = { a, b };\r\n';
  fs.writeFileSync(path.join(root, f), original);
  await pm.scan();
  const rec = await pm.changes.propose({ title: 'x', changes: [{ path: f, operation: 'MODIFY', expectedHash: await hashOf(pm, f), edits: [{ find: 'const b = 2;\nmodule', replace: 'const b = 3;\nmodule' }] }] });
  assert.strictEqual(rec.status, 'PROPOSED');
  assert.ok(rec.files[0].diff.includes('-const b = 2;') && rec.files[0].diff.includes('+const b = 3;'));
  assert.ok(!rec.files[0].diff.includes('\r'), 'diff is shown line-ending neutral');
  assert.strictEqual(rec.files[0].removed, 1, 'only the changed line differs');
  await pm.changes.apply(rec.proposalId, { approve: async () => true, runVerification: false });
  const after = fs.readFileSync(path.join(root, f), 'utf8');
  assert.strictEqual(after, 'const a = 1;\r\nconst b = 3;\r\nmodule.exports = { a, b };\r\n');
  assert.ok(!/[^\r]\n/.test(after), 'no bare LF introduced');
});

test('exclusions are case-insensitive', () => {
  const { compileExclusions } = require('../src/scanner/exclusions');
  const ex = compileExclusions(['node_modules', '*.log', 'Build/out']);
  assert.ok(ex('Node_Modules/x.js') && ex('src/DEBUG.LOG') && ex('build/OUT/a.js'));
  assert.ok(!ex('src/app.js'));
});

test('Windows spawn: shell is used there and unsafe script names are refused', () => {
  const { spawnOptions } = require('../src/changes/verificationManager');
  const ok = { command: 'npm', args: ['run', 'test:unit'] };
  assert.strictEqual(spawnOptions(ok, '/x', 'win32').shell, true);
  assert.strictEqual(spawnOptions(ok, '/x', 'darwin').shell, false);
  assert.strictEqual(spawnOptions({ command: 'npm', args: ['run', 'x & calc'] }, '/x', 'win32'), null, 'shell metacharacters refused on Windows');
  assert.notStrictEqual(spawnOptions({ command: 'npm', args: ['run', 'x & calc'] }, '/x', 'darwin'), null, 'no shell on POSIX so no injection path');
});
