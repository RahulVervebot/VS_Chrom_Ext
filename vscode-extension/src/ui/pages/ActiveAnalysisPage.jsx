import React from 'react';
import AnalysisProgress from '../components/AnalysisProgress.jsx';
import { Empty } from '../components/common.jsx';

export default function ActiveAnalysisPage({ state, refresh }) {
  const runs = state.runner.filter((r) => ['IN_PROGRESS', 'AWAITING_ACCEPT', 'PAUSED', 'WAITING_PACKAGE', 'DISCONNECTED', 'FAILED'].includes(r.status));
  if (!runs.length) return <Empty>No active analysis. Start one from Queue, or with “AI Project: Analyze Selection”.</Empty>;
  return <div>{runs.map((r) => <AnalysisProgress key={r.analysisId} run={r} reload={refresh} />)}</div>;
}
