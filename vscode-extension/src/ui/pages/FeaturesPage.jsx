import React, { useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Button, Card, Empty, Loading } from '../components/common.jsx';
import FeatureViewer from '../components/FeatureViewer.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function FeaturesPage({ state, refresh }) {
  const { data: list, loading } = useRemote('getFeatures', {});
  const [active, setActive] = useState(null);
  const { data: feature } = useRemote('getFeature', { id: active }, [active]);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div className="split">
      <Card title={`Features (${list ? list.length : 0})`} actions={<Button onClick={() => rpc('exec', { command: 'aiProject.detectFeatures' }).then(refresh)}>Detect</Button>}>
        {loading && <Loading />}
        <ul className="list">{(list || []).map((f) => <li key={f.id} className={active === f.id ? 'active' : ''}><button className="link-btn" onClick={() => setActive(f.id)}>{f.name}</button> <Badge status={f.status} /><div className="muted-text">{f.files} files · {f.apis} APIs</div></li>)}</ul>
        {list && !list.length && <Empty>No features detected.</Empty>}
      </Card>
      <div>
        {active && feature ? (<><div className="row"><Button kind="primary" onClick={async () => { await rpc('setSelection', { selection: { features: [active] } }); refresh(); rpc('exec', { command: 'aiProject.analyzeFeature' }); }}>Analyze with AI…</Button></div><FeatureViewer feature={feature} /></>) : <Empty>Select a feature.</Empty>}
      </div>
    </div>
  );
}
