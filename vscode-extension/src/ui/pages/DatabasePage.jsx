import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Button, Empty, ErrorBox, Loading } from '../components/common.jsx';
import DatabaseViewer from '../components/DatabaseViewer.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function DatabasePage({ state }) {
  const { data, loading, error } = useRemote('getDatabase', {});
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div>
      <div className="row"><Button kind="primary" onClick={() => rpc('exec', { command: 'aiProject.analyzeDatabase' })}>Analyze database with AI…</Button></div>
      {loading && <Loading />}
      <ErrorBox error={error} />
      <DatabaseViewer db={data} />
    </div>
  );
}
