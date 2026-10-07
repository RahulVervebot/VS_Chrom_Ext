// Core orchestration, independent of the VS Code API so it can be tested headlessly.
const EventEmitter = require('events');
const path = require('path');
const { ProjectStore } = require('../knowledge/projectStore');
const { KnowledgeStore } = require('../knowledge/knowledgeStore');
const { HistoryManager } = require('../knowledge/historyManager');
const { WorkflowStore } = require('../workflows/workflowStore');
const { scanProject } = require('../scanner/projectScanner');
const { analyzeProject } = require('../analyzer/projectAnalyzer');
const contextBuilder = require('../context/contextBuilder');
const { verifyPackage, reconcile, loadStaticIndex } = require('../knowledge/reconciliationEngine');
const { validateKnowledgePackage } = require('../knowledge/schemaValidator');
const { ChromeBridge } = require('../bridge/chromeBridge');
const { AiProjectError, ErrorCodes } = require('../utils/errors');
const { isCompatibleSchema } = require('../knowledge/versionManager');
const { DocumentationManager } = require('../documentation/documentationManager');
const { ChangePlanner } = require('../changes/changePlanner');
const { storeComparison } = require('../comparison/comparisonManager');
const { storeBlueprint } = require('../generation/blueprintGenerator');
const logger = require('../utils/logger');

class ProjectManager extends EventEmitter {
  constructor({ root, config, secretStore, confirmPairing, transportFactory, allowNoOrigin, bridgeOptions = {} }) {
    super();
    if (!root) throw new AiProjectError(ErrorCodes.NO_WORKSPACE, 'Open a folder or workspace first.');
    this.root = root;
    this.config = config;
    this.store = new ProjectStore(root, config.get('aiProjectFolder'));
    this.knowledge = new KnowledgeStore(this.store);
    this.history = new HistoryManager(this.store);
    this.workflowStore = new WorkflowStore(this.store);
    this.project = null;
    this.scanResult = null;
    this.analysis = null;
    this.scanning = null;
    this.bridge = new ChromeBridge({
      getProject: () => this.project,
      confirmPairing: confirmPairing || (async () => false),
      secretStore,
      host: config.get('chromeBridgeHost'),
      port: config.get('chromeBridgePort'),
      transportFactory,
      allowNoOrigin,
      ...bridgeOptions,
      services: {
        history: this.history,
        onKnowledgePackage: (pkg, ctx) => this.processKnowledgePackage(pkg, ctx),
        projectSummary: () => this.projectSummary(),
        onChangeProposal: (payload) => this.emitService('changeProposal', payload),
        onDocumentation: (payload) => this.emitService('documentation', payload),
        onComparison: (payload) => this.emitService('comparison', payload),
        onBlueprint: (payload) => this.emitService('blueprint', payload),
      },
    });
    this.bridge.on('status', (s) => this.emit('chrome', s));
    this.bridge.on('analysis', (a) => this.emit('analysis', a));
    this.services = {}; // changeProposal, documentation, comparison, blueprint
    this.documentation = new DocumentationManager({ store: this.store, knowledge: this.knowledge, history: this.history });
    this.changes = new ChangePlanner({
      root, store: this.store, config,
      getScripts: async () => (this.scanResult ? this.scanResult.packages.commands.scripts : (await this.ensureScan()).packages.commands.scripts),
      rescan: async () => { await this.scan(); if (this.config.get('autoUpdateDocumentation')) await this.documentation.updateAll(); },
    });
    this.registerService('changeProposal', async (payload) => {
      const rec = await this.changes.propose(payload);
      this.emit('changed', 'changes');
      return { code: rec.status === 'STALE' ? 'CHANGE_PROPOSAL_STALE' : 'CHANGE_PROPOSAL_RECEIVED', message: `${rec.proposalId}: ${rec.status}. Review it in VS Code (AI Project: Review AI Changes).` };
    });
    this.registerService('comparison', async (payload) => { const r = await storeComparison(this.store, payload); this.emit('changed', 'comparison'); return { code: 'COMPARISON_STORED', message: `${r.comparisonId} stored.` }; });
    this.registerService('blueprint', async (payload) => { const r = await storeBlueprint(this.store, payload); this.emit('changed', 'blueprint'); return { code: 'BLUEPRINT_STORED', message: `Blueprint stored${r.missingSections.length ? `; missing sections: ${r.missingSections.join(', ')}` : ''}.` }; });
    this.registerService('documentation', async (payload) => { const r = await this.documentation.storeAiDocument(payload); this.emit('changed', 'documentation'); return { code: 'DOCUMENTATION_STORED', message: `Stored ${r.path}` }; });
  }

  async ensureScan() { if (!this.scanResult) await this.scan(); return this.scanResult; }

  registerService(name, fn) { this.services[name] = fn; }
  async emitService(name, payload) {
    const fn = this.services[name];
    if (!fn) return undefined;
    return fn(payload);
  }

  // ---- lifecycle ----
  async load() {
    if (await this.store.isInitialized()) {
      this.project = await this.store.readJson('project.json');
      if (!isCompatibleSchema(this.project.schemaVersion)) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `.ai-project schema ${this.project.schemaVersion} is not compatible with this extension.`);
      logger.info('AI-PROJECT', 'loaded project', { projectId: this.project.projectId });
    }
    return this.project;
  }

  isInitialized() { return !!this.project; }

  async initialize(name) {
    const { project, created } = await this.store.initialize(name);
    this.project = project;
    await this.store.ensureDirs();
    this.emit('changed', 'project');
    return { project, created };
  }

  requireProject() {
    if (!this.project) throw new AiProjectError(ErrorCodes.NOT_INITIALIZED, 'Run "AI Project: Initialize Project" first.');
    return this.project;
  }

  // ---- scanning + static analysis ----
  scan(opts = {}) {
    if (this.scanning) return this.scanning;
    this.scanning = this._scan(opts).finally(() => { this.scanning = null; });
    return this.scanning;
  }

  async _scan({ onProgress } = {}) {
    this.requireProject();
    const previous = await this.knowledge.getFileMap();
    const scan = await scanProject(this.root, { excludePatterns: this.exclusions(), previousFiles: previous, onProgress });
    const cache = await this.knowledge.loadAnalysisCache();
    const analysis = await analyzeProject(this.root, scan, { cache, maxWorkflowDepth: this.config.get('maxWorkflowDepth') });
    const saved = await this.knowledge.saveStatic(scan, analysis, { maxImpactDepth: this.config.get('maxDependencyDepth') });
    await this.workflowStore.saveAll(analysis.workflows);
    this.scanResult = scan;
    this.analysis = analysis;
    this.lastScan = { scannedAt: scan.scannedAt, totals: scan.totals, languages: scan.languages, technologies: scan.packages.technologies, config: scan.config, errors: scan.errors.length, durationMs: scan.durationMs };
    this.lastDelta = { changed: saved.changed, removed: saved.removed, outdated: saved.outdated, impact: saved.impact };
    if (saved.outdated.length) logger.warn('KNOWLEDGE', 'analyzed files changed: documentation OUTDATED', { files: saved.outdated.length });
    this.emit('changed', 'scan');
    return { scan, analysis, saved };
  }

  exclusions() { return this.config.get('excludePatterns'); }

  async ensureAnalysis() {
    if (!this.analysis) await this.scan();
    return this.analysis;
  }

  // ---- analysis (send to Chrome) ----
  // Builds context + batches without sending, for the privacy summary shown before anything leaves VS Code.
  async prepareAnalysis({ mode, selection = {}, purpose, intent, analysisId = 'analysis-preview', reanalyze = false }) {
    this.requireProject();
    const analysis = await this.ensureAnalysis();
    const fileIndex = await this.knowledge.getFiles();
    const existingKnowledge = await this.existingKnowledgeFor(selection);
    return contextBuilder.build({
      root: this.root, project: this.project, analysisId, mode, purpose, intent, selection, analysis, scan: this.scanResult, fileIndex,
      existingKnowledge, config: this.config.all(), provider: this.config.get('provider'), reanalyze,
    });
  }

  async existingKnowledgeFor(selection) {
    const out = { files: {}, features: {}, workflows: {}, entities: {} };
    for (const p of (selection.files || []).slice(0, 50)) { const k = await this.knowledge.getFileKnowledge(p); if (k) out.files[p] = { purpose: k.purpose, role: k.role, claims: k.claims, unknowns: k.unknowns }; }
    for (const id of selection.features || []) { const f = await this.store.readJson(`features/${id}.json`, null); if (f && f.knowledge) out.features[id] = f.knowledge; }
    for (const id of selection.workflows || []) { const w = await this.store.readJson(`workflows/${id}.json`, null); if (w && w.knowledge) out.workflows[id] = w.knowledge; }
    return out;
  }

  // Creates the analysis record, builds context, and hands it to the bridge. Returns the snapshot.
  async startAnalysis({ mode, selection = {}, purpose, intent = 'UNDERSTAND', reanalyze = false }) {
    this.requireProject();
    if (!this.bridge.activeConnection()) throw new AiProjectError(ErrorCodes.CHROME_UNAVAILABLE, 'Chrome is not connected. Run "AI Project: Pair Chrome" or "Connect Chrome".');
    const analysis = await this.ensureAnalysis();
    const coverageBefore = await this.knowledge.coverage(await this.history.list());
    const rec = await this.history.create({ projectId: this.project.projectId, mode, purpose, selection, provider: this.config.get('provider') });
    await this.history.update(rec.analysisId, { intent });
    let built;
    try {
      built = await this.prepareAnalysis({ mode, selection, purpose, intent, analysisId: rec.analysisId, reanalyze });
    } catch (err) {
      await this.history.update(rec.analysisId, { status: 'FAILED', error: err.message });
      throw err;
    }
    if (!built.batches.length) {
      const allDone = built.stats.alreadyAnalyzed > 0;
      await this.history.update(rec.analysisId, { status: 'FAILED', error: allDone ? 'Everything in this selection is already analyzed.' : 'Nothing to analyze for this selection.' });
      throw new AiProjectError(ErrorCodes.ANALYSIS_FAILED, allDone ? `All ${built.stats.alreadyAnalyzed} file(s) in this selection are already analyzed and unchanged. Choose "Re-analyze files that are already analyzed" to run them again.` : 'The selection contains no analyzable source files.');
    }
    await this.history.update(rec.analysisId, { files: built.fileHashes, coverageBefore, selection: { files: selection.files || [], folders: selection.folders || [], features: selection.features || [], workflows: selection.workflows || [], project: !!selection.project, pinnedFiles: built.primaryFiles } });
    return this.bridge.runner.start({ analysisId: rec.analysisId, mode, purpose, intent, batches: built.batches, stats: built.stats, provider: this.config.get('provider') });
  }

  // Rebuild an interrupted analysis from its recorded selection; completed batches whose file hashes are unchanged are skipped.
  async resumeAnalysis(analysisId) {
    this.requireProject();
    const rec = await this.history.get(analysisId);
    if (!rec) throw new AiProjectError(ErrorCodes.ANALYSIS_UNKNOWN, `Unknown analysis ${analysisId}`);
    const live = this.bridge.runner.runs.get(analysisId);
    if (live && live.status === 'FAILED' && this.bridge.activeConnection()) { this.bridge.runner.resume(analysisId); return this.bridge.runner.snapshot(live); }
    if (live && live.status === 'DISCONNECTED') { this.bridge.runner.resumeAfterReconnect(); return this.bridge.runner.snapshot(live); }
    if (!this.bridge.activeConnection()) throw new AiProjectError(ErrorCodes.CHROME_UNAVAILABLE, 'Connect Chrome to resume this analysis.');
    await this.scan(); // fresh hashes
    const built = await this.prepareAnalysis({ mode: rec.mode, selection: rec.selection, purpose: rec.purpose, intent: rec.intent, analysisId, reanalyze: !(rec.selection && rec.selection.pinnedFiles) }); // older records have no pinned list: rebuild them as before
    const doneIds = this.history.completedBatchIds(rec);
    const oldByBatch = new Map((rec.batches || []).map((b) => [b.batchId, b]));
    const skip = built.batches.filter((b) => {
      const old = oldByBatch.get(b.batchId);
      if (!old || !doneIds.has(b.batchId)) return false;
      const now = new Map(b.context.files.map((f) => [f.path, f.hash]));
      return old.files.length === b.context.files.length && old.files.every((f) => now.get(f.path) === f.hash);
    }).map((b) => b.batchId);
    return this.bridge.runner.start({ analysisId, mode: rec.mode, purpose: rec.purpose, intent: rec.intent, batches: built.batches, stats: built.stats, provider: rec.provider, completedBatchIds: skip, resume: true });
  }

  // ---- knowledge in ----
  async processKnowledgePackage(pkg) {
    const project = this.requireProject();
    const v = validateKnowledgePackage(pkg);
    if (!v.valid) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `Knowledge package rejected: ${v.errors.slice(0, 3).join('; ')}`);
    if (pkg.projectId !== project.projectId) throw new AiProjectError(ErrorCodes.PROJECT_MISMATCH, 'Knowledge package is for a different project.');
    const rec = await this.history.get(pkg.analysisId);
    if (!rec) throw new AiProjectError(ErrorCodes.ANALYSIS_UNKNOWN, `Unknown analysisId ${pkg.analysisId}`);
    await this.scan(); // refresh hashes so staleness is judged against the current source
    const index = await loadStaticIndex(this.store);
    const coverageBefore = rec.coverageBefore || (await this.knowledge.coverage(await this.history.list()));
    const verified = await verifyPackage(pkg, { root: this.root, index });
    const { changes, report } = await reconcile({ projectStore: this.store, knowledgeStore: this.knowledge, verified, analysisId: pkg.analysisId, provider: pkg.source.provider, index });
    const doneHistory = await this.history.update(pkg.analysisId, { status: 'COMPLETED', provider: pkg.source.provider, model: pkg.source.model || null, completedAt: new Date().toISOString(), knowledgeChanges: { ...changes, counts: report.counts, conflicts: report.conflicts.length, rejected: report.rejected, stale: report.stale, unverified: report.unverified.length }, coverageBefore });
    await this.history.checkpoint(pkg.analysisId, { batchId: 'final', status: 'completed', responseReceived: true, knowledgeMerged: true });
    const coverage = await this.knowledge.coverage(await this.history.list());
    await this.history.update(pkg.analysisId, { coverageAfter: coverage });
    if (this.config.get('autoUpdateDocumentation') && this.documentation) await this.documentation.updateAll().catch((e) => logger.warn('KNOWLEDGE', 'auto documentation failed', { error: e.message }));
    this.emit('changed', 'knowledge');
    return { changes, report, coverage, history: doneHistory };
  }

  // ---- read models for the UI and commands ----
  async projectSummary() {
    if (!this.project) return {};
    const coverage = await this.knowledge.coverage(await this.history.list());
    return { coverage };
  }

  async state() {
    const base = { workspace: { root: path.basename(this.root) }, initialized: !!this.project, project: this.project, settings: this.config.all(), chrome: this.bridge.getStatus(), scanned: !!this.lastScan, lastScan: this.lastScan || null };
    if (!this.project) return base;
    const history = await this.history.list();
    const files = await this.knowledge.getFiles();
    const wf = await this.store.readJson('workflows/index.json', { workflows: [] });
    const feats = await this.store.readJson('features/index.json', { features: [] });
    const ents = await this.store.readJson('database/entities.json', { entities: [] });
    const apis = await this.store.readJson('index/apis.json', { apis: [] });
    const deps = await this.store.readJson('index/dependencies.json', { dependencies: {} });
    const docs = await this.knowledge.getDocStatus();
    const conflicts = await this.store.readJson('index/conflicts.json', { conflicts: [] });
    return {
      ...base,
      coverage: await this.knowledge.coverage(history),
      counts: { files: files.length, sourceFiles: files.filter((f) => f.isSource).length, workflows: wf.workflows.length, features: feats.features.length, entities: ents.entities.length, apis: apis.apis.length, dependencyEdges: Object.values(deps.dependencies).reduce((n, d) => n + d.internal.length, 0), conflicts: conflicts.conflicts.length },
      docStatus: summarizeDocs(docs),
      analyses: history.slice(-30).reverse().map(summarizeHistory),
      runner: this.bridge.runner.list(),
      delta: this.lastDelta || null,
    };
  }
}

const summarizeHistory = (h) => ({ analysisId: h.analysisId, mode: h.mode, purpose: h.purpose, status: h.status, provider: h.provider, timestamp: h.timestamp, files: h.files.length, batches: h.batches.length, completedBatches: h.checkpoints.filter((c) => c.status === 'completed' && c.batchId !== 'final').length, counts: h.knowledgeChanges && h.knowledgeChanges.counts });
function summarizeDocs(docs) {
  const c = { ANALYZED: 0, OUTDATED: 0, PARTIAL: 0 };
  for (const it of Object.values(docs.items)) c[it.status] = (c[it.status] || 0) + 1;
  return { total: Object.keys(docs.items).length, ...c };
}

module.exports = { ProjectManager };
