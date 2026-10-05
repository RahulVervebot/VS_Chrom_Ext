import React from 'react';
import { Badge, Card, Empty } from '../components/common.jsx';

export default function SyncPage({ state }) {
  const runs = Object.values(state.analyses).filter((r) => r.sentPackageAt).sort((a, b) => String(b.sentPackageAt).localeCompare(String(a.sentPackageAt)));
  return (
    <>
      <Card title="Delivery to VS Code">
        <div className="kv"><span>Connection</span><b>{state.bridge.state}</b><span>Waiting to deliver</span><b>{state.outbox} message(s)</b></div>
        {state.outbox > 0 && <p className="muted">These are held safely and sent automatically when VS Code is reachable again.</p>}
      </Card>
      {!runs.length && <Empty>No knowledge has been sent yet.</Empty>}
      {runs.map((r) => (
        <Card key={r.key || r.analysisId} title={r.analysisId} actions={<Badge status={r.status} />}>
          <div className="kv"><span>Sent</span><b>{new Date(r.sentPackageAt).toLocaleString()}</b><span>Files / workflows / entities</span><b>{r.packageSummary.files} / {r.packageSummary.workflows} / {r.packageSummary.entities}</b><span>Unknowns reported</span><b>{r.packageSummary.unknowns}</b></div>
          {r.ack && <div className="kv"><span>VS Code verified</span><b>{r.ack.counts.VERIFIED} / {r.ack.counts.INFERRED} / {r.ack.counts.UNKNOWN}</b><span>Stale files</span><b>{r.ack.stale.length}</b><span>Rejected items</span><b>{r.ack.rejected.length}</b></div>}
          {r.mergeResult && r.mergeResult.unverified.length > 0 && <details><summary>{r.mergeResult.unverified.length} item(s) VS Code could not verify</summary><ul>{r.mergeResult.unverified.slice(0, 30).map((u, i) => <li key={i}>{u.kind}: {u.entity || u.from || ''} {u.field || u.to || ''} <span className="muted">{u.reason}</span></li>)}</ul></details>}
          {r.attention && <div className="error small">{r.attention.message}</div>}
        </Card>
      ))}
    </>
  );
}
