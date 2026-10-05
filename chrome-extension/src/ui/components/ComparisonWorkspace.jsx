import React from 'react';
import { Action, Badge, Card, Empty } from './common.jsx';
import { cmd } from '../hooks/useStore.js';

const SECTIONS = [['commonApproaches', 'Common approaches'], ['differences', 'Differences'], ['architecturalDifferences', 'Architectural differences'], ['databaseDifferences', 'Database differences'], ['workflowDifferences', 'Workflow differences'], ['reusablePatterns', 'Reusable patterns'], ['migrationConsiderations', 'Migration considerations'], ['unknowns', 'Unknowns']];
const txt = (x) => (typeof x === 'string' ? x : JSON.stringify(x));

export function JobList({ jobs }) {
  if (!jobs.length) return null;
  return (
    <Card title="Requests from VS Code">
      {jobs.slice().reverse().map((j) => (
        <div key={j.id} className="job">
          <div className="row"><b>{j.kind}</b>{j.payload && j.payload.kind && <span className="muted">{j.payload.kind}</span>}<Badge status={j.status} /></div>
          {j.projects.length > 0 && <div className="muted">{j.projects.join(' · ')}</div>}
          {j.error && <div className="error small">{j.error}</div>}
          <div className="row">
            {j.status === 'AWAITING_USER' && <Action kind="primary" onClick={() => cmd('runJob', { id: j.id })}>Run with AI</Action>}
            {j.status !== 'RUNNING' && <Action onClick={() => cmd('dismissJob', { id: j.id })}>Dismiss</Action>}
          </div>
        </div>
      ))}
    </Card>
  );
}

export default function ComparisonWorkspace({ results, jobs }) {
  const comps = results.filter((r) => r.kind === 'comparison').reverse();
  const bps = results.filter((r) => r.kind === 'blueprint').reverse();
  return (
    <>
      <p className="muted">Comparisons and blueprints are started from VS Code (<b>AI Project: Compare Projects</b> / <b>Generate Project Blueprint</b>). They never score or rank projects and never change source code.</p>
      <JobList jobs={jobs.filter((j) => j.kind !== 'documentation')} />
      {!comps.length && !bps.length && <Empty>No results yet.</Empty>}
      {comps.map((c, i) => (
        <Card key={i} title={`${c.kind} comparison`} actions={<span className="muted">{c.projects.map((p) => p.name).join(' vs ')}</span>}>
          {SECTIONS.map(([k, l]) => c.result[k] && c.result[k].length > 0 && <div key={k}><h4>{l}</h4><ul>{c.result[k].map((x, j) => <li key={j}>{txt(x)}</li>)}</ul></div>)}
          {c.conflicts && c.conflicts.length > 0 && <><h4>Conflicts <Badge status="UNKNOWN">REQUIRES DECISION</Badge></h4><ul>{c.conflicts.map((x, j) => <li key={j}>{txt(x)}</li>)}</ul></>}
        </Card>
      ))}
      {bps.map((b, i) => <Card key={i} title="Project blueprint" actions={<Badge status="PAUSED">PLAN ONLY</Badge>}><div className="muted">{b.requirements}</div><pre>{JSON.stringify(b.blueprint, null, 2).slice(0, 4000)}</pre></Card>)}
    </>
  );
}
