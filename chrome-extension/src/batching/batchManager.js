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

// A batch with only some of its files (static facts trimmed to match).
export function subBatch(batch, part, suffix) {
  const paths = new Set(part.map((f) => f.path));
  return { ...batch, batchId: `${batch.batchId}${suffix}`, parentBatchId: batch.parentBatchId || batch.batchId, context: { ...batch.context, files: part, symbols: batch.context.symbols.filter((s) => paths.has(s.file)), dependencies: batch.context.dependencies.filter((d) => paths.has(d.from)), apis: batch.context.apis.filter((a) => paths.has(a.file)), ...(batch.context.modules ? { modules: batch.context.modules.filter((m) => part.some((f) => f.path.startsWith(`${m.path}/`))) } : {}) } };
}

// Splits a batch in two (used when a provider says the input is too large or the answer was cut off).
export function splitBatch(batch) {
  const files = batch.context.files;
  if (files.length < 2) return null;
  const mid = Math.ceil(files.length / 2);
  return [subBatch(batch, files.slice(0, mid), 'a'), subBatch(batch, files.slice(mid), 'b')];
}

// "Try another way" for a batch that keeps failing. Returns the batch to run and notes for the knowledge.
//   single  — every file in its own message (the caller runs them one by one)
//   outline — long files cut to their first `outlineLines` lines; the AI uses the static symbols for the rest
//   drop    — leave the chosen files out (they stay "not analyzed" in VS Code)
//   instruction — the user's extra instruction for this retry (any approach can have one)
export const OUTLINE_LINES = 300;
export function applyRetryApproach(batch, retry) {
  if (!retry) return { batch, notes: [] };
  const notes = [];
  let files = batch.context.files;
  if (retry.dropFiles && retry.dropFiles.length) {
    const drop = new Set(retry.dropFiles);
    const left = files.filter((f) => drop.has(f.path));
    files = files.filter((f) => !drop.has(f.path));
    if (left.length) notes.push(`${left.map((f) => f.path).join(', ')} left out by the user on retry (not analyzed)`);
  }
  if (retry.approach === 'outline') {
    files = files.map((f) => {
      const lines = f.content.split('\n');
      if (lines.length <= OUTLINE_LINES) return f;
      notes.push(`${f.path}: only the first ${OUTLINE_LINES} of ${lines.length} lines were sent (outline retry)`);
      return { ...f, content: `${lines.slice(0, OUTLINE_LINES).join('\n')}\n/* [OUTLINE RETRY: the remaining ${lines.length - OUTLINE_LINES} lines were not sent; see staticFacts.symbols for what they contain] */`, truncated: true };
    });
  }
  const analysis = { ...batch.context.analysis, ...(retry.instruction ? { retryInstruction: String(retry.instruction).slice(0, 4000) } : {}), ...(retry.approach === 'outline' ? { retryOutline: true } : {}) };
  return { batch: subBatch({ ...batch, context: { ...batch.context, analysis } }, files, ''), notes };
}

export { numbered };
