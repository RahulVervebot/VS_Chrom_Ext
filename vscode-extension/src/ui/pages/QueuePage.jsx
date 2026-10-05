import React from 'react';
import AnalysisQueue from '../components/AnalysisQueue.jsx';
import { Empty } from '../components/common.jsx';

export default function QueuePage({ state, refresh }) {
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return <AnalysisQueue state={state} reload={refresh} />;
}
