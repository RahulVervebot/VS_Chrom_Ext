// Helpers for mapping character offsets to 1-based line numbers.
function lineIndex(content) {
  const starts = [0];
  for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

function lineAt(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
  }
  return lo + 1;
}

// Replace comments with spaces (keeping newlines) so regexes do not match commented-out code.
function stripComments(content, language) {
  if (['python', 'ruby', 'shell', 'yaml', 'toml', 'env'].includes(language)) {
    return content.replace(/(^|[^\\'"])#.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  }
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

// Given the index of an opening brace, find the matching close (naive but string-aware).
function matchBrace(content, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < content.length; i++) {
    const c = content[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return content.length - 1;
}

module.exports = { lineIndex, lineAt, stripComments, matchBrace };

// Find matching ')' for an opening '(' index (string-aware).
function matchParen(content, openIdx) {
  let depth = 0;
  let quote = null;
  for (let i = openIdx; i < content.length; i++) {
    const c = content[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Split top-level comma separated args.
function splitArgs(str) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) { cur += c; if (c === '\\') { cur += str[++i] || ''; } else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

module.exports.matchParen = matchParen;
module.exports.splitArgs = splitArgs;
