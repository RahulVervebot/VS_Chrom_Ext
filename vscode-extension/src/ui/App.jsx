import React, { useEffect, useState } from 'react';
import { useAppState } from './hooks/useAppState.js';
import { onEvent, signalReady } from './hooks/useRpc.js';
import { Empty, ErrorBox, Loading } from './components/common.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import ScanPage from './pages/ScanPage.jsx';
import FilesPage from './pages/FilesPage.jsx';
import WorkflowsPage from './pages/WorkflowsPage.jsx';
import DatabasePage from './pages/DatabasePage.jsx';
import FeaturesPage from './pages/FeaturesPage.jsx';
import ArchitecturePage from './pages/ArchitecturePage.jsx';
import DependenciesPage from './pages/DependenciesPage.jsx';
import DocumentationPage from './pages/DocumentationPage.jsx';
import ConnectionPage from './pages/ConnectionPage.jsx';
import ActiveAnalysisPage from './pages/ActiveAnalysisPage.jsx';
import QueuePage from './pages/QueuePage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import ComparePage from './pages/ComparePage.jsx';
import GeneratePage from './pages/GeneratePage.jsx';
import ChangesPage from './pages/ChangesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

const NAV = [
  { group: null, items: [['dashboard', 'Dashboard', DashboardPage], ['project', 'Project', ProjectPage], ['scan', 'Scan', ScanPage], ['files', 'Files', FilesPage], ['workflows', 'Workflows', WorkflowsPage], ['database', 'Database', DatabasePage], ['features', 'Features', FeaturesPage], ['architecture', 'Architecture', ArchitecturePage], ['dependencies', 'Dependencies', DependenciesPage], ['documentation', 'Documentation', DocumentationPage]] },
  { group: 'AI / Chrome', items: [['connection', 'Connection', ConnectionPage], ['active', 'Active Analysis', ActiveAnalysisPage], ['queue', 'Queue', QueuePage], ['history', 'History', HistoryPage]] },
  { group: null, items: [['compare', 'Compare', ComparePage], ['generate', 'Generate', GeneratePage], ['changes', 'Changes', ChangesPage], ['settings', 'Settings', SettingsPage]] },
];
const PAGES = Object.fromEntries(NAV.flatMap((g) => g.items.map(([id, label, C]) => [id, { label, C }])));

export default function App() {
  const { data: state, error, loading, reload } = useAppState();
  const [page, setPage] = useState(() => { try { return sessionStorage.getItem('aiProject.page') || 'dashboard'; } catch { return 'dashboard'; } });
  const compact = document.body.dataset.compact === 'true';

  const go = (p) => { if (PAGES[p]) { setPage(p); try { sessionStorage.setItem('aiProject.page', p); } catch { /* storage unavailable */ } } };
  useEffect(() => { signalReady(); return onEvent('navigate', (d) => go(d.page)); }, []);

  if (loading && !state) return <div className="app"><Loading what="Loading project" /></div>;
  if (error && !state) return <div className="app"><ErrorBox error={error} /></div>;
  if (state.noWorkspace) return <div className="app"><Empty>Open a folder or workspace to use AI Project Intelligence.</Empty></div>;
  const Current = PAGES[page].C;

  return (
    <div className={`app ${compact ? 'compact' : 'wide'}`}>
      <nav aria-label="Sections">
        {compact ? (
          <select value={page} onChange={(e) => go(e.target.value)} aria-label="Section">{NAV.map((g) => (g.group ? <optgroup key={g.group} label={g.group}>{g.items.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</optgroup> : g.items.map(([id, l]) => <option key={id} value={id}>{l}</option>)))}</select>
        ) : (
          NAV.map((g, gi) => (
            <div className="nav-group" key={gi}>
              {g.group && <div className="nav-title">{g.group}</div>}
              {g.items.map(([id, label]) => <button key={id} className={`nav-item ${g.group ? 'nested' : ''} ${page === id ? 'active' : ''}`} onClick={() => go(id)} aria-current={page === id ? 'page' : undefined}>{label}{id === 'connection' && <span className={`dot ${state.chrome.state === 'CONNECTED' ? 'ok' : ''}`} />}</button>)}
            </div>
          ))
        )}
      </nav>
      <main>
        <ErrorBox error={error} />
        <Current state={state} refresh={reload} go={go} />
      </main>
    </div>
  );
}
