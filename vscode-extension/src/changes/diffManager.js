// Line diff (LCS) producing unified diffs for review. Pure text, no dependencies.
function lcsDiff(a, b) {
  const n = a.length; const m = b.length;
  if (n * m > 4_000_000) return [...a.map((l) => ['-', l]), ...b.map((l) => ['+', l])]; // very large: whole-file replacement hunk
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push([' ', a[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(['-', a[i++]]); else out.push(['+', b[j++]]);
  }
  while (i < n) out.push(['-', a[i++]]);
  while (j < m) out.push(['+', b[j++]]);
  return out;
}

function unifiedDiff(oldText, newText, filePath, context = 3) {
  const a = oldText === null ? [] : oldText.split('\n');
  const b = newText === null ? [] : newText.split('\n');
  const ops = lcsDiff(a, b);
  const hunks = [];
  let cur = null; let ai = 1; let bi = 1; let lastChange = -Infinity;
  ops.forEach(([t, line], idx) => {
    const changed = t !== ' ';
    if (changed) {
      if (!cur) { const start = Math.max(0, idx - context); cur = { start, aStart: ai - (idx - start), bStart: bi - (idx - start), lines: ops.slice(start, idx) }; }
      cur.lines.push([t, line]); lastChange = idx;
    } else if (cur) {
      if (idx - lastChange <= context) cur.lines.push([t, line]);
      else { hunks.push(cur); cur = null; }
    }
    if (t !== '+') ai++;
    if (t !== '-') bi++;
  });
  if (cur) hunks.push(cur);
  const head = `--- ${oldText === null ? '/dev/null' : 'a/' + filePath}\n+++ ${newText === null ? '/dev/null' : 'b/' + filePath}\n`;
  const body = hunks.map((h) => {
    const aCount = h.lines.filter((l) => l[0] !== '+').length; const bCount = h.lines.filter((l) => l[0] !== '-').length;
    return `@@ -${h.aStart},${aCount} +${h.bStart},${bCount} @@\n${h.lines.map(([t, l]) => t + l).join('\n')}`;
  }).join('\n');
  return { text: head + body, added: ops.filter((o) => o[0] === '+').length, removed: ops.filter((o) => o[0] === '-').length };
}

module.exports = { unifiedDiff, lcsDiff };
