// Sub-project (module / add-on) summaries, and upgrading a project that was analysed with an older version.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProjectManager } = require('../src/core/projectManager');
const { ConfigManager } = require('../src/config/configManager');
const { createRpc } = require('../src/ui/rpc');
const { SelectionState } = require('../src/core/selectionState');
const { buildSpec } = require('../src/spec/specBuilder');
const { renderSpec } = require('../src/spec/specRenderer');
const { compareSpecs } = require('../src/spec/specComparator');
const { tempProject } = require('./helpers');
const FILES = require('./fixtures/odooAddons');
require('../src/utils/logger').setSink(() => {});

const write = (root, files) => { for (const [rel, c] of Object.entries(files)) { const a = path.join(root, rel); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, c); } return root; };
const odooProject = () => write(fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-odoo-')), FILES);
async function open(root, name = 'Fleet') { const pm = new ProjectManager({ root, config: new ConfigManager() }); await pm.load(); if (!pm.project) await pm.initialize(name); await pm.scan(); return pm; }
const rpcOf = (pm) => createRpc({ getPm: () => pm, selection: new SelectionState(), actions: {} }).methods;

test('each Odoo add-on gets its own summary: purpose, models defined vs extended, routes, views, menus, security, dependencies', async () => {
  const pm = await open(odooProject());
  const { modules } = await rpcOf(pm).getModules();
  const base = modules.find((m) => m.name === 'fleet_base'); const ext = modules.find((m) => m.name === 'fleet_ext');
  assert.ok(base && ext);
  assert.strictEqual(base.title, 'Fleet Base'); assert.strictEqual(base.manifest.summary, 'Vehicles and drivers'); assert.strictEqual(base.manifest.category, 'Operations');
  assert.deepStrictEqual(base.manifestDepends, ['base', 'mail']);
  assert.deepStrictEqual(base.models.defines.map((x) => x.name), ['fleet.vehicle.x']);
  assert.deepStrictEqual(base.models.defines[0].fields, ['name', 'plate', 'driver_id']);
  assert.deepStrictEqual(base.models.defines[0].inherits, ['mail.thread']);
  assert.deepStrictEqual(ext.models.defines.map((x) => x.name), ['fleet.fuel.log']);
  assert.deepStrictEqual(ext.models.extends.map((x) => [x.name, x.fieldsAdded, x.definedIn]), [['fleet.vehicle.x', ['fuel_type'], 'addons/fleet_base']], 'an extension knows which add-on owns the model');
  assert.deepStrictEqual(ext.routes.map((r) => `${r.method} ${r.endpoint} ${r.protected}`), ['ANY /fleet/fuel/:param true']);
  assert.deepStrictEqual(base.odoo.views.map((v) => `${v.id}:${v.type}`), ['view_vehicle_form:form', 'view_vehicle_tree:list']);
  assert.deepStrictEqual(ext.odoo.views.map((v) => v.type), ['inherits fleet_base.view_vehicle_form']);
  assert.deepStrictEqual(base.odoo.menus.map((x) => [x.id, x.parent, x.action]), [['menu_fleet_root', null, null], ['menu_vehicle', 'menu_fleet_root', 'action_vehicle']]);
  assert.deepStrictEqual(base.odoo.actions.map((x) => [x.id, x.model]), [['action_vehicle', 'fleet.vehicle.x']]);
  assert.deepStrictEqual(base.odoo.accessRules.map((r) => [r.modelGuess, r.group, r.permissions]), [['fleet.vehicle.x', 'base.group_user', 'rwc-']]);
  assert.deepStrictEqual(base.odoo.groups.map((g) => g.name), ['Fleet Manager']);
  assert.deepStrictEqual(base.odoo.recordRules.map((r) => r.id), ['rule_own']);
  assert.deepStrictEqual(base.odoo.missingDataFiles, ['views/missing.xml'], 'a data file listed in the manifest but missing is reported');
  assert.deepStrictEqual(ext.uses.map((u) => [u.module, u.imports, u.extendsModels]), [['addons/fleet_base', 1, ['fleet.vehicle.x']]], 'odoo.addons imports and model extensions are dependencies');
  assert.deepStrictEqual(base.usedBy.map((u) => u.module), ['addons/fleet_ext']);
  assert.ok(base.validation.rules >= 3 && base.coverage.total === 4 && base.coverage.analyzed === 0);
  assert.strictEqual(base.aiPurpose, null, 'no AI description until it is analysed');

  const spec = await buildSpec(pm.root);
  const text = renderSpec(spec).text;
  assert.match(text, /Module: fleet_base \(Fleet Base\)/);
  assert.match(text, /Purpose: Vehicles and drivers \[from the manifest\]/);
  assert.match(text, /Models extended: fleet\.vehicle\.x \(\+ fuel_type; defined in fleet_base\)/);
  assert.match(text, /Access rules: fleet\.vehicle\.x base\.group_user rwc-/);
  const other = await open(write(fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-odoo-')), { ...FILES, 'addons/fleet_ext/models/ext.py': FILES['addons/fleet_ext/models/ext.py'].replace("    fuel_type = fields.Selection([('d', 'Diesel')], default='d')\n", "    fuel_type = fields.Selection([('d', 'Diesel')], default='d')\n    odometer = fields.Float()\n") }), 'Fleet 2');
  const m = compareSpecs(spec, await buildSpec(other.root));
  const mm = m.categories.find((c) => c.id === 'moduleModels');
  assert.ok(mm.common.some((x) => x.label === 'fleet_base: fleet.vehicle.x'), 'add-ons are compared model by model');
  assert.ok(mm.common.some((x) => x.label === 'fleet_ext: extends fleet.vehicle.x'), 'and by the models each add-on extends');
});

test('upgrading: a project analysed with an older version keeps its knowledge and partial runs, and gets the new module data automatically', async () => {
  const root = odooProject();
  const old = await open(root);
  // knowledge from earlier AI runs
  const files = await old.knowledge.getFiles();
  const done = files.filter((f) => f.path.startsWith('addons/fleet_base/') && f.isSource).map((f) => ({ path: f.path, hash: f.hash, status: 'ANALYZED' }));
  const partial = files.filter((f) => f.path.startsWith('addons/fleet_ext/models')).map((f) => ({ path: f.path, hash: f.hash, status: 'PARTIAL' }));
  await old.knowledge.markAnalyzed('analysis-001', [...done, ...partial]);
  await old.store.writeJson('features/fleet-base.json', { ...(await old.store.readJson('features/fleet-base.json')), knowledge: { purpose: 'Keeps the company vehicles and who drives them.' } });
  // an interrupted run recorded by an older version (no pinned file list, no campaign)
  const legacy = await old.history.create({ projectId: old.project.projectId, mode: 'FOLDER', selection: { files: [], folders: ['addons/fleet_ext'], features: [], workflows: [] }, files: [], provider: 'chatgpt' });
  await old.history.update(legacy.analysisId, { status: 'DISCONNECTED', batches: [{ batchId: 'batch-001', files: [] }] });
  // what an older version left on disk: cache entries without a revision, no module index
  const cache = await old.store.readJson('index/analysis-cache.json');
  for (const e of Object.values(cache.entries)) { delete e.analysis.rev; }
  await old.store.writeJson('index/analysis-cache.json', cache);
  fs.rmSync(path.join(old.store.dir, 'index/modules.json'));
  const knowledgeBefore = fs.readdirSync(path.join(old.store.dir, 'documentation')).sort();

  // the updated version opens the same folder
  const pm = new ProjectManager({ root, config: new ConfigManager() });
  await pm.load();
  const { modules } = await rpcOf(pm).getModules(); // creates the module data on first use
  assert.strictEqual(modules.length, 2);
  const base = modules.find((m) => m.name === 'fleet_base');
  assert.strictEqual(base.coverage.percent, 100, 'files analysed before the update still count as analysed');
  assert.strictEqual(base.aiPurpose, 'Keeps the company vehicles and who drives them.', 'the AI description from before the update is shown');
  const after = new Map((await pm.knowledge.getFiles()).map((f) => [f.path, f.status]));
  for (const f of done) assert.strictEqual(after.get(f.path), 'ANALYZED');
  for (const f of partial) assert.strictEqual(after.get(f.path), 'PARTIAL', 'partial knowledge stays partial (and is picked up again by the next run)');
  assert.ok(Object.values((await pm.store.readJson('index/analysis-cache.json')).entries).every((e) => e.analysis.rev === require('../src/analyzer/fileAnalyzer').ANALYZER_REV), 'old cached analyses were refreshed once');
  assert.deepStrictEqual(fs.readdirSync(path.join(pm.store.dir, 'documentation')).sort(), knowledgeBefore, 'stored knowledge and documents are untouched');
  // the interrupted run from before the update can still be resumed, and new runs continue with what is not analysed
  assert.ok((await pm.history.resumableByUser()).some((r) => r.analysisId === legacy.analysisId));
  const rebuilt = await pm.prepareAnalysis({ mode: 'FOLDER', selection: (await pm.history.get(legacy.analysisId)).selection, reanalyze: true });
  assert.ok(rebuilt.primaryFiles.length >= 1, 'the legacy run rebuilds its batches');
  const next = await pm.prepareAnalysis({ mode: 'PROJECT', selection: { project: true } });
  assert.ok(next.primaryFiles.every((p) => after.get(p) !== 'ANALYZED'), 'a new run skips what was analysed before the update');
  assert.ok(next.primaryFiles.some((p) => after.get(p) === 'PARTIAL'), 'and includes the partially analysed files');
  assert.strictEqual(await pm.campaign.get(), null);
});

test('a project without sub-projects shows none and nothing else changes', async () => {
  const pm = await open(tempProject(), 'Shop');
  const r = await rpcOf(pm).getModules();
  assert.deepStrictEqual(r.modules, []);
  assert.match(renderSpec(await buildSpec(pm.root)).text, /single project: no sub-projects detected/);
});
