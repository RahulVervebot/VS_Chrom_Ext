import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Button, Empty, ErrorBox, Loading } from '../components/common.jsx';
import DatabaseViewer from '../components/DatabaseViewer.jsx';
import { rpc } from '../hooks/useRpc.js';
import { useScope } from '../hooks/useScope.js';
import ScopeBar from '../components/ScopeBar.jsx';

export default function DatabasePage({ state }) {
  const scope = useScope();
  const { data, loading, error } = useRemote('getDatabase', { scoped: scope.scoped });
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div>
      <ScopeBar scope={scope} />
      <div className="row"><Button kind="primary" onClick={() => rpc('exec', { command: 'aiProject.analyzeDatabase' })}>Analyze database with AI…</Button></div>
      {loading && <Loading />}
      <ErrorBox error={error} />
      <DatabaseViewer db={data} />
    </div>
  );
}
