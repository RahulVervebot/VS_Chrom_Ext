import React, { useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Button, Card, Loading } from '../components/common.jsx';
import BlueprintViewer from '../components/BlueprintViewer.jsx';
import { SuggestionsPanel } from '../components/SpecComparison.jsx';
import { ConfirmButton, Step, Tabs, ago } from '../components/ui2.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function GeneratePage({ go }) {
  const { data, loading, reload } = useRemote('getBlueprint', {});
  const { data: versions, reload: reloadVersions } = useRemote('getBlueprintVersions', {});
  const { data: comps } = useRemote('getComparisons', {});
  const { data: spec } = useRemote('getSpec', {});
  const [tab, setTab] = useState('blueprint');
  const latest = (comps || []).find((c) => c.kind === 'SPEC' && c.matrices);
  const m = latest ? latest.matrices[0] : null;
  return (
    <div>
      <section className="cx-hero">
        <h2>Plan a new project</h2>
        <p>Combine your project(s) and your requirements into a blueprint. A blueprint is a plan: nothing is created until you choose to.</p>
        <div className="cx-steps">
          <Step n="1" title="Reference projects" done={!!(spec && spec.exists)}>
            <div className="muted-text">{spec && spec.exists ? `This project’s specification is ready (${ago(spec.generatedAt)}). You can add other projects when you start.` : 'Create this project’s specification first (Compare page, step 1). The AI is given the full specification, not just a summary.'}</div>
            <div className="row wrap"><Button onClick={() => go && go('compare')}>{spec && spec.exists ? 'Compare projects' : 'Create specification'}</Button></div>
          </Step>
          <Step n="2" title="Requirements → AI blueprint" done={!!data}>
            <div className="muted-text">Describe the new project (or pick a text file). Chrome asks ChatGPT/Claude to write the blueprint; you approve it in the side panel. {m ? `The gaps from your latest comparison (${m.a.name} vs ${m.b.name}) are included.` : ''}</div>
            <div className="row wrap"><Button kind="primary" onClick={() => rpc('exec', { command: 'aiProject.generateBlueprint' })}>Generate blueprint</Button></div>
          </Step>
          <Step n="3" title="Create the folders" done={false}>
            <div className="muted-text">Creates the planned folder structure in an empty folder you choose. Existing projects are never modified.</div>
            <div className="row wrap"><Button onClick={() => rpc('exec', { command: 'aiProject.createFromBlueprint' })} disabled={!data}>Create project from blueprint…</Button></div>
          </Step>
        </div>
      </section>
      <Tabs active={tab} onChange={setTab} tabs={[['blueprint', 'Blueprint'], ['inputs', 'What feeds the blueprint', m ? m.suggestions.length : null]]} />
      {loading && <Loading />}
      {tab === 'blueprint' && data && (
        <div className="row wrap">
          <ConfirmButton onConfirm={async () => { await rpc('deleteBlueprint', {}); reload(); reloadVersions(); }}>Delete this blueprint</ConfirmButton>
          {versions > 0 && <ConfirmButton confirmText="Click again: delete ALL versions" onConfirm={async () => { await rpc('deleteBlueprint', { history: true }); reload(); reloadVersions(); }}>Delete it and {versions} earlier version{versions === 1 ? '' : 's'}</ConfirmButton>}
          <span className="muted-text">Only the plan is removed. Your source, specification and comparisons are not touched.</span>
        </div>
      )}
      {tab === 'blueprint' && <BlueprintViewer blueprint={data} />}
      {tab === 'inputs' && (m ? (
        <Card title={`Gaps between ${m.a.name} and ${m.b.name}`} actions={<Button onClick={() => go && go('compare')}>Open comparison</Button>}>
          <p className="muted-text">These are sent with the blueprint request so the AI decides each one explicitly instead of silently picking.</p>
          <SuggestionsPanel suggestions={m.suggestions} nameA={m.a.name} nameB={m.b.name} />
        </Card>
      ) : <div className="cx-hint">No comparison yet. Compare two projects first and the differences will be used here automatically.</div>)}
    </div>
  );
}
