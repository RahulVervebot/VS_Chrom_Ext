const puppeteer = require('puppeteer-core');
const { start } = require('./harness');
const path = require('path');
const OUT = process.argv[2] || '/tmp/ui-shots2';
require('fs').mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const h = await start();
  const browser = await puppeteer.launch({ executablePath: require('./chromePath'), headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1200, height: 1000 });
  await page.goto(h.url);
  await page.waitForSelector('nav');
  const nav = async (label) => { await page.evaluate((l) => [...document.querySelectorAll('.nav-item')].find((b) => b.textContent.startsWith(l)).click(), label); await sleep(400); };
  const clickText = async (sel, text) => { await page.evaluate((s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t)).click(), sel, text); await sleep(400); };
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

  await nav('Workflows'); await clickText('.link-btn', 'POST /api/orders');
  await clickText('.step-head', 'Order · create'); await shot('workflow-detail');

  await nav('Database'); await clickText('.link-btn', 'Order'); await shot('database-detail');

  await nav('Dependencies');
  await page.type('input[aria-label="File"]', 'server/services/orderService.js'); await sleep(500);
  await page.select('select[aria-label="Direction"]', 'dependents'); await sleep(500); await shot('dependencies-graph');

  await nav('Files');
  await page.type('input[aria-label="Filter files"]', 'order'); await sleep(500);
  await page.click('input[aria-label="Select server/controllers/orderController.js"]'); await sleep(300);
  await clickText('.tree-name', 'orderController.js'); await sleep(400); await shot('files-detail');

  await nav('Queue');
  await clickText('button', 'Preview what will be sent'); await sleep(1200); await shot('queue-preview');

  await nav('Documentation'); await clickText('.link-btn', 'workflows/'); await sleep(500); await shot('documentation');

  await nav('Connection'); await clickText('button', 'Pair Chrome'); await sleep(600); await shot('connection-pairing');

  // selection persisted in the (real) rpc state
  const sel = h.pm && (await page.evaluate(() => fetch('/rpc', { method: 'POST', body: JSON.stringify({ method: 'getSelection', params: {} }) }).then((r) => r.json())));
  console.log('selection after UI click:', JSON.stringify(sel.result.selection.files));

  // compact (sidebar) layout
  await page.setViewport({ width: 380, height: 800 });
  await page.goto(h.url + '?compact=1'); await page.waitForSelector('nav select'); await sleep(500); await shot('compact-dashboard');
  console.log('errors:', errors);
  await browser.close(); await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
