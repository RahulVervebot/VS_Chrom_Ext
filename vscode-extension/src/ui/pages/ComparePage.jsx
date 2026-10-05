import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Button, Card, Loading } from '../components/common.jsx';
import ComparisonViewer from '../components/ComparisonViewer.jsx';
import { rpc } from '../hooks/useRpc.js';

const run = (command) => () => rpc('exec', { command });

export default function ComparePage() {
  const { data, loading } = useRemote('getComparisons', {});
  return (
    <div>
      <Card title="Compare">
        <p className="muted-text">Select other projects that have a <code>.ai-project</code>. Comparison reports facts and differences; it never scores or ranks projects and never modifies source.</p>
        <div className="row wrap">
          <Button onClick={run('aiProject.compareProjects')}>Projects</Button>
          <Button onClick={run('aiProject.compareFeatures')}>Features</Button>
          <Button onClick={run('aiProject.compareWorkflows')}>Workflows</Button>
          <Button onClick={run('aiProject.compareDatabases')}>Databases</Button>
        </div>
      </Card>
      {loading && <Loading />}
      <ComparisonViewer comparisons={data} />
    </div>
  );
}
