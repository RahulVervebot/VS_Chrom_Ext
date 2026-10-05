import React, { useEffect, useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Card, Empty, Loading, ErrorBox } from '../components/common.jsx';
import DependencyGraph from '../components/DependencyGraph.jsx';
import { onEvent } from '../hooks/useRpc.js';

export default function DependenciesPage({ state }) {
  const [file, setFile] = useState('');
  const [direction, setDirection] = useState('dependencies');
  const [depth, setDepth] = useState(state.settings.maxDependencyDepth || 2);
  useEffect(() => onEvent('focus-file', (d) => setFile(d.path)), []);
  const { data: summary } = useRemote('getDependencies', {});
  const { data: graph, loading, error } = useRemote('getDependencies', { file: file || undefined, direction, depth }, [file, direction, depth]);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div>
      <Card title="Dependency graph">
        <div className="row wrap">
          <input className="grow" list="dep-files" placeholder="File path (e.g. src/services/orderService.js)" value={file} onChange={(e) => setFile(e.target.value)} aria-label="File" />
          <datalist id="dep-files">{(summary && summary.summary ? summary.summary : []).map((s) => <option key={s.file} value={s.file} />)}</datalist>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} aria-label="Direction"><option value="dependencies">Dependencies</option><option value="dependents">Dependents</option></select>
          <label>Depth <input type="number" min="1" max="6" value={depth} onChange={(e) => setDepth(Number(e.target.value))} style={{ width: 56 }} /></label>
        </div>
        {loading && <Loading />}
        <ErrorBox error={error} />
        {file && graph && graph.nodes ? <DependencyGraph graph={graph} onFocus={setFile} /> : <Empty>Enter or click a file to see {direction === 'dependents' ? 'what depends on it' : 'what it depends on'}.</Empty>}
      </Card>
      <Card title="Most depended-on files"><div className="table-wrap"><table><thead><tr><th>File</th><th>Dependencies</th><th>Dependents</th></tr></thead><tbody>{(summary && summary.summary ? summary.summary : []).slice(0, 25).map((s) => <tr key={s.file}><td><button className="link-btn" onClick={() => setFile(s.file)}>{s.file}</button></td><td>{s.dependencies}</td><td>{s.dependents}</td></tr>)}</tbody></table></div></Card>
    </div>
  );
}
