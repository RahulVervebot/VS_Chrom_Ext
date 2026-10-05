import React, { useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Button, Card, Empty, ErrorBox, FileLink, Loading } from './common.jsx';
import DiffViewer from './DiffViewer.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function ChangeReview({ proposals, reload }) {
  const [active, setActive] = useState(null);
  const { data: rec, error, loading } = useRemote('getChange', { id: active }, [active]);
  if (!proposals.length) return <Empty>No change proposals. When the AI proposes changes, Chrome sends them here. Nothing is applied without your review and approval.</Empty>;
  return (
    <div className="split">
      <Card title="Proposals">
        <ul className="list">{proposals.slice().reverse().map((p) => <li key={p.proposalId} className={active === p.proposalId ? 'active' : ''}><button className="link-btn" onClick={() => setActive(p.proposalId)}>{p.proposalId} — {p.title}</button><div><Badge status={p.status} /> <Badge status={p.risk}>risk {p.risk}</Badge> <span className="muted-text">{p.files} file(s)</span></div></li>)}</ul>
      </Card>
      <div>
        {!active && <Empty>Select a proposal to review its diff and impact.</Empty>}
        {active && loading && <Loading />}
        <ErrorBox error={error} />
        {active && rec && (
          <Card title={rec.title} actions={<Badge status={rec.status} />}>
            <p>{rec.rationale || <em className="muted-text">No rationale supplied.</em>}</p>
            {rec.status === 'STALE' && <div className="error-box">File changed since analysis. Re-analysis required.</div>}
            <h4>Impact <Badge status={rec.impact.risk}>risk {rec.impact.risk}</Badge></h4>
            <ul>
              {rec.impact.riskReasons.map((r) => <li key={r}>{r}</li>)}
              <li>Dependents: {rec.impact.dependents.map((d) => d.path).join(', ') || 'none'}</li>
              <li>Workflows: {rec.impact.workflows.map((w) => w.name).join(', ') || 'none'}</li>
              <li>Features: {rec.impact.features.map((f) => f.name).join(', ') || 'none'}</li>
              <li>Database entities: {rec.impact.entities.map((e) => e.name).join(', ') || 'none'}</li>
            </ul>
            {rec.files.map((f) => <div key={f.path}><h4><FileLink file={f.path}>{f.path}</FileLink> <Badge status={f.stale ? 'STALE' : 'PROPOSED'}>{f.operation}</Badge> {!f.stale && <span className="muted-text">+{f.added} −{f.removed}</span>}</h4>{f.stale ? <div className="muted-text">{f.staleReason}</div> : <DiffViewer diff={f.diff} />}</div>)}
            {rec.verification && <><h4>Verification</h4><ul>{rec.verification.results.map((r) => <li key={r.label}>{r.label} <Badge status={r.ok ? 'VERIFIED' : 'FAILED'}>{r.ok ? 'PASS' : 'FAIL'}</Badge></li>)}{!rec.verification.results.length && <li className="muted-text">{rec.verification.note}</li>}</ul></>}
            <div className="row wrap">
              <Button onClick={() => rpc('exec', { command: 'aiProject.reviewChanges', args: [rec.proposalId] })}>Open diff editors</Button>
              {['PROPOSED'].includes(rec.status) && <Button kind="primary" onClick={() => rpc('exec', { command: 'aiProject.applyChanges', args: [rec.proposalId] }).then(reload)}>Apply…</Button>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
