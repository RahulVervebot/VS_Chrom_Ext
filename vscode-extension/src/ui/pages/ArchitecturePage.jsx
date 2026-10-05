import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Card, Empty, Loading } from '../components/common.jsx';
import Markdown from '../components/markdown.jsx';
import { useScope } from '../hooks/useScope.js';
import ScopeBar from '../components/ScopeBar.jsx';

export default function ArchitecturePage({ state }) {
  const scope = useScope();
  const { data, loading } = useRemote('getArchitecture', { scoped: scope.scoped });
  const { data: apis } = useRemote('getApis', { scoped: scope.scoped });
  const { data: doc } = useRemote('getDocument', { key: 'documentation/architecture' });
  const { data: scopedDocs } = useRemote('getScopedDocuments', {}, [scope.scoped]);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  const a = data && data.architecture;
  return (
    <div>
      <ScopeBar scope={scope} />
      {loading && <Loading />}
      {a && (
        <>
          <Card title="Layers"><div className="table-wrap"><table><thead><tr><th>Role</th><th>Files</th></tr></thead><tbody>{Object.entries(a.layers).map(([r, f]) => <tr key={r}><td>{r}</td><td>{scope.scoped ? f.map((p) => <div key={p}><code>{p}</code></div>) : f.length}</td></tr>)}</tbody></table></div>{!scope.scoped && <div className="muted-text">Frontend evidence: {String(a.tiers.frontend)} · Backend evidence: {String(a.tiers.backend)}</div>}</Card>
          {scope.scoped && <Card title="Languages and packages used by these files"><div className="row wrap">{Object.entries(a.languages).map(([l, n]) => <span className="chip" key={l}>{l} · {n}</span>)}</div><div className="row wrap">{(a.packages || []).map((p) => <span className="chip" key={p}>{p}</span>)}{!(a.packages || []).length && <span className="muted-text">No external packages imported.</span>}</div></Card>}
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
      {scope.scoped ? <Card title="Documentation for your selection">{scopedDocs && scopedDocs.length ? scopedDocs.map((d) => <div key={d.key}><h4>{d.key}</h4><Markdown source={d.markdown} /></div>) : <Empty>No generated documentation for the selected files yet. Analyze them with AI, then run “Update Documentation”.</Empty>}</Card> : <Card title="Architecture document">{doc ? <Markdown source={doc.markdown} /> : <Empty>Run “Generate Documentation” to create the architecture overview.</Empty>}</Card>}
    </div>
  );
}
