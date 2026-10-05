// Validation rules found in source, each with file + line. Syntactic extraction only: a rule is reported when the code literally
// declares it (a schema option, a Joi/zod/yup/express-validator/class-validator chain, an HTML form attribute).
// Hand-written guards (`if (!x) throw ...`) are INFERRED because their intent is a reading of the code.
const { lineIndex, lineAt, matchBrace } = require('../utils/text');

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

function analyzeValidation(code, language, isTest) {
  if (isTest || !code) return [];
  const starts = lineIndex(code);
  const out = [];
  schemaOptions(code, starts, out);
  chainedValidators(code, starts, out);
  formAttributes(code, starts, out);
  guards(code, starts, out);
  const seen = new Set();
  return out.filter((v) => { const k = `${v.kind}|${v.field}|${v.rules.join(',')}|${v.line}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.line - b.line).slice(0, MAX_PER_FILE);
}

module.exports = { analyzeValidation };
