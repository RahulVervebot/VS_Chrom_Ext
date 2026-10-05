import React, { useMemo, useState } from 'react';
import { Empty, Badge } from './common.jsx';
import { Chips, Tile } from './ui2.jsx';

const NAMES = { apis: 'API endpoints', Apis: 'APIs' };
const label = (k) => NAMES[k] || String(k).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const scalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const TITLE_KEYS = ['name', 'title', 'id', 'endpoint', 'path', 'table', 'entity', 'route', 'feature', 'module'];
const titleOf = (o) => { for (const k of TITLE_KEYS) if (typeof o[k] === 'string' && o[k]) return [k, o[k]]; return [null, null]; };

function Tree({ node }) {
  const entries = Object.entries(node);
  return (
    <ul className="bp-tree">
      {entries.map(([name, child]) => (
        <li key={name}>{isObj(child) ? <><span className="bp-dir">{name}/</span><Tree node={child} /></> : <span>{name}</span>}</li>
      ))}
    </ul>
  );
}

function Fields({ fields }) {
  const rows = Array.isArray(fields) ? fields : Object.entries(fields || {}).map(([name, v]) => (isObj(v) ? { name, ...v } : { name, type: String(v) }));
  if (!rows.length) return <span className="muted-text">No fields listed.</span>;
  const cols = [...new Set(rows.flatMap((r) => (isObj(r) ? Object.keys(r) : ['name'])))].slice(0, 6);
  return <div className="table-wrap"><table><thead><tr>{cols.map((c) => <th key={c}>{label(c)}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{isObj(r) ? fmtCell(r[c]) : String(r)}</td>)}</tr>)}</tbody></table></div>;
}
const fmtCell = (v) => (v === undefined || v === null ? '–' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : Array.isArray(v) ? v.map((x) => (scalar(x) ? String(x) : JSON.stringify(x))).join(', ') : isObj(v) ? JSON.stringify(v) : String(v));

function Card({ item }) {
  if (scalar(item)) return <div className="bp-card">{String(item)}</div>;
  const [tk, title] = titleOf(item);
  const rest = Object.entries(item).filter(([k]) => k !== tk);
  const fields = rest.find(([k, v]) => /^(fields|columns|properties|attributes)$/i.test(k) && v);
  return (
    <div className="bp-card">
      {title && <h5>{title}</h5>}
      <dl className="bp-kv">
        {rest.filter(([k]) => !fields || k !== fields[0]).map(([k, v]) => <React.Fragment key={k}><dt>{label(k)}</dt><dd>{scalar(v) || (Array.isArray(v) && v.every(scalar)) ? fmtCell(v) : <Smart v={v} compact />}</dd></React.Fragment>)}
      </dl>
      {fields && <Fields fields={fields[1]} />}
    </div>
  );
}

function Smart({ v, compact }) {
  if (v === null || v === undefined) return <span className="muted-text">UNKNOWN</span>;
  if (scalar(v)) return <p style={{ margin: '2px 0', whiteSpace: 'pre-wrap' }}>{String(v)}</p>;
  if (Array.isArray(v)) {
    if (!v.length) return <span className="muted-text">None.</span>;
    if (v.every(scalar)) return <Chips items={v.map(String)} limit={60} />;
    return <div className="bp-cards">{v.map((x, i) => <Card key={i} item={x} />)}</div>;
  }
  const vals = Object.values(v);
  if (vals.length && vals.every((x) => scalar(x) || (Array.isArray(x) && x.every(scalar)))) return <dl className="bp-kv">{Object.entries(v).map(([k, x]) => <React.Fragment key={k}><dt>{label(k)}</dt><dd>{fmtCell(x)}</dd></React.Fragment>)}</dl>;
  if (vals.every(isObj) && !compact) return <div className="bp-cards">{Object.entries(v).map(([k, x]) => <Card key={k} item={{ name: k, ...x }} />)}</div>;
  return <details><summary>Show details</summary><pre className="json">{JSON.stringify(v, null, 2)}</pre></details>;
}

function Conflicts({ items }) {
  return items.map((c, i) => (
    <div className="bp-conflict" key={i}>
      <b>{isObj(c) && c.topic ? c.topic : `Decision ${i + 1}`}</b>
      {isObj(c) && Array.isArray(c.options) && <ul>{c.options.map((o, j) => <li key={j}>{isObj(o) ? <><b>{o.project || 'option'}</b>: {o.approach || JSON.stringify(o)}</> : String(o)}</li>)}</ul>}
      {isObj(c) && c.requiresDecision && <div className="muted-text">Needs your decision: {c.requiresDecision}</div>}
      {!isObj(c) && <div>{String(c)}</div>}
      {isObj(c) && !c.options && !c.topic && <pre className="json">{JSON.stringify(c, null, 2)}</pre>}
    </div>
  ));
}

const count = (v) => (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : v ? 1 : 0);
const ICON = { purpose: '🎯', technologyStack: '🧱', architecture: '🏛️', modules: '📦', features: '✨', workflows: '🔀', database: '🗄️', apis: '🔌', businessRules: '📏', externalServices: '☁️', authentication: '🔑', authorization: '🛡️', stateManagement: '🧠', folderStructure: '📁', components: '🧩', services: '⚙️', models: '📐', environmentRequirements: '🔧', commands: '⌨️', conflicts: '⚠️' };

export default function BlueprintViewer({ blueprint }) {
  const [active, setActive] = useState('all');
  const keys = useMemo(() => (blueprint ? Object.keys(blueprint.blueprint) : []), [blueprint]);
  if (!blueprint) return <Empty>No blueprint yet. A blueprint is a plan generated from your projects’ specifications and your requirements. It never changes source code.</Empty>;
  const bp = blueprint.blueprint;
  const conflicts = [...(blueprint.conflicts || []), ...(Array.isArray(bp.conflicts) ? bp.conflicts : [])];
  const sections = keys.filter((k) => k !== 'conflicts');
  const shown = active === 'all' ? sections : sections.filter((k) => k === active);
  return (
    <div>
      <div className="row wrap"><Badge status="PROPOSED">PLAN ONLY</Badge><span className="muted-text">Created {new Date(blueprint.createdAt).toLocaleString()} from {blueprint.inputs.map((p) => p.name).join(', ') || 'no reference projects'} · applied to source: {String(blueprint.appliedToSource)}</span></div>
      <div className="bp-tiles">
        <Tile tone="a" value={count(bp.features)} label="Features" />
        <Tile tone="common" value={count(bp.modules) || count(bp.components)} label="Modules" />
        <Tile tone="b" value={count(bp.database && (bp.database.tables || bp.database.entities || bp.database))} label="Database items" />
        <Tile tone="neutral" value={count(bp.apis)} label="API endpoints" />
        <Tile tone="diff" value={conflicts.length} label="Decisions needed" onClick={conflicts.length ? () => setActive('conflicts') : undefined} active={active === 'conflicts'} />
      </div>
      {blueprint.missingSections.length > 0 && <div className="cx-hint">The AI left out: {blueprint.missingSections.map(label).join(', ')}. Ask again with more detail in the requirements if you need them.</div>}
      <div className="cx-body">
        <nav className="cx-nav" aria-label="Blueprint sections">
          <button className={active === 'all' ? 'on' : ''} onClick={() => setActive('all')}><span>All sections</span></button>
          {sections.map((k) => <button key={k} className={active === k ? 'on' : ''} onClick={() => setActive(k)}><span>{ICON[k] || '•'} {label(k)}</span><span className="cx-tab-count">{count(bp[k])}</span></button>)}
          {conflicts.length > 0 && <button className={active === 'conflicts' ? 'on' : ''} onClick={() => setActive('conflicts')}><span>⚠️ Decisions needed</span><span className="cx-tab-count">{conflicts.length}</span></button>}
        </nav>
        <div>
          {(active === 'all' || active === 'conflicts') && conflicts.length > 0 && <section className="bp-section"><header><span>⚠️ Decisions needed</span></header><div><Conflicts items={conflicts} /></div></section>}
          {active !== 'conflicts' && shown.map((k) => (
            <section className="bp-section" key={k}>
              <header><span>{ICON[k] || '•'} {label(k)}</span></header>
              <div>{k === 'folderStructure' && isObj(bp[k]) ? <Tree node={bp[k]} /> : k === 'database' && isObj(bp[k]) && (bp[k].tables || bp[k].entities) ? <Smart v={bp[k].tables || bp[k].entities} /> : <Smart v={bp[k]} />}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
