import React, { useState } from 'react';
import { useStore } from './hooks/useStore.js';
import { Loading } from './components/loading.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ConnectionPage from './pages/ConnectionPage.jsx';
import AnalysisPage from './pages/AnalysisPage.jsx';
import KnowledgePage from './pages/KnowledgePage.jsx';
import ComparePage from './pages/ComparePage.jsx';
import ExportPage from './pages/ExportPage.jsx';
import SyncPage from './pages/SyncPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const TABS = [['dashboard', 'Dashboard', DashboardPage], ['connection', 'Connection', ConnectionPage], ['analysis', 'Analysis', AnalysisPage], ['knowledge', 'Knowledge', KnowledgePage], ['compare', 'Compare', ComparePage], ['export', 'Export', ExportPage], ['sync', 'Sync', SyncPage], ['settings', 'Settings', SettingsPage]];

export default function App() {
  const { state } = useStore();
  const [tab, setTab] = useState('dashboard');
  if (!state) return <Loading />;
  const Page = TABS.find((t) => t[0] === tab)[2];
  const badge = { analysis: Object.values(state.analyses).filter((a) => a.status === 'AWAITING_USER' || a.status === 'NEEDS_ATTENTION').length + state.jobs.filter((j) => j.status === 'AWAITING_USER').length };
  return (
    <div className="app">
      <header className="top"><div className="brand"><span className={`dot ${state.bridge.state === 'CONNECTED' ? 'ok' : ''}`} />AI Project Bridge</div></header>
      <nav role="tablist">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}{badge[id] > 0 && <span className="count">{badge[id]}</span>}</button>)}</nav>
      <main><Page state={state} go={setTab} /></main>
    </div>
  );
}
