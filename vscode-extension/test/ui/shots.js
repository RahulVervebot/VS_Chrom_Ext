const puppeteer = require('puppeteer-core');
const { start } = require('./harness');
const path = require('path');
const OUT = process.argv[2] || '/tmp/ui-shots';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const h = await start();
  const browser = await puppeteer.launch({ executablePath: require('./chromePath'), headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1200, height: 900 });
  await page.goto(h.url);
  await page.waitForSelector('nav');
  const pages = ['dashboard', 'project', 'scan', 'files', 'workflows', 'database', 'features', 'architecture', 'dependencies', 'documentation', 'connection', 'active', 'queue', 'history', 'compare', 'generate', 'changes', 'settings'];
  const labels = { dashboard: 'Dashboard', project: 'Project', scan: 'Scan', files: 'Files', workflows: 'Workflows', database: 'Database', features: 'Features', architecture: 'Architecture', dependencies: 'Dependencies', documentation: 'Documentation', connection: 'Connection', active: 'Active Analysis', queue: 'Queue', history: 'History', compare: 'Compare', generate: 'Generate', changes: 'Changes', settings: 'Settings' };
  for (const p of pages) {
    await page.evaluate((label) => { [...document.querySelectorAll('.nav-item')].find((b) => b.textContent.startsWith(label)).click(); }, labels[p]);
    await new Promise((r) => setTimeout(r, 350));
    await page.screenshot({ path: path.join(OUT, `${p}.png`) });
  }
  console.log('errors:', errors);
  await browser.close(); await h.close();
})().catch((e) => { console.error(e); process.exit(1); });
