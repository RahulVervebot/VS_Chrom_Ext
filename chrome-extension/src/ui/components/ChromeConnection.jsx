import React, { useState } from 'react';
import { Action, Badge, Card, ErrorBox, Notice } from './common.jsx';
import { cmd } from '../hooks/useStore.js';

export default function ChromeConnection({ state }) {
  const [token, setToken] = useState('');
  const [port, setPort] = useState(String(state.pairing ? state.pairing.port : state.settings.bridgePort));
  const [error, setError] = useState(null);
  const b = state.bridge;
  return (
    <Card title="VS Code connection" actions={<Badge status={b.state} />}>
      {b.session && <div className="kv"><span>Project</span><b>{b.session.projectName || b.session.projectId}</b><span>Session</span><b className="mono">{b.session.sessionId}</b></div>}
      {b.error && <Notice kind="warn">{b.error}</Notice>}
      {b.state === 'CONNECTED' ? (
        <>
          <div className="row"><Action onClick={() => cmd('disconnect', {})}>Disconnect</Action><Action onClick={() => cmd('disconnect', { forget: true })}>Forget pairing</Action></div>
          <h4>Working on another project?</h4>
          <ol className="steps">
            <li>Unfinished analyses keep their progress; you can resume them later.</li>
            <li>Open the other project in VS Code and run <b>AI Project: Pair Chrome</b>.</li>
            <li>Paste its code below and press Pair. Chrome switches to that project.</li>
          </ol>
          <label className="field">Pairing code for the other project<input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="e.g. 47821-7K3M9QX2LPWA" autoComplete="off" spellCheck="false" /></label>
          <Action kind="primary" disabled={!token.trim()} onClick={() => cmd('pair', { token, port })} onError={setError}>Switch to that project</Action>
          <ErrorBox error={error} />
        </>
      ) : (
        <>
          {state.paired && <div className="row"><Action kind="primary" onClick={() => cmd('connect')}>Reconnect to VS Code</Action></div>}
          <h4>{state.paired ? 'Pair again' : 'Pair with VS Code'}</h4>
          <ol className="steps">
            <li>In VS Code run <b>AI Project: Pair Chrome</b>.</li>
            <li>Paste the code it shows (it looks like <code>47821-7K3M9QX2LPWA</code>).</li>
            <li>Approve the pairing in the VS Code dialog.</li>
          </ol>
          <label className="field">Pairing code<input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} placeholder="e.g. 47821-7K3M9QX2LPWA" autoComplete="off" spellCheck="false" /></label>
          <label className="field">Port (only if your code has no port in front)<input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" /></label>
          <Action kind="primary" disabled={!token.trim()} onClick={() => cmd('pair', { token, port })} onError={setError}>Pair</Action>
          <ErrorBox error={error} />
          <p className="muted">The connection is local (127.0.0.1) and requires this code plus your approval in VS Code.</p>
        </>
      )}
    </Card>
  );
}
