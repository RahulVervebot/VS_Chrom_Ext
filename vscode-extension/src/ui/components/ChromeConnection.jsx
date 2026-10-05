import React, { useState } from 'react';
import { Badge, Button, Card } from './common.jsx';
import { rpc } from '../hooks/useRpc.js';
import { useRemote } from '../hooks/useAppState.js';

export default function ChromeConnection({ chrome, reload }) {
  const [pairing, setPairing] = useState(null);
  const [err, setErr] = useState(null);
  const { data: pairs, reload: reloadPairs } = useRemote('listPairings', {});
  const run = (fn) => async () => { setErr(null); try { await fn(); } catch (e) { setErr(e); } reload && reload(); reloadPairs(); };
  return (
    <Card title="Chrome bridge" actions={<Badge status={chrome.state} />}>
      <div className="kv">
        <span>Status</span><b>{chrome.state}</b>
        <span>Provider</span><b>{chrome.provider || '–'}</b>
        <span>Session</span><b>{chrome.sessionId || '–'}</b>
        <span>Project</span><b>{chrome.projectId || '–'}</b>
        <span>Endpoint</span><b>{chrome.state === 'STOPPED' ? 'not listening' : `${chrome.host}:${chrome.port} (loopback only)`}</b>
        <span>Protocol</span><b>{chrome.protocolVersion}</b>
      </div>
      <div className="row wrap">
        <Button kind="primary" onClick={run(async () => setPairing(await rpc('pairChrome')))}>Pair Chrome</Button>
        <Button onClick={run(() => rpc('connectChrome'))}>Connect</Button>
        <Button onClick={run(() => rpc('disconnectChrome', {}))} disabled={chrome.state === 'STOPPED'}>Disconnect</Button>
      </div>
      {pairing && chrome.state === 'PAIRING' && <div className="pairing"><div className="muted-text">Enter this code in the Chrome extension (expires {new Date(pairing.expiresAt).toLocaleTimeString()}):</div><div className="code-big" aria-label="Pairing code">{pairing.token}</div></div>}
      {err && <div className="error-box">{err.message}</div>}
      <h4>Paired browsers</h4>
      {pairs && pairs.length ? <ul>{pairs.map((p) => <li key={p.connectionId}>{p.label || 'Chrome extension'} <span className="muted-text">{p.connectionId} · since {new Date(p.createdAt).toLocaleDateString()}</span></li>)}</ul> : <div className="muted-text">No paired browsers.</div>}
      {pairs && pairs.length > 0 && <Button onClick={run(() => rpc('disconnectChrome', { revoke: true }))}>Forget pairing</Button>}
    </Card>
  );
}
