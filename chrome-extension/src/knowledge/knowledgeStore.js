// Chrome-side persistence: analyses (with per-batch checkpoints), registered projects, and results of documentation/comparison/blueprint.
// Chrome is NOT the source of truth: everything here is a working copy that VS Code re-verifies.
import { storage, update } from '../utils/storage.js';

const KEYS = { analyses: 'analyses', projects: 'projects', results: 'results' };

export const knowledgeStore = {
  async getAnalyses() { return storage.get(KEYS.analyses, {}); },
  async getAnalysis(id) { return (await storage.get(KEYS.analyses, {}))[id] || null; },
  saveAnalysis(id, patch) { return update(KEYS.analyses, (all) => ({ ...all, [id]: { ...(all[id] || {}), ...patch, updatedAt: new Date().toISOString() } }), {}); },
  // Checkpoint after every successful AI response: analysisId, batchId, status, response, knowledge, timestamp.
  checkpoint(analysisId, batchId, data) {
    return update(KEYS.analyses, (all) => {
      const a = all[analysisId] || { batches: {} };
      const batches = { ...(a.batches || {}), [batchId]: { ...((a.batches || {})[batchId] || {}), ...data, batchId, analysisId, timestamp: new Date().toISOString() } };
      return { ...all, [analysisId]: { ...a, batches, updatedAt: new Date().toISOString() } };
    }, {});
  },
  async completedBatches(analysisId) { const a = await this.getAnalysis(analysisId); return Object.values((a && a.batches) || {}).filter((b) => b.status === 'completed').map((b) => b.batchId); },
  async batchKnowledge(analysisId) { const a = await this.getAnalysis(analysisId); return Object.values((a && a.batches) || {}).filter((b) => b.status === 'completed' && b.knowledge).sort((x, y) => (x.batchNumber || 0) - (y.batchNumber || 0)).map((b) => b.knowledge); },
  // Deletes analyses (and the batch prompts kept for retrying them) whose status is in `statuses`. Returns how many were removed.
  async removeByStatus(statuses) {
    const all = await storage.get(KEYS.analyses, {});
    const ids = Object.keys(all).filter((k) => statuses.includes(all[k].status));
    for (const id of ids) await this.removeAnalysis(id);
    if (ids.length) await update('batchPayloads', (b) => Object.fromEntries(Object.entries(b || {}).filter(([k]) => !ids.some((id) => k.startsWith(`${id}/`)))), {});
    return ids.length;
  },
  async removeAnalysisWithPayloads(id) { await this.removeAnalysis(id); await update('batchPayloads', (b) => Object.fromEntries(Object.entries(b || {}).filter(([k]) => !k.startsWith(`${id}/`))), {}); },
  removeAnalysis(id) { return update(KEYS.analyses, (all) => { const n = { ...all }; delete n[id]; return n; }, {}); },

  registerProject(p) { return update(KEYS.projects, (all) => ({ ...all, [p.projectId]: { ...(all[p.projectId] || {}), ...p, lastSeen: new Date().toISOString() } }), {}); },
  async getProjects() { return storage.get(KEYS.projects, {}); },

  addResult(kind, record) { return update(KEYS.results, (all) => [...all, { kind, at: new Date().toISOString(), ...record }].slice(-100), []); },
  async getResults(kind) { const all = await storage.get(KEYS.results, []); return kind ? all.filter((r) => r.kind === kind) : all; },
};
