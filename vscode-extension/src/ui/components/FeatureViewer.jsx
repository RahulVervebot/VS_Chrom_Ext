import React from 'react';
import { Badge, Card, FileLink } from './common.jsx';

export default function FeatureViewer({ feature }) {
  if (!feature) return null;
  const k = feature.knowledge || {};
  return (
    <Card title={feature.name} actions={<Badge status={feature.status} />}>
      <p>{k.purpose && k.purpose.value ? <>{k.purpose.value} <Badge status={k.purpose.status} /></> : <em className="muted-text">Purpose: UNKNOWN</em>}</p>
      <p className="muted-text">Grouped heuristically from: {(feature.basis || []).join(', ') || 'AI knowledge'}. Member files are real project files.</p>
      <h4>APIs</h4><ul>{(feature.apis || []).map((a, i) => <li key={i}>{a.method} {a.endpoint} <FileLink file={a.file} line={a.line} /></li>)}{!(feature.apis || []).length && <li className="muted-text">None found.</li>}</ul>
      <h4>Database entities</h4><div className="row wrap">{(feature.entities || []).map((e) => <span className="chip" key={e}>{e}</span>)}{!(feature.entities || []).length && <span className="muted-text">None found.</span>}</div>
      <h4>Files ({feature.files.length})</h4><ul className="list">{feature.files.map((f) => <li key={f}><FileLink file={f} /></li>)}</ul>
      <h4>Tests</h4><ul>{(feature.tests || []).map((f) => <li key={f}><FileLink file={f} /></li>)}{!(feature.tests || []).length && <li className="muted-text">No tests found.</li>}</ul>
    </Card>
  );
}
