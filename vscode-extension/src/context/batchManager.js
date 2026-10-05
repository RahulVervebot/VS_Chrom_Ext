// Token-aware, dependency-aware batching. Files are ordered so related files (dependencies, same folder) land together.
const { estimateTokens } = require('../scanner/tokenEstimator');

function orderForBatching(files, analysis) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const visited = new Set();
  const ordered = [];
  const visit = (p) => {
    if (visited.has(p) || !byPath.has(p)) return;
    visited.add(p);
    ordered.push(byPath.get(p));
    const deps = ((analysis.dependencies[p] || {}).internal || []).map((d) => d.path).sort();
    for (const d of deps) visit(d);
  };
  // Start with primary files (priority 0), folder-sorted to keep neighbours together.
  const primaries = files.filter((f) => f.priority === 0).map((f) => f.path).sort();
  primaries.forEach(visit);
  files.map((f) => f.path).sort().forEach(visit);
  return ordered;
}

// batches: [{ batchId, batchNumber, totalBatches, files, tokens }]
function createBatches(files, analysis, { maxTokens, maxFiles = 40 }) {
  const ordered = orderForBatching(files, analysis);
  const batches = [];
  let cur = { files: [], tokens: 0 };
  const flush = () => { if (cur.files.length) batches.push(cur); cur = { files: [], tokens: 0 }; };
  for (const f of ordered) {
    const t = f.tokens || estimateTokens(f.content);
    if (cur.files.length && (cur.tokens + t > maxTokens || cur.files.length >= maxFiles)) flush();
    cur.files.push(f);
    cur.tokens += t; // a single oversized file still gets its own batch
  }
  flush();
  return batches.map((b, i) => ({ batchId: `batch-${String(i + 1).padStart(3, '0')}`, batchNumber: i + 1, totalBatches: batches.length, files: b.files, tokens: b.tokens }));
}

// Structured cross-batch state (not chat history): what earlier batches established.
function crossBatchState(previousBatches, analysis, priorFindings = []) {
  const paths = new Set(previousBatches.flatMap((b) => b.files.map((f) => f.path)));
  return {
    knownFiles: [...paths],
    knownSymbols: [...paths].flatMap((p) => (analysis.files.find((a) => a.path === p) || { symbols: [] }).symbols.filter((s) => s.exported).map((s) => ({ name: s.name, file: p, type: s.type }))).slice(0, 300),
    knownAPIs: analysis.apis.filter((a) => paths.has(a.file)).map((a) => `${a.method} ${a.endpoint}`),
    knownDatabaseEntities: analysis.database.entities.filter((e) => e.file && paths.has(e.file)).map((e) => e.name),
    knownWorkflows: analysis.workflows.filter((w) => w.summary.files.some((f) => paths.has(f))).map((w) => w.id),
    knownFeatures: analysis.features.filter((f) => f.files.some((x) => paths.has(x))).map((f) => f.id),
    knownDependencies: [...paths].flatMap((p) => ((analysis.dependencies[p] || {}).internal || []).map((d) => ({ from: p, to: d.path }))).slice(0, 500),
    unknowns: [],
    previousFindings: priorFindings,
  };
}

module.exports = { createBatches, crossBatchState, orderForBatching };
