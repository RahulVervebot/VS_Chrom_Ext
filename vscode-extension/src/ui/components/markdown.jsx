import React from 'react';

// Minimal, safe Markdown renderer (no HTML injection): headings, lists, tables, code, quotes, bold, inline code.
function inline(text, key) {
  const parts = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(_[^_]+_)/g;
  let last = 0; let m; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('`')) parts.push(<code key={`${key}-${i++}`}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) parts.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else parts.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export default function Markdown({ source }) {
  const lines = String(source || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { const H = `h${m[1].length}`; out.push(<H key={i}>{inline(m[2], i)}</H>); i++; continue; }
    if (l.startsWith('```')) { const buf = []; i++; while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]); i++; out.push(<pre key={i}><code>{buf.join('\n')}</code></pre>); continue; }
    if (l.startsWith('>')) { const buf = []; while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(<blockquote key={i}>{buf.map((b, j) => <div key={j}>{inline(b, `${i}-${j}`)}</div>)}</blockquote>); continue; }
    if (l.startsWith('|') && /^\|?\s*-{3,}/.test(lines[i + 1] || '')) {
      const head = splitRow(l); i += 2; const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(splitRow(lines[i++]));
      out.push(<div className="table-wrap" key={i}><table><thead><tr>{head.map((h, j) => <th key={j}>{inline(h, j)}</th>)}</tr></thead><tbody>{rows.map((r, a) => <tr key={a}>{r.map((c, b) => <td key={b}>{inline(c, `${a}-${b}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)) { const items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, '')); out.push(<ul key={i}>{items.map((it, j) => <li key={j}>{inline(it, j)}</li>)}</ul>); continue; }
    if (!l.trim()) { i++; continue; }
    out.push(<p key={i}>{inline(l, i)}</p>); i++;
  }
  return <div className="markdown">{out}</div>;
}
