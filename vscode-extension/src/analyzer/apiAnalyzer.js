// Client-side API calls, GraphQL, WebSocket, external APIs; plus project-level route resolution & matching.
const path = require('path');
const { lineIndex, lineAt, matchParen, splitArgs } = require('../utils/text');
const { resolveImport } = require('./dependencyAnalyzer');

function templateToPath(s) {
  return s.replace(/\$\{[^}]*\}/g, ':param');
}

function pathOf(url) {
  const noHost = url.replace(/^https?:\/\/[^/]+/i, '');
  return templateToPath(noHost.split('?')[0]).replace(/\/+$/, '') || '/';
}

function analyzeApiCalls(content, language) {
  if (!['javascript', 'typescript', 'vue', 'svelte'].includes(language)) return analyzeNonJsCalls(content, language);
  const starts = lineIndex(content);
  const calls = [];
  let m;

  const fetchRe = /\bfetch\s*\(/g;
  while ((m = fetchRe.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const args = splitArgs(content.slice(open + 1, close));
    const u = /^(['"`])(.*)\1$/s.exec(args[0] || '');
    if (!u) { calls.push({ method: 'GET', url: null, dynamic: true, line: lineAt(starts, m.index), client: 'fetch' }); continue; }
    const meth = /method\s*:\s*['"](\w+)['"]/i.exec(args[1] || '');
    calls.push({ method: meth ? meth[1].toUpperCase() : 'GET', url: u[2], path: pathOf(u[2]), line: lineAt(starts, m.index), client: 'fetch' });
  }

  const axiosRe = /\b(axios|api|http|client|request|\$http)\.(get|post|put|patch|delete)\s*\(\s*(['"`])((?:\\.|(?!\3).)*)\3/g;
  while ((m = axiosRe.exec(content))) {
    calls.push({ method: m[2].toUpperCase(), url: m[4], path: pathOf(m[4]), line: lineAt(starts, m.index), client: m[1] });
  }
  const axiosCfg = /\baxios\s*\(\s*\{[^}]*url\s*:\s*(['"`])([^'"`]+)\1[^}]*\}/g;
  while ((m = axiosCfg.exec(content))) {
    const meth = /method\s*:\s*['"](\w+)['"]/i.exec(m[0]);
    calls.push({ method: meth ? meth[1].toUpperCase() : 'GET', url: m[2], path: pathOf(m[2]), line: lineAt(starts, m.index), client: 'axios' });
  }
  const ajax = /\$\.(get|post|ajax)\s*\(\s*['"]([^'"]+)['"]/g;
  while ((m = ajax.exec(content))) calls.push({ method: m[1] === 'post' ? 'POST' : 'GET', url: m[2], path: pathOf(m[2]), line: lineAt(starts, m.index), client: 'jquery' });

  return calls;
}

function analyzeNonJsCalls(content, language) {
  const starts = lineIndex(content);
  const calls = [];
  let m;
  if (language === 'python') {
    const re = /\brequests\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    while ((m = re.exec(content))) calls.push({ method: m[1].toUpperCase(), url: m[2], path: pathOf(m[2]), line: lineAt(starts, m.index), client: 'requests' });
  } else if (language === 'php') {
    const re = /(?:wp_remote_(get|post)|Http::(get|post|put|delete))\(\s*['"]([^'"]+)['"]/g;
    while ((m = re.exec(content))) calls.push({ method: (m[1] || m[2]).toUpperCase(), url: m[3], path: pathOf(m[3]), line: lineAt(starts, m.index), client: 'php-http' });
  }
  return calls;
}

function analyzeRealtimeAndGraphQL(content) {
  const starts = lineIndex(content);
  const out = { graphql: [], websocket: [], rpc: [], serverActions: [] };
  let m;
  const gql = /\b(?:gql|graphql)\s*`([^`]*)`/g;
  while ((m = gql.exec(content))) {
    const op = /\b(query|mutation|subscription|type|schema)\s+(\w+)?/.exec(m[1]);
    out.graphql.push({ kind: op ? op[1] : 'document', name: op && op[2] ? op[2] : null, line: lineAt(starts, m.index) });
  }
  if (/new\s+ApolloServer|graphqlHTTP\(|buildSchema\(/.test(content)) out.graphql.push({ kind: 'server', name: null, line: lineAt(starts, content.search(/new\s+ApolloServer|graphqlHTTP\(|buildSchema\(/)) });
  const ws = /new\s+(?:WebSocket|WebSocketServer|Server)\(\s*(?:\{[^}]*\}|['"`]([^'"`]+)['"`])?/g;
  while ((m = ws.exec(content))) if (/WebSocket/.test(m[0])) out.websocket.push({ url: m[1] || null, line: lineAt(starts, m.index) });
  const sio = /\bio\(\s*['"`]([^'"`]+)['"`]|new\s+Server\(\s*\w+\s*\)/g;
  while ((m = sio.exec(content))) if (/socket\.io/.test(content)) out.websocket.push({ url: m[1] || null, line: lineAt(starts, m.index), library: 'socket.io' });
  const rpc = /\b(?:trpc|grpc)\b[.\w]*/g;
  while ((m = rpc.exec(content))) out.rpc.push({ kind: m[0], line: lineAt(starts, m.index) });
  if (/^\s*['"]use server['"]/m.test(content)) out.serverActions.push({ line: lineAt(starts, content.search(/['"]use server['"]/)) });
  return out;
}

// --- project level ---

function normalizePath(p) {
  return ('/' + p.replace(/^\/+/, '')).replace(/\/+$/, '').replace(/\/+/g, '/').replace(/\{[^}]+\}|<[^>]+>|:[\w]+\*?|\[[^\]]+\]|\*\w+/g, ':param') || '/';
}

// Apply app.use('/prefix', router) mounts to route definitions.
function resolveRoutes(fileAnalyses, dependencies) {
  const byPath = new Map(fileAnalyses.map((f) => [f.path, f]));
  const fileSet = new Set(byPath.keys());
  const paths = [...fileSet];
  const baseNoExt = (p) => p.replace(/\.[^./]+$/, '');
  // Where does a mount point? 1) through the file's imports, 2) a dotted module path ("shop.urls"), 3) a unique file named after the target ("orders.router").
  const targetOf = (fa, mt) => {
    if (mt.target) {
      const head = mt.target.split('.')[0];
      const imp = fa.imports.find((i) => i.default === mt.target || i.default === head || i.names.some((n) => n.local === mt.target || n.local === head));
      if (imp) { const t = resolveImport(fa.path, imp, fa.language, fileSet); if (t && t !== fa.path) return t; }
    }
    const dotted = mt.module || null;
    if (dotted) {
      const rel = dotted.replace(/\./g, '/');
      const hit = paths.filter((p) => baseNoExt(p) === rel || baseNoExt(p).endsWith(`/${rel}`) || p.endsWith(`/${rel}/__init__.py`));
      if (hit.length) return hit.sort((x, y) => x.length - y.length)[0];
    }
    if (mt.target && mt.target.includes('.')) {
      const name = mt.target.split('.')[0];
      const hit = paths.filter((p) => baseNoExt(p).split('/').pop() === name && p !== fa.path);
      if (hit.length === 1) return hit[0];
    }
    return null;
  };
  const edges = [];
  for (const fa of fileAnalyses) for (const mt of fa.mounts || []) { const t = targetOf(fa, mt); if (t) edges.push({ from: fa.path, to: t, path: mt.path }); }
  // prefixes cascade through nested mounts (app -> api -> orders); a few passes settle any realistic depth
  const prefixByFile = new Map();
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const e of edges) { const next = (prefixByFile.get(e.from) || '') + e.path; if (prefixByFile.get(e.to) !== next) { prefixByFile.set(e.to, next); changed = true; } }
    if (!changed) break;
  }
  const apis = [];
  for (const fa of fileAnalyses) {
    for (const r of fa.routes || []) {
      const prefix = prefixByFile.get(fa.path) || '';
      const full = normalizePath(prefix + r.path);
      apis.push({ ...r, endpoint: full, prefix: prefix || null, file: fa.path });
    }
  }
  return apis;
}

function methodsMatch(a, b) { return a === 'ANY' || b === 'ANY' || a === 'ALL' || b === 'ALL' || a === b; }

// Match client calls to server routes by normalized path + method.
function matchCallsToRoutes(fileAnalyses, apis) {
  const links = [];
  for (const fa of fileAnalyses) {
    for (const c of fa.apiCalls || []) {
      if (!c.path) continue;
      const np = normalizePath(c.path);
      const matches = apis.filter((r) => r.endpoint === np && methodsMatch(r.method, c.method));
      for (const r of matches) links.push({ from: { file: fa.path, line: c.line, client: c.client }, method: c.method, path: np, route: { file: r.file, handler: r.handler, line: r.line, endpoint: r.endpoint, method: r.method }, status: 'VERIFIED' });
    }
  }
  return links;
}

module.exports = { analyzeApiCalls, analyzeRealtimeAndGraphQL, resolveRoutes, matchCallsToRoutes, normalizePath };
