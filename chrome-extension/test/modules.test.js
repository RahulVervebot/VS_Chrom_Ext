import test from 'node:test';
import assert from 'node:assert';
import { validateBatchKnowledge, validateOutboundPackage } from '../src/knowledge/schemaValidator.js';
import { sanitizeKnowledge } from '../src/knowledge/sanitizer.js';
import { mergeKnowledge } from '../src/knowledge/knowledgeMerger.js';
import { buildBatchPrompt } from '../src/ai/promptBuilder.js';
import { splitBatch } from '../src/batching/batchManager.js';

const mf = (dir) => ({ path: `${dir}/__manifest__.py`, hash: 'h', language: 'python', content: "{'name': 'X', 'depends': ['base']}" });
const batch = {
  analysisId: 'a1', batchId: 'batch-001', batchNumber: 1, totalBatches: 1,
  context: { analysis: { mode: 'MODULES' }, files: [mf('addons/pos'), mf('addons/sale')], symbols: [], dependencies: [], apis: [], modules: [{ name: 'pos', path: 'addons/pos', modelsDefined: [{ name: 'pos.order' }] }, { name: 'sale', path: 'addons/sale' }] },
};

test('MODULES prompt: the overview task, the module facts and the "modules" schema', () => {
  const p = buildBatchPrompt(batch, {});
  assert.match(p, /TASK: MODULE OVERVIEW/);
  assert.match(p, /"modules":\[\{"name":"pos"/);
  assert.match(p, /"howItWorks"/);
});

test('modules answers: validated, cleaned, merged; a batch split keeps each module with its manifest', () => {
  const raw = { analysisType: 'MODULES', modules: [{ name: 'pos', purpose: 'Point of sale', features: ['Discount', { name: 'Hold order', status: 'MAYBE', basedOn: 'pos.order.hold' }, { nope: 1 }], dependsOn: ['base', { module: 'stock', why: { reason: 'pickings' } }], keyModels: 'pos.order' }] };
  assert.ok(validateBatchKnowledge(raw).valid === false, 'an invalid feature status is reported (the AI is asked to correct it)');
  const { knowledge } = sanitizeKnowledge(raw, batch.context.files);
  const m = knowledge.modules[0];
  assert.deepStrictEqual(m.features.map((f) => [f.name, f.status]), [['Discount', 'INFERRED'], ['Hold order', 'INFERRED']]);
  assert.deepStrictEqual(m.features[1].basedOn, ['pos.order.hold']);
  assert.deepStrictEqual(m.dependsOn, [{ module: 'base' }, { module: 'stock', why: 'pickings' }]);
  assert.deepStrictEqual(m.keyModels, ['pos.order']);
  assert.ok(validateBatchKnowledge(knowledge).valid);
  const merged = mergeKnowledge([knowledge, { modules: [{ name: 'pos', howItWorks: 'Orders are pos.order records.', features: [{ name: 'discount', status: 'VERIFIED' }] }, { name: 'sale', purpose: 'Sales' }] }]).knowledge;
  assert.deepStrictEqual(merged.modules.map((x) => x.name), ['pos', 'sale']);
  assert.strictEqual(merged.modules[0].purpose, 'Point of sale');
  assert.strictEqual(merged.modules[0].howItWorks, 'Orders are pos.order records.');
  assert.strictEqual(merged.modules[0].features.length, 2, 'features are merged by name (case-insensitive)');
  const pkg = { packageType: 'KNOWLEDGE_PACKAGE', schemaVersion: '1.0', projectId: 'p', analysisId: 'a1', source: { provider: 'chatgpt' }, knowledge: merged };
  assert.ok(validateOutboundPackage(pkg).valid, JSON.stringify(validateOutboundPackage(pkg).errors));
  const [a, b] = splitBatch(batch);
  assert.deepStrictEqual([a.context.modules.map((x) => x.name), b.context.modules.map((x) => x.name)], [['pos'], ['sale']]);
});

test('additional prompt: in analysis, comparison, blueprint and documentation prompts, after the rules', async () => {
  const { comparisonPrompt, FOCUS } = await import('../src/comparison/projectComparator.js');
  const { blueprintPrompt } = await import('../src/comparison/blueprintBuilder.js');
  const { buildDocumentationPrompt } = await import('../src/documentation/documentationManager.js');
  const say = 'Explain like a shop owner.';
  const a = buildBatchPrompt({ ...batch, context: { ...batch.context, analysis: { mode: 'MODULES', additionalInstructions: say } } }, {});
  assert.ok(a.indexOf(say) > a.indexOf('RULES (follow exactly)'));
  for (const p of [comparisonPrompt({ kind: 'PROJECT', projects: [], additionalInstructions: say }, FOCUS.PROJECT), blueprintPrompt({ requirements: 'x', projects: [], additionalInstructions: say }), buildDocumentationPrompt({ key: 'k', additionalInstructions: say })]) assert.match(p, /ADDITIONAL INSTRUCTIONS FROM THE USER[\s\S]*shop owner/);
  assert.doesNotMatch(buildBatchPrompt(batch, {}), /ADDITIONAL INSTRUCTIONS/);
});

test('comparison "which is better": asked only when requested, kept per area with reasons, never a score', async () => {
  const { comparisonPrompt, validateComparison, FOCUS } = await import('../src/comparison/projectComparator.js');
  assert.match(comparisonPrompt({ kind: 'SPEC', projects: [], assess: true }, FOCUS.SPEC), /ASSESSMENT:[\s\S]*No numeric scores/);
  assert.match(comparisonPrompt({ kind: 'SPEC', projects: [] }, FOCUS.SPEC), /Do not score, rank or declare a winner/);
  const v = validateComparison({ differences: ['POS has discounts'], assessment: [{ area: 'Discounts', verdict: 'Shop A', reasons: 'manual discount popup', score: 9 }, { nope: 1 }], summary: 'A fits retail.', overallScore: 7 });
  assert.ok(v.ok);
  assert.deepStrictEqual(v.result.assessment, [{ area: 'Discounts', verdict: 'Shop A', reasons: ['manual discount popup'], tradeoffs: [], basedOn: [] }]);
  assert.strictEqual(v.result.summary, 'A fits retail.');
  assert.strictEqual(v.result.overallScore, undefined);
});
