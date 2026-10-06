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
const { portableSegment } = require('../src/utils/fsNames');
const { buildSpec } = require('../src/spec/specBuilder');
const { renderSpec } = require('../src/spec/specRenderer');
const { compareSpecs, matrixText } = require('../src/spec/specComparator');
const { storeSpecComparison } = require('../src/comparison/comparisonManager');
const { analyzeValidation } = require('../src/analyzer/validationAnalyzer');
const { loadScopedSummary, listScopeChoices } = require('../src/comparison/scopedComparator');
const { loadProjectDocuments, PER_DOC_CHARS } = require('../src/comparison/documentationComparator');
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

test('documentation comparison: both projects\' generated documents are loaded, redacted, bounded and diffed', async () => {
  const { root, pm } = await setup();
  const other = tempProject();
  fs.rmSync(path.join(other, 'server/controllers'), { recursive: true });
  const pmB = new ProjectManager({ root: other, config: new ConfigManager() });
  await pmB.load(); await pmB.initialize('Shop B'); await pmB.scan();
  await assert.rejects(loadProjectDocuments(other), /no generated documentation/);
  await pm.documentation.updateAll(); await pmB.documentation.updateAll();
  fs.writeFileSync(path.join(pm.store.dir, 'documentation/notes.md'), `# Notes\nkey: AKIAIOSFODNN7EXAMPLE\n${'x'.repeat(PER_DOC_CHARS + 500)}\n`);
  const [a, b] = [await loadProjectDocuments(root), await loadProjectDocuments(path.join(other, '.ai-project'))]; // picking the .ai-project folder itself works too
  assert.ok(a.documents.some((d) => d.key === 'architecture') && b.documents.some((d) => d.key === 'architecture'));
  assert.strictEqual(a.documents[0].key, 'project-overview', 'overview goes first');
  const notes = a.documents.find((d) => d.key === 'notes');
  assert.ok(notes.truncated && notes.text.length <= PER_DOC_CHARS);
  assert.ok(!notes.text.includes('AKIAIOSFODNN7EXAMPLE'), 'secrets are redacted before leaving VS Code');
  const req = buildComparisonRequest({ kind: 'DOCUMENTATION', summaries: [a, b] });
  assert.strictEqual(req.kind, 'DOCUMENTATION');
  assert.ok(req.structural.pairs[0].documents.onlyA.includes('notes'));
  assert.ok(req.structural.pairs[0].documents.common.includes('architecture'));
  assert.deepStrictEqual(req.structural.coverage[0].truncated, ['notes']);
  const rec = await storeComparison(pm.store, { kind: 'DOCUMENTATION', projects: [a.project, b.project], result: { differences: ['A documents more'], score: 1 } });
  assert.ok(!('score' in rec.result));
});

test('scoped comparison: only the selected files / feature of each project are compared, never the whole project', async () => {
  const { root, pm } = await setup();
  const other = tempProject();
  const pmB = new ProjectManager({ root: other, config: new ConfigManager() });
  await pmB.load(); await pmB.initialize('Shop B'); await pmB.scan();
  await pm.documentation.updateAll(); await pmB.documentation.updateAll();
  const choicesB = await listScopeChoices(path.join(other, '.ai-project')); // picking .ai-project itself works
  assert.ok(choicesB.features.length && choicesB.files.length);
  const a = await loadScopedSummary(root, '.ai-project', { files: ['server/controllers/orderController.js', 'server/services/orderService.js'] });
  const b = await loadScopedSummary(other, '.ai-project', { features: [choicesB.features[0].id] });
  assert.deepStrictEqual(a.files.map((f) => f.path).sort(), ['server/controllers/orderController.js', 'server/services/orderService.js']);
  assert.ok(a.apis.length <= 2 && a.files.every((f) => f.path.startsWith('server/')), 'client files and other server files are excluded');
  assert.ok(!JSON.stringify(a).includes('client/src/components/Checkout.jsx') || a.workflows.every((w) => w.stepsInScope.every((s) => s.file.startsWith('server/'))), 'workflow steps outside the scope are not sent');
  const full = await loadProjectSummary(root);
  assert.ok(a.files.length < full.coverage.filesTotal && a.apis.length < full.apis.length + 1, 'only the picked part, not the whole project');
  assert.ok(!('layers' in a) && !('technologies' in a) && !('features' in a && a.features.length > full.features.length), 'no whole-project sections');
  const req = buildComparisonRequest({ kind: 'FEATURE', summaries: [a, b] });
  assert.strictEqual(req.scopes.length, 2);
  assert.ok(req.structural.pairs[0].symbols && req.structural.scopes[0].files === 2);
  assert.ok(req.projects.every((s) => s.scope));
  await assert.rejects(loadScopedSummary(root, '.ai-project', { files: ['nope.js'] }), /Nothing .* matched/);
  const rec = await storeComparison(pm.store, { kind: 'FEATURE', projects: [a.project, b.project], scopes: req.scopes, result: { differences: ['x'] } });
  assert.ok(rec.scopes[0].files.length === 2);
  assert.match(fs.readFileSync(path.join(pm.store.dir, `comparisons/${rec.comparisonId}.md`), 'utf8'), /Compared parts only/);
});

test('scoped views: architecture, database, features, workflows and dependencies show only the selected part', async () => {
  const { createRpc } = require('../src/ui/rpc');
  const { SelectionState } = require('../src/core/selectionState');
  const { root, pm } = await setup();
  await pm.documentation.updateAll();
  const selection = new SelectionState();
  const rpc = createRpc({ getPm: () => pm, selection, actions: {} }).methods;
  const all = { arch: await rpc.getArchitecture({ scoped: true }), db: await rpc.getDatabase({ scoped: true }), feats: await rpc.getFeatures({ scoped: true }) };
  assert.ok(Object.values(all.arch.architecture.layers).flat().length > 5, 'nothing selected: whole project');
  assert.strictEqual((await rpc.getScope()).active, false);

  selection.set({ folders: ['server/services'] });
  const sc = await rpc.getScope();
  assert.ok(sc.active && sc.files >= 1);
  const arch = await rpc.getArchitecture({ scoped: true });
  const files = Object.values(arch.architecture.layers).flat();
  assert.ok(files.length && files.every((f) => f.startsWith('server/services/')), `only the folder: ${files}`);
  assert.ok(!('client' in arch.architecture.layers) && arch.architecture.scoped);
  const apis = await rpc.getApis({ scoped: true });
  assert.ok(apis.apis.every((a) => a.file.startsWith('server/services/')));
  const db = await rpc.getDatabase({ scoped: true });
  assert.ok(db.queries.length && db.queries.every((q) => q.file.startsWith('server/services/')));
  assert.ok(db.entities.length < all.db.entities.length || all.db.entities.length === db.entities.length);
  const dbAll = await rpc.getDatabase({});
  assert.ok(db.entities.length < dbAll.entities.length, 'unrelated tables are hidden');
  const wf = await rpc.getWorkflows({ scoped: true });
  assert.ok(wf.length >= 1 && wf.every((w) => w.stepsInScope >= 1));
  const deps = await rpc.getDependencies({ scoped: true });
  assert.ok(deps.scoped && deps.files.every((f) => f.startsWith('server/services/')));
  assert.ok(deps.usedByOutside.some((u) => u.path === 'server/controllers/orderController.js'), 'boundary: the controller uses the service');
  const feats = await rpc.getFeatures({ scoped: true });
  assert.ok(feats.every((f) => f.filesInScope >= 1));
  assert.strictEqual((await rpc.getFeatures({})).length >= feats.length, true);
  selection.set({ project: true });
  assert.strictEqual((await rpc.getScope()).active, false, 'entire project selected = no scoping');
  selection.set({ files: ['server/services/orderService.js'] });
  const docs = await rpc.getScopedDocuments();
  assert.ok(Array.isArray(docs));
  const a = await loadScopedSummary(root, '.ai-project', { folders: ['server/services'] });
  assert.ok(a.architecture.layers.service && a.dependencies.usedByOutside >= 1);
});

test('validation analyzer: schema options, Joi/zod, express-validator, class-validator, form attributes and guards', () => {
  const code = `
const s = new Schema({ email: { type: String, required: true, unique: true }, age: { type: Number, min: 18, max: 99 }, nick: { type: String, required: false } });
const schema = Joi.object({ pw: Joi.string().min(8).max(30).required() });
const q = z.object({ qty: z.number().int().positive() });
router.post('/x', body('email').isEmail().normalizeEmail(), h);
class Dto { @IsEmail() @IsNotEmpty() email: string; }
<input name="phone" type="tel" required minLength={7} />
if (!x) throw new Error('Cart is empty');
res.status(400).json({ message: 'Bad qty' });`;
  const v = analyzeValidation(code, 'javascript', false);
  const get = (kind, field) => v.find((x) => x.kind === kind && x.field === field);
  assert.deepStrictEqual(get('schema', 'email').rules, ['required', 'unique']);
  assert.deepStrictEqual(get('schema', 'age').rules, ['min(18)', 'max(99)']);
  assert.ok(!v.some((x) => x.field === 'nick'), 'required:false is not a rule');
  assert.deepStrictEqual(get('joi', 'pw').rules, ['string', 'min(8)', 'max(30)', 'required']);
  assert.ok(get('zod', 'qty').rules.includes('positive'));
  assert.deepStrictEqual(get('express-validator', 'email').rules, ['isEmail', 'normalizeEmail']);
  assert.deepStrictEqual(get('class-validator', 'email').rules, ['IsEmail', 'IsNotEmpty']);
  assert.deepStrictEqual(get('html-form', 'phone').rules, ['type(tel)', 'required', 'minlength(7)']);
  const guards = v.filter((x) => x.kind === 'guard');
  assert.ok(guards.length === 2 && guards.every((g) => g.status === 'INFERRED'));
  assert.deepStrictEqual(analyzeValidation(code, 'javascript', true), [], 'tests are not specifications');
});

test('project specification: one txt with features, database fields, validation, modules; compare two projects; AI answer merges into the record', async () => {
  const { root, pm } = await setup();
  const other = tempProject();
  fs.writeFileSync(path.join(other, 'server/models/Order.js'), fs.readFileSync(path.join(other, 'server/models/Order.js'), 'utf8').replace('total:', "discountCode: { type: String, maxlength: 12 },\n  total:"));
  const pkg = JSON.parse(fs.readFileSync(path.join(other, 'package.json'), 'utf8')); pkg.dependencies.stripe = '^14.0.0'; pkg.dependencies.zod = '^3.0.0';
  fs.writeFileSync(path.join(other, 'package.json'), JSON.stringify(pkg));
  fs.rmSync(path.join(other, 'server/middleware'), { recursive: true });
  const pmB = new ProjectManager({ root: other, config: new ConfigManager() });
  await pmB.load(); await pmB.initialize('Shop B'); await pmB.scan();

  const docs = await pm.documentation.updateAll();
  assert.strictEqual(docs.specExported, true, 'the single file is refreshed together with the documentation');
  const txt = fs.readFileSync(path.join(pm.store.dir, 'exports/project-spec.txt'), 'utf8');
  for (const needle of ['FEATURES', 'DATABASE (TABLES, FIELDS, RELATIONSHIPS)', 'VALIDATION RULES', 'REQUIRED MODULES', 'API ENDPOINTS', 'ENVIRONMENT VARIABLES', 'UNKNOWNS AND GAPS', 'Feature: order', '- email: varchar(255), required, unique', 'POST /api/orders', 'user: required', 'jsonwebtoken ^9.0.0', 'JWT_SECRET']) assert.ok(txt.includes(needle), `spec contains ${needle}`);
  assert.ok(!/process\.env|sk_live|Bearer /.test(txt) && !/function\s+\w+\s*\(/.test(txt), 'no source code or secrets');
  assert.ok(fs.existsSync(path.join(pm.store.dir, 'exports/project-spec.json')));

  const a = await buildSpec(root); const b = await buildSpec(other);
  assert.ok(renderSpec(a).sections.length === 16);
  const m = compareSpecs(a, b);
  const cat = (id) => m.categories.find((c) => c.id === id);
  assert.deepStrictEqual(cat('fields').onlyB.map((x) => x.label), ['Order.discountCode']);
  assert.deepStrictEqual(cat('modules').onlyB.map((x) => x.label), ['zod']);
  assert.ok(cat('modules').different.some((d) => d.label === 'stripe' && /major/.test(d.why)));
  assert.ok(cat('features').common.length === 1 && cat('features').onlyA.length === 0);
  assert.deepStrictEqual(cat('layers').onlyA.map((x) => x.label), ['middleware']);
  assert.ok(m.suggestions.some((s) => s.direction === 'adopt' && s.items.includes('Order.discountCode')));
  assert.ok(m.suggestions.some((s) => s.direction === 'keep') && m.suggestions.some((s) => s.direction === 'review'));
  assert.ok(!JSON.stringify(m).match(/"(score|rank|winner)"/), 'facts only, no ranking');
  assert.match(matrixText(m), /Only in B: Order\.discountCode/);

  const rec = await storeSpecComparison(pm.store, { matrices: [m] });
  assert.strictEqual(rec.kind, 'SPEC'); assert.strictEqual(rec.ai, null);
  assert.ok(fs.existsSync(path.join(pm.store.dir, `comparisons/${rec.comparisonId}.md`)));
  const merged = await storeComparison(pm.store, { kind: 'SPEC', ref: rec.comparisonId, projects: rec.projects, provider: 'chatgpt', result: { differences: ['B adds a discount code'], score: 5 }, conflicts: [] });
  assert.strictEqual(merged.comparisonId, rec.comparisonId);
  const stored = JSON.parse(fs.readFileSync(path.join(pm.store.dir, `comparisons/${rec.comparisonId}.json`), 'utf8'));
  assert.deepStrictEqual(stored.ai.result.differences, ['B adds a discount code']);
  assert.ok(!('score' in stored.ai.result) && stored.matrices.length === 1, 'AI analysis sits beside the computed matrix');
  assert.match(fs.readFileSync(path.join(pm.store.dir, `comparisons/${rec.comparisonId}.md`), 'utf8'), /AI analysis \(chatgpt\)/);
  await assert.rejects(buildSpec(path.join(other, 'server')), /No \.ai-project/);

  // clearing comparisons removes only the reports, so the same projects can be compared again, alone or together
  const { createRpc } = require('../src/ui/rpc');
  const { SelectionState } = require('../src/core/selectionState');
  const rpc = createRpc({ getPm: () => pm, selection: new SelectionState(), actions: {} }).methods;
  const second = await storeSpecComparison(pm.store, { matrices: [m, m] });
  assert.strictEqual((await rpc.getComparisons()).length, 2);
  await assert.rejects(rpc.deleteComparison({ id: '../project' }), /Invalid comparison id/);
  await rpc.deleteComparison({ id: rec.comparisonId });
  assert.deepStrictEqual((await rpc.getComparisons()).map((c) => c.comparisonId), [second.comparisonId]);
  assert.strictEqual(second.matrices.length, 2, 'several projects compared in one record');
  assert.strictEqual((await rpc.clearComparisons()).deleted, 1);
  assert.deepStrictEqual(await rpc.getComparisons(), []);
  assert.ok(fs.existsSync(path.join(pm.store.dir, 'exports/project-spec.txt')) && fs.existsSync(path.join(pm.store.dir, 'project.json')), 'specification and knowledge untouched');

  // blueprints: delete the current one, optionally its earlier versions
  const bpPayload = (purpose) => ({ projects: [a.project], requirements: 'a shop', blueprint: { purpose, technologyStack: {}, architecture: {}, modules: [] } });
  await storeBlueprint(pm.store, bpPayload('v1')); await storeBlueprint(pm.store, bpPayload('v2'));
  assert.strictEqual(await rpc.getBlueprintVersions(), 1);
  assert.deepStrictEqual(await rpc.deleteBlueprint({}), { deleted: true, previousVersionsKept: 1 });
  assert.strictEqual(await rpc.getBlueprint(), null);
  assert.strictEqual(await rpc.getBlueprintVersions(), 1, 'earlier version kept by default');
  await storeBlueprint(pm.store, bpPayload('v3'));
  await rpc.deleteBlueprint({ history: true });
  assert.strictEqual(await rpc.getBlueprint(), null); assert.strictEqual(await rpc.getBlueprintVersions(), 0);
  assert.ok(fs.existsSync(path.join(pm.store.dir, 'exports/project-spec.txt')), 'specification untouched');
});

test('portable file names: names that are illegal on Windows (like <string:param>) are stored safely and read back, on every OS', async () => {
  assert.strictEqual(portableSegment('order'), 'order');
  assert.strictEqual(portableSegment('Order.md'), 'Order.md');
  assert.strictEqual(portableSegment('file name.js'), 'file name.js');
  assert.strictEqual(portableSegment('src__app.js'), 'src__app.js');
  for (const bad of [' <string:param>.json', '<int:id>', 'a:b', 'a?b*c.md', 'con.json', 'aux', 'x.', ' lead', 'q"uote|pipe', 'x'.repeat(300) + '.md']) {
    const good = portableSegment(bad);
    assert.ok(!/[<>:"|?*\u0000-\u001f]/.test(good) && !/[. ]$/.test(good) && !/^\s/.test(good) && good.length <= 130, `${JSON.stringify(bad.slice(0, 20))} -> ${good}`);
    assert.ok(!/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(good), 'not a Windows device name');
    assert.strictEqual(portableSegment(good), good, 'idempotent');
  }
  assert.notStrictEqual(portableSegment('a:b'), portableSegment('a-b'), 'different names never share a file');
  assert.strictEqual(portableSegment('a:b'), portableSegment('a:b'), 'stable');

  const root = tempProject();
  fs.writeFileSync(path.join(root, 'server/app.py'), "from flask import Flask\napp = Flask(__name__)\n\n@app.route('/<string:param>', methods=['GET'])\ndef by_name():\n    return 'x'\n\n@app.route('/<int:id>/items', methods=['GET', 'POST'])\ndef items():\n    return 'y'\n\n@app.route('/orders/<string:order_id>')\ndef order():\n    return 'z'\n");
  const pm = new ProjectManager({ root, config: new ConfigManager() });
  await pm.load(); await pm.initialize('Flask shop'); await pm.scan(); await pm.documentation.updateAll();
  const ids = (await pm.store.readJson('features/index.json')).features.map((f) => f.id);
  assert.ok(ids.includes('order') && ids.every((i) => !/[<>:{}\[\]]/.test(i)), `no parameter-shaped feature ids: ${ids}`);

  // the AI (or an older project) can still hand us an id like this: it must be stored and read back
  await pm.store.writeJson('features/ <string:param>.json', { id: ' <string:param>', name: 'odd', files: [] });
  assert.strictEqual((await pm.store.readJson('features/ <string:param>.json')).name, 'odd');
  await pm.store.writeText('documentation/features/<int:id>.md', '# odd');
  assert.strictEqual(await pm.store.readText('documentation/features/<int:id>.md'), '# odd');

  // invariant: nothing under .ai-project has a name Windows would reject
  const bad = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (/[<>:"|?*]/.test(e.name) || /[. ]$/.test(e.name) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(e.name)) bad.push(path.join(d, e.name)); if (e.isDirectory()) walk(path.join(d, e.name)); } };
  walk(pm.store.dir);
  assert.deepStrictEqual(bad, []);

  if (process.platform !== 'win32') { // a project written before this rule (macOS/Linux) is still readable
    fs.writeFileSync(path.join(pm.store.dir, 'features', 'legacy<x:y>.json'), JSON.stringify({ id: 'legacy', name: 'old' }));
    assert.strictEqual((await pm.store.readJson('features/legacy<x:y>.json')).name, 'old');
  }
});
