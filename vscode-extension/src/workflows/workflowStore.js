// Persists workflows under .ai-project/workflows/. Static traces are re-derived on each analysis;
// AI-provided fields (purpose, documentation) on existing workflows are preserved.
function toIndexEntry(w) {
  return { id: w.id, name: w.name, status: w.status, trigger: w.trigger.type, api: w.api, files: w.summary.files.length, databaseWrites: w.summary.databaseWrites, sourceFiles: w.summary.files };
}

class WorkflowStore {
  constructor(store) { this.store = store; }

  async list() { return (await this.store.readJson('workflows/index.json', { workflows: [] })).workflows; }

  async get(id) { return this.store.readJson(`workflows/${id}.json`, null); }

  async saveAll(workflows) {
    const existingIds = (await this.list()).map((w) => w.id);
    for (const w of workflows) {
      const prev = await this.get(w.id);
      const merged = prev ? { ...w, knowledge: prev.knowledge || null } : { ...w, knowledge: null };
      if (prev && prev.origin === 'AI' && !w.steps.length) continue;
      await this.store.writeJson(`workflows/${w.id}.json`, merged);
    }
    await this.store.writeJson('workflows/index.json', { workflows: workflows.map(toIndexEntry), generatedAt: new Date().toISOString() });
    return { written: workflows.length, removed: existingIds.filter((id) => !workflows.some((w) => w.id === id)) };
  }
}

module.exports = { WorkflowStore };
