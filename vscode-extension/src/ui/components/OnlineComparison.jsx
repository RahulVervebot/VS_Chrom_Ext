import React, { useState } from 'react';
import { Button, Card, Empty, ErrorBox, FileLink } from './common.jsx';
import { ConfirmButton, ago } from './ui2.jsx';
import { useRemote } from '../hooks/useAppState.js';
import { rpc } from '../hooks/useRpc.js';

const SEV = { high: 'bad', medium: 'warn', low: 'muted' };
const looksLikeFile = (w) => /\.[a-z0-9]{1,6}$/i.test(String(w || '').trim());

// "where" in this project: clickable when it is a file, flagged when the AI named something that does not exist here
function Where({ x }) {
  if (!x.where) return null;
  return (
    <div className="muted-text">
      where: {looksLikeFile(x.where) && x.whereCheck === 'FOUND' ? <FileLink file={x.where.replace(/:\d+(-\d+)?$/, '')} line={1}>{x.where}</FileLink> : <code>{x.where}</code>}
      {x.whereCheck === 'NOT_FOUND' && <span className="cx-pill warn" style={{ marginLeft: 6 }} title="The AI named a place that does not exist in this project; check this item">not found in this project</span>}
    </div>
  );
}

// Summary, possible bugs and recommended changes: used by internal comparisons and by comparisons with online software.
export function Findings({ result, ourName }) {
  if (!result) return null;
  const bugs = result.possibleBugs || [];
  const changes = result.recommendedChanges || [];
  if (!result.summary && !bugs.length && !changes.length) return null;
  return (
    <div>
      {result.summary && <div className="cx-hint" style={{ margin: '8px 0' }}><b>Summary: </b>{result.summary}</div>}
      {bugs.length > 0 && (
        <div className="cx-ai-card" style={{ marginBottom: 10 }}>
          <h4>Possible bugs ({bugs.length})</h4>
          <ul>{bugs.map((b, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              <span className={`cx-pill ${SEV[b.severity] || 'muted'}`}>{b.severity}</span> <b>{b.title}</b>{b.project && ourName && b.project !== ourName ? <span className="muted-text"> ({b.project})</span> : null}
              {b.why && <div>{b.why}</div>}
              {b.fix && <div><i>Fix:</i> {b.fix}</div>}
              <Where x={b} />
            </li>
          ))}</ul>
        </div>
      )}
      {changes.length > 0 && (
        <div className="cx-ai-card" style={{ marginBottom: 10 }}>
          <h4>Recommended changes ({changes.length})</h4>
          <div className="table-wrap"><table><thead><tr><th>Priority</th><th>Change</th><th>Why</th><th>Effort</th></tr></thead><tbody>
            {changes.map((c, i) => <tr key={i}><td><span className={`cx-pill ${SEV[c.priority] || 'muted'}`}>{c.priority}</span></td><td><b>{c.title}</b>{c.what && <div>{c.what}</div>}<Where x={c} /></td><td>{c.why}{c.source && <div className="muted-text">{c.source}</div>}</td><td>{c.effort}</td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}

function OnlineResult({ rec, onDelete }) {
  const r = rec.result;
  const fc = (r && r.featureComparison) || { common: [], onlyOurs: [], onlyTheirs: [] };
  const ours = rec.projects[0] ? rec.projects[0].name : 'This project';
  const theirs = r && r.target && r.target.name ? `${r.target.name}${r.target.version ? ` ${r.target.version}` : ''}` : rec.target;
  return (
    <Card title={`${ours} vs ${theirs}`} actions={<><span className="muted-text">{rec.comparisonId} · {ago(rec.receivedAt || rec.createdAt)}</span><ConfirmButton onConfirm={onDelete}>Delete</ConfirmButton></>}>
      <div className="muted-text">Compared: {rec.scopeLabel}{rec.prompt ? ` · prompt: “${rec.prompt.slice(0, 200)}${rec.prompt.length > 200 ? '…' : ''}”` : ''}</div>
      {!r ? <div className="notice">Waiting for the AI. Approve the request in the Chrome side panel (Compare tab); the research can take several minutes.</div> : (
        <>
          {r.researchNote && <div className="notice" style={{ marginTop: 6 }}>{r.researchNote}</div>}
          <div className="muted-text">What is said about {theirs} comes from the AI's research and could not be checked here: use the sources. Every place in this project it mentions was checked.</div>
          <Findings result={r} ourName={ours} />
          <div className="cx-cols">
            <div className="cx-col"><h4><span>In both</span><small>{fc.common.length}</small></h4><ul>{fc.common.map((x, i) => <li key={i}><b>{x.feature}</b>{x.ours && <div className="muted-text">ours: {x.ours}</div>}{x.theirs && <div className="muted-text">{theirs}: {x.theirs}</div>}{x.notes && <div>{x.notes}</div>}</li>)}</ul></div>
            <div className="cx-col a"><h4><span>Only in {ours}</span><small>{fc.onlyOurs.length}</small></h4><ul>{fc.onlyOurs.map((x, i) => <li key={i}><b>{x.feature}</b>{x.notes && <div className="muted-text">{x.notes}</div>}</li>)}</ul></div>
            <div className="cx-col b"><h4><span>Only in {theirs}</span><small>{fc.onlyTheirs.length}</small></h4><ul>{fc.onlyTheirs.map((x, i) => <li key={i}><b>{x.feature}</b> <span className={`cx-pill ${x.worthAdding === 'yes' ? 'ok' : x.worthAdding === 'no' ? 'muted' : 'warn'}`}>worth adding: {x.worthAdding}</span>{x.why && <div className="muted-text">{x.why}</div>}{x.notes && <div className="muted-text">{x.notes}</div>}</li>)}</ul></div>
          </div>
          {r.structureDifferences.length > 0 && (
            <><h4>Structure differences</h4>
              <div className="table-wrap"><table><thead><tr><th>Area</th><th>{ours}</th><th>{theirs}</th><th>What it means</th></tr></thead><tbody>
                {r.structureDifferences.map((x, i) => <tr key={i}><td><b>{x.area}</b></td><td>{x.ours}</td><td>{x.theirs}</td><td>{x.implication}</td></tr>)}
              </tbody></table></div></>
          )}
          {r.target && r.target.sources.length > 0 && <><h4>Sources</h4><ul>{r.target.sources.map((s, i) => <li key={i}>{s.url ? <button className="link-btn" onClick={() => rpc('openUrl', { url: s.url })} title={s.url}>{s.title || s.url}</button> : s.title}</li>)}</ul></>}
          {r.unknowns.length > 0 && <><h4>Not established</h4><ul>{r.unknowns.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          <div className="muted-text">Saved as .ai-project/comparisons/{rec.comparisonId}.md</div>
        </>
      )}
    </Card>
  );
}

const EXAMPLE = 'Compare this project with Odoo 15 (Community and Enterprise where relevant). Check features, the module structure, the data model (models and fields), access rules and workflows. Tell me which features Odoo 15 has that we do not, which of our features are custom, what looks like a bug or a risk in our project compared to how Odoo 15 does it, and what we should change, with details.';

export function OnlineCompareForm({ state, onStarted }) {
  const { data: mods } = useRemote('getModules', {});
  const [target, setTarget] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState('project');
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const modules = (mods && mods.modules) || [];
  const toggle = (p) => setPicked(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p]);
  const start = async () => {
    setError(null); setBusy(true);
    try { await rpc('compareOnline', { target, prompt, scope, modules: picked }); onStarted && onStarted(); setPrompt(''); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <Card title="Compare with online software">
      <p className="muted-text">The AI (in your ChatGPT/Claude tab) researches the software you name on the web: its documentation, release notes and source. It then compares it with this project's specification: features both have, what only one has, structure differences, likely bugs and changes to make, with sources and a summary. Only the specification is sent, not your code.</p>
      <label className="field"><span>Compare with</span><input value={target} placeholder="Odoo 15 Community — Point of Sale" onChange={(e) => setTarget(e.target.value)} /></label>
      <div className="field"><span>What of this project</span>
        <div className="row wrap">
          <label className="row"><input type="radio" checked={scope === 'project'} onChange={() => setScope('project')} /> the entire project</label>
          <label className="row"><input type="radio" checked={scope === 'selection'} onChange={() => setScope('selection')} /> the current selection{state.selectionSummary ? ` (${state.selectionSummary})` : ''}</label>
          {modules.length > 0 && <label className="row"><input type="radio" checked={scope === 'modules'} onChange={() => setScope('modules')} /> chosen modules / add-ons</label>}
        </div>
        {scope === 'modules' && <div className="cx-chips" style={{ marginTop: 6 }}>{modules.map((m) => <button key={m.path} className={`cx-chip ${picked.includes(m.path) ? 'a' : ''}`} onClick={() => toggle(m.path)}>{m.name}</button>)}</div>}
      </div>
      <label className="field"><span>Prompt for the AI</span><textarea rows={5} value={prompt} placeholder={EXAMPLE} onChange={(e) => setPrompt(e.target.value)} /></label>
      <div className="row wrap">
        <Button kind="primary" disabled={busy || !target.trim() || (scope === 'modules' && !picked.length)} onClick={start}>{busy ? 'Sending…' : 'Compare with online software'}</Button>
        {!prompt && <Button onClick={() => setPrompt(EXAMPLE)}>Use the example prompt</Button>}
      </div>
      <ErrorBox error={error} />
    </Card>
  );
}

export default function OnlineComparisons({ comparisons, state, reload }) {
  return (
    <div>
      <OnlineCompareForm state={state} onStarted={reload} />
      {!comparisons.length ? <Empty>No comparisons with online software yet.</Empty> : comparisons.map((c) => <OnlineResult key={c.comparisonId} rec={c} onDelete={async () => { await rpc('deleteComparison', { id: c.comparisonId }); reload(); }} />)}
    </div>
  );
}
