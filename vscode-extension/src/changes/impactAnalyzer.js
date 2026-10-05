// Dependency, workflow, feature and database impact of a set of file changes, with a coarse risk rating.
const { traverse } = require('../analyzer/reverseDependencyAnalyzer');

async function analyzeImpact(store, changedPaths, depth = 2) {
  const deps = (await store.readJson('index/dependencies.json', { dependencies: {} })).dependencies;
  const dependents = (await store.readJson('index/dependents.json', { dependents: {} })).dependents;
  const graph = { dependencies: deps, dependents };
  const set = new Set(changedPaths);
  const dependentSet = new Map();
  for (const p of changedPaths) for (const d of traverse(graph, p, 'dependents', depth)) if (!set.has(d.path)) dependentSet.set(d.path, Math.min(dependentSet.get(d.path) || 99, d.depth));
  const affected = new Set([...set, ...dependentSet.keys()]);
  const wfIdx = (await store.readJson('workflows/index.json', { workflows: [] })).workflows;
  const workflows = wfIdx.filter((w) => (w.sourceFiles || []).some((f) => affected.has(f))).map((w) => ({ id: w.id, name: w.name, direct: (w.sourceFiles || []).some((f) => set.has(f)) }));
  const feats = (await store.readJson('features/index.json', { features: [] })).features;
  const features = [];
  for (const f of feats) { const d = await store.readJson(`features/${f.id}.json`, null); if (d && d.files.some((x) => affected.has(x))) features.push({ id: d.id, name: d.name }); }
  const entities = (await store.readJson('database/entities.json', { entities: [] })).entities.filter((e) => e.file && affected.has(e.file)).map((e) => ({ name: e.name, direct: set.has(e.file) }));
  const routes = (await store.readJson('index/routes.json', { routes: [] })).routes.filter((r) => set.has(r.file)).map((r) => `${r.method} ${r.endpoint}`);
  const dbFiles = entities.some((e) => e.direct);
  let risk = 'LOW';
  const reasons = [];
  if (dependentSet.size >= 5) { risk = 'MEDIUM'; reasons.push(`${dependentSet.size} dependent files`); }
  if (workflows.some((w) => w.direct)) { risk = 'MEDIUM'; reasons.push('changes files on a traced workflow'); }
  if (routes.length) { risk = 'MEDIUM'; reasons.push(`changes route definitions: ${routes.join(', ')}`); }
  if (dbFiles) { risk = 'HIGH'; reasons.push('changes database schema/model definitions'); }
  if (dependentSet.size >= 15) { risk = 'HIGH'; reasons.push('very wide dependent set'); }
  return { changedFiles: [...set], dependents: [...dependentSet.entries()].map(([path, depth]) => ({ path, depth })).sort((a, b) => a.depth - b.depth), workflows, features, entities, routes, risk, riskReasons: reasons };
}

module.exports = { analyzeImpact };
