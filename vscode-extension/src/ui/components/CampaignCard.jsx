import React from 'react';
import { Badge, Bar, Button, Card, fmt } from './common.jsx';
import { rpc } from '../hooks/useRpc.js';

// The automatic, run-after-run analysis of the whole project or a folder: progress, stop, continue from where it stopped.
export default function CampaignCard({ campaign, reload, compact }) {
  if (!campaign) return null;
  const done = campaign.status === 'DONE';
  if (done && compact) return null;
  const pct = campaign.total ? Math.round((campaign.cursor / campaign.total) * 100) : 0;
  const run = (action) => async () => { await rpc('campaignControl', { action }); reload && reload(); };
  const last = campaign.runs[campaign.runs.length - 1];
  const waiting = campaign.status === 'ACTIVE' && campaign.lastError;
  return (
    <Card title="Automatic analysis" actions={<Badge status={done ? 'COMPLETED' : campaign.status === 'STOPPED' ? 'PAUSED' : waiting ? 'PAUSED' : 'IN_PROGRESS'}>{done ? 'COMPLETE' : campaign.status === 'STOPPED' ? 'STOPPED' : waiting ? 'WAITING' : 'RUNNING'}</Badge>}>
      <Bar percent={pct} status={done ? 'COMPLETED' : undefined} />
      <div className="kv">
        <span>Files done</span><b>{fmt(campaign.cursor)} of {fmt(campaign.total)}</b>
        <span>Runs</span><b>{campaign.runs.filter((r) => r.done).length} completed{!done && campaign.remaining > 0 ? ` · about ${Math.max(1, Math.ceil(campaign.remaining / campaign.perRun))} to go` : ''}</b>
        {last && !last.done && !done && <><span>Current run</span><b>{last.analysisId} ({fmt(last.files)} files)</b></>}
        {campaign.skippedAtStart > 0 && <><span>Skipped at start</span><b>{fmt(campaign.skippedAtStart)} already analyzed</b></>}
      </div>
      {done && <div className="notice">Everything in the selection has been processed.{campaign.notAnalyzed ? ` ${fmt(campaign.notAnalyzed)} file(s) could not be analyzed (a skipped or failed batch); run the analysis again to retry just those.` : ''}</div>}
      {waiting && <div className="notice warn">Waiting: {campaign.lastError}. It continues by itself as soon as that is fixed (for example when Chrome reconnects).</div>}
      {campaign.status === 'STOPPED' && <div className="notice">Stopped. Nothing is lost: <b>Continue</b> picks up from file {fmt(campaign.cursor + 1)}.</div>}
      {!done && (
        <div className="row wrap">
          {campaign.status === 'ACTIVE' ? <Button onClick={run('stop')}>Stop</Button> : <Button kind="primary" onClick={run('resume')}>Continue from where it stopped</Button>}
          {campaign.status === 'ACTIVE' && waiting && <Button kind="primary" onClick={run('resume')}>Try again now</Button>}
        </div>
      )}
    </Card>
  );
}
