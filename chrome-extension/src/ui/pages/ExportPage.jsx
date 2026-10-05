import React from 'react';
import { Action, Card, Empty } from '../components/common.jsx';
import { collectKnowledge } from '../components/KnowledgeViewer.jsx';
import { download } from '../hooks/useStore.js';
import { JobList } from '../components/ComparisonWorkspace.jsx';

function knowledgeMarkdown(m) {
  const k = m.knowledge;
  const L = ['# Project knowledge (Chrome working copy)', '', '> Unverified until reconciled by VS Code.', '', '## Files', ...k.files.map((f) => `### ${f.path}\n${f.purpose || 'Purpose UNKNOWN'}\n${(f.claims || []).map((c) => `- ${c.claim} (${c.status})`).join('\n')}`), '', '## Workflows', ...k.workflows.map((w) => `### ${w.name || w.id}\n${w.purpose || ''}\n${(w.steps || []).map((s, i) => `${i + 1}. ${s.kind} ${s.symbol || ''} (${s.file || ''}) [${s.status}]`).join('\n')}`), '', '## Database', ...k.database.entities.map((e) => `### ${e.name}\n${(e.fields || []).map((f) => `- ${f.name}: ${f.type || ''}`).join('\n')}`), '', '## Unknowns', ...m.unknowns.filter((u) => typeof u === 'string').map((u) => `- ${u}`)];
  return L.join('\n');
}

export default function ExportPage({ state }) {
  const m = collectKnowledge(state.analyses);
  const comps = state.results.filter((r) => r.kind === 'comparison');
  const bps = state.results.filter((r) => r.kind === 'blueprint');
  const docs = state.results.filter((r) => r.kind === 'documentation');
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <>
      <p className="muted">Exports are working copies for reading and sharing. To keep knowledge, use the automatic sync to VS Code, which verifies it against source.</p>
      <JobList jobs={state.jobs.filter((j) => j.kind === 'documentation')} />
      <Card title="Knowledge">
        {m ? <div className="row wrap"><Action onClick={() => download(`knowledge-${stamp}.json`, JSON.stringify(m, null, 2))}>JSON</Action><Action onClick={() => download(`knowledge-${stamp}.md`, knowledgeMarkdown(m), 'text/markdown')}>Markdown</Action></div> : <Empty>Nothing to export yet.</Empty>}
      </Card>
      <Card title={`Comparison reports (${comps.length})`}>{comps.length ? comps.map((c, i) => <div className="row" key={i}><span>{c.kind}: {c.projects.map((p) => p.name).join(' vs ')}</span><Action onClick={() => download(`comparison-${i + 1}.json`, JSON.stringify(c, null, 2))}>JSON</Action></div>) : <Empty>None.</Empty>}</Card>
      <Card title={`Blueprints (${bps.length})`}>{bps.length ? bps.map((b, i) => <div className="row" key={i}><span>Blueprint {i + 1}</span><Action onClick={() => download(`blueprint-${i + 1}.json`, JSON.stringify(b.blueprint, null, 2))}>JSON</Action></div>) : <Empty>None.</Empty>}</Card>
      <Card title={`Documentation drafts (${docs.length})`}>{docs.length ? docs.map((d, i) => <div className="row" key={i}><span>{d.key}</span><Action onClick={() => download(`${d.key.replace(/[^\w.-]+/g, '_')}.md`, d.markdown, 'text/markdown')}>Markdown</Action></div>) : <Empty>None.</Empty>}</Card>
    </>
  );
}
