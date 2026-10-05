const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const table = (headers, rows) => (rows.length
  ? [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`)].join('\n')
  : '_None found in source._');

const list = (items, empty = '_None found in source._') => (items.length ? items.map((i) => `- ${i}`).join('\n') : empty);

const badge = (status) => `\`${status || 'UNKNOWN'}\``;

const code = (s) => '`' + String(s).replace(/`/g, "'") + '`';

const loc = (file, line) => code(`${file}${line ? `:${line}` : ''}`);

// value cell -> "text (STATUS)" or UNKNOWN
function cell(c, unknownText = 'UNKNOWN: not established by source analysis or verified AI knowledge') {
  if (!c || !c.value) return `_${unknownText}_`;
  return `${c.value} ${badge(c.status)}`;
}

function header({ title, status, sources, generatedAt }) {
  return [`# ${title}`, '', `> Documentation status: ${badge(status)}  ·  Generated: ${generatedAt}`,
    '> Source of truth is the source code. This document is derived; VERIFIED = confirmed against source, INFERRED = reasonable interpretation, UNKNOWN = not established.',
    sources && sources.length ? `> Based on ${sources.length} source file(s) at recorded hashes (see \`documentation/status.json\`).` : '', ''].filter((l) => l !== '').join('\n') + '\n\n';
}

module.exports = { table, list, badge, code, loc, cell, header, esc };
