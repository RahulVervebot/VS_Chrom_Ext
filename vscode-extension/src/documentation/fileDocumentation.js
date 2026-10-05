const md = require('../utils/markdown');

// data: { file (index record), symbols[], imports[], exports[], dependencies[], dependents[], routes[], entitiesTouched, knowledge, tests[], workflows[], features[] }
function renderFileDoc(d, generatedAt, status) {
  const k = d.knowledge || {};
  const out = [md.header({ title: d.file.path, status, sources: [d.file.path], generatedAt })];
  out.push(`## Purpose\n${md.cell(k.purpose)}\n`);
  out.push(`## Role\n${md.cell(k.role, `Static classification: ${d.role}`)}\n`);
  out.push(`## Source\n- Language: ${d.file.language}\n- Lines: ${d.file.lines}\n- Source hash: ${md.code(d.file.hash)}\n- Analysis status: ${md.badge(d.file.status)}\n`);
  out.push(`## Functions, Classes, Components\n${md.table(['Name', 'Type', 'Lines', 'Exported', 'Params'], d.symbols.map((s) => [s.className ? `${s.className}.${s.name}` : s.name, s.type, `${s.line}-${s.endLine}`, s.exported ? 'yes' : 'no', (s.params || []).join(', ')]))}\n`);
  out.push(`## Imports\n${md.table(['Source', 'Names', 'Line'], d.imports.map((i) => [i.source, [i.default && 'default', ...i.names.map((n) => n.imported)].filter(Boolean).join(', '), i.line]))}\n`);
  out.push(`## Exports\n${md.list(d.exports.map((e) => `${md.code(e.name)} (${e.kind}, line ${e.line})`))}\n`);
  out.push(`## Dependencies\n${md.list(d.dependencies.map((x) => md.code(x.path)))}\n`);
  out.push(`## Dependents\n${md.list(d.dependents.map((x) => md.code(x.path)))}\n`);
  out.push(`## APIs\n${md.list(d.routes.map((r) => `${r.method} ${md.code(r.endpoint)} (line ${r.line})`))}\n`);
  out.push(`## Database\n${d.entities.reads.length || d.entities.writes.length ? `- Reads: ${d.entities.reads.join(', ') || 'none'}\n- Writes: ${d.entities.writes.join(', ') || 'none'}` : '_No database access found in this file._'}\n`);
  out.push(`## Workflows\n${md.list(d.workflows.map((w) => `${md.code(w.id)} — ${w.name}`))}\n`);
  out.push(`## Features\n${md.list(d.features.map((f) => md.code(f.id)))}\n`);
  out.push(`## Tests\n${md.list(d.tests.map(md.code), '_No tests importing this file were found._')}\n`);
  out.push(`## Verified Claims and Evidence\n${md.table(['Claim', 'Status', 'Evidence'], (k.claims || []).map((c) => [c.claim, c.status, (c.evidence || []).map((e) => `${e.file}${e.symbol ? '#' + e.symbol : ''}${e.lineStart ? ':' + e.lineStart : ''}`).join('; ')]))}\n`);
  out.push(`## Unknowns\n${md.list((k.unknowns || []).map((u) => u), '_None recorded._')}\n`);
  return out.join('\n');
}

module.exports = { renderFileDoc };
