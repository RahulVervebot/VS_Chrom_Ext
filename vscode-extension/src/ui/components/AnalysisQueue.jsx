import React, { useState } from 'react';
import { Badge, Button, Card, Empty, ErrorBox, fmt } from './common.jsx';
import { rpc } from '../hooks/useRpc.js';

const KINDS = ['files', 'folders', 'features', 'workflows', 'entities', 'apis'];

export default function AnalysisQueue({ state, reload }) {
  const [purpose, setPurpose] = useState('');
  const [reanalyze, setReanalyze] = useState(false);
  const [prep, setPrep] = useState(null);
  const [error, setError] = useState(null);
  const sel = state.selection;
  const nothing = state.selectionSummary === 'nothing selected';
  const guard = (fn) => async () => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  return (
    <div>
      <Card title="Selection" actions={<Button onClick={guard(async () => { await rpc('clearSelection'); setPrep(null); reload(); })} disabled={nothing}>Clear</Button>}>
        <div className="muted-text">Mode: <b>{state.selectionMode}</b> · {state.selectionSummary}</div>
        {KINDS.map((k) => sel[k].length > 0 && (<div key={k}><h4>{k}</h4><div className="row wrap">{sel[k].map((x) => <span className="chip removable" key={x}>{x}<button aria-label={`Remove ${x}`} onClick={guard(async () => { await rpc('removeSelection', { kind: k, item: x }); setPrep(null); reload(); })}>×</button></span>)}</div></div>))}
        {sel.project && <div className="chip">entire project</div>}
        {nothing && <Empty>Select files or folders in Files, a workflow, feature or database entity — or analyze the entire project.</Empty>}
        <div className="row wrap"><Button onClick={guard(async () => { await rpc('addSelection', { kind: 'project' }); reload(); })}>Select entire project</Button></div>
      </Card>
      <Card title="Start analysis">
        <label className="field">Purpose (optional)<input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Analyze the checkout workflow" /></label>
        {(state.selectionMode === 'PROJECT' || state.selectionMode === 'FOLDER') && (
          <label className="row"><input type="checkbox" checked={reanalyze} onChange={(e) => { setReanalyze(e.target.checked); setPrep(null); }} /> Re-analyze files that are already analyzed <span className="muted-text">(off: continue with the files not analyzed yet)</span></label>
        )}
        <div className="row wrap">
          <Button onClick={guard(async () => setPrep(await rpc('prepareAnalysis', { purpose, reanalyze })))} disabled={nothing}>Preview what will be sent</Button>
          <Button kind="primary" onClick={guard(async () => { await rpc('startAnalysis', { purpose: purpose || undefined, reanalyze }); reload(); })} disabled={nothing}>Analyze with AI…</Button>
        </div>
        <ErrorBox error={error} />
        {prep && (
          <div className="preview">
            <div className="kv">
              <span>Files to send</span><b>{fmt(prep.stats.includedFiles)} ({fmt(prep.stats.selectedFiles)} selected)</b>
              <span>Batches</span><b>{prep.stats.batches}</b>
              <span>Estimated tokens</span><b>{fmt(prep.stats.totalTokens)}</b>
              <span>Secrets redacted</span><b>{prep.stats.secretsRedacted}{prep.stats.secretsRedacted ? ` (${[...new Set(prep.stats.secrets.map((s) => s.type))].join(', ')})` : ''}</b>
              {prep.stats.alreadyAnalyzed > 0 && <><span>Already analyzed (skipped)</span><b>{fmt(prep.stats.alreadyAnalyzed)}</b></>}
              {prep.stats.waitingForNextRun > 0 && <><span>Waiting for the next run</span><b>{fmt(prep.stats.waitingForNextRun)}</b></>}
              <span>Omitted by limits</span><b>{prep.stats.omitted.length}</b>
            </div>
            {prep.batches.map((b) => <details key={b.batchId}><summary>{b.batchId} — {b.files.length} files · ~{fmt(b.tokens)} tokens <Badge status="READY" /></summary><ul>{b.files.map((f) => <li key={f}><code>{f}</code></li>)}</ul></details>)}
            {prep.stats.notes.length > 0 && <div className="muted-text">{prep.stats.notes.join(' ')}</div>}
          </div>
        )}
      </Card>
      <Card title="Queue">
        {state.runner.length ? <ul className="list">{state.runner.map((r) => <li key={r.analysisId}><b>{r.analysisId}</b> {r.mode} <Badge status={r.status} /> <span className="muted-text">batch {Math.min(r.batchNumber, r.totalBatches)}/{r.totalBatches}</span></li>)}</ul> : <Empty>No analyses queued in this session.</Empty>}
      </Card>
    </div>
  );
}
