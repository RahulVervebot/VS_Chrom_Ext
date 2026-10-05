import React, { useState } from 'react';
import { Badge, Card, Empty, FileLink } from './common.jsx';

function RelationTree({ entities, relationships }) {
  const children = new Map();
  const hasParent = new Set();
  for (const r of relationships) {
    // "many-to-one" from X to Y means Y is the parent of X.
    const parent = r.type === 'many-to-one' ? r.to : r.from;
    const child = r.type === 'many-to-one' ? r.from : r.to;
    (children.get(parent) || children.set(parent, []).get(parent)).push({ name: child, type: r.type, status: r.status || 'VERIFIED' });
    hasParent.add(child);
  }
  const roots = entities.map((e) => e.name).filter((n) => !hasParent.has(n));
  const render = (name, seen) => (
    <li key={name}>
      <span>{name}</span>
      {(children.get(name) || []).length > 0 && !seen.has(name) && (
        <ul>{children.get(name).map((c) => <li key={c.name}><span>{c.name}</span> <Badge status={c.status} /> <span className="muted-text">{c.type}</span>{(children.get(c.name) || []).length > 0 && !seen.has(c.name) && <ul>{children.get(c.name).map((g) => render(g.name, new Set([...seen, name, c.name])))}</ul>}</li>)}</ul>
      )}
    </li>
  );
  return roots.length ? <ul className="reltree">{roots.map((r) => render(r, new Set()))}</ul> : <Empty>No relationships supported by source evidence were found.</Empty>;
}

export default function DatabaseViewer({ db }) {
  const [active, setActive] = useState(null);
  if (!db) return null;
  const entity = db.entities.find((e) => e.name === active) || null;
  const qs = entity ? db.queries.filter((q) => q.entity === entity.name) : [];
  const rels = entity ? db.relationships.filter((r) => [r.from, r.to].some((x) => String(x).toLowerCase() === entity.name.toLowerCase())) : [];
  return (
    <div className="split">
      <div>
        <Card title="Technologies (from source evidence)">
          {db.technologies.length ? <div className="row wrap">{db.technologies.map((t) => <span className="chip" key={t}>{t}</span>)}</div> : <Empty>No database technology detected.</Empty>}
        </Card>
        <Card title={`Entities (${db.entities.length})`}>
          <ul className="list">{db.entities.map((e) => <li key={e.name} className={active === e.name ? 'active' : ''}><button className="link-btn" onClick={() => setActive(e.name)}>{e.name}</button> <span className="muted-text">{e.kind} · {e.source} · {(e.fields || []).length} fields</span> {e.knowledge && <Badge status="ANALYZED" />}</li>)}</ul>
          {!db.entities.length && <Empty>No tables, collections or models were found in source.</Empty>}
        </Card>
        <Card title="Relationships (evidence only)"><RelationTree entities={db.entities} relationships={db.relationships} /></Card>
      </div>
      <div>
        {entity ? (
          <Card title={entity.name} actions={entity.file && <FileLink file={entity.file} line={entity.line}>open</FileLink>}>
            <p>{entity.knowledge && entity.knowledge.purpose ? <>{entity.knowledge.purpose.value} <Badge status={entity.knowledge.purpose.status} /></> : <em className="muted-text">Purpose: UNKNOWN</em>}</p>
            <h4>Fields</h4>
            <div className="table-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Key</th><th>Evidence</th></tr></thead><tbody>
              {(entity.fields || []).map((f) => <tr key={f.name}><td>{f.name}</td><td>{f.type}</td><td>{f.pk ? 'PK' : ''}</td><td><Badge status="VERIFIED" /></td></tr>)}
              {((entity.knowledge && entity.knowledge.fields) || []).filter((f) => !(entity.fields || []).some((x) => x.name === f.name)).map((f) => <tr key={f.name}><td>{f.name}</td><td>{f.type}</td><td /><td><Badge status={f.status} /></td></tr>)}
            </tbody></table></div>
            <h4>Relationships</h4>
            <ul>{rels.map((r, i) => <li key={i}>{r.from} → {r.to} <span className="muted-text">{r.type}</span> <Badge status={r.status || 'VERIFIED'} /></li>)}{!rels.length && <li className="muted-text">None found.</li>}</ul>
            <h4>Queries</h4>
            <ul>{qs.filter((q) => q.kind === 'read').map((q, i) => <li key={i}>{q.operation} <FileLink file={q.file} line={q.line} /></li>)}{!qs.some((q) => q.kind === 'read') && <li className="muted-text">None found.</li>}</ul>
            <h4>Mutations</h4>
            <ul>{qs.filter((q) => q.kind === 'write').map((q, i) => <li key={i}>{q.operation} <FileLink file={q.file} line={q.line} /></li>)}{!qs.some((q) => q.kind === 'write') && <li className="muted-text">None found.</li>}</ul>
          </Card>
        ) : <Empty>Select an entity to see its fields, relationships, queries and mutations.</Empty>}
        <Card title="Data flows (traced from source)">
          <div className="table-wrap"><table><thead><tr><th>API</th><th>Reads</th><th>Writes</th></tr></thead><tbody>{db.dataFlows.map((f) => <tr key={f.workflowId}><td>{f.api ? `${f.api.method} ${f.api.endpoint}` : f.workflowId}</td><td>{f.reads.join(', ')}</td><td>{f.writes.join(', ')}</td></tr>)}</tbody></table></div>
          {!db.dataFlows.length && <Empty>No API-to-database flows could be traced.</Empty>}
        </Card>
      </div>
    </div>
  );
}
