import React, { useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Button, Card, Empty, Loading, fmt } from '../components/common.jsx';
import { ConfirmButton } from '../components/ui2.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function HistoryPage({ state, refresh }) {
  const { data: list, loading } = useRemote('getAnalyses', {});
  const [open, setOpen] = useState(null);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div>
      {loading && <Loading />}
      {(list || []).some((a) => ['CANCELLED', 'FAILED'].includes(a.status)) && (
        <div className="row wrap"><ConfirmButton confirmText="Click again: delete them" onConfirm={async () => { await rpc('clearAnalyses', {}); refresh(); }}>Delete all cancelled and failed runs</ConfirmButton><span className="muted-text">They produced no knowledge, so nothing known about the project is lost. Completed analyses are never deleted.</span></div>
      )}
      {list && !list.length && <Empty>No analyses yet. Each analysis is kept here with the files, hashes and knowledge changes.</Empty>}
      {(list || []).map((a) => (
        <Card key={a.analysisId} title={`${a.analysisId} · ${a.mode}`} actions={<Badge status={a.status} />}>
          <div className="muted-text">{new Date(a.timestamp).toLocaleString()}{a.purpose ? ` — ${a.purpose}` : ''}</div>
          <div className="kv"><span>Provider</span><b>{a.provider || '–'}</b><span>Files</span><b>{a.files.length}</b><span>Batches</span><b>{a.checkpoints.filter((c) => c.status === 'completed' && c.batchId !== 'final').length} / {a.batches.length}</b></div>
          {a.knowledgeChanges && <div className="kv"><span>Verified / inferred / unknown</span><b>{a.knowledgeChanges.counts.VERIFIED} / {a.knowledgeChanges.counts.INFERRED} / {a.knowledgeChanges.counts.UNKNOWN}</b><span>Conflicts</span><b>{a.knowledgeChanges.conflicts}</b><span>Files updated</span><b>{a.knowledgeChanges.filesUpdated}</b></div>}
          {a.coverageBefore && a.coverageAfter && <div className="muted-text">Coverage {a.coverageBefore.percent}% → {a.coverageAfter.percent}% ({a.coverageAfter.coverageStatus})</div>}
          <div className="row wrap">
            <Button onClick={() => setOpen(open === a.analysisId ? null : a.analysisId)}>{open === a.analysisId ? 'Hide files' : 'Show files'}</Button>
            {['SENT', 'IN_PROGRESS', 'PAUSED', 'DISCONNECTED', 'FAILED', 'CANCELLED'].includes(a.status) && <Button kind="primary" onClick={() => rpc('resumeAnalysis', { analysisId: a.analysisId }).then(refresh)} title="Continues with the batches that are not finished; finished batches are kept">{a.status === 'CANCELLED' ? 'Resume from where it stopped' : 'Resume'}</Button>}
            {a.status !== 'COMPLETED' && !['IN_PROGRESS', 'SENT'].includes(a.status) && <ConfirmButton onConfirm={async () => { await rpc('deleteAnalysis', { id: a.analysisId }); refresh(); }}>Delete</ConfirmButton>}
          </div>
          {open === a.analysisId && <ul className="list">{a.files.map((f) => <li key={f.path}><code>{f.path}</code> <span className="muted-text mono">{f.hash.slice(0, 15)}…</span></li>)}</ul>}
        </Card>
      ))}
    </div>
  );
}
