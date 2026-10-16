// The module overview stage: manifests in dependency order with their static facts, AI answer verified and stored per module.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ProjectManager } = require('../src/core/projectManager');
const { ConfigManager } = require('../src/config/configManager');
const { createRpc } = require('../src/ui/rpc');
const { SelectionState } = require('../src/core/selectionState');
const FILES = require('./fixtures/odooAddons');
require('../src/utils/logger').setSink(() => {});

const write = (root, files) => { for (const [rel, c] of Object.entries(files)) { const a = path.join(root, rel); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, c); } return root; };
async function open(root) { const pm = new ProjectManager({ root, config: new ConfigManager() }); await pm.load(); if (!pm.project) await pm.initialize('Fleet'); await pm.scan(); return pm; }

const answer = (pm, analysisId) => ({
  packageType: 'KNOWLEDGE_PACKAGE', schemaVersion: '1.0', projectId: pm.project.projectId, analysisId, source: { provider: 'chatgpt', model: 'x' },
  knowledge: {
    files: [],
    modules: [
      { name: 'fleet_ext', purpose: 'Adds fuel logs to vehicles.', howItWorks: 'Extends fleet.vehicle.x with fuel_type and stores fleet.fuel.log records.',
        features: [{ name: 'Fuel log', status: 'VERIFIED', basedOn: ['fleet.fuel.log', 'liters'] }, { name: 'Fuel prices', status: 'VERIFIED', basedOn: ['price feed'] }],
        keyModels: ['fleet.fuel.log'], dependsOn: [{ module: 'fleet_base', why: 'extends its vehicle model' }], claims: [] },
      { name: 'not_a_module', purpose: 'invented', features: [] },
    ],
  },
  evidence: [], unknowns: [],
});

test('MODULES: manifests in dependency order (even against the reading order), each with its facts', async () => {
  const pm = await open(write(fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-mo-')), FILES));
  await pm.config.set('readFirst', ['addons/fleet_ext']);
  const built = await pm.prepareAnalysis({ mode: 'MODULES', selection: { project: true } });
  assert.deepStrictEqual(built.primaryFiles, ['addons/fleet_base/__manifest__.py', 'addons/fleet_ext/__manifest__.py'], 'a dependency is explained before the module that needs it');
  const mods = built.batches.flatMap((b) => b.context.modules || []);
  assert.deepStrictEqual(mods.map((m) => m.name), ['fleet_base', 'fleet_ext']);
  const ext = mods[1];
  assert.deepStrictEqual(ext.dependsOn, ['fleet_base']);
  assert.deepStrictEqual(ext.modelsDefined.map((m) => m.name), ['fleet.fuel.log']);
  assert.deepStrictEqual(ext.modelsExtended.map((m) => [m.name, m.definedIn]), [['fleet.vehicle.x', 'addons/fleet_base']]);
  assert.ok(ext.routes.some((r) => r.includes('/fleet/fuel')));
  assert.ok(!built.batches.some((b) => b.context.files.some((f) => !/__manifest__\.py$/.test(f.path))), 'only manifests are sent, not the code');
});

test('MODULES: answer verified against the facts, stored per module, shown on the Modules page and used by later file runs', async () => {
  const pm = await open(write(fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-mo-')), FILES));
  const before = await pm.campaign.plan({ mode: 'PROJECT', selection: { project: true } });
  assert.deepStrictEqual(before.manifests, ['addons/fleet_base/__manifest__.py', 'addons/fleet_ext/__manifest__.py'], 'a campaign starts with the module overview');
  const rec = await pm.history.create({ projectId: pm.project.projectId, mode: 'MODULES', selection: { files: [] }, files: [], provider: 'chatgpt' });
  const res = await pm.processKnowledgePackage(answer(pm, rec.analysisId));
  assert.strictEqual(res.changes.modulesUpdated, 1);
  assert.ok(res.report.unverified.some((u) => u.kind === 'module' && u.module === 'not_a_module'), 'an invented module is not stored');
  const doc = await pm.store.readJson('modules/addons--fleet_ext.json', null);
  assert.strictEqual(doc.knowledge.purpose.value, 'Adds fuel logs to vehicles.');
  assert.strictEqual(doc.manifestFile, 'addons/fleet_ext/__manifest__.py');
  const st = Object.fromEntries(doc.knowledge.features.map((f) => [f.name, f.status]));
  assert.deepStrictEqual(st, { 'Fuel log': 'VERIFIED', 'Fuel prices': 'INFERRED' }, 'VERIFIED only when based on something the code really has');

  const rpc = createRpc({ getPm: () => pm, selection: new SelectionState(), actions: {} }).methods;
  const ext = (await rpc.getModules()).modules.find((m) => m.name === 'fleet_ext');
  assert.strictEqual(ext.aiPurpose, 'Adds fuel logs to vehicles.');
  assert.strictEqual(ext.overview.features.length, 2);
  assert.strictEqual(ext.overview.outdated, false);

  const after = await pm.campaign.plan({ mode: 'PROJECT', selection: { project: true } });
  assert.deepStrictEqual(after.manifests, ['addons/fleet_base/__manifest__.py'], 'modules already explained are not sent again');
  const ek = await pm.existingKnowledgeFor({ pinnedFiles: ['addons/fleet_ext/models/ext.py'] });
  assert.strictEqual(ek.modules.fleet_ext.purpose, 'Adds fuel logs to vehicles.');

  // the manifest changes: the overview is outdated and the next campaign explains it again
  fs.appendFileSync(path.join(pm.root, 'addons/fleet_ext/__manifest__.py'), '\n');
  await pm.scan();
  assert.strictEqual((await rpc.getModules()).modules.find((m) => m.name === 'fleet_ext').overview.outdated, true);
  assert.ok((await pm.campaign.plan({ mode: 'PROJECT', selection: { project: true } })).manifests.includes('addons/fleet_ext/__manifest__.py'));
});

test('additional prompt: travels with every analysis batch', async () => {
  const pm = await open(write(fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-mo-')), FILES));
  await pm.config.set('additionalPrompt', '  Focus on fuel costs.  ');
  const built = await pm.prepareAnalysis({ mode: 'MODULES', selection: { project: true } });
  assert.ok(built.batches.every((b) => b.context.analysis.additionalInstructions === 'Focus on fuel costs.'));
  await pm.config.set('additionalPrompt', '');
  const plain = await pm.prepareAnalysis({ mode: 'MODULES', selection: { project: true } });
  assert.strictEqual(plain.batches[0].context.analysis.additionalInstructions, undefined);
});

test('compare: module features from the AI overview are in the spec and matched across projects; database is part of the stack', async () => {
  const { buildSpec } = require('../src/spec/specBuilder');
  const { renderSpec } = require('../src/spec/specRenderer');
  const { compareSpecs } = require('../src/spec/specComparator');
  const mk = async (feats) => {
    const pm = await open(write(fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-mo-')), FILES));
    const rec = await pm.history.create({ projectId: pm.project.projectId, mode: 'MODULES', selection: { files: [] }, files: [], provider: 'chatgpt' });
    const pkg = answer(pm, rec.analysisId);
    pkg.knowledge.modules[0].features = feats.map((name) => ({ name, status: 'INFERRED' }));
    await pm.processKnowledgePackage(pkg);
    return buildSpec(pm.root, '.ai-project');
  };
  const a = await mk(['Fuel log', 'Discount on fuel']);
  const b = await mk(['Fuel logs']);
  const ext = a.modules.find((m) => m.name === 'fleet_ext');
  assert.strictEqual(ext.purpose, 'Adds fuel logs to vehicles.');
  assert.strictEqual(ext.purposeSource, 'AI');
  assert.match(renderSpec(a).text, /Features \(AI overview\): Fuel log \[INFERRED\]/);
  const cat = compareSpecs(a, b).categories.find((c) => c.id === 'moduleFeatures');
  assert.deepStrictEqual(cat.common.map((x) => x.label), ['Fuel log (fleet_ext)'], 'singular/plural match');
  assert.deepStrictEqual(cat.onlyA.map((x) => x.label), ['Discount on fuel (fleet_ext)']);
});
