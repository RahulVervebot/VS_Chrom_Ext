// A "campaign" analyses a whole selection (the entire project or folders) in as many runs as it takes.
// VS Code keeps the ordered list of files and a cursor, starts each next run by itself when the previous one completed, and resumes
// from the cursor after a failure, a stop, a disconnect or a restart. The user approves the campaign once (in Chrome, on its first run).
const { selectFiles } = require('../context/contextSelector');
const { moduleDocId } = require('../knowledge/reconciliationEngine');
const logger = require('../utils/logger');

const FILE = 'history/campaign.json';
const LIVE_RUN = new Set(['SENT', 'IN_PROGRESS', 'PAUSED', 'DISCONNECTED', 'FAILED', 'CANCELLED']); // a cancelled run keeps its finished batches and is resumed, not redone

class CampaignManager {
  constructor({ pm }) { this.pm = pm; this.timer = null; }

  get store() { return this.pm.store; }
  async get() { return this.store.readJson(FILE, null); }
  async save(c) { await this.store.writeJson(FILE, c); this.pm.emit('changed', 'campaign'); return c; }

  async progress() {
    const c = await this.get();
    if (!c) return null;
    const idx = new Map((await this.pm.knowledge.getFiles()).map((f) => [f.path, f.status]));
    const analyzed = c.queue.filter((p) => idx.get(p) === 'ANALYZED').length;
    return { ...c, queue: undefined, moduleStage: c.moduleStage ? { status: c.moduleStage.status, modules: c.moduleStage.manifests.length, skipped: !!c.moduleStage.skipped } : null, total: c.queue.length, cursor: c.cursor, analyzedNow: analyzed, remaining: Math.max(0, c.queue.length - c.cursor), estimatedRuns: Math.max(1, Math.ceil(c.queue.length / c.perRun)) };
  }

  get order() { return { first: this.pm.config.get('readFirst'), last: this.pm.config.get('readLast') }; }

  // The ordered list of files the campaign will work through (analyzed-and-unchanged files are left out unless `reanalyze`).
  // Before any file, the module overview: the manifests of the sub-projects (add-ons, packages…) whose overview is missing or whose
  // manifest changed, read in dependency order, so the AI knows what each module is for before it reads the module's code.
  async plan({ mode, selection, reanalyze }) {
    const analysis = await this.pm.ensureAnalysis();
    const fileIndex = await this.pm.knowledge.getFiles();
    const { files, skipped } = selectFiles({ mode, selection, analysis, files: fileIndex, reanalyze, order: this.order });
    const manifests = [];
    if (this.pm.config.get('moduleOverviewFirst') !== false && (analysis.moduleInsights || []).length) {
      const mods = selectFiles({ mode: 'MODULES', selection, analysis, files: fileIndex, order: this.order }).files;
      const hash = new Map(fileIndex.map((f) => [f.path, f.hash]));
      for (const p of mods) {
        const mi = analysis.moduleInsights.find((m) => p.startsWith(`${m.path}/`) && !p.slice(m.path.length + 1).includes('/'));
        const doc = mi ? await this.store.readJson(`modules/${moduleDocId(mi)}.json`, null) : null;
        if (reanalyze || !doc || !doc.knowledge || !doc.knowledge.purpose || doc.manifestHash !== hash.get(p)) manifests.push(p);
      }
    }
    return { queue: files, skipped, manifests };
  }

  async start({ mode, selection = {}, purpose, intent = 'UNDERSTAND', reanalyze = false }) {
    this.pm.requireProject();
    const existing = await this.get();
    if (existing && existing.status === 'ACTIVE') throw new Error(`An analysis campaign is already running (${existing.cursor} of ${existing.queue.length} files done). Stop it first, or continue it.`);
    const { queue, skipped, manifests } = await this.plan({ mode, selection, reanalyze });
    if (!queue.length && !manifests.length) { const e = new Error(skipped ? `All ${skipped} file(s) in this selection are already analyzed and unchanged. Re-analyze them if you want to run them again.` : 'The selection contains no analyzable source files.'); e.code = 'NOTHING_TO_DO'; e.skipped = skipped; throw e; }
    const id = `campaign-${Date.now().toString(36)}`;
    const clean = { files: selection.files || [], folders: selection.folders || [], features: selection.features || [], workflows: selection.workflows || [], project: !!selection.project };
    const c = { id, status: 'ACTIVE', mode, selection: clean, purpose: purpose || null, intent, reanalyze: !!reanalyze, queue, moduleStage: manifests.length ? { status: 'PENDING', manifests } : null, cursor: 0, perRun: Math.max(1, this.pm.config.get('maxFilesPerAnalysis') || 200), runs: [], skippedAtStart: skipped, startedAt: new Date().toISOString(), lastError: null };
    await this.save(c);
    return this.nextRun();
  }

  // Sends the next slice of the queue as one analysis run.
  async nextRun() {
    const c = await this.get();
    if (!c || c.status !== 'ACTIVE') return null;
    if (c.moduleStage && c.moduleStage.status !== 'DONE') return this.moduleRun(c);
    if (c.cursor >= c.queue.length) return this.finish(c);
    const slice = c.queue.slice(c.cursor, c.cursor + c.perRun);
    const run = c.runs.length + 1;
    const estimatedRuns = Math.max(run, Math.ceil(c.queue.length / c.perRun));
    try {
      const snap = await this.pm.startAnalysis({ mode: c.mode, selection: { ...c.selection, pinnedFiles: slice, pinnedOrder: true }, purpose: c.purpose || undefined, intent: c.intent, reanalyze: true, campaign: { id: c.id, run, estimatedRuns, filesInRun: slice.length, filesDone: c.cursor, filesTotal: c.queue.length, autoAccept: run > 1 } });
      const fresh = await this.get();
      fresh.runs.push({ analysisId: snap.analysisId, files: slice.length, startedAt: new Date().toISOString() });
      fresh.lastError = null;
      await this.save(fresh);
      return snap;
    } catch (e) { // e.g. Chrome is not connected: the campaign stays ACTIVE and continues when Chrome is back
      const fresh = await this.get();
      fresh.lastError = e.message;
      await this.save(fresh);
      logger.warn('ANALYSIS', 'campaign could not start its next run yet', { error: e.message });
      return null;
    }
  }

  // Stage 1 of a campaign: the module overview (manifests + static facts per module), one run, resumable like any other run.
  async moduleRun(c) {
    const run = c.runs.length + 1;
    const estimatedRuns = 1 + Math.ceil(c.queue.length / c.perRun);
    try {
      const snap = await this.pm.startAnalysis({ mode: 'MODULES', selection: { ...c.selection, pinnedFiles: c.moduleStage.manifests, pinnedOrder: true }, purpose: 'module overview: what each add-on/package is for, its features and how it works', intent: 'UNDERSTAND', reanalyze: true, campaign: { id: c.id, run, estimatedRuns, filesInRun: c.moduleStage.manifests.length, filesDone: 0, filesTotal: c.queue.length, autoAccept: false, stage: 'MODULES' } });
      const fresh = await this.get();
      fresh.runs.push({ analysisId: snap.analysisId, files: 0, modules: c.moduleStage.manifests.length, stage: 'MODULES', startedAt: new Date().toISOString() });
      fresh.moduleStage.status = 'RUNNING';
      fresh.lastError = null;
      await this.save(fresh);
      return snap;
    } catch (e) {
      const fresh = await this.get();
      fresh.lastError = e.message;
      await this.save(fresh);
      logger.warn('ANALYSIS', 'campaign could not start the module overview yet', { error: e.message });
      return null;
    }
  }

  // The user can go straight to the files (e.g. the overview keeps failing); the overview can be run later from the Modules page.
  async skipModuleStage() {
    const c = await this.get();
    if (!c || !c.moduleStage || c.moduleStage.status === 'DONE') return c;
    c.moduleStage.status = 'DONE'; c.moduleStage.skipped = true;
    const last = c.runs[c.runs.length - 1];
    if (last && last.stage === 'MODULES' && !last.done) { c.runs.pop(); if (this.pm.bridge.runner.runs.has(last.analysisId)) { try { this.pm.bridge.runner.cancel(last.analysisId); } catch { /* finished */ } } }
    await this.save(c);
    if (c.status === 'ACTIVE') return this.nextRun();
    return c;
  }

  // Called when a run's knowledge was accepted by VS Code.
  async onRunCompleted(analysisId) {
    const c = await this.get();
    if (!c || c.status !== 'ACTIVE') return;
    const r = c.runs.find((x) => x.analysisId === analysisId);
    if (!r || r.done) return;
    r.done = true; r.completedAt = new Date().toISOString();
    if (r.stage === 'MODULES') { if (c.moduleStage) c.moduleStage.status = 'DONE'; } else c.cursor = Math.min(c.queue.length, c.cursor + r.files);
    await this.save(c);
    if (c.cursor >= c.queue.length && !(c.moduleStage && c.moduleStage.status !== 'DONE')) { await this.finish(c); return; }
    clearTimeout(this.timer); // outside the message handler that delivered the result
    this.timer = setTimeout(() => { this.nextRun().catch((e) => logger.warn('ANALYSIS', 'campaign next run failed', { error: e.message })); }, 800);
    if (this.timer.unref) this.timer.unref();
  }

  async finish(c) {
    c.status = 'DONE'; c.finishedAt = new Date().toISOString();
    const idx = new Map((await this.pm.knowledge.getFiles()).map((f) => [f.path, f.status]));
    c.notAnalyzed = c.queue.filter((p) => idx.get(p) !== 'ANALYZED').length; // e.g. batches the user skipped or that failed
    await this.save(c);
    return null;
  }

  async stop() {
    const c = await this.get();
    if (!c || c.status !== 'ACTIVE') return c;
    clearTimeout(this.timer);
    c.status = 'STOPPED'; c.stoppedAt = new Date().toISOString();
    await this.save(c);
    const last = c.runs[c.runs.length - 1];
    if (last && !last.done && this.pm.bridge.runner.runs.has(last.analysisId)) { try { this.pm.bridge.runner.cancel(last.analysisId); } catch { /* already finished */ } }
    return c;
  }

  // Continue from where it stopped: finish the interrupted run if there is one, otherwise start the next slice.
  async resume() {
    let c = await this.get();
    if (!c) throw new Error('There is no analysis to continue.');
    if (c.status === 'DONE') throw new Error('The last analysis campaign is already complete.');
    if (c.status !== 'ACTIVE') { c.status = 'ACTIVE'; c.lastError = null; await this.save(c); }
    const last = c.runs[c.runs.length - 1];
    if (last && !last.done) {
      const rec = await this.pm.history.get(last.analysisId);
      if (rec && LIVE_RUN.has(rec.status) && this.pm.bridge.activeConnection()) { try { return await this.pm.resumeAnalysis(last.analysisId); } catch (e) { logger.warn('ANALYSIS', 'could not resume the interrupted run; starting it again', { error: e.message }); } }
      c = await this.get(); c.runs.pop(); await this.save(c); // the run cannot be resumed (cancelled): the same slice is sent again
    }
    return this.nextRun();
  }

  // Chrome connected (again): an active campaign carries on by itself.
  async onChromeConnected() {
    const c = await this.get();
    if (!c || c.status !== 'ACTIVE') return;
    const last = c.runs[c.runs.length - 1];
    const live = last && !last.done && this.pm.bridge.runner.runs.has(last.analysisId) && ['IN_PROGRESS', 'AWAITING_ACCEPT', 'PAUSED', 'WAITING_PACKAGE'].includes(this.pm.bridge.runner.runs.get(last.analysisId).status);
    if (live) return; // the runner resumes it itself
    this.resume().catch((e) => logger.warn('ANALYSIS', 'campaign could not continue after reconnecting', { error: e.message }));
  }

  // A run was cancelled (by the user, in either extension): the campaign stops with it.
  async onRunCancelled(analysisId) {
    const c = await this.get();
    if (!c || c.status !== 'ACTIVE') return;
    const last = c.runs[c.runs.length - 1];
    if (last && last.analysisId === analysisId && !last.done) { c.status = 'STOPPED'; c.stoppedAt = new Date().toISOString(); await this.save(c); }
  }
}

module.exports = { CampaignManager };
