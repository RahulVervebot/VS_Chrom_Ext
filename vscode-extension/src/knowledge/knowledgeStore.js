const logger = require('../utils/logger');
// Persists static analysis into .ai-project/ and tracks per-file status via source hashes.
// Layout separation: `static` blocks are regenerated from source on every scan; `knowledge` blocks hold reconciled AI knowledge and survive rescans.
const { computeCoverage } = require('./coverageManager');
const { traverse } = require('../analyzer/reverseDependencyAnalyzer');

const fileDocKey = (p) => `files/${p}`;
const safeName = (p) => p.replace(/[\\/]/g, '__');

class KnowledgeStore {
  constructor(projectStore) {
    this.store = projectStore;
  }

  async getFiles() { return this.store.readJson('index/files.json', { files: [] }).then((d) => d.files); }
  async getFileMap() { return Object.fromEntries((await this.getFiles()).map((f) => [f.path, f])); }

  // Per-file analysis cache keyed by hash so unchanged files are never re-analyzed.
  async loadAnalysisCache() {
    const cache = await this.store.readJson('index/analysis-cache.json', { entries: {} });
    return new Map(Object.entries(cache.entries));
  }

  // Persist a scan + static analysis. Returns what changed and what that impacts.
  async saveStatic(scan, analysis, { maxImpactDepth = 2 } = {}) {
    const prev = await this.getFileMap();
    const analyzedByPath = new Map(analysis.files.map((a) => [a.path, a]));
    const outdated = [];
    const files = scan.files.map((f) => {
      const p = prev[f.path];
      let status = 'NOT_ANALYZED';
      let analyzedHash = null;
      let analysisIds = [];
      if (p && p.analyzedHash) {
        analyzedHash = p.analyzedHash;
        analysisIds = p.analysisIds || [];
        if (p.analyzedHash === f.hash) status = p.status === 'PARTIAL' ? 'PARTIAL' : 'ANALYZED';
        else { status = 'OUTDATED'; if (p.status !== 'OUTDATED') outdated.push(f.path); }
      }
      const a = analyzedByPath.get(f.path);
      return { path: f.path, hash: f.hash, language: f.language, size: f.size, lines: f.lines, tokens: f.tokens, mtimeMs: f.mtimeMs, binary: !!f.binary, isSource: !!(a && a.isSource), isTest: !!(a && a.isTest), status, analyzedHash, analysisIds };
    });
    const currentPaths = new Set(files.map((f) => f.path));
    const removed = Object.keys(prev).filter((p) => !currentPaths.has(p));
    const changed = files.filter((f) => !prev[f.path] || prev[f.path].hash !== f.hash).map((f) => f.path);

    const changedExisting = changed.filter((p) => prev[p]).concat(removed);
    const impact = this.computeImpact(changedExisting, analysis, maxImpactDepth);
    const touched = new Set([...impact.changedFiles, ...impact.dependents]);
    const docStatus = await this.getDocStatus();
    impact.documentation = Object.entries(docStatus.items).filter(([, it]) => Object.keys(it.sourceHashes || {}).some((p) => touched.has(p))).map(([k]) => k).sort();

    await this.store.writeJson('index/files.json', { schemaVersion: '1.0', generatedAt: new Date().toISOString(), files });
    await this.store.writeJson('index/symbols.json', { symbols: analysis.files.flatMap((a) => a.symbols.map((s) => ({ file: a.path, name: s.name, type: s.type, className: s.className || null, line: s.line, endLine: s.endLine, exported: !!s.exported, params: s.params, calls: (s.calls || []).map((c) => c.name) }))) });
    await this.store.writeJson('index/imports.json', { imports: Object.fromEntries(analysis.files.filter((a) => a.imports.length).map((a) => [a.path, a.imports])) });
    await this.store.writeJson('index/exports.json', { exports: Object.fromEntries(analysis.files.filter((a) => a.exports.length).map((a) => [a.path, a.exports])) });
    await this.store.writeJson('index/dependencies.json', { dependencies: analysis.dependencies });
    await this.store.writeJson('index/dependents.json', { dependents: analysis.dependents });
    await this.store.writeJson('index/routes.json', { routes: analysis.apis });
    await this.store.writeJson('index/apis.json', { apis: analysis.apis.map((a) => ({ method: a.method, endpoint: a.endpoint, file: a.file, line: a.line, handler: a.handler, middleware: a.middleware, framework: a.framework })), clientCalls: analysis.apiLinks, auth: analysis.auth, externalServices: analysis.externalServices, events: analysis.events });
    await this.store.writeJson('index/database.json', { technologies: analysis.database.technologies, fileEntities: analysis.database.fileEntities });
    await this.store.writeJson('index/environment.json', scan.environment);
    await this.store.writeJson('index/validation.json', { validation: analysis.validation || [] });
    await this.store.writeJson('index/business-rules.json', { businessRules: analysis.businessLogic || [], stateManagement: analysis.stateManagement || [], events: analysis.events || [] });
    await this.store.writeJson('index/packages.json', { manifests: (scan.packages.manifests || []).map((m) => ({ path: m.path, kind: m.kind, name: m.name || null, version: m.version || null, ecosystem: m.ecosystem || null, dependencies: m.dependencies || {}, devDependencies: m.devDependencies || {} })), scripts: scan.packages.commands ? scan.packages.commands.scripts : {} });
    await this.store.writeJson('index/analysis-cache.json', { entries: Object.fromEntries(analysis.files.map((a) => [a.path, { hash: a.hash, analysis: a }])) });

    await this._saveDatabase(analysis.database);
    await this._saveFeatures(analysis.features);
    await this._saveArchitectureIndex(analysis, scan);

    if (impact.documentation.length || outdated.length) await this.refreshDocumentationStatus(Object.fromEntries(files.map((f) => [f.path, f.hash])));
    return { files, changed, removed, outdated, impact };
  }

  // What is affected when these files change: dependents, workflows, features, entities, documentation.
  computeImpact(changedPaths, analysis, depth) {
    const set = new Set(changedPaths);
    const graph = { dependencies: analysis.dependencies, dependents: analysis.dependents };
    const dependents = new Set();
    for (const p of set) for (const d of traverse(graph, p, 'dependents', depth)) dependents.add(d.path);
    const affected = new Set([...set, ...dependents]);
    return {
      changedFiles: [...set].sort(),
      dependents: [...dependents].filter((d) => !set.has(d)).sort(),
      workflows: analysis.workflows.filter((w) => w.summary.files.some((f) => affected.has(f))).map((w) => w.id),
      features: analysis.features.filter((f) => f.files.some((x) => affected.has(x))).map((f) => f.id),
      entities: analysis.database.entities.filter((e) => affected.has(e.file)).map((e) => e.name),
      documentation: [],
    };
  }

  async _saveDatabase(db) {
    const prev = await this.store.readJson('database/entities.json', { entities: [] });
    const prevByName = new Map(prev.entities.map((e) => [e.name, e]));
    const entities = db.entities.map((e) => ({ ...e, static: true, knowledge: (prevByName.get(e.name) || {}).knowledge || null }));
    // AI-only entities (no static evidence) stay, flagged as such.
    for (const e of prev.entities) if (!db.entities.some((x) => x.name === e.name) && e.knowledge && e.staticMissing !== true && e.origin === 'AI') entities.push(e);
    await this.store.writeJson('database/entities.json', { entities });
    await this.store.writeJson('database/schema.json', { technologies: db.technologies.map((t) => t.name), tables: db.entities.filter((e) => e.kind === 'table').map((e) => ({ name: e.name, fields: e.fields, file: e.file })), indexes: db.indexes });
    const prevRel = await this.store.readJson('database/relationships.json', { relationships: [] });
    const keep = prevRel.relationships.filter((r) => r.origin === 'AI' && !db.relationships.some((x) => x.from === r.from && x.to === r.to && x.type === r.type));
    await this.store.writeJson('database/relationships.json', { relationships: [...db.relationships, ...keep] });
    await this.store.writeJson('database/queries.json', { queries: db.queries });
    await this.store.writeJson('database/data-flows.json', { dataFlows: db.dataFlows });
  }

  async _saveFeatures(featuresIn) {
    let features = featuresIn;
    const prevIndex = await this.store.readJson('features/index.json', { features: [] });
    const unwritable = [];
    for (const f of features) {
      try {
        const prev = await this.store.readJson(`features/${f.id}.json`, null);
        await this.store.writeJson(`features/${f.id}.json`, { ...f, knowledge: prev ? prev.knowledge || null : null });
      } catch (e) { unwritable.push(f.id); logger.warn('SCAN', 'could not store a feature; the rest of the scan continues', { feature: f.id, error: e.message }); } // one bad name must never abort a whole scan
    }
    if (unwritable.length) features = features.filter((f) => !unwritable.includes(f.id));
    const aiOnly = prevIndex.features.filter((f) => f.origin === 'AI' && !features.some((x) => x.id === f.id));
    await this.store.writeJson('features/index.json', { features: [...features.map((f) => ({ id: f.id, name: f.name, status: f.status, files: f.files.length, apis: f.apis.length, entities: f.entities })), ...aiOnly], generatedAt: new Date().toISOString() });
  }

  async _saveArchitectureIndex(analysis, scan) {
    await this.store.writeJson('architecture/architecture.json', { ...analysis.architecture, generatedAt: new Date().toISOString(), scanTotals: scan.totals });
  }

  // ---- documentation status (hash based) ----

  async getDocStatus() { return this.store.readJson('documentation/status.json', { items: {} }); }

  // Record that a documentation item was produced from these source files at these hashes.
  async recordDocumentation(key, sourceHashes, status = 'ANALYZED') {
    const doc = await this.getDocStatus();
    doc.items[key] = { status, sourceHashes, updatedAt: new Date().toISOString() };
    await this.store.writeJson('documentation/status.json', doc);
  }

  // Marks documentation OUTDATED when any source hash it was built from has changed or the file is gone.
  async refreshDocumentationStatus(currentHashes) {
    const doc = await this.getDocStatus();
    const outdated = [];
    for (const [key, item] of Object.entries(doc.items)) {
      const stale = Object.entries(item.sourceHashes || {}).some(([p, h]) => currentHashes[p] !== h);
      if (stale && item.status !== 'OUTDATED') { item.status = 'OUTDATED'; item.outdatedAt = new Date().toISOString(); outdated.push(key); }
    }
    if (outdated.length) await this.store.writeJson('documentation/status.json', doc);
    return outdated;
  }

  // ---- file knowledge ----

  async getFileKnowledge(p) { return this.store.readJson(`documentation/files/${safeName(p)}.json`, null); }
  async saveFileKnowledge(p, data) { await this.store.writeJson(`documentation/files/${safeName(p)}.json`, data); }

  // Called after reconciliation accepted knowledge about files: sets ANALYZED + analyzedHash.
  async markAnalyzed(analysisId, fileStatuses) {
    const files = await this.getFiles();
    const map = new Map(files.map((f) => [f.path, f]));
    for (const { path: p, hash, status } of fileStatuses) {
      const f = map.get(p);
      if (!f || f.hash !== hash) continue; // only mark against the exact hash that was verified
      f.analyzedHash = hash;
      f.status = status || 'ANALYZED';
      f.analysisIds = [...new Set([...(f.analysisIds || []), analysisId])];
    }
    await this.store.writeJson('index/files.json', { schemaVersion: '1.0', generatedAt: new Date().toISOString(), files });
  }

  async coverage(history = []) {
    const files = await this.getFiles();
    const wf = await this.store.readJson('workflows/index.json', { workflows: [] });
    const ents = await this.store.readJson('database/entities.json', { entities: [] });
    const workflows = [];
    for (const w of wf.workflows) { const d = await this.store.readJson(`workflows/${w.id}.json`, null); if (d && d.knowledge) workflows.push(w); }
    return computeCoverage({ files, workflows, entities: ents.entities.filter((e) => e.knowledge), history });
  }
}

module.exports = { KnowledgeStore, safeName, fileDocKey };
