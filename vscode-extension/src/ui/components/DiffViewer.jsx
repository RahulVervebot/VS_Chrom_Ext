import React from 'react';

export default function DiffViewer({ diff }) {
  if (!diff) return null;
  return (
    <pre className="diff" aria-label="Unified diff">
      {diff.split('\n').map((l, i) => <div key={i} className={l.startsWith('+++') || l.startsWith('---') ? 'meta' : l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l || ' '}</div>)}
    </pre>
  );
}
