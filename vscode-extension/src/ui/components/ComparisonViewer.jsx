import React from 'react';
import { Card, Empty, Badge } from './common.jsx';

const SECTIONS = [['commonApproaches', 'Common approaches'], ['differences', 'Differences'], ['architecturalDifferences', 'Architectural differences'], ['databaseDifferences', 'Database differences'], ['workflowDifferences', 'Workflow differences'], ['reusablePatterns', 'Reusable patterns'], ['migrationConsiderations', 'Migration considerations'], ['unknowns', 'Unknowns']];
const text = (x) => (typeof x === 'string' ? x : JSON.stringify(x));

export default function ComparisonViewer({ comparisons }) {
  if (!comparisons || !comparisons.length) return <Empty>No comparisons yet. Use “Compare Projects/Features/Workflows/Databases” — results come back from Chrome and are stored in .ai-project/comparisons/.</Empty>;
  return (
    <>
      {comparisons.map((c) => (
        <Card key={c.comparisonId} title={`${c.comparisonId} · ${c.kind}`} actions={<span className="muted-text">{c.projects.map((p) => p.name).join(' vs ')}</span>}>
          {SECTIONS.map(([k, label]) => <div key={k}><h4>{label}</h4>{c.result[k].length ? <ul>{c.result[k].map((x, i) => <li key={i}>{text(x)}</li>)}</ul> : <div className="muted-text">None reported.</div>}</div>)}
          {c.conflicts.length > 0 && <><h4>Conflicts <Badge status="UNKNOWN">CONFLICT</Badge></h4><ul>{c.conflicts.map((x, i) => <li key={i}>{text(x)}</li>)}</ul></>}
        </Card>
      ))}
    </>
  );
}
