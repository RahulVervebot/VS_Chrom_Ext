import { estimateTokens } from '../utils/text.js';

const numbered = (content) => content.split('\n').map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join('\n');

// Enforces Chrome-side limits (users can set stricter ones than VS Code's). Returns a new batch; original is untouched.
export function applyLimits(batch, settings) {
  const files = [];
  const warnings = [];
  let lines = 0;
  for (const f of batch.context.files.slice(0, settings.maxFilesPerRequest)) {
    let content = f.content;
    const l = content.split('\n');
    if (l.length > settings.maxLinesPerFile) { content = l.slice(0, settings.maxLinesPerFile).join('\n') + '\n/* [TRUNCATED by AI Project Bridge] */'; warnings.push(`${f.path} truncated to ${settings.maxLinesPerFile} lines`); }
    lines += Math.min(l.length, settings.maxLinesPerFile);
    if (lines > settings.maxTotalLines) { warnings.push(`${f.path} omitted: maxTotalLines reached`); continue; }
    files.push({ ...f, content });
  }
  if (batch.context.files.length > settings.maxFilesPerRequest) warnings.push(`${batch.context.files.length - settings.maxFilesPerRequest} file(s) omitted: maxFilesPerRequest`);
  return { batch: { ...batch, context: { ...batch.context, files } }, warnings };
}

export function batchStats(batch) {
  const files = batch.context.files;
  const lines = files.reduce((n, f) => n + f.content.split('\n').length, 0);
  const tokens = files.reduce((n, f) => n + estimateTokens(f.content), 0);
  return { files: files.length, lines, tokens };
}

// Splits a batch in two (used when a provider says the input is too large or the answer was cut off).
export function splitBatch(batch) {
  const files = batch.context.files;
  if (files.length < 2) return null;
  const mid = Math.ceil(files.length / 2);
  const mk = (part, suffix) => {
    const paths = new Set(part.map((f) => f.path));
    return { ...batch, batchId: `${batch.batchId}${suffix}`, parentBatchId: batch.parentBatchId || batch.batchId, context: { ...batch.context, files: part, symbols: batch.context.symbols.filter((s) => paths.has(s.file)), dependencies: batch.context.dependencies.filter((d) => paths.has(d.from)), apis: batch.context.apis.filter((a) => paths.has(a.file)) } };
  };
  return [mk(files.slice(0, mid), 'a'), mk(files.slice(mid), 'b')];
}

export { numbered };
