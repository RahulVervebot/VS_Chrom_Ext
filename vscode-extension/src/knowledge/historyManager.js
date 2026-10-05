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

  // Analyses that can be resumed.
  async resumable() {
    return (await this.list()).filter((r) => ['SENT', 'IN_PROGRESS', 'PAUSED', 'DISCONNECTED', 'FAILED'].includes(r.status));
  }
}

module.exports = { HistoryManager };
