const md = require('../utils/markdown');

function renderArchitecture(a, knowledge, ctx, generatedAt, status) {
  const out = [md.header({ title: 'Architecture Overview', status, sources: ctx.sources, generatedAt })];
  const cov = ctx.coverage;
  out.push(`## Coverage\nAnalysis coverage is **${cov.coverageStatus}**: ${cov.filesAnalyzed} of ${cov.sourceFilesTotal || cov.filesTotal} source files have verified analysis (${cov.percent}%). ${cov.coverageStatus !== 'COMPLETE' ? 'Parts of the project have not been analyzed and are not described here.' : ''}\n`);
  out.push(`## Summary\n${knowledge && knowledge.overview ? md.cell(knowledge.overview) : '_UNKNOWN: no verified summary yet. Run an AI analysis._'}\n`);
  out.push(`## Technology Stack (from manifests and imports)\n${md.list(a.technologies.map((t) => `${t.name} — ${t.evidence.map(md.code).join(', ')}`))}\n`);
  out.push(`## Languages\n${md.table(['Language', 'Files'], Object.entries(a.languages))}\n`);
  out.push(`## Tiers\n- Frontend evidence: ${a.tiers.frontend ? 'yes' : 'no'}\n- Backend evidence: ${a.tiers.backend ? 'yes' : 'no'}\n`);
  out.push(`## Layers\n${md.table(['Role', 'Files'], Object.entries(a.layers).map(([r, f]) => [r, f.length]))}\n`);
  out.push(`## Entry Points\n${md.list(a.entryPoints.map((e) => `${md.code(e.path)} ${md.badge(e.status)} — ${e.reason}`))}\n`);
  out.push(`## Configuration and Deployment Files\n${md.table(['File', 'Kind'], a.config.map((c) => [c.path, c.kind]))}\n`);
  out.push(`## Authentication and Authorization (evidence)\n${md.table(['File', 'Kinds'], ctx.auth.map((x) => [x.file, [...new Set(x.items.map((i) => i.kind))].join(', ')]))}\n`);
  out.push(`## External Services (evidence)\n${md.table(['Service', 'Files'], Object.entries(ctx.externalServices).map(([n, e]) => [n, [...new Set(e.map((x) => x.file))].join(', ')]))}\n`);
  out.push(`## Workflows\n${md.table(['Workflow', 'Status', 'Files'], ctx.workflows.map((w) => [w.name, w.status, w.files]))}\n`);
  return out.join('\n');
}

function renderDependencyMap(ctx, generatedAt, status) {
  const rows = Object.entries(ctx.dependencies).filter(([, d]) => d.internal.length).map(([f, d]) => [f, d.internal.map((i) => i.path).join(', '), (ctx.dependents[f] || []).length]);
  return md.header({ title: 'Dependency Map', status, sources: ctx.sources, generatedAt }) + `## Internal dependencies\n${md.table(['File', 'Depends on', 'Dependents'], rows)}\n\n## External packages\n${md.table(['File', 'Packages'], Object.entries(ctx.dependencies).filter(([, d]) => d.external.length).map(([f, d]) => [f, d.external.join(', ')]))}\n`;
}

function renderApplicationFlow(ctx, generatedAt, status) {
  const lines = ctx.workflows.map((w) => `### ${w.name}\n${w.steps.map((s) => `${s.symbol || s.endpoint || s.kind}${s.entity ? ` → ${s.entity}` : ''}`).join(' → ')}\n`);
  return md.header({ title: 'Application Flow', status, sources: ctx.sources, generatedAt }) + (lines.join('\n') || '_No workflows were traced from source._') + '\n';
}

module.exports = { renderArchitecture, renderDependencyMap, renderApplicationFlow };
