import React, { useMemo, useState } from 'react';
import { Empty } from './common.jsx';
import { Chips, StackBar, Tile } from './ui2.jsx';

const SECTION_TITLES = { commonApproaches: 'What both have in common', differences: 'Differences', architecturalDifferences: 'Architecture differences', databaseDifferences: 'Database differences', workflowDifferences: 'Workflow differences', reusablePatterns: 'Worth reusing', migrationConsiderations: 'Things to decide / migrate', unknowns: 'Not established' };
const text = (x) => (typeof x === 'string' ? x : JSON.stringify(x));

export function SuggestionsPanel({ suggestions, nameA, nameB }) {
  const [dir, setDir] = useState('all');
  if (!suggestions || !suggestions.length) return <Empty>No suggestions: the two specifications have the same content in every area.</Empty>;
  const count = (d) => suggestions.filter((s) => s.direction === d).length;
  const list = suggestions.filter((s) => dir === 'all' || s.direction === dir);
  const label = { adopt: `Consider from ${nameB}`, keep: `Keep from ${nameA}`, review: 'Decide' };
  return (
    <div>
      <div className="row wrap">
        {[['all', `All (${suggestions.length})`], ['adopt', `Consider from ${nameB} (${count('adopt')})`], ['keep', `Keep from ${nameA} (${count('keep')})`], ['review', `Decide (${count('review')})`]].map(([id, l]) => (
          <button key={id} className={`btn ${dir === id ? 'primary' : 'secondary'}`} onClick={() => setDir(id)}>{l}</button>
        ))}
      </div>
      <div className="cx-sugs">
        {list.map((s) => (
          <div key={s.id} className={`cx-sug ${s.direction}`}>
            <div className="cx-sug-title"><span className={`cx-tag ${s.direction}`}>{label[s.direction]}</span>{s.title}</div>
            <div className="muted-text">{s.reason}</div>
            <Chips items={s.items.map((x) => ({ label: x }))} tone={s.direction === 'adopt' ? 'b' : s.direction === 'keep' ? 'a' : 'diff'} empty="" />
            {s.more > 0 && <div className="muted-text">…and {s.more} more (see the category above).</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Category({ c, nameA, nameB, query }) {
  const f = (xs) => (query ? xs.filter((x) => `${x.label} ${x.detail || ''}`.toLowerCase().includes(query)) : xs);
  const item = (x) => ({ label: x.label, detail: x.detail });
  const common = f(c.common); const onlyA = f(c.onlyA); const onlyB = f(c.onlyB); const diff = f(c.different);
  return (
    <div>
      <div className="cx-cols">
        <div className="cx-col a"><h4><span>Only in {nameA}</span><small>{onlyA.length}</small></h4><Chips tone="a" items={onlyA.map(item)} empty="Nothing unique to this project." /></div>
        <div className="cx-col common"><h4><span>In both</span><small>{common.length}</small></h4><Chips tone="common" items={common.map((x) => ({ label: x.label }))} empty="Nothing in common." /></div>
        <div className="cx-col b"><h4><span>Only in {nameB}</span><small>{onlyB.length}</small></h4><Chips tone="b" items={onlyB.map(item)} empty="Nothing unique to this project." /></div>
      </div>
      {diff.length > 0 && (
        <div className="cx-col" style={{ marginTop: 10, borderTopColor: 'var(--cx-diff)' }}>
          <h4><span>In both, but different</span><small>{diff.length}</small></h4>
          <div className="table-wrap"><table className="cx-diff-table"><thead><tr><th>Item</th><th>{nameA}</th><th>{nameB}</th><th>What differs</th></tr></thead><tbody>{diff.map((d) => <tr key={d.key}><td>{d.label}</td><td>{d.a || '–'}</td><td>{d.b || '–'}</td><td>{d.why}</td></tr>)}</tbody></table></div>
        </div>
      )}
    </div>
  );
}

export function MatrixView({ m }) {
  const [active, setActive] = useState(null);
  const [q, setQ] = useState('');
  const cats = m.categories.filter((c) => c.counts.common || c.counts.onlyA || c.counts.onlyB || c.counts.different);
  const current = cats.find((c) => c.id === active) || cats.find((c) => c.counts.onlyA || c.counts.onlyB || c.counts.different) || cats[0];
  const query = q.trim().toLowerCase();
  const parts = useMemo(() => [{ label: 'Common', value: m.totals.common, tone: 'common' }, { label: `Only ${m.a.name}`, value: m.totals.onlyA, tone: 'a' }, { label: `Only ${m.b.name}`, value: m.totals.onlyB, tone: 'b' }, { label: 'Differ', value: m.totals.different, tone: 'diff' }], [m]);
  const cov = (side) => (side.coverage.status === 'COMPLETE' ? 'fully analysed' : `${side.coverage.filesAnalyzed}/${side.coverage.filesTotal} files AI-analysed`);
  return (
    <div>
      <div className="cx-versus">
        <div className="cx-proj a"><b>{m.a.name}</b><span className="muted-text">{cov(m.a)}</span></div>
        <span className="cx-vs">vs</span>
        <div className="cx-proj b"><b>{m.b.name}</b><span className="muted-text">{cov(m.b)}</span></div>
      </div>
      <div className="cx-tiles">
        <Tile tone="common" value={m.totals.common} label="In both" sub="same in both projects" />
        <Tile tone="a" value={m.totals.onlyA} label={`Only in ${m.a.name}`} sub={`${m.b.name} lacks these`} />
        <Tile tone="b" value={m.totals.onlyB} label={`Only in ${m.b.name}`} sub={`${m.a.name} lacks these`} />
        <Tile tone="diff" value={m.totals.different} label="Different" sub="in both, but not equal" />
      </div>
      <StackBar parts={parts} />
      <div className="cx-body">
        <nav className="cx-nav" aria-label="Categories">
          {cats.map((c) => (
            <button key={c.id} className={current && current.id === c.id ? 'on' : ''} onClick={() => setActive(c.id)}>
              <span>{c.title}</span>
              <span className="cx-mini"><span className="a" title={`only ${m.a.name}`}>{c.counts.onlyA}</span><span className="c" title="common">{c.counts.common}</span><span className="b" title={`only ${m.b.name}`}>{c.counts.onlyB}</span>{c.counts.different > 0 && <span className="d" title="differ">{c.counts.different}</span>}</span>
            </button>
          ))}
        </nav>
        <div>
          <input className="cx-search" placeholder={`Search in ${current ? current.title.toLowerCase() : 'this category'}…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
          {current ? <Category c={current} nameA={m.a.name} nameB={m.b.name} query={query} /> : <Empty>Nothing to compare yet.</Empty>}
        </div>
      </div>
    </div>
  );
}

export function AiAnalysis({ ai }) {
  const sections = Object.keys(SECTION_TITLES).filter((k) => (ai.result[k] || []).length);
  return (
    <div>
      <div className="muted-text">Explained by {ai.provider || 'the AI'} from the two specifications and the computed comparison. Treat it as commentary: the lists above are the facts.</div>
      <div className="cx-ai">
        {sections.map((k) => <div className="cx-ai-card" key={k}><h4>{SECTION_TITLES[k]}</h4><ul>{ai.result[k].map((x, i) => <li key={i}>{text(x)}</li>)}</ul></div>)}
      </div>
      {ai.conflicts.length > 0 && <div className="cx-ai-card" style={{ marginTop: 10 }}><h4>Conflicts that need a decision</h4><ul>{ai.conflicts.map((x, i) => <li key={i}>{text(x)}</li>)}</ul></div>}
    </div>
  );
}
