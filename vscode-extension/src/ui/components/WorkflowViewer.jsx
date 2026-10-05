import React, { useState } from 'react';
import { Badge, FileLink } from './common.jsx';

const KIND_LABEL = { trigger: 'Trigger', frontend: 'Frontend', 'frontend-service': 'Frontend service', state: 'State', 'state-change': 'State', 'api-call': 'API call', route: 'API route', middleware: 'Middleware', controller: 'Controller', service: 'Service', logic: 'Business logic', repository: 'Repository', model: 'Model', 'db-read': 'DB read', 'db-write': 'DB write', transaction: 'Transaction', 'external-service': 'External service', 'security-check': 'Security', response: 'Response' };

function describe(s) {
  switch (s.kind) {
    case 'trigger': return `${s.event} in ${s.symbol || 'component'}`;
    case 'api-call': return `${s.method} ${s.endpoint} (${s.client})`;
    case 'route': return `${s.method} ${s.endpoint}`;
    case 'db-read': case 'db-write': return `${s.entity} · ${s.operation}`;
    case 'external-service': return s.service;
    case 'security-check': return s.check;
    default: return s.symbol || s.kind;
  }
}

// Trigger -> Frontend -> State -> API -> Backend -> Business Logic -> Database -> External -> Response -> UI
export default function WorkflowViewer({ workflow }) {
  const [open, setOpen] = useState(null);
  if (!workflow) return null;
  const k = workflow.knowledge || {};
  return (
    <div className="workflow">
      <div className="row wrap"><Badge status={workflow.status} /><span className="muted-text">Trace derived from source · {workflow.steps.length} steps</span></div>
      <p>{k.purpose && k.purpose.value ? <>{k.purpose.value} <Badge status={k.purpose.status} /></> : <em className="muted-text">Purpose: UNKNOWN — not established by source analysis or verified AI knowledge.</em>}</p>
      <ol className="steps">
        {workflow.steps.map((s, i) => (
          <li key={i} className={`step ${s.kind} ${open === i ? 'open' : ''}`}>
            <button className="step-head" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span className="step-kind">{KIND_LABEL[s.kind] || s.kind}</span>
              <span className="step-desc">{describe(s)}</span>
              <Badge status={s.status} />
            </button>
            {open === i && (
              <div className="step-detail">
                {s.file && <div>File: <FileLink file={s.file} line={s.line} /></div>}
                {s.symbol && <div>Symbol: <code>{s.symbol}</code>{s.endLine ? ` (lines ${s.line}-${s.endLine})` : ''}</div>}
                <div>Evidence: <Badge status={s.status} /> {s.basis ? `— ${s.basis}` : s.status === 'VERIFIED' ? '— resolved through source (import binding / direct reference)' : ''}</div>
                {s.note && <div className="muted-text">{s.note}</div>}
              </div>
            )}
          </li>
        ))}
      </ol>
      {workflow.summary && (
        <div className="kv">
          <span>Database reads</span><b>{workflow.summary.databaseReads.join(', ') || 'none found'}</b>
          <span>Database writes</span><b>{workflow.summary.databaseWrites.join(', ') || 'none found'}</b>
          <span>External services</span><b>{workflow.summary.externalServices.join(', ') || 'none found'}</b>
        </div>
      )}
      {k.steps && k.steps.length > 0 && (<><h4>AI-provided steps (checked against source)</h4><ul>{k.steps.map((s, i) => <li key={i}>{s.description || s.symbol} <Badge status={s.status} /> {s.note && <span className="muted-text">{s.note}</span>}</li>)}</ul></>)}
      {workflow.unknowns && workflow.unknowns.length > 0 && (<><h4>Unknowns</h4><ul>{workflow.unknowns.map((u, i) => <li key={i}>{u}</li>)}</ul></>)}
    </div>
  );
}
