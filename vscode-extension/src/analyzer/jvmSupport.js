// Java and Kotlin: Spring MVC / WebFlux, JAX-RS (Quarkus, Jersey), Micronaut and Ktor routes; JPA entities; Bean Validation and
// @Column rules; Spring Data repository / EntityManager calls. Annotation-based, so every result has file + line evidence.
const { lineAt, matchBrace, matchParen, splitArgs } = require('../utils/text');

const q = (s) => [...String(s || '').matchAll(/"([^"]*)"/g)].map((x) => x[1]);
const SECURITY = /@(PreAuthorize|Secured|RolesAllowed|Authenticated|PermitAll|DenyAll|SecurityRequirement)\b/;

// text of an annotation's arguments, or null
function annotationArgs(src, idx) {
  const open = src.indexOf('(', idx);
  const nl = src.indexOf('\n', idx);
  if (open === -1 || (nl !== -1 && open > nl && !/^\s*\(/.test(src.slice(idx, open + 1)))) return '';
  const close = matchParen(src, open);
  return close === -1 ? '' : src.slice(open + 1, close);
}
const pathOf = (args) => { if (!args) return ['']; const named = /(?:value|path)\s*=\s*(\[[^\]]*\]|\{[^}]*\}|"[^"]*")/.exec(args); const src = named ? named[1] : (/^\s*(\[[^\]]*\]|\{[^}]*\}|"[^"]*")/.exec(args) || [])[1]; const p = q(src); return p.length ? p : ['']; };
const joinPath = (a, b) => `${a ? `/${a.replace(/^\/+|\/+$/g, '')}` : ''}${b ? `/${b.replace(/^\/+/, '')}` : ''}` || '/';

function classBlocks(content) {
  const out = [];
  const re = /((?:^[ \t]*@[^\n]*\n)+)?[ \t]*(?:(?:public|open|abstract|final|data|sealed|internal|private|protected|static)\s+)*(?:class|interface|object)\s+(\w+)[^{=]*?\{/gm;
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    out.push({ name: m[2], annotations: m[1] || '', start: m.index, open, end });
  }
  return out;
}

function analyzeJvmRoutes(content, starts, file, language) {
  const routes = [];
  for (const c of classBlocks(content)) {
    const body = content.slice(c.open + 1, c.end);
    const base = c.open + 1;
    const anns = c.annotations;
    const isController = /@(Rest)?Controller\b|@Path\b|@Controller\(|@RequestMapping/.test(anns);
    if (!isController) continue;
    let prefix = '';
    const rm = /@(?:RequestMapping|Path|Controller)\b/.exec(anns);
    if (rm) prefix = pathOf(annotationArgs(anns, rm.index))[0];
    const classSecured = SECURITY.test(anns);
    // Spring: @GetMapping / @PostMapping / @RequestMapping(method = ...)
    const sp = /@(Get|Post|Put|Patch|Delete|Request)Mapping\b/g;
    let m;
    while ((m = sp.exec(body))) {
      const args = annotationArgs(body, m.index);
      const sig = /^[\s\S]{0,300}?(?:fun\s+(\w+)|(?:public|protected|private)?[\w<>\[\],?\s.]*?\s(\w+)\s*\()/.exec(body.slice(m.index + m[0].length + (args ? args.length + 2 : 0)));
      const handler = sig ? sig[1] || sig[2] : null;
      let methods = m[1] === 'Request' ? [...args.matchAll(/RequestMethod\.(\w+)/g)].map((x) => x[1]) : [m[1].toUpperCase()];
      if (!methods.length) methods = ['ANY'];
      const boundary = Math.max(body.lastIndexOf('}', m.index), body.lastIndexOf(';', m.index));
      const own = body.slice(boundary + 1, m.index + (sig ? 300 : 0)).split(/\b(?:public|private|protected|fun)\b/)[0]; // annotations of this method only
      const secured = classSecured || SECURITY.test(own);
      for (const p of pathOf(args)) for (const meth of methods) routes.push({ method: meth, path: joinPath(prefix, p), line: lineAt(starts, base + m.index), framework: language === 'kotlin' ? 'spring-kotlin' : 'spring', handler, inline: false, middleware: secured ? ['Secured'] : [], file, owner: c.name });
    }
    // JAX-RS / Micronaut: @GET @Path("/x")   @Get("/x")
    const jx = /@(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Get|Post|Put|Patch|Delete)\b(?!Mapping)/g;
    while ((m = jx.exec(body))) {
      const window = body.slice(Math.max(0, m.index - 160), m.index + 300);
      const mine = window.slice(Math.max(0, m.index - Math.max(0, m.index - 160)));
      const argsHere = /^@\w+\s*\(/.test(body.slice(m.index)) ? annotationArgs(body, m.index) : '';
      const pm = /@Path\s*\(/.exec(mine);
      const sub = argsHere ? pathOf(argsHere)[0] : pm ? pathOf(annotationArgs(mine, pm.index))[0] : '';
      const sig = /(?:fun\s+(\w+)|\s(\w+)\s*\()/.exec(body.slice(m.index, m.index + 400).replace(/@\w+(\([^)]*\))?/g, ''));
      const boundary2 = Math.max(body.lastIndexOf('}', m.index), body.lastIndexOf(';', m.index));
      routes.push({ method: m[1].toUpperCase(), path: joinPath(prefix, sub), line: lineAt(starts, base + m.index), framework: 'jaxrs', handler: sig ? sig[1] || sig[2] : null, inline: false, middleware: classSecured || SECURITY.test(body.slice(boundary2 + 1, m.index + 80)) ? ['Secured'] : [], file, owner: c.name });
    }
  }
  if (language === 'kotlin') routes.push(...analyzeKtor(content, starts, file));
  return routes;
}

// Ktor: routing { route("/api") { get("/orders") { ... } post { ... } } }
function analyzeKtor(content, starts, file) {
  const routes = [];
  if (!/\brouting\s*\{|\bRouting\b/.test(content)) return routes;
  const re = /\b(route|get|post|put|patch|delete)\s*\(\s*"([^"]*)"\s*\)\s*\{|\b(get|post|put|patch|delete)\s*\{/g;
  const ranges = [];
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    ranges.push({ verb: m[1] || m[3], path: m[2] || '', start: m.index, open, end });
  }
  for (const r of ranges) {
    if (r.verb === 'route') continue;
    let p = r.path;
    for (const outer of ranges.filter((x) => x.verb === 'route' && x.open < r.start && x.end > r.start).sort((a, b) => b.open - a.open)) p = (outer.path || '') + p;
    routes.push({ method: r.verb.toUpperCase(), path: p || '/', line: lineAt(starts, r.start), framework: 'ktor', handler: null, inline: true, middleware: /authenticate\s*[({]/.test(content.slice(Math.max(0, r.start - 400), r.start)) ? ['authenticate'] : [], file, owner: 'routing' });
  }
  return routes;
}

// ---- JPA entities ----
const JTYPE = { string: 'string', int: 'int', integer: 'int', long: 'int', short: 'int', double: 'float', float: 'float', bigdecimal: 'decimal', boolean: 'bool', localdate: 'datetime', localdatetime: 'datetime', date: 'datetime', instant: 'datetime', zoneddatetime: 'datetime', uuid: 'uuid', 'byte[]': 'bytes', bytearray: 'bytes', char: 'string' };
const jtype = (t) => { const base = String(t).replace(/\?$/, '').replace(/<.*$/, '').trim().toLowerCase(); return JTYPE[base] || base; };

function kotlinCtorEntities(content) {
  const out = [];
  const re = /((?:^[ \t]*@[^\n]*\n)+)[ \t]*(?:(?:data|open|abstract|sealed)\s+)*class\s+(\w+)\s*\(/gm;
  let m;
  while ((m = re.exec(content))) {
    if (!/@Entity\b|@Document\b|@Table\b/.test(m[1])) continue;
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const after = content.slice(close + 1).match(/^\s*(?::[^{\n]*)?(\{)?/);
    const bodyOpen = after && after[1] ? close + 1 + after[0].length - 1 : -1;
    out.push({ name: m[2], annotations: m[1], start: m.index, open: bodyOpen === -1 ? close : bodyOpen, end: bodyOpen === -1 ? close : matchBrace(content, bodyOpen), params: splitArgs(content.slice(open + 1, close)), paramsAt: open + 1, ctor: true });
  }
  return out;
}

function analyzeJpa(content, starts, file, language) {
  const entities = []; const relationships = []; const validation = [];
  const blocks = classBlocks(content);
  if (language === 'kotlin') for (const k of kotlinCtorEntities(content)) { const i = blocks.findIndex((b) => b.name === k.name && b.start === k.start); if (i >= 0) blocks[i] = { ...blocks[i], params: k.params, paramsAt: k.paramsAt }; else blocks.push(k); }
  for (const c of blocks) {
    if (!/@Entity\b|@Document\b|@Table\b/.test(c.annotations)) continue;
    const body = c.ctor && c.open === c.end ? '' : content.slice(c.open + 1, c.end);
    const base = c.open + 1;
    const table = (/@Table\s*\(([^)]*)\)/.exec(c.annotations) || [])[1];
    const tname = table ? (/name\s*=\s*"([^"]+)"/.exec(table) || [])[1] : null;
    const fields = [];
    // a field = optional annotations, then `private Type name;` (Java) or `val|var name: Type` (Kotlin)
    const fre = language === 'kotlin'
      ? /((?:@[\w.:]+(?:\([^)]*\))?\s*)*)(?:private\s+|protected\s+|override\s+|lateinit\s+)*(?:val|var)\s+(\w+)\s*:\s*([\w.<>?,\s]+?)\s*(?:=|,|\)|$)/gm
      : /((?:@\w+(?:\([^)]*\))?\s*)*)(?:private|protected|public)\s+(?:final\s+)?([\w.<>,?\[\]]+)\s+(\w+)\s*(?:=[^;]*)?;/gm;
    let m;
    const items = [];
    while ((m = fre.exec(body))) items.push({ anns: m[1] || '', name: language === 'kotlin' ? m[2] : m[3], type: (language === 'kotlin' ? m[3] : m[2]).trim(), at: base + m.index + (m[1] ? m[1].length : 0) });
    for (const p of c.params || []) { const pm = /^((?:@[\w.:]+(?:\([^)]*\))?\s*)*)(?:private\s+|override\s+)?(?:val|var)\s+(\w+)\s*:\s*([\w.<>?,\s]+?)(?:\s*=.*)?$/s.exec(p.trim()); if (pm) items.push({ anns: pm[1] || '', name: pm[2], type: pm[3].trim(), at: c.paramsAt + (content.slice(c.paramsAt).indexOf(p.trim().slice(0, 12)) >= 0 ? content.slice(c.paramsAt).indexOf(p.trim().slice(0, 12)) : 0) }); }
    for (const it of items) {
      const anns = it.anns; const name = it.name; const type = it.type;
      if (/@Transient\b/.test(anns) || /^(serialVersionUID)$/.test(name)) continue;
      const line = lineAt(starts, it.at);
      const rel = /@(OneToMany|ManyToOne|OneToOne|ManyToMany)\b/.exec(anns);
      if (rel) { const target = (/targetEntity\s*=\s*(\w+)/.exec(anns) || /<\s*(\w+)\s*>/.exec(type) || [])[1] || type.replace(/[?<>].*/g, '').trim(); relationships.push({ from: c.name, to: target, type: { OneToMany: 'one-to-many', ManyToOne: 'many-to-one', OneToOne: 'one-to-one', ManyToMany: 'many-to-many' }[rel[1]], via: `${c.name}.${name}`, file, line, source: 'jpa' }); const jc = /@JoinColumn\s*\(([^)]*)\)/.exec(anns); if (jc && rel[1] !== 'OneToMany') { const nm = /name\s*=\s*"([^"]+)"/.exec(jc[1]); fields.push({ name: nm ? nm[1] : `${name}_id`, type: 'int', pk: false, unique: false, nullable: /nullable\s*=\s*false/.test(jc[1]) ? false : undefined }); validation.push({ kind: 'schema', field: nm ? nm[1] : `${name}_id`, rules: /nullable\s*=\s*false/.test(jc[1]) || /optional\s*=\s*false/.test(anns) ? ['required'] : [], line, status: 'VERIFIED' }); } continue; }
      const col = /@Column\s*\(([^)]*)\)/.exec(anns);
      const colName = col ? (/name\s*=\s*"([^"]+)"/.exec(col[1]) || [])[1] : null;
      const fname = colName || name;
      const pk = /@Id\b|@EmbeddedId\b/.test(anns);
      const rules = [];
      if (pk || (col && /nullable\s*=\s*false/.test(col[1])) || /@NotNull\b|@NotBlank\b|@NotEmpty\b/.test(anns) || (language === 'kotlin' && !/\?$/.test(type) && !pk)) rules.push('required');
      if (pk || (col && /unique\s*=\s*true/.test(col[1]))) rules.push('unique');
      const len = col && /length\s*=\s*(\d+)/.exec(col[1]); if (len) rules.push(`maxlength(${len[1]})`);
      for (const b of beanRules(anns)) if (!rules.includes(b)) rules.push(b);
      fields.push({ name: fname, type: jtype(type), pk, unique: rules.includes('unique') });
      if (rules.length) validation.push({ kind: 'schema', field: fname, rules, line, status: 'VERIFIED' });
    }
    entities.push({ name: c.name, ...(tname ? { table: tname } : {}), kind: /@Document\b/.test(c.annotations) ? 'collection' : 'model', source: 'jpa', fields, file, line: lineAt(starts, c.start), endLine: lineAt(starts, c.end) });
  }
  return { entities, relationships, validation };
}

function beanRules(anns) {
  const rules = [];
  const has = (n) => new RegExp(`@(?:field:|get:)?${n}\\b`).test(anns);
  if (has('NotBlank')) rules.push('notblank'); if (has('NotEmpty')) rules.push('notempty');
  if (has('NotNull')) rules.push('required');
  if (has('Email')) rules.push('type(email)'); if (has('Positive')) rules.push('positive'); if (has('PositiveOrZero')) rules.push('min(0)');
  if (has('Past')) rules.push('past'); if (has('Future')) rules.push('future');
  const size = /@(?:field:|get:)?Size\s*\(([^)]*)\)/.exec(anns); if (size) { const mn = /min\s*=\s*(\d+)/.exec(size[1]); const mx = /max\s*=\s*(\d+)/.exec(size[1]); if (mn) rules.push(`minlength(${mn[1]})`); if (mx) rules.push(`maxlength(${mx[1]})`); }
  const len = /@(?:field:|get:)?Length\s*\(([^)]*)\)/.exec(anns); if (len) { const mx = /max\s*=\s*(\d+)/.exec(len[1]); if (mx) rules.push(`maxlength(${mx[1]})`); }
  for (const [n, label] of [['Min', 'min'], ['Max', 'max'], ['DecimalMin', 'min'], ['DecimalMax', 'max']]) { const x = new RegExp(`@(?:field:|get:)?${n}\\s*\\(\\s*(?:value\\s*=\\s*)?"?(-?[\\d.]+)`).exec(anns); if (x) rules.push(`${label}(${x[1]})`); }
  const pat = /@(?:field:|get:)?Pattern\s*\(/.exec(anns); if (pat) rules.push('pattern');
  return rules;
}

// Bean Validation on request DTOs / non-entity classes
function analyzeBeanValidation(content, starts, language) {
  const out = [];
  const fre = language === 'kotlin'
    ? /((?:@(?:field:|get:)?[\w.]+(?:\([^)]*\))?\s*)+)(?:val|var)\s+(\w+)/g
    : /((?:@\w+(?:\([^)]*\))?\s*)+)(?:private|protected|public)\s+(?:final\s+)?[\w.<>,?\[\]]+\s+(\w+)\s*(?:=[^;]*)?;/g;
  let m;
  while ((m = fre.exec(content))) {
    if (/@(Id|Column|JoinColumn|OneToMany|ManyToOne|OneToOne|ManyToMany)\b/.test(m[1])) continue; // entity fields are handled with the entity
    const rules = beanRules(m[1]);
    if (rules.length) out.push({ kind: 'bean-validation', field: m[2], rules, line: lineAt(starts, m.index + m[1].length), status: 'VERIFIED' });
  }
  return out;
}

// Spring Data repositories and EntityManager. receiver = entity type, resolved against known entities later.
const READ = new Set(['findById', 'findAll', 'findOne', 'getById', 'getReferenceById', 'getOne', 'existsById', 'count', 'findAllById', 'find', 'getResultList']);
const WRITE = new Set(['save', 'saveAll', 'saveAndFlush', 'delete', 'deleteById', 'deleteAll', 'deleteAllById', 'persist', 'merge', 'remove', 'flush']);
function analyzeJvmOrmCalls(content, starts, file) {
  const calls = [];
  const repoType = new Map(); // variable -> entity
  for (const m of content.matchAll(/\b(\w+)Repository(?:<[^>]*>)?\s+(\w+)\b/g)) repoType.set(m[2], m[1]);
  for (const m of content.matchAll(/val\s+(\w+)\s*:\s*(\w+)Repository\b/g)) repoType.set(m[1], m[2]);
  const re = /\b(\w+)\.(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(content))) {
    const [, v, method] = m;
    let entity = repoType.get(v);
    let op = method;
    if (!entity && /^\w+Repository$/.test(v)) entity = v.replace(/Repository$/, '');
    if (!entity) { // entityManager.persist(order) / em.find(Order.class, id)
      if (!/^(em|entityManager|manager|session)$/i.test(v)) continue;
      const arg = /^\s*(\w+)(?:\.class|::class\.java|::class)?/.exec(content.slice(re.lastIndex));
      if (!arg) continue;
      entity = arg[1].replace(/^./, (c) => c.toUpperCase());
    }
    const kind = READ.has(op) || /^(findBy|countBy|existsBy|getBy|readBy|queryBy)/.test(op) ? 'read' : WRITE.has(op) || /^deleteBy/.test(op) ? 'write' : null;
    if (!kind) continue;
    entity = entity.replace(/^./, (c) => c.toUpperCase());
    calls.push({ receiver: entity, operation: op, kind, line: lineAt(starts, m.index), file, orm: 'jpa' });
  }
  return calls;
}

module.exports = { analyzeJvmRoutes, analyzeJpa, analyzeBeanValidation, analyzeJvmOrmCalls };
