import React, { useMemo, useState } from 'react';
import { useRemote } from '../hooks/useAppState.js';
import { Bar, Button, Empty, ErrorBox, FileLink, Loading, fmt } from '../components/common.jsx';
import { Chips, Tabs, Tile } from '../components/ui2.jsx';
import { rpc } from '../hooks/useRpc.js';

const KIND = { 'odoo-addon': 'Odoo add-on', 'django-app': 'Django app', 'npm-package': 'npm package', 'maven-module': 'Maven module', 'gradle-module': 'Gradle module', 'go-module': 'Go module', 'rust-crate': 'Rust crate', 'dotnet-project': '.NET project', 'php-package': 'PHP package', 'ruby-gem': 'Ruby gem', 'python-package': 'Python package', 'workspace-folder': 'Workspace folder' };
const Table = ({ head, rows, empty }) => (rows.length ? <div className="table-wrap"><table><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows}</tbody></table></div> : <Empty>{empty}</Empty>);

function Detail({ m, all, select, go, reload }) {
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState(null);
  const o = m.odoo;
  const byPath = new Map(all.map((x) => [x.path, x]));
  const byName = new Map(all.map((x) => [x.name, x]));
  const label = (p) => (byPath.get(p) ? byPath.get(p).name : p);
  const act = (fn) => async () => { setError(null); try { await fn(); } catch (e) { setError(e); } };
  const scopeTo = async () => { await rpc('setSelection', { selection: { folders: [m.path] } }); };
  const purpose = m.aiPurpose || (m.manifest && (m.manifest.summary || m.manifest.description)) || null;
  const tabs = [['overview', 'Overview'], ['models', 'Models', m.models.defines.length + m.models.extends.length], ['routes', 'Routes', m.routes.length], ...(o ? [['views', 'Views & menus', o.views.length + o.menus.length], ['security', 'Security', o.accessRules.length + o.recordRules.length + o.groups.length]] : []), ['deps', 'Dependencies', m.uses.length + m.usedBy.length], ['files', 'Files', m.files.source]];
  return (
    <div>
      <div className="cx-hero" style={{ marginBottom: 10 }}>
        <h2>{m.title || m.name}</h2>
        <p><span className="cx-pill muted">{KIND[m.kind] || m.kind}</span> <code>{m.path}</code>{m.manifest && m.manifest.category ? ` · ${m.manifest.category}` : ''}{m.manifest && m.manifest.version ? ` · v${m.manifest.version}` : ''}{m.manifest && m.manifest.application ? ' · application' : ''}</p>
        <div className="cx-hint" style={{ margin: '6px 0' }}>
          <b>What it is for: </b>{purpose ? purpose : <span className="muted-text">not established yet. The manifest has no summary; analyze this module with AI to describe it.</span>}
          {m.aiPurpose ? <span className="cx-pill ok" style={{ marginLeft: 8 }}>from AI analysis</span> : purpose ? <span className="cx-pill muted" style={{ marginLeft: 8 }}>from the manifest</span> : null}
        </div>
        <div className="row wrap" style={{ alignItems: 'center' }}><span className="muted-text">Analysed by AI: {fmt(m.coverage.analyzed)} of {fmt(m.coverage.total)} source files</span><div className="grow"><Bar percent={m.coverage.percent} /></div></div>
        <div className="row wrap">
          <Button kind="primary" onClick={act(async () => { await scopeTo(); await rpc('startAnalysis', { continueUntilDone: true }); reload(); })}>{m.coverage.analyzed ? 'Analyze the rest with AI…' : 'Analyze this module with AI…'}</Button>
          <Button onClick={act(async () => { await scopeTo(); go('architecture'); })}>Show only this module in the other pages</Button>
          <Button onClick={act(async () => { await scopeTo(); await rpc('exec', { command: 'aiProject.compareSelection' }); })}>Compare with another project…</Button>
        </div>
        <ErrorBox error={error} />
      </div>
      <Tabs active={tab} onChange={setTab} tabs={tabs} />
      {tab === 'overview' && (
        <div>
          <div className="cx-tiles">
            <Tile tone="a" value={m.models.defines.length} label="Models defined" />
            <Tile tone="b" value={m.models.extends.length} label="Models extended" />
            <Tile tone="common" value={m.routes.length} label="Routes" />
            {o && <Tile tone="neutral" value={o.views.length} label="Views" />}
            {o && <Tile tone="neutral" value={o.menus.length} label="Menus" />}
            {o && <Tile tone="diff" value={o.accessRules.length} label="Access rules" />}
            <Tile tone="neutral" value={m.validation.rules} label="Validation rules" sub={m.validation.guards ? `+ ${m.validation.guards} checks in code` : null} />
          </div>
          <h4>Depends on (manifest)</h4>
          {m.manifestDepends.length ? <div className="cx-chips">{m.manifestDepends.map((d) => (byName.has(d) ? <button key={d} className="cx-chip a" onClick={() => select(byName.get(d).path)}>{d}</button> : <span key={d} className="cx-chip" title="not part of this project (core or third-party)">{d} <i>outside</i></span>))}</div> : <span className="muted-text">No declared dependencies.</span>}
          <h4>Features and workflows</h4>
          <Chips items={[...m.features.map((f) => ({ label: f, detail: 'feature' })), ...m.workflows.map((w) => ({ label: w, detail: 'workflow' }))]} empty="None detected." />
          {o && o.missingDataFiles.length > 0 && <div className="notice warn" style={{ marginTop: 10 }}>The manifest lists data files that do not exist: {o.missingDataFiles.join(', ')}</div>}
          {m.manifest && m.manifest.description && m.aiPurpose && <><h4>Manifest description</h4><p className="muted-text">{m.manifest.description}</p></>}
        </div>
      )}
      {tab === 'models' && (
        <div>
          <h4>Defined here</h4>
          <Table head={['Model', 'Table', 'Fields', 'Also inherits', 'File']} empty="This module defines no models." rows={m.models.defines.map((x) => <tr key={`${x.name}${x.file}`}><td><b>{x.name}</b></td><td>{x.table || '–'}</td><td><Chips items={x.fields} limit={12} empty="–" /></td><td>{(x.inherits || []).join(', ') || '–'}</td><td><FileLink file={x.file} line={x.line} /></td></tr>)} />
          <h4>Extended here</h4>
          <Table head={['Model', 'Fields added', 'Defined in', 'File']} empty="This module extends no models." rows={m.models.extends.map((x) => <tr key={`${x.name}${x.file}`}><td><b>{x.name}</b></td><td><Chips items={x.fieldsAdded} limit={12} empty="– (methods only)" /></td><td>{x.definedIn ? <button className="link-btn" onClick={() => select(x.definedIn)}>{label(x.definedIn)}</button> : <span className="muted-text">outside this project</span>}</td><td><FileLink file={x.file} line={x.line} /></td></tr>)} />
          {m.relationships.length > 0 && <><h4>Relationships</h4><ul>{m.relationships.map((r, i) => <li key={i}>{r.from} → {r.to} <span className="muted-text">({r.type})</span></li>)}</ul></>}
        </div>
      )}
      {tab === 'routes' && <Table head={['Method', 'Endpoint', 'Handler', 'Login needed', 'File']} empty="No HTTP routes in this module." rows={m.routes.map((r, i) => <tr key={i}><td>{r.method}</td><td><code>{r.endpoint}</code></td><td>{r.handler || '–'}</td><td>{r.protected ? 'yes' : 'no'}</td><td><FileLink file={r.file} line={r.line} /></td></tr>)} />}
      {tab === 'views' && o && (
        <div>
          <h4>Views</h4>
          <Table head={['View', 'Model', 'Type', 'File']} empty="No views." rows={o.views.map((v) => <tr key={`${v.id}${v.file}`}><td>{v.id}</td><td>{v.model || '–'}</td><td>{v.type}</td><td><FileLink file={v.file} /></td></tr>)} />
          <h4>Menus</h4>
          <Table head={['Menu', 'Name', 'Parent', 'Opens']} empty="No menus." rows={o.menus.map((x) => <tr key={`${x.id}${x.file}`}><td>{x.id}</td><td>{x.name || '–'}</td><td>{x.parent || '(top level)'}</td><td>{x.action || '–'}</td></tr>)} />
          <h4>Window actions</h4>
          <Table head={['Action', 'Name', 'Model']} empty="No window actions." rows={o.actions.map((x) => <tr key={`${x.id}${x.file}`}><td>{x.id}</td><td>{x.name || '–'}</td><td>{x.model || '–'}</td></tr>)} />
          {(o.reports.length + o.crons.length + o.mailTemplates.length + o.templates.length) > 0 && <div className="kv"><span>Reports</span><b>{o.reports.length}</b><span>Scheduled jobs</span><b>{o.crons.length}</b><span>Mail templates</span><b>{o.mailTemplates.length}</b><span>QWeb templates</span><b>{o.templates.length}</b></div>}
        </div>
      )}
      {tab === 'security' && o && (
        <div>
          <h4>Access rules (ir.model.access.csv)</h4>
          <Table head={['Rule', 'Model', 'Group', 'Read / write / create / delete']} empty="No access rules: if this module defines models, users may not be able to open them." rows={o.accessRules.map((r) => <tr key={`${r.id}${r.file}`}><td>{r.id}</td><td>{r.modelGuess || r.model}</td><td>{r.group || 'everyone'}</td><td><code>{r.permissions}</code></td></tr>)} />
          <h4>Record rules</h4>
          <Table head={['Rule', 'Name', 'Model']} empty="No record rules." rows={o.recordRules.map((r) => <tr key={`${r.id}${r.file}`}><td>{r.id}</td><td>{r.name || '–'}</td><td>{r.model || '–'}</td></tr>)} />
          <h4>Groups</h4>
          <Chips items={o.groups.map((g) => ({ label: g.name || g.id, detail: g.id }))} empty="No groups defined here." />
        </div>
      )}
      {tab === 'deps' && (
        <div className="cx-cols">
          <div className="cx-col a"><h4><span>Uses</span><small>{m.uses.length}</small></h4>{m.uses.length ? <ul>{m.uses.map((u) => <li key={u.module}><button className="link-btn" onClick={() => select(u.module)}>{label(u.module)}</button> <span className="muted-text">{[u.imports ? `${u.imports} import(s)` : null, u.extendsModels.length ? `extends ${u.extendsModels.join(', ')}` : null].filter(Boolean).join(' · ')}</span></li>)}</ul> : <span className="muted-text">No other module of this project.</span>}</div>
          <div className="cx-col b"><h4><span>Used by</span><small>{m.usedBy.length}</small></h4>{m.usedBy.length ? <ul>{m.usedBy.map((u) => <li key={u.module}><button className="link-btn" onClick={() => select(u.module)}>{label(u.module)}</button> <span className="muted-text">{[u.imports ? `${u.imports} import(s)` : null, u.extendsModels.length ? `extends ${u.extendsModels.join(', ')}` : null].filter(Boolean).join(' · ')}</span></li>)}</ul> : <span className="muted-text">Nothing in this project depends on it.</span>}</div>
          <div className="cx-col"><h4><span>External packages</span><small>{m.externalPackages.length}</small></h4><Chips items={m.externalPackages} empty="None." /></div>
        </div>
      )}
      {tab === 'files' && (
        <div className="kv">
          <span>Files</span><b>{fmt(m.files.total)} ({fmt(m.files.source)} source, {fmt(m.files.tests)} tests)</b>
          <span>Languages</span><b>{Object.entries(m.files.languages).map(([l, n]) => `${l} ${n}`).join(', ') || '–'}</b>
          <span>Layers</span><b>{Object.entries(m.layers).map(([l, n]) => `${l} ${n}`).join(', ') || '–'}</b>
        </div>
      )}
    </div>
  );
}

export default function ModulesPage({ state, refresh, go }) {
  const { data, loading, error, reload } = useRemote('getModules', {});
  const [active, setActive] = useState(null);
  const [q, setQ] = useState('');
  const mods = useMemo(() => (data ? data.modules : []), [data]);
  if (!state.initialized) return <Empty>Initialize the project first.</Empty>;
  if (loading && !data) return <Loading what="Reading the modules (the first time this scans the project)" />;
  if (error) return <ErrorBox error={error} />;
  if (!mods.length) return <Empty>No sub-projects were found. Modules are detected from their marker files: Odoo <code>__manifest__.py</code>, Django <code>apps.py</code>, a nested <code>package.json</code>, <code>pom.xml</code>, <code>go.mod</code>, <code>Cargo.toml</code>, <code>.csproj</code>, or folders such as <code>apps/*</code> and <code>packages/*</code>.</Empty>;
  const query = q.trim().toLowerCase();
  const shown = mods.filter((m) => !query || `${m.name} ${m.title || ''} ${(m.manifest && m.manifest.summary) || ''} ${m.path}`.toLowerCase().includes(query));
  const current = mods.find((m) => m.path === active) || shown[0] || mods[0];
  const totals = mods.reduce((t, m) => ({ defines: t.defines + m.models.defines.length, extends: t.extends + m.models.extends.length, routes: t.routes + m.routes.length, analyzed: t.analyzed + m.coverage.analyzed, files: t.files + m.coverage.total }), { defines: 0, extends: 0, routes: 0, analyzed: 0, files: 0 });
  return (
    <div>
      <div className="cx-tiles">
        <Tile tone="a" value={mods.length} label="Modules" sub={[...new Set(mods.map((m) => KIND[m.kind] || m.kind))].join(', ')} />
        <Tile tone="common" value={totals.defines} label="Models defined" />
        <Tile tone="b" value={totals.extends} label="Models extended" />
        <Tile tone="neutral" value={totals.routes} label="Routes" />
        <Tile tone="diff" value={`${totals.files ? Math.round((totals.analyzed / totals.files) * 100) : 0}%`} label="Analysed by AI" sub={`${fmt(totals.analyzed)} of ${fmt(totals.files)} source files`} />
      </div>
      <div className="cx-body">
        <nav className="cx-nav" aria-label="Modules">
          <input className="cx-search" placeholder="Search modules…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search modules" />
          {shown.map((m) => (
            <button key={m.path} className={current && current.path === m.path ? 'on' : ''} onClick={() => setActive(m.path)} title={m.path}>
              <span>{m.name}{m.title ? <span className="muted-text"> · {m.title}</span> : null}</span>
              <span className={`cx-pill ${m.coverage.percent === 100 ? 'ok' : m.coverage.percent ? 'warn' : 'muted'}`}>{m.coverage.percent}%</span>
            </button>
          ))}
          <Button onClick={async () => { await rpc('scan'); reload(); refresh(); }}>Re-scan modules</Button>
        </nav>
        {current && <Detail key={current.path} m={current} all={mods} select={setActive} go={go} reload={() => { reload(); refresh(); }} />}
      </div>
    </div>
  );
}
