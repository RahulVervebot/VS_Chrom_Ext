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

function featureKey(filePath) {
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

const singular = (s) => s.replace(/ies$/, 'y').replace(/s$/, '');

function detectFeatures({ fileAnalyses, apis, queries, dependencies }) {
  const features = new Map();
  const get = (key) => {
    const k = singular(key);
    if (!features.has(k)) features.set(k, { id: k, name: k, files: new Set(), routes: new Set(), apis: [], entities: new Set(), tests: new Set(), signals: new Set() });
    return features.get(k);
  };
  for (const fa of fileAnalyses) {
    if (!fa.isSource) continue;
    const key = featureKey(fa.path);
    if (!key) continue;
    const f = get(key);
    f.files.add(fa.path);
    f.signals.add(classifyRole(fa.path));
    if (fa.isTest) f.tests.add(fa.path);
  }
  for (const a of apis) {
    // URL parameters such as :id, {id}, [id] or Flask's <string:name> are not feature names.
    const seg = a.endpoint.split('/').filter((x) => x && !['api', 'v1', 'v2', ':param', 'wp-json'].includes(x) && !/^[:<{[]/.test(x.trim()) && !/[<>{}[\]]/.test(x))[0];
    if (!seg) continue;
    const f = get(seg);
    f.apis.push({ method: a.method, endpoint: a.endpoint, file: a.file, line: a.line });
    f.files.add(a.file);
    f.signals.add('api-group');
  }
  // A test belongs to the features of the project files it imports.
  for (const fa of fileAnalyses) {
    if (!fa.isTest) continue;
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
    .filter((f) => f.files.size >= 2 || f.apis.length)
    .map((f) => ({
      id: f.id,
      name: f.name,
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
