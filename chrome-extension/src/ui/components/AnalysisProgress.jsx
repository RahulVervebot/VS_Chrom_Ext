import React from 'react';
import { Action, Badge, Bar, Card, Notice, fmt } from './common.jsx';
import { cmd } from '../hooks/useStore.js';

export default function AnalysisProgress({ run, status, settings, projectName, connectedProjectId }) {
  const batches = Object.values(run.batches || {});
  const done = batches.filter((b) => b.status === 'completed').length;
  const cur = status.current && status.current.key === run.key ? status.current : null;
  const live = ['RUNNING', 'PAUSED', 'NEEDS_ATTENTION', 'AWAITING_ACK'].includes(run.status) && !(run.attention && run.attention.code === 'SWITCHED');
  return (
    <Card title={`${run.analysisId} · ${run.mode}`} actions={<Badge status={run.status} />}>
      {projectName && <div className="muted">Project: <b>{projectName}</b>{connectedProjectId && run.projectId !== connectedProjectId ? ' (not the connected project)' : ''}</div>}
      {run.purpose && <div className="muted">{run.purpose}</div>}
      {run.campaign && <div className="muted">Automatic analysis: run {run.campaign.run} of about {run.campaign.estimatedRuns} · {fmt(run.campaign.filesDone)} of {fmt(run.campaign.filesTotal)} files done before this run. Stop ends the automatic continuation.</div>}
      <Bar percent={run.totalBatches ? (done / run.totalBatches) * 100 : 0} />
      <div className="kv">
        <span>Batch</span><b>{cur && cur.batchNumber ? `${cur.batchNumber} / ${cur.totalBatches}` : `${done} / ${run.totalBatches}`}</b>
        <span>Files</span><b>{fmt(run.files.length)}</b>
        <span>Estimated tokens</span><b>{fmt(run.estimatedTokens)}</b>
        <span>Provider</span><b>{settings.provider}</b>
        <span>Status</span><b>{cur ? String(cur.stage || '').replace(/_/g, ' ').toLowerCase() : run.status.toLowerCase().replace(/_/g, ' ')}{cur && cur.chars ? ` (${fmt(cur.chars)} chars received)` : ''}</b>
      </div>
      {run.status === 'PAUSED' && run.attention && run.attention.code === 'SWITCHED' && <Notice kind="warn">{run.attention.message}</Notice>}
      {run.status === 'NEEDS_ATTENTION' && run.attention && (
        <Notice kind="bad"><b>{run.attention.code}</b>: {run.attention.message}
          <div className="row wrap">
            {run.attention.batchId && <Action kind="primary" onClick={() => cmd('retryBatch', { id: run.key, batchId: run.attention.batchId })}>Retry failed batch</Action>}
            {run.attention.batchId && <Action onClick={() => cmd('skipBatch', { id: run.key, batchId: run.attention.batchId })}>Skip batch</Action>}
            {done > 0 && <Action onClick={() => cmd('finalize', { id: run.key })}>Send what is done</Action>}
          </div>
          {['LOGIN', 'CAPTCHA', 'LIMIT', 'NO_TAB', 'UI_CHANGED'].includes(run.attention.code) && <div className="muted">Fix the AI tab (or switch AI in Settings), then Retry. Nothing was sent to the wrong place.</div>}
        </Notice>
      )}
      {live && (
        <div className="row wrap">
          {run.status === 'PAUSED' ? <Action onClick={() => cmd('resume', { id: run.key })}>Resume</Action> : run.status === 'RUNNING' && <Action onClick={() => cmd('pause', { id: run.key })}>Pause</Action>}
          <Action onClick={() => cmd('stop', { id: run.key })}>Stop</Action>
        </div>
      )}
      {run.status === 'COMPLETED' && run.mergeResult && (
        <div className="muted">VS Code verified {run.ack && run.ack.counts ? `${run.ack.counts.VERIFIED} claims VERIFIED, ${run.ack.counts.INFERRED} INFERRED, ${run.ack.counts.UNKNOWN} UNKNOWN` : 'the knowledge'}; {run.mergeResult.unverified.length} item(s) could not be verified against source.</div>
      )}
    </Card>
  );
}
