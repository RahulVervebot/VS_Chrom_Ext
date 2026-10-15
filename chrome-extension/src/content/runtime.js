// Runs inside the AI website tab. Talks to the service worker over a long-lived port so multi-minute AI answers survive.
// It only ever does what the service worker asks for, through the adapter; it never reads the page for anything else.
export function installContentRuntime(adapter) {
  // Always install, replacing a previous copy instead of deferring to it. After the extension is reloaded, a copy already in the tab
  // can look alive while its listeners no longer receive anything; skipping installation then left the tab unreachable. Removing the
  // previous copy's listeners first also guarantees a live copy never ends up with two sets of listeners (no request handled twice).
  const prev = window.__aipiHandlers;
  if (prev) {
    try { chrome.runtime.onMessage.removeListener(prev.onMessage); } catch { /* belonged to a previous extension instance */ }
    try { chrome.runtime.onConnect.removeListener(prev.onConnect); } catch { /* idem */ }
  }

  const onMessage = (msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'content') return false;
    if (msg.type === 'PING') { sendResponse({ ok: true, provider: adapter.id, adapterVersion: adapter.adapterVersion, ready: adapter.detect() }); return false; }
    if (msg.type === 'DIAGNOSE') { try { sendResponse({ ok: true, text: adapter.pageDiagnostics() }); } catch (e) { sendResponse({ ok: false, text: `diagnostics failed: ${e.message}` }); } return false; }
    if (msg.type === 'SELF_TEST') { sendResponse({ ...adapter.selfTest(), capabilities: adapter.getCapabilities(), extra: adapter.describe ? adapter.describe() : undefined }); return false; }
    return false;
  };

  const onConnect = (port) => {
    if (port.name !== 'aipi-run') return;
    // State belongs to THIS port only. (A shared flag let the closing of the previous part's port cancel the next part.)
    const run = { cancelled: false, acceptNow: false, beat: null };
    port.onDisconnect.addListener(() => { run.cancelled = true; clearInterval(run.beat); }); // the worker went away: do not send anything on its behalf
    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'CANCEL') { run.cancelled = true; return; }
      if (msg.type === 'ACCEPT_NOW') { run.acceptNow = true; return; }
      if (msg.type !== 'RUN') return;
      // heartbeat: keeps the extension worker awake and tells the panel what the page looks like while it waits
      run.beat = setInterval(() => { try { port.postMessage({ type: 'PROGRESS', id: msg.id, stage: 'ALIVE', detail: adapter.liveText ? adapter.liveText() : null }); } catch { /* port closed */ } }, 5000);
      try {
        const res = await adapter.run(msg.prompt, {
          timeoutMs: msg.timeoutMs, stableMs: msg.stableMs, isCancelled: () => run.cancelled, acceptNow: () => run.acceptNow,
          onProgress: (p) => { try { port.postMessage({ type: 'PROGRESS', id: msg.id, ...p }); } catch { /* port closed */ } },
        });
        try { port.postMessage({ type: 'RESULT', id: msg.id, ...res }); } catch { /* the worker is gone; it retries the batch when it restarts */ }
      } catch (err) {
        try { port.postMessage({ type: 'RESULT', id: msg.id, ok: false, code: 'ADAPTER_ERROR', message: String(err && err.message ? err.message : err) }); } catch { /* port closed */ }
      } finally { clearInterval(run.beat); }
    });
  };

  chrome.runtime.onMessage.addListener(onMessage);
  chrome.runtime.onConnect.addListener(onConnect);
  window.__aipiHandlers = { onMessage, onConnect };
}
