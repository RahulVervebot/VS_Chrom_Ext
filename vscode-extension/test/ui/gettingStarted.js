// Clicks through the sidebar "Getting started" checklist (compact layout) against the real RPC and ProjectManager.
const puppeteer = require('puppeteer-core');
const assert = require('assert');
const path = require('path');
const { start } = require('./harness');
const OUT = process.argv[2] || '/tmp/ui-gs';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const h = await start({ fresh: true });
  const browser = await puppeteer.launch({ executablePath: require('./chromePath'), headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 380, height: 900 });
  await page.goto(h.url + '?compact=1');
  await page.waitForSelector('.gs');
  const click = async (text) => { await page.waitForFunction((t) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === t && !b.disabled), { timeout: 8000 }, text); await page.evaluate((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t && !b.disabled).click(), text); await sleep(700); };
  const marks = () => page.evaluate(() => [...document.querySelectorAll('.gs-step')].map((s) => s.classList.contains('done')));
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

  assert.deepStrictEqual(await marks(), [false, false, false, false, false]);
  await shot('1-fresh');
  await click('Set up project');
  await page.waitForFunction(() => document.body.innerText.includes('Scan now'), { timeout: 8000 });
  assert.ok(require('fs').existsSync(path.join(h.root, '.ai-project/project.json')), '.ai-project created');
  await click('Scan now');
  await page.waitForFunction(() => document.querySelectorAll('.gs-step.done').length >= 2, { timeout: 15000 });
  await click('Entire project');
  await page.waitForFunction(() => document.body.innerText.includes('Selected: entire project'), { timeout: 8000 });
  assert.strictEqual(h.selection.get().project, true);
  await click('Show pairing code');
  await page.waitForSelector('.code-big', { timeout: 8000 });
  const code = await page.$eval('.code-big', (e) => e.textContent);
  assert.match(code, /^\d{2,5}-[A-Z0-9]{12}$/);
  assert.strictEqual(h.pm.bridge.getStatus().state, 'PAIRING');
  assert.deepStrictEqual((await marks()).slice(0, 3), [true, true, true]);
  await shot('2-ready-to-pair');
  await click('Clear'); await sleep(300);
  assert.strictEqual(h.selection.isEmpty(), true);
  console.log('getting-started flow ok; code shown:', code, 'errors:', errors);
  await browser.close(); await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
