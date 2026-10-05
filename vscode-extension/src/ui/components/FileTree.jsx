import React, { useMemo, useState } from 'react';
import { Badge } from './common.jsx';

function buildTree(files) {
  const root = { name: '', children: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children.has(parts[i])) node.children.set(parts[i], { name: parts[i], path: parts.slice(0, i + 1).join('/'), children: new Map(), files: [] });
      node = node.children.get(parts[i]);
    }
    node.files.push(f);
  }
  return root;
}

const countFiles = (n) => n.files.length + [...n.children.values()].reduce((s, c) => s + countFiles(c), 0);

function Folder({ node, depth, selection, onToggle, onOpen, activePath, query, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen || depth < 1);
  const selected = selection.folders.includes(node.path);
  const expanded = query ? true : open; // an active filter reveals every match
  return (
    <li>
      <div className="tree-row" style={{ paddingLeft: depth * 12 }}>
        <button className="twisty" onClick={() => setOpen(!open)} aria-label={expanded ? 'Collapse' : 'Expand'}>{expanded ? '▾' : '▸'}</button>
        <input type="checkbox" checked={selected} onChange={() => onToggle('folders', node.path)} aria-label={`Select folder ${node.path}`} />
        <span className="tree-name folder" onClick={() => setOpen(!open)}>{node.name}/</span>
        <span className="muted-text">{countFiles(node)}</span>
      </div>
      {expanded && (
        <ul>
          {[...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <Folder key={c.path} node={c} depth={depth + 1} selection={selection} onToggle={onToggle} onOpen={onOpen} activePath={activePath} query={query} defaultOpen={!!query} />)}
          {node.files.sort((a, b) => a.path.localeCompare(b.path)).map((f) => (
            <li key={f.path} className={activePath === f.path ? 'active' : ''}>
              <div className="tree-row" style={{ paddingLeft: (depth + 1) * 12 + 14 }}>
                <input type="checkbox" checked={selection.files.includes(f.path)} onChange={() => onToggle('files', f.path)} aria-label={`Select ${f.path}`} />
                <span className="tree-name" onClick={() => onOpen(f.path)}>{f.path.split('/').pop()}</span>
                <Badge status={f.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function FileTree({ files, selection, onToggle, onOpen, activePath, query }) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <ul className="tree">
      {[...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <Folder key={c.path} node={c} depth={0} selection={selection} onToggle={onToggle} onOpen={onOpen} activePath={activePath} query={query} defaultOpen={!!query} />)}
      {tree.files.map((f) => (
        <li key={f.path} className={activePath === f.path ? 'active' : ''}>
          <div className="tree-row" style={{ paddingLeft: 14 }}>
            <input type="checkbox" checked={selection.files.includes(f.path)} onChange={() => onToggle('files', f.path)} aria-label={`Select ${f.path}`} />
            <span className="tree-name" onClick={() => onOpen(f.path)}>{f.path}</span>
            <Badge status={f.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
