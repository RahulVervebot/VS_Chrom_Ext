// Structured cross-batch state. Later batches never depend on chat history: this summary is re-sent with each prompt.
import { estimateTokens } from '../utils/text.js';

export function summarizeFindings(knowledgeList, maxTokens = 2500) {
  const summary = { files: [], workflows: [], entities: [], features: [], unknowns: [] };
  for (const k of knowledgeList) {
    for (const f of k.files || []) summary.files.push({ path: f.path, purpose: (f.purpose || '').slice(0, 160) });
    for (const w of k.workflows || []) summary.workflows.push({ id: w.id, name: w.name });
    for (const e of (k.database && k.database.entities) || []) summary.entities.push({ name: e.name, fields: (e.fields || []).map((f) => f.name).slice(0, 25) });
    for (const f of k.features || []) summary.features.push({ id: f.id, name: f.name });
    for (const u of k.unknowns || []) if (typeof u === 'string' && !u.startsWith('NOTE:')) summary.unknowns.push(u.slice(0, 160));
  }
  // Trim until it fits.
  let text = JSON.stringify(summary);
  while (estimateTokens(text) > maxTokens) {
    const biggest = Object.keys(summary).sort((a, b) => summary[b].length - summary[a].length)[0];
    if (!summary[biggest].length) break;
    summary[biggest] = summary[biggest].slice(0, Math.floor(summary[biggest].length * 0.7));
    text = JSON.stringify(summary);
  }
  return summary;
}

export function buildCrossBatch(batch, ownPreviousKnowledge) {
  return {
    fromVsCode: batch.context.crossBatch || null,
    previousFindings: summarizeFindings([...(batch.crossBatchFindings || []).map((f) => f.knowledge), ...ownPreviousKnowledge]),
  };
}
