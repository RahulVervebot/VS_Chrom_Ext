const md = require('../utils/markdown');

function renderEntityDoc(e, ctx, generatedAt, status) {
  const k = e.knowledge || {};
  const out = [md.header({ title: `Entity: ${e.name}`, status, sources: e.file ? [e.file] : [], generatedAt })];
  out.push(`## Purpose\n${md.cell(k.purpose)}\n`);
  out.push(`## Type\n${e.kind} (${e.source}) — defined at ${e.file ? md.loc(e.file, e.line) : 'UNKNOWN location'}\n`);
  const aiFields = new Map((k.fields || []).map((f) => [f.name, f]));
  const fields = [...(e.fields || []).map((f) => [f.name, f.type, f.pk ? 'PK' : '', f.nullable === false ? 'NOT NULL' : '', 'VERIFIED (source)']),
    ...[...aiFields.values()].filter((f) => !(e.fields || []).some((x) => x.name === f.name)).map((f) => [f.name, f.type || '', '', '', f.status])];
  out.push(`## Fields\n${md.table(['Field', 'Type', 'Key', 'Nullable', 'Evidence'], fields)}\n`);
  const rels = ctx.relationships.filter((r) => String(r.from).toLowerCase() === e.name.toLowerCase() || String(r.to).toLowerCase() === e.name.toLowerCase());
  out.push(`## Relationships\n${md.table(['From', 'To', 'Type', 'Via', 'Evidence'], rels.map((r) => [r.from, r.to, r.type, r.via || '', r.status || (r.origin === 'AI' ? 'VERIFIED' : 'VERIFIED')]))}\n`);
  const qs = ctx.queries.filter((q) => q.entity === e.name);
  out.push(`## Queries\n${md.table(['Operation', 'Location', 'ORM'], qs.filter((q) => q.kind === 'read').map((q) => [q.operation, `${q.file}:${q.line}`, q.orm]))}\n`);
  out.push(`## Mutations\n${md.table(['Operation', 'Location', 'ORM'], qs.filter((q) => q.kind === 'write').map((q) => [q.operation, `${q.file}:${q.line}`, q.orm]))}\n`);
  out.push(`## Workflows\n${md.list(ctx.workflows.filter((w) => w.summary.databaseReads.includes(e.name) || w.summary.databaseWrites.includes(e.name)).map((w) => `${md.code(w.id)} — ${w.name}`))}\n`);
  out.push(`## Files and Services\n${md.list([...new Set(qs.map((q) => q.file))].map(md.code))}\n`);
  out.push(`## Claims and Evidence\n${md.table(['Claim', 'Status'], (k.claims || []).map((c) => [c.claim, c.status]))}\n`);
  out.push(`## Unknowns\n- Business rules, constraints and transactions are documented only when found in source or verified knowledge.\n`);
  return out.join('\n');
}

function renderDatabaseOverview(ctx, generatedAt, status, sources) {
  const out = [md.header({ title: 'Database Overview', status, sources, generatedAt })];
  out.push(`## Technologies (from source evidence)\n${md.list(ctx.technologies.map((t) => `${t.name} — ${t.evidence.map((e) => md.loc(e.file, e.line)).join(', ')}`), '_No database technology detected._')}\n`);
  out.push(`## Entities\n${md.table(['Entity', 'Kind', 'Source', 'Fields', 'Defined at'], ctx.entities.map((e) => [e.name, e.kind, e.source, (e.fields || []).length, e.file ? `${e.file}:${e.line}` : 'UNKNOWN']))}\n`);
  out.push(`## Relationships (only those supported by evidence)\n${md.table(['From', 'To', 'Type', 'Evidence', 'Source'], ctx.relationships.map((r) => [r.from, r.to, r.type, r.status || 'VERIFIED', r.source]))}\n`);
  out.push(`## Data Flows\n${md.table(['Workflow', 'API', 'Reads', 'Writes'], ctx.dataFlows.map((f) => [f.workflowId, f.api ? `${f.api.method} ${f.api.endpoint}` : '', f.reads.join(', '), f.writes.join(', ')]))}\n`);
  return out.join('\n');
}

module.exports = { renderEntityDoc, renderDatabaseOverview };
