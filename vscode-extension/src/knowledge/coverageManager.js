// Coverage: never claim the whole project is understood when only part has been analyzed.
function computeCoverage({ files, workflows = [], entities = [], history = [] }) {
  const analyzedStatuses = new Set(['ANALYZED', 'OUTDATED', 'PARTIAL']);
  const analyzed = files.filter((f) => analyzedStatuses.has(f.status));
  const outdated = files.filter((f) => f.status === 'OUTDATED');
  const foldersAnalyzed = new Set();
  for (const f of analyzed) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    if (dir) foldersAnalyzed.add(dir);
  }
  const sourceFiles = files.filter((f) => !f.binary && f.isSource);
  const total = sourceFiles.length || files.length;
  const upToDate = analyzed.filter((f) => f.status === 'ANALYZED').length;

  let coverageStatus = 'NOT_ANALYZED';
  if (analyzed.length > 0) {
    coverageStatus = analyzed.length >= total && outdated.length === 0 ? 'COMPLETE' : 'PARTIAL';
  }
  if (outdated.length > 0 && coverageStatus === 'COMPLETE') coverageStatus = 'PARTIAL';

  return {
    filesTotal: files.length,
    sourceFilesTotal: sourceFiles.length,
    filesAnalyzed: analyzed.length,
    filesUpToDate: upToDate,
    filesOutdated: outdated.length,
    foldersAnalyzed: foldersAnalyzed.size,
    workflowsAnalyzed: workflows.length,
    databaseEntitiesAnalyzed: entities.length,
    analysesCompleted: history.filter((h) => h.status === 'COMPLETED').length,
    percent: total ? Math.round((analyzed.length / total) * 100) : 0,
    coverageStatus,
  };
}

module.exports = { computeCoverage };
