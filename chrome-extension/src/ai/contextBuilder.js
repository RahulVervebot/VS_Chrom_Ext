// Renders a VS Code batch as prompt text. Files carry line numbers so the AI can cite lineStart/lineEnd.
import { numbered } from '../batching/batchManager.js';

export const CONTEXT_BEGIN = 'BEGIN_CONTEXT_JSON';
export const CONTEXT_END = 'END_CONTEXT_JSON';

export function renderFiles(files) {
  return files.map((f) => `=== FILE: ${f.path} | ${f.hash} | ${f.language}${f.truncated ? ' | TRUNCATED' : ''} ===\n${numbered(f.content)}\n=== END FILE ===`).join('\n\n');
}

// Everything except file contents (those are rendered separately, with line numbers).
export function renderContextJson(batch, crossBatch) {
  const c = batch.context;
  return JSON.stringify({
    batch: { analysisId: batch.analysisId, batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches, purpose: batch.purpose, previousContextReference: batch.previousContextReference },
    project: c.project,
    projectOverview: c.projectOverview,
    analysis: c.analysis,
    selection: batch.selection,
    filesInThisBatch: c.files.map((f) => ({ path: f.path, sha256: f.hash, language: f.language, relation: f.relation, exports: f.exports, dependencies: f.dependencies, dependents: f.dependents })),
    staticFacts: { symbols: c.symbols, dependencies: c.dependencies, apis: c.apis, clientApiCalls: c.clientApiCalls, database: c.database, workflows: c.workflows, features: c.features },
    crossBatch,
    existingKnowledge: c.existingKnowledge,
  });
}
