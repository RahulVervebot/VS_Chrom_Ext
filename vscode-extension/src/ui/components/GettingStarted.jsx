import React, { useState } from 'react';
import { Badge, Button, Card, ErrorBox } from './common.jsx';
import { rpc } from '../hooks/useRpc.js';

function Step({ n, done, title, help, children }) {
  return (
    <li className={`gs-step ${done ? 'done' : ''}`}>
      <span className="gs-mark" aria-hidden="true">{done ? '✓' : n}</span>
      <div className="gs-body">
        <div className="gs-title">{title}{done && <Badge status="VERIFIED">DONE</Badge>}</div>
        <div className="muted-text">{help}</div>
        <div className="row wrap">{children}</div>
      </div>
    </li>
  );
}

// The whole workflow as one short checklist: set up, scan, choose, connect Chrome, analyze.
export default function GettingStarted({ state, refresh }) {
  const [error, setError] = useState(null);
  const [pairing, setPairing] = useState(null);
  const run = (fn) => async () => { setError(null); try { await fn(); } catch (e) { setError(e); } refresh(); };

  const initialized = state.initialized;
  const scanned = initialized && state.counts && state.counts.files > 0;
  const hasSel = state.selectionSummary && state.selectionSummary !== 'nothing selected';
  const connected = state.chrome.state === 'CONNECTED';
  const allReady = initialized && scanned && hasSel && connected;

  return (
    <Card title={allReady ? 'Ready to analyze' : 'Getting started'}>
      <ol className="gs">
        <Step n="1" done={initialized} title="Set up this project" help="Creates a .ai-project folder next to your code. Safe to run again.">
          {!initialized && <Button kind="primary" onClick={run(() => rpc('initialize', {}))}>Set up project</Button>}
        </Step>
        <Step n="2" done={scanned} title="Scan the code" help="Reads your files and finds workflows, APIs and database usage. No AI is used.">
          {initialized && <Button kind={scanned ? 'secondary' : 'primary'} onClick={run(() => rpc('scan'))}>{scanned ? 'Scan again' : 'Scan now'}</Button>}
        </Step>
        <Step n="3" done={hasSel} title="Choose what to analyze" help={hasSel ? `Selected: ${state.selectionSummary}` : 'Pick one: the whole project, a folder, or specific files.'}>
          {initialized && (
            <>
              <Button onClick={run(() => rpc('setSelection', { selection: { project: true } }))}>Entire project</Button>
              <Button onClick={run(() => rpc('exec', { command: 'aiProject.selectFolder' }))}>Choose folder…</Button>
              <Button onClick={run(() => rpc('exec', { command: 'aiProject.selectFiles' }))}>Choose files…</Button>
              {hasSel && <Button onClick={run(() => rpc('clearSelection'))}>Clear</Button>}
            </>
          )}
        </Step>
        <Step n="4" done={connected} title="Connect Chrome (once)" help={connected ? 'Chrome is connected.' : 'Click, paste the code into the Chrome extension (Connection tab), then press Allow here. Switching from another project? Pairing replaces the old one; its progress is kept.'}>
          {initialized && !connected && <Button kind="primary" onClick={run(async () => setPairing(await rpc('pairChrome')))}>Show pairing code</Button>}
        </Step>
        {pairing && !connected && (
          <li className="gs-code">
            <div className="muted-text">Paste this whole code in Chrome → AI Project Bridge → Connection → Pair:</div>
            <div className="code-big" aria-label="Pairing code">{pairing.code || pairing.token}</div>
          </li>
        )}
        <Step n="5" done={false} title="Analyze with AI" help="You review exactly what will be sent, then approve it again in Chrome.">
          <Button kind={allReady ? 'primary' : 'secondary'} disabled={!(initialized && scanned && hasSel)} onClick={run(() => rpc('startAnalysis', {}))}>Analyze…</Button>
          {!connected && initialized && scanned && hasSel && <span className="muted-text">Connect Chrome first (step 4).</span>}
        </Step>
      </ol>
      <ErrorBox error={error} />
    </Card>
  );
}
