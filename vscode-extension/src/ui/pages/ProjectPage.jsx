import React from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Card, Empty, Loading, Badge } from '../components/common.jsx';
import ProjectHeader from '../components/ProjectHeader.jsx';

export default function ProjectPage({ state, refresh }) {
  const { data, loading } = useRemote('getArchitecture', {});
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  const a = data && data.architecture;
  return (
    <div>
      <ProjectHeader state={state} refresh={refresh} />
      {loading && <Loading />}
      {a && (
        <>
          <Card title="Technology stack (from manifests and imports)">
            {a.technologies.length ? <ul>{a.technologies.map((t) => <li key={t.name}><b>{t.name}</b> <span className="muted-text">{t.evidence.join(', ')}</span></li>)}</ul> : <Empty>No technologies detected.</Empty>}
          </Card>
          <Card title="Languages"><div className="row wrap">{Object.entries(a.languages).map(([l, n]) => <span className="chip" key={l}>{l}: {n}</span>)}</div></Card>
          <Card title="Entry points (inferred from filenames)"><ul>{a.entryPoints.map((e) => <li key={e.path}><code>{e.path}</code> <Badge status={e.status} /></li>)}{!a.entryPoints.length && <li className="muted-text">None inferred.</li>}</ul></Card>
        </>
      )}
      {data && data.conflicts.length > 0 && (
        <Card title={`Knowledge conflicts (${data.conflicts.length})`}>
          <p className="muted-text">AI claims that disagreed with source. Source wins; both values are recorded.</p>
          <ul>{data.conflicts.map((c, i) => <li key={i}><b>{c.kind}</b> {c.entity || `${c.from}→${c.to}`}{c.field ? `.${c.field}` : ''}: source <code>{c.sourceValue}</code> vs AI <code>{c.aiValue}</code> ({c.analysisId})</li>)}</ul>
        </Card>
      )}
      {!a && !loading && <Empty>Scan the project to build the architecture index.</Empty>}
    </div>
  );
}
