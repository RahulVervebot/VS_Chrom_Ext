import React from 'react';

export const STATUS_CLASS = { VERIFIED: 'ok', ANALYZED: 'ok', COMPLETE: 'ok', COMPLETED: 'ok', CONNECTED: 'ok', APPLIED: 'ok', INFERRED: 'warn', PARTIAL: 'warn', PROPOSED: 'warn', PAUSED: 'warn', LISTENING: 'warn', PAIRING: 'warn', IN_PROGRESS: 'info', AWAITING_ACCEPT: 'info', WAITING_PACKAGE: 'info', UNKNOWN: 'bad', OUTDATED: 'bad', STALE: 'bad', FAILED: 'bad', CANCELLED: 'bad', DISCONNECTED: 'bad', NOT_ANALYZED: 'muted', STOPPED: 'muted', REJECTED: 'muted', LOW: 'ok', MEDIUM: 'warn', HIGH: 'bad', APPLIED_VERIFICATION_FAILED: 'bad', ROLLED_BACK: 'muted', CREATED: 'muted', SENT: 'info' };

export function Badge({ status, children }) {
  const cls = STATUS_CLASS[status] || 'muted';
  return <span className={`badge ${cls}`}>{children || String(status).replace(/_/g, ' ')}</span>;
}

export function Card({ title, children, actions, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <header className="card-head"><h3>{title}</h3><div className="row">{actions}</div></header>}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, onClick }) {
  return <div className={`stat ${onClick ? 'clickable' : ''}`} onClick={onClick}><div className="stat-value">{value}</div><div className="stat-label">{label}</div>{sub && <div className="stat-sub">{sub}</div>}</div>;
}

export function Bar({ percent, status }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return <div className="bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}><div className={`bar-fill ${STATUS_CLASS[status] || ''}`} style={{ width: `${p}%` }} /><span className="bar-text">{p}%</span></div>;
}

export function Empty({ children, action }) {
  return <div className="empty"><p>{children}</p>{action}</div>;
}

export function ErrorBox({ error }) {
  return error ? <div className="error-box" role="alert">{error.message}</div> : null;
}

export function Loading({ what = 'Loading' }) { return <div className="muted-text">{what}…</div>; }

export function Button({ children, onClick, kind = 'secondary', disabled, title }) {
  const [busy, setBusy] = React.useState(false);
  const click = async (e) => {
    if (!onClick || busy) return;
    setBusy(true);
    try { await onClick(e); } finally { setBusy(false); }
  };
  return <button className={`btn ${kind}`} onClick={click} disabled={disabled || busy} title={title}>{busy ? '…' : children}</button>;
}

export const fmt = (n) => (n === undefined || n === null ? '–' : Number(n).toLocaleString('en-US'));

export function FileLink({ file, line, children }) {
  return <a className="file-link" href="#" onClick={(e) => { e.preventDefault(); import('../hooks/useRpc.js').then(({ rpc }) => rpc('openFile', { path: file, line })); }}>{children || `${file}${line ? `:${line}` : ''}`}</a>;
}
