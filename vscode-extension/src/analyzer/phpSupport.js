// PHP: Laravel route groups / resources / controllers and validation rules, Symfony #[Route] attributes and @Route annotations.
const { lineAt, matchBrace, matchParen, splitArgs } = require('../utils/text');

const strs = (s) => [...String(s || '').matchAll(/['"]([^'"]*)['"]/g)].map((x) => x[1]);
const REST = [['index', 'GET', ''], ['create', 'GET', '/create'], ['store', 'POST', ''], ['show', 'GET', '/{id}'], ['edit', 'GET', '/{id}/edit'], ['update', 'PUT', '/{id}'], ['update', 'PATCH', '/{id}'], ['destroy', 'DELETE', '/{id}']];
const API_REST = REST.filter(([a]) => !['create', 'edit'].includes(a));

function analyzeLaravelRoutes(content, starts, file) {
  const routes = [];
  // groups: Route::prefix('x')->middleware('auth')->group(function () { ... })   Route::group(['prefix'=>'x','middleware'=>[..]], function () {...})   Route::controller(C::class)->group(...)
  const groups = [];
  const gre = /Route::((?:\s*\w+\([^)]*\)\s*(?:->|::))*)\s*group\s*\(/g;
  let m;
  const scan = /Route::[\s\S]*?->\s*group\s*\(|Route::group\s*\(/g;
  while ((m = scan.exec(content))) {
    const head = content.slice(m.index, scan.lastIndex);
    const open = scan.lastIndex - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const inner = content.slice(open + 1, close);
    const fn = inner.search(/function\s*\(|fn\s*\(/);
    const bodyOpen = content.indexOf('{', open + (fn === -1 ? 0 : fn));
    if (bodyOpen === -1 || bodyOpen > close) continue;
    const bodyEnd = matchBrace(content, bodyOpen);
    let prefix = ''; let mw = [];
    for (const call of head.matchAll(/(prefix|middleware|controller|name|domain)\s*\(\s*([^)]*)\)/g)) { if (call[1] === 'prefix') prefix = strs(call[2])[0] || ''; if (call[1] === 'middleware') mw = mw.concat(strs(call[2])); }
    const arr = /\[\s*([\s\S]*?)\]\s*,\s*(?:function|fn)/.exec(inner);
    if (arr && /^Route::group/.test(head)) { const p = /['"]prefix['"]\s*=>\s*['"]([^'"]*)['"]/.exec(arr[1]); if (p) prefix = p[1]; const w = /['"]middleware['"]\s*=>\s*(\[[^\]]*\]|['"][^'"]*['"])/.exec(arr[1]); if (w) mw = mw.concat(strs(w[1])); }
    groups.push({ start: bodyOpen, end: bodyEnd, prefix, mw });
  }
  const ctx = (idx) => { const g = groups.filter((x) => x.start < idx && idx < x.end).sort((a, b) => a.start - b.start); return { prefix: g.map((x) => (x.prefix ? `/${x.prefix.replace(/^\/+|\/+$/g, '')}` : '')).join(''), mw: g.flatMap((x) => x.mw) }; };
  const add = (method, path, idx, handler, extra = []) => { const c = ctx(idx); routes.push({ method, path: `${c.prefix}${path.startsWith('/') || !path ? path : `/${path}`}` || '/', line: lineAt(starts, idx), framework: 'laravel', handler, inline: false, middleware: [...c.mw, ...extra], file, owner: 'Route' }); };
  const verb = /Route::(get|post|put|patch|delete|options|any|match)\(\s*(?:\[[^\]]*\]\s*,\s*)?['"]([^'"]*)['"]\s*(?:,\s*(\[[^\]]*\]|['"][^'"]*['"]|function|fn))?/g;
  while ((m = verb.exec(content))) {
    const target = m[3] || '';
    const arr = /\[\s*([\w\\]+)::class\s*,\s*['"](\w+)['"]/.exec(target);
    const handler = arr ? `${arr[1].split('\\').pop()}.${arr[2]}` : (strs(target)[0] || null);
    const stmtEnd = content.indexOf(';', m.index);
    const tail = content.slice(m.index, stmtEnd === -1 ? m.index + 300 : stmtEnd);
    const extra = [...tail.matchAll(/->middleware\(\s*([^)]*)\)/g)].flatMap((x) => strs(x[1]));
    add(m[1] === 'match' ? 'ANY' : m[1].toUpperCase(), m[2], m.index, handler, extra);
  }
  const res = /Route::(resource|apiResource)\(\s*['"]([\w./-]+)['"]\s*,\s*([\w\\]+)::class([^;]*)/g;
  while ((m = res.exec(content))) {
    const only = /->only\(\s*\[([^\]]*)\]/.exec(m[4]); const except = /->except\(\s*\[([^\]]*)\]/.exec(m[4]);
    for (const [action, method, tail] of (m[1] === 'apiResource' ? API_REST : REST)) { if (only && !strs(only[1]).includes(action)) continue; if (except && strs(except[1]).includes(action)) continue; add(method, `/${m[2]}${tail}`, m.index, `${m[3].split('\\').pop()}.${action}`); }
  }
  return routes;
}

// Symfony: #[Route('/orders', name: 'x', methods: ['GET'])] or /** @Route("/orders", methods={"GET"}) */, on class and method
function analyzeSymfonyRoutes(content, starts, file) {
  const routes = [];
  if (!/#\[Route\(|@Route\(/.test(content)) return routes;
  const attrs = [];
  for (const m of content.matchAll(/(?:#\[Route\(|@Route\()/g)) { const open = m.index + m[0].length - 1; const close = matchParen(content, open); if (close !== -1) attrs.push({ args: content.slice(open + 1, close), idx: m.index }); }
  const classM = /\bclass\s+(\w+)/g;
  let c; const classes = [];
  while ((c = classM.exec(content))) classes.push({ name: c[1], idx: c.index });
  const meth = /function\s+(\w+)\s*\(/g;
  const first = (s) => (/^\s*(?:path:\s*)?['"]([^'"]*)['"]/.exec(s) || /path\s*[:=]\s*['"]([^'"]*)['"]/.exec(s) || [])[1];
  for (const a of attrs) {
    const next = classes.find((x) => x.idx > a.idx);
    const fn = (() => { meth.lastIndex = a.idx; return meth.exec(content); })();
    const isClassLevel = next && (!fn || next.idx < fn.index);
    if (isClassLevel) continue;
    const owner = [...classes].reverse().find((x) => x.idx < a.idx);
    const cls = attrs.find((x) => owner && x.idx < owner.idx + 1 && x.idx > Math.max(0, owner.idx - 400) && x.idx < owner.idx);
    const prefix = cls ? first(cls.args) || '' : '';
    const methods = /methods\s*[:=]\s*(?:\[|\{)([^\]}]*)(?:\]|\})/.exec(a.args);
    for (const mm of (methods ? strs(methods[1]).map((x) => x.toUpperCase()) : ['ANY'])) routes.push({ method: mm, path: `${prefix}${first(a.args) || ''}` || '/', line: lineAt(starts, a.idx), framework: 'symfony', handler: fn ? fn[1] : null, inline: false, middleware: /IsGranted|Security/.test(content.slice(a.idx - 200, a.idx + 300)) ? ['IsGranted'] : [], file, owner: owner ? owner.name : '' });
  }
  return routes;
}

// Laravel validation: 'name' => 'required|string|max:255'  /  'email' => ['required', 'email', 'unique:users']
function analyzeLaravelValidation(content, starts) {
  const out = [];
  if (!/function\s+rules\s*\(|->validate\(|Validator::make\(|validateWithBag/.test(content)) return out;
  const KNOWN = /\b(required|nullable|sometimes|string|integer|numeric|email|boolean|array|date|url|image|file|confirmed|unique|exists|in|not_in|regex|max|min|size|between|alpha|alpha_num|alpha_dash|uuid|json|ip|digits|after|before|accepted|mimes)\b/;
  const re = /['"]([\w.*-]+)['"]\s*=>\s*(?:'([^']*)'|"([^"]*)"|\[([^\]]*)\])/g;
  let m;
  while ((m = re.exec(content))) {
    const raw = m[2] ?? m[3] ?? (m[4] ? strs(m[4]).join('|') : '');
    if (!raw || !KNOWN.test(raw)) continue;
    const parts = raw.split('|').map((x) => x.trim()).filter(Boolean);
    const isString = parts.includes('string') || parts.includes('email');
    const rules = [];
    for (const p of parts) {
      const [name, arg] = p.split(':');
      if (name === 'required') rules.push('required');
      else if (name === 'email') rules.push('type(email)');
      else if (name === 'unique') rules.push('unique');
      else if (name === 'max') rules.push(`${isString ? 'maxlength' : 'max'}(${arg})`);
      else if (name === 'min') rules.push(`${isString ? 'minlength' : 'min'}(${arg})`);
      else if (name === 'in') rules.push('enum');
      else if (name === 'regex') rules.push('pattern');
      else if (name === 'confirmed') rules.push('confirmed');
      else if (['integer', 'numeric', 'boolean', 'date', 'url', 'uuid', 'json', 'array'].includes(name)) rules.push(`type(${name})`);
    }
    if (rules.length) out.push({ kind: 'laravel-validation', field: m[1], rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
  return out;
}

module.exports = { analyzeLaravelRoutes, analyzeSymfonyRoutes, analyzeLaravelValidation };
