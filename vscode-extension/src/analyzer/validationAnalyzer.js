// Validation rules found in source, each with file + line. Syntactic extraction only: a rule is reported when the code literally
// declares it (a schema option, a Joi/zod/yup/express-validator/class-validator chain, an HTML form attribute).
// Hand-written guards (`if (!x) throw ...`) are INFERRED because their intent is a reading of the code.
const { lineIndex, lineAt, matchBrace } = require('../utils/text');
const { analyzeGoValidation } = require('./goSupport');

const MAX_PER_FILE = 80;
const SCHEMA_RULES = ['required', 'unique', 'minlength', 'maxlength', 'min', 'max', 'enum', 'match', 'default', 'lowercase', 'uppercase', 'trim', 'index'];

// Chain like  Joi.string().email().min(3).required()  ->  ['string', 'email', 'min(3)', 'required']
function chainRules(chain) {
  const rules = [];
  const re = /\.?\b([A-Za-z_]\w*)\s*(\(([^()]*)\))?/g;
  let m;
  while ((m = re.exec(chain))) {
    const name = m[1];
    if (['Joi', 'z', 'yup', 'Yup', 'v', 'body', 'check', 'param', 'query', 'header', 'cookie'].includes(name)) continue;
    const arg = m[3] !== undefined ? m[3].trim().replace(/\s+/g, ' ').slice(0, 40) : '';
    rules.push(arg && !/^['"`]?$/.test(arg) && /^[\w'"`./\\^$*+?|[\]{}()-]+(?:,\s*[\w'"`./-]+)?$/.test(arg) ? `${name}(${arg})` : name);
  }
  return rules;
}

function schemaOptions(content, starts, out) {
  // `field: { type: String, required: true, minlength: 3 }` (Mongoose / Sequelize style)
  const re = /([A-Za-z_$][\w$]*)\s*:\s*\{([^{}]*\btype\s*:[^{}]*)\}/g;
  let m;
  while ((m = re.exec(content))) {
    const field = m[1];
    if (['type', 'default', 'validate', 'ref'].includes(field)) continue;
    const body = m[2];
    const rules = [];
    for (const r of SCHEMA_RULES) {
      const hit = new RegExp(`\\b${r}\\s*:\\s*(\\[[^\\]]*\\]|/[^/\\n]+/[a-z]*|'[^']*'|"[^"]*"|[\\w.]+)`).exec(body);
      if (!hit) continue;
      const value = hit[1].trim().slice(0, 60);
      if (value === 'false') continue;
      rules.push(value === 'true' ? r : `${r}(${value})`);
    }
    if (rules.length) out.push({ kind: 'schema', field, rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
}

function chainedValidators(content, starts, out) {
  // Joi / zod / yup object keys:  email: Joi.string().email().required(),   name: z.string().min(2)
  const keyed = /([A-Za-z_$][\w$]*)\s*:\s*((?:Joi|z|yup|Yup)\s*\.\s*[A-Za-z_]\w*\s*\([^)]*\)(?:\s*\.\s*[A-Za-z_]\w*\s*\((?:[^()]|\([^()]*\))*\))*)/g;
  let m;
  while ((m = keyed.exec(content))) {
    const lib = /^(Joi|z|yup|Yup)/.exec(m[2])[1].toLowerCase().replace('yup', 'yup');
    out.push({ kind: lib === 'z' ? 'zod' : lib, field: m[1], rules: chainRules(m[2]), line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
  // express-validator:  body('email').isEmail().normalizeEmail()
  const ev = /\b(body|check|param|query|header|cookie)\(\s*['"]([\w.[\]*-]+)['"][^)]*\)((?:\s*\.\s*[A-Za-z_]\w*\s*\((?:[^()]|\([^()]*\))*\))*)/g;
  while ((m = ev.exec(content))) {
    const rules = chainRules(m[3]);
    if (rules.length) out.push({ kind: 'express-validator', field: m[2], source: m[1], rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
  // class-validator decorators directly above a property
  const cv = /((?:@(?:Is\w+|Min|Max|Length|MinLength|MaxLength|Matches|Contains|ArrayNotEmpty|ArrayMinSize|ArrayMaxSize|ValidateNested|Allow|NotEquals|Equals)\s*\([^)]*\)\s*)+)(?:public\s+|private\s+|readonly\s+)*([A-Za-z_$][\w$]*)\s*[!?]?\s*:/g;
  while ((m = cv.exec(content))) {
    const rules = [...m[1].matchAll(/@([A-Za-z]+)\s*\(([^)]*)\)/g)].map((d) => { const a = d[2].trim().replace(/\s+/g, ' ').slice(0, 30); return a && !/^\{/.test(a) ? `${d[1]}(${a})` : d[1]; });
    out.push({ kind: 'class-validator', field: m[2], rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
}

function formAttributes(content, starts, out) {
  // <input name="email" type="email" required minLength={3} pattern="..." />
  const tag = /<(input|select|textarea)\b([^>]*?)\/?>/gi;
  let m;
  while ((m = tag.exec(content))) {
    const attrs = m[2];
    const name = /\bname\s*=\s*["'{]\s*['"]?([\w.-]+)/.exec(attrs);
    if (!name) continue;
    const rules = [];
    const type = /\btype\s*=\s*["']([\w-]+)["']/.exec(attrs);
    if (type && ['email', 'url', 'number', 'tel', 'date', 'password'].includes(type[1])) rules.push(`type(${type[1]})`);
    if (/\brequired\b/.test(attrs)) rules.push('required');
    for (const a of ['minLength', 'maxLength', 'min', 'max', 'pattern', 'step']) {
      const v = new RegExp(`\\b${a}\\s*=\\s*(?:\\{\\s*([\\w.]+)\\s*\\}|["']([^"']{1,40})["'])`, 'i').exec(attrs);
      if (v) rules.push(`${a.toLowerCase()}(${v[1] || v[2]})`);
    }
    if (rules.length) out.push({ kind: 'html-form', field: name[1], rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
}

function guards(content, starts, out) {
  // if (!x) throw new Error('message')  /  res.status(400).json({ message: '...' })  /  if (...) return res.status(4xx)...
  const throwRe = /\bthrow\s+new\s+\w*Error\s*\(\s*(['"`])([^'"`\n]{3,100})\1/g;
  let m; let n = 0;
  while ((m = throwRe.exec(content)) && n < 15) { out.push({ kind: 'guard', field: null, rules: [m[2]], line: lineAt(starts, m.index), status: 'INFERRED', basis: 'throws an error with this message' }); n++; }
  const resRe = /\bres\.status\(\s*(4\d\d)\s*\)\s*\.(?:json|send)\(\s*\{?[^)]*?(['"`])([^'"`\n]{3,100})\2/g;
  n = 0;
  while ((m = resRe.exec(content)) && n < 15) { out.push({ kind: 'guard', field: null, rules: [`HTTP ${m[1]}: ${m[3]}`], line: lineAt(starts, m.index), status: 'INFERRED', basis: 'responds with this client error' }); n++; }
}

const GO_STATUS = { BadRequest: 400, Unauthorized: 401, Forbidden: 403, NotFound: 404, Conflict: 409, UnprocessableEntity: 422, TooManyRequests: 429 };
function goGuards(content, starts, out) {
  let m; let n = 0;
  const lastMessage = (rest) => [...rest.matchAll(/(["`])([^"`\n]{3,100})\1/g)].map((x) => x[2]).filter((x) => !/^(error|message|msg|detail|status)$/i.test(x)).pop();
  // http.Error(w, "msg", http.StatusBadRequest)
  const http = /\bhttp\.Error\(\s*\w+\s*,\s*(["`])([^"`\n]{3,100})\1\s*,\s*(?:http\.Status(\w+)|(4\d\d))/g;
  while ((m = http.exec(content)) && n < 15) { const code = GO_STATUS[m[3]] || m[4]; if (code) { out.push({ kind: 'guard', field: null, rules: [`HTTP ${code}: ${m[2]}`], line: lineAt(starts, m.index), status: 'INFERRED', basis: 'responds with this client error' }); n++; } }
  // c.JSON(http.StatusBadRequest, gin.H{"error": "msg"})  /  c.AbortWithStatusJSON(...)  /  echo, fiber
  const gin = /\.(?:JSON|AbortWithStatusJSON|String|Status)\(\s*(?:http\.Status(\w+)|fiber\.Status(\w+)|(4\d\d))([^\n]*)/g;
  n = 0;
  while ((m = gin.exec(content)) && n < 15) { const code = GO_STATUS[m[1] || m[2]] || m[3]; const msg = lastMessage(m[4]); if (code && msg) { out.push({ kind: 'guard', field: null, rules: [`HTTP ${code}: ${msg}`], line: lineAt(starts, m.index), status: 'INFERRED', basis: 'responds with this client error' }); n++; } }
  const errs = /\b(?:errors\.New|fmt\.Errorf)\(\s*(["`])([^"`\n]{3,100})\1/g;
  n = 0;
  while ((m = errs.exec(content)) && n < 15) { out.push({ kind: 'guard', field: null, rules: [m[2]], line: lineAt(starts, m.index), status: 'INFERRED', basis: 'returns an error with this message' }); n++; }
}

// Python: Django model fields, SQLAlchemy columns, pydantic/SQLModel fields, marshmallow, DRF serializers, WTForms.
function pythonValidation(content, starts, out) {
  let m;
  const call = (args, key) => { const r = new RegExp(`\\b${key}\\s*=\\s*([^,)]+)`).exec(args); return r ? r[1].trim() : null; };
  const django = /^[ \t]+(\w+)\s*=\s*models\.(\w+)\(([^\n]*)\)\s*$/gm;
  while ((m = django.exec(content))) {
    const [, field, type, args] = m;
    if (/^(ManyToManyField)$/.test(type)) continue;
    const rules = [];
    if (call(args, 'null') !== 'True' && !/AutoField|BigAutoField/.test(type)) rules.push('required');
    if (call(args, 'unique') === 'True' || call(args, 'primary_key') === 'True') rules.push('unique');
    const ml = call(args, 'max_length'); if (ml) rules.push(`maxlength(${ml})`);
    const df = call(args, 'default'); if (df) rules.push(`default(${df.slice(0, 30)})`);
    if (call(args, 'choices')) rules.push('enum(choices)');
    for (const v of ['MinValueValidator', 'MaxValueValidator', 'EmailValidator', 'RegexValidator', 'validate_email']) { const vm = new RegExp(`${v}\\(([^)]*)\\)`).exec(args); if (vm) rules.push(`${v}(${vm[1].slice(0, 20)})`); }
    out.push({ kind: 'schema', field, rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
  const sa = /^[ \t]+(\w+)\s*(?::\s*Mapped\[((?:[^\[\]]|\[[^\]]*\])+)\])?\s*=\s*(?:db\.|sa\.|sqlalchemy\.)?(?:Column|mapped_column)\(([^\n]*)\)\s*$/gm;
  while ((m = sa.exec(content))) {
    const [, field, mapped, args] = m;
    const rules = [];
    if (call(args, 'nullable') === 'False' || call(args, 'primary_key') === 'True' || (mapped && !/Optional|None/.test(mapped) && call(args, 'nullable') !== 'True')) rules.push('required');
    if (call(args, 'unique') === 'True' || call(args, 'primary_key') === 'True') rules.push('unique');
    const sz = /\bString\(\s*(\d+)\s*\)/.exec(args); if (sz) rules.push(`maxlength(${sz[1]})`);
    const df = call(args, 'default'); if (df) rules.push(`default(${df.slice(0, 30)})`);
    out.push({ kind: 'schema', field, rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
  // pydantic / SQLModel: only inside classes that extend BaseModel / SQLModel / BaseSettings
  const classRe = /^class\s+(\w+)\(([^)]*\b(?:BaseModel|SQLModel|BaseSettings)\b[^)]*)\)\s*:/gm;
  while ((m = classRe.exec(content))) {
    const rest = content.slice(m.index + m[0].length);
    const end = rest.search(/^\S/m);
    const body = end === -1 ? rest : rest.slice(0, end);
    const base = lineAt(starts, m.index + m[0].length);
    body.split('\n').forEach((ln, i) => {
      const f = /^[ \t]+(\w+)\s*:\s*([\w\[\], .|"']+?)\s*(?:=\s*(.+))?$/.exec(ln);
      if (!f || ['model_config', 'Config', 'class'].includes(f[1])) return;
      const [, field, ann, dflt] = f;
      const rules = [];
      const optional = /Optional\[|\|\s*None|None\s*\|/.test(ann);
      const hasDefault = dflt !== undefined && !/^Field\(\s*(\.\.\.|Ellipsis)/.test(dflt.trim()) && dflt.trim() !== '...';
      const fieldCall = dflt && /^Field\(/.test(dflt.trim()) ? dflt : '';
      const fieldHasDefault = fieldCall && /\bdefault\s*=|^Field\(\s*(?!\w+\s*=)[^.\s)][^,)]*[,)]/.test(fieldCall) && !/^Field\(\s*\.\.\./.test(fieldCall);
      if (!optional && !(hasDefault && !fieldCall) && !fieldHasDefault) rules.push('required');
      const types = { EmailStr: 'email', HttpUrl: 'url', AnyUrl: 'url', UUID: 'uuid', SecretStr: 'secret', PositiveInt: 'positive', conint: 'int-range', constr: 'string-constraint' };
      for (const [k, v] of Object.entries(types)) if (new RegExp(`\\b${k}\\b`).test(ann + (dflt || ''))) rules.push(`type(${v})`);
      for (const [k, label] of [['min_length', 'minlength'], ['max_length', 'maxlength'], ['ge', 'min'], ['gt', 'greater'], ['le', 'max'], ['lt', 'less'], ['pattern', 'pattern'], ['regex', 'pattern'], ['min_items', 'minitems'], ['max_items', 'maxitems']]) { const v = call(fieldCall + ' ' + (dflt || ''), k); if (v) rules.push(`${label}(${v.slice(0, 24)})`); }
      out.push({ kind: m[2].includes('SQLModel') ? 'sqlmodel' : 'pydantic', field, rules, line: base + i, status: 'VERIFIED' });
    });
  }
  for (const v of content.matchAll(/@(?:field_validator|validator)\(\s*['"](\w+)['"][^)]*\)/g)) out.push({ kind: 'pydantic', field: v[1], rules: ['custom validator'], line: lineAt(starts, v.index), status: 'VERIFIED' });
  // marshmallow / DRF serializers / WTForms
  const mm = /^[ \t]+(\w+)\s*=\s*(?:fields|serializers)\.(\w+)\(([^\n]*)\)\s*$/gm;
  while ((m = mm.exec(content))) {
    const rules = [];
    const req = call(m[3], 'required'); if (req === 'True' || (/serializers\./.test(m[0]) && req !== 'False' && !call(m[3], 'read_only'))) rules.push('required');
    const ml = call(m[3], 'max_length') || (/Length\([^)]*max\s*=\s*(\d+)/.exec(m[3]) || [])[1]; if (ml) rules.push(`maxlength(${ml})`);
    const mn = call(m[3], 'min_length') || (/Length\([^)]*min\s*=\s*(\d+)/.exec(m[3]) || [])[1]; if (mn) rules.push(`minlength(${mn})`);
    if (/Email/.test(m[2])) rules.push('type(email)');
    if (rules.length) out.push({ kind: /serializers\./.test(m[0]) ? 'drf-serializer' : 'marshmallow', field: m[1], rules, line: lineAt(starts, m.index), status: 'VERIFIED' });
  }
  const wtf = /^[ \t]+(\w+)\s*=\s*\w+Field\([^\n]*validators\s*=\s*\[([^\]]*)\]/gm;
  while ((m = wtf.exec(content))) out.push({ kind: 'wtforms', field: m[1], rules: [...m[2].matchAll(/(\w+)(?:\(([^)]*)\))?/g)].map((x) => (x[2] ? `${x[1]}(${x[2].slice(0, 20)})` : x[1])).filter((x) => /^[A-Z]/.test(x)), line: lineAt(starts, m.index), status: 'VERIFIED' });
  // guards
  let n = 0;
  const raise = /\braise\s+(?:ValueError|ValidationError|ValidationException|HTTPException|BadRequest|PermissionDenied)\([^\n]*?(["'])([^"'\n]{3,100})\1/g;
  while ((m = raise.exec(content)) && n < 15) { out.push({ kind: 'guard', field: null, rules: [m[2]], line: lineAt(starts, m.index), status: 'INFERRED', basis: 'raises an error with this message' }); n++; }
  const abort = /\babort\(\s*(4\d\d)\s*(?:,\s*(?:description\s*=\s*)?(["'])([^"'\n]{3,100})\2)?/g;
  n = 0;
  while ((m = abort.exec(content)) && n < 10) { out.push({ kind: 'guard', field: null, rules: [`HTTP ${m[1]}${m[3] ? `: ${m[3]}` : ''}`], line: lineAt(starts, m.index), status: 'INFERRED', basis: 'aborts with this client error' }); n++; }
  const hx = /status_code\s*=\s*(4\d\d)[^)\n]*detail\s*=\s*(["'])([^"'\n]{3,100})\2/g;
  n = 0;
  while ((m = hx.exec(content)) && n < 10) { out.push({ kind: 'guard', field: null, rules: [`HTTP ${m[1]}: ${m[3]}`], line: lineAt(starts, m.index), status: 'INFERRED', basis: 'responds with this client error' }); n++; }
}

function finish(out) {
  const seen = new Set();
  return out.filter((v) => { const k = `${v.kind}|${v.field}|${v.rules.join(',')}|${v.line}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.line - b.line).slice(0, MAX_PER_FILE);
}

function analyzeValidation(code, language, isTest) {
  if (isTest || !code) return [];
  const starts = lineIndex(code);
  const out = [];
  if (language === 'go') { out.push(...analyzeGoValidation(code, starts)); goGuards(code, starts, out); return finish(out); }
  if (language === 'python') { pythonValidation(code, starts, out); return finish(out); }
  schemaOptions(code, starts, out);
  chainedValidators(code, starts, out);
  formAttributes(code, starts, out);
  guards(code, starts, out);
  return finish(out);
}

module.exports = { analyzeValidation };
