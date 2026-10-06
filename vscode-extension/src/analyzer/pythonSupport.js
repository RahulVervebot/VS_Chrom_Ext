// Python web routes (Flask, Quart, FastAPI, Starlette, Sanic, Bottle, aiohttp, Django urlpatterns + DRF routers, Odoo http.route, Pyramid)
// and model classes (Django, SQLAlchemy 1.x/2.0, SQLModel, Odoo, Tortoise, Peewee, Mongoengine…). Pattern-based, evidence per line.
const { lineAt, matchParen, splitArgs } = require('../utils/text');

const str = (s) => { const m = /^\s*[rbuf]*(['"])(.*?)\1\s*$/s.exec(s || ''); return m ? m[2] : null; };
const strList = (s) => { const t = (s || '').trim(); if (/^[[(]/.test(t)) return [...t.matchAll(/[rbuf]*(['"])(.*?)\1/g)].map((x) => x[2]); const one = str(t); return one === null ? [] : [one]; };
const kw = (args, name) => { const a = args.find((x) => new RegExp(`^${name}\\s*=`).test(x)); return a ? a.replace(new RegExp(`^${name}\\s*=\\s*`), '') : null; };
const AUTH = /(login|auth|permission|jwt|token|guard|role|require|protect|secure|user_passes_test|csrf_exempt)/i;
const VERB = { get: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', delete: 'DELETE', head: 'HEAD', options: 'OPTIONS' };

// Django/Pyramid style regex routes -> readable path: ^orders/(?P<pk>\d+)/$ -> orders/:pk
const fromRegex = (p) => p.replace(/^\^/, '').replace(/\$$/, '').replace(/\(\?P<(\w+)>[^)]*\)/g, ':$1').replace(/\\\//g, '/').replace(/\(\?:[^)]*\)\??/g, '').replace(/[()?]/g, '');

function analyzePythonRoutes(content, starts, file) {
  const routes = []; const mounts = [];
  const prefix = new Map(); // blueprint/router variable -> url prefix declared on it
  let m;
  // Blueprint('x', __name__, url_prefix='/x')   APIRouter(prefix='/x')   Router(prefix=..)   Namespace('x', path='/x')   web.RouteTableDef()
  const ctor = /\b(\w+)\s*(?::\s*[\w.]+)?\s*=\s*(?:[\w.]*\.)?(Blueprint|APIRouter|Router|Namespace|RouteTableDef|Api)\(/g;
  while ((m = ctor.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const args = splitArgs(content.slice(open + 1, close));
    const p = str(kw(args, 'url_prefix') || kw(args, 'prefix') || kw(args, 'path') || '');
    if (p) prefix.set(m[1], p);
  }
  // decorated functions: @app.route('/x', methods=['POST'])   @router.get('/x')   @http.route(['/a', '/b'], auth='user')   @route('/x')   @bp.post('/y')
  const dec = /^[ \t]*@(?:(\w+)\.)?(route|get|post|put|patch|delete|head|options|api_route|websocket|view_config)\s*\(/gm;
  while ((m = dec.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const args = splitArgs(content.slice(open + 1, close));
    if (!args.length) continue;
    const first = /^\w+\s*=/.test(args[0]) ? (kw(args, 'path') || kw(args, 'route_name') || '') : args[0];
    const paths = strList(first);
    if (!paths.length) continue;
    // the function this decorates (further decorators may sit in between)
    const after = content.slice(close + 1);
    const fn = /^((?:\s*@[^\n]*\n)*)\s*(?:async\s+)?def\s+(\w+)/.exec(after);
    const owner = m[1] || '';
    const decorators = (fn ? fn[1] : '').split('\n').map((l) => /@([\w.]+)/.exec(l)).filter(Boolean).map((x) => x[1]);
    const meths = kw(args, 'methods') || kw(args, 'method') || kw(args, 'request_method');
    let methods = meths ? strList(meths).map((x) => x.toUpperCase()) : null;
    const verb = m[2];
    if (VERB[verb]) methods = [VERB[verb]];
    else if (!methods || !methods.length) methods = owner === 'http' || verb === 'view_config' ? ['ANY'] : ['GET']; // Odoo/Pyramid: any method unless restricted
    const mw = decorators.filter((d) => AUTH.test(d));
    const authKw = kw(args, 'auth'); // Odoo: auth='public' | 'user' | 'none'
    if (authKw && /user/.test(authKw)) mw.push('auth:user');
    const line = lineAt(starts, m.index);
    for (const p of paths) for (const meth of methods) routes.push({ method: meth, path: (prefix.get(owner) || '') + p, line, framework: owner === 'http' ? 'odoo' : 'python-web', handler: fn ? fn[2] : null, inline: false, middleware: mw, file, owner });
  }
  // flask: app.add_url_rule('/x', view_func=v, methods=['GET'])    flask-restful: api.add_resource(Res, '/a', '/b')
  const rule = /\b(\w+)\.(add_url_rule|add_resource|add_api_route|add_route|add_websocket_route)\(/g;
  while ((m = rule.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const args = splitArgs(content.slice(open + 1, close));
    const isRes = m[2] === 'add_resource';
    const paths = isRes ? args.slice(1).map(str).filter((x) => x !== null && x.startsWith('/')) : [str(args[0])].filter((x) => x !== null);
    const meths = kw(args, 'methods');
    for (const p of paths) for (const meth of (meths ? strList(meths).map((x) => x.toUpperCase()) : ['ANY'])) routes.push({ method: meth, path: (prefix.get(m[1]) || '') + p, line: lineAt(starts, m.index), framework: 'python-web', handler: isRes ? args[0] : (kw(args, 'view_func') || kw(args, 'endpoint') || args[1] || null), inline: false, middleware: [], file, owner: m[1] });
  }
  // aiohttp:  app.router.add_get('/x', h)   web.get('/x', h)  inside routes list
  const aio = /\b(?:\w+\.)*(?:router\.)?(?:add_|web\.)?(get|post|put|patch|delete)\(\s*(['"])(\/[^'"]*)\2\s*,\s*([\w.]+)/g;
  while ((m = aio.exec(content))) { const before = content.slice(Math.max(0, m.index - 30), m.index); if (/\b(requests|session|client|http|httpx|axios)\.$/.test(before)) continue; if (/\bdef\s+$/.test(before)) continue; if (routes.some((r) => r.line === lineAt(starts, m.index))) continue; if (!/add_|web\.|router\./.test(content.slice(m.index, m.index + m[0].length))) continue; routes.push({ method: VERB[m[1]], path: m[3], line: lineAt(starts, m.index), framework: 'aiohttp', handler: m[4], inline: false, middleware: [], file, owner: 'router' }); }

  // Django: urlpatterns with path / re_path / url, include(...)
  const reg = new Map(); // DRF router var -> [{ prefix, viewset }]
  const rr = /\b(\w+)\.register\(\s*(r?['"][^'"]*['"])\s*,\s*([\w.]+)/g;
  while ((m = rr.exec(content))) (reg.get(m[1]) || reg.set(m[1], []).get(m[1])).push({ p: str(m[2]).replace(/^\/|\/$/g, ''), view: m[3], index: m.index });
  const incl = new Map(); // router var -> prefix of the include(router.urls) that exposes it
  const dj = /\b(path|re_path|url)\(\s*(r?['"][^'"]*['"])\s*,\s*/g;
  while ((m = dj.exec(content))) {
    const rest = content.slice(dj.lastIndex);
    const raw = str(m[2]);
    const p = m[1] === 'path' ? raw : fromRegex(raw);
    const full = `/${p.replace(/^\/+/, '')}`;
    const inc = /^include\(\s*(?:\(\s*)?([^,)]+)/.exec(rest);
    if (inc) {
      const target = inc[1].trim();
      const lit = str(target);
      const rv = /^(\w+)\.urls$/.exec(target);
      if (rv) incl.set(rv[1], full);
      else mounts.push({ path: full, ...(lit !== null ? { module: lit } : { target }), line: lineAt(starts, m.index), owner: 'urlpatterns' });
      continue;
    }
    const h = /^([\w.]+)(?:\.as_view\([^)]*\))?/.exec(rest);
    routes.push({ method: 'ANY', path: full, line: lineAt(starts, m.index), framework: 'django', handler: h ? h[1] : null, inline: false, middleware: [], file, owner: 'urlpatterns' });
  }
  for (const [rv, items] of reg) {
    const base = incl.get(rv) || '';
    for (const it of items) {
      const v = it.view.replace(/^.*\./, '');
      const actions = /(ReadOnly)/.test(v) ? [['GET', ''], ['GET', '/:pk']] : [['GET', ''], ['POST', ''], ['GET', '/:pk'], ['PUT', '/:pk'], ['PATCH', '/:pk'], ['DELETE', '/:pk']];
      for (const [meth, tail] of actions) routes.push({ method: meth, path: `${base}/${it.p}${tail}`, line: lineAt(starts, it.index), framework: 'drf', handler: it.view, inline: false, middleware: [], file, owner: rv });
    }
  }
  // app.register_blueprint(bp, url_prefix='/x')   app.include_router(router, prefix='/api')   app.mount('/x', sub)
  const reg2 = /\b\w+\.(register_blueprint|include_router|mount|register_namespace|add_namespace)\(/g;
  while ((m = reg2.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const args = splitArgs(content.slice(open + 1, close));
    const p = str(kw(args, 'url_prefix') || kw(args, 'prefix') || kw(args, 'path') || '') || (m[1] === 'mount' ? str(args[0]) : null) || '';
    const target = (m[1] === 'mount' ? args[1] : args[0]) || '';
    if (/^[\w.]+$/.test(target)) mounts.push({ path: p ? `/${p.replace(/^\/+/, '')}` : '', target, line: lineAt(starts, m.index), owner: 'app' });
  }
  return { routes, mounts };
}

// ---- models ----
const BASE_OK = /(\bModel\b|models\.Model|db\.Model|\bBase\b|DeclarativeBase|declarative_base|SQLModel|TransientModel|AbstractModel|\bDocument\b|EmbeddedDocument|Entity|\bTable\b|Mapped)/;
const BASE_NO = /(Schema|Serializer|Form\b|BaseModel|BaseSettings|Enum|TestCase|Exception|Error|APIView|ViewSet|View\b|Resource|Command|Admin|Config|Mixin\b)/;
const FIELD_CALL = /^\s+(\w+)\s*(?::\s*(?:Mapped\[((?:[^\[\]]|\[[^\]]*\])+)\]|[^=\n]+?))?\s*=\s*((?:[\w.]+\.)?(?:[A-Z]\w*(?:Field|Key)|Column|mapped_column|Char|Text|Integer|Float|Boolean|Date|Datetime|Selection|Many2one|One2many|Many2many|Binary|Html|Monetary|Reference|Json|Serialized|Id|String|Numeric|Decimal|ForeignKey|relationship))\(([^\n]*)\)\s*(?:#.*)?$/;

const PYTYPE = { str: 'string', int: 'int', float: 'float', bool: 'bool', bytes: 'bytes', dict: 'json', list: 'json' };
function fieldType(raw, mapped) {
  const last = String(raw).replace(/.*\./, '');
  const t = last.replace(/Field$/, '').replace(/^(Auto|BigAuto|SmallAuto)$/, 'int').toLowerCase();
  if (/^(column|mapped_column)$/.test(t) && mapped) { const inner = mapped.replace(/Optional\[|\]$/g, '').trim().toLowerCase(); return PYTYPE[inner] || inner; }
  return t || 'unknown';
}

// Classes that look like persisted models, with their fields and relations. `kind` says which framework pattern matched.
function findPythonModels(content, starts, file) {
  const lines = content.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const c = /^class\s+(\w+)\(([^)]*)\)\s*:/.exec(lines[i]);
    if (!c) continue;
    const bases = c[2];
    if (BASE_NO.test(bases) && !/table\s*=\s*True/.test(bases)) continue;
    if (/BaseModel/.test(bases) && !/table\s*=\s*True/.test(bases)) continue;
    let end = i; const fields = []; const relations = []; const meta = {};
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() && !/^\s/.test(lines[j])) break;
      end = j;
      const nm = /^\s+_(name|inherit|table|description)\s*=\s*['"]([^'"]+)['"]/.exec(lines[j]);
      if (nm) meta[nm[1]] = nm[2];
      const inh = /^\s+_inherit\s*=\s*\[\s*['"]([^'"]+)['"]/.exec(lines[j]); if (inh) meta.inherit = inh[1];
      const f = FIELD_CALL.exec(lines[j]);
      if (!f) { const sm = /^\s+(\w+)\s*:\s*(?:Optional\[)?([\w.]+)\]?\s*(?:=\s*Field\(|$)/.exec(lines[j]); if (sm && /SQLModel/.test(bases) && !['model_config', 'Config'].includes(sm[1])) fields.push({ name: sm[1], type: PYTYPE[sm[2]] || sm[2].toLowerCase(), args: lines[j], line: j + 1, raw: sm[2] }); continue; }
      const [, name, mapped, rawType, args] = f;
      if (/^(ForeignKey|relationship)$/.test(rawType.replace(/.*\./, ''))) { const tgt = /['"]?([\w.]+)['"]?/.exec(args); if (tgt && rawType.endsWith('relationship')) relations.push({ to: tgt[1], type: /uselist\s*=\s*False/.test(args) ? 'one-to-one' : 'one-to-many', via: name, line: j + 1 }); if (rawType.endsWith('ForeignKey')) continue; }
      const short = rawType.replace(/.*\./, '');
      if (/^(Many2one|ForeignKey|OneToOneField|OneToOne)$/.test(short)) { const tgt = /^\s*['"]?([\w.]+)['"]?/.exec(args); if (tgt) relations.push({ to: tgt[1], type: short === 'Many2one' || short === 'ForeignKey' ? 'many-to-one' : 'one-to-one', via: name, line: j + 1 }); }
      if (/^(One2many)$/.test(short)) { const tgt = /^\s*['"]?([\w.]+)['"]?/.exec(args); if (tgt) relations.push({ to: tgt[1], type: 'one-to-many', via: name, line: j + 1 }); }
      if (/^(Many2many|ManyToManyField|ManyToMany)$/.test(short)) { const tgt = /^\s*['"]?([\w.]+)['"]?/.exec(args); if (tgt) relations.push({ to: tgt[1], type: 'many-to-many', via: name, line: j + 1 }); }
      fields.push({ name, type: fieldType(rawType, mapped), args, line: j + 1, raw: short, mapped: mapped || null });
    }
    const looksModel = BASE_OK.test(bases) || fields.length >= 2;
    if (!looksModel || (!fields.length && !/models\.Model|db\.Model|\bBase\b|SQLModel|\bModel\b/.test(bases))) { i = Math.max(i, end - 1 > i ? i : i); continue; }
    const kind = /models\.Model/.test(bases) && !/Odoo|_name/.test(bases) && !meta.name && !meta.inherit && fields.some((f) => /Field$/.test(f.raw)) ? 'django' : meta.name || meta.inherit ? 'odoo' : /SQLModel/.test(bases) ? 'sqlmodel' : /Document/.test(bases) ? 'mongoengine' : /Column|mapped_column/.test(lines.slice(i, end + 1).join('\n')) ? 'sqlalchemy' : 'python-orm';
    const name = meta.name || meta.inherit || c[1];
    out.push({ name, className: c[1], kind, table: meta.table || (kind === 'odoo' ? (meta.name || meta.inherit || '').replace(/\./g, '_') : null), extension: !meta.name && !!meta.inherit, fields, relations, line: i + 1, endLine: end + 1 });
  }
  return out;
}

module.exports = { analyzePythonRoutes, findPythonModels, fromRegex };
