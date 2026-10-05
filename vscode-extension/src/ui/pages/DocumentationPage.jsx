import React, { useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Button, Card, Empty, Loading } from '../components/common.jsx';
import DocumentationViewer from '../components/DocumentationViewer.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function DocumentationPage({ state, refresh }) {
  const { data: docs, loading, reload } = useRemote('getDocuments', {});
  const [active, setActive] = useState(null);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div className="split">
      <Card title={`Documents (${docs ? docs.length : 0})`} actions={<Button kind="primary" onClick={async () => { await rpc('generateDocumentation', {}); reload(); refresh(); }}>Generate</Button>}>
        {loading && <Loading />}
        <ul className="list">{(docs || []).map((d) => <li key={d.key} className={active === d.key ? 'active' : ''}><button className="link-btn" onClick={() => setActive(d.key)}>{d.key}</button> <Badge status={d.status} /></li>)}</ul>
        {docs && !docs.length && <Empty>No documentation yet. Documentation is generated from source analysis and verified knowledge.</Empty>}
      </Card>
      <div>{active ? <DocumentationViewer docKey={active} /> : <Empty>Select a document.</Empty>}</div>
    </div>
  );
}
