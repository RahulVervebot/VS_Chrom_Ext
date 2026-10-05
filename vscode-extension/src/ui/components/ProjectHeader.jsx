import React from 'react';
import { Badge, Button } from './common.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function ProjectHeader({ state, refresh }) {
  const p = state.project;
  if (!p) return null;
  const cov = state.coverage;
  return (
    <div className="project-header">
      <div>
        <h2>{p.name}</h2>
        <div className="muted-text">Project ID <code>{p.projectId}</code> · schema {p.schemaVersion}</div>
      </div>
      <div className="row">
        <Badge status={cov ? cov.coverageStatus : 'NOT_ANALYZED'} />
        <Button onClick={async () => { await rpc('scan'); refresh(); }}>Scan</Button>
        <Button onClick={() => rpc('exec', { command: 'aiProject.openDashboard' })} title="Open in an editor tab">Open tab</Button>
      </div>
    </div>
  );
}
