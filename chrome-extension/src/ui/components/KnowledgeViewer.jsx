import React from 'react';
import { Badge, Card, Empty } from './common.jsx';
import { mergeKnowledge } from '../../knowledge/knowledgeMerger.js';

export function collectKnowledge(analyses) {
  const list = Object.values(analyses).flatMap((a) => Object.values(a.batches || {}).filter((b) => b.status === 'completed' && b.knowledge).map((b) => b.knowledge));
  return list.length ? mergeKnowledge(list) : null;
}

export default function KnowledgeViewer({ analyses }) {
  const m = collectKnowledge(analyses);
  if (!m) return <Empty>No knowledge yet. Start an analysis from VS Code and confirm it in the Analysis tab.</Empty>;
  const k = m.knowledge;
  return (
    <>
      <p className="muted">This is Chrome’s working copy. VS Code verifies every claim against source and keeps the authoritative <code>.ai-project</code>.</p>
      <Card title={`Features (${k.features.length})`}>{k.features.length ? <ul>{k.features.map((f) => <li key={f.id}><b>{f.name || f.id}</b>{f.purpose && <span className="muted"> — {f.purpose}</span>}</li>)}</ul> : <Empty>None reported.</Empty>}</Card>
      <Card title={`Workflows (${k.workflows.length})`}>{k.workflows.length ? k.workflows.map((w) => <details key={w.id}><summary><b>{w.name || w.id}</b></summary>{w.purpose && <p className="muted">{w.purpose}</p>}<ol className="steps">{(w.steps || []).map((s, i) => <li key={i}><span className="mono">{s.kind}</span> {s.symbol || ''} <span className="muted">{s.file}</span> <Badge status={s.status || 'INFERRED'} /></li>)}</ol></details>) : <Empty>None reported.</Empty>}</Card>
      <Card title={`Database (${k.database.entities.length} entities)`}>{k.database.entities.length ? k.database.entities.map((e) => <details key={e.name}><summary><b>{e.name}</b> <span className="muted">{(e.fields || []).length} fields</span></summary><ul>{(e.fields || []).map((f) => <li key={f.name}><code>{f.name}</code> {f.type}</li>)}</ul></details>) : <Empty>None reported.</Empty>}</Card>
      <Card title={`Files (${k.files.length})`}>{k.files.map((f) => <details key={f.path}><summary><code>{f.path}</code></summary><p>{f.purpose || <span className="muted">Purpose UNKNOWN</span>}</p><ul>{(f.claims || []).map((c, i) => <li key={i}>{c.claim} <Badge status={c.status} /></li>)}</ul></details>)}</Card>
      {m.unknowns.length > 0 && <Card title="Unknowns"><ul>{m.unknowns.filter((u) => typeof u === 'string').slice(0, 40).map((u, i) => <li key={i}>{u}</li>)}</ul></Card>}
    </>
  );
}
