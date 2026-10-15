// Runs inside the AI website tab. Talks to the service worker over a long-lived port so multi-minute AI answers survive.
// It only ever does what the service worker asks for, through the adapter; it never reads the page for anything else.
export function installContentRuntime(adapter) {
  // Install once per LIVE extension. After the extension is reloaded or updated, the copy already in this tab is orphaned (its
  // chrome.runtime is gone) but its flag remains: checking the flag alone would block the new copy and the tab could not be reached.
  if (window.__aipiAlive && window.__aipiAlive()) return;
  const myRuntime = chrome.runtime; // this copy's own connection to the extension
  window.__aipiAlive = () => { try { return !!(myRuntime && myRuntime.id); } catch { return false; } };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== 'content') return false;
    if (msg.type === 'PING') { sendResponse({ ok: true, provider: adapter.id, adapterVersion: adapter.adapterVersion, ready: adapter.detect() }); return false; }
    if (msg.type === 'DIAGNOSE') { try { sendResponse({ ok: true, text: adapter.pageDiagnostics() }); } catch (e) { sendResponse({ ok: false, text: `diagnostics failed: ${e.message}` }); } return false; }
    if (msg.type === 'SELF_TEST') { sendResponse({ ...adapter.selfTest(), capabilities: adapter.getCapabilities(), extra: adapter.describe ? adapter.describe() : undefined }); return false; }
    return false;
  });

  chrome.runtime.onConnect.addListener((port) => {
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
  });
}
