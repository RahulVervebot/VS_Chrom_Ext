const md = require('../utils/markdown');

function renderFeatureDoc(f, generatedAt, status) {
  const k = f.knowledge || {};
  const out = [md.header({ title: `Feature: ${f.name}`, status, sources: f.files, generatedAt })];
  out.push(`## Purpose\n${md.cell(k.purpose)}\n`);
  out.push(`## Detection\nStatus ${md.badge(f.status)} — grouped from: ${(f.basis || []).join(', ') || 'AI knowledge only'}. Grouping is heuristic; member files are real project files.\n`);
  out.push(`## Files\n${md.list(f.files.map(md.code))}\n`);
  out.push(`## APIs\n${md.table(['Method', 'Endpoint', 'Location'], (f.apis || []).map((a) => [a.method, a.endpoint, `${a.file}:${a.line}`]))}\n`);
  out.push(`## Database Entities\n${md.list((f.entities || []).map(md.code))}\n`);
  out.push(`## Tests\n${md.list((f.tests || []).map(md.code), '_No tests found._')}\n`);
  out.push(`## Claims and Evidence\n${md.table(['Claim', 'Status'], (k.claims || []).map((c) => [c.claim, c.status]))}\n`);
  return out.join('\n');
}

module.exports = { renderFeatureDoc };
