import React, { useState } from 'react';
import { Card, Button, ErrorBox } from './common.jsx';
import { rpc } from '../hooks/useRpc.js';
import { useRemote } from '../hooks/useAppState.js';

export default function SettingsPanel({ settings }) {
  const { data: schema } = useRemote('getSettingsSchema', {});
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({});
  if (!schema) return null;
  const save = async (key, value) => { setError(null); try { await rpc('updateSetting', { key, value }); setDraft((d) => { const n = { ...d }; delete n[key]; return n; }); } catch (e) { setError(e); } };
  return (
    <Card title="Settings">
      <div className="muted-text">Stored in VS Code settings (<code>aiProject.*</code>). Credentials never belong here: secrets use VS Code SecretStorage and are never written to .ai-project.</div>
      <ErrorBox error={error} />
      <div className="settings">
        {Object.entries(schema).map(([key, meta]) => {
          const cur = key in draft ? draft[key] : settings[key];
          return (
            <label className="field" key={key}>
              <span>{key}</span>
              {meta.type === 'boolean' ? <input type="checkbox" checked={!!cur} onChange={(e) => save(key, e.target.checked)} />
                : meta.type === 'number' ? <input type="number" value={cur} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} onBlur={() => key in draft && save(key, Number(draft[key]))} />
                  : meta.type === 'array' ? <textarea rows={3} value={(key in draft ? draft[key] : (cur || []).join('\n'))} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} onBlur={() => key in draft && save(key, String(draft[key]).split('\n').map((s) => s.trim()).filter(Boolean))} />
                    : key === 'provider' ? <select value={cur} onChange={(e) => save(key, e.target.value)}>{['auto', 'chatgpt', 'claude', 'gemini', 'generic'].map((o) => <option key={o}>{o}</option>)}</select>
                      : <input value={cur} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} onBlur={() => key in draft && save(key, draft[key])} />}
            </label>
          );
        })}
      </div>
    </Card>
  );
}
