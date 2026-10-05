import React from 'react';

// Small presentational pieces shared by the Compare and Generate pages.
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="cx-tabs" role="tablist">
      {tabs.map(([id, label, count]) => (
        <button key={id} role="tab" aria-selected={active === id} className={`cx-tab ${active === id ? 'on' : ''}`} onClick={() => onChange(id)}>
          {label}{count !== undefined && count !== null && <span className="cx-tab-count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Tile({ tone = 'neutral', value, label, sub, onClick, active }) {
  return (
    <button className={`cx-tile ${tone} ${active ? 'on' : ''}`} onClick={onClick} disabled={!onClick}>
      <span className="cx-tile-value">{value}</span>
      <span className="cx-tile-label">{label}</span>
      {sub && <span className="cx-tile-sub">{sub}</span>}
    </button>
  );
}

// Proportion bar for common / only A / only B / differ.
export function StackBar({ parts }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return <div className="cx-stack empty" />;
  return (
    <div className="cx-stack" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      {parts.filter((p) => p.value).map((p) => <span key={p.label} className={`cx-seg ${p.tone}`} style={{ flexGrow: p.value }} title={`${p.label}: ${p.value}`} />)}
    </div>
  );
}

export function Chips({ items, tone = 'neutral', limit = 40, empty = 'None' }) {
  const [all, setAll] = React.useState(false);
  if (!items.length) return <span className="muted-text">{empty}</span>;
  const shown = all ? items : items.slice(0, limit);
  return (
    <div className="cx-chips">
      {shown.map((x, i) => <span key={i} className={`cx-chip ${tone}`} title={x.title || undefined}>{x.label !== undefined ? x.label : String(x)}{x.detail ? <i>{x.detail}</i> : null}</span>)}
      {items.length > limit && !all && <button className="link-btn" onClick={() => setAll(true)}>+{items.length - limit} more</button>}
    </div>
  );
}

export function Step({ n, title, children, done }) {
  return (
    <div className={`cx-step ${done ? 'done' : ''}`}>
      <div className="cx-step-n">{done ? '✓' : n}</div>
      <div className="cx-step-body"><div className="cx-step-title">{title}</div>{children}</div>
    </div>
  );
}

// Two-step confirm (window.confirm is not available in VS Code webviews).
export function ConfirmButton({ children, confirmText = 'Click again to confirm', onConfirm, kind = 'secondary' }) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => { if (!armed) return undefined; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return <button className={`btn ${armed ? 'primary' : kind}`} onClick={async () => { if (!armed) { setArmed(true); return; } setArmed(false); await onConfirm(); }}>{armed ? confirmText : children}</button>;
}

export const ago = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};
