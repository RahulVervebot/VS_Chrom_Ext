import React from 'react';
import { Action, Badge, Card, fmt } from './common.jsx';
import { cmd } from '../hooks/useStore.js';

// Shown before anything is typed into an AI website: exactly what will be sent, to whom, and what was redacted.
export default function PrivacyConfirm({ run, settings, tabs, projectName, connectedProjectId }) {
  const elsewhere = connectedProjectId && run.projectId !== connectedProjectId;
  const types = {};
  for (const s of run.secrets || []) types[s.type] = (types[s.type] || 0) + (s.count || 1);
  const target = settings.provider === 'auto' ? (tabs && tabs.length ? `${tabs[0].provider} (open tab)` : 'the AI tab you have open') : settings.provider;
  return (
    <Card title={`Review before sending: ${run.analysisId}`} actions={<Badge status="AWAITING_USER">NEEDS YOUR OK</Badge>}>
      {projectName && <div className="muted">Project: <b>{projectName}</b></div>}
      {elsewhere && <div className="notice warn">This request belongs to a different project than the one Chrome is connected to. Connect to it from VS Code before approving.</div>}
      <div className="muted">{run.mode}{run.purpose ? `: ${run.purpose}` : ''}{run.intent && run.intent !== 'UNDERSTAND' ? ` (${run.intent.replace('_', ' ').toLowerCase()})` : ''}</div>
      <div className="kv">
        <span>AI provider</span><b>{target}</b>
        <span>Files</span><b>{fmt(run.files.length)}</b>
        <span>Batches</span><b>{run.totalBatches}</b>
        <span>Estimated tokens</span><b>{fmt(run.estimatedTokens)}</b>
        <span>Secrets redacted</span><b>{run.secretsRedacted ? `${run.secretsRedacted} (${Object.entries(types).map(([t, n]) => `${t} ×${n}`).join(', ')})` : 'none detected'}</b>
      </div>
      <details><summary>Files that will be sent</summary><ul className="files">{run.files.map((f) => <li key={f.path}><code>{f.path}</code> <span className="muted mono">{String(f.hash).slice(0, 15)}…</span></li>)}</ul></details>
      <p className="muted">Secret values are removed before sending and never appear here. The prompt is checked for secrets once more in this extension. Excluded files are never sent.</p>
      <div className="row">{!elsewhere && <Action kind="primary" onClick={() => cmd('confirmAnalysis', { id: run.key })}>Send and analyze</Action>}<Action onClick={() => cmd('declineAnalysis', { id: run.key })}>Decline</Action></div>
    </Card>
  );
}
