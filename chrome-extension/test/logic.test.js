import test from 'node:test';
import assert from 'node:assert';
import { parseAiResponse, findJsonObjects, looksTruncated, parseAnyJson } from '../src/ai/responseParser.js';
import { validateBatchKnowledge, validateOutboundPackage } from '../src/knowledge/schemaValidator.js';
import { sanitizeKnowledge } from '../src/knowledge/sanitizer.js';
import { mergeKnowledge, mergeClaims } from '../src/knowledge/knowledgeMerger.js';
import { redactText } from '../src/utils/secrets.js';
import { applyLimits, splitBatch } from '../src/batching/batchManager.js';
import { classifyProblem } from '../src/batching/limitDetector.js';
import { buildBatchPrompt, buildCorrectionPrompt } from '../src/ai/promptBuilder.js';
import { CONTEXT_BEGIN, CONTEXT_END } from '../src/ai/contextBuilder.js';
import { validateComparison, strip } from '../src/comparison/projectComparator.js';
import { validateBlueprint } from '../src/comparison/blueprintBuilder.js';
import { createMessage, parseMessage } from '../src/bridge/bridgeProtocol.js';

const good = { analysisType: 'FILE', files: [{ path: 'a.js', purpose: 'p', claims: [{ claim: 'x', status: 'VERIFIED', evidence: [{ file: 'a.js', symbol: 'f', lineStart: 1, lineEnd: 2 }] }] }] };
const batchOf = (files, extra = {}) => ({ analysisId: 'analysis-001', batchId: 'batch-001', batchNumber: 1, totalBatches: 1, purpose: 'x', selection: {}, previousContextReference: null, context: { project: { projectId: 'p', name: 'n' }, projectOverview: {}, analysis: { mode: 'FILE', purpose: 'test', intent: 'UNDERSTAND' }, files, symbols: files.flatMap((f) => (f.symbols || []).map((s) => ({ ...s, file: f.path }))), dependencies: [], apis: [], clientApiCalls: [], database: {}, workflows: [], features: [], existingKnowledge: {}, crossBatch: {} }, ...extra });
const file = (p, content = 'line1\nline2') => ({ path: p, hash: `sha256:${p}`, language: 'javascript', content, symbols: [], imports: [], exports: [], dependencies: [], dependents: [], relation: 'selected' });

test('parser: fenced JSON, bare JSON, prose around it, code blocks preferred', () => {
  const fenced = 'Sure!\n```json\n' + JSON.stringify(good) + '\n```\nHope that helps';
  assert.ok(parseAiResponse(fenced).ok);
  assert.ok(parseAiResponse(JSON.stringify(good)).ok);
  assert.ok(parseAiResponse({ text: 'Copy code\njson\n{broken', codeBlocks: [JSON.stringify(good)] }).ok);
  assert.ok(parseAiResponse('prefix {"note": {"a":1}} then ' + JSON.stringify(good)).ok, 'skips valid JSON that has no expected sections');
});

test('parser: rejects malformed, wrong-schema and free text, reports truncation', () => {
  assert.strictEqual(parseAiResponse('I could not analyze that.').ok, false);
  const bad = parseAiResponse('```json\n{"files":[{"path":"a.js","claims":[{"claim":"x","status":"MAYBE"}]}]}\n```');
  assert.strictEqual(bad.ok, false);
  assert.match(bad.errors.join(), /status/);
  const cut = parseAiResponse('```json\n{"files":[{"path":"a.js","purpose":"long');
  assert.strictEqual(cut.ok, false);
  assert.strictEqual(cut.truncated, true);
  assert.match(cut.errors.join(), /cut off/);
  assert.strictEqual(looksTruncated('{"a": {"b": 1}'), true);
  assert.strictEqual(looksTruncated('{"a": "}"}'), false, 'braces inside strings are ignored');
  assert.deepStrictEqual(findJsonObjects('{"a":"}{"} x {"b":1}').length, 2);
});

test('schema: accepts good knowledge, rejects bad evidence and empty responses', () => {
  assert.ok(validateBatchKnowledge(good).valid);
  assert.strictEqual(validateBatchKnowledge({}).valid, false);
  assert.strictEqual(validateBatchKnowledge({ files: [{ path: 'a.js', claims: [{ claim: 'x', status: 'VERIFIED', evidence: [{ file: 'a.js', lineStart: 0 }] }] }] }).valid, false);
  assert.strictEqual(validateBatchKnowledge({ changeProposal: { title: 't', changes: [{ path: 'a', operation: 'RENAME' }] } }).valid, false);
  assert.strictEqual(validateOutboundPackage({ packageType: 'KNOWLEDGE_PACKAGE', schemaVersion: '1.0', projectId: 'p', analysisId: 'a', source: { provider: 'x' }, knowledge: { files: [] } }).valid, true);
  assert.strictEqual(validateOutboundPackage({ packageType: 'KNOWLEDGE_PACKAGE' }).valid, false);
});

test('sanitizer: injects hashes, drops foreign paths, downgrades unsupported VERIFIED', () => {
  const k = { files: [{ path: 'a.js', sha256: 'sha256:FORGED', claims: [{ claim: 'has ev', status: 'VERIFIED', evidence: [{ file: 'a.js', symbol: 'f', lineStart: 1 }] }, { claim: 'no ev', status: 'VERIFIED', evidence: [] }, { claim: 'foreign ev', status: 'VERIFIED', evidence: [{ file: 'secret/other.js' }] }] }, { path: 'not-in-batch.js', claims: [] }], features: [{ id: 'f', files: ['a.js', 'zzz.js'] }], changeProposal: { title: 't', changes: [{ path: 'a.js', operation: 'MODIFY', edits: [] }, { path: 'zzz.js', operation: 'MODIFY', edits: [] }, { path: 'new.js', operation: 'CREATE', newContent: 'x' }] } };
  const { knowledge, notes } = sanitizeKnowledge(k, [{ path: 'a.js', hash: 'sha256:REAL' }]);
  assert.strictEqual(knowledge.files.length, 1);
  assert.strictEqual(knowledge.files[0].sha256, 'sha256:REAL', 'hash comes from the batch, not the AI');
  const st = Object.fromEntries(knowledge.files[0].claims.map((c) => [c.claim, c.status]));
  assert.deepStrictEqual(st, { 'has ev': 'VERIFIED', 'no ev': 'INFERRED', 'foreign ev': 'INFERRED' });
  assert.strictEqual(knowledge.files[0].claims[0].evidence[0].sha256, 'sha256:REAL');
  assert.deepStrictEqual(knowledge.features[0].files, ['a.js']);
  assert.deepStrictEqual(knowledge.changeProposal.changes.map((c) => c.path), ['a.js', 'new.js']);
  assert.strictEqual(knowledge.changeProposal.changes[0].expectedHash, 'sha256:REAL');
  assert.ok(notes.length >= 3);
  assert.ok(knowledge.unknowns.some((u) => u.startsWith('NOTE:')));
});

test('merger: unions batches without upgrading claim status', () => {
  const a = { files: [{ path: 'a.js', purpose: 'first', claims: [{ claim: 'c', status: 'INFERRED', evidence: [] }] }], workflows: [{ id: 'w', steps: [{ file: 'a.js', symbol: 'f', kind: 'service' }] }], database: { entities: [{ name: 'orders', fields: [{ name: 'id' }] }] }, unknowns: ['u1'] };
  const b = { files: [{ path: 'a.js', purpose: 'second', claims: [{ claim: 'c', status: 'VERIFIED', evidence: [{ file: 'a.js' }] }, { claim: 'd', status: 'UNKNOWN' }] }, { path: 'b.js' }], workflows: [{ id: 'w', steps: [{ file: 'b.js', symbol: 'g', kind: 'db-write' }] }], database: { entities: [{ name: 'orders', fields: [{ name: 'total' }] }], relationships: [{ from: 'a', to: 'b' }] }, unknowns: ['u1', 'u2'], changeProposal: { title: 't', changes: [{ path: 'a.js', operation: 'MODIFY' }] } };
  const m = mergeKnowledge([a, b]);
  assert.deepStrictEqual(m.knowledge.files.map((f) => f.path), ['a.js', 'b.js']);
  assert.strictEqual(m.knowledge.files[0].purpose, 'first', 'first non-empty purpose kept');
  assert.strictEqual(m.knowledge.files[0].claims.find((c) => c.claim === 'c').status, 'VERIFIED');
  assert.strictEqual(m.knowledge.workflows[0].steps.length, 2);
  assert.deepStrictEqual(m.knowledge.database.entities[0].fields.map((f) => f.name), ['id', 'total']);
  assert.deepStrictEqual(m.unknowns, ['u1', 'u2']);
  assert.strictEqual(m.changeProposals.length, 1);
  assert.strictEqual(mergeClaims([{ claim: 'x', status: 'VERIFIED', evidence: [] }], [{ claim: 'x', status: 'INFERRED' }])[0].status, 'VERIFIED');
});

test('secrets: final redaction never leaves values behind', () => {
  const src = 'const k = "sk_live_abcdefghijklmnopqrstuvwx"; db = "postgres://u:hunter2pass@h/db"; password = "topsecret1"; ok = 1; token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk';
  const { text, findings } = redactText(src);
  for (const leak of ['sk_live_', 'hunter2pass', 'topsecret1', 'eyJhbGci']) assert.ok(!text.includes(leak), leak);
  assert.ok(findings.length >= 3);
  assert.ok(text.includes('ok = 1'));
});

test('batching: limits truncate, splitting keeps per-file data', () => {
  const big = file('big.js', Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n'));
  const { batch, warnings } = applyLimits(batchOf([big, file('b.js'), file('c.js')]), { maxFilesPerRequest: 2, maxLinesPerFile: 10, maxTotalLines: 100 });
  assert.strictEqual(batch.context.files.length, 2);
  assert.match(batch.context.files[0].content, /TRUNCATED/);
  assert.ok(warnings.some((w) => /maxFilesPerRequest/.test(w)) && warnings.some((w) => /truncated to 10/.test(w)));
  const parts = splitBatch(batchOf([file('a.js'), file('b.js'), file('c.js')]));
  assert.deepStrictEqual(parts.map((p) => p.batchId), ['batch-001a', 'batch-001b']);
  assert.deepStrictEqual(parts.map((p) => p.context.files.length), [2, 1]);
  assert.strictEqual(splitBatch(batchOf([file('a.js')])), null);
});

test('limit detector classifies provider messages', () => {
  assert.strictEqual(classifyProblem("You've reached the current usage cap for GPT-5"), 'LIMIT');
  assert.strictEqual(classifyProblem('Your message is too long'), 'CONTEXT_TOO_LARGE');
  assert.strictEqual(classifyProblem('Please log in to continue'), 'LOGIN');
  assert.strictEqual(classifyProblem('Something went wrong. Please try again'), 'NETWORK');
  assert.strictEqual(classifyProblem('Here is your analysis'), null);
});

test('prompt: specialized per mode, carries rules, context markers and numbered lines; never the generic prompt', () => {
  const b = batchOf([file('a.js', 'const a = 1;\nconst b = 2;')]);
  const p = buildBatchPrompt(b, { previousFindings: {} });
  assert.ok(p.includes('Never invent'));
  assert.ok(p.includes(CONTEXT_BEGIN) && p.includes(CONTEXT_END));
  assert.ok(p.includes('=== FILE: a.js | sha256:a.js | javascript ==='));
  assert.ok(p.includes('   1| const a = 1;'));
  assert.ok(/FILE ANALYSIS/.test(p));
  b.context.analysis.mode = 'WORKFLOW';
  assert.ok(/What starts this workflow/.test(buildBatchPrompt(b, {})));
  b.context.analysis.mode = 'DATABASE';
  assert.ok(/Primary keys|primary keys/.test(buildBatchPrompt(b, {})));
  b.context.analysis.intent = 'CHANGE_PLAN';
  assert.ok(/changeProposal/.test(buildBatchPrompt(b, {})));
  assert.ok(/cut off/.test(buildCorrectionPrompt(['x'], true)));
  assert.ok(!/document this code/i.test(p));
});

test('comparison and blueprint validation strip scores and require content', () => {
  assert.deepStrictEqual(strip({ a: 1, score: 9, nested: { winner: 'A', keep: 1 } }), { a: 1, nested: { keep: 1 } });
  const r = validateComparison({ commonApproaches: ['REST'], score: 10, ranking: [1] });
  assert.ok(r.ok && !('score' in r.result));
  assert.strictEqual(validateComparison({}).ok, false);
  assert.strictEqual(validateBlueprint({ purpose: 'x' }).ok, false);
  assert.ok(validateBlueprint({ purpose: 'x', technologyStack: 1, architecture: 1, modules: 1, secretThing: 'dropped' }).ok);
});

test('protocol envelope round trip and version check', () => {
  const m = createMessage('PING', { payload: { nonce: 'n' } });
  assert.ok(parseMessage(JSON.stringify(m)).ok);
  assert.strictEqual(parseMessage(JSON.stringify({ ...m, protocolVersion: '2.0' })).ok, false);
  assert.strictEqual(parseMessage('nope').ok, false);
  assert.throws(() => createMessage('NOT_A_TYPE'));
});

test('documentation comparison prompt carries both projects\' documents and the no-ranking rules', async () => {
  const { comparisonPrompt, FOCUS, validateComparison } = await import('../src/comparison/projectComparator.js');
  const p = { kind: 'DOCUMENTATION', projects: [{ project: { name: 'A' }, documents: [{ key: 'architecture', text: 'A arch' }] }, { project: { name: 'B' }, documents: [{ key: 'architecture', text: 'B arch' }] }], structural: { pairs: [] }, selection: [] };
  const prompt = comparisonPrompt(p, FOCUS.DOCUMENTATION);
  assert.ok(prompt.includes('A arch') && prompt.includes('B arch') && /Do not score, rank/.test(prompt));
  assert.strictEqual(validateComparison({ differences: ['x'], ranking: [1] }).result.ranking, undefined);
});

test('scoped comparison prompt tells the AI to compare only the picked parts', async () => {
  const { comparisonPrompt, FOCUS } = await import('../src/comparison/projectComparator.js');
  const scoped = comparisonPrompt({ kind: 'FEATURE', scopes: [{ project: 'A', label: 'feature order', files: ['a.js'] }], projects: [], structural: {}, selection: [] }, FOCUS.FEATURE);
  assert.ok(/SCOPE RULE/.test(scoped) && scoped.includes('feature order'));
  assert.ok(!/SCOPE RULE/.test(comparisonPrompt({ kind: 'PROJECT', projects: [], structural: {}, selection: [] }, FOCUS.PROJECT)));
});

test('spec comparison and blueprint prompts carry the specifications, the computed differences and the no-ranking rules', async () => {
  const { comparisonPrompt, FOCUS } = await import('../src/comparison/projectComparator.js');
  const { blueprintPrompt } = await import('../src/comparison/blueprintBuilder.js');
  const p = comparisonPrompt({ kind: 'SPEC', ref: 'comparison-007', projects: [{ project: { name: 'A' }, specText: 'SPEC-A-TEXT' }, { project: { name: 'B' }, specText: 'SPEC-B-TEXT' }], structural: { comparisonText: 'Only in B: zod' }, selection: [] }, FOCUS.SPEC);
  assert.ok(p.includes('SPEC-A-TEXT') && p.includes('SPEC-B-TEXT') && p.includes('Only in B: zod') && p.includes('comparison-007') && /Do not score, rank/.test(p) && /adopting/.test(p));
  const b = blueprintPrompt({ requirements: 'a shop', projects: [], specs: [{ project: 'A', specText: 'SPEC-A-TEXT' }], gaps: [{ direction: 'adopt', title: 'x', items: ['zod'] }] });
  assert.ok(b.includes('SPEC-A-TEXT') && b.includes('GAPS BETWEEN THE PROJECTS') && b.includes('"zod"') && /SPECIFICATIONS:/.test(b));
  assert.ok(!/GAPS BETWEEN/.test(blueprintPrompt({ requirements: 'a shop', projects: [] })));
});

test('unknowns written as objects by the AI become sentences before they are sent to VS Code', () => {
  const { knowledge } = sanitizeKnowledge({ analysisType: 'FILE', files: [{ path: 'a.js', claims: [], unknowns: [{ question: 'Where is the DB opened?', reason: 'not in this batch' }, { foo: 1 }, 'plain'] }], unknowns: [{ item: 'deployment' }] }, [{ path: 'a.js', hash: 'h' }]);
  assert.deepStrictEqual(knowledge.files[0].unknowns, ['Where is the DB opened? — not in this batch', '{"foo":1}', 'plain']);
  assert.deepStrictEqual(knowledge.unknowns, ['deployment']);
});
