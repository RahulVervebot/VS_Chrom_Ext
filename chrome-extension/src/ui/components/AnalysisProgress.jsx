import React, { useState } from 'react';
import { Action, Badge, Bar, Card, Notice, fmt } from './common.jsx';
import { cmd } from '../hooks/useStore.js';

// For a batch that keeps failing: one file per message, an outline of long files, leaving files out, and/or an instruction.
function TryAnotherWay({ run }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [approach, setApproach] = useState('single');
  const [instruction, setInstruction] = useState('');
  const [drop, setDrop] = useState(new Set());
  const [error, setError] = useState(null);
  const batchId = run.attention.batchId;
  const show = async () => { setOpen(true); setError(null); try { const r = await cmd('batchFiles', { id: run.key, batchId }); setFiles(r.files); if (r.retry) { setApproach(r.retry.approach === 'same' ? 'same' : r.retry.approach); setInstruction(r.retry.instruction || ''); setDrop(new Set(r.retry.dropFiles || [])); } } catch (e) { setError(e.message); } };
  if (!open) return <Action onClick={show}>Try another way…</Action>;
  const toggle = (p) => { const n = new Set(drop); if (n.has(p)) n.delete(p); else n.add(p); setDrop(n); };
  const go = async () => { setError(null); try { await cmd('retryBatch', { id: run.key, batchId, approach, instruction: instruction.trim() || undefined, dropFiles: [...drop] }); setOpen(false); } catch (e) { setError(e.message); } };
  const long = (files || []).filter((f) => f.lines > 300).length;
  return (
    <div className="card" style={{ width: '100%', marginTop: 6 }}>
      <b>Try batch {batchId} another way</b>
      <label className="field row"><input type="radio" checked={approach === 'single'} onChange={() => setApproach('single')} /> One file per message (a file that still fails does not stop the others)</label>
      <label className="field row"><input type="radio" checked={approach === 'outline'} onChange={() => setApproach('outline')} /> Outline only for long files: first 300 lines + the list of functions/classes{long ? ` (${long} long file${long === 1 ? '' : 's'} here)` : ''}</label>
      <label className="field row"><input type="radio" checked={approach === 'same'} onChange={() => setApproach('same')} /> Same way, only with the changes below</label>
      <label className="field">Instruction for the AI, for this retry only (optional)<textarea rows={3} value={instruction} placeholder="e.g. Keep the answer short: only purpose and the main functions of each file." onChange={(e) => setInstruction(e.target.value)} /></label>
      {files && files.length > 0 && (
        <div>
          <div className="muted">Leave files out (they stay "not analyzed" in VS Code, where you can retry or skip them later):</div>
          {files.map((f) => <label key={f.path} className="field row"><input type="checkbox" checked={drop.has(f.path)} onChange={() => toggle(f.path)} /> <code>{f.path}</code> <span className="muted">{fmt(f.lines)} lines</span></label>)}
        </div>
      )}
      {error && <Notice kind="bad">{error}</Notice>}
      <div className="row wrap"><Action kind="primary" onClick={go}>Retry this batch</Action><Action onClick={() => setOpen(false)}>Cancel</Action></div>
    </div>
  );
}

// A run finished with "Send what is done": its failed/skipped batches can still be retried (in any way) or skipped for good.
function Unfinished({ run, missing }) {
  const [approach, setApproach] = useState('same');
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState(null);
  const ask = (extra) => async () => { setError(null); try { await cmd('followUp', { id: run.key, approach, instruction: instruction.trim() || undefined, ...extra }); } catch (e) { setError(e.message); } };
  const req = run.followUpRequested;
  return (
    <Notice kind="warn">
      <b>{missing} of {run.totalBatches} batch(es) were not finished</b> (sent with "Send what is done"). Their files are still "not analyzed" in VS Code.
      {req && <div className="muted">{req.skip ? 'You chose to skip them.' : `Retry requested at ${new Date(req.at).toLocaleTimeString()}: it appears as a new run.`}</div>}
      <div className="row wrap" style={{ marginTop: 4 }}>
        <label className="field row"><input type="radio" checked={approach === 'same'} onChange={() => setApproach('same')} /> same way</label>
        <label className="field row"><input type="radio" checked={approach === 'single'} onChange={() => setApproach('single')} /> one file per message</label>
        <label className="field row"><input type="radio" checked={approach === 'outline'} onChange={() => setApproach('outline')} /> outline of long files</label>
      </div>
      <label className="field">Instruction for the AI (optional)<textarea rows={2} value={instruction} placeholder="e.g. Only purpose and main functions; keep it short." onChange={(e) => setInstruction(e.target.value)} /></label>
      {error && <Notice kind="bad">{error}</Notice>}
      <div className="row wrap">
        <Action kind="primary" onClick={ask({})}>Retry the unfinished files</Action>
        <Action onClick={ask({ skip: true })}>Skip those files</Action>
      </div>
    </Notice>
  );
}

export default function AnalysisProgress({ run, status, settings, projectName, connectedProjectId }) {
  const batches = Object.values(run.batches || {});
  const done = batches.filter((b) => b.status === 'completed').length;
  const cur = status.current && status.current.key === run.key ? status.current : null;
  const live = ['RUNNING', 'PAUSED', 'NEEDS_ATTENTION', 'AWAITING_ACK', 'WAITING_RETRY'].includes(run.status) && !(run.attention && run.attention.code === 'SWITCHED');
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
      {cur && cur.detail && <div className="muted" style={{ marginTop: 4 }}>{cur.detail}</div>}
      {cur && cur.detail ? (
        <div className="row wrap" style={{ marginTop: 4 }}>
          <Action onClick={() => cmd('acceptAnswer')}>The AI has answered — continue</Action>
          <Action onClick={async () => { const d = await cmd('pageDiagnostics'); try { await navigator.clipboard.writeText(d.text); window.alert('Page diagnostics copied to the clipboard (layout and text lengths only, no content). Paste them to the developer.'); } catch { window.prompt('Copy the page diagnostics:', d.text); } }}>Copy page diagnostics</Action>
          <span className="muted">Use this only if the answer in the AI tab is complete but the extension keeps waiting.</span>
        </div>
      ) : null}
      {['COMPLETED', 'AWAITING_ACK'].includes(run.status) && run.totalBatches > done && <Unfinished run={run} missing={run.totalBatches - done} />}
      {run.status === 'CANCELLED' && (
        <Notice kind="warn">Cancelled. {done} of {run.totalBatches} batches were finished and are kept. To continue from the next batch, run <b>AI Project: Resume Analysis</b> in VS Code (or History → Resume). To throw it away: <Action onClick={() => cmd('deleteAnalysis', { id: run.key })}>Delete this run</Action></Notice>
      )}
      {run.status === 'PAUSED' && run.attention && run.attention.code === 'SWITCHED' && <Notice kind="warn">{run.attention.message}</Notice>}
      {run.status === 'WAITING_RETRY' && run.attention && run.attention.autoRetry && (
        <Notice kind="warn">
          {run.attention.autoRetry.offline ? <><b>No internet connection.</b> The run continues by itself from batch {run.attention.batchId} as soon as the connection is back.</> : <><b>Connection problem</b> ({run.attention.code}: {run.attention.message}). Retry {run.attention.autoRetry.attempt} of {run.attention.autoRetry.max} at {new Date(run.attention.autoRetry.nextAt).toLocaleTimeString()}, from the start of batch {run.attention.batchId}.</>}
          <div className="muted">Finished batches are kept and never sent again. You can close this panel; it also continues after Chrome restarts.</div>
          <div className="row wrap">
            <Action kind="primary" onClick={() => cmd('retryBatch', { id: run.key, batchId: run.attention.batchId })}>Retry now</Action>
            <TryAnotherWay run={run} />
            <Action onClick={() => cmd('skipBatch', { id: run.key, batchId: run.attention.batchId })}>Skip batch</Action>
          </div>
        </Notice>
      )}
      {run.status === 'NEEDS_ATTENTION' && run.attention && (
        <Notice kind="bad"><b>{run.attention.code}</b>: {run.attention.message}
          <div className="row wrap">
            {run.attention.batchId && <Action kind="primary" onClick={() => cmd('retryBatch', { id: run.key, batchId: run.attention.batchId })}>Retry the same way</Action>}
            {run.attention.batchId && <TryAnotherWay run={run} />}
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
