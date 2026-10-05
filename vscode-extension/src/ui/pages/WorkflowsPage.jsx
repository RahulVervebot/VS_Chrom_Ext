import React, { useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Button, Card, Empty, ErrorBox, Loading } from '../components/common.jsx';
import WorkflowViewer from '../components/WorkflowViewer.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function WorkflowsPage({ state, refresh }) {
  const { data: list, loading } = useRemote('getWorkflows', {});
  const [active, setActive] = useState(null);
  const { data: wf, error } = useRemote('getWorkflow', { id: active }, [active]);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div className="split">
      <Card title={`Workflows (${list ? list.length : 0})`}>
        {loading && <Loading />}
        <ul className="list">{(list || []).map((w) => <li key={w.id} className={active === w.id ? 'active' : ''}><button className="link-btn" onClick={() => setActive(w.id)}>{w.name}</button> <Badge status={w.status} /><div className="muted-text">{w.trigger} · {w.files} files{w.databaseWrites && w.databaseWrites.length ? ` · writes ${w.databaseWrites.join(', ')}` : ''}</div></li>)}</ul>
        {list && !list.length && <Empty>No workflows traced. Workflows are derived from API routes and the UI handlers/services that call them.</Empty>}
      </Card>
      <div>
        {active ? (
          <Card title={wf ? wf.name : active} actions={<Button kind="primary" onClick={async () => { await rpc('setSelection', { selection: { workflows: [active] } }); refresh(); await rpc('exec', { command: 'aiProject.analyzeWorkflows' }); }}>Analyze with AI…</Button>}>
            <ErrorBox error={error} />
            <WorkflowViewer workflow={wf} />
          </Card>
        ) : <Empty>Select a workflow to see the traced path from the trigger to the database.</Empty>}
      </div>
    </div>
  );
}
