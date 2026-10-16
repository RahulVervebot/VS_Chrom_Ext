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
      <ReadingOrder settings={state.settings} refresh={refresh} />
      <AdditionalPrompt settings={state.settings} refresh={refresh} />
      <Card title="Exclusions" actions={<Button onClick={() => rpc('exec', { command: 'aiProject.configureExclusions' })}>Configure</Button>}>
        <div className="row wrap">{state.settings.excludePatterns.map((p) => <span className="chip" key={p}>{p}</span>)}</div>
      </Card>
    </div>
  );
}

// Which folders the analysis reads first and which last (one folder or file per line, relative to the project root).
function ReadingOrder({ settings, refresh }) {
  const [first, setFirst] = useState((settings.readFirst || []).join('\n'));
  const [last, setLast] = useState((settings.readLast || []).join('\n'));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const lines = (t) => t.split('\n').map((x) => x.trim().replace(/^\.?\//, '')).filter(Boolean);
  const save = async () => {
    setError(null); setSaved(false);
    try { await rpc('updateSetting', { key: 'readFirst', value: lines(first) }); await rpc('updateSetting', { key: 'readLast', value: lines(last) }); setSaved(true); refresh(); } catch (e) { setError(e); }
  };
  return (
    <Card title="Reading order" actions={<Button kind="primary" onClick={save}>Save order</Button>}>
      <p className="muted-text">When you analyze the whole project or a folder, files under <b>Read first</b> are sent first (in the order listed), files under <b>Read last</b> are sent last, and everything else in between. Inside every add-on or package its manifest (<code>__manifest__.py</code>, <code>package.json</code>, <code>go.mod</code>…) is read before its code. Runs already started keep their order, so a resume is never mixed up.</p>
      <ErrorBox error={error} />
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <label className="field" style={{ flex: 1, minWidth: 220 }}><span>Read first (one folder per line)</span><textarea rows={4} value={first} placeholder="custom_addons" onChange={(e) => { setFirst(e.target.value); setSaved(false); }} /></label>
        <label className="field" style={{ flex: 1, minWidth: 220 }}><span>Read last (one folder per line)</span><textarea rows={4} value={last} placeholder="tulsi_pos/addons" onChange={(e) => { setLast(e.target.value); setSaved(false); }} /></label>
      </div>
      {saved && <div className="muted-text">Saved. The next analysis uses this order.</div>}
    </Card>
  );
}

// The user's standing instructions for the AI, sent with every request (analysis, module overview, comparison, blueprint, documents).
function AdditionalPrompt({ settings, refresh }) {
  const [text, setText] = useState(settings.additionalPrompt || '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const save = async () => { setError(null); setSaved(false); try { await rpc('updateSetting', { key: 'additionalPrompt', value: text.trim() }); setSaved(true); refresh(); } catch (e) { setError(e); } };
  return (
    <Card title="Additional prompt" actions={<Button kind="primary" onClick={save}>Save</Button>}>
      <p className="muted-text">Your own instructions, added to every AI request: analysis, module overview, comparison, blueprint and documents. Use it to say what the project is and what matters to you. It cannot switch off the rules: the AI still may not invent files, features or fields.</p>
      <ErrorBox error={error} />
      <textarea rows={5} style={{ width: '100%' }} value={text} placeholder="This is an Odoo 15 point-of-sale project. Explain features the way a shop owner would understand them. Pay special attention to discounts, loyalty, payments and stock." onChange={(e) => { setText(e.target.value); setSaved(false); }} />
      {saved && <div className="muted-text">Saved. Used from the next AI request on.</div>}
    </Card>
  );
}
