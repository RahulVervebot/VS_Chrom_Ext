import React, { useMemo, useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Badge, Card, Empty, ErrorBox, FileLink, Loading, fmt } from '../components/common.jsx';
import FileTree from '../components/FileTree.jsx';
import { rpc } from '../hooks/useRpc.js';

function FileDetail({ path }) {
  const { data, error, loading } = useRemote('getFile', { path }, [path]);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;
  const k = data.knowledge || {};
  return (
    <Card title={path} actions={<FileLink file={path} line={1}>open</FileLink>}>
      <div className="kv"><span>Status</span><b><Badge status={data.record.status} /></b><span>Language</span><b>{data.record.language}</b><span>Lines</span><b>{fmt(data.record.lines)}</b><span>Hash</span><b className="mono">{data.record.hash.slice(0, 19)}…</b></div>
      <p>{k.purpose && k.purpose.value ? <>{k.purpose.value} <Badge status={k.purpose.status} /></> : <em className="muted-text">Purpose: UNKNOWN (not analyzed by AI, or not verified)</em>}</p>
      <h4>Symbols ({data.symbols.length})</h4>
      <ul className="list">{data.symbols.map((s, i) => <li key={i}><FileLink file={path} line={s.line}>{s.className ? `${s.className}.${s.name}` : s.name}</FileLink> <span className="muted-text">{s.type}{s.exported ? ' · exported' : ''} · {s.line}-{s.endLine}</span></li>)}{!data.symbols.length && <li className="muted-text">None.</li>}</ul>
      <h4>Dependencies</h4><ul>{data.dependencies.internal.map((d) => <li key={d.path}><code>{d.path}</code></li>)}{data.dependencies.external.map((d) => <li key={d} className="muted-text">{d} (package)</li>)}</ul>
      <h4>Dependents</h4><ul>{data.dependents.map((d) => <li key={d.path}><code>{d.path}</code></li>)}{!data.dependents.length && <li className="muted-text">None.</li>}</ul>
      {data.routes.length > 0 && <><h4>API routes</h4><ul>{data.routes.map((r, i) => <li key={i}>{r.method} {r.endpoint}</li>)}</ul></>}
      {(data.entities.reads.length > 0 || data.entities.writes.length > 0) && <><h4>Database</h4><div>Reads: {data.entities.reads.join(', ') || '–'} · Writes: {data.entities.writes.join(', ') || '–'}</div></>}
      {data.workflows.length > 0 && <><h4>Workflows</h4><ul>{data.workflows.map((w) => <li key={w.id}>{w.name}</li>)}</ul></>}
      {(k.claims || []).length > 0 && <><h4>Verified knowledge</h4><ul>{k.claims.map((c, i) => <li key={i}>{c.claim} <Badge status={c.status} /></li>)}</ul></>}
    </Card>
  );
}

export default function FilesPage({ state, refresh }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [active, setActive] = useState(null);
  const { data: files, loading, error } = useRemote('getFiles', { query, status: status || undefined }, [query, status]);
  const selection = state.selection;
  const toggle = async (kind, item) => { await rpc(selection[kind].includes(item) ? 'removeSelection' : 'addSelection', { kind, item, items: [item] }); refresh(); };
  const list = useMemo(() => files || [], [files]);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  return (
    <div className="split">
      <div>
        <div className="row wrap">
          <input className="grow" placeholder="Filter files…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter files" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{['NOT_ANALYZED', 'ANALYZED', 'PARTIAL', 'OUTDATED'].map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="muted-text">Selection: {state.selectionSummary}</div>
        {loading && <Loading />}
        <ErrorBox error={error} />
        {list.length ? <FileTree files={list} selection={selection} onToggle={toggle} onOpen={setActive} activePath={active} query={query} /> : !loading && <Empty>No files. Scan the project first.</Empty>}
      </div>
      <div>{active ? <FileDetail path={active} /> : <Empty>Select a file to see its symbols, dependencies and knowledge.</Empty>}</div>
    </div>
  );
}
