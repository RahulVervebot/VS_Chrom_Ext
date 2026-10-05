// Runs inside the AI website tab. Talks to the service worker over a long-lived port so multi-minute AI answers survive.
// It only ever does what the service worker asks for, through the adapter; it never reads the page for anything else.
export function installContentRuntime(adapter) {
  if (window.__aipiInstalled) return;
  window.__aipiInstalled = true;
  let cancelled = false;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'content') return false;
    if (msg.type === 'PING') { sendResponse({ ok: true, provider: adapter.id, adapterVersion: adapter.adapterVersion, ready: adapter.detect() }); return false; }
    if (msg.type === 'SELF_TEST') { sendResponse({ ...adapter.selfTest(), capabilities: adapter.getCapabilities(), extra: adapter.describe ? adapter.describe() : undefined }); return false; }
    return false;
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'aipi-run') return;
    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'CANCEL') { cancelled = true; return; }
      if (msg.type !== 'RUN') return;
      cancelled = false;
      try {
        const res = await adapter.run(msg.prompt, {
          timeoutMs: msg.timeoutMs, stableMs: msg.stableMs, isCancelled: () => cancelled,
          onProgress: (p) => { try { port.postMessage({ type: 'PROGRESS', id: msg.id, ...p }); } catch { /* port closed */ } },
        });
        port.postMessage({ type: 'RESULT', id: msg.id, ...res });
      } catch (err) {
        port.postMessage({ type: 'RESULT', id: msg.id, ok: false, code: 'ADAPTER_ERROR', message: String(err && err.message ? err.message : err) });
      }
    });
  });
}
