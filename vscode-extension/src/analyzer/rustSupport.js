// Rust: actix-web / rocket attribute routes, axum `.route(...)`, actix `web::scope/resource`; diesel `table!`, sea-orm and sqlx structs;
// `#[validate(...)]` rules from the validator crate.
const { lineAt, matchBrace, matchParen, splitArgs } = require('../utils/text');

function analyzeRustRoutes(content, starts, file) {
  const routes = [];
  let m;
  // #[get("/orders/{id}")] async fn get_order(...)     (actix, rocket: "/orders/<id>")
  const attr = /#\[(get|post|put|patch|delete|head|options)\s*\(\s*"([^"]*)"[^\]]*\]\s*(?:#\[[^\]]*\]\s*)*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g;
  while ((m = attr.exec(content))) routes.push({ method: m[1].toUpperCase(), path: m[2], line: lineAt(starts, m.index), framework: 'rust-web', handler: m[3], inline: false, middleware: [], file, owner: 'attr' });
  // axum:  Router::new().route("/orders", get(list).post(create))      actix: .route("/x", web::get().to(h))
  const rt = /\.route\(\s*"([^"]*)"\s*,/g;
  while ((m = rt.exec(content))) {
    const open = content.lastIndexOf('(', rt.lastIndex - 1);
    const close = matchParen(content, open);
    const inner = content.slice(rt.lastIndex, close === -1 ? rt.lastIndex + 300 : close);
    const verbs = [...inner.matchAll(/(?:^|[.\s(:])(get|post|put|patch|delete|head|options)\s*\(\s*([\w:]*)/g)].map((x) => [x[1], x[2]]);
    const toH = /\.to\(\s*([\w:]+)/.exec(inner);
    for (const [v, h] of (verbs.length ? verbs : [['any', '']])) routes.push({ method: v === 'any' ? 'ANY' : v.toUpperCase(), path: m[1], line: lineAt(starts, m.index), framework: 'rust-web', handler: h || (toH ? toH[1] : null), inline: false, middleware: [], file, owner: 'router' });
  }
  // actix scope prefix on the same builder chain: web::scope("/api").route(...)
  const scope = /web::scope\(\s*"([^"]*)"\s*\)/g;
  while ((m = scope.exec(content))) { const chain = content.slice(m.index, m.index + 1200); const end = chain.search(/\)\s*;|\)\s*\)\s*;/); const block = end === -1 ? chain : chain.slice(0, end); for (const r of routes) if (r.line >= lineAt(starts, m.index) && r.line <= lineAt(starts, m.index + block.length) && !r.path.startsWith(m[1])) r.path = `${m[1]}${r.path}`; }
  return routes;
}

const RT = { int2: 'int', int4: 'int', int8: 'int', bigint: 'int', integer: 'int', smallint: 'int', serial: 'int', text: 'string', varchar: 'string', bool: 'bool', float4: 'float', float8: 'float', numeric: 'decimal', timestamp: 'datetime', timestamptz: 'datetime', date: 'datetime', uuid: 'uuid', jsonb: 'json', json: 'json', bytea: 'bytes', i32: 'int', i64: 'int', i16: 'int', u32: 'int', u64: 'int', f32: 'float', f64: 'float', string: 'string', 'str': 'string', 'vec<u8>': 'bytes' };
const rtype = (t) => { const inner = String(t).replace(/^Option<(.*)>$/, '$1').replace(/^Nullable<(.*)>$/, '$1').replace(/<.*$/, '').trim().toLowerCase(); return RT[inner] || RT[String(t).trim().toLowerCase()] || (/datetime|naive/i.test(t) ? 'datetime' : /uuid/i.test(t) ? 'uuid' : inner); };

function analyzeRustModels(content, starts, file) {
  const entities = []; const validation = [];
  let m;
  // diesel: table! { orders (id) { id -> Int4, name -> Varchar, price -> Nullable<Numeric>, } }
  const dz = /(?:diesel::)?table!\s*\{/g;
  while ((m = dz.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    const body = content.slice(open + 1, end);
    for (const t of body.matchAll(/(\w+)\s*\(([^)]*)\)\s*\{([^}]*)\}/g)) {
      const pks = t[2].split(',').map((x) => x.trim());
      const fields = []; const line = lineAt(starts, open + 1 + t.index);
      for (const f of t[3].matchAll(/(\w+)\s*->\s*([\w<>]+)/g)) { const nullable = /^Nullable</.test(f[2]); fields.push({ name: f[1], type: rtype(f[2]), pk: pks.includes(f[1]), unique: pks.includes(f[1]), ...(nullable ? { nullable: true } : { nullable: false }) }); if (!nullable) validation.push({ kind: 'schema', field: f[1], rules: ['required'], line, status: 'VERIFIED' }); }
      entities.push({ name: t[1], table: t[1], kind: 'table', source: 'diesel', fields, file, line, endLine: lineAt(starts, open + 1 + t.index + t[0].length) });
    }
  }
  // structs: sea-orm (DeriveEntityModel), sqlx FromRow, diesel Queryable/Insertable, serde+validate DTOs
  const sre = /((?:#\[[^\]]*\]\s*)+)(?:pub\s+)?struct\s+(\w+)\s*(?:<[^>]*>)?\s*\{/g;
  while ((m = sre.exec(content))) {
    const attrs = m[1];
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    const fieldsSrc = content.slice(open + 1, end);
    const isEntity = /DeriveEntityModel|FromRow|Queryable|Insertable|Selectable|sea_orm\s*\(\s*table_name/.test(attrs);
    const fields = [];
    for (const f of fieldsSrc.matchAll(/((?:\s*#\[[^\]]*\]\s*)*)\s*(?:pub\s+)?(\w+)\s*:\s*([\w:<>,&'\s]+?)\s*,?\s*(?:\n|$)/g)) {
      const fa = f[1] || ''; const name = f[2]; const type = f[3].trim();
      const line = lineAt(starts, open + 1 + f.index + fa.length);
      const optional = /^Option</.test(type);
      const rules = [];
      const v = /#\[validate\(([\s\S]*?)\)\]/.exec(fa);
      if (v) { if (/email/.test(v[1])) rules.push('type(email)'); if (/url/.test(v[1])) rules.push('type(url)'); const ln = /length\(([^)]*)\)/.exec(v[1]); if (ln) { const mn = /min\s*=\s*(\d+)/.exec(ln[1]); const mx = /max\s*=\s*(\d+)/.exec(ln[1]); if (mn) rules.push(`minlength(${mn[1]})`); if (mx) rules.push(`maxlength(${mx[1]})`); } const rg = /range\(([^)]*)\)/.exec(v[1]); if (rg) { const mn = /min\s*=\s*([-\d.]+)/.exec(rg[1]); const mx = /max\s*=\s*([-\d.]+)/.exec(rg[1]); if (mn) rules.push(`min(${mn[1]})`); if (mx) rules.push(`max(${mx[1]})`); } if (/regex/.test(v[1])) rules.push('pattern'); if (/custom/.test(v[1])) rules.push('custom validator'); }
      if (v && !optional) rules.unshift('required');
      if (isEntity) { const pk = /primary_key/.test(fa) || name === 'id'; fields.push({ name, type: rtype(type), pk, unique: pk, nullable: optional }); if (!optional || pk) rules.unshift('required'); if (pk) rules.push('unique'); }
      if (rules.length) validation.push({ kind: isEntity ? 'schema' : 'rust-validator', field: name, rules: [...new Set(rules)], line, status: 'VERIFIED' });
    }
    if (isEntity) { const tn = /table_name\s*=\s*"([^"]+)"/.exec(attrs); entities.push({ name: tn ? tn[1] : m[2], ...(tn ? { table: tn[1] } : {}), kind: 'model', source: /DeriveEntityModel/.test(attrs) ? 'sea-orm' : /FromRow/.test(attrs) ? 'sqlx' : 'diesel', fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) }); }
  }
  return { entities, validation };
}

module.exports = { analyzeRustRoutes, analyzeRustModels };
