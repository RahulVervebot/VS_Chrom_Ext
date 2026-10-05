import React from 'react';
import { Badge, Button, Card, Empty, Stat, fmt } from './common.jsx';
import ProjectHeader from './ProjectHeader.jsx';
import GettingStarted from './GettingStarted.jsx';
import CoverageCard from './CoverageCard.jsx';
import AnalysisProgress from './AnalysisProgress.jsx';
import { rpc } from '../hooks/useRpc.js';

export default function Dashboard({ state, refresh, go }) {
  if (!state.initialized) {
    return <GettingStarted state={state} refresh={refresh} />;
  }
  const c = state.counts;
  const active = state.runner.find((r) => ['IN_PROGRESS', 'AWAITING_ACCEPT', 'PAUSED', 'WAITING_PACKAGE', 'DISCONNECTED', 'FAILED'].includes(r.status));
  const pending = state.runner.filter((r) => r !== active && ['IN_PROGRESS', 'AWAITING_ACCEPT', 'PAUSED', 'DISCONNECTED', 'FAILED'].includes(r.status)).length;
  return (
    <div>
      <ProjectHeader state={state} refresh={refresh} />
      <GettingStarted state={state} refresh={refresh} />
      {!state.scanned && <div className="notice">This session has not scanned the project yet; numbers below come from the last saved index. <Button onClick={async () => { await rpc('scan'); refresh(); }}>Scan now</Button></div>}
      <div className="grid stats">
        <Stat label="Files" value={<>{fmt(state.coverage.filesAnalyzed)} / {fmt(c.sourceFiles || c.files)}</>} sub="analyzed / source" onClick={() => go('files')} />
        <Stat label="Workflows" value={fmt(c.workflows)} onClick={() => go('workflows')} />
        <Stat label="Features" value={fmt(c.features)} onClick={() => go('features')} />
        <Stat label="Database entities" value={fmt(c.entities)} onClick={() => go('database')} />
        <Stat label="APIs" value={fmt(c.apis)} onClick={() => go('architecture')} />
        <Stat label="Dependency edges" value={fmt(c.dependencyEdges)} onClick={() => go('dependencies')} />
      </div>
      <div className="grid two">
        <CoverageCard coverage={state.coverage} />
        <Card title="Documentation" actions={<Button onClick={() => go('documentation')}>Open</Button>}>
          <div className="kv"><span>Documents</span><b>{state.docStatus.total}</b><span>Analyzed</span><b>{state.docStatus.ANALYZED}</b><span>Partial</span><b>{state.docStatus.PARTIAL}</b><span>Outdated</span><b>{state.docStatus.OUTDATED}</b></div>
          {state.docStatus.OUTDATED > 0 && <div className="notice warn">Source changed since these were generated. Regenerate documentation after re-analysis.</div>}
        </Card>
        <Card title="Chrome" actions={<Badge status={state.chrome.state} />}>
          <div className="kv"><span>Connection</span><b>{state.chrome.state === 'CONNECTED' ? '● Connected' : state.chrome.state}</b><span>AI provider</span><b>{state.chrome.provider || '–'}</b><span>Active analysis</span><b>{active ? active.analysisId : 'none'}</b><span>Pending analyses</span><b>{pending}</b></div>
          <div className="row"><Button onClick={() => go('connection')}>Manage connection</Button></div>
        </Card>
        {active ? <AnalysisProgress run={active} reload={refresh} compact /> : <Card title="Active analysis"><Empty>No analysis running.</Empty></Card>}
      </div>
      {state.counts.conflicts > 0 && <div className="notice warn">{state.counts.conflicts} knowledge conflict(s) recorded (AI claims that disagreed with source). See Project.</div>}
    </div>
  );
}
