// Builds COMPARISON_REQUEST payloads and stores COMPARISON_RESPONSE results under .ai-project/comparisons/.
const { structuralDiff } = require('./projectComparator');
const { compareFeatures } = require('./featureComparator');
const { compareWorkflows } = require('./workflowComparator');
const { compareDatabases } = require('./databaseComparator');
const { compareArchitectures } = require('./architectureComparator');
const { compareDocumentation } = require('./documentationComparator');
const { nextSequentialId } = require('../utils/ids');

const KINDS = ['PROJECT', 'FEATURE', 'WORKFLOW', 'DATABASE', 'ARCHITECTURE', 'DOCUMENTATION'];
const FORBIDDEN_KEYS = new Set(['score', 'scores', 'rank', 'ranking', 'winner', 'best', 'overallScore', 'rating']);
const SECTIONS = ['commonApproaches', 'differences', 'architecturalDifferences', 'databaseDifferences', 'workflowDifferences', 'reusablePatterns', 'migrationConsiderations', 'unknowns'];

function structuralFor(kind, summaries, ids) {
  if (kind === 'FEATURE') return compareFeatures(summaries, ids);
  if (kind === 'WORKFLOW') return compareWorkflows(summaries, ids);
  if (kind === 'DATABASE') return compareDatabases(summaries);
  if (kind === 'DOCUMENTATION') return compareDocumentation(summaries);
  if (kind === 'ARCHITECTURE') return compareArchitectures(summaries);
  return structuralDiff(summaries);
}

function buildComparisonRequest({ kind, summaries, ids = [] }) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown comparison kind ${kind}`);
  if (summaries.length < 2) throw new Error('Select at least two projects to compare.');
  return {
    kind,
    projects: summaries,
    structural: structuralFor(kind, summaries, ids), // deterministic facts computed from source knowledge
    selection: ids,
    instructions: { noScoring: true, noRanking: true, recordConflicts: true, useEvidenceLabels: true, sections: SECTIONS },
  };
}

// Strips any scoring/ranking keys (spec: never rank or score projects).
function stripRanking(v) {
  if (Array.isArray(v)) return v.map(stripRanking);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !FORBIDDEN_KEYS.has(k)).map(([k, x]) => [k, stripRanking(x)]));
  return v;
}

async function storeComparison(store, payload) {
  if (!payload || !KINDS.includes(payload.kind) || typeof payload.result !== 'object' || payload.result === null) throw new Error('Invalid comparison response.');
  const result = stripRanking(payload.result);
  for (const s of SECTIONS) if (!Array.isArray(result[s])) result[s] = [];
  const existing = (await store.listDir('comparisons')).map((n) => n.replace(/\.(json|md)$/, ''));
  const id = nextSequentialId('comparison', existing);
  const record = { comparisonId: id, kind: payload.kind, createdAt: new Date().toISOString(), projects: (payload.projects || []).map((p) => ({ projectId: String(p.projectId || ''), name: String(p.name || '') })), provider: payload.provider || null, result, conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [] };
  await store.writeJson(`comparisons/${id}.json`, record);
  const md = [`# Comparison ${id} (${record.kind})`, '', `Projects: ${record.projects.map((p) => p.name || p.projectId).join(', ')}`, '', ...SECTIONS.flatMap((s) => [`## ${s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}`, result[s].length ? result[s].map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : '_None reported._', '']), record.conflicts.length ? `## Conflicts\n${record.conflicts.map((c) => `- CONFLICT: ${JSON.stringify(c)}`).join('\n')}\n` : ''].join('\n');
  await store.writeText(`comparisons/${id}.md`, md);
  return record;
}

module.exports = { buildComparisonRequest, storeComparison, stripRanking, KINDS, SECTIONS };
