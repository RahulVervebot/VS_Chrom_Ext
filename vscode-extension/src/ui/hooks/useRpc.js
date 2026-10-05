// Bridge to the extension host. Requests are correlated by id; host events are fanned out to subscribers.
let api = null;
try { api = window.acquireVsCodeApi ? window.acquireVsCodeApi() : null; } catch { api = null; }

let nextId = 1;
const pending = new Map();
const listeners = new Map();

window.addEventListener('message', (e) => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'response') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) { const err = new Error(m.error.message); err.code = m.error.code; p.reject(err); } else p.resolve(m.result);
  } else if (m.type === 'event') {
    (listeners.get(m.name) || []).forEach((fn) => fn(m.data));
  }
});

export function rpc(method, params) {
  return new Promise((resolve, reject) => {
    if (!api) { reject(new Error('Not running inside VS Code.')); return; }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    api.postMessage({ type: 'request', id, method, params });
  });
}

export function onEvent(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name).delete(fn);
}

export function signalReady() { if (api) api.postMessage({ type: 'ready' }); }
