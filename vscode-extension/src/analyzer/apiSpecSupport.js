// Machine-readable API descriptions are the most reliable evidence of an API, in any language:
// OpenAPI / Swagger (JSON or YAML), Protocol Buffers services and GraphQL schemas.
const YAML = require('yaml');
const { lineAt } = require('../utils/text');

const SPEC_NAME = /(^|\/)[\w.-]*?(openapi|swagger|api[-_.]?(spec|docs?|definition))[^/]*\.(json|ya?ml)$/i;
const isApiSpecFile = (p, language) => (['json', 'yaml'].includes(language) && SPEC_NAME.test(p)) || language === 'protobuf' || language === 'graphql';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

function openApi(path, content, language) {
  let doc;
  try { doc = language === 'json' ? JSON.parse(content) : YAML.parse(content); } catch { return { routes: [], validation: [] }; }
  if (!doc || typeof doc !== 'object' || !(doc.openapi || doc.swagger) || !doc.paths) return { routes: [], validation: [] };
  const routes = []; const validation = [];
  const globalSecurity = Array.isArray(doc.security) && doc.security.length > 0;
  const deref = (s, depth = 0) => { if (!s || typeof s !== 'object' || depth > 6) return s; if (s.$ref) { const parts = String(s.$ref).replace(/^#\//, '').split('/'); let cur = doc; for (const p of parts) cur = cur && cur[p.replace(/~1/g, '/').replace(/~0/g, '~')]; return deref(cur, depth + 1); } return s; };
  const ruleList = (schema, required) => {
    const r = [];
    if (required) r.push('required');
    if (schema.type && ['string', 'integer', 'number', 'boolean', 'array', 'object'].includes(schema.type) && schema.type !== 'string') r.push(`type(${schema.type})`);
    if (schema.format) r.push(`type(${schema.format})`);
    if (schema.minLength !== undefined) r.push(`minlength(${schema.minLength})`); if (schema.maxLength !== undefined) r.push(`maxlength(${schema.maxLength})`);
    if (schema.minimum !== undefined) r.push(`min(${schema.minimum})`); if (schema.maximum !== undefined) r.push(`max(${schema.maximum})`);
    if (schema.pattern) r.push('pattern'); if (Array.isArray(schema.enum)) r.push('enum'); if (schema.minItems !== undefined) r.push(`minitems(${schema.minItems})`); if (schema.maxItems !== undefined) r.push(`maxitems(${schema.maxItems})`);
    if (schema.nullable === false) r.push('notnull');
    return r;
  };
  const seen = new Set();
  const walk = (schemaIn, owner, depth = 0) => {
    const schema = deref(schemaIn);
    if (!schema || typeof schema !== 'object' || depth > 3) return;
    const key = `${owner}`; if (seen.has(key) && depth > 0) return; seen.add(key);
    const req = new Set(Array.isArray(schema.required) ? schema.required : []);
    for (const [name, raw] of Object.entries(schema.properties || {})) {
      const prop = deref(raw);
      if (!prop) continue;
      const rules = ruleList(prop, req.has(name));
      if (rules.length) validation.push({ kind: 'openapi', field: name, rules, line: 1, status: 'VERIFIED' });
      if (prop.type === 'object' || prop.properties) walk(prop, `${owner}.${name}`, depth + 1);
      if (prop.type === 'array' && prop.items) walk(prop.items, `${owner}.${name}[]`, depth + 1);
    }
    for (const part of [].concat(schema.allOf || [], schema.oneOf || [], schema.anyOf || [])) walk(part, owner, depth + 1);
  };
  for (const [p, item] of Object.entries(doc.paths)) {
    if (!item || typeof item !== 'object') continue;
    for (const m of METHODS) {
      const op = item[m];
      if (!op || typeof op !== 'object') continue;
      const secured = Array.isArray(op.security) ? op.security.length > 0 : globalSecurity;
      routes.push({ method: m.toUpperCase(), path: p, line: 1, framework: 'openapi', handler: op.operationId || null, inline: false, middleware: secured ? ['security'] : [], file: path, owner: 'openapi', summary: op.summary || null });
      for (const prm of [].concat(item.parameters || [], op.parameters || [])) { const pr = deref(prm); if (pr && pr.name) { const rules = ruleList(deref(pr.schema) || {}, !!pr.required); if (rules.length) validation.push({ kind: 'openapi', field: pr.name, rules, line: 1, status: 'VERIFIED' }); } }
      const body = deref(op.requestBody);
      if (body && body.content) for (const media of Object.values(body.content)) walk(media && media.schema, `${m}:${p}`);
      else if (op.parameters) for (const prm of op.parameters.map(deref)) if (prm && prm.in === 'body') walk(prm.schema, `${m}:${p}`);
    }
  }
  for (const [name, s] of Object.entries((doc.components && doc.components.schemas) || doc.definitions || {})) walk(s, `schema:${name}`);
  const uniq = new Set();
  return { routes, validation: validation.filter((v) => { const k = `${v.field}|${v.rules.join(',')}`; if (uniq.has(k)) return false; uniq.add(k); return true; }) };
}

function protobuf(path, content) {
  const routes = []; const starts = require('../utils/text').lineIndex(content);
  const code = content.replace(/\/\/.*$/gm, '');
  for (const s of code.matchAll(/\bservice\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) for (const r of s[2].matchAll(/\brpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)\s*\)/g)) routes.push({ method: 'RPC', path: `/${s[1]}/${r[1]}`, line: lineAt(starts, s.index), framework: 'grpc', handler: r[1], inline: false, middleware: [], file: path, owner: s[1] });
  // google.api.http annotations map an rpc to REST
  for (const h of code.matchAll(/rpc\s+(\w+)[^{;]*\{[^}]*?\(google\.api\.http\)\s*=\s*\{[^}]*?(get|post|put|patch|delete)\s*:\s*"([^"]+)"/g)) routes.push({ method: h[2].toUpperCase(), path: h[3], line: lineAt(starts, h.index), framework: 'grpc-gateway', handler: h[1], inline: false, middleware: [], file: path, owner: 'proto' });
  return { routes, validation: [] };
}

function graphql(path, content) {
  const routes = []; const validation = [];
  const starts = require('../utils/text').lineIndex(content);
  const code = content.replace(/#.*$/gm, '').replace(/"""[\s\S]*?"""/g, (m) => m.replace(/[^\n]/g, ' '));
  for (const t of code.matchAll(/\b(?:extend\s+)?type\s+(Query|Mutation|Subscription)\b[^{]*\{([\s\S]*?)\n\}/g)) {
    const kind = t[1].toUpperCase();
    for (const f of t[2].matchAll(/^\s*(\w+)\s*(?:\(([^)]*)\))?\s*:\s*([^\n@]+)/gm)) {
      routes.push({ method: kind, path: `/graphql/${f[1]}`, line: lineAt(starts, t.index), framework: 'graphql', handler: f[1], inline: false, middleware: /@(auth|authenticated|hasRole|requireAuth)/.test(t[2].slice(t[2].indexOf(f[0]), t[2].indexOf('\n', t[2].indexOf(f[0]) + 1) === -1 ? undefined : t[2].indexOf('\n', t[2].indexOf(f[0]) + 1))) ? ['auth'] : [], file: path, owner: t[1] });
      if (f[2]) for (const a of f[2].matchAll(/(\w+)\s*:\s*([\w\[\]!]+)/g)) if (a[2].endsWith('!')) validation.push({ kind: 'graphql', field: a[1], rules: ['required'], line: lineAt(starts, t.index), status: 'VERIFIED' });
    }
  }
  for (const t of code.matchAll(/\b(?:input|type)\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) { if (/^(Query|Mutation|Subscription)$/.test(t[1])) continue; for (const f of t[2].matchAll(/^\s*(\w+)\s*:\s*([\w\[\]!]+)/gm)) if (f[2].endsWith('!')) validation.push({ kind: 'graphql', field: f[1], rules: ['required'], line: lineAt(starts, t.index), status: 'VERIFIED' }); }
  return { routes, validation };
}

function analyzeApiSpec(path, language, content) {
  if (language === 'protobuf') return protobuf(path, content);
  if (language === 'graphql') return graphql(path, content);
  return openApi(path, content, language);
}

module.exports = { isApiSpecFile, analyzeApiSpec, SPEC_NAME };
