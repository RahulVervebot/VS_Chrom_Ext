const md = require('../utils/markdown');

function renderProjectOverview(ctx, generatedAt, status) {
  const { project, coverage: c, counts } = ctx;
  return md.header({ title: `${project.name} — Project Overview`, status, sources: ctx.sources, generatedAt }) + [
    `- Project ID: ${md.code(project.projectId)}`,
    `- Analysis coverage: **${c.coverageStatus}** (${c.filesAnalyzed}/${c.sourceFilesTotal} source files analyzed, ${c.filesOutdated} outdated)`,
    `- Files: ${counts.files} · Workflows: ${counts.workflows} · Features: ${counts.features} · Entities: ${counts.entities} · APIs: ${counts.apis}`,
    '', '## Analyses', md.table(['Analysis', 'Mode', 'Status', 'Provider', 'Files'], ctx.analyses.map((a) => [a.analysisId, a.mode, a.status, a.provider || '', a.files])),
    '', '## Documents', md.list(ctx.documents.map((d) => `${md.code(d.key)} ${md.badge(d.status)}`)), '',
  ].join('\n');
}

module.exports = { renderProjectOverview };
