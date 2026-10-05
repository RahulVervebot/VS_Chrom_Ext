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
export async function ensureContent(tabId, provider) {
  if (await ping(tabId)) return true;
  const file = `dist/content-${provider}.js`;
  try { await chrome.scripting.executeScript({ target: { tabId }, files: [file] }); } catch (e) { return false; }
  await new Promise((r) => setTimeout(r, 300));
  return !!(await ping(tabId));
}

export async function selfTest(tabId) {
  try { return await chrome.tabs.sendMessage(tabId, { target: 'content', type: 'SELF_TEST' }); } catch (e) { return { ok: false, error: e.message }; }
}

// Runs one prompt in the tab. Resolves { ok, text, codeBlocks, model } or { ok:false, code, message }.
export function runPrompt(tabId, prompt, { timeoutMs, stableMs, onProgress }) {
  return new Promise((resolve) => {
    let port;
    try { port = chrome.tabs.connect(tabId, { name: 'aipi-run' }); } catch (e) { resolve({ ok: false, code: 'TAB_CLOSED', message: 'The AI tab is not reachable.' }); return; }
    const id = Math.random().toString(36).slice(2);
    let done = false;
    const finish = (r) => { if (!done) { done = true; try { port.disconnect(); } catch { /* ignore */ } resolve(r); } };
    port.onMessage.addListener((m) => { if (m.id !== id) return; if (m.type === 'PROGRESS') onProgress && onProgress(m); if (m.type === 'RESULT') finish(m); });
    port.onDisconnect.addListener(() => finish({ ok: false, code: 'TAB_CLOSED', message: 'The AI tab was closed or reloaded during the request.' }));
    port.postMessage({ type: 'RUN', id, prompt, timeoutMs, stableMs });
    runPrompt.cancel = () => { try { port.postMessage({ type: 'CANCEL' }); } catch { /* ignore */ } };
  });
}
