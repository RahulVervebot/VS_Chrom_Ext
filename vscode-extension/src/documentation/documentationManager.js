// Generates and updates documentation under .ai-project/. Previous versions are archived, never silently overwritten.
const { renderFileDoc } = require('./fileDocumentation');
const { renderWorkflowDoc } = require('./workflowDocumentation');
const { renderEntityDoc, renderDatabaseOverview } = require('./databaseDocumentation');
const { renderFeatureDoc } = require('./featureDocumentation');
const { renderArchitecture, renderDependencyMap, renderApplicationFlow } = require('./architectureDocumentation');
const { renderProjectOverview } = require('./projectDocumentation');
const { safeName } = require('../knowledge/knowledgeStore');
const { classifyRole } = require('../analyzer/architectureAnalyzer');
const { computeCoverage } = require('../knowledge/coverageManager');

class DocumentationManager {
  constructor({ store, knowledge, history }) { this.store = store; this.knowledge = knowledge; this.history = history; }

  async load() {
    const s = this.store;
    const files = await this.knowledge.getFiles();
    const symbols = (await s.readJson('index/symbols.json', { symbols: [] })).symbols;
    const imports = (await s.readJson('index/imports.json', { imports: {} })).imports;
    const exports_ = (await s.readJson('index/exports.json', { exports: {} })).exports;
    const dependencies = (await s.readJson('index/dependencies.json', { dependencies: {} })).dependencies;
    const dependents = (await s.readJson('index/dependents.json', { dependents: {} })).dependents;
    const routes = (await s.readJson('index/routes.json', { routes: [] })).routes;
    const apisIdx = await s.readJson('index/apis.json', {});
    const entities = (await s.readJson('database/entities.json', { entities: [] })).entities;
    const relationships = (await s.readJson('database/relationships.json', { relationships: [] })).relationships;
    const queries = (await s.readJson('database/queries.json', { queries: [] })).queries;
    const dataFlows = (await s.readJson('database/data-flows.json', { dataFlows: [] })).dataFlows;
    const dbIdx = await s.readJson('index/database.json', { technologies: [], fileEntities: {} });
    const wfIndex = (await s.readJson('workflows/index.json', { workflows: [] })).workflows;
    const workflows = [];
    for (const w of wfIndex) { const d = await s.readJson(`workflows/${w.id}.json`, null); if (d) workflows.push(d); }
    const featIndex = (await s.readJson('features/index.json', { features: [] })).features;
    const features = [];
    for (const f of featIndex) { const d = await s.readJson(`features/${f.id}.json`, null); if (d) features.push(d); }
    const architecture = await s.readJson('architecture/architecture.json', null);
    const archKnowledge = await s.readJson('architecture/knowledge.json', null);
    const history = await this.history.list();
    const docStatus = await this.knowledge.getDocStatus();
    return { files, symbols, imports, exports: exports_, dependencies, dependents, routes, apisIdx, entities, relationships, queries, dataFlows, dbIdx, workflows, features, architecture, archKnowledge, history, docStatus, project: await s.readJson('project.json') };
  }

  // Writes a doc, archiving the previous version. Returns true if content changed.
  async write(rel, content, key, sourceFiles, hashes, statusOverride) {
    const force = this.force === true;
    const previous = await this.store.readText(rel, null);
    const body = content.replace(/Generated: [^\n]*/, 'Generated: {{GENERATED}}');
    const prevBody = previous ? previous.replace(/Generated: [^\n]*/, 'Generated: {{GENERATED}}') : null;
    if (prevBody === body && !force) return false;
    if (previous) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await this.store.writeText(`snapshots/documentation/${safeName(key)}/${stamp}.md`, previous);
    }
    await this.store.writeText(rel, content);
    const status = statusOverride || 'ANALYZED';
    await this.knowledge.recordDocumentation(key, Object.fromEntries(sourceFiles.filter((p) => hashes[p]).map((p) => [p, hashes[p]])), status);
    return true;
  }

  async updateAll({ force = false } = {}) {
    this.force = force;
    try { return await this._updateAll(); } finally { this.force = false; }
  }

  async _updateAll() {
    const d = await this.load();
    const hashes = Object.fromEntries(d.files.map((f) => [f.path, f.hash]));
    const at = new Date().toISOString();
    const wrote = [];
    const bySymbolsFile = new Map();
    for (const s of d.symbols) (bySymbolsFile.get(s.file) || bySymbolsFile.set(s.file, []).get(s.file)).push(s);
    const exportsBy = d.exports;
    const coverage = computeCoverage({ files: d.files, workflows: d.workflows.filter((w) => w.knowledge), entities: d.entities.filter((e) => e.knowledge), history: d.history });
    const sourceFiles = d.files.filter((f) => f.isSource).map((f) => f.path);

    // Files: only for files that have verified knowledge (never document a file as understood when it was not analyzed).
    for (const f of d.files) {
      if (!f.isSource) continue;
      const know = await this.knowledge.getFileKnowledge(f.path);
      if (!know) continue;
      const fileEntities = d.dbIdx.fileEntities[f.path] || { reads: [], writes: [] };
      const doc = renderFileDoc({
        file: f, role: classifyRole(f.path), knowledge: know,
        symbols: bySymbolsFile.get(f.path) || [], imports: d.imports[f.path] || [], exports: exportsBy[f.path] || [],
        dependencies: (d.dependencies[f.path] || { internal: [] }).internal, dependents: d.dependents[f.path] || [],
        routes: d.routes.filter((r) => r.file === f.path), entities: fileEntities,
        workflows: d.workflows.filter((w) => w.summary.files.includes(f.path)), features: d.features.filter((x) => x.files.includes(f.path)),
        tests: d.files.filter((t) => t.isTest && ((d.dependencies[t.path] || { internal: [] }).internal.some((i) => i.path === f.path))).map((t) => t.path),
      }, at, f.status === 'OUTDATED' ? 'OUTDATED' : (f.status === 'PARTIAL' ? 'PARTIAL' : 'ANALYZED'));
      if (await this.write(`documentation/files/${safeName(f.path)}.md`, doc, `files/${f.path}`, [f.path], hashes, f.status === 'OUTDATED' ? 'OUTDATED' : undefined)) wrote.push(`files/${f.path}`);
    }
    for (const w of d.workflows) {
      const files = w.summary.files;
      const partial = w.status !== 'VERIFIED' || !w.knowledge;
      if (await this.write(`documentation/workflows/${w.id}.md`, renderWorkflowDoc(w, at, partial ? 'PARTIAL' : 'ANALYZED'), `workflows/${w.id}`, files, hashes, partial ? 'PARTIAL' : 'ANALYZED')) wrote.push(`workflows/${w.id}`);
    }
    const dbCtx = { relationships: d.relationships, queries: d.queries, workflows: d.workflows, technologies: d.dbIdx.technologies, entities: d.entities, dataFlows: d.dataFlows };
    for (const e of d.entities) {
      if (await this.write(`documentation/database/${safeName(e.name)}.md`, renderEntityDoc(e, dbCtx, at, e.knowledge ? 'ANALYZED' : 'PARTIAL'), `database/${e.name}`, e.file ? [e.file] : [], hashes, e.knowledge ? 'ANALYZED' : 'PARTIAL')) wrote.push(`database/${e.name}`);
    }
    if (d.entities.length || d.dbIdx.technologies.length) {
      const dbFiles = [...new Set(d.entities.map((e) => e.file).filter(Boolean))];
      if (await this.write('documentation/database/overview.md', renderDatabaseOverview(dbCtx, at, 'PARTIAL', dbFiles), 'database/overview', dbFiles, hashes, 'PARTIAL')) wrote.push('database/overview');
    }
    for (const f of d.features) {
      if (await this.write(`documentation/features/${safeName(f.id)}.md`, renderFeatureDoc(f, at, f.knowledge ? 'ANALYZED' : 'PARTIAL'), `features/${f.id}`, f.files, hashes, f.knowledge ? 'ANALYZED' : 'PARTIAL')) wrote.push(`features/${f.id}`);
    }
    if (d.architecture) {
      const auth = (await this.store.readJson('index/apis.json', {})).auth || [];
      const externalServices = (await this.store.readJson('index/apis.json', {})).externalServices || {};
      const ctx = { sources: sourceFiles, coverage, auth, externalServices, workflows: d.workflows.map((w) => ({ name: w.name, status: w.status, files: w.summary.files.length, steps: w.steps })), dependencies: d.dependencies, dependents: d.dependents };
      const status = coverage.coverageStatus === 'COMPLETE' ? 'ANALYZED' : 'PARTIAL';
      const arch = renderArchitecture(d.architecture, d.archKnowledge, ctx, at, status);
      if (await this.write('architecture/overview.md', arch, 'architecture/overview', sourceFiles, hashes, status)) wrote.push('architecture/overview');
      if (await this.write('documentation/architecture.md', arch, 'documentation/architecture', sourceFiles, hashes, status)) wrote.push('documentation/architecture');
      if (await this.write('architecture/dependency-map.md', renderDependencyMap(ctx, at, status), 'architecture/dependency-map', sourceFiles, hashes, status)) wrote.push('architecture/dependency-map');
      if (await this.write('architecture/application-flow.md', renderApplicationFlow(ctx, at, status), 'architecture/application-flow', sourceFiles, hashes, status)) wrote.push('architecture/application-flow');
      const stack = `# Technology Stack\n\n${d.architecture.technologies.map((t) => `- **${t.name}** — evidence: ${t.evidence.join(', ')}`).join('\n') || '_None detected._'}\n`;
      await this.write('architecture/technology-stack.md', stack, 'architecture/technology-stack', [], hashes, 'ANALYZED');
      const dataFlow = `# Data Flow\n\n${d.dataFlows.map((f) => `- **${f.workflowId}** (${f.api ? `${f.api.method} ${f.api.endpoint}` : 'n/a'}): reads ${f.reads.join(', ') || '—'}; writes ${f.writes.join(', ') || '—'} — ${f.status}`).join('\n') || '_No data flows traced from source._'}\n`;
      await this.write('architecture/data-flow.md', dataFlow, 'architecture/data-flow', sourceFiles, hashes, 'PARTIAL');
    }
    const docStatus = await this.knowledge.getDocStatus();
    const counts = { files: d.files.length, workflows: d.workflows.length, features: d.features.length, entities: d.entities.length, apis: d.routes.length };
    const overview = renderProjectOverview({ project: d.project, coverage, counts, sources: sourceFiles, analyses: d.history.map((h) => ({ analysisId: h.analysisId, mode: h.mode, status: h.status, provider: h.provider, files: h.files.length })), documents: Object.entries(docStatus.items).filter(([key]) => key !== 'documentation/project-overview').map(([key, v]) => ({ key, status: v.status })) }, at, coverage.coverageStatus === 'COMPLETE' ? 'ANALYZED' : 'PARTIAL');
    if (await this.write('documentation/project-overview.md', overview, 'documentation/project-overview', sourceFiles, hashes, 'PARTIAL')) wrote.push('documentation/project-overview');
    return { wrote, coverage };
  }

  // AI-authored documentation is stored as an unverified draft next to (never over) generated documentation.
  async storeAiDocument(payload) {
    if (!payload || typeof payload.markdown !== 'string' || !payload.markdown.trim()) throw Object.assign(new Error('Documentation response has no markdown.'), { code: 'SCHEMA_MISMATCH' });
    const key = String(payload.key || '');
    const rel = this.pathFor(key);
    if (!rel) throw Object.assign(new Error(`Unknown documentation key ${key.slice(0, 80)}`), { code: 'SCHEMA_MISMATCH' });
    const target = rel.replace(/\.md$/, '.ai-draft.md');
    const prev = await this.store.readText(target, null);
    if (prev) await this.store.writeText(`snapshots/documentation/${safeName(key)}/${new Date().toISOString().replace(/[:.]/g, '-')}.ai-draft.md`, prev);
    const banner = `> AI-GENERATED DRAFT (${payload.provider || 'unknown provider'}). NOT VERIFIED against source. Do not treat as authoritative.\n\n`;
    await this.store.writeText(target, banner + payload.markdown.slice(0, 500000));
    return { path: target };
  }

  async list() {
    const status = await this.knowledge.getDocStatus();
    return Object.entries(status.items).map(([key, v]) => ({ key, status: v.status, updatedAt: v.updatedAt })).sort((a, b) => a.key.localeCompare(b.key));
  }

  // key -> markdown path
  pathFor(key) {
    if (key.startsWith('files/')) return `documentation/files/${safeName(key.slice(6))}.md`;
    if (key.startsWith('workflows/')) return `documentation/workflows/${key.slice(10)}.md`;
    if (key.startsWith('features/')) return `documentation/features/${safeName(key.slice(9))}.md`;
    if (key.startsWith('database/')) return `documentation/database/${safeName(key.slice(9))}.md`;
    if (key === 'documentation/architecture') return 'documentation/architecture.md';
    if (key.startsWith('architecture/')) return `${key}.md`;
    if (key === 'documentation/project-overview') return 'documentation/project-overview.md';
    return null;
  }

  async read(key) {
    const rel = this.pathFor(key);
    return rel ? this.store.readText(rel, null) : null;
  }

  async versions(key) {
    const names = await this.store.listDir(`snapshots/documentation/${safeName(key)}`);
    return names.sort().reverse();
  }
}

module.exports = { DocumentationManager };
