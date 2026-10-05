const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { scanProject } = require('../src/scanner/projectScanner');
const { analyzeProject } = require('../src/analyzer/projectAnalyzer');
const { DEFAULTS } = require('../src/config/configManager');

const ROOT = path.join(__dirname, 'fixtures/shop');
let scan;
let result;

test.before(async () => {
  scan = await scanProject(ROOT, { excludePatterns: DEFAULTS.excludePatterns.filter((p) => p !== '.env') });
  result = await analyzeProject(ROOT, scan);
});

test('scanner honours exclusions and hashes files', () => {
  assert.ok(!scan.files.some((f) => f.path.startsWith('node_modules')));
  const svc = scan.files.find((f) => f.path === 'server/services/orderService.js');
  assert.match(svc.hash, /^sha256:[0-9a-f]{64}$/);
  assert.ok(scan.packages.technologies.some((t) => t.name === 'Express'));
  assert.ok(scan.packages.technologies.some((t) => t.name === 'Stripe'));
});

test('incremental scan reuses hashes for unchanged files', async () => {
  const prev = Object.fromEntries(scan.files.map((f) => [f.path, f]));
  const again = await scanProject(ROOT, { excludePatterns: DEFAULTS.excludePatterns, previousFiles: prev });
  assert.ok(again.files.filter((f) => !f.binary).every((f) => f.reused));
  assert.deepStrictEqual(again.delta.changed, []);
});

test('environment scanner reports names only', () => {
  const names = scan.environment.variables.map((v) => v.name);
  assert.ok(names.includes('STRIPE_KEY') && names.includes('JWT_SECRET'));
  assert.ok(!JSON.stringify(scan.environment).includes('supersecretvalue123'));
});

test('symbols, imports and exports', () => {
  const fa = result.files.find((f) => f.path === 'client/src/components/Checkout.jsx');
  assert.ok(fa.symbols.some((s) => s.name === 'Checkout' && s.type === 'component'));
  assert.ok(fa.symbols.some((s) => s.name === 'handlePlaceOrder' && s.type === 'function'));
  assert.ok(fa.imports.some((i) => i.source === '../services/orderService' && i.names.some((n) => n.imported === 'placeOrder')));
});

test('dependencies and reverse dependencies resolve to project files', () => {
  const deps = result.dependencies['client/src/components/Checkout.jsx'].internal.map((d) => d.path);
  assert.deepStrictEqual(deps, ['client/src/services/orderService.js']);
  assert.ok(result.dependents['server/models/Order.js'].some((d) => d.path === 'server/services/orderService.js'));
});

test('commented-out code is ignored', () => {
  assert.ok(!result.apiLinks.concat(result.files.flatMap((f) => f.apiCalls)).some((c) => (c.url || c.path) === '/api/commented-out'));
});

test('routes resolve mounted prefixes and client calls match routes', () => {
  const post = result.apis.find((a) => a.method === 'POST');
  assert.strictEqual(post.endpoint, '/api/orders');
  assert.ok(result.apis.some((a) => a.endpoint === '/api/orders/:param' && a.method === 'GET'));
  assert.ok(result.apiLinks.some((l) => l.from.file.endsWith('orderService.js') && l.route.endpoint === '/api/orders'));
});

test('database: entities, relationships, queries', () => {
  const names = result.database.entities.map((e) => e.name).sort();
  assert.deepStrictEqual(names, ['Order', 'orders', 'payments', 'users']);
  assert.ok(result.database.relationships.some((r) => r.from === 'payments' && r.to === 'orders' && r.status === 'VERIFIED'));
  assert.ok(result.database.relationships.some((r) => r.from === 'Order' && r.to === 'User' && r.status === 'INFERRED'));
  assert.ok(result.database.queries.some((q) => q.entity === 'Order' && q.kind === 'write' && q.operation === 'create'));
  assert.ok(result.database.queries.some((q) => q.entity === 'Order' && q.kind === 'read' && q.operation === 'findById'));
});

test('workflow traces UI -> API -> controller -> service -> DB with evidence', () => {
  const wf = result.workflows.find((w) => w.api && w.api.method === 'POST' && w.api.endpoint === '/api/orders');
  assert.ok(wf, 'POST /api/orders workflow exists');
  assert.strictEqual(wf.trigger.type, 'UI_EVENT');
  const kinds = wf.steps.map((s) => s.kind);
  for (const k of ['trigger', 'api-call', 'route', 'controller', 'db-write', 'external-service']) assert.ok(kinds.includes(k), `missing step ${k}`);
  const syms = wf.steps.map((s) => s.symbol);
  assert.ok(syms.includes('validateOrder') && syms.includes('calculateTotal'));
  assert.ok(wf.steps.every((s) => s.file));
  assert.ok(wf.steps.some((s) => s.kind === 'db-write' && s.entity === 'Order'));
  assert.ok(wf.steps.some((s) => s.kind === 'security-check' || s.kind === 'middleware'));
  assert.strictEqual(wf.purpose, null); // never invented
});

test('features and tests are linked', () => {
  const f = result.features.find((x) => x.id === 'order');
  assert.ok(f, 'order feature detected');
  assert.ok(f.tests.includes('server/services/orderService.test.js'));
  assert.strictEqual(f.status, 'INFERRED');
  assert.ok(f.entities.includes('Order'));
});

test('auth and external services come from evidence', () => {
  assert.ok(result.auth.some((a) => a.file === 'server/middleware/auth.js' && a.items.some((i) => i.kind === 'jwt')));
  assert.ok(result.externalServices.Stripe);
  assert.ok(!result.externalServices.PayPal);
});
