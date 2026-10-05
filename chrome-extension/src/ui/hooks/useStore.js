import { useEffect, useState, useCallback } from 'react';
import { DEFAULT_SETTINGS } from '../../utils/settings.js';

const KEYS = ['bridge', 'status', 'analyses', 'projects', 'jobs', 'results', 'notices', 'settings', 'pairing', 'outbox', 'log'];

// The panel is a pure view of chrome.storage.local (written by the service worker) plus commands sent to the worker.
export function useStore() {
  const [state, setState] = useState(null);
  const load = useCallback(async () => {
    const all = await chrome.storage.local.get(KEYS);
    setState({
      bridge: all.bridge || { state: 'DISCONNECTED', session: null },
      status: all.status || {},
      analyses: all.analyses || {},
      projects: all.projects || {},
      jobs: all.jobs || [],
      results: all.results || [],
      notices: all.notices || [],
      settings: { ...DEFAULT_SETTINGS, ...(all.settings || {}) },
      paired: !!all.pairing,
      pairing: all.pairing ? { port: all.pairing.port } : null,
      outbox: (all.outbox || []).length,
      log: all.log || [],
    });
  }, []);
  useEffect(() => {
    load();
    const fn = (_c, area) => { if (area === 'local') load(); };
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  }, [load]);
  return { state, reload: load };
}

export function cmd(name, args) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ target: 'sw', cmd: name, args }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res || !res.ok) return reject(new Error((res && res.error) || 'Command failed'));
      resolve(res.result);
    });
  });
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
