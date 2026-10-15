// Finds the AI website tab to use, makes sure the content script is alive, and runs prompts through it.
const HOSTS = {
  chatgpt: ['chatgpt.com', 'chat.openai.com'],
  claude: ['claude.ai'],
  gemini: ['gemini.google.com'],
};
const ORDER = ['chatgpt', 'claude', 'gemini'];

export function providerOfUrl(url, genericSite) {
  let h;
  try { h = new URL(url).hostname; } catch { return null; }
  for (const [p, hosts] of Object.entries(HOSTS)) if (hosts.some((x) => h === x || h.endsWith(`.${x}`))) return p;
  if (genericSite) { try { if (new URL(genericSite).hostname === h) return 'generic'; } catch { /* invalid setting */ } }
  return null;
}

export async function findTab(provider, genericSite) {
  const tabs = await chrome.tabs.query({});
  const withP = tabs.filter((t) => t.url).map((t) => ({ tab: t, provider: providerOfUrl(t.url, genericSite) })).filter((x) => x.provider);
  if (provider && provider !== 'auto') { const hit = withP.find((x) => x.provider === provider) || null; return hit && { tabId: hit.tab.id, provider: hit.provider, url: hit.tab.url, title: hit.tab.title }; }
  const active = withP.find((x) => x.tab.active && x.tab.currentWindow) || withP.find((x) => x.tab.active);
  const pick = active || ORDER.map((p) => withP.find((x) => x.provider === p)).find(Boolean) || withP[0];
  return pick ? { tabId: pick.tab.id, provider: pick.provider, url: pick.tab.url, title: pick.tab.title } : null;
}

export async function listProviderTabs(genericSite) {
  const tabs = await chrome.tabs.query({});
  return tabs.filter((t) => t.url).map((t) => ({ tabId: t.id, provider: providerOfUrl(t.url, genericSite), url: t.url, title: t.title, active: t.active })).filter((x) => x.provider);
}

async function ping(tabId) {
  try { return await chrome.tabs.sendMessage(tabId, { target: 'content', type: 'PING' }); } catch { return null; }
}

// Tabs opened before the extension was installed don't have the content script yet: inject it.
// (Also after the extension was reloaded: the copy already in the tab is then cut off and a fresh one is injected.)
export async function ensureContent(tabId, provider) {
  if (await ping(tabId)) return true;
  const file = `dist/content-${provider}.js`;
  try { await chrome.scripting.executeScript({ target: { tabId }, files: [file] }); } catch (e) { ensureContent.lastError = e.message; return false; }
  for (let i = 0; i < 15; i++) { await new Promise((r) => setTimeout(r, 200)); if (await ping(tabId)) return true; } // a busy page can take a moment
  ensureContent.lastError = 'the page did not answer after the helper was loaded';
  return false;
}

export async function selfTest(tabId) {
  try { return await chrome.tabs.sendMessage(tabId, { target: 'content', type: 'SELF_TEST' }); } catch (e) { return { ok: false, error: e.message }; }
}

// Runs one prompt in the tab. Resolves { ok, text, codeBlocks, model } or { ok:false, code, message }.
// Chrome stops an idle extension worker after ~30 s. Typing a long message or waiting for a model that "thinks" silently can take longer,
// and a stopped worker loses the answer: the run then hangs. While a prompt is running, the worker therefore keeps itself awake (an
// extension API call every 20 s) and the content script sends a heartbeat. A watchdog turns a lost answer into an error instead of a hang.
const MAX_TIMER_MS = 2147483647;

export function runPrompt(tabId, prompt, { timeoutMs = 240000, stableMs, onProgress, graceMs = 180000 }) {
  return new Promise((resolve) => {
    let port;
    try { port = chrome.tabs.connect(tabId, { name: 'aipi-run' }); } catch (e) { resolve({ ok: false, code: 'TAB_CLOSED', message: 'The AI tab is not reachable.' }); return; }
    const id = Math.random().toString(36).slice(2);
    let done = false;
    const awake = setInterval(() => { try { chrome.runtime.getPlatformInfo(() => {}); } catch { /* not available */ } }, 20000);
    // setTimeout fires at once for delays above 2^31-1 ms (~24.8 days): clamp, or a huge timeout setting would time out immediately
    const limit = Math.min(Math.max(1000, Number(timeoutMs) || 240000) + graceMs, MAX_TIMER_MS);
    const watchdog = setTimeout(() => finish({ ok: false, code: 'TIMEOUT', message: `No result came back from the AI tab within ${Math.round(limit / 60000)} min (the message may not have been sent, or the tab stopped responding). Retry continues from this batch.` }), limit);
    const finish = (r) => { if (!done) { done = true; clearInterval(awake); clearTimeout(watchdog); try { port.disconnect(); } catch { /* ignore */ } resolve(r); } };
    port.onMessage.addListener((m) => { if (m.id !== id) return; if (m.type === 'PROGRESS' && onProgress) onProgress(m.stage === 'ALIVE' ? { detail: m.detail || null } : m); if (m.type === 'RESULT') finish(m); });
    port.onDisconnect.addListener(() => finish({ ok: false, code: 'TAB_CLOSED', message: 'The AI tab was closed or reloaded during the request.' }));
    port.postMessage({ type: 'RUN', id, prompt, timeoutMs, stableMs });
    runPrompt.cancel = () => { try { port.postMessage({ type: 'CANCEL' }); } catch { /* ignore */ } };
    runPrompt.acceptNow = () => { if (done) return false; try { port.postMessage({ type: 'ACCEPT_NOW' }); return true; } catch { return false; } };
  });
}
