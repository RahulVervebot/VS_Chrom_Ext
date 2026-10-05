// Blueprints are planning artifacts. They are stored, never applied to source automatically.
const REQUIRED = ['purpose', 'technologyStack', 'architecture', 'modules', 'features', 'workflows', 'database', 'apis', 'businessRules', 'externalServices', 'authentication', 'authorization', 'stateManagement', 'folderStructure', 'environmentRequirements', 'commands'];

function buildBlueprintRequest({ summaries, requirements, specs, gaps }) {
  if (!summaries.length) throw new Error('Select at least one project as a blueprint input.');
  if (!requirements || !String(requirements).trim()) throw new Error('Enter the requirements for the new project.');
  return { projects: summaries, ...(specs && specs.length ? { specs } : {}), ...(gaps && gaps.length ? { gaps } : {}), requirements: String(requirements).slice(0, 20000), instructions: { planningOnly: true, recordConflicts: true, noSilentChoices: true, sections: REQUIRED } };
}

async function storeBlueprint(store, payload) {
  const bp = payload && payload.blueprint;
  if (!bp || typeof bp !== 'object') throw new Error('Invalid blueprint response.');
  const missing = REQUIRED.filter((k) => bp[k] === undefined);
  const prev = await store.readJson('generation/project-blueprint.json', null);
  if (prev) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await store.writeJson(`snapshots/blueprint-${stamp}.json`, prev);
  }
  const record = { type: 'PROJECT_BLUEPRINT', schemaVersion: '1.0', createdAt: new Date().toISOString(), inputs: (payload.projects || []).map((p) => ({ projectId: String(p.projectId || ''), name: String(p.name || '') })), requirements: payload.requirements || null, provider: payload.provider || null, missingSections: missing, conflicts: Array.isArray(bp.conflicts) ? bp.conflicts : [], blueprint: bp, appliedToSource: false };
  await store.writeJson('generation/project-blueprint.json', record);
  return record;
}

module.exports = { buildBlueprintRequest, storeBlueprint, REQUIRED };
