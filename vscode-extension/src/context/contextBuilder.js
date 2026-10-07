// Builds dependency-aware, secret-free analysis batches from the actual project on disk.
const fs = require('fs');
const { resolveInside } = require('../utils/paths');
const { selectFiles } = require('./contextSelector');
const { dependencyContext } = require('./dependencyContext');
const { workflowContext } = require('./workflowContext');
const { databaseContext } = require('./databaseContext');
const { featureContext } = require('./featureContext');
const { projectContext } = require('./projectContext');
const { reduceContext } = require('./contextReducer');
const { validateOutbound } = require('./contextValidator');
const { createBatches, crossBatchState } = require('./batchManager');
const { redact } = require('../security/secretDetector');
const { estimateTokens } = require('../scanner/tokenEstimator');
const logger = require('../utils/logger');

const INSTRUCTIONS = { sourceOfTruth: 'SOURCE_CODE', doNotInvent: true, useEvidenceLabels: true };

async function readContent(root, rel, detectSecrets) {
  const abs = resolveInside(root, rel);
  const raw = await fs.promises.readFile(abs, 'utf8');
  if (!detectSecrets) return { text: raw, findings: [] };
  return redact(raw, rel);
}

async function build({ root, project, analysisId, mode, purpose, intent = 'UNDERSTAND', selection, analysis, scan, fileIndex, existingKnowledge = {}, config, provider, reanalyze = false }) {
  const limits = {
    maxFiles: config.maxFilesPerAnalysis || 200, maxLinesPerFile: config.maxLinesPerFile, maxTotalLines: config.maxTotalLines,
    maxTokensPerFile: config.maxTokensPerFile, maxTotalTokens: config.maxTotalTokens,
  };
  const detectSecrets = config.detectSecrets !== false;
  const { files: primary, notes, skipped = 0, ranked = false } = selectFiles({ mode, selection, analysis, files: fileIndex, reanalyze });
  const rankOf = new Map(primary.map((p, i) => [p, i])); // keeps the order chosen above (not analyzed first) when limits cut the list
  const deps = ['DOCUMENTATION', 'COMPARISON', 'BLUEPRINT'].includes(mode) ? [] : dependencyContext(primary, analysis, { depth: config.maxDependencyDepth });

  const candidates = [
    ...primary.map((p) => ({ path: p, priority: 0, reason: 'selected' })),
    ...deps.map((d) => ({ path: d.path, priority: d.priority, reason: d.reason })),
  ];
  const items = [];
  const secrets = [];
  for (const c of candidates) {
    const rec = fileIndex.find((f) => f.path === c.path);
    if (!rec || rec.binary) continue;
    try {
      const { text, findings } = await readContent(root, c.path, detectSecrets);
      findings.forEach((f) => secrets.push({ file: c.path, type: f.type, line: f.line })); // never the value
      const fa = analysis.files.find((a) => a.path === c.path);
      items.push({ path: c.path, language: rec.language, hash: rec.hash, content: text, priority: c.priority, reason: c.reason, redactions: findings.length, fa });
    } catch (err) {
      notes.push(`could not read ${c.path}: ${err.code || err.message}`);
    }
  }
  items.sort((a, b) => a.priority - b.priority || (ranked && a.priority === 0 ? rankOf.get(a.path) - rankOf.get(b.path) : a.path.localeCompare(b.path)));
  const reduced = reduceContext(items, limits);
  const included = reduced.kept.map((f) => f.path);

  const filesOut = reduced.kept.map((f) => ({
    path: f.path,
    language: f.language,
    hash: f.hash,
    content: f.content,
    truncated: f.truncated,
    relation: f.reason,
    symbols: (f.fa ? f.fa.symbols : []).map((s) => ({ name: s.name, type: s.type, className: s.className, line: s.line, endLine: s.endLine, exported: !!s.exported, params: s.params })),
    imports: (f.fa ? f.fa.imports : []).map((i) => ({ source: i.source, names: i.names.map((n) => n.imported).concat(i.default ? ['default'] : []) })),
    exports: (f.fa ? f.fa.exports : []).map((e) => e.name),
    dependencies: ((analysis.dependencies[f.path] || {}).internal || []).map((d) => d.path),
    dependents: (analysis.dependents[f.path] || []).map((d) => d.path),
  }));

  const wfCtx = workflowContext(included, analysis);
  const dbCtx = databaseContext(included, analysis);
  const base = {
    packageType: 'PROJECT_ANALYSIS',
    schemaVersion: '1.0',
    project: { projectId: project.projectId, name: project.name },
    projectOverview: projectContext(project, analysis, scan),
    analysis: { analysisId, mode, purpose: purpose || null, intent, provider: provider || null },
    selection: { files: selection.files || [], folders: selection.folders || [], features: selection.features || [], workflows: selection.workflows || [] },
    existingKnowledge,
    instructions: INSTRUCTIONS,
  };

  // Batches
  const batchesRaw = createBatches(filesOut.map((f) => ({ ...f, priority: f.relation === 'selected' ? 0 : 1, tokens: estimateTokens(f.content) })), analysis, { maxTokens: config.maxTokens, maxFiles: config.maxFiles });
  const total = batchesRaw.length || 1;
  const batches = [];
  const done = [];
  for (const b of batchesRaw) {
    const paths = new Set(b.files.map((f) => f.path));
    const fileList = b.files.map(({ priority, tokens, ...rest }) => rest);
    const raw = {
      analysisId, batchId: b.batchId, batchNumber: b.batchNumber, totalBatches: total,
      purpose: `${mode.toLowerCase()} analysis${purpose ? `: ${purpose}` : ''}`,
      selection: base.selection,
      previousContextReference: b.batchNumber > 1 ? batchesRaw[b.batchNumber - 2].batchId : null,
      context: {
        project: base.project, projectOverview: base.projectOverview, analysis: base.analysis,
        files: fileList,
        symbols: fileList.flatMap((f) => f.symbols.map((s) => ({ ...s, file: f.path }))),
        dependencies: fileList.flatMap((f) => f.dependencies.map((to) => ({ from: f.path, to }))),
        apis: analysis.apis.filter((a) => paths.has(a.file)).map((a) => ({ method: a.method, endpoint: a.endpoint, file: a.file, line: a.line, handler: a.handler, middleware: a.middleware })),
        clientApiCalls: analysis.apiLinks.filter((l) => paths.has(l.from.file)).map((l) => ({ from: l.from, method: l.method, path: l.path, route: l.route })),
        database: databaseContext([...paths], analysis),
        workflows: workflowContext([...paths], analysis),
        features: featureContext([...paths], analysis),
        existingKnowledge,
        crossBatch: crossBatchState(done, analysis),
        instructions: INSTRUCTIONS,
      },
      estimatedTokens: b.tokens,
    };
    const validated = validateOutbound(raw, { excludePatterns: config.excludePatterns });
    if (validated.secondPassRedactions) secrets.push({ file: '(metadata)', type: 'second-pass', count: validated.secondPassRedactions });
    batches.push(validated.pkg);
    done.push(b);
  }

  const primarySet = new Set(primary);
  const waiting = reduced.omitted.filter((o) => primarySet.has(o.path));
  if (skipped) notes.push(`${skipped} file(s) already analyzed and unchanged were skipped.`);
  if (waiting.length) notes.push(`${waiting.length} more file(s) did not fit in this run (${[...new Set(waiting.map((w) => w.reason))].join(', ')}). Run the analysis again to continue with them.`);
  const stats = {
    alreadyAnalyzed: skipped, waitingForNextRun: waiting.length,
    selectedFiles: primary.length, includedFiles: filesOut.length, omitted: reduced.omitted, notes,
    totalTokens: reduced.totalTokens, totalLines: reduced.totalLines, batches: batches.length,
    secretsRedacted: secrets.length, secrets, // locations/types only
  };
  logger.info('ANALYSIS', 'context built', { analysisId, mode, files: filesOut.length, batches: batches.length, redactions: secrets.length });
  return {
    analysisPackage: { ...base, selection: base.selection, files: filesOut.map((f) => ({ path: f.path, hash: f.hash, language: f.language })), workflows: wfCtx, database: dbCtx },
    batches,
    fileHashes: filesOut.map((f) => ({ path: f.path, hash: f.hash })),
    primaryFiles: filesOut.filter((f) => f.relation === 'selected').map((f) => f.path),
    stats,
  };
}

module.exports = { build };
