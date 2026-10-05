import React, { useState } from 'react';
import { Button, Card, Empty, ErrorBox, fmt } from '../components/common.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function ScanPage({ state, refresh }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  const s = state.lastScan;
  const d = state.delta;
  const run = async () => { setBusy(true); setError(null); try { await rpc('scan'); refresh(); } catch (e) { setError(e); } finally { setBusy(false); } };
  return (
    <div>
      <Card title="Scan" actions={<Button kind="primary" onClick={run} disabled={busy}>{busy ? 'Scanning…' : 'Scan project'}</Button>}>
        <p className="muted-text">Scans the real workspace: hashes every file, detects languages, symbols, imports, APIs, database usage and workflows. Unchanged files are not re-analyzed.</p>
        <ErrorBox error={error} />
        {s ? (
          <div className="kv">
            <span>Scanned at</span><b>{new Date(s.scannedAt).toLocaleString()}</b>
            <span>Duration</span><b>{s.durationMs} ms</b>
            <span>Files</span><b>{fmt(s.totals.files)}</b>
            <span>Source files</span><b>{fmt(s.totals.sourceFiles)}</b>
            <span>Lines</span><b>{fmt(s.totals.lines)}</b>
            <span>Estimated tokens</span><b>{fmt(s.totals.tokens)}</b>
            <span>Unreadable paths</span><b>{s.errors}</b>
          </div>
        ) : <Empty>Not scanned in this session.</Empty>}
      </Card>
      {s && <Card title="Languages"><div className="row wrap">{Object.entries(s.languages).sort((a, b) => b[1] - a[1]).map(([l, n]) => <span className="chip" key={l}>{l}: {n}</span>)}</div></Card>}
      {d && (
        <Card title="Changes since previous scan">
          <div className="kv"><span>Changed files</span><b>{d.changed.length}</b><span>Removed files</span><b>{d.removed.length}</b><span>Analyzed files now OUTDATED</span><b>{d.outdated.length}</b></div>
          {d.impact && d.impact.changedFiles.length > 0 && (
            <>
              <h4>Impact of changed analyzed files</h4>
              <ul>
                <li>Dependents: {d.impact.dependents.join(', ') || 'none'}</li>
                <li>Workflows: {d.impact.workflows.join(', ') || 'none'}</li>
                <li>Features: {d.impact.features.join(', ') || 'none'}</li>
                <li>Database entities: {d.impact.entities.join(', ') || 'none'}</li>
                <li>Documentation now OUTDATED: {d.impact.documentation.join(', ') || 'none'}</li>
              </ul>
            </>
          )}
        </Card>
      )}
      <Card title="Exclusions" actions={<Button onClick={() => rpc('exec', { command: 'aiProject.configureExclusions' })}>Configure</Button>}>
        <div className="row wrap">{state.settings.excludePatterns.map((p) => <span className="chip" key={p}>{p}</span>)}</div>
      </Card>
    </div>
  );
}
