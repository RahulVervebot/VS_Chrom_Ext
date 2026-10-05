import React, { useEffect, useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Button, Card, Empty, Loading, Badge } from '../components/common.jsx';
import ComparisonViewer from '../components/ComparisonViewer.jsx';
import SpecViewer from '../components/SpecViewer.jsx';
import { MatrixView, SuggestionsPanel, AiAnalysis } from '../components/SpecComparison.jsx';
import { ConfirmButton, Step, Tabs, ago } from '../components/ui2.jsx';
import { rpc } from '../hooks/useRpc.js';

const run = (command) => () => rpc('exec', { command });

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { return document.execCommand('copy'); } finally { document.body.removeChild(t); }
  }
}

export default function ComparePage({ state, go }) {
  const { data: spec, reload: reloadSpec } = useRemote('getSpec', {});
  const { data: comps, loading, reload: reloadComps } = useRemote('getComparisons', {});
  const [tab, setTab] = useState('results');
  const [picked, setPicked] = useState(null);
  const [copied, setCopied] = useState(false);
  const specRuns = (comps || []).filter((c) => c.kind === 'SPEC' && c.matrices);
  const others = (comps || []).filter((c) => !(c.kind === 'SPEC' && c.matrices));
  const rec = specRuns.find((c) => c.comparisonId === picked) || specRuns[0] || null;
  const [other, setOther] = useState(0);
  useEffect(() => { setOther(0); }, [rec && rec.comparisonId]);
  const m = rec ? rec.matrices[Math.min(other, rec.matrices.length - 1)] : null;
  if (!state.initialized) return <Empty>Initialize the project first (use “AI Project” in the status bar → Start Here).</Empty>;

  const doCopy = async () => { if (spec && spec.exists && await copy(spec.text)) { setCopied(true); setTimeout(() => setCopied(false), 2500); } };
  return (
    <div>
      <section className="cx-hero">
        <h2>Compare projects</h2>
        <p>Turn each project into one specification file, compare two projects instantly, and get blueprint advice. No AI is needed for the comparison itself.</p>
        <div className="cx-steps">
          <Step n="1" title="Specification of this project" done={!!(spec && spec.exists)}>
            <div className="muted-text">{spec && spec.exists ? <>One text file with features, database fields, validation, required modules, APIs and workflows. Updated {ago(spec.generatedAt)} · {Math.round(spec.bytes / 1024)} KB · {spec.coverage.filesAnalyzed}/{spec.coverage.filesTotal} files AI-analysed.</> : 'Creates one text file with everything about this project: features, database fields, validation, required modules, APIs and workflows.'}</div>
            <div className="row wrap">
              <Button kind="primary" onClick={async () => { await rpc('exec', { command: 'aiProject.exportSpec' }); reloadSpec(); }}>{spec && spec.exists ? 'Update specification' : 'Create specification file'}</Button>
              {spec && spec.exists && <><Button onClick={doCopy}>{copied ? 'Copied ✓' : 'Copy for ChatGPT / Claude'}</Button><Button onClick={() => rpc('openFile', { path: spec.path })}>Open file</Button></>}
            </div>
          </Step>
          <Step n="2" title="Compare with another project" done={specRuns.length > 0}>
            <div className="muted-text">Pick the other project’s folder. You get what both have, what only one has, and what differs.</div>
            <div className="row wrap">
              <Button kind="primary" onClick={run('aiProject.compareSpec')}>Compare (instant)</Button>
              <Button onClick={run('aiProject.compareSpecWithAi')} title="Also sends both specifications to ChatGPT/Claude through the Chrome extension">Compare + ask AI</Button>
            </div>
          </Step>
          <Step n="3" title="Plan the new project" done={!!(rec && rec.ai)}>
            <div className="muted-text">Use the suggestions below and the specification files to generate a blueprint, or hand the file to an AI to rebuild a project.</div>
            <div className="row wrap"><Button onClick={() => go && go('generate')}>Open blueprint page</Button></div>
          </Step>
        </div>
      </section>

      <Tabs active={tab} onChange={setTab} tabs={[['results', 'Comparison', specRuns.length || null], ['suggestions', 'Blueprint suggestions', m ? m.suggestions.length : null], ['ai', 'AI analysis', rec && rec.ai ? '✓' : null], ['spec', 'Specification file'], ['other', 'Other comparisons', others.length || null]]} />
      {loading && <Loading />}

      {tab === 'results' && (
        !m ? <Empty>No comparison yet. Click <b>Compare (instant)</b> above, then choose the other project’s folder.</Empty> : (
          <div>
            <div className="row wrap">
              {specRuns.length > 1 && <label>Comparison <select value={rec.comparisonId} onChange={(e) => setPicked(e.target.value)}>{specRuns.map((c) => <option key={c.comparisonId} value={c.comparisonId}>{c.comparisonId} · {c.projects.map((p) => p.name).join(' vs ')} · {ago(c.createdAt)}</option>)}</select></label>}
              {rec.matrices.length > 1 && <label>Other project <select value={other} onChange={(e) => setOther(Number(e.target.value))}>{rec.matrices.map((x, i) => <option key={i} value={i}>{x.b.name}</option>)}</select></label>}
              <span className="muted-text">{rec.comparisonId} · {ago(rec.createdAt)} · saved in .ai-project/comparisons/</span>
              <ConfirmButton onConfirm={async () => { await rpc('deleteComparison', { id: rec.comparisonId }); setPicked(null); reloadComps(); }}>Delete this comparison</ConfirmButton>
              {specRuns.length + others.length > 1 && <ConfirmButton confirmText="Click again: delete ALL comparisons" onConfirm={async () => { await rpc('clearComparisons', {}); setPicked(null); reloadComps(); }}>Clear all</ConfirmButton>}
            </div>
            <MatrixView m={m} />
          </div>
        )
      )}

      {tab === 'suggestions' && (!m ? <Empty>Run a comparison first.</Empty> : (
        <Card title="What to consider for the new project" actions={<Button kind="primary" onClick={() => go && go('generate')}>Generate blueprint with these</Button>}>
          <p className="muted-text">These are facts turned into questions, not rankings. “Consider” = the other project has it and this one doesn’t. “Keep” = only this project has it. “Decide” = both have it but differently. The blueprint request includes them automatically.</p>
          <SuggestionsPanel suggestions={m.suggestions} nameA={m.a.name} nameB={m.b.name} />
        </Card>
      ))}

      {tab === 'ai' && (!rec ? <Empty>Run a comparison first.</Empty> : rec.ai ? <Card title="AI analysis"><AiAnalysis ai={rec.ai} /></Card> : (
        <div className="cx-cta"><div className="grow"><b>No AI analysis for this comparison yet.</b><div className="muted-text">The AI reads both specification files and the computed differences and explains them in words and suggests what to adopt. It runs in your own ChatGPT/Claude tab through the Chrome extension; you approve it there.</div></div><Button kind="primary" onClick={run('aiProject.compareSpecWithAi')}>Compare + ask AI</Button></div>
      ))}

      {tab === 'spec' && <Card title={spec && spec.exists ? `${spec.project.name} specification` : 'Specification'} actions={spec && spec.exists && <><Button onClick={doCopy}>{copied ? 'Copied ✓' : 'Copy'}</Button><Button onClick={() => rpc('openFile', { path: spec.path })}>Open file</Button></>}><SpecViewer spec={spec} /></Card>}

      {tab === 'other' && (
        <div>
          <Card title="Other kinds of comparison">
            <p className="muted-text">Structure-only or part-of-project comparisons. These send data to Chrome for the AI to explain; nothing is scored or ranked.</p>
            <div className="row wrap">
              <Button kind="primary" onClick={run('aiProject.compareSelection')}>Selected files / feature</Button>
              <Button onClick={run('aiProject.compareDocumentation')}>Documentation</Button>
              <Button onClick={run('aiProject.compareProjects')}>Whole project (structure)</Button>
              <Button onClick={run('aiProject.compareFeatures')}>Features</Button>
              <Button onClick={run('aiProject.compareWorkflows')}>Workflows</Button>
              <Button onClick={run('aiProject.compareDatabases')}>Databases</Button>
            </div>
          </Card>
          {others.length > 0 && <div className="row"><ConfirmButton onConfirm={async () => { for (const c of others) await rpc('deleteComparison', { id: c.comparisonId }); reloadComps(); }}>Delete these {others.length} comparison(s)</ConfirmButton></div>}
          <ComparisonViewer comparisons={others} onDelete={async (id) => { await rpc('deleteComparison', { id }); reloadComps(); }} />
        </div>
      )}
    </div>
  );
}
