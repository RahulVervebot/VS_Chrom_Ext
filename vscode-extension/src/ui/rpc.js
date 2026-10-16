// Extension-side API for the React webview. The webview never touches the filesystem: it asks, and this validates.
const { DEFAULTS } = require('../config/configManager');
const { traverse } = require('../analyzer/reverseDependencyAnalyzer');
const { toUserMessage } = require('../utils/errors');
const { resolveInside } = require('../utils/paths');
const { detectCommands } = require('../changes/verificationManager');

const sv = require('../knowledge/scopeView');
const { moduleDocId } = require('../knowledge/reconciliationEngine');

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
      const files = await pm().fileIndexForSelection();
      const q = query ? String(query).toLowerCase() : null;
      return files.filter((f) => (!status || (status === 'SKIPPED' ? f.skipped : f.status === status)) && (!q || f.path.toLowerCase().includes(q))).slice(0, limit)
        .map((f) => ({ path: f.path, language: f.language, lines: f.lines, tokens: f.tokens, status: f.status, isSource: f.isSource, isTest: f.isTest, binary: f.binary, skipped: !!f.skipped }));
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
      const skip = (await pm().getSkipped())[path] || null;
      return { record, skipped: skip, symbols, dependencies: deps, dependents, routes, entities: fileEntities, workflows: wf, knowledge: await pm().knowledge.getFileKnowledge(path) };
    },
    // Sub-projects (Odoo add-ons, apps, packages…) with live coverage and the AI's description when one exists.
    // A project analysed with an older version has no module index yet: it is created here by a normal scan (knowledge is untouched).
    async getModules() {
      const p = pm();
      let idx = await store().readJson('index/modules.json', null);
      if (!idx) { await p.scan(); idx = await store().readJson('index/modules.json', { modules: [] }); }
      const files = await p.knowledge.getFiles();
      const status = new Map(files.map((f) => [f.path, f.status]));
      const featureKnowledge = async (ids) => { for (const id of ids) { const f = await store().readJson(`features/${id}.json`, null); if (f && f.knowledge && f.knowledge.purpose) return { feature: id, purpose: f.knowledge.purpose }; } return null; };
      const out = [];
      for (const m of idx.modules) {
        const own = files.filter((f) => f.isSource && (f.path === m.path || f.path.startsWith(`${m.path}/`)));
        const analyzed = own.filter((f) => status.get(f.path) === 'ANALYZED' || status.get(f.path) === 'PARTIAL').length;
        const ai = await featureKnowledge([...(m.features || [])].sort((a, b) => (a === m.name.toLowerCase().replace(/_/g, '-') ? -1 : b === m.name.toLowerCase().replace(/_/g, '-') ? 1 : 0)));
        // the module overview (MODULES run) is the first choice; a feature's purpose is the fallback
        const doc = await store().readJson(`modules/${moduleDocId(m)}.json`, null);
        const k = doc && doc.knowledge;
        const man = doc && doc.manifestFile ? files.find((f) => f.path === doc.manifestFile) : null;
        const overview = k ? { purpose: k.purpose ? k.purpose.value : null, howItWorks: k.howItWorks ? k.howItWorks.value : null, features: k.features || [], keyModels: k.keyModels || [], dependsOn: k.dependsOn || [], integrations: k.integrations || [], userFacing: k.userFacing || [], updatedAt: k.updatedAt, outdated: !!(man && doc.manifestHash && man.hash !== doc.manifestHash) } : null;
        out.push({ ...m, coverage: { analyzed, total: own.length, percent: own.length ? Math.round((analyzed / own.length) * 100) : 0 }, aiPurpose: (overview && overview.purpose) || (ai ? ai.purpose : null), overview });
      }
      return { generatedAt: idx.generatedAt || null, modules: out };
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
    // completed runs say how many of their files are still not analyzed (after "Send what is done", a skipped or failed batch)
    async getAnalyses() {
      const list = (await pm().history.list()).reverse();
      const status = new Map((await pm().knowledge.getFiles()).map((f) => [f.path, f.status]));
      const skipped = await pm().getSkipped();
      return list.map((a) => {
        if (a.status !== 'COMPLETED' || a.mode === 'MODULES') return a;
        const primary = a.selection && a.selection.pinnedFiles && a.selection.pinnedFiles.length ? a.selection.pinnedFiles : [];
        const left = primary.filter((p) => status.has(p) && !['ANALYZED', 'PARTIAL'].includes(status.get(p)));
        return { ...a, unfinished: left.filter((p) => !skipped[p]).length, unfinishedSkipped: left.filter((p) => skipped[p]).length };
      });
    },
    async getUnfinished({ analysisId }) { return pm().unfinishedOf(String(analysisId)); },
    async followUp({ analysisId, files, approach, instruction }) { return pm().followUp({ analysisId: analysisId ? String(analysisId) : null, files: Array.isArray(files) ? files.map(String) : null, approach, instruction }); },
    async skipFiles({ files, analysisId, reason }) { return { skipped: await pm().skipFiles(Array.isArray(files) ? files.map(String) : [], { analysisId: analysisId || null, reason: reason || 'skipped by the user' }) }; },
    async unskipFiles({ files } = {}) { return { unskipped: await pm().unskipFiles(Array.isArray(files) ? files.map(String) : null) }; },
    async getSkipped() { return pm().getSkipped(); },
    // what an automatic analysis did not get to: retry those files (any way), or skip them
    async campaignFollowUp({ approach, instruction, skip } = {}) {
      const c = await pm().campaign.get();
      if (!c) throw new Error('There is no automatic analysis.');
      const status = new Map((await pm().knowledge.getFiles()).map((f) => [f.path, f.status]));
      const skipped = await pm().getSkipped();
      const left = c.queue.filter((p) => status.has(p) && !['ANALYZED', 'PARTIAL'].includes(status.get(p)) && !skipped[p]);
      if (skip) return { skipped: await pm().skipFiles(left, { reason: `skipped after automatic analysis ${c.id}` }) };
      return pm().followUp({ files: left, mode: c.mode, selection: c.selection, approach, instruction });
    },
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
    // AI overview of the add-ons/packages (all, or the named ones): manifests in dependency order + static facts, one analysis run
    async explainModules({ modules } = {}) { return actions.explainModules({ modules: Array.isArray(modules) ? modules.map(String) : [] }); },
    async getCampaign() { return pm().campaign.progress(); },
    async campaignControl({ action }) {
      if (action === 'stop') await pm().campaign.stop(); else if (action === 'resume') await pm().campaign.resume(); else if (action === 'skipModules') await pm().campaign.skipModuleStage(); else throw new Error(`Unknown action ${action}`);
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
