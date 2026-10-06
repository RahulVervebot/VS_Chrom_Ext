// Builds one structured "project specification" from a project's .ai-project knowledge base (nothing is read from source here).
// It is the single hand-off document: features, database fields, validation, required modules, APIs, workflows, auth, environment.
// Every list is evidence-backed; items the analysis could not establish are listed under `unknowns`, never guessed.
const path = require('path');
const { ProjectStore } = require('../knowledge/projectStore');
const { resolveProjectDir } = require('../comparison/projectComparator');

const uniq = (xs) => [...new Set(xs)];

async function buildSpec(dir, folderName = '.ai-project') {
  const root = resolveProjectDir(dir, folderName);
  const s = new ProjectStore(root, folderName);
  if (!(await s.isInitialized())) throw new Error(`No ${folderName}/project.json found in ${path.basename(root)}. Pick the project folder (the one that contains ${folderName}).`);
  const [project, arch, archK, files, apiIdx, ents, rels, validationIdx, rulesIdx, pkgIdx, env, dbIdx, featIdx, wfIdx, depsIdx] = await Promise.all([
    s.readJson('project.json'), s.readJson('architecture/architecture.json', { technologies: [], languages: {}, layers: {}, tiers: {}, entryPoints: [], config: [] }), s.readJson('architecture/knowledge.json', null),
    s.readJson('index/files.json', { files: [] }), s.readJson('index/apis.json', { apis: [] }), s.readJson('database/entities.json', { entities: [] }), s.readJson('database/relationships.json', { relationships: [] }),
    s.readJson('index/validation.json', { validation: [] }), s.readJson('index/business-rules.json', { businessRules: [], stateManagement: [], events: [] }), s.readJson('index/packages.json', { manifests: [], scripts: {} }),
    s.readJson('index/environment.json', { variables: [], declaredIn: {} }), s.readJson('index/database.json', { technologies: [] }), s.readJson('features/index.json', { features: [] }), s.readJson('workflows/index.json', { workflows: [] }), s.readJson('index/dependencies.json', { dependencies: {} }),
  ]);
  const source = files.files.filter((f) => !f.path.startsWith(`${folderName}/`));
  const analyzed = source.filter((f) => ['ANALYZED', 'PARTIAL', 'OUTDATED'].includes(f.status)).length;
  const unknowns = [];
  const hasValidationIndex = await s.exists('index/validation.json');
  if (!hasValidationIndex) unknowns.push('Validation rules were not extracted: re-scan the project with this version of the extension.');

  // Required modules (runtime vs dev) straight from the manifests.
  const runtime = []; const dev = [];
  for (const m of pkgIdx.manifests) {
    for (const [name, version] of Object.entries(m.dependencies || {})) runtime.push({ name, version: String(version), manifest: m.path, ecosystem: m.ecosystem || null });
    for (const [name, version] of Object.entries(m.devDependencies || {})) dev.push({ name, version: String(version), manifest: m.path, ecosystem: m.ecosystem || null });
  }
  const languages = {};
  for (const f of source) if (f.isSource) languages[f.language] = (languages[f.language] || 0) + 1;

  const validation = [];
  for (const v of validationIdx.validation) for (const it of v.items) validation.push({ file: v.file, kind: it.kind, field: it.field || null, rules: it.rules, line: it.line, status: it.status || 'VERIFIED', ...(it.basis ? { basis: it.basis } : {}) });

  const entities = ents.entities.map((e) => {
    const own = validation.filter((v) => v.kind === 'schema' && v.file === e.file && v.line >= (e.line || 0) && v.line <= (e.endLine || 1e9));
    return {
      name: e.name, kind: e.kind, source: e.source || null, file: e.file || null,
      fields: (e.fields || []).map((f) => {
        const rules = uniq(own.filter((v) => v.field === f.name).flatMap((v) => v.rules));
        return { name: f.name, type: f.type || 'unknown', pk: !!f.pk, unique: !!f.unique || !!f.pk || rules.includes('unique'), required: rules.includes('required') || f.nullable === false || !!f.pk, nullable: f.nullable, rules };
      }),
      status: e.static === false ? 'INFERRED' : 'VERIFIED',
      purpose: e.knowledge && e.knowledge.purpose ? e.knowledge.purpose : null,
    };
  });

  const apis = apiIdx.apis.map((a) => ({ key: `${a.method} ${a.endpoint}`, method: a.method, endpoint: a.endpoint, handler: a.handler || null, middleware: a.middleware || [], file: a.file, line: a.line, protected: (a.middleware || []).some((x) => /auth|protect|guard|jwt|token|login/i.test(String(x))) }));
  const clientCalls = (apiIdx.clientCalls || []).map((c) => ({ key: `${c.method} ${c.path}`, from: c.from && c.from.file, client: c.from && c.from.client, status: c.status }));

  const features = [];
  for (const f of featIdx.features) {
    const d = await s.readJson(`features/${f.id}.json`, null);
    if (!d) continue;
    const purpose = d.knowledge && d.knowledge.purpose ? d.knowledge.purpose : null;
    if (!purpose) unknowns.push(`Feature "${d.name}": purpose not yet established by AI analysis (structure only).`);
    features.push({ id: d.id, name: d.name, status: d.status, basis: d.basis || [], purpose, files: d.files || [], tests: d.tests || [], apis: (d.apis || []).map((a) => `${a.method} ${a.endpoint}`), entities: d.entities || [], knowledge: d.knowledge || null });
  }

  const workflows = [];
  for (const w of wfIdx.workflows) {
    const d = await s.readJson(`workflows/${w.id}.json`, null);
    if (!d) continue;
    workflows.push({ id: d.id, name: d.name, status: d.status, purpose: d.purpose || (d.knowledge && d.knowledge.purpose) || null, trigger: d.trigger ? { type: d.trigger.type, event: d.trigger.event, file: d.trigger.file } : null, api: d.api ? `${d.api.method} ${d.api.endpoint}` : null, steps: (d.steps || []).map((x) => ({ kind: x.kind, symbol: x.symbol || null, entity: x.entity || null, operation: x.operation || null, file: x.file || null, status: x.status })), reads: (d.summary && d.summary.databaseReads) || [], writes: (d.summary && d.summary.databaseWrites) || [], externalServices: (d.summary && d.summary.externalServices) || [] });
  }

  const authMap = new Map();
  for (const a of apiIdx.auth || []) for (const it of a.items) { const k = `${it.type}:${it.kind}`; if (!authMap.has(k)) authMap.set(k, { type: it.type, kind: it.kind, files: new Set() }); authMap.get(k).files.add(a.file); }
  const auth = [...authMap.values()].map((a) => ({ type: a.type, kind: a.kind, files: [...a.files].sort() })).sort((x, y) => (x.type + x.kind).localeCompare(y.type + y.kind));
  const externalServices = Object.entries(apiIdx.externalServices || {}).map(([name, ev]) => ({ name, files: uniq(ev.map((e) => e.file)).sort() })).sort((x, y) => x.name.localeCompare(y.name));
  const stateLibs = new Map();
  for (const st of rulesIdx.stateManagement || []) for (const l of st.libraries) (stateLibs.get(l) || stateLibs.set(l, new Set()).get(l)).add(st.file);
  const businessRules = (rulesIdx.businessRules || []).flatMap((b) => b.rules.map((r) => ({ kind: r.kind, symbol: r.symbol, file: b.file, line: r.line, status: r.status || 'INFERRED' })));

  return {
    specVersion: '1.0', generatedAt: new Date().toISOString(), project: { projectId: project.projectId, name: project.name },
    coverage: { filesTotal: source.length, filesAnalyzed: analyzed, status: analyzed === 0 ? 'NOT_ANALYZED' : analyzed >= source.filter((f) => f.isSource).length ? 'COMPLETE' : 'PARTIAL' },
    overview: archK && archK.overview ? archK.overview : null,
    stack: { languages, technologies: arch.technologies, runtimeModules: runtime, devModules: dev, scripts: pkgIdx.scripts || {} },
    architecture: { layers: arch.layers, tiers: arch.tiers, entryPoints: arch.entryPoints || [], config: arch.config || [] },
    features, database: { technologies: dbIdx.technologies.map((t) => t.name), entities, relationships: rels.relationships.map((r) => ({ from: r.from, to: r.to, type: r.type, via: r.via, status: r.status || 'VERIFIED' })) },
    apis, clientCalls, validation, businessRules, workflows, auth, externalServices,
    environment: { variables: env.variables.map((v) => ({ name: v.name, usedIn: v.usedIn })), declaredIn: env.declaredIn || {} },
    state: [...stateLibs.entries()].map(([library, f]) => ({ library, files: [...f].sort() })),
    tests: source.filter((f) => f.isTest).map((f) => f.path),
    unknowns: uniq(unknowns),
  };
}

module.exports = { buildSpec };
