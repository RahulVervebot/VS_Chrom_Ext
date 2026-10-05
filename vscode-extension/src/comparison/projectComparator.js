// Builds portable summaries of a project's knowledge (from its .ai-project) and deterministic structural diffs.
// Comparison never ranks or scores; interpretation comes back from Chrome and is stored by storeComparison().
const fs = require('fs');
const path = require('path');
const { ProjectStore } = require('../knowledge/projectStore');

// dir: a workspace root containing .ai-project (any project, not necessarily the open one).
async function loadProjectSummary(dir, folderName = '.ai-project') {
  const store = new ProjectStore(dir, folderName);
  if (!(await store.isInitialized())) throw new Error(`No ${folderName}/project.json found in ${path.basename(dir)}.`);
  const project = await store.readJson('project.json');
  const arch = await store.readJson('architecture/architecture.json', { technologies: [], layers: {}, tiers: {}, languages: {}, entryPoints: [] });
  const archK = await store.readJson('architecture/knowledge.json', null);
  const wfIdx = (await store.readJson('workflows/index.json', { workflows: [] })).workflows;
  const workflows = [];
  for (const w of wfIdx) { const d = await store.readJson(`workflows/${w.id}.json`, null); if (d) workflows.push(d); }
  const featIdx = (await store.readJson('features/index.json', { features: [] })).features;
  const features = [];
  for (const f of featIdx) { const d = await store.readJson(`features/${f.id}.json`, null); if (d) features.push(d); }
  const entities = (await store.readJson('database/entities.json', { entities: [] })).entities;
  const relationships = (await store.readJson('database/relationships.json', { relationships: [] })).relationships;
  const apis = (await store.readJson('index/apis.json', { apis: [] }));
  const dbIdx = await store.readJson('index/database.json', { technologies: [] });
  const files = (await store.readJson('index/files.json', { files: [] })).files;
  const analyzed = files.filter((f) => ['ANALYZED', 'PARTIAL', 'OUTDATED'].includes(f.status)).length;
  return {
    project: { projectId: project.projectId, name: project.name },
    coverage: { filesTotal: files.length, filesAnalyzed: analyzed, status: analyzed === 0 ? 'NOT_ANALYZED' : 'PARTIAL_OR_COMPLETE' },
    technologies: arch.technologies.map((t) => t.name),
    languages: arch.languages,
    layers: Object.fromEntries(Object.entries(arch.layers || {}).map(([k, v]) => [k, v.length])),
    architectureSummary: archK && archK.overview ? archK.overview : null,
    features: features.map((f) => ({ id: f.id, name: f.name, files: f.files.length, apis: (f.apis || []).map((a) => `${a.method} ${a.endpoint}`), entities: f.entities || [], purpose: f.knowledge && f.knowledge.purpose ? f.knowledge.purpose : null })),
    workflows: workflows.map((w) => ({ id: w.id, name: w.name, status: w.status, api: w.api, trigger: w.trigger && w.trigger.type, steps: w.steps.map((s) => ({ kind: s.kind, symbol: s.symbol, entity: s.entity })), reads: w.summary.databaseReads, writes: w.summary.databaseWrites, externalServices: w.summary.externalServices, purpose: w.knowledge && w.knowledge.purpose ? w.knowledge.purpose : null })),
    database: { technologies: dbIdx.technologies.map((t) => t.name), entities: entities.map((e) => ({ name: e.name, kind: e.kind, fields: (e.fields || []).map((f) => ({ name: f.name, type: f.type })) })), relationships: relationships.map((r) => ({ from: r.from, to: r.to, type: r.type, status: r.status })) },
    apis: apis.apis.map((a) => `${a.method} ${a.endpoint}`),
    externalServices: Object.keys(apis.externalServices || {}),
    authentication: [...new Set((apis.auth || []).flatMap((a) => a.items.map((i) => i.kind)))],
  };
}

const setDiff = (a, b) => ({ common: a.filter((x) => b.includes(x)), onlyA: a.filter((x) => !b.includes(x)), onlyB: b.filter((x) => !a.includes(x)) });

// Deterministic structural comparison across summaries [A, B, C...]. Facts only: no scores.
function structuralDiff(summaries) {
  const names = summaries.map((s) => s.project.name);
  const pair = (fn) => {
    const out = [];
    for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) out.push({ a: names[i], b: names[j], ...fn(summaries[i], summaries[j]) });
    return out;
  };
  return {
    projects: summaries.map((s) => s.project),
    technologies: pair((a, b) => setDiff(a.technologies, b.technologies)),
    apis: pair((a, b) => setDiff(a.apis, b.apis)),
    features: pair((a, b) => setDiff(a.features.map((f) => f.id), b.features.map((f) => f.id))),
    entities: pair((a, b) => setDiff(a.database.entities.map((e) => e.name), b.database.entities.map((e) => e.name))),
    externalServices: pair((a, b) => setDiff(a.externalServices, b.externalServices)),
    authentication: pair((a, b) => setDiff(a.authentication, b.authentication)),
    coverage: summaries.map((s) => ({ project: s.project.name, ...s.coverage })),
    unknowns: summaries.filter((s) => s.coverage.status !== 'PARTIAL_OR_COMPLETE').map((s) => `${s.project.name} has no analyzed files; its knowledge is incomplete.`),
  };
}

module.exports = { loadProjectSummary, structuralDiff, setDiff };
