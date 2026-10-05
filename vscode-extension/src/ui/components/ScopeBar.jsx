import React from 'react';
import { Button } from './common.jsx';
import { rpc } from '../hooks/useRpc.js';

// Tells the user whether a view shows the whole project or only the part they selected, and lets them switch or compare it.
export default function ScopeBar({ scope }) {
  if (!scope.hasSelection) return <div className="muted-text">Showing the entire project. Select files, a folder or a feature in <b>Files</b> to see only that part.</div>;
  return (
    <div className="row wrap scope-bar">
      <span>{scope.scoped ? <>Showing only your selection: <b>{scope.label}</b> ({scope.files} file{scope.files === 1 ? '' : 's'})</> : <>Showing the entire project (your selection: <b>{scope.label}</b>)</>}</span>
      {scope.scoped ? <Button onClick={scope.setAll}>Show entire project</Button> : <Button onClick={scope.setSelection}>Show only my selection</Button>}
      <Button kind="primary" onClick={() => rpc('exec', { command: 'aiProject.compareSelection' })}>Compare this with another project…</Button>
    </div>
  );
}
