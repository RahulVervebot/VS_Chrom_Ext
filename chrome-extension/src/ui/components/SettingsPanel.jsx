import React, { useEffect, useState } from 'react';
import { Action, Badge, Card, ErrorBox, Notice } from './common.jsx';
import { cmd } from '../hooks/useStore.js';

const LABELS = { maxTokensPerRequest: 'Max tokens per request', maxFilesPerRequest: 'Max files per request', maxLinesPerFile: 'Max lines per file', maxTotalLines: 'Max total lines per request', maxTotalTokens: 'Max total tokens per analysis', responseTimeoutSec: 'Wait for an AI answer (seconds)', stableSec: 'Answer must be stable for (seconds)', bridgePort: 'VS Code bridge port' };

export default function SettingsPanel({ settings }) {
  const [draft, setDraft] = useState(settings);
  const [check, setCheck] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => { cmd('listTabs').then(setTabs).catch(() => {}); }, []);
  const save = (patch) => cmd('saveSettings', { patch }).catch(setError);
  return (
    <>
      <Card title="AI provider">
        <label className="field">Provider
          <select value={draft.provider} onChange={(e) => { setDraft({ ...draft, provider: e.target.value }); save({ provider: e.target.value }); }}>
            <option value="auto">Auto: use the AI tab I have open</option><option value="chatgpt">ChatGPT</option><option value="claude">Claude</option><option value="gemini">Gemini</option><option value="generic">Other site</option>
          </select>
        </label>
        <div className="muted">Open AI tabs: {tabs.length ? tabs.map((t) => t.provider).join(', ') : 'none'}. Switching providers keeps the analysis state; it continues from the last checkpoint.</div>
        {draft.provider === 'generic' && (
          <label className="field">Site (https URL)<input value={draft.genericSite} onChange={(e) => setDraft({ ...draft, genericSite: e.target.value })} onBlur={async () => {
            try { const origin = `${new URL(draft.genericSite).origin}/*`; const ok = await chrome.permissions.request({ origins: [origin] }); if (!ok) throw new Error('Permission for that site was not granted.'); await save({ genericSite: draft.genericSite }); } catch (e) { setError(e); }
          }} placeholder="https://chat.example.com" /></label>
        )}
        <div className="row"><Action onClick={async () => setCheck(await cmd('checkProvider'))}>Check provider</Action></div>
        {check && (check.ok ? <Notice kind="ok">Interface check passed for {check.provider} (adapter {check.adapterVersion}).</Notice> : <Notice kind="bad">{check.message || 'The provider page did not pass the interface check'}{check.checks && <ul>{Object.entries(check.checks).map(([k, v]) => <li key={k}>{k}: {v ? 'ok' : <b>FAILED</b>}</li>)}</ul>}<div className="muted">If a check fails, the AI website may have changed. The extension will not send anything until it passes.</div></Notice>)}
        <ErrorBox error={error} />
      </Card>
      <Card title="Limits">
        <p className="muted">Providers differ and change their limits, so none are assumed. Set what works for your account. Large analyses are split into batches automatically.</p>
        {Object.entries(LABELS).map(([k, label]) => (
          <label className="field" key={k}>{label}<input type="number" min="1" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} onBlur={() => Number(draft[k]) > 0 && save({ [k]: Number(draft[k]) })} /></label>
        ))}
      </Card>
      <Card title="Data">
        <p className="muted">Clears analyses, jobs and results stored in this browser. Your VS Code <code>.ai-project</code> is not affected.</p>
        <Action onClick={() => cmd('clearData')}>Clear stored data</Action>
      </Card>
    </>
  );
}
