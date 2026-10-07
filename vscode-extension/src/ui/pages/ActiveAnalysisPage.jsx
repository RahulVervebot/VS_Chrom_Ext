import React from 'react';
import AnalysisProgress from '../components/AnalysisProgress.jsx';
import { Empty } from '../components/common.jsx';
import CampaignCard from '../components/CampaignCard.jsx';

export default function ActiveAnalysisPage({ state, refresh }) {
  const runs = state.runner.filter((r) => ['IN_PROGRESS', 'AWAITING_ACCEPT', 'PAUSED', 'WAITING_PACKAGE', 'DISCONNECTED', 'FAILED'].includes(r.status));
  if (!runs.length) return <div><CampaignCard campaign={state.campaign} reload={refresh} />{!state.campaign || state.campaign.status === 'DONE' ? <Empty>No active analysis. Start one from Queue, or with “AI Project: Analyze Selection”.</Empty> : null}</div>;
  return <div><CampaignCard campaign={state.campaign} reload={refresh} />{runs.map((r) => <AnalysisProgress key={r.analysisId} run={r} reload={refresh} />)}</div>;
}
