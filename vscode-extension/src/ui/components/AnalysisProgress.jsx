import React from 'react';
import { Card, Badge, Bar, Button, fmt } from './common.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function AnalysisProgress({ run, reload, compact }) {
  if (!run) return null;
  const done = run.completedBatches.length;
  const pct = run.totalBatches ? Math.round((done / run.totalBatches) * 100) : 0;
  const ctl = (action) => async () => { await rpc('runnerControl', { action, analysisId: run.analysisId }); reload && reload(); };
  const live = ['IN_PROGRESS', 'AWAITING_ACCEPT', 'PAUSED', 'WAITING_PACKAGE', 'DISCONNECTED', 'FAILED'].includes(run.status);
  return (
    <Card title={`Analysis ${run.analysisId}`} actions={<Badge status={run.status} />}>
      <div className="muted-text">{run.mode}{run.purpose ? ` — ${run.purpose}` : ''}</div>
      <Bar percent={pct} status={run.status} />
      <div className="kv">
        <span>Batch</span><b>{Math.min(run.batchNumber, run.totalBatches)} / {run.totalBatches}</b>
        <span>Files</span><b>{fmt(run.filesDone)} / {fmt(run.filesTotal)}</b>
        <span>Estimated tokens</span><b>{fmt(run.estimatedTokens)}</b>
        <span>Status</span><b>{run.stage}</b>
        <span>Provider</span><b>{run.provider || '–'}</b>
        {run.failedBatches.length > 0 && <><span>Failed batches</span><b>{run.failedBatches.join(', ')}</b></>}
      </div>
      {run.error && <div className="error-box">{run.error}</div>}
      {live && !compact && (
        <div className="row wrap">
          {run.status === 'FAILED' ? <Button kind="primary" onClick={ctl('resume')}>Retry from failed batch</Button> : run.status === 'PAUSED' ? <Button onClick={ctl('resume')}>Resume</Button> : <Button onClick={ctl('pause')}>Pause</Button>}
          <Button onClick={ctl('cancel')}>Cancel</Button>
          {run.failedBatches.length > 0 && <Button onClick={ctl('skip')}>Skip failed batch</Button>}
          {run.status === 'DISCONNECTED' && <Button kind="primary" onClick={() => rpc('resumeAnalysis', { analysisId: run.analysisId }).then(reload)}>Resume from checkpoint</Button>}
        </div>
      )}
    </Card>
  );
}
