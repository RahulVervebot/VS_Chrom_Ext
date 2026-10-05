import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Button, Card, Empty, Loading } from '../components/common.jsx';
import ChangeReview from '../components/ChangeReview.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function ChangesPage({ state, refresh }) {
  const { data, loading, reload } = useRemote('getChanges', {});
  const { data: cmds } = useRemote('getCommands', {});
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div>
      <Card title="Safe changes">
        <p className="muted-text">Chrome never edits your files. AI change proposals arrive here, are checked against current file hashes, shown as a diff with impact, and applied only after your explicit approval, then verified with the project’s own commands.</p>
        <div className="row wrap"><Button onClick={() => rpc('exec', { command: 'aiProject.generateChangePlan' })}>Request a change plan…</Button><Button onClick={() => rpc('exec', { command: 'aiProject.verifyProject' })}>Verify project</Button></div>
        <div className="muted-text">Detected verification commands: {cmds && cmds.length ? cmds.map((c) => c.label).join(', ') : 'none'}</div>
      </Card>
      {loading && <Loading />}
      {data && <ChangeReview proposals={data} reload={() => { reload(); refresh(); }} />}
    </div>
  );
}
