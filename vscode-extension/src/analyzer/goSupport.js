// Go: HTTP routes (gin, echo, fiber, chi, gorilla/mux, net/http), GORM/sqlx models, struct-tag validation and GORM calls.
// Pattern-based like the other analyzers: each result carries file + line and is resolved against known entities later.
const { lineAt, matchBrace, matchParen, splitArgs } = require('../utils/text');

const unq = (s) => { const m = /^\s*["`](.*)["`]\s*$/s.exec(s || ''); return m ? m[1] : null; };
const ident = (s) => { const m = /^\s*&?([\w.]+)(?:\(\s*\))?\s*$/.exec(s || ''); return m ? m[1] : null; };
const VERBS = { GET: 'GET', POST: 'POST', PUT: 'PUT', PATCH: 'PATCH', DELETE: 'DELETE', HEAD: 'HEAD', OPTIONS: 'OPTIONS', Get: 'GET', Post: 'POST', Put: 'PUT', Patch: 'PATCH', Delete: 'DELETE', Head: 'HEAD', Options: 'OPTIONS', Any: 'ANY', All: 'ANY' };

function analyzeGoRoutes(content, starts, file) {
  const routes = [];
  const prefix = new Map(); // router/group variable -> path prefix
  const mw = new Map(); // router/group variable -> middleware names
  let m;
  // api := r.Group("/api", AuthRequired())      v1 := api.Group("/v1")
  const group = /\b(\w+)\s*:?=\s*(\w+)\.Group\(/g;
  const groups = [];
  while ((m = group.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const args = splitArgs(content.slice(open + 1, close));
    groups.push({ v: m[1], parent: m[2], path: unq(args[0]) || '', mw: args.slice(1).map(ident).filter(Boolean) });
  }
  const resolve = (v, depth = 0) => {
    const g = groups.find((x) => x.v === v);
    if (!g || depth > 6) return { path: '', mw: [] };
    const up = resolve(g.parent, depth + 1);
    return { path: up.path + g.path, mw: [...up.mw, ...g.mw] };
  };
  for (const g of groups) { const r = resolve(g.v); prefix.set(g.v, r.path); mw.set(g.v, r.mw); }
  // api.Use(AuthRequired())
  const use = /\b(\w+)\.Use\(/g;
  while ((m = use.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close !== -1) mw.set(m[1], [...(mw.get(m[1]) || []), ...splitArgs(content.slice(open + 1, close)).map(ident).filter(Boolean)]);
  }
  // chi: r.Route("/orders", func(r chi.Router) { ... })  — routes inside the closure get its prefix
  const chiRanges = [];
  const route = /\b(\w+)\.Route\(\s*(["`][^"`]*["`])\s*,\s*func\(\s*(\w+)\s+[\w.*]*Router\s*\)\s*\{/g;
  while ((m = route.exec(content))) { const open = m.index + m[0].length - 1; chiRanges.push({ outer: m[1], inner: m[3], path: unq(m[2]), start: open, end: matchBrace(content, open) }); }
  const chiPrefix = (idx, v) => { let p = ''; let cur = v; for (let guard = 0; guard < 8; guard++) { const r = chiRanges.filter((x) => x.start < idx && idx < x.end && x.inner === cur).sort((a, b) => b.start - a.start)[0]; if (!r) break; p = r.path + p; cur = r.outer; idx = r.start; } return p; };

  // gin / echo / fiber / chi:  r.GET("/x", mw..., handler)   r.Get("/x", handler)   app.Post("/x", h)
  const verb = /\b(\w+)\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Any|Get|Post|Put|Patch|Delete|Head|Options|All)\(/g;
  while ((m = verb.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const args = splitArgs(content.slice(open + 1, close));
    const p = unq(args[0]);
    if (p === null || !(p.startsWith('/') || p === '' || p === '*')) continue; // db.Get("key"), client.Get("http://...") are not routes
    const rest = args.slice(1);
    const owner = m[1];
    const full = (chiPrefix(m.index, owner) || '') + (prefix.get(owner) || '') + p;
    routes.push({ method: VERBS[m[2]], path: full || '/', line: lineAt(starts, m.index), framework: 'go-http', handler: ident(rest[rest.length - 1]) , inline: /^\s*func\b/.test(rest[rest.length - 1] || ''), middleware: [...(mw.get(owner) || []), ...rest.slice(0, -1).map(ident).filter(Boolean)], file, owner });
  }
  // gorilla/mux: r.HandleFunc("/orders/{id}", h).Methods("GET", "PUT")
  const mux = /\b(\w+)\.(?:HandleFunc|Handle)\(\s*(["`][^"`]*["`])\s*,\s*([^)]*)\)\s*\.Methods\(([^)]*)\)/g;
  while ((m = mux.exec(content))) for (const meth of m[4].split(',').map(unq).filter(Boolean)) routes.push({ method: meth.toUpperCase(), path: (prefix.get(m[1]) || '') + unq(m[2]), line: lineAt(starts, m.index), framework: 'go-mux', handler: ident(m[3].split(',').pop()), inline: false, middleware: [], file, owner: m[1] });
  // net/http: http.HandleFunc("/x", h)   mux.HandleFunc("GET /x/{id}", h) (Go 1.22 patterns)
  const std = /\b\w+\.(?:HandleFunc|Handle)\(\s*(["`][^"`]*["`])\s*,\s*([^)]*)\)(?!\s*\.Methods)/g;
  while ((m = std.exec(content))) {
    const pat = unq(m[1]);
    const mm = /^([A-Z]+)\s+(\/.*)$/.exec(pat);
    if (!mm && !pat.startsWith('/')) continue;
    if (routes.some((r) => r.line === lineAt(starts, m.index))) continue;
    routes.push({ method: mm ? mm[1] : 'ANY', path: mm ? mm[2] : pat, line: lineAt(starts, m.index), framework: 'go-nethttp', handler: ident(m[2].split(',').pop()), inline: /func\b/.test(m[2]), middleware: [], file, owner: 'http' });
  }
  return routes;
}

// ---- structs ----
const GO_TYPES = { string: 'string', bool: 'bool', int: 'int', int8: 'int', int16: 'int', int32: 'int', int64: 'int', uint: 'int', uint8: 'int', uint16: 'int', uint32: 'int', uint64: 'int', float32: 'float', float64: 'float', byte: 'byte', rune: 'int' };
function goType(raw) {
  const t = raw.replace(/^\*/, '').replace(/^\[\](?!byte)/, '');
  if (GO_TYPES[t]) return GO_TYPES[t];
  if (/^\[\]byte$/.test(raw)) return 'bytes';
  if (/time\.Time$|gorm\.DeletedAt$|sql\.NullTime$/.test(t)) return 'datetime';
  if (/uuid\.UUID$|UUID$/.test(t)) return 'uuid';
  if (/decimal\.Decimal$/.test(t)) return 'decimal';
  if (/sql\.Null(String)$/.test(t)) return 'string';
  if (/sql\.Null(Int\d*|Int64)$/.test(t)) return 'int';
  if (/sql\.NullBool$/.test(t)) return 'bool';
  if (/sql\.NullFloat64$/.test(t)) return 'float';
  if (/datatypes\.JSON|json\.RawMessage|jsonb|JSONB/i.test(t)) return 'json';
  return t.replace(/^.*\./, '').toLowerCase();
}
const isBuiltin = (t) => !!GO_TYPES[t.replace(/^\*|^\[\]/g, '')] || /\./.test(t) || /^\[\]byte$/.test(t);

// struct body -> [{ name, goType, type, tags:{gorm,json,binding,validate,db,column}, nullable, line, embedded }]
function structFields(content, starts, bodyStart, bodyEnd) {
  const out = [];
  const body = content.slice(bodyStart + 1, bodyEnd);
  const baseLine = lineAt(starts, bodyStart);
  body.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) return;
    const tagM = /`([^`]*)`/.exec(line);
    const decl = line.replace(/`[^`]*`/, '').trim();
    const f = /^(\w+(?:\s*,\s*\w+)*)\s+(\*?(?:\[\d*\])?\*?[\w.]+(?:\[[^\]]*\])?)\s*$/.exec(decl);
    const embedded = /^\*?([\w.]+)$/.exec(decl);
    const tags = {};
    if (tagM) for (const t of tagM[1].matchAll(/(\w+):"([^"]*)"/g)) tags[t[1]] = t[2];
    const lineNo = baseLine + i;
    if (f) { for (const name of f[1].split(',').map((x) => x.trim())) out.push({ name, goType: f[2], type: goType(f[2]), tags, nullable: f[2].startsWith('*') || /^sql\.Null/.test(f[2]), line: lineNo }); } else if (embedded) out.push({ name: embedded[1], goType: embedded[1], embedded: true, tags, line: lineNo });
  });
  return out;
}

const snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').toLowerCase();
function columnName(f) {
  const col = /(?:^|;)\s*column:([\w]+)/.exec(f.tags.gorm || '');
  if (col) return col[1];
  if (f.tags.db && f.tags.db !== '-') return f.tags.db.split(',')[0];
  return f.name;
}

function parseStructs(content, starts) {
  const structs = [];
  const re = /\btype\s+(\w+)\s+struct\s*\{/g;
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    if (end === -1) continue;
    structs.push({ name: m[1], line: lineAt(starts, m.index), endLine: lineAt(starts, end), fields: structFields(content, starts, open, end) });
  }
  return structs;
}

function analyzeGoModels(content, starts, file) {
  const structs = parseStructs(content, starts);
  const names = new Set(structs.map((s) => s.name));
  const migrated = new Set([...content.matchAll(/AutoMigrate\(([^)]*)\)/g)].flatMap((x) => [...x[1].matchAll(/&?(\w+)\{\}/g)].map((y) => y[1])));
  const tableName = (n) => { const t = new RegExp(`func\\s*\\(\\s*\\w*\\s*\\*?${n}\\s*\\)\\s*TableName\\(\\)\\s*string\\s*\\{[^}]*return\\s*["\`]([^"\`]+)["\`]`).exec(content); return t ? t[1] : null; };
  const entities = []; const relationships = [];
  for (const s of structs) {
    const embedsModel = s.fields.some((f) => f.embedded && /^gorm\.Model$/.test(f.name));
    const hasGormTag = s.fields.some((f) => f.tags.gorm !== undefined || f.tags.db !== undefined);
    if (!(embedsModel || hasGormTag || migrated.has(s.name))) continue;
    const fields = [];
    if (embedsModel) fields.push({ name: 'ID', type: 'int', pk: true, unique: false }, { name: 'CreatedAt', type: 'datetime', pk: false, unique: false }, { name: 'UpdatedAt', type: 'datetime', pk: false, unique: false }, { name: 'DeletedAt', type: 'datetime', pk: false, unique: false });
    for (const f of s.fields) {
      if (f.embedded || f.tags.gorm === '-' || f.tags.db === '-') continue;
      const base = f.goType.replace(/^\*|^\[\]\*?/, '');
      const relation = !isBuiltin(f.goType) && (names.has(base) || /^[A-Z]/.test(base)) && f.type !== 'datetime';
      if (relation) { relationships.push({ from: s.name, to: base.replace(/^.*\./, ''), type: f.goType.startsWith('[]') ? 'one-to-many' : 'many-to-one', via: `${s.name}.${f.name}`, file, line: f.line, source: 'gorm-relation' }); continue; }
      const gorm = f.tags.gorm || '';
      const dbType = /\btype:([\w]+)/i.exec(gorm);
      fields.push({ name: columnName(f), type: dbType && !/^(uuid|json)/i.test(dbType[1]) ? dbType[1].toLowerCase() : f.type, pk: /primaryKey|primary_key/i.test(gorm) || (f.name === 'ID' && !/\bprimaryKey:false/.test(gorm)), unique: /\bunique\b|uniqueIndex/i.test(gorm), nullable: !/not null|primaryKey/i.test(gorm) && f.nullable ? true : undefined });
    }
    entities.push({ name: s.name, table: tableName(s.name), kind: 'model', source: /\bdb:"/.test(content) && !/gorm/.test(content) ? 'sqlx' : 'gorm', fields, file, line: s.line, endLine: s.endLine });
  }
  return { entities, relationships };
}

// Validation from struct tags. gorm tags describe the column (kind 'schema'); binding/validate tags describe request input.
function analyzeGoValidation(content, starts) {
  const out = [];
  for (const s of parseStructs(content, starts)) {
    for (const f of s.fields) {
      if (f.embedded) continue;
      const g = f.tags.gorm;
      if (g && g !== '-') {
        const rules = [];
        if (/not null|primaryKey/i.test(g)) rules.push('required');
        if (/\bunique\b|uniqueIndex/i.test(g)) rules.push('unique');
        const size = /\bsize:(\d+)/.exec(g); if (size) rules.push(`maxlength(${size[1]})`);
        const def = /\bdefault:([^;]+)/.exec(g); if (def) rules.push(`default(${def[1].trim()})`);
        if (rules.length) out.push({ kind: 'schema', field: columnName(f), rules, line: f.line, status: 'VERIFIED' });
      }
      for (const lib of ['binding', 'validate']) {
        const v = f.tags[lib];
        if (!v || v === '-') continue;
        const rules = v.split(/[,|]/).map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/=/, '(') + (x.includes('=') ? ')' : ''));
        if (rules.length) out.push({ kind: lib === 'binding' ? 'gin-binding' : 'go-validator', field: (f.tags.json || f.name).split(',')[0] || f.name, rules, line: f.line, status: 'VERIFIED' });
      }
    }
  }
  return out;
}

// GORM calls. The receiver is the struct type of the argument; it is resolved against known entities at project level (unknown types are dropped there).
const READ = new Set(['First', 'Last', 'Take', 'Find', 'FindInBatches', 'Count', 'Scan', 'Pluck', 'Rows', 'Row']);
const WRITE = new Set(['Create', 'CreateInBatches', 'Save', 'Delete', 'Update', 'Updates', 'UpdateColumn', 'UpdateColumns', 'FirstOrCreate']);
function typeOfVar(content, v, before) {
  const head = content.slice(0, before);
  const pats = [
    new RegExp(`\\b${v}\\s*:?=\\s*&?(?:\\[\\]\\s*)?\\*?(?:\\w+\\.)?(\\w+)\\{`, 'g'),
    new RegExp(`\\bvar\\s+${v}\\s+(?:\\[\\]\\s*)?\\*?(?:\\w+\\.)?(\\w+)\\b`, 'g'),
    new RegExp(`[(,]\\s*${v}\\s+(?:\\[\\]\\s*)?\\*?(?:\\w+\\.)?(\\w+)\\s*[,)]`, 'g'),
    new RegExp(`\\b${v}\\s*:?=\\s*(?:new\\(|make\\(\\[\\])\\*?(?:\\w+\\.)?(\\w+)`, 'g'),
  ];
  let best = null;
  for (const re of pats) { let m; while ((m = re.exec(head))) if (!best || m.index > best.index) best = { index: m.index, type: m[1] }; }
  return best ? best.type : null;
}
function analyzeGoOrmCalls(content, starts, file) {
  const calls = [];
  const re = /\.(Create|CreateInBatches|Save|First|Last|Take|Find|FindInBatches|Count|Delete|Update|Updates|UpdateColumn|FirstOrCreate|Scan|Pluck|Model)\(\s*(&?)(\w+)(\{)?/g;
  let m;
  while ((m = re.exec(content))) {
    const [, method, , arg, literal] = m;
    const type = literal ? arg : typeOfVar(content, arg, m.index);
    if (!type || !/^[A-Z]/.test(type)) continue;
    let kind = READ.has(method) ? 'read' : WRITE.has(method) ? 'write' : null;
    let op = method;
    if (method === 'Model') { // db.Model(&User{}).Where(..).Updates(..): the terminal call decides
      const rest = content.slice(m.index, content.indexOf('\n', m.index) === -1 ? undefined : content.indexOf('\n', m.index));
      const t = /\.(Create|Save|Delete|Update|Updates|UpdateColumn|UpdateColumns|First|Last|Take|Find|Count|Scan|Pluck)\(/.exec(rest);
      if (!t) continue;
      op = t[1]; kind = WRITE.has(op) ? 'write' : 'read';
    }
    if (!kind) continue;
    calls.push({ receiver: type, operation: op, kind, line: lineAt(starts, m.index), file, orm: 'gorm' });
  }
  return calls;
}

const analyzeGoEnv = (content) => [...new Set([...content.matchAll(/\bos\.(?:Getenv|LookupEnv)\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((x) => x[1]).concat([...content.matchAll(/\b(?:viper|v)\.(?:Get\w*|BindEnv)\(\s*"([A-Za-z_][\w.]*)"/g)].map((x) => x[1].toUpperCase().replace(/\./g, '_'))))];

module.exports = { analyzeGoRoutes, analyzeGoModels, analyzeGoValidation, analyzeGoOrmCalls, analyzeGoEnv, parseStructs, snake };
