// C# / ASP.NET Core: controllers ([Route], [HttpGet]…), minimal APIs (MapGet, MapGroup), EF Core entities with DataAnnotations,
// FluentValidation rules and DbSet calls.
const { lineAt, matchBrace, matchParen, splitArgs } = require('../utils/text');

const strs = (s) => [...String(s || '').matchAll(/"([^"]*)"/g)].map((x) => x[1]);
const attrArgs = (src, idx) => { const open = src.indexOf('(', idx); const end = src.indexOf(']', idx); if (open === -1 || (end !== -1 && open > end)) return ''; const close = matchParen(src, open); return close === -1 ? '' : src.slice(open + 1, close); };

function classes(content) {
  const out = [];
  const re = /((?:^[ \t]*\[[^\n]*\]\s*\n)*)[ \t]*(?:(?:public|internal|private|protected|sealed|abstract|static|partial)\s+)*(?:class|record)\s+(\w+)\s*(?:\([^)]*\))?\s*(?::\s*([^{\n]+?))?\s*(?:where [^{\n]+)?\s*\{/gm;
  let m;
  while ((m = re.exec(content))) { const open = m.index + m[0].length - 1; out.push({ name: m[2], attrs: m[1] || '', bases: m[3] || '', start: m.index, open, end: matchBrace(content, open) }); }
  return out;
}

function analyzeDotnetRoutes(content, starts, file) {
  const routes = [];
  for (const c of classes(content)) {
    if (!/Controller\b|ControllerBase/.test(c.bases) && !/\[ApiController\]/.test(c.attrs)) continue;
    const body = content.slice(c.open + 1, c.end);
    const base = c.open + 1;
    const ctrlName = c.name.replace(/Controller$/, '');
    const cr = /\[Route\s*\(/.exec(c.attrs);
    const prefix = (cr ? strs(attrArgs(c.attrs, cr.index))[0] || '' : '').replace(/\[controller\]/gi, ctrlName.toLowerCase());
    const classAuth = /\[Authorize\b/.test(c.attrs);
    const re = /((?:\s*\[[^\]\n]*\])+)\s*(?:public|protected|internal)\s+(?:async\s+)?(?:static\s+)?[\w<>\[\],?.\s]+?\s+(\w+)\s*\(/g;
    let m;
    while ((m = re.exec(body))) {
      const attrs = m[1];
      const verbs = [...attrs.matchAll(/\[Http(Get|Post|Put|Patch|Delete|Head|Options)\b/g)];
      const route = /\[Route\s*\(/.exec(attrs);
      const sub = (verbs[0] ? strs(attrArgs(attrs, verbs[0].index))[0] : null) ?? (route ? strs(attrArgs(attrs, route.index))[0] : '') ?? '';
      if (!verbs.length && !route) continue;
      const full = (sub && sub.startsWith('/') ? sub : `${prefix}${sub ? `/${sub}` : ''}`).replace(/\[controller\]/gi, ctrlName.toLowerCase()).replace(/\[action\]/gi, m[2].toLowerCase()).replace(/\/+/g, '/');
      const mw = classAuth || /\[Authorize\b/.test(attrs) ? ['Authorize'] : [];
      if (/\[AllowAnonymous\]/.test(attrs)) mw.length = 0;
      for (const v of verbs.length ? verbs : [[null, 'ANY']]) routes.push({ method: String(v[1]).toUpperCase(), path: full.startsWith('/') ? full : `/${full}`, line: lineAt(starts, base + m.index), framework: 'aspnet', handler: `${c.name}.${m[2]}`, inline: false, middleware: mw, file, owner: c.name });
    }
  }
  // minimal APIs: var api = app.MapGroup("/api"); api.MapGet("/orders/{id}", handler).RequireAuthorization();
  const prefix = new Map();
  for (const g of content.matchAll(/\b(?:var|MapGroup)?\s*(\w+)\s*=\s*(\w+)\.MapGroup\(\s*"([^"]*)"/g)) prefix.set(g[1], (prefix.get(g[2]) || '') + g[3]);
  const re = /\b(\w+)\.Map(Get|Post|Put|Patch|Delete|Methods)\(\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(content))) {
    const stmtEnd = content.indexOf(';', m.index);
    const stmt = content.slice(m.index, stmtEnd === -1 ? m.index + 300 : stmtEnd);
    routes.push({ method: m[2] === 'Methods' ? 'ANY' : m[2].toUpperCase(), path: `${prefix.get(m[1]) || ''}${m[3]}` || '/', line: lineAt(starts, m.index), framework: 'aspnet-minimal', handler: null, inline: true, middleware: /RequireAuthorization|\[Authorize/.test(stmt) ? ['Authorize'] : [], file, owner: m[1] });
  }
  return routes;
}

const CT = { string: 'string', int: 'int', long: 'int', short: 'int', byte: 'int', double: 'float', float: 'float', decimal: 'decimal', bool: 'bool', datetime: 'datetime', datetimeoffset: 'datetime', dateonly: 'datetime', timespan: 'datetime', guid: 'uuid', 'byte[]': 'bytes' };
const ctype = (t) => { const base = String(t).replace(/\?$/, '').replace(/<.*$/, '').toLowerCase(); return CT[base] || base; };
const BUILTIN = new Set(Object.keys(CT));

function annotationRules(attrs) {
  const rules = [];
  const has = (n) => new RegExp(`(?:\\[|,)\\s*(?:\\w+:\\s*)?${n}\\b`).test(attrs);
  if (has('Required') || has('Key')) rules.push('required');
  const sl = /(?:\[|,)\s*(?:StringLength|MaxLength)\s*\(\s*(\d+)/.exec(attrs); if (sl) rules.push(`maxlength(${sl[1]})`);
  const ml = /(?:\[|,)\s*MinLength\s*\(\s*(\d+)/.exec(attrs); if (ml) rules.push(`minlength(${ml[1]})`);
  const mn = /(?:\[|,)\s*StringLength\s*\([^)]*MinimumLength\s*=\s*(\d+)/.exec(attrs); if (mn) rules.push(`minlength(${mn[1]})`);
  const rg = /(?:\[|,)\s*Range\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)/.exec(attrs); if (rg) rules.push(`min(${rg[1]})`, `max(${rg[2]})`);
  if (has('EmailAddress')) rules.push('type(email)'); if (has('Phone')) rules.push('type(phone)'); if (has('Url')) rules.push('type(url)');
  if (has('RegularExpression')) rules.push('pattern'); if (has('Compare')) rules.push('compare');
  return rules;
}

function analyzeEfEntities(content, starts, file) {
  const entities = []; const relationships = []; const validation = [];
  const dbSets = new Set([...content.matchAll(/DbSet<(\w+)>/g)].map((x) => x[1]));
  const all = classes(content);
  const names = new Set(all.map((c) => c.name));
  for (const c of all) {
    const body = content.slice(c.open + 1, c.end);
    const props = [...body.matchAll(/((?:[ \t]*\[[^\]\n]*\][ \t]*\n?)*)[ \t]*public\s+(?:virtual\s+)?(?:required\s+)?([\w<>\[\],?.]+)\s+(\w+)\s*\{\s*get;/g)];
    const hasKey = props.some((p) => /\[Key\]/.test(p[1]) || p[3] === 'Id' || p[3] === `${c.name}Id`);
    const isEntity = /\[Table\b/.test(c.attrs) || dbSets.has(c.name) || (hasKey && /(^|\/)(Models?|Entities|Domain|Data)\//i.test(file));
    if (!isEntity || /DbContext/.test(c.bases)) continue;
    const base = c.open + 1;
    const fields = [];
    for (const p of props) {
      const attrs = p[1]; const type = p[2]; const name = p[3];
      const line = lineAt(starts, base + p.index + attrs.length);
      if (/\[NotMapped\]/.test(attrs)) continue;
      const inner = (/^(?:ICollection|IList|List|IEnumerable|HashSet)<(\w+)>$/.exec(type) || [])[1];
      const target = inner || type.replace(/\?$/, '');
      const hasFk = props.some((q) => q[3] === `${name}Id` || q[3] === `${target}Id`);
      if (inner && !BUILTIN.has(inner.toLowerCase()) || (!BUILTIN.has(target.toLowerCase()) && (names.has(target) || dbSets.has(target) || hasFk))) { relationships.push({ from: c.name, to: target, type: inner ? 'one-to-many' : 'many-to-one', via: `${c.name}.${name}`, file, line, source: 'ef-core' }); continue; }
      const pk = /\[Key\]/.test(attrs) || name === 'Id' || name === `${c.name}Id`;
      const rules = annotationRules(attrs);
      if (pk && !rules.includes('required')) rules.push('required');
      if (!/\?$/.test(type) && !rules.includes('required') && !['string'].includes(type.toLowerCase()) && BUILTIN.has(type.toLowerCase())) rules.push('required');
      if (pk) rules.push('unique');
      const col = /\[Column\s*\(\s*"([^"]+)"/.exec(attrs);
      const fname = col ? col[1] : name;
      fields.push({ name: fname, type: ctype(type), pk, unique: pk });
      if (rules.length) validation.push({ kind: 'schema', field: fname, rules: [...new Set(rules)], line, status: 'VERIFIED' });
    }
    const tn = /\[Table\s*\(\s*"([^"]+)"/.exec(c.attrs);
    entities.push({ name: c.name, ...(tn ? { table: tn[1] } : {}), kind: 'model', source: 'ef-core', fields, file, line: lineAt(starts, c.start), endLine: lineAt(starts, c.end) });
  }
  return { entities, relationships, validation };
}

// DataAnnotations on DTOs / view models + FluentValidation rules
function analyzeDotnetValidation(content, starts) {
  const out = [];
  const re = /((?:[ \t]*\[[^\]\n]*\][ \t]*\n?)+)[ \t]*public\s+(?:required\s+)?[\w<>\[\],?.]+\s+(\w+)\s*\{\s*get;/g;
  let m;
  while ((m = re.exec(content))) { if (/(?:\[|,)\s*(Key|Column|Table|ForeignKey)\b/.test(m[1])) continue; const rules = annotationRules(m[1]); if (rules.length) out.push({ kind: 'data-annotations', field: m[2], rules, line: lineAt(starts, m.index + m[1].length), status: 'VERIFIED' }); }
  const rf = /RuleFor\(\s*\w+\s*=>\s*\w+\.(\w+)\s*\)((?:\s*\.\s*\w+\s*\((?:[^()]|\([^()]*\))*\))+)/g;
  while ((m = rf.exec(content))) {
    const rules = [...m[2].matchAll(/\.\s*(\w+)\s*\(([^()]*)\)/g)].filter((x) => !['WithMessage', 'WithName', 'WithErrorCode', 'When', 'Unless', 'DependentRules'].includes(x[1])).map((x) => { const map = { NotEmpty: 'notempty', NotNull: 'required', MaximumLength: 'maxlength', MinimumLength: 'minlength', EmailAddress: 'type(email)', GreaterThan: 'greater', LessThan: 'less', GreaterThanOrEqualTo: 'min', LessThanOrEqualTo: 'max', Matches: 'pattern', Length: 'length', InclusiveBetween: 'range' }; const k = map[x[1]] || x[1]; return x[2].trim() && /^\w+$|^-?[\d.]+$/.test(x[2].trim()) && !/^type\(|^required$/.test(k) ? `${k}(${x[2].trim()})` : k; });
    if (rules.length) out.push({ kind: 'fluent-validation', field: m[1], rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
  return out;
}

// _context.Orders.Add(order)  /  db.Orders.Where(...)  /  _context.Set<Order>().Find(id)
const READ = new Set(['Find', 'FindAsync', 'Where', 'FirstOrDefault', 'FirstOrDefaultAsync', 'First', 'FirstAsync', 'SingleOrDefault', 'SingleOrDefaultAsync', 'Single', 'ToList', 'ToListAsync', 'Any', 'AnyAsync', 'Count', 'CountAsync', 'AsNoTracking', 'Include', 'OrderBy', 'Select']);
const WRITE = new Set(['Add', 'AddAsync', 'AddRange', 'Update', 'UpdateRange', 'Remove', 'RemoveRange', 'ExecuteDelete', 'ExecuteUpdate']);
function analyzeDotnetOrmCalls(content, starts, file) {
  const calls = [];
  const re = /\b\w+\.(?:Set<(\w+)>\(\)|([A-Z]\w*))\.(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(content))) {
    const op = m[3];
    const kind = READ.has(op) ? 'read' : WRITE.has(op) ? 'write' : null;
    if (!kind) continue;
    calls.push({ receiver: m[1] || m[2], operation: op, kind, line: lineAt(starts, m.index), file, orm: 'ef-core' });
  }
  return calls;
}

module.exports = { analyzeDotnetRoutes, analyzeEfEntities, analyzeDotnetValidation, analyzeDotnetOrmCalls };
