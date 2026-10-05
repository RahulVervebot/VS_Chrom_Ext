import React, { useEffect, useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Card, Empty, Loading, ErrorBox } from '../components/common.jsx';
import DependencyGraph from '../components/DependencyGraph.jsx';
import { onEvent } from '../hooks/useRpc.js';
import { useScope } from '../hooks/useScope.js';
import ScopeBar from '../components/ScopeBar.jsx';

export default function DependenciesPage({ state }) {
  const [file, setFile] = useState('');
  const [direction, setDirection] = useState('dependencies');
  const [depth, setDepth] = useState(state.settings.maxDependencyDepth || 2);
  useEffect(() => onEvent('focus-file', (d) => setFile(d.path)), []);
  const scope = useScope();
  const { data: summary } = useRemote('getDependencies', { scoped: scope.scoped });
  const { data: graph, loading, error } = useRemote('getDependencies', { file: file || undefined, direction, depth }, [file, direction, depth]);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  const sd = summary && summary.scoped ? summary : null;
  const pathTable = (rows, empty) => (rows.length ? <div className="table-wrap"><table><thead><tr><th>File</th><th>Via your files</th></tr></thead><tbody>{rows.map((r) => <tr key={r.path}><td><button className="link-btn" onClick={() => setFile(r.path)}>{r.path}</button></td><td>{r.via.join(', ')}</td></tr>)}</tbody></table></div> : <Empty>{empty}</Empty>);
  return (
    <div>
      <ScopeBar scope={scope} />
      {sd && (
        <>
          <Card title={`Dependencies inside your selection (${sd.internal.length})`}>{sd.internal.length ? <div className="table-wrap"><table><thead><tr><th>From</th><th>To</th><th>Names</th></tr></thead><tbody>{sd.internal.map((e, i) => <tr key={i}><td><code>{e.from}</code></td><td><code>{e.to}</code></td><td>{e.names.join(', ')}</td></tr>)}</tbody></table></div> : <Empty>The selected files do not import each other.</Empty>}</Card>
          <Card title={`Needs from the rest of the project (${sd.dependsOnOutside.length})`}>{pathTable(sd.dependsOnOutside, 'Nothing outside the selection is imported.')}</Card>
          <Card title={`Used by the rest of the project (${sd.usedByOutside.length})`}>{pathTable(sd.usedByOutside, 'Nothing outside the selection depends on these files.')}</Card>
          <Card title="External packages"><div className="row wrap">{sd.packages.map((p) => <span className="chip" key={p}>{p}</span>)}{!sd.packages.length && <span className="muted-text">None.</span>}</div></Card>
        </>
      )}
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
      <Card title={sd ? 'Files in your selection' : 'Most depended-on files'}><div className="table-wrap"><table><thead><tr><th>File</th><th>Dependencies</th><th>Dependents</th></tr></thead><tbody>{(summary && summary.summary ? summary.summary : []).slice(0, 25).map((s) => <tr key={s.file}><td><button className="link-btn" onClick={() => setFile(s.file)}>{s.file}</button></td><td>{s.dependencies}</td><td>{s.dependents}</td></tr>)}</tbody></table></div></Card>
    </div>
  );
}
