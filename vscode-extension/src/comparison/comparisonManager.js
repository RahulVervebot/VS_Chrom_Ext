// Builds COMPARISON_REQUEST payloads and stores COMPARISON_RESPONSE results under .ai-project/comparisons/.
const { structuralDiff } = require('./projectComparator');
const { compareFeatures } = require('./featureComparator');
const { compareWorkflows } = require('./workflowComparator');
const { compareDatabases } = require('./databaseComparator');
const { compareArchitectures } = require('./architectureComparator');
const { compareDocumentation } = require('./documentationComparator');
const { compareScoped } = require('./scopedComparator');
const { nextSequentialId } = require('../utils/ids');

const KINDS = ['PROJECT', 'FEATURE', 'WORKFLOW', 'DATABASE', 'ARCHITECTURE', 'DOCUMENTATION', 'SPEC'];
const FORBIDDEN_KEYS = new Set(['score', 'scores', 'rank', 'ranking', 'winner', 'best', 'overallScore', 'rating']);
const SECTIONS = ['commonApproaches', 'differences', 'architecturalDifferences', 'databaseDifferences', 'workflowDifferences', 'reusablePatterns', 'migrationConsiderations', 'unknowns'];

function structuralFor(kind, summaries, ids) {
  if (summaries.every((s) => s.scope)) return compareScoped(summaries); // the user picked a part of each project: compare only that part
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
    ...(summaries.every((s) => s.scope) ? { scopes: summaries.map((s) => ({ projectId: s.project.projectId, project: s.project.name, label: s.scope.label, files: s.scope.files })) } : {}),
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

const mdOf = (record) => {
  const result = record.result;
  const sect = SECTIONS.flatMap((s) => [`## ${s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}`, result[s].length ? result[s].map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : '_None reported._', '']);
  const ai = record.ai ? ['', `# AI analysis (${record.ai.provider || 'unknown provider'})`, '', ...SECTIONS.flatMap((s) => [`## ${s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}`, (record.ai.result[s] || []).length ? record.ai.result[s].map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : '_None reported._', ''])] : [];
  return [`# Comparison ${record.comparisonId} (${record.kind})`, '', `Projects: ${record.projects.map((p) => p.name || p.projectId).join(', ')}`, '', ...(record.scopes ? ['Compared parts only:', ...record.scopes.map((s) => `- ${s.project}: ${s.label} (${s.files.length} file(s))`), ''] : []), ...sect, record.conflicts.length ? `## Conflicts\n${record.conflicts.map((c) => `- CONFLICT: ${JSON.stringify(c)}`).join('\n')}\n` : '', ...ai].join('\n');
};

// Instant, deterministic comparison of project specifications (no AI). `matrices` come from spec/specComparator.
async function storeSpecComparison(store, { matrices }) {
  if (!Array.isArray(matrices) || !matrices.length) throw new Error('Nothing to store.');
  const existing = (await store.listDir('comparisons')).map((n) => n.replace(/\.(json|md)$/, ''));
  const id = nextSequentialId('comparison', existing);
  const result = Object.fromEntries(SECTIONS.map((s) => [s, []]));
  for (const m of matrices) {
    for (const c of m.categories) {
      if (c.counts.common) result.commonApproaches.push(`${m.a.name} / ${m.b.name} · ${c.title}: ${c.counts.common} in common (${c.common.slice(0, 6).map((x) => x.label).join('; ')}${c.counts.common > 6 ? '; …' : ''})`);
      if (c.counts.onlyA || c.counts.onlyB) result.differences.push(`${c.title}: ${c.counts.onlyA} only in ${m.a.name}${c.onlyA.length ? ` (${c.onlyA.slice(0, 6).map((x) => x.label).join('; ')})` : ''}; ${c.counts.onlyB} only in ${m.b.name}${c.onlyB.length ? ` (${c.onlyB.slice(0, 6).map((x) => x.label).join('; ')})` : ''}`);
      if (['tables', 'fields', 'relationships'].includes(c.id) && (c.counts.onlyA || c.counts.onlyB)) result.databaseDifferences.push(`${c.title}: only in ${m.a.name}: ${c.onlyA.map((x) => x.label).join('; ') || 'none'} · only in ${m.b.name}: ${c.onlyB.map((x) => x.label).join('; ') || 'none'}`);
      if (c.id === 'workflows' && (c.counts.onlyA || c.counts.onlyB)) result.workflowDifferences.push(`Only in ${m.a.name}: ${c.onlyA.map((x) => x.label).join('; ') || 'none'} · only in ${m.b.name}: ${c.onlyB.map((x) => x.label).join('; ') || 'none'}`);
      if (['layers', 'auth', 'modules'].includes(c.id) && (c.counts.onlyA || c.counts.onlyB)) result.architecturalDifferences.push(`${c.title}: only in ${m.a.name}: ${c.onlyA.map((x) => x.label).join('; ') || 'none'} · only in ${m.b.name}: ${c.onlyB.map((x) => x.label).join('; ') || 'none'}`);
      for (const d of c.different) result.migrationConsiderations.push(`${d.label}: ${m.a.name} = ${d.a || '–'}, ${m.b.name} = ${d.b || '–'} (${d.why})`);
    }
    for (const s of m.suggestions.filter((x) => x.direction === 'adopt')) result.reusablePatterns.push(`${s.title}: ${s.items.slice(0, 6).join('; ')}${s.more ? '; …' : ''}`);
    for (const side of [m.a, m.b]) if (side.coverage.status !== 'COMPLETE') result.unknowns.push(`${side.name}: only ${side.coverage.filesAnalyzed} of ${side.coverage.filesTotal} files have been analysed by AI (${side.coverage.status}); the comparison reflects what static analysis and AI knowledge established so far.`);
  }
  const first = matrices[0];
  const record = { comparisonId: id, kind: 'SPEC', source: 'local', createdAt: new Date().toISOString(), projects: [first.a, ...matrices.map((m) => m.b)].map((p) => ({ projectId: p.projectId, name: p.name })), provider: null, result, conflicts: [], matrices, ai: null };
  await store.writeJson(`comparisons/${id}.json`, record);
  await store.writeText(`comparisons/${id}.md`, mdOf(record));
  return record;
}

async function storeComparison(store, payload) {
  if (payload && payload.ref && /^comparison-\d{3,}$/.test(String(payload.ref))) { // the AI's answer to a local spec comparison: keep both in one record
    const rec = await store.readJson(`comparisons/${payload.ref}.json`, null);
    if (rec && rec.kind === 'SPEC') {
      const result = stripRanking(payload.result || {});
      for (const s of SECTIONS) if (!Array.isArray(result[s])) result[s] = [];
      rec.ai = { result, conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [], provider: payload.provider || null, receivedAt: new Date().toISOString() };
      await store.writeJson(`comparisons/${rec.comparisonId}.json`, rec);
      await store.writeText(`comparisons/${rec.comparisonId}.md`, mdOf(rec));
      return rec;
    }
  }
  if (!payload || !KINDS.includes(payload.kind) || typeof payload.result !== 'object' || payload.result === null) throw new Error('Invalid comparison response.');
  const result = stripRanking(payload.result);
  for (const s of SECTIONS) if (!Array.isArray(result[s])) result[s] = [];
  const existing = (await store.listDir('comparisons')).map((n) => n.replace(/\.(json|md)$/, ''));
  const id = nextSequentialId('comparison', existing);
  const record = { comparisonId: id, kind: payload.kind, createdAt: new Date().toISOString(), projects: (payload.projects || []).map((p) => ({ projectId: String(p.projectId || ''), name: String(p.name || '') })), provider: payload.provider || null, ...(Array.isArray(payload.scopes) ? { scopes: payload.scopes.slice(0, 10).map((s) => ({ project: String(s.project || '').slice(0, 120), label: String(s.label || '').slice(0, 300), files: (Array.isArray(s.files) ? s.files : []).slice(0, 100).map((f) => String(f).slice(0, 300)) })) } : {}), result, conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [] };
  await store.writeJson(`comparisons/${id}.json`, record);
  const md = [`# Comparison ${id} (${record.kind})`, '', `Projects: ${record.projects.map((p) => p.name || p.projectId).join(', ')}`, '', ...(record.scopes ? ['Compared parts only:', ...record.scopes.map((s) => `- ${s.project}: ${s.label} (${s.files.length} file(s))`), ''] : []), ...SECTIONS.flatMap((s) => [`## ${s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}`, result[s].length ? result[s].map((x) => `- ${typeof x === 'string' ? x : JSON.stringify(x)}`).join('\n') : '_None reported._', '']), record.conflicts.length ? `## Conflicts\n${record.conflicts.map((c) => `- CONFLICT: ${JSON.stringify(c)}`).join('\n')}\n` : ''].join('\n');
  await store.writeText(`comparisons/${id}.md`, md);
  return record;
}

module.exports = { buildComparisonRequest, storeComparison, storeSpecComparison, stripRanking, KINDS, SECTIONS };
