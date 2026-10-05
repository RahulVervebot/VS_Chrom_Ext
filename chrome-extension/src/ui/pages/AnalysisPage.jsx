import React, { useEffect, useState } from 'react';
import { Empty } from '../components/common.jsx';
import PrivacyConfirm from '../components/PrivacyConfirm.jsx';
import AnalysisProgress from '../components/AnalysisProgress.jsx';
import { cmd } from '../hooks/useStore.js';

export default function AnalysisPage({ state }) {
  const [tabs, setTabs] = useState([]);
  useEffect(() => { cmd('listTabs').then(setTabs).catch(() => {}); }, []);
  const connectedProjectId = state.bridge.session ? state.bridge.session.projectId : null;
  const nameOf = (id) => (state.projects[id] && state.projects[id].name) || null;
  const runs = Object.values(state.analyses).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  if (!runs.length) return <Empty>No analyses yet. In VS Code select files, a folder, a feature or a workflow, then run <b>AI Project: Analyze Selection</b>. It will appear here for your approval.</Empty>;
  return (
    <>
      {runs.map((r) => (r.status === 'AWAITING_USER'
        ? <PrivacyConfirm key={r.key} run={r} settings={state.settings} tabs={tabs} projectName={nameOf(r.projectId)} connectedProjectId={connectedProjectId} />
        : <AnalysisProgress key={r.key} run={r} status={state.status} settings={state.settings} projectName={nameOf(r.projectId)} connectedProjectId={connectedProjectId} />))}
    </>
  );
}
