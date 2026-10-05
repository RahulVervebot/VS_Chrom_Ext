import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Button, Card, Loading } from '../components/common.jsx';
import BlueprintViewer from '../components/BlueprintViewer.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function GeneratePage() {
  const { data, loading } = useRemote('getBlueprint', {});
  return (
    <div>
      <Card title="Generate">
        <p className="muted-text">A blueprint combines knowledge from one or more analyzed projects with your requirements. It is a plan: creating a project from it is a separate, explicit action.</p>
        <div className="row wrap">
          <Button kind="primary" onClick={() => rpc('exec', { command: 'aiProject.generateBlueprint' })}>Generate blueprint</Button>
          <Button onClick={() => rpc('exec', { command: 'aiProject.createFromBlueprint' })} disabled={!data}>Create project from blueprint…</Button>
        </div>
      </Card>
      {loading && <Loading />}
      <BlueprintViewer blueprint={data} />
    </div>
  );
}
