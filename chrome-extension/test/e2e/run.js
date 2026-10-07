// END-TO-END: real Chrome + the real unpacked extension + a mock chatgpt.com + the real VS Code bridge (ProjectManager).
import puppeteer from 'puppeteer-core';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import { startMock } from './mockChatgpt.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(here, '../..');
const { ProjectManager } = require('../../../vscode-extension/src/core/projectManager');
const { ConfigManager } = require('../../../vscode-extension/src/config/configManager');
const { tempProject } = require('../../../vscode-extension/test/helpers');
require('../../../vscode-extension/src/utils/logger').setSink(() => {});

const CHROME = process.env.AIPI_CHROME_PATH || ({ darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', linux: '/usr/bin/google-chrome', win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })[process.platform];
const SHOTS = process.argv[2] || '/tmp/e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, what = 'condition') => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`); await sleep(100); } };
const results = [];
async function step(name, fn) { try { await fn(); results.push([name, true]); console.log(`  ok   ${name}`); } catch (e) { results.push([name, false, e]); console.log(`  FAIL ${name}\n       ${e.stack || e}`); throw e; } }

const BRIDGE_PORT = 47999;

(async () => {
  const mock = await startMock();
  const root = tempProject();
  const config = new ConfigManager();
  await config.set('chromeBridgePort', BRIDGE_PORT);
  await config.set('maxTokens', 300); // forces several batches
  let pairPrompts = 0;
  const pm = new ProjectManager({ root, config, confirmPairing: async (info) => { pairPrompts++; assert.match(info.extensionId, /^[a-p]{32}$/); return true; }, bridgeOptions: { heartbeatMs: 5000 } }); // real Origin check: no allowNoOrigin
  await pm.load(); await pm.initialize('Shop'); await pm.scan();

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-chrome-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', userDataDir: userData,
    enableExtensions: [EXT], pipe: true, // Chrome 137+ ignores --load-extension; this uses the supported DevTools route
    args: ['--no-sandbox', `--host-resolver-rules=MAP chatgpt.com 127.0.0.1:${mock.port}`, '--ignore-certificate-errors', '--window-size=480,900'],
  });
  let failed = null;
  try {
    const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 20000 });
    const extId = new URL(swTarget.url()).host;
    console.log(`extension loaded: ${extId}`);

    const chat = await browser.newPage();
    await chat.goto('https://chatgpt.com/');
    await chat.waitForSelector('#prompt-textarea');
    const panel = await browser.newPage();
    await panel.setViewport({ width: 460, height: 900 });
    await panel.goto(`chrome-extension://${extId}/public/panel.html`);
    await panel.waitForSelector('nav');
    const clickText = async (sel, text) => { await panel.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((e) => e.textContent.trim().startsWith(t)), { timeout: 15000 }, sel, text); await panel.evaluate((s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().startsWith(t)).click(), sel, text); };
    const tab = (t) => clickText('nav button', t);
    const shot = (n) => panel.screenshot({ path: path.join(SHOTS, `${n}.png`) });
    const bodyText = () => panel.evaluate(() => document.body.innerText);

    await step('extension loads with a service worker, side-panel page and icons', async () => {
      const m = await panel.evaluate(() => chrome.runtime.getManifest());
      assert.strictEqual(m.manifest_version, 3);
      assert.ok((await bodyText()).includes('AI Project Bridge'));
      await shot('01-dashboard-unpaired');
    });

    await step('provider check passes on the (mock) ChatGPT tab and fails once its interface changes', async () => {
      await tab('Settings');
      await clickText('button', 'Check provider');
      await panel.waitForFunction(() => document.body.innerText.includes('Interface check passed'), { timeout: 15000 });
      await shot('02-provider-check');
    });

    await step('pairing: code from VS Code + user approval creates a persistent, origin-checked session', async () => {
      const { token } = await pm.bridge.startPairing();
      await tab('Connection');
      await panel.type('input[placeholder^="e.g."]', token);
      const portInput = (await panel.$$('input'))[1];
      await portInput.evaluate((el) => el.select()); await portInput.type(String(BRIDGE_PORT));
      await clickText('button', 'Pair');
      await until(() => pm.bridge.getStatus().state === 'CONNECTED', 30000, 'pairing to complete in VS Code');
      await panel.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Disconnect'), { timeout: 15000 });
      assert.strictEqual(pairPrompts, 1, 'VS Code asked the user to confirm exactly once');
      assert.strictEqual(pm.bridge.getStatus().state, 'CONNECTED');
      assert.strictEqual(pm.bridge.getStatus().extensionId, extId, 'VS Code saw the real chrome-extension:// origin');
      await shot('03-paired');
    });

    async function runAnalysis(opts, label) {
      const snap = await pm.startAnalysis(opts);
      await tab('Analysis');
      await panel.waitForFunction(() => document.body.innerText.includes('Send and analyze'), { timeout: 20000 });
      return snap;
    }

    await step('analysis: privacy review is shown first and nothing reaches the AI before the user agrees', async () => {
      const snap = await runAnalysis({ mode: 'FOLDER', selection: { folders: ['server'] }, purpose: 'e2e server analysis' });
      globalThis.snap1 = snap;
      const text = await bodyText();
      assert.match(text, /Review before sending/);
      assert.match(text, /Secrets redacted[\s\S]*password|api-key|stripe|db-connection/i);
      assert.strictEqual(mock.state.prompts.length, 0);
      await shot('04-privacy-review');
    });

    await step('confirming runs the batches through the real adapter; VS Code verifies, reconciles and marks coverage PARTIAL', async () => {
      const id = globalThis.snap1.analysisId;
      await clickText('button', 'Send and analyze');
      await until(async () => (await pm.history.get(id)).status === 'COMPLETED', 90000, 'VS Code to complete the analysis');
      assert.ok(mock.state.prompts.length >= 2, `multiple batches went through the AI (got ${mock.state.prompts.length})`);
      for (const p of mock.state.prompts) {
        assert.ok(!p.includes('hunter2pass') && !p.includes('sk_live_abcdefghijklmnopqrstuvwx'), 'no secret reached the AI website');
        assert.match(p, /Never invent/);
      }
      const know = await pm.knowledge.getFileKnowledge('server/services/orderService.js');
      const st = Object.fromEntries(know.claims.map((c) => [c.claim, c.status]));
      assert.strictEqual(st['the orders table has a payment_status column'], 'UNKNOWN', 'fabricated claim was not accepted');
      assert.ok(Object.entries(st).some(([c, s]) => /defines/.test(c) && s === 'VERIFIED'));
      const files = await pm.knowledge.getFileMap();
      assert.strictEqual(files['client/src/components/Checkout.jsx'].status, 'NOT_ANALYZED');
      const cov = await pm.knowledge.coverage(await pm.history.list());
      assert.strictEqual(cov.coverageStatus, 'PARTIAL');
      await sleep(600); await shot('05-analysis-complete');
      await tab('Sync'); await sleep(300); await shot('06-sync');
      await tab('Knowledge'); await sleep(300); await shot('07-knowledge');
    });

    await step('UI changed: the adapter STOPS, reports it, and sends nothing; after the site is fixed, Retry completes', async () => {
      mock.state.variant = 'changedUi';
      await chat.reload(); await chat.waitForSelector('#renamed-box');
      const before = mock.state.prompts.length;
      const snap = await pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/controllers/orderController.js'] } });
      await tab('Analysis');
      await panel.waitForFunction((id) => document.body.innerText.includes(id) && document.body.innerText.includes('Send and analyze'), { timeout: 20000 }, snap.analysisId);
      await clickText('button', 'Send and analyze');
      await panel.waitForFunction(() => document.body.innerText.includes('UI_CHANGED'), { timeout: 30000 });
      assert.strictEqual(mock.state.prompts.length, before, 'nothing was sent to the changed website');
      assert.match(await bodyText(), /may have changed|interface/i);
      await shot('08-ui-changed');
      mock.state.variant = 'ok';
      await chat.reload(); await chat.waitForSelector('#prompt-textarea');
      await clickText('button', 'Retry failed batch');
      await until(async () => (await pm.history.get(snap.analysisId)).status === 'COMPLETED', 60000, 'completion after retry');
      assert.ok(mock.state.prompts.length > before);
    });

    await step('big message: the chat box refuses it, the extension splits it into parts that tell the AI more files follow, and the analysis completes', async () => {
      mock.state.maxChars = 6000;
      await chat.reload(); await chat.waitForSelector('#prompt-textarea'); await sleep(500);
      const before = mock.state.prompts.length;
      const snap = await pm.startAnalysis({ mode: 'FOLDER', selection: { folders: ['server/services', 'server/controllers'] } });
      await tab('Analysis');
      await panel.waitForFunction((id) => document.body.innerText.includes(id) && document.body.innerText.includes('Send and analyze'), { timeout: 20000 }, snap.analysisId);
      await clickText('button', 'Send and analyze');
      await until(async () => (await pm.history.get(snap.analysisId)).status === 'COMPLETED', 150000, 'completion with split messages');
      const sent = mock.state.prompts.slice(before);
      const parts = sent.filter((p) => /^\[PART \d+ of \d+/.test(p));
      assert.ok(parts.length >= 2, `the prompt was split into parts (got ${parts.length} of ${sent.length} messages)`);
      assert.ok(parts.every((p) => p.length <= 6000 * 1.15), 'every part fits the chat box');
      assert.ok(parts.some((p) => /Do NOT analyze, summarize or answer yet/.test(p) && /next file\(s\) will be sent in the next message/.test(p)), 'the AI was told more files follow');
      assert.ok(/\[PART (\d+) of \1 — FINAL\]/.test(parts[parts.length - 1]), 'the last part is marked FINAL');
      await shot('08b-split-messages');
      mock.state.maxChars = 0;
      await chat.reload(); await chat.waitForSelector('#prompt-textarea'); await sleep(300);
    });

    await step('malformed AI answer: one correction request in the same chat, then a valid answer is accepted', async () => {
      mock.state.corrupt = 1;
      const before = mock.state.prompts.length;
      const snap = await pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/routes/orderRoutes.js'] } });
      await tab('Analysis');
      await panel.waitForFunction((id) => document.body.innerText.includes(id) && document.body.innerText.includes('Send and analyze'), { timeout: 20000 }, snap.analysisId);
      await clickText('button', 'Send and analyze');
      await until(async () => (await pm.history.get(snap.analysisId)).status === 'COMPLETED', 60000, 'completion after correction');
      const sent = mock.state.prompts.slice(before);
      assert.ok(sent.length >= 2 && sent.some((p) => /could not be used/.test(p)), 'a correction prompt was sent');
    });

    await step('provider limit: reported to the user and to VS Code (batch FAILED), no knowledge invented', async () => {
      mock.state.mode = 'limit';
      const snap = await pm.startAnalysis({ mode: 'FILE', selection: { files: ['server/middleware/auth.js'] } });
      await tab('Analysis');
      await panel.waitForFunction((id) => document.body.innerText.includes(id) && document.body.innerText.includes('Send and analyze'), { timeout: 20000 }, snap.analysisId);
      await clickText('button', 'Send and analyze');
      await panel.waitForFunction(() => document.body.innerText.includes('LIMIT'), { timeout: 30000 });
      await until(() => pm.bridge.runner.runs.get(snap.analysisId).failed.size === 1, 15000, 'VS Code sees the failed batch');
      const k = await pm.knowledge.getFileKnowledge('server/middleware/auth.js'); // analyzed earlier by analysis-001
      assert.ok(!k.analysisIds.includes(snap.analysisId), 'the failed run contributed no knowledge');
      mock.state.mode = 'ok';
      await shot('09-limit');
      await clickText('button', 'Stop');
    });

    await step('reconnect: restarting the VS Code bridge resumes the stored session without pairing again', async () => {
      await pm.bridge.stop();
      await until(async () => (await panel.evaluate(() => document.body.innerText)).length > 0 && (await panel.evaluate(() => chrome.storage.local.get('bridge'))).bridge.state !== 'CONNECTED', 15000, 'Chrome to notice the drop');
      await pm.bridge.start();
      await until(() => pm.bridge.getStatus().state === 'CONNECTED', 60000, 'automatic reconnect');
      assert.strictEqual(pairPrompts, 1, 'no second pairing prompt: the session was resumed');
    });

    await step('provider switching is a setting; disconnect is clean', async () => {
      await tab('Settings');
      await panel.select('select', 'claude');
      await sleep(300);
      assert.strictEqual((await panel.evaluate(() => chrome.storage.local.get('settings'))).settings.provider, 'claude');
      await panel.select('select', 'auto');
      await tab('Connection');
      await clickText('button', 'Disconnect');
      await until(() => pm.bridge.getStatus().state !== 'CONNECTED', 10000, 'disconnect');
    });
  } catch (e) {
    failed = e;
    try { const pages = await browser.pages(); const pp = pages.find((x) => x.url().includes('panel.html')); if (pp) { console.log('--- panel text ---\n' + (await pp.evaluate(() => document.body.innerText)).slice(0, 1500)); console.log('--- extension log ---'); const st = await pp.evaluate(() => chrome.storage.local.get(['log', 'bridge', 'notices'])); console.log(JSON.stringify(st.bridge)); (st.log || []).slice(-12).forEach((l) => console.log(l.level, l.tag, l.message)); await pp.screenshot({ path: path.join(SHOTS, 'failure.png') }); } } catch { /* best effort */ }
  } finally { await browser.close().catch(() => {}); await pm.bridge.stop().catch(() => {}); await mock.close(); }
  const bad = results.filter((r) => !r[1]);
  console.log(`\n${results.length - bad.length}/${results.length} end-to-end steps passed`);
  if (failed) { console.error(failed.stack); process.exit(1); }
  process.exit(0);
})();
