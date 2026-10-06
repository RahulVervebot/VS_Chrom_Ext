// Ruby on Rails: config/routes.rb (resources, namespaces, scopes, member/collection), db/schema.rb tables, ActiveRecord models
// (associations, validations). Sinatra-style `get '/x' do` is handled too. Pattern-based with line evidence.
const { lineAt } = require('../utils/text');

const REST = [['index', 'GET', ''], ['create', 'POST', ''], ['new', 'GET', '/new'], ['show', 'GET', '/:id'], ['edit', 'GET', '/:id/edit'], ['update', 'PATCH', '/:id'], ['update', 'PUT', '/:id'], ['destroy', 'DELETE', '/:id']];
const symList = (s) => (s ? [...s.matchAll(/:(\w+)/g)].map((x) => x[1]) : []);
const strArg = (s) => { const m = /['"]([^'"]+)['"]/.exec(s || ''); return m ? m[1] : null; };

function analyzeRailsRoutes(content, starts, file) {
  if (!/(\.routes\.draw|^\s*resources?\s+:|^\s*namespace\s+:|^\s*root\s)/m.test(content) && !/(^|\/)routes\.rb$/.test(file)) return analyzeSinatra(content, starts, file);
  const routes = [];
  const stack = []; // { kind: 'ns'|'scope'|'res'|'member'|'collection'|'block', prefix, param }
  const prefix = () => stack.reduce((p, s) => p + (s.prefix || ''), '');
  const push = (method, path, line, handler, mw = []) => routes.push({ method, path: `${prefix()}${path}` || '/', line, framework: 'rails', handler, inline: false, middleware: mw, file, owner: 'routes' });
  const lines = content.split('\n');
  lines.forEach((raw, i) => {
    const ln = raw.replace(/(^|\s)#(?!\w+['"]).*$/, '$1').trim(); // a trailing comment, but not the # inside 'orders#index'
    if (!ln) return;
    const line = i + 1;
    const opens = /\bdo(\s*\|[^|]*\|)?\s*$/.test(ln) || /\{\s*$/.test(ln) && /^(namespace|scope|resources?|member|collection|constraints|concern)/.test(ln);
    let m;
    if ((m = /^namespace\s+:(\w+)/.exec(ln))) { if (opens) stack.push({ kind: 'ns', prefix: `/${m[1]}` }); return; }
    if ((m = /^scope\b(.*)/.exec(ln))) { const p = /(?:path:\s*)?['"]([^'"]*)['"]/.exec(m[1]) || /^\s*\(?\s*:(\w+)/.exec(m[1]); if (opens) stack.push({ kind: 'scope', prefix: p ? `/${String(p[1]).replace(/^\//, '')}` : '' }); return; }
    if ((m = /^(?:constraints|defaults|concern|devise_scope|authenticate|authenticated)\b.*/.exec(ln))) { if (opens) stack.push({ kind: 'block' }); return; }
    if ((m = /^(resources|resource)\s+:(\w+)(.*)$/.exec(ln))) {
      const [, kind, name, rest] = m;
      const only = /only:\s*\[([^\]]*)\]/.exec(rest) || /only:\s*:(\w+)/.exec(rest);
      const except = /except:\s*\[([^\]]*)\]/.exec(rest) || /except:\s*:(\w+)/.exec(rest);
      const lst = (x) => (x ? (/^\w+$/.test(x[1]) ? [x[1]] : symList(x[1])) : null);
      const onlyL = lst(only); const exceptL = lst(except) || [];
      const singular = kind === 'resource';
      const base = `/${name}`;
      for (const [action, method, tail] of REST) {
        if (onlyL && !onlyL.includes(action)) continue;
        if (exceptL.includes(action)) continue;
        if (singular && (action === 'index' || action === 'show' || action === 'update' || action === 'destroy' || action === 'edit') && false) continue;
        const t = singular ? tail.replace('/:id', '') : tail;
        if (singular && action === 'index') continue;
        push(method, `${base}${t}`, line, `${name}#${action}`);
      }
      if (opens) stack.push({ kind: 'res', prefix: singular ? base : `${base}/:${name.replace(/s$/, '')}_id`, name });
      return;
    }
    if ((m = /^(member|collection)\s*\{(.*)\}\s*$/.exec(ln))) { // member { get :preview } on one line
      const ri = stack.map((s) => s.kind).lastIndexOf('res'); const res = ri >= 0 ? stack[ri] : null;
      const pre = stack.slice(0, ri >= 0 ? ri : stack.length).reduce((p, s) => p + (s.prefix || ''), '');
      for (const stmt of m[2].split(';')) { const v = /^\s*(get|post|put|patch|delete)\s+:?['"]?([\w/-]+)/.exec(stmt); if (v) routes.push({ method: v[1].toUpperCase(), path: `${pre}/${res ? res.name : ''}${m[1] === 'member' ? '/:id' : ''}/${v[2]}`, line, framework: 'rails', handler: res ? `${res.name}#${v[2]}` : null, inline: false, middleware: [], file, owner: 'routes' }); }
      return;
    }
    if ((m = /^(member|collection)\s+do/.exec(ln))) { const ri = stack.map((s) => s.kind).lastIndexOf('res'); const res = ri >= 0 ? stack[ri] : null; const pre = stack.slice(0, ri >= 0 ? ri : stack.length).reduce((p, s) => p + (s.prefix || ''), ''); stack.push({ kind: m[1], prefix: '', base: `${pre}${res ? `/${res.name}` : ''}${m[1] === 'member' ? '/:id' : ''}`, res: res ? res.name : null, absolute: true }); return; }
    if ((m = /^root\s+(?:to:\s*)?['"]([^'"]+)['"]/.exec(ln)) || (m = /^root\s+to:\s*['"]([^'"]+)['"]/.exec(ln))) { routes.push({ method: 'GET', path: `${prefix()}/` || '/', line, framework: 'rails', handler: m[1], inline: false, middleware: [], file, owner: 'routes' }); return; }
    if ((m = /^(get|post|put|patch|delete|match)\s+(.*)$/.exec(ln))) {
      const [, verb, rest] = m;
      const first = /^\s*['"]([^'"]*)['"]/.exec(rest) || /^\s*:(\w+)/.exec(rest) || /^\s*['"]?([\w/:-]+)['"]?\s*=>/.exec(rest);
      if (!first) return;
      const to = /(?:to:\s*|=>\s*)['"]([^'"]+)['"]/.exec(rest);
      const via = /via:\s*\[([^\]]*)\]/.exec(rest) || /via:\s*:(\w+)/.exec(rest);
      const methods = verb === 'match' ? (via ? symList(via[1] ? via[1] : via[0]).map((x) => x.toUpperCase()) : ['ANY']) : [verb.toUpperCase()];
      const inner = stack[stack.length - 1];
      const memberBase = inner && (inner.kind === 'member' || inner.kind === 'collection') ? inner.base : null;
      const symbolAction = /^\s*:(\w+)/.exec(rest);
      const seg = first[1].startsWith('/') ? first[1] : `/${first[1]}`;
      for (const meth of methods) {
        if (memberBase !== null) routes.push({ method: meth, path: `${memberBase}${seg}`, line, framework: 'rails', handler: to ? to[1] : (symbolAction && inner.res ? `${inner.res}#${symbolAction[1]}` : null), inline: false, middleware: [], file, owner: 'routes' });
        else push(meth, seg, line, to ? to[1] : null);
      }
      return;
    }
    if (/^end\b/.test(ln)) { stack.pop(); return; }
    if (opens) stack.push({ kind: 'block' });
  });
  return routes;
}

// Sinatra / Grape style:  get '/orders/:id' do ... end
function analyzeSinatra(content, starts, file) {
  const routes = [];
  const re = /^[ \t]*(get|post|put|patch|delete)\s+['"](\/[^'"]*)['"][^\n]*\bdo\b/gm;
  let m;
  while ((m = re.exec(content))) routes.push({ method: m[1].toUpperCase(), path: m[2], line: lineAt(starts, m.index), framework: 'sinatra', handler: null, inline: true, middleware: [], file, owner: 'app' });
  return routes;
}

const SQL_TYPE = { string: 'string', text: 'string', integer: 'int', bigint: 'int', float: 'float', decimal: 'decimal', boolean: 'bool', date: 'datetime', datetime: 'datetime', timestamp: 'datetime', time: 'datetime', json: 'json', jsonb: 'json', binary: 'bytes', uuid: 'uuid', references: 'int', belongs_to: 'int' };

// db/schema.rb
function analyzeRailsSchema(content, starts, file) {
  const entities = []; const relationships = []; const indexes = []; const validation = [];
  const tre = /create_table\s+["'](\w+)"?'?[^\n]*\bdo\s*\|(\w+)\|/g;
  let m;
  while ((m = tre.exec(content))) {
    const name = m[1]; const v = m[2];
    const end = content.indexOf('\nend', m.index);
    const body = content.slice(m.index + m[0].length, end === -1 ? undefined : end);
    const baseLine = lineAt(starts, m.index);
    const fields = [{ name: 'id', type: 'int', pk: true, unique: false }];
    const col = new RegExp(`${v}\\.(\\w+)\\s+["'](\\w+)["']([^\\n]*)`, 'g');
    let c;
    while ((c = col.exec(body))) {
      if (c[1] === 'index') continue;
      const opts = c[3];
      fields.push({ name: c[2], type: SQL_TYPE[c[1]] || c[1], pk: false, unique: false, nullable: /null:\s*false/.test(opts) ? false : undefined, ...(/limit:\s*(\d+)/.test(opts) ? { limit: Number(/limit:\s*(\d+)/.exec(opts)[1]) } : {}), ...(/default:\s*([^,\n]+)/.test(opts) ? { default: /default:\s*([^,\n]+)/.exec(opts)[1].trim() } : {}) });
      if (c[1] === 'references' || c[1] === 'belongs_to') relationships.push({ from: name, to: c[2], type: 'many-to-one', via: `${name}.${c[2]}_id`, file, line: baseLine, source: 'rails-schema' });
    }
    for (const t of body.matchAll(new RegExp(`${v}\\.timestamps`, 'g'))) { fields.push({ name: 'created_at', type: 'datetime', pk: false, unique: false, nullable: false }, { name: 'updated_at', type: 'datetime', pk: false, unique: false, nullable: false }); void t; }
    for (const ix of body.matchAll(new RegExp(`${v}\\.index\\s+\\[([^\\]]*)\\]([^\\n]*)`, 'g'))) { const cols = [...ix[1].matchAll(/["'](\w+)["']/g)].map((x) => x[1]); indexes.push({ entity: name, columns: cols, unique: /unique:\s*true/.test(ix[2]), file, line: baseLine }); if (/unique:\s*true/.test(ix[2]) && cols.length === 1) { const f = fields.find((x) => x.name === cols[0]); if (f) f.unique = true; } }
    for (const f of fields) { const rules = []; if (f.nullable === false || f.pk) rules.push('required'); if (f.unique || f.pk) rules.push('unique'); if (f.limit) rules.push(`maxlength(${f.limit})`); if (f.default !== undefined) rules.push(`default(${String(f.default).replace(/^["']|["']$/g, '')})`); if (rules.length) validation.push({ kind: 'schema', field: f.name, rules, line: baseLine, status: 'VERIFIED' }); }
    entities.push({ name, table: name, kind: 'table', source: 'rails-schema', fields: fields.map((f) => ({ name: f.name, type: f.type, pk: f.pk, unique: f.unique, ...(f.nullable === false ? { nullable: false } : {}) })), file, line: baseLine, endLine: lineAt(starts, end === -1 ? content.length - 1 : end) });
  }
  for (const fk of content.matchAll(/add_foreign_key\s+["'](\w+)["']\s*,\s*["'](\w+)["']/g)) relationships.push({ from: fk[1], to: fk[2], type: 'many-to-one', via: `${fk[1]} -> ${fk[2]}`, file, line: lineAt(starts, fk.index), source: 'rails-schema' });
  return { entities, relationships, indexes, validation };
}

// app/models/*.rb
function analyzeRailsModels(content, starts, file) {
  const entities = []; const relationships = []; const validation = [];
  const re = /^class\s+(\w+)\s*<\s*([\w:]+)/gm;
  let m;
  while ((m = re.exec(content))) {
    if (!/(ApplicationRecord|ActiveRecord::Base|[\w]+Record)$/.test(m[2])) continue;
    const name = m[1];
    const rest = content.slice(m.index);
    const endIdx = rest.search(/^end\b/m);
    const body = endIdx === -1 ? rest : rest.slice(0, endIdx);
    const baseLine = lineAt(starts, m.index);
    const fields = [];
    for (const a of body.matchAll(/^\s*(belongs_to|has_many|has_one|has_and_belongs_to_many)\s+:(\w+)([^\n]*)/gm)) {
      const cls = (/class_name:\s*['"](\w+)['"]/.exec(a[3]) || [])[1] || a[2].replace(/ies$/, 'y').replace(/s$/, '').replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
      relationships.push({ from: name, to: cls, type: { belongs_to: 'many-to-one', has_many: 'one-to-many', has_one: 'one-to-one', has_and_belongs_to_many: 'many-to-many' }[a[1]], via: `${name}.${a[2]}`, file, line: baseLine + body.slice(0, a.index).split('\n').length - 1, source: 'activerecord' });
      if (a[1] === 'belongs_to') fields.push({ name: `${a[2]}_id`, type: 'int', pk: false, unique: false, nullable: /optional:\s*true/.test(a[3]) ? true : false });
    }
    for (const v of body.matchAll(/^\s*validates\s+((?::\w+\s*,\s*)*:\w+)\s*,\s*([^\n]*)/gm)) {
      const attrs = [...v[1].matchAll(/:(\w+)/g)].map((x) => x[1]);
      const rules = [];
      const o = v[2];
      if (/presence:\s*true/.test(o)) rules.push('required');
      if (/uniqueness:\s*(true|\{)/.test(o)) rules.push('unique');
      const len = /length:\s*\{([^}]*)\}/.exec(o);
      if (len) { for (const k of ['minimum', 'maximum', 'is', 'in']) { const x = new RegExp(`${k}:\\s*([^,}]+)`).exec(len[1]); if (x) rules.push(`${{ minimum: 'minlength', maximum: 'maxlength', is: 'length', in: 'length-range' }[k]}(${x[1].trim()})`); } }
      const num = /numericality:\s*(true|\{([^}]*)\})/.exec(o);
      if (num) { rules.push('number'); if (num[2]) for (const x of num[2].matchAll(/(greater_than_or_equal_to|greater_than|less_than_or_equal_to|less_than|only_integer|equal_to):\s*([^,}]+)/g)) rules.push(`${{ greater_than_or_equal_to: 'min', greater_than: 'greater', less_than_or_equal_to: 'max', less_than: 'less', only_integer: 'integer', equal_to: 'equal' }[x[1]]}(${x[2].trim()})`); }
      if (/format:/.test(o)) rules.push(/URI|email/i.test(o) ? 'type(email)' : 'pattern');
      if (/inclusion:/.test(o)) rules.push('enum');
      const line = baseLine + body.slice(0, v.index).split('\n').length - 1;
      for (const attr of attrs) { validation.push({ kind: 'rails-validation', field: attr, rules, line, status: 'VERIFIED' }); if (!fields.some((f) => f.name === attr)) fields.push({ name: attr, type: 'unknown', pk: false, unique: rules.includes('unique') }); }
    }
    for (const v of body.matchAll(/^\s*validates_(presence|uniqueness|length|numericality|format|inclusion)_of\s+((?::\w+\s*,?\s*)+)([^\n]*)/gm)) {
      const rule = { presence: 'required', uniqueness: 'unique', length: 'length', numericality: 'number', format: 'pattern', inclusion: 'enum' }[v[1]];
      const line = baseLine + body.slice(0, v.index).split('\n').length - 1;
      for (const attr of [...v[2].matchAll(/:(\w+)/g)].map((x) => x[1])) { validation.push({ kind: 'rails-validation', field: attr, rules: [rule], line, status: 'VERIFIED' }); if (!fields.some((f) => f.name === attr)) fields.push({ name: attr, type: 'unknown', pk: false, unique: rule === 'unique' }); }
    }
    for (const e of body.matchAll(/^\s*enum\s+:?(\w+)/gm)) if (!fields.some((f) => f.name === e[1])) fields.push({ name: e[1], type: 'enum', pk: false, unique: false });
    const table = (/self\.table_name\s*=\s*['"](\w+)['"]/.exec(body) || [])[1] || `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}s`;
    entities.push({ name, table, kind: 'model', source: 'activerecord', fields, file, line: baseLine, endLine: baseLine + body.split('\n').length - 1 });
  }
  return { entities, relationships, validation };
}

module.exports = { analyzeRailsRoutes, analyzeRailsSchema, analyzeRailsModels };
