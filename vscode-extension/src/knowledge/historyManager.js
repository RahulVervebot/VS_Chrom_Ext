// Analysis sessions: same projectId, different analysisId. History is preserved, never overwritten.
const { nextSequentialId } = require('../utils/ids');

class HistoryManager {
  constructor(store) { this.store = store; }

  async list() {
    const names = (await this.store.listDir('history')).filter((n) => /^analysis-\d+\.json$/.test(n)).sort();
    const out = [];
    for (const n of names) out.push(await this.store.readJson(`history/${n}`));
    return out;
  }

  async get(analysisId) {
    if (!/^analysis-\d+$/.test(analysisId)) return null;
    return this.store.readJson(`history/${analysisId}.json`, null);
  }

  async create({ projectId, mode, purpose, selection, files, provider }) {
    const existing = (await this.store.listDir('history')).map((n) => n.replace(/\.json$/, ''));
    const analysisId = nextSequentialId('analysis', existing);
    const record = {
      analysisId,
      projectId,
      timestamp: new Date().toISOString(),
      mode,
      purpose: purpose || null,
      selection: selection || { files: [], folders: [], features: [], workflows: [] },
      files: files || [], // [{path, hash}] at time of analysis
      status: 'CREATED',
      provider: provider || null,
      batches: [],
      checkpoints: [],
      knowledgeChanges: null,
      coverageBefore: null,
      coverageAfter: null,
    };
    await this.store.writeJson(`history/${analysisId}.json`, record);
    return record;
  }

  async update(analysisId, patch) {
    if (!/^analysis-\d+$/.test(analysisId)) throw new Error(`Unknown analysis ${analysisId}`);
    return this.store.update(`history/${analysisId}.json`, (rec) => {
      if (!rec) throw new Error(`Unknown analysis ${analysisId}`);
      return { ...rec, ...patch, updatedAt: new Date().toISOString() };
    }, null);
  }

  // Checkpoint after every successful batch, so an interrupted analysis resumes without repeating work.
  async checkpoint(analysisId, cp) {
    if (!/^analysis-\d+$/.test(analysisId)) throw new Error(`Unknown analysis ${analysisId}`);
    return this.store.update(`history/${analysisId}.json`, (rec) => {
      if (!rec) throw new Error(`Unknown analysis ${analysisId}`);
      const existing = rec.checkpoints.filter((c) => c.batchId !== cp.batchId);
      existing.push({ analysisId, batchId: cp.batchId, status: cp.status, responseReceived: !!cp.responseReceived, knowledgeMerged: !!cp.knowledgeMerged, timestamp: new Date().toISOString() });
      return { ...rec, checkpoints: existing, updatedAt: new Date().toISOString() };
    }, null);
  }

  completedBatchIds(record) {
    return new Set(record.checkpoints.filter((c) => c.status === 'completed' && c.responseReceived).map((c) => c.batchId));
  }

  // Analyses the user may resume by hand: the interrupted ones plus cancelled runs, whose finished batches are kept.
  async resumableByUser() { return (await this.list()).filter((r) => ['SENT', 'IN_PROGRESS', 'PAUSED', 'DISCONNECTED', 'FAILED', 'CANCELLED'].includes(r.status)); }

  // Removes a record of a run that produced no knowledge (cancelled, failed, never started). Completed analyses are the provenance of what is known and stay.
  async remove(analysisId) {
    const r = await this.get(analysisId);
    if (!r) return false;
    if (r.status === 'COMPLETED') throw new Error(`${analysisId} is completed: its knowledge is traced back to it, so it is kept.`);
    await this.store.remove(`history/${analysisId}.json`);
    return true;
  }

  // Analyses that can be resumed.
  async resumable() {
    return (await this.list()).filter((r) => ['SENT', 'IN_PROGRESS', 'PAUSED', 'DISCONNECTED', 'FAILED'].includes(r.status));
  }
}

module.exports = { HistoryManager };
