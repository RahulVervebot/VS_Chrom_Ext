import React from 'react';
import { Card, Empty, Badge } from './common.jsx';

const label = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

function Value({ v }) {
  if (v === null || v === undefined) return <span className="muted-text">UNKNOWN</span>;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return <span>{String(v)}</span>;
  return <pre className="json">{JSON.stringify(v, null, 2)}</pre>;
}

export default function BlueprintViewer({ blueprint }) {
  if (!blueprint) return <Empty>No blueprint yet. Blueprints are planning artifacts generated from your projects’ knowledge and your requirements. They never modify source code.</Empty>;
  return (
    <Card title="Project blueprint" actions={<Badge status="PROPOSED">PLAN ONLY</Badge>}>
      <div className="muted-text">Created {new Date(blueprint.createdAt).toLocaleString()} from {blueprint.inputs.map((p) => p.name).join(', ') || 'no reference projects'}. Applied to source: {String(blueprint.appliedToSource)}.</div>
      {blueprint.missingSections.length > 0 && <div className="error-box">Missing sections: {blueprint.missingSections.join(', ')}</div>}
      {blueprint.conflicts.length > 0 && <><h4>Conflicts requiring a decision</h4><ul>{blueprint.conflicts.map((c, i) => <li key={i}><Value v={c} /></li>)}</ul></>}
      {Object.entries(blueprint.blueprint).filter(([k]) => k !== 'conflicts').map(([k, v]) => <div key={k}><h4>{label(k)}</h4><Value v={v} /></div>)}
    </Card>
  );
}
