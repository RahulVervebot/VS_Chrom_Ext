import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Card, Empty, Loading } from '../components/common.jsx';
import Markdown from '../components/markdown.jsx';

export default function ArchitecturePage({ state }) {
  const { data, loading } = useRemote('getArchitecture', {});
  const { data: apis } = useRemote('getApis', {});
  const { data: doc } = useRemote('getDocument', { key: 'documentation/architecture' });
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  const a = data && data.architecture;
  return (
    <div>
      {loading && <Loading />}
      {a && (
        <>
          <Card title="Layers"><div className="table-wrap"><table><thead><tr><th>Role</th><th>Files</th></tr></thead><tbody>{Object.entries(a.layers).map(([r, f]) => <tr key={r}><td>{r}</td><td>{f.length}</td></tr>)}</tbody></table></div><div className="muted-text">Frontend evidence: {String(a.tiers.frontend)} · Backend evidence: {String(a.tiers.backend)}</div></Card>
          <Card title="Configuration and deployment files"><div className="table-wrap"><table><tbody>{a.config.map((c) => <tr key={c.path}><td><code>{c.path}</code></td><td>{c.kind}</td></tr>)}</tbody></table></div></Card>
        </>
      )}
      {apis && (
        <>
          <Card title={`APIs (${apis.apis.length})`}><div className="table-wrap"><table><thead><tr><th>Method</th><th>Endpoint</th><th>Handler</th><th>File</th></tr></thead><tbody>{apis.apis.map((x, i) => <tr key={i}><td>{x.method}</td><td>{x.endpoint}</td><td>{x.handler || '(inline)'}</td><td><code>{x.file}:{x.line}</code></td></tr>)}</tbody></table></div></Card>
          <Card title="Authentication and authorization (evidence)"><ul>{apis.auth.map((x) => <li key={x.file}><code>{x.file}</code>: {[...new Set(x.items.map((i) => i.kind))].join(', ')}</li>)}{!apis.auth.length && <li className="muted-text">None found in source.</li>}</ul></Card>
          <Card title="External services (evidence)"><ul>{Object.entries(apis.externalServices).map(([n, e]) => <li key={n}><b>{n}</b> <span className="muted-text">{[...new Set(e.map((x) => x.file))].join(', ')}</span></li>)}{!Object.keys(apis.externalServices).length && <li className="muted-text">None found in source.</li>}</ul></Card>
        </>
      )}
      <Card title="Architecture document">{doc ? <Markdown source={doc.markdown} /> : <Empty>Run “Generate Documentation” to create the architecture overview.</Empty>}</Card>
    </div>
  );
}
