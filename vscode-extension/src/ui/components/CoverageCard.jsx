import React from 'react';
import { Card, Bar, Badge, fmt } from './common.jsx';

export default function CoverageCard({ coverage }) {
  if (!coverage) return null;
  return (
    <Card title="Analysis coverage" actions={<Badge status={coverage.coverageStatus} />}>
      <Bar percent={coverage.percent} status={coverage.coverageStatus} />
      <div className="kv">
        <span>Files analyzed</span><b>{fmt(coverage.filesAnalyzed)} / {fmt(coverage.sourceFilesTotal || coverage.filesTotal)}</b>
        <span>Up to date</span><b>{fmt(coverage.filesUpToDate)}</b>
        <span>Outdated</span><b>{fmt(coverage.filesOutdated)}</b>
        <span>Folders analyzed</span><b>{fmt(coverage.foldersAnalyzed)}</b>
        <span>Workflows with AI knowledge</span><b>{fmt(coverage.workflowsAnalyzed)}</b>
        <span>Database entities with AI knowledge</span><b>{fmt(coverage.databaseEntitiesAnalyzed)}</b>
      </div>
      {coverage.coverageStatus !== 'COMPLETE' && <p className="muted-text">Only part of the project has verified analysis. Anything not analyzed is reported as NOT ANALYZED, never guessed.</p>}
    </Card>
  );
}
