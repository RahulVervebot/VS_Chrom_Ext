// Architectural role classification and stack/entry-point summary from evidence.
const path = require('path');

const ROLE_RULES = [
  { role: 'test', re: /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_\w+\.py$/ },
  { role: 'migration', re: /(^|\/)(migrations?|seeds?)\// },
  { role: 'model', re: /(^|\/)(models?|entities|schemas?)\/|\.(model|entity)\.[a-z]+$|Model\.[a-z]+$|(^|\/)(models?|schemas?|serializers?)\.py$|_models?\.(go|py)$/i },
  { role: 'controller', re: /(^|\/)(controllers?|handlers?)\/|\.controller\.[a-z]+$|Controller\.[a-z]+$|(^|\/)views?\.py$|_views?\.py$|(^|\/|_)handlers?\.go$|_controllers?\.(go|py)$/i },
  { role: 'route', re: /(^|\/)(routes?|routers?)\/|\.routes?\.[a-z]+$|Routes?\.[a-z]+$|(^|\/)pages\/api\/|(^|\/)app\/.*route\.[a-z]+$|(^|\/)urls\.py$|(^|\/|_)routes?\.(py|go)$|(^|\/|_)routers?\.(py|go)$/i },
  { role: 'repository', re: /(^|\/)(repositor(y|ies)|dao)\/|Repository\.[a-z]+$|(^|\/|_)repositor(y|ies)\.(py|go)$/i },
  { role: 'service', re: /(^|\/)(services?)\/|\.service\.[a-z]+$|Service\.[a-z]+$|(^|\/|_)services?\.(py|go)$/i },
  { role: 'middleware', re: /(^|\/)middlewares?\/|\.middleware\.[a-z]+$|Middleware\.[a-z]+$|(^|\/|_)middlewares?\.(py|go)$/i },
  { role: 'state', re: /(^|\/)(store|stores|state|redux|context|contexts)\/|(Slice|Store|Reducer|Context)\.[a-z]+$/i },
  { role: 'hook', re: /(^|\/)hooks?\/|(^|\/)use[A-Z]\w*\.[jt]sx?$/ },
  { role: 'component', re: /(^|\/)(components?|widgets?|views?)\/|\.(jsx|tsx|vue|svelte)$/ },
  { role: 'page', re: /(^|\/)(pages|screens|app)\// },
  { role: 'api-client', re: /(^|\/)(api|clients?)\/|Api\.[a-z]+$/i },
  { role: 'util', re: /(^|\/)(utils?|helpers?|lib|common|shared)\// },
  { role: 'config', re: /(^|\/)(config|configs)\/|\.config\.[a-z]+$|(^|\/)(config|settings)\.(go|py)$/i },
];

function classifyRole(filePath) {
  for (const r of ROLE_RULES) if (r.re.test(filePath)) return r.role;
  return 'other';
}

const ENTRY_NAMES = /^(index|main|app|server|manage|wsgi|asgi|program|application)\.[a-z]+$/i;

function analyzeArchitecture({ fileAnalyses, scan, dependencies, dependents }) {
  const layers = {};
  for (const fa of fileAnalyses) {
    if (!fa.isSource) continue;
    const role = classifyRole(fa.path);
    (layers[role] ||= []).push(fa.path);
  }
  const entryPoints = [];
  for (const fa of fileAnalyses) {
    if (!fa.isSource) continue;
    const base = path.posix.basename(fa.path);
    const deps = (dependencies[fa.path] || {}).internal || [];
    const dependentsCount = (dependents[fa.path] || []).length;
    if (ENTRY_NAMES.test(base) && (dependentsCount === 0 || fa.path.split('/').length <= 2)) entryPoints.push({ path: fa.path, reason: 'conventional entry filename', dependencies: deps.length, status: 'INFERRED' });
  }
  for (const m of scan.packages.manifests) {
    if (m.kind === 'package.json') {
      // "main" is not stored in manifests; entry from scripts is read by commands elsewhere.
    }
  }
  const frontend = (layers.component || []).length + (layers.page || []).length > 0;
  const backend = ['route', 'controller', 'service', 'model', 'repository'].some((r) => (layers[r] || []).length > 0);
  return {
    technologies: scan.packages.technologies,
    languages: scan.languages,
    layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.sort()])),
    tiers: { frontend, backend },
    entryPoints,
    config: scan.config,
  };
}

module.exports = { analyzeArchitecture, classifyRole };
