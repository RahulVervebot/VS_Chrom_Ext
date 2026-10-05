// Scoped comparison: compares only the part of each project the user picked (selected files/folders, a feature or a workflow),
// never the whole project. Everything sent is limited to that part's files and what the project's own index says about them.
const path = require('path');
const { ProjectStore } = require('../knowledge/projectStore');
const { redact } = require('../security/secretDetector');
const { resolveProjectDir, setDiff } = require('./projectComparator');

const safeName = (p) => p.replace(/[\\/]/g, '__');
const MAX_FILES = 60;
const DOC_CHARS = 5000;
const DOC_BUDGET = 40000;

async function openStore(dir, folderName) {
  const root = resolveProjectDir(dir, folderName);
  const store = new ProjectStore(root, folderName);
  if (!(await store.isInitialized())) throw new Error(`No ${folderName}/project.json found in ${path.basename(root)}. Pick the project folder (the one that contains ${folderName}).`);
  return { root, store, project: await store.readJson('project.json') };
}

// What a user can pick in a project: detected features, workflows, and indexed source files.
async function listScopeChoices(dir, folderName = '.ai-project') {
  const { store } = await openStore(dir, folderName);
  const features = (await store.readJson('features/index.json', { features: [] })).features.map((f) => ({ id: f.id, name: f.name || f.id, files: f.files }));
  const workflows = (await store.readJson('workflows/index.json', { workflows: [] })).workflows.map((w) => ({ id: w.id, name: w.name || w.id }));
  const files = (await store.readJson('index/files.json', { files: [] })).files.filter((f) => !f.binary && f.isSource && !f.path.startsWith(`${folderName}/`)).map((f) => f.path);
  return { features, workflows, files };
}

// scope: { files?, folders?, features?, workflows? } (project-relative). Returns the file set it resolves to plus a label.
async function resolveScope(store, scope, folderName) {
  const all = (await store.readJson('index/files.json', { files: [] })).files.map((f) => f.path).filter((p) => !p.startsWith(`${folderName}/`));
  const set = new Set();
  for (const f of scope.files || []) if (all.includes(f)) set.add(f);
  for (const d of scope.folders || []) { const pre = d.replace(/\/$/, '') + '/'; for (const p of all) if (p.startsWith(pre)) set.add(p); }
  const featureNames = [];
  for (const id of scope.features || []) { const f = await store.readJson(`features/${id}.json`, null); if (f) { featureNames.push(f.name || id); for (const p of f.files || []) set.add(p); for (const p of f.tests || []) set.add(p); } }
  const workflowNames = [];
  for (const id of scope.workflows || []) { const w = await store.readJson(`workflows/${id}.json`, null); if (w) { workflowNames.push(w.name || id); for (const s of w.steps || []) if (s.file) set.add(s.file); } }
  const parts = [];
  if (featureNames.length) parts.push(`feature ${featureNames.join(', ')}`);
  if (workflowNames.length) parts.push(`workflow ${workflowNames.join(', ')}`);
  if ((scope.files || []).length) parts.push(`${scope.files.length} file(s)`);
  if ((scope.folders || []).length) parts.push(`folder ${scope.folders.join(', ')}`);
  return { files: [...set].sort(), label: parts.join(' + ') || 'selection' };
}

async function readScopedDocs(store, scope, files) {
  const keys = files.map((f) => ({ key: `files/${f}`, rel: `documentation/files/${safeName(f)}.md` }));
  for (const id of scope.features || []) keys.push({ key: `features/${id}`, rel: `documentation/features/${safeName(id)}.md` });
  for (const id of scope.workflows || []) keys.push({ key: `workflows/${id}`, rel: `documentation/workflows/${safeName(id)}.md` });
  const documents = [];
  const missing = [];
  let budget = DOC_BUDGET;
  for (const k of keys) {
    const raw = await store.readText(k.rel, null);
    if (raw === null) { if (k.key.startsWith('files/')) missing.push(k.key.slice(6)); continue; }
    if (budget <= 0) { missing.push(`${k.key} (size limit)`); continue; }
    const text = redact(raw, k.rel).text.slice(0, Math.min(DOC_CHARS, budget));
    budget -= text.length;
    documents.push({ key: k.key, text, truncated: text.length < raw.length });
  }
  return { documents, undocumented: missing };
}

async function loadScopedSummary(dir, folderName = '.ai-project', scope = {}) {
  const { store, project } = await openStore(dir, folderName);
  const resolved = await resolveScope(store, scope, folderName);
  if (!resolved.files.length) throw new Error(`Nothing in ${project.name || path.basename(dir)} matched the selection.`);
  const inScope = new Set(resolved.files.slice(0, MAX_FILES));
  const truncatedFiles = resolved.files.length - inScope.size;
  const idx = (await store.readJson('index/files.json', { files: [] })).files.filter((f) => inScope.has(f.path));
  const symbols = (await store.readJson('index/symbols.json', { symbols: [] })).symbols.filter((s) => inScope.has(s.file));
  const exportsBy = (await store.readJson('index/exports.json', { exports: {} })).exports;
  const importsBy = (await store.readJson('index/imports.json', { imports: {} })).imports;
  const apis = (await store.readJson('index/apis.json', { apis: [] })).apis.filter((a) => inScope.has(a.file));
  const queries = (await store.readJson('database/queries.json', { queries: [] })).queries.filter((q) => inScope.has(q.file));
  const entityNames = new Set(queries.map((q) => q.entity));
  const entities = (await store.readJson('database/entities.json', { entities: [] })).entities.filter((e) => entityNames.has(e.name) || (e.file && inScope.has(e.file)));
  const workflows = [];
  for (const w of (await store.readJson('workflows/index.json', { workflows: [] })).workflows) {
    const d = await store.readJson(`workflows/${w.id}.json`, null);
    if (!d) continue;
    const mine = (d.steps || []).filter((s) => s.file && inScope.has(s.file));
    if (mine.length) workflows.push({ id: d.id, name: d.name, api: d.api, stepsInScope: mine.map((s) => ({ kind: s.kind, symbol: s.symbol, entity: s.entity, file: s.file, status: s.status })), stepsTotal: (d.steps || []).length });
  }
  const features = [];
  for (const f of (await store.readJson('features/index.json', { features: [] })).features) {
    const d = await store.readJson(`features/${f.id}.json`, null);
    const overlap = d ? (d.files || []).filter((p) => inScope.has(p)).length : 0;
    if (overlap) features.push({ id: f.id, name: f.name, filesInScope: overlap, filesTotal: (d.files || []).length, purpose: d.knowledge && d.knowledge.purpose ? d.knowledge.purpose : null });
  }
  const docs = await readScopedDocs(store, scope, [...inScope]);
  const { scopeDependencies } = require('../knowledge/scopeView'); // lazy: scopeView requires this module
  const depsAll = (await store.readJson('index/dependencies.json', { dependencies: {} })).dependencies;
  const dependentsAll = (await store.readJson('index/dependents.json', { dependents: {} })).dependents;
  const sd = scopeDependencies(depsAll, dependentsAll, inScope);
  const arch = await store.readJson('architecture/architecture.json', { layers: {} });
  const layers = {};
  for (const [role, list] of Object.entries(arch.layers || {})) { const l = list.filter((p) => inScope.has(p)); if (l.length) layers[role] = l; }
  const external = (f) => [...new Set((importsBy[f] || []).map((i) => i.source).filter((s) => s && !s.startsWith('.')))];
  return {
    project: { projectId: project.projectId, name: project.name },
    scope: { label: resolved.label, files: [...inScope], filesNotIncluded: truncatedFiles },
    files: idx.map((f) => ({ path: f.path, language: f.language, lines: f.lines, status: f.status, symbols: symbols.filter((s) => s.file === f.path).map((s) => ({ name: s.name, type: s.type, line: s.line, exported: s.exported })), exports: (exportsBy[f.path] || []).map((e) => e.name), externalImports: external(f.path), internalImports: (importsBy[f.path] || []).map((i) => i.source).filter((s) => s && s.startsWith('.')) })),
    apis: apis.map((a) => ({ api: `${a.method} ${a.endpoint}`, file: a.file, handler: a.handler, middleware: a.middleware })),
    database: { queries: queries.map((q) => ({ entity: q.entity, operation: q.operation, kind: q.kind, file: q.file })), entities: entities.map((e) => ({ name: e.name, kind: e.kind, fields: (e.fields || []).map((x) => `${x.name}:${x.type}`) })) },
    architecture: { layers, packages: sd.packages },
    dependencies: { insideScope: sd.internal.map((e) => ({ from: e.from, to: e.to })), needsFromOutside: sd.dependsOnOutside.length, usedByOutside: sd.usedByOutside.length },
    workflows, features,
    documents: docs.documents, undocumentedFiles: docs.undocumented,
  };
}

const names = (xs) => [...new Set(xs)].sort();
function compareScoped(summaries) {
  const key = (s) => ({
    symbols: names(s.files.flatMap((f) => f.symbols.map((x) => x.name))),
    exports: names(s.files.flatMap((f) => f.exports)),
    packages: names(s.files.flatMap((f) => f.externalImports)),
    apis: names(s.apis.map((a) => a.api)),
    middleware: names(s.apis.flatMap((a) => a.middleware || [])),
    entities: names(s.database.entities.map((e) => e.name)),
    queryOperations: names(s.database.queries.map((q) => `${q.kind}:${q.operation}`)),
    workflowSteps: names(s.workflows.flatMap((w) => w.stepsInScope.map((x) => x.kind))),
    layers: Object.keys(s.architecture.layers).sort(),
    layerSizes: Object.entries(s.architecture.layers).map(([r, l]) => `${r}:${l.length}`).sort(),
    internalDependencyCount: [`${s.dependencies.insideScope.length}`],
    documents: names(s.documents.map((d) => d.key.replace(/^files\/.*\//, 'files/'))),
  });
  const k = summaries.map(key);
  const pairs = [];
  for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) {
    pairs.push({ a: summaries[i].project.name, b: summaries[j].project.name, ...Object.fromEntries(Object.keys(k[i]).map((f) => [f, setDiff(k[i][f], k[j][f])])) });
  }
  return {
    scopes: summaries.map((s) => ({ project: s.project.name, scope: s.scope.label, files: s.scope.files.length, filesNotIncluded: s.scope.filesNotIncluded })),
    pairs,
    coverage: summaries.map((s) => ({ project: s.project.name, filesWithoutDocumentation: s.undocumentedFiles, documentsSent: s.documents.length })),
  };
}

module.exports = { listScopeChoices, loadScopedSummary, compareScoped, resolveScope };
