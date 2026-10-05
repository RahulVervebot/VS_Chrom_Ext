import React, { useState } from 'react';

const CLS = { CONNECTED: 'ok', COMPLETED: 'ok', VERIFIED: 'ok', RUNNING: 'info', AWAITING_USER: 'warn', AWAITING_ACK: 'info', PAUSED: 'warn', PAIRING: 'warn', CONNECTING: 'warn', NEEDS_ATTENTION: 'bad', FAILED: 'bad', CANCELLED: 'muted', DISCONNECTED: 'bad', INFERRED: 'warn', UNKNOWN: 'bad' };

export const Badge = ({ status, children }) => <span className={`badge ${CLS[status] || 'muted'}`}>{children || String(status).replace(/_/g, ' ')}</span>;
export const Card = ({ title, actions, children }) => (<section className="card">{(title || actions) && <header><h3>{title}</h3><div className="row">{actions}</div></header>}<div className="body">{children}</div></section>);
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const ErrorBox = ({ error }) => (error ? <div className="error" role="alert">{error.message || String(error)}</div> : null);
export const Notice = ({ children, kind = 'info' }) => <div className={`notice ${kind}`}>{children}</div>;
export const fmt = (n) => (n === undefined || n === null ? '–' : Number(n).toLocaleString('en-US'));

export function Bar({ percent }) {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return <div className="bar" role="progressbar" aria-valuenow={p} aria-valuemin="0" aria-valuemax="100"><div className="fill" style={{ width: `${p}%` }} /><span>{p}%</span></div>;
}

// Runs an async action, shows its error, and disables itself while busy.
export function Action({ children, onClick, kind = 'secondary', disabled, onError }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => { setBusy(true); setErr(null); try { await onClick(); } catch (e) { setErr(e); if (onError) onError(e); } finally { setBusy(false); } };
  return (<><button className={`btn ${kind}`} onClick={go} disabled={disabled || busy}>{busy ? '…' : children}</button>{err && !onError && <div className="error small" role="alert">{err.message}</div>}</>);
}
