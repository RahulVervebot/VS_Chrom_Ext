// Feature candidates are grouped from routes, folders and naming. All features are INFERRED (grouping is heuristic);
// their member files, APIs and entities are backed by concrete evidence.
const path = require('path');
const { classifyRole } = require('./architectureAnalyzer');

const SUFFIX = /(Controller|Service|Model|Routes?|Router|Repository|Store|Slice|Reducer|Context|Page|Form|List|Card|View|Screen|Api|Client|Hook|Modal|Table|Container|Provider|Schema|Entity|Dto|Guard|Middleware|Handler)s?$/;
const CONTAINERS = new Set(['components', 'pages', 'features', 'modules', 'routes', 'controllers', 'services', 'models', 'views', 'screens', 'store', 'stores', 'hooks', 'api', 'apis', 'app', 'src', 'lib', 'server', 'client', 'backend', 'frontend', 'utils', 'helpers', 'entities', 'repositories', 'middleware', 'middlewares', 'handlers', 'tests', 'test', '__tests__', 'internal', 'pkg', 'cmd', 'handler', 'routers', 'router', 'repository', 'domain', 'usecase', 'usecases', 'entity', 'dto', 'schemas', 'serializers', 'templates', 'static', 'migrations', 'config', 'common', 'shared']);

function words(s) {
  s = s.replace(/[_-](controllers?|services?|models?|routes?|routers?|repositor(?:y|ies)|handlers?|views?|serializers?|schemas?|apis?|stores?|forms?|dto|entity|entities|tests?)(?=\.|$)/gi, '');
  return s.replace(/\.(test|spec)\.[a-z]+$/i, '').replace(/^test_/, '').replace(/\.[a-z]+$/i, '').replace(/^use(?=[A-Z])/, '').replace(SUFFIX, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s.]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

function featureKey(filePath, moduleRoots = []) {
  // inside a detected sub-project (add-on, app, package…) the sub-project is the feature
  const root = moduleRoots.find((r) => filePath.startsWith(`${r}/`));
  if (root) return words(path.posix.basename(root));
  const segs = filePath.split('/');
  const base = path.posix.basename(filePath);
  // feature folder: the first non-container folder segment (e.g. src/features/checkout/x.js -> checkout)
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i].toLowerCase();
    if (CONTAINERS.has(s)) continue;
    return words(segs[i]);
  }
  const w = words(base);
  return w && !['index', 'app', 'main', 'server'].includes(w) ? w : null;
}

// orders -> order, categories -> category; but pos, status, class, alias, bus stay as they are
const singular = (s) => (s.length > 3 && /ies$/.test(s) ? s.replace(/ies$/, 'y') : s.length > 3 && /s$/.test(s) && !/(ss|us|is|os|as)$/.test(s) ? s.slice(0, -1) : s);

// Inside an Odoo add-on the add-on is not one big feature: files are grouped by what they are about. A model file, its wizard, its
// report and the matching front-end screen share a name (pos_order.py, PaymentScreen.js + pos_payment.py -> "order", "payment").
const ODOO_NOISE = new Set(['init', 'manifest', 'index', 'main', 'model', 'models', 'common', 'util', 'utils', 'tool', 'tools', 'helper', 'helpers', 'db', 'registries', 'registry', 'class-registry', 'component-registry', 'chrome', 'pos-component', 'pos-context', 'misc', 'abstract', 'base', 'res-config-setting', 'res-config-settings', 'qweb', 'templates', 'assets', 'tests', 'test', 'tour', 'tours']);
// generic UI building blocks (mixins, hooks, inputs, error dialogs…) belong to the add-on as a whole, not to a feature
const ODOO_UI_PLUMBING = /^abstract-|-mixin$|-hook$|-adapter$|^(component|draggable|gui|keyboard|header|edit|edit-list-input|text-area|text-input|number|number-buffer|selection|confirm|error|error-traceback|offline-error|error-barcode|debug|debug-manager|money|currency-amount|notification|sync-notification|control|box|pin|search-bar|web-override)$/;
function odooStem(rel, prefixes) {
  const js = /(?:^|\/)static\/src\/(?:js|xml|components?)\/(?:(?:Screens|Popups|ChromeWidgets|Misc|Components|Widgets|Overrides)\/)?([^/]+)/i.exec(rel);
  let w = words(js ? js[1] : path.posix.basename(rel));
  for (let i = 0; i < 3; i++) w = w.replace(/-(popup|widget|button|buttons|wizard|report|reports|lines?|views?|details?|screen|screens|control|controls|panel|list|dialog|data)$/, '');
  for (const p of prefixes) if (w.startsWith(`${p}-`) && w.length > p.length + 1) { w = w.slice(p.length + 1); break; }
  w = w && singular(w);
  if (!w || ODOO_NOISE.has(w) || ODOO_UI_PLUMBING.test(w) || /^\d/.test(w)) return null;
  return w;
}

// test_pos_payment.py, PaymentScreen.tour.js, tours/ProductScreen.tour.js -> the feature they exercise
function testStem(rel, prefixes) {
  const base = path.posix.basename(rel).replace(/\.tours?(?=\.[a-z]+$)/i, '').replace(/[_-]?tours?(?=\.[a-z]+$)/i, '');
  return odooStem(base, prefixes);
}

function detectFeatures({ fileAnalyses, apis, queries, dependencies, modules = [] }) {
  // longest root first so nested sub-projects win; only meaningful when the repository has several of them
  const moduleRoots = modules.length >= 2 ? modules.map((m) => m.path).sort((a, b) => b.length - a.length) : [];
  const odooRoots = modules.filter((m) => m.kind === 'odoo-addon').map((m) => m.path).sort((a, b) => b.length - a.length);
  const odooOf = (p) => odooRoots.find((r) => p.startsWith(`${r}/`)) || null;
  // model namespaces per add-on ("pos" for pos.order, pos.session…), stripped from feature names
  const prefixes = new Map(odooRoots.map((r) => [r, new Set()]));
  for (const fa of fileAnalyses) { const r = odooOf(fa.path); if (!r || !fa.database) continue; for (const e of fa.database.entities || []) { const ns = /^([a-z0-9]+)\./.exec(e.name || ''); if (ns && !e.extension) prefixes.get(r).add(ns[1]); } }
  const features = new Map();
  const get = (key, extra = {}) => {
    const k = extra.id || singular(key);
    if (!features.has(k)) features.set(k, { id: k, name: extra.name || k, ...(extra.module ? { module: extra.module } : {}), files: new Set(), routes: new Set(), apis: [], entities: new Set(), tests: new Set(), signals: new Set() });
    return features.get(k);
  };
  const featureOfFile = new Map();
  for (const fa of fileAnalyses) {
    if (!fa.isSource) continue;
    const addon = odooOf(fa.path);
    let f;
    if (addon) {
      const addonKey = words(path.posix.basename(addon));
      const rel = fa.path.slice(addon.length + 1);
      if (/(^|\/)static\/(lib|libs|vendor)\//.test(rel)) continue; // bundled third-party libraries are not features of the add-on
      // a file that only extends models of other add-ons (account.move, stock.picking, res.partner…) is an integration with them
      const ents = (fa.database && fa.database.entities) || [];
      const foreign = ents.length && ents.every((e) => e.extension && !prefixes.get(addon).has(String(e.name).split('.')[0]));
      const stem = fa.isTest ? testStem(rel, [...prefixes.get(addon)]) : foreign ? `${String(ents[0].name).split('.')[0]}-integration` : odooStem(rel, [...prefixes.get(addon)]);
      f = stem ? get(stem, { id: `${addonKey}--${stem}`, name: stem, module: addon }) : get(addonKey, { id: addonKey, name: addonKey, module: addon });
      f.signals.add('odoo-addon');
      if (!stem) f.signals.add('sub-project'); // the add-on itself is always listed
    } else {
      const key = featureKey(fa.path, moduleRoots);
      if (!key) continue;
      f = get(key);
      if (moduleRoots.some((r) => fa.path.startsWith(`${r}/`))) f.signals.add('sub-project');
    }
    f.files.add(fa.path);
    featureOfFile.set(fa.path, f);
    f.signals.add(classifyRole(fa.path));
    if (fa.isTest) f.tests.add(fa.path);
  }
  for (const a of apis) {
    if (odooOf(a.file) && featureOfFile.has(a.file)) { const f = featureOfFile.get(a.file); f.apis.push({ method: a.method, endpoint: a.endpoint, file: a.file, line: a.line }); f.signals.add('api-group'); continue; } // add-on routes stay with their controller
    // URL parameters such as :id, {id}, [id] or Flask's <string:name> are not feature names.
    const seg = a.endpoint.split('/').filter((x) => x && !['api', 'v1', 'v2', ':param', 'wp-json'].includes(x) && !/^[:<{[]/.test(x.trim()) && !/[<>{}[\]]/.test(x))[0];
    if (!seg) continue;
    const f = get(seg);
    f.apis.push({ method: a.method, endpoint: a.endpoint, file: a.file, line: a.line });
    f.files.add(a.file);
    f.signals.add('api-group');
  }
  // Inside an add-on, a one-file feature whose name starts with a larger sibling's name joins it (payment-method -> payment,
  // product-configurator -> product); a test whose stem matches no feature goes back to the add-on itself.
  for (const [k, f] of [...features.entries()]) {
    if (!f.module || f.signals.has('sub-project')) continue;
    const real = [...f.files].filter((x) => !f.tests.has(x));
    let target = null;
    if (!real.length) target = features.get(words(path.posix.basename(f.module)));
    else if (real.length === 1) {
      const parts = f.name.split('-');
      for (let n = parts.length - 1; n >= 1 && !target; n--) { const g = features.get(`${k.split('--')[0]}--${parts.slice(0, n).join('-')}`); if (g && g !== f && g.files.size >= 2) target = g; }
    }
    if (!target) continue;
    for (const x of f.files) { target.files.add(x); featureOfFile.set(x, target); }
    for (const x of f.tests) target.tests.add(x);
    for (const a of f.apis) target.apis.push(a);
    for (const s of f.signals) if (s !== 'sub-project') target.signals.add(s);
    features.delete(k);
  }
  // A folder-level feature that swallowed a whole tree (e.g. a framework folder with 100+ files) is split by its sub-folders.
  for (const [k, f] of [...features.entries()]) {
    if (f.module || f.files.size <= 40) continue;
    const groups = new Map();
    for (const file of f.files) { const segs = file.split('/'); const i = segs.findIndex((s) => words(s) === k || singular(words(s)) === k); const sub = i >= 0 && segs.length > i + 2 ? segs[i + 1] : null; const key = sub ? `${k}-${words(sub)}` : k; (groups.get(key) || groups.set(key, []).get(key)).push(file); }
    if (groups.size < 2) continue;
    features.delete(k);
    for (const [gk, files] of groups) { const g = get(gk); for (const file of files) { g.files.add(file); featureOfFile.set(file, g); if (f.tests.has(file)) g.tests.add(file); } for (const s of f.signals) g.signals.add(s); }
    for (const a of f.apis) { const g = featureOfFile.get(a.file) || get(k); g.apis.push(a); }
  }
  // A test belongs to the features of the project files it imports.
  for (const fa of fileAnalyses) {
    if (!fa.isTest) continue;
    const own = featureOfFile.get(fa.path);
    if (own && own.module) continue; // an add-on's test stays in its add-on even when it imports the framework (from odoo import …)
    for (const d of ((dependencies[fa.path] || {}).internal || [])) {
      for (const f of features.values()) if (f.files.has(d.path)) { f.tests.add(fa.path); f.files.add(fa.path); }
    }
  }
  const entityByFile = {};
  for (const q of queries) if (q.entity) (entityByFile[q.file] ||= new Set()).add(q.entity);
  for (const f of features.values()) {
    for (const file of f.files) for (const e of entityByFile[file] || []) f.entities.add(e);
    // include direct dependencies' entities (one hop) so a service's models attach to the feature
    for (const file of [...f.files]) for (const d of ((dependencies[file] || {}).internal || [])) for (const e of entityByFile[d.path] || []) f.entities.add(e);
  }
  return [...features.values()]
    .filter((f) => f.files.size >= 2 || f.apis.length || f.signals.has('sub-project') || f.signals.has('odoo-addon')) // a detected sub-project is a feature even if it has a single file
    .map((f) => ({
      id: f.id,
      name: f.name,
      ...(f.module ? { module: f.module } : {}),
      status: 'INFERRED',
      basis: [...f.signals].sort(),
      files: [...f.files].sort(),
      tests: [...f.tests].sort(),
      apis: f.apis,
      entities: [...f.entities].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

module.exports = { detectFeatures };
