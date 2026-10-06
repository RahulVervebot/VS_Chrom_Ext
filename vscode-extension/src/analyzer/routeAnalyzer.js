// Server-side route/endpoint definitions detected from source.
const { lineIndex, lineAt, matchParen, splitArgs, matchBrace } = require('../utils/text');

const { analyzeGoRoutes } = require('./goSupport');
const { analyzePythonRoutes } = require('./pythonSupport');
const { analyzeRailsRoutes } = require('./rubySupport');
const { analyzeJvmRoutes } = require('./jvmSupport');
const { analyzeDotnetRoutes } = require('./dotnetSupport');
const { analyzeRustRoutes } = require('./rustSupport');
const { analyzeLaravelRoutes, analyzeSymfonyRoutes } = require('./phpSupport');

const METHODS = 'get|post|put|patch|delete|head|options|all';

function unquote(s) {
  const m = /^\s*(['"`])(.*)\1\s*$/s.exec(s);
  return m ? m[2] : null;
}

function handlerFromArg(arg) {
  const id = /^([\w$]+(?:\.[\w$]+)*)$/.exec(arg.trim());
  return id ? id[1] : null;
}

function analyzeExpress(content, starts, path) {
  const routes = [];
  const mounts = [];
  const re = new RegExp(`\\b([\\w$]+)\\.(${METHODS}|use)\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const args = splitArgs(content.slice(open + 1, close));
    if (!args.length) continue;
    const owner = m[1];
    if (m[2] === 'use') {
      // app.use('/api/orders', orderRoutes)
      const p = unquote(args[0]);
      const target = handlerFromArg(args[args.length - 1]);
      if (p && target && args.length >= 2) mounts.push({ path: p, target, line: lineAt(starts, m.index), owner });
      continue;
    }
    const p = unquote(args[0]);
    if (p === null || !p.startsWith('/')) continue; // avoids Map#get('key') and similar
    if (!/^(app|router|route|server|api|fastify|instance|\w*[rR]outer|\w*[aA]pp|\w*[fF]astify)$/.test(owner)) continue;
    const rest = args.slice(1);
    const last = rest[rest.length - 1] || '';
    const inline = /=>|^(async\s+)?function\b/.test(last);
    let bodyRange = null;
    if (inline) {
      const bo = content.indexOf('{', open + 1 + content.slice(open + 1).indexOf(last));
      if (bo !== -1 && bo < close) bodyRange = { startLine: lineAt(starts, bo), endLine: lineAt(starts, matchBrace(content, bo)) };
    }
    routes.push({
      method: m[2].toUpperCase(),
      path: p,
      line: lineAt(starts, m.index),
      framework: 'express',
      handler: inline ? null : handlerFromArg(last),
      inline,
      bodyRange,
      middleware: rest.slice(0, -1).map(handlerFromArg).filter(Boolean),
      file: path,
      owner,
    });
  }
  return { routes, mounts };
}

// Hapi / Fastify route objects:  server.route({ method: 'GET', path: '/x', handler })   fastify.route({ method: 'POST', url: '/x' })
function analyzeRouteObjects(content, starts, file) {
  const routes = [];
  const re = /\b(\w+)\.route\(\s*\{/g;
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    const body = content.slice(open, end + 1);
    const p = /\b(?:path|url)\s*:\s*['"`]([^'"`]+)['"`]/.exec(body);
    const meth = /\bmethod\s*:\s*(\[[^\]]*\]|['"`]\w+['"`])/.exec(body);
    if (!p || !p[1].startsWith('/')) continue;
    for (const x of (meth ? [...meth[1].matchAll(/['"`](\w+)['"`]/g)].map((y) => y[1].toUpperCase()) : ['ANY'])) routes.push({ method: x, path: p[1], line: lineAt(starts, m.index), framework: 'node-http', handler: (/\bhandler\s*:\s*([\w.]+)/.exec(body) || [])[1] || null, inline: !/\bhandler\s*:\s*[\w.]+\s*[,}\n]/.test(body), middleware: /\b(preHandler|onRequest|auth)\s*:/.test(body) ? ['auth'] : [], file, owner: m[1] });
  }
  return routes;
}

function analyzeNest(content, starts, path) {
  const routes = [];
  const ctrl = /@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/.exec(content);
  if (!ctrl) return routes;
  const prefix = ctrl[1] ? `/${ctrl[1].replace(/^\//, '')}` : '';
  const re = /@(Get|Post|Put|Patch|Delete|All)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)\s*(?:@[\w]+\([^)]*\)\s*)*(?:async\s+)?([\w$]+)\s*\(/g;
  let m;
  while ((m = re.exec(content))) {
    const sub = m[2] ? `/${m[2].replace(/^\//, '')}` : '';
    routes.push({ method: m[1].toUpperCase(), path: prefix + sub || '/', line: lineAt(starts, m.index), framework: 'nestjs', handler: m[3], inline: false, middleware: [], file: path });
  }
  return routes;
}

function analyzePython(content, starts, path) {
  const routes = [];
  let m;
  const flask = /@([\w.]+)\.(route|get|post|put|patch|delete)\(\s*['"]([^'"]+)['"](?:\s*,\s*methods\s*=\s*\[([^\]]*)\])?[^)]*\)\s*\n\s*(?:async\s+)?def\s+(\w+)/g;
  while ((m = flask.exec(content))) {
    const methods = m[2] === 'route' ? (m[4] ? m[4].replace(/['"\s]/g, '').split(',') : ['GET']) : [m[2]];
    for (const meth of methods) routes.push({ method: meth.toUpperCase(), path: m[3], line: lineAt(starts, m.index), framework: 'flask/fastapi', handler: m[5], inline: false, middleware: [], file: path });
  }
  const django = /\bpath\(\s*['"]([^'"]*)['"]\s*,\s*([\w.]+)/g;
  while ((m = django.exec(content))) routes.push({ method: 'ANY', path: `/${m[1]}`, line: lineAt(starts, m.index), framework: 'django', handler: m[2], inline: false, middleware: [], file: path });
  return routes;
}

function analyzePhp(content, starts, path) {
  const routes = [];
  let m;
  const laravel = new RegExp(`Route::(${METHODS})\\(\\s*['"]([^'"]+)['"]\\s*,\\s*(?:\\[\\s*([\\w\\\\:]+)(?:::class)?\\s*,\\s*['"](\\w+)['"]\\s*\\]|['"]([\\w\\\\@]+)['"]|function)`, 'g');
  while ((m = laravel.exec(content))) {
    routes.push({ method: m[1].toUpperCase(), path: m[2].startsWith('/') ? m[2] : `/${m[2]}`, line: lineAt(starts, m.index), framework: 'laravel', handler: m[4] ? `${m[3]}.${m[4]}` : (m[5] || null), inline: !m[3] && !m[5], middleware: [], file: path });
  }
  const wp = /register_rest_route\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
  while ((m = wp.exec(content))) routes.push({ method: 'ANY', path: `/wp-json/${m[1]}${m[2]}`, line: lineAt(starts, m.index), framework: 'wordpress', handler: null, inline: false, middleware: [], file: path });
  return routes;
}

function analyzeSpring(content, starts, path) {
  const routes = [];
  const base = /@RequestMapping\(\s*(?:value\s*=\s*)?["']([^"']+)["']/.exec(content);
  const prefix = base ? base[1] : '';
  const re = /@(Get|Post|Put|Patch|Delete)Mapping\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["'])?[^)]*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*public\s+[\w<>\[\],?\s]+?\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(content))) routes.push({ method: m[1].toUpperCase(), path: (prefix + (m[2] || '')) || '/', line: lineAt(starts, m.index), framework: 'spring', handler: m[3], inline: false, middleware: [], file: path });
  return routes;
}

// File-system routing (Next.js).
function analyzeFileRoute(filePath, content) {
  const routes = [];
  let m = /^(?:src\/)?pages\/api\/(.+)\.(?:js|jsx|ts|tsx)$/.exec(filePath);
  if (m) {
    const p = `/api/${m[1].replace(/\/index$/, '').replace(/\[\.\.\.(\w+)\]/g, ':$1*').replace(/\[(\w+)\]/g, ':$1')}`;
    routes.push({ method: 'ANY', path: p, line: 1, framework: 'nextjs-pages-api', handler: 'default', inline: false, middleware: [], file: filePath });
  }
  // Nuxt server routes: server/api/orders/[id].get.ts -> GET /api/orders/:id ; SvelteKit: src/routes/api/orders/+server.ts exports GET/POST ; Astro: src/pages/api/x.ts
  m = /^(?:[\w.-]+\/)*server\/(api|routes)\/(.+?)(?:\.(get|post|put|patch|delete))?\.(?:js|ts|mjs)$/.exec(filePath);
  if (m) { const base = `/${m[1] === 'api' ? 'api/' : ''}${m[2].replace(/\/index$/, '').replace(/\[\.\.\.(\w+)\]/g, ':$1*').replace(/\[(\w+)\]/g, ':$1')}`; routes.push({ method: m[3] ? m[3].toUpperCase() : 'ANY', path: base, line: 1, framework: 'nuxt', handler: 'default', inline: false, middleware: [], file: filePath }); }
  m = /^(?:[\w.-]+\/)*src\/routes\/(.*)\+server\.(?:js|ts)$/.exec(filePath);
  if (m) { const p = `/${m[1].replace(/\/$/, '').replace(/\[\.\.\.(\w+)\]/g, ':$1*').replace(/\[(\w+)\]/g, ':$1')}`; for (const x of [...content.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((y) => y[1])) routes.push({ method: x, path: p === '/' ? '/' : p.replace(/\/$/, ''), line: 1, framework: 'sveltekit', handler: x, inline: false, middleware: [], file: filePath }); }
  m = /^(?:src\/)?app\/(.+\/)?route\.(?:js|ts)$/.exec(filePath);
  if (m) {
    const p = `/${(m[1] || '').replace(/\/$/, '').replace(/\[(\w+)\]/g, ':$1')}`;
    const methods = [...content.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((x) => x[1]);
    for (const meth of methods) routes.push({ method: meth, path: p === '/' ? '/' : p, line: 1, framework: 'nextjs-app-route', handler: meth, inline: false, middleware: [], file: filePath });
  }
  return routes;
}

function analyzeRoutes(filePath, content, language) {
  const starts = lineIndex(content);
  let routes = [];
  let mounts = [];
  if (['javascript', 'typescript'].includes(language)) {
    const ex = analyzeExpress(content, starts, filePath);
    routes = ex.routes;
    mounts = ex.mounts;
    routes.push(...analyzeNest(content, starts, filePath));
    routes.push(...analyzeRouteObjects(content, starts, filePath));
    routes.push(...analyzeFileRoute(filePath, content));
  } else if (language === 'python') { const py = analyzePythonRoutes(content, starts, filePath); routes = py.routes; mounts = py.mounts; }
  else if (language === 'php') { routes = [...analyzeLaravelRoutes(content, starts, filePath), ...analyzeSymfonyRoutes(content, starts, filePath), ...analyzePhp(content, starts, filePath).filter((r) => r.framework === 'wordpress')]; }
  else if (language === 'java' || language === 'kotlin') routes = analyzeJvmRoutes(content, starts, filePath, language);
  else if (language === 'csharp') routes = analyzeDotnetRoutes(content, starts, filePath);
  else if (language === 'ruby') routes = analyzeRailsRoutes(content, starts, filePath);
  else if (language === 'rust') routes = analyzeRustRoutes(content, starts, filePath);
  else if (language === 'go') routes = analyzeGoRoutes(content, starts, filePath);
  return { routes, mounts };
}

module.exports = { analyzeRoutes };
