import React, { useMemo, useState } from 'react';
import { Empty } from './common.jsx';

// Splits the exported text into its numbered sections so the file can be browsed by section.
function chunks(text) {
  const re = /={78}\n(\d+)\. ([^\n]+?)(?:\s+\((\d+)\))?\n={78}\n/g;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ n: Number(m[1]), title: m[2].replace(/\s+$/, ''), count: m[3] === undefined ? null : Number(m[3]), start: m.index, bodyStart: re.lastIndex });
  return marks.map((x, i) => ({ ...x, body: text.slice(x.bodyStart, i + 1 < marks.length ? marks[i + 1].start : text.length).replace(/\s+$/, '') }));
}

export default function SpecViewer({ spec }) {
  const [active, setActive] = useState('all');
  const parts = useMemo(() => (spec && spec.text ? chunks(spec.text) : []), [spec]);
  if (!spec || !spec.exists) return <Empty>No specification yet. Use “Create specification file” above.</Empty>;
  const header = spec.text.slice(0, spec.text.indexOf('='.repeat(78))).trim();
  const shown = active === 'all' ? spec.text : active === 'header' ? header : (parts.find((p) => String(p.n) === active) || {}).body || '';
  return (
    <div className="cx-spec">
      <nav className="cx-nav" aria-label="Specification sections">
        <button className={active === 'all' ? 'on' : ''} onClick={() => setActive('all')}><span>Whole file</span><span className="muted-text">{Math.round(spec.bytes / 1024)} KB</span></button>
        <button className={active === 'header' ? 'on' : ''} onClick={() => setActive('header')}><span>How to use it</span></button>
        {parts.map((p) => <button key={p.n} className={active === String(p.n) ? 'on' : ''} onClick={() => setActive(String(p.n))}><span>{p.n}. {p.title.replace(/\s*\(.*$/, '')}</span>{p.count !== null && <span className="cx-tab-count">{p.count}</span>}</button>)}
      </nav>
      <pre className="cx-spec-text" tabIndex={0} aria-label="Specification text">{shown}</pre>
    </div>
  );
}
