// Extension-side API for the React webview. The webview never touches the filesystem: it asks, and this validates.
const { DEFAULTS } = require('../config/configManager');
const { traverse } = require('../analyzer/reverseDependencyAnalyzer');
const { toUserMessage } = require('../utils/errors');
const { resolveInside } = require('../utils/paths');
const { detectCommands } = require('../changes/verificationManager');

const sv = require('../knowledge/scopeView');

const COMMAND_WHITELIST = /^aiProject\.[A-Za-z]+$/;

function createRpc({ getPm, selection, actions }) {
  const pm = () => {
    const p = getPm();
    if (!p) { const e = new Error('Open a folder to use AI Project Intelligence.'); e.code = 'NO_WORKSPACE'; throw e; }
    return p;
  };
  const store = () => pm().store;
  // The selected part of the project, or null for the whole project (nothing selected, or "entire project" selected).
  const scopeOf = async (scoped) => (scoped ? sv.selectionScope(store(), selection.get(), pm().config.get('aiProjectFolder')) : null);

  const methods = {
    async getState() {
      const p = getPm();
      if (!p) return { noWorkspace: true };
      return { ...(await p.state()), selection: selection.get(), selectionMode: selection.mode(), selectionSummary: selection.summary() };
    },
    async getFiles({ status, query, limit = 5000 } = {}) {
      const files = await pm().knowledge.getFiles();
      const q = query ? String(query).toLowerCase() : null;
      return files.filter((f) => (!status || f.status === status) && (!q || f.path.toLowerCase().includes(q))).slice(0, limit)
        .map((f) => ({ path: f.path, language: f.language, lines: f.lines, tokens: f.tokens, status: f.status, isSource: f.isSource, isTest: f.isTest, binary: f.binary }));
    },
    async getFile({ path }) {
      const s = store();
      const files = await pm().knowledge.getFiles();
      const record = files.find((f) => f.path === path);
      if (!record) throw new Error(`Unknown file ${path}`);
      const symbols = (await s.readJson('index/symbols.json', { symbols: [] })).symbols.filter((x) => x.file === path);
      const deps = (await s.readJson('index/dependencies.json', { dependencies: {} })).dependencies[path] || { internal: [], external: [] };
      const dependents = (await s.readJson('index/dependents.json', { dependents: {} })).dependents[path] || [];
      const routes = (await s.readJson('index/routes.json', { routes: [] })).routes.filter((r) => r.file === path);
      const fileEntities = (await s.readJson('index/database.json', { fileEntities: {} })).fileEntities[path] || { reads: [], writes: [] };
      const wf = (await s.readJson('workflows/index.json', { workflows: [] })).workflows.filter((w) => (w.sourceFiles || []).includes(path)).map((w) => ({ id: w.id, name: w.name }));
      return { record, symbols, dependencies: deps, dependents, routes, entities: fileEntities, workflows: wf, knowledge: await pm().knowledge.getFileKnowledge(path) };
    },
    async getScope() { const sc = await sv.selectionScope(store(), selection.get(), pm().config.get('aiProjectFolder')); return sc ? { active: true, label: sc.label, files: sc.files.size } : { active: false, label: 'entire project', files: 0 }; },
    async getWorkflows({ scoped } = {}) { const list = (await store().readJson('workflows/index.json', { workflows: [] })).workflows; const sc = await scopeOf(scoped); return sc ? sv.filterWorkflows(store(), list, sc.files) : list; },
    async getWorkflow({ id }) { const w = await pm().workflowStore.get(String(id)); if (!w) throw new Error(`Unknown workflow ${id}`); return w; },
    async getFeatures({ scoped } = {}) { const list = (await store().readJson('features/index.json', { features: [] })).features; const sc = await scopeOf(scoped); return sc ? sv.filterFeatures(store(), list, sc.files) : list; },
    async getFeature({ id }) { if (!/^[^\\/]+$/.test(String(id)) || String(id) === '..' || String(id) === '.') throw new Error(`Unknown feature ${id}`); const f = await store().readJson(`features/${String(id)}.json`, null); if (!f) throw new Error(`Unknown feature ${id}`); return f; },
    async getDatabase({ scoped } = {}) {
      const s = store();
      const [ents, rels, qs, flows, idx] = await Promise.all([s.readJson('database/entities.json', { entities: [] }), s.readJson('database/relationships.json', { relationships: [] }), s.readJson('database/queries.json', { queries: [] }), s.readJson('database/data-flows.json', { dataFlows: [] }), s.readJson('index/database.json', { technologies: [] })]);
      const db = { technologies: idx.technologies.map((t) => t.name), entities: ents.entities, relationships: rels.relationships, queries: qs.queries, dataFlows: flows.dataFlows };
      const sc = await scopeOf(scoped);
      return sc ? sv.filterDatabase(db, sc.files) : db;
    },
    async getApis({ scoped } = {}) { const a = await store().readJson('index/apis.json', { apis: [] }); const all = { apis: a.apis, clientCalls: a.clientCalls || [], auth: a.auth || [], externalServices: a.externalServices || {} }; const sc = await scopeOf(scoped); return sc ? sv.filterApis(all, sc.files) : all; },
    async getDependencies({ file, depth = 2, direction = 'dependencies', scoped }) {
      const s = store();
      const dependencies = (await s.readJson('index/dependencies.json', { dependencies: {} })).dependencies;
      const dependents = (await s.readJson('index/dependents.json', { dependents: {} })).dependents;
      const sc = await scopeOf(scoped);
      if (sc && !file) { const sd = sv.scopeDependencies(dependencies, dependents, sc.files); return { scoped: true, label: sc.label, ...sd, summary: sd.files.map((f) => ({ file: f, dependencies: (dependencies[f] ? dependencies[f].internal.length : 0), dependents: (dependents[f] || []).length })) }; }
      if (!file) { const summary = Object.entries(dependencies).map(([f, d]) => ({ file: f, dependencies: d.internal.length, dependents: (dependents[f] || []).length })).filter((x) => x.dependencies || x.dependents).sort((a, b) => b.dependents - a.dependents).slice(0, 200); return { summary }; }
      const d = Math.max(1, Math.min(6, Number(depth) || 2));
      const nodes = traverse({ dependencies, dependents }, file, direction === 'dependents' ? 'dependents' : 'dependencies', d);
      const edges = [];
      for (const n of [{ path: file, depth: 0 }, ...nodes]) {
        const next = direction === 'dependents' ? (dependents[n.path] || []).map((x) => x.path) : (dependencies[n.path] ? dependencies[n.path].internal.map((x) => x.path) : []);
        for (const t of next) if (t === file || nodes.some((m) => m.path === t)) edges.push(direction === 'dependents' ? { from: t, to: n.path } : { from: n.path, to: t });
      }
      return { root: file, direction, depth: d, nodes: [{ path: file, depth: 0 }, ...nodes], edges, external: dependencies[file] ? dependencies[file].external : [] };
    },
    async getArchitecture({ scoped } = {}) {
      const s = store();
      const sc = await scopeOf(scoped);
      const arch = await s.readJson('architecture/architecture.json', null);
      if (!sc) return { architecture: arch, knowledge: await s.readJson('architecture/knowledge.json', null), conflicts: (await s.readJson('index/conflicts.json', { conflicts: [] })).conflicts };
      const imports = (await s.readJson('index/dependencies.json', { dependencies: {} })).dependencies;
      const files = (await s.readJson('index/files.json', { files: [] })).files.filter((f) => sc.files.has(f.path));
      const a = sv.filterArchitecture(arch, sc.files);
      for (const f of files) a.languages[f.language] = (a.languages[f.language] || 0) + 1;
      a.packages = [...new Set([...sc.files].flatMap((f) => (imports[f] ? imports[f].external : [])))].sort();
      return { architecture: a, knowledge: null, conflicts: [] };
    },
    // Generated documents of the selected files (and of a selected feature/workflow), instead of the whole-project architecture document.
    async getScopedDocuments() {
      const sc = await sv.selectionScope(store(), selection.get(), pm().config.get('aiProjectFolder'));
      if (!sc) return [];
      const sel = selection.get();
      const keys = [...[...sc.files].map((f) => `files/${f}`), ...(sel.features || []).map((f) => `features/${f}`), ...(sel.workflows || []).map((w) => `workflows/${w}`)];
      const out = [];
      for (const k of keys) { const md = await pm().documentation.read(k); if (md !== null) out.push({ key: k, markdown: md }); }
      return out;
    },
    async getDocuments() { return pm().documentation.list(); },
    async getDocument({ key }) { const md = await pm().documentation.read(String(key)); if (md === null) throw new Error(`No documentation for ${key} yet. Run "Generate Documentation".`); return { key, markdown: md, versions: await pm().documentation.versions(String(key)) }; },
    async generateDocumentation({ force } = {}) { const r = await pm().documentation.updateAll({ force: !!force }); return { wrote: r.wrote.length }; },
    async deleteAnalysis({ id }) { const ok = await pm().history.remove(String(id)); pm().emit('changed', 'history'); return { deleted: ok ? 1 : 0 }; },
    // Cancelled, failed and never-started runs produced no knowledge, so deleting their records loses nothing that is known about the project.
    async clearAnalyses({ statuses } = {}) {
      const want = (Array.isArray(statuses) && statuses.length ? statuses : ['CANCELLED', 'FAILED']).filter((s) => ['CANCELLED', 'FAILED', 'CREATED', 'SENT'].includes(s));
      const live = new Set([...pm().bridge.runner.runs.values()].filter((r) => ['IN_PROGRESS', 'AWAITING_ACCEPT', 'PAUSED', 'WAITING_PACKAGE'].includes(r.status)).map((r) => r.analysisId));
      let n = 0;
      for (const r of await pm().history.list()) if (want.includes(r.status) && !live.has(r.analysisId)) { await pm().history.remove(r.analysisId); n++; }
      pm().emit('changed', 'history');
      return { deleted: n };
    },
    async getAnalyses() { return (await pm().history.list()).reverse(); },
    async getAnalysis({ id }) { const r = await pm().history.get(String(id)); if (!r) throw new Error(`Unknown analysis ${id}`); return r; },
    async getRunner() { return pm().bridge.runner.list(); },
    async getChanges() { return pm().changes.list(); },
    async getChange({ id }) { const r = await pm().changes.get(String(id)); if (!r) throw new Error(`Unknown proposal ${id}`); return r; },
    async getComparisons() {
      const names = (await store().listDir('comparisons')).filter((n) => n.endsWith('.json')).sort().reverse();
      const out = [];
      for (const n of names) out.push(await store().readJson(`comparisons/${n}`));
      return out;
    },
    async getSpec() {
      const spec = await store().readJson('exports/project-spec.json', null);
      if (!spec) return { exists: false };
      const text = await store().readText('exports/project-spec.txt', '');
      const { renderSpec } = require('../spec/specRenderer');
      return { exists: true, generatedAt: spec.generatedAt, coverage: spec.coverage, project: spec.project, text, sections: renderSpec(spec).sections, path: `${pm().config.get('aiProjectFolder')}/exports/project-spec.txt`, bytes: Buffer.byteLength(text) };
    },
    // Comparisons are only reports: deleting them never touches source, knowledge or specifications.
    async deleteComparison({ id }) {
      if (!/^comparison-\d{3,}$/.test(String(id))) throw new Error('Invalid comparison id.');
      await store().remove(`comparisons/${id}.json`); await store().remove(`comparisons/${id}.md`);
      return { deleted: 1 };
    },
    async clearComparisons() {
      const names = (await store().listDir('comparisons')).filter((n) => /^comparison-\d{3,}\.(json|md)$/.test(n));
      for (const n of names) await store().remove(`comparisons/${n}`);
      return { deleted: names.filter((n) => n.endsWith('.json')).length };
    },
    // A blueprint is only a plan. Deleting it never touches source or the specification; earlier versions are kept unless asked.
    async deleteBlueprint({ history } = {}) {
      await store().remove('generation/project-blueprint.json');
      let versions = 0;
      for (const n of (await store().listDir('snapshots')).filter((x) => /^blueprint-.*\.json$/.test(x))) { if (history) { await store().remove(`snapshots/${n}`); } else versions++; }
      return { deleted: true, previousVersionsKept: history ? 0 : versions };
    },
    async getBlueprintVersions() { return (await store().listDir('snapshots')).filter((x) => /^blueprint-.*\.json$/.test(x)).length; },
    async getBlueprint() { return store().readJson('generation/project-blueprint.json', null); },
    async getCommands() { const scan = await pm().ensureScan(); return detectCommands(pm().root, scan.packages.commands.scripts); },

    getSelection() { return { selection: selection.get(), mode: selection.mode(), summary: selection.summary() }; },
    setSelection({ selection: sel }) { selection.set(sel || {}); return methods.getSelection(); },
    addSelection({ kind, items }) { selection.add(kind, items); return methods.getSelection(); },
    removeSelection({ kind, item }) { selection.remove(kind, item); return methods.getSelection(); },
    clearSelection() { selection.clear(); return methods.getSelection(); },

    async initialize({ name } = {}) { const r = await pm().initialize(name); return { created: r.created, projectId: r.project.projectId }; },
    async scan() { const r = await pm().scan(); return { files: r.scan.totals.files, changed: r.saved.changed.length, outdated: r.saved.outdated.length, impact: r.saved.impact }; },
    async prepareAnalysis({ purpose, reanalyze } = {}) {
      const sel = selection.get();
      const built = await pm().prepareAnalysis({ mode: selection.mode(), selection: sel, purpose, reanalyze: !!reanalyze });
      return { mode: selection.mode(), stats: built.stats, batches: built.batches.map((b) => ({ batchId: b.batchId, files: b.context.files.map((f) => f.path), tokens: b.estimatedTokens })) };
    },
    async startAnalysis({ purpose, intent, reanalyze, continueUntilDone } = {}) { return actions.startAnalysis({ purpose, intent, reanalyze: !!reanalyze, continueUntilDone }); },
    async getCampaign() { return pm().campaign.progress(); },
    async campaignControl({ action }) {
      if (action === 'stop') await pm().campaign.stop(); else if (action === 'resume') await pm().campaign.resume(); else throw new Error(`Unknown action ${action}`);
      return pm().campaign.progress();
    },
    async runnerControl({ action, analysisId, batchId }) {
      const r = pm().bridge.runner;
      if (!['pause', 'resume', 'cancel', 'retry', 'skip'].includes(action)) throw new Error(`Unknown action ${action}`);
      r[action](analysisId, batchId);
      return r.list();
    },
    async resumeAnalysis({ analysisId }) { return pm().resumeAnalysis(String(analysisId)); },
    async pairChrome() { return actions.pairChrome(); },
    async connectChrome() { return actions.connectChrome(); },
    async disconnectChrome({ revoke } = {}) { await pm().bridge.disconnect({ revoke: !!revoke }); return pm().bridge.getStatus(); },
    async getChromeStatus() { return pm().bridge.getStatus(); },
    async listPairings() { return pm().bridge.security.listConnections(); },

    async updateSetting({ key, value }) { await pm().config.set(key, value); return pm().config.all(); },
    async getSettingsSchema() { return Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { default: v, type: Array.isArray(v) ? 'array' : typeof v }])); },

    async openFile({ path, line }) { resolveInside(pm().root, String(path)); return actions.openFile(String(path), Number(line) || 1); },
    async exec({ command, args = [] }) {
      if (!COMMAND_WHITELIST.test(command)) throw new Error('Command not allowed.');
      return actions.exec(command, ...args);
    },
  };

  // Every call is wrapped so the webview receives readable errors, never stack traces.
  async function call(method, params) {
    const fn = methods[method];
    if (!fn) throw new Error(`Unknown method ${String(method).slice(0, 40)}`);
    try { return await fn(params || {}); } catch (err) { const e = new Error(toUserMessage(err)); e.code = err.code; throw e; }
  }

  return { call, methods };
}

module.exports = { createRpc };
