// Enforces size limits. Items arrive ordered by priority; lower-priority items are dropped first and reported.
const { estimateTokens } = require('../scanner/tokenEstimator');

function truncateFile(content, maxLines, maxTokens) {
  let lines = content.split('\n');
  let truncated = false;
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); truncated = true; }
  let text = lines.join('\n');
  while (estimateTokens(text) > maxTokens && lines.length > 10) {
    lines = lines.slice(0, Math.floor(lines.length * 0.8));
    text = lines.join('\n');
    truncated = true;
  }
  if (truncated) text += '\n/* [TRUNCATED by AI Project Intelligence: file exceeds configured limits] */';
  return { text, truncated, keptLines: lines.length };
}

function reduceContext(items, limits) {
  const kept = [];
  const omitted = [];
  let totalTokens = 0;
  let totalLines = 0;
  for (const it of items) {
    if (kept.length >= limits.maxFiles) { omitted.push({ path: it.path, reason: 'maxFiles reached' }); continue; }
    const t = truncateFile(it.content, limits.maxLinesPerFile, limits.maxTokensPerFile);
    const tokens = estimateTokens(t.text);
    if (totalTokens + tokens > limits.maxTotalTokens) { omitted.push({ path: it.path, reason: 'maxTotalTokens reached' }); continue; }
    if (totalLines + t.keptLines > limits.maxTotalLines) { omitted.push({ path: it.path, reason: 'maxTotalLines reached' }); continue; }
    totalTokens += tokens;
    totalLines += t.keptLines;
    kept.push({ ...it, content: t.text, truncated: t.truncated, lines: t.keptLines, tokens });
  }
  return { kept, omitted, totalTokens, totalLines };
}

module.exports = { reduceContext, truncateFile };
