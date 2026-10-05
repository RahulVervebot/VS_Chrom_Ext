import React from 'react';
import { rpc } from '../hooks/useRpc.js';

// Layered SVG graph: root in column 0, each depth level in the next column. Direction decides which way edges point.
export default function DependencyGraph({ graph, onFocus }) {
  if (!graph || !graph.nodes) return null;
  const cols = new Map();
  for (const n of graph.nodes) (cols.get(n.depth) || cols.set(n.depth, []).get(n.depth)).push(n);
  const W = 190; const H = 30; const GX = 70; const GY = 12;
  const maxRows = Math.max(...[...cols.values()].map((c) => c.length));
  const pos = new Map();
  for (const [d, list] of cols) list.forEach((n, i) => pos.set(n.path, { x: 10 + d * (W + GX), y: 10 + i * (H + GY) + ((maxRows - list.length) * (H + GY)) / 2 }));
  const width = 20 + cols.size * (W + GX);
  const height = 20 + maxRows * (H + GY);
  const short = (p) => (p.length > 26 ? '…' + p.slice(-25) : p);
  return (
    <div className="graph-wrap">
      <svg width={width} height={height} role="img" aria-label={`Dependency graph for ${graph.root}`}>
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
        {graph.edges.map((e, i) => {
          const a = pos.get(e.from); const b = pos.get(e.to);
          if (!a || !b) return null;
          // Edges are drawn between adjacent columns; anchor on the facing sides.
          const left = a.x < b.x;
          const x1 = left ? a.x + W : a.x; const x2 = left ? b.x : b.x + W;
          return <path key={i} className="edge" d={`M${x1} ${a.y + H / 2} C ${(x1 + x2) / 2} ${a.y + H / 2}, ${(x1 + x2) / 2} ${b.y + H / 2}, ${x2} ${b.y + H / 2}`} markerEnd="url(#arrow)" />;
        })}
        {graph.nodes.map((n) => {
          const p = pos.get(n.path);
          return (
            <g key={n.path} className={`node ${n.depth === 0 ? 'root' : ''}`} transform={`translate(${p.x},${p.y})`} onClick={() => onFocus && onFocus(n.path)} onDoubleClick={() => rpc('openFile', { path: n.path, line: 1 })}>
              <rect width={W} height={H} rx="4" />
              <text x="8" y={H / 2 + 4}>{short(n.path)}</text>
              <title>{n.path} (depth {n.depth}) — click to focus, double-click to open</title>
            </g>
          );
        })}
      </svg>
      {graph.external && graph.external.length > 0 && <div className="muted-text">External packages: {graph.external.join(', ')}</div>}
    </div>
  );
}
