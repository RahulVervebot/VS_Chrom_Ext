import React, { useEffect, useState } from 'react';
import { Action, Badge, Card, Notice, Empty } from '../components/common.jsx';
import { cmd } from '../hooks/useStore.js';

export default function DashboardPage({ state, go }) {
  const [tabs, setTabs] = useState([]);
  useEffect(() => { cmd('listTabs').then(setTabs).catch(() => {}); }, [state.bridge.state]);
  const b = state.bridge;
  const projects = Object.values(state.projects);
  const proj = b.session && state.projects[b.session.projectId];
  const runs = Object.values(state.analyses).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const active = runs.find((r) => ['RUNNING', 'PAUSED', 'NEEDS_ATTENTION', 'AWAITING_ACK'].includes(r.status));
  const waiting = runs.filter((r) => r.status === 'AWAITING_USER');
  const cov = proj && proj.coverage;
  return (
    <>
      {waiting.length > 0 && <Notice kind="warn"><b>{waiting.length} analysis waiting for your OK.</b> <button className="link" onClick={() => go('analysis')}>Review</button></Notice>}
      {state.jobs.some((j) => j.status === 'AWAITING_USER') && <Notice kind="warn">VS Code sent a request that needs your OK. <button className="link" onClick={() => go('compare')}>Open</button></Notice>}
      <Card title="Connection" actions={<Badge status={b.state} />}>
        {b.state === 'CONNECTED' ? <div className="kv"><span>Project</span><b>{b.session.projectName || (proj && proj.name) || b.session.projectId}</b><span>Session</span><b className="mono">{b.session.sessionId.slice(0, 20)}…</b></div> : <div className="row"><span className="muted">{state.paired ? 'Paired, not connected.' : 'Not paired with VS Code yet.'}</span><button className="btn primary" onClick={() => go('connection')}>{state.paired ? 'Reconnect' : 'Pair'}</button></div>}
      </Card>
      <Card title="Current AI" actions={<button className="link" onClick={() => go('settings')}>Change</button>}>
        <div className="kv"><span>Provider setting</span><b>{state.settings.provider}</b><span>Open AI tabs</span><b>{tabs.length ? tabs.map((t) => t.provider).join(', ') : 'none: open ChatGPT, Claude or Gemini'}</b></div>
      </Card>
      <Card title="Project intelligence" actions={cov && <Badge status={cov.coverageStatus === 'COMPLETE' ? 'COMPLETED' : 'PAUSED'}>{cov.coverageStatus}</Badge>}>
        {cov ? <div className="kv"><span>Files analyzed</span><b>{cov.filesAnalyzed} / {cov.sourceFilesTotal || cov.filesTotal}</b><span>Outdated</span><b>{cov.filesOutdated}</b><span>Workflows with knowledge</span><b>{cov.workflowsAnalyzed}</b><span>Entities with knowledge</span><b>{cov.databaseEntitiesAnalyzed}</b></div> : <Empty>{projects.length ? 'Coverage appears once VS Code reports it.' : 'Connect to a VS Code project to see coverage.'}</Empty>}
      </Card>
      {active && <Card title="Active analysis" actions={<Badge status={active.status} />}><div className="muted">{active.analysisId} · {active.mode}</div><button className="btn" onClick={() => go('analysis')}>Open</button></Card>}
      {state.notices.slice(-3).reverse().map((n, i) => <Notice key={i} kind={n.level === 'error' ? 'bad' : 'info'}>{n.message}</Notice>)}
    </>
  );
}
