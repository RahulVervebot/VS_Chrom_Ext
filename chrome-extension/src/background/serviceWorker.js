// MV3 service worker: owns the VS Code connection and the orchestrator. UI (side panel) talks to it with runtime messages
// and observes state through chrome.storage.
import { VsCodeBridge, parsePairingCode } from '../bridge/vscodeBridge.js';
import { Orchestrator } from './orchestrator.js';
import { findTab, ensureContent, selfTest, runPrompt, listProviderTabs } from './providerTabs.js';
import { getSettings, saveSettings } from '../utils/settings.js';
import { storage } from '../utils/storage.js';
import { knowledgeStore } from '../knowledge/knowledgeStore.js';
import { log } from '../utils/logger.js';

let bridge;
let orchestrator;

const publish = () => storage.set('tick', Date.now()); // storage.onChanged in the panel refreshes on this

async function setBridgeStatus(s) { await storage.set('bridge', { state: s.state, error: s.error || null, session: s.session ? { sessionId: s.session.sessionId, projectId: s.session.projectId, projectName: s.session.projectName || null } : null, at: Date.now() }); publish(); }

// The AI runner used by the orchestrator: picks the provider tab, verifies the interface, runs the prompt.
const ai = {
  current: null,
  async provider() { return this.current; },
  cancel() { if (runPrompt.cancel) runPrompt.cancel(); },
  async run(prompt, { timeoutMs, stableMs, onProgress }) {
    const s = await getSettings();
    const tab = await findTab(s.provider, s.genericSite);
    if (!tab) return { ok: false, code: 'NO_TAB', message: s.provider === 'auto' ? 'No supported AI tab is open. Open ChatGPT, Claude or Gemini, log in, and retry.' : `No ${s.provider} tab is open. Open it, log in, and retry.` };
    this.current = tab.provider;
    if (!(await ensureContent(tab.tabId, tab.provider))) return { ok: false, code: 'UI_CHANGED', message: `The extension could not attach to the ${tab.provider} tab. Reload the tab and retry.`, provider: tab.provider };
    const res = await runPrompt(tab.tabId, prompt, { timeoutMs, stableMs, onProgress });
    return { ...res, provider: tab.provider };
  },
};

async function init() {
  bridge = new VsCodeBridge({ onStatus: setBridgeStatus });
  orchestrator = new Orchestrator({ bridge, ai, onChange: publish });
  await storage.set('status', {});
  await bridge.loadCreds();
  if (bridge.creds) bridge.connect().catch((e) => log('info', 'BRIDGE', `not connected yet: ${e.message}`));
}
const ready = init();

chrome.runtime.onInstalled.addListener(() => { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}); });

// Keeps the connection healthy: wakes the worker and reconnects if a paired VS Code is expected.
chrome.alarms.create('aipi-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'aipi-keepalive') return;
  await ready;
  if (bridge.creds && bridge.state === 'DISCONNECTED' && bridge.wantConnected) bridge.connect().catch(() => {});
});

const COMMANDS = {
  async pair({ token, port }) {
    await ready;
    const fallback = port === undefined || port === '' ? (await getSettings()).bridgePort : Number(port);
    const parsed = parsePairingCode(token, fallback);
    if (!parsed.token) throw new Error('Enter the pairing code shown in VS Code.');
    if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) throw new Error('Enter the VS Code bridge port as a number between 1 and 65535 (default 47821), or paste the full code that includes it, like 47821-ABCDEFGH1234.');
    await bridge.pair({ port: parsed.port, token: parsed.token });
    return { ok: true };
  },
  async connect() { await ready; await bridge.connect(); return { ok: true }; },
  async disconnect({ forget } = {}) { await ready; if (forget) await bridge.forget(); else bridge.disconnect(); return { ok: true }; },
  async confirmAnalysis({ id }) { await ready; await orchestrator.confirmAnalysis(id); return { ok: true }; },
  async declineAnalysis({ id }) { await ready; await orchestrator.declineAnalysis(id); return { ok: true }; },
  async pause({ id }) { await ready; await orchestrator.panelControl('pause', id); return { ok: true }; },
  async resume({ id }) { await ready; await orchestrator.panelControl('resume', id); return { ok: true }; },
  async stop({ id }) { await ready; await orchestrator.panelControl('stop', id); return { ok: true }; },
  async retryBatch({ id, batchId }) { await ready; await orchestrator.retryBatch(id, batchId); return { ok: true }; },
  async skipBatch({ id, batchId }) { await ready; await orchestrator.skipBatch(id, batchId); return { ok: true }; },
  async finalize({ id }) { await ready; await orchestrator.finalize(id); return { ok: true }; },
  async runJob({ id }) { await ready; orchestrator.runJob(id).catch((e) => orchestrator.setJob(id, { status: 'FAILED', error: e.message })); return { ok: true }; },
  async dismissJob({ id }) { await ready; await orchestrator.dismissJob(id); return { ok: true }; },
  async saveSettings({ patch }) { await saveSettings(patch); publish(); return { ok: true }; },
  async listTabs() { const s = await getSettings(); return listProviderTabs(s.genericSite); },
  async checkProvider() {
    const s = await getSettings();
    const tab = await findTab(s.provider, s.genericSite);
    if (!tab) return { ok: false, message: 'No supported AI tab found. Open ChatGPT, Claude or Gemini and log in.' };
    if (!(await ensureContent(tab.tabId, tab.provider))) return { ok: false, tab, message: 'Could not attach to the tab. Reload it and try again.' };
    return { tab, ...(await selfTest(tab.tabId)) };
  },
  async clearData() { await storage.remove('analyses'); await storage.remove('jobs'); await storage.remove('results'); await storage.remove('batchPayloads'); await storage.remove('outbox'); await storage.remove('notices'); publish(); return { ok: true }; },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'sw') return false;
  const fn = COMMANDS[msg.cmd];
  if (!fn) { sendResponse({ ok: false, error: `Unknown command ${msg.cmd}` }); return false; }
  fn(msg.args || {}).then((r) => sendResponse({ ok: true, result: r }), (e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true; // async response
});

// Test hook (used by the end-to-end suite to read live state).
self.__aipi = { get bridge() { return bridge; }, get orchestrator() { return orchestrator; }, knowledgeStore };
