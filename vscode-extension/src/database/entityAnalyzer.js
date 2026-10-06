const { analyzeGoModels } = require('../analyzer/goSupport');
// ORM/ODM model definitions: Mongoose, Sequelize, TypeORM, Eloquent, Django, SQLAlchemy.
const { lineIndex, lineAt, matchBrace, matchParen } = require('../utils/text');

function objectFields(body) {
  const fields = [];
  // top-level keys of an object literal: `name: { type: String }` or `name: String`
  let depth = 0;
  let key = '';
  let i = 0;
  const flush = (valueStart) => {
    const rest = body.slice(valueStart, valueStart + 200);
    const t = /(?:type\s*:\s*)?(?:\[\s*\{?\s*(?:type\s*:\s*)?)?(?:mongoose\.)?(?:DataTypes\.|Sequelize\.|Schema\.Types\.|Types\.)?([A-Za-z]+)/.exec(rest);
    fields.push({ name: key, type: t ? t[1].toLowerCase() : 'unknown', pk: /primaryKey\s*:\s*true/.test(rest.slice(0, 120)), unique: /unique\s*:\s*true/.test(rest.slice(0, 120)) });
  };
  while (i < body.length) {
    const c = body[i];
    if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c)) depth--;
    else if (depth === 0 && c === ':') {
      const before = body.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/) || body.slice(0, i).match(/['"]([\w$]+)['"]\s*$/);
      if (before) { key = before[1]; flush(i + 1); }
    }
    i++;
  }
  return fields.filter((f) => f.name && !['type', 'required', 'default', 'ref'].includes(f.name));
}

function analyzeMongoose(content, starts, file) {
  const entities = [];
  const schemas = new Map();
  let m;
  const sc = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{/g;
  while ((m = sc.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    schemas.set(m[1], { fields: objectFields(content.slice(open + 1, end)), line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
  }
  const mo = /(?:mongoose\.)?model\(\s*['"](\w+)['"]\s*,\s*(\w+)/g;
  while ((m = mo.exec(content))) {
    const s = schemas.get(m[2]) || { fields: [], line: lineAt(starts, m.index), endLine: lineAt(starts, m.index) };
    entities.push({ name: m[1], kind: 'collection', source: 'mongoose', fields: s.fields, file, line: s.line, endLine: Math.max(s.endLine, lineAt(starts, m.index)) });
  }
  return entities;
}

function analyzeSequelize(content, starts, file) {
  const entities = [];
  let m;
  const def = /\.define\(\s*['"](\w+)['"]\s*,\s*\{/g;
  while ((m = def.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    entities.push({ name: m[1], kind: 'model', source: 'sequelize', fields: objectFields(content.slice(open + 1, end)), file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
  }
  const init = /class\s+(\w+)\s+extends\s+Model[\s\S]*?\1\.init\(\s*\{/g;
  while ((m = init.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    entities.push({ name: m[1], kind: 'model', source: 'sequelize', fields: objectFields(content.slice(open + 1, end)), file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
  }
  return entities;
}

function analyzeTypeorm(content, starts, file) {
  const entities = [];
  const re = /@Entity\(\s*(?:['"](\w+)['"])?[^)]*\)\s*(?:export\s+)?class\s+(\w+)\s*\{/g;
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    const body = content.slice(open, end);
    const fields = [...body.matchAll(/@((?:Primary(?:Generated)?)?Column)\([^)]*\)\s*(\w+)\s*[!?]?\s*:\s*(\w+)/g)].map((f) => ({ name: f[2], type: f[3].toLowerCase(), pk: f[1].startsWith('Primary') }));
    entities.push({ name: m[2], table: m[1] || null, kind: 'model', source: 'typeorm', fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
  }
  return entities;
}

function analyzeEloquent(content, starts, file) {
  const entities = [];
  const re = /class\s+(\w+)\s+extends\s+(?:Model|Authenticatable|Pivot)\b[^{]*\{/g;
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    const end = matchBrace(content, open);
    const body = content.slice(open, end);
    const table = /\$table\s*=\s*['"](\w+)['"]/.exec(body);
    const fillable = /\$fillable\s*=\s*\[([^\]]*)\]/.exec(body);
    const fields = fillable ? [...fillable[1].matchAll(/['"](\w+)['"]/g)].map((f) => ({ name: f[1], type: 'unknown' })) : [];
    entities.push({ name: m[1], table: table ? table[1] : null, kind: 'model', source: 'eloquent', fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
  }
  return entities;
}

function analyzePythonModels(content, file) {
  const entities = [];
  const lines = content.split('\n');
  lines.forEach((ln, i) => {
    let m = /^class\s+(\w+)\(\s*(?:models\.Model|db\.Model|Base\b|DeclarativeBase|declarative_base\(\)|SQLModel)[^)]*\)\s*:/.exec(ln);
    if (!m) return;
    if (/SQLModel/.test(ln) && !/table\s*=\s*True/.test(ln)) return; // a plain SQLModel/pydantic schema is not a table
    const django = /models\.Model/.test(ln);
    const sqlmodel = /SQLModel/.test(ln);
    const fields = [];
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() && !/^\s/.test(lines[j])) break;
      end = j;
      let f = django
        ? /^\s+(\w+)\s*=\s*models\.(\w+)Field|^\s+(\w+)\s*=\s*models\.(ForeignKey|ManyToManyField|OneToOneField)/.exec(lines[j])
        : sqlmodel
          ? /^\s+(\w+)\s*:\s*(?:Optional\[)?([\w.]+)/.exec(lines[j])
          : /^\s+(\w+)\s*=\s*(?:db\.|sa\.)?Column\(\s*(?:db\.|sa\.)?(\w+)/.exec(lines[j]) || /^\s+(\w+)\s*:\s*Mapped\[(?:Optional\[)?([\w.]+)[^=]*=\s*(?:db\.)?mapped_column/.exec(lines[j]);
      if (f && !(sqlmodel && ['model_config', 'Config'].includes(f[1]))) fields.push({ name: f[1] || f[3], type: (f[2] || f[4] || 'unknown').toLowerCase().replace(/^str$/, 'string').replace(/^bool$/, 'bool'), pk: /primary_key\s*=\s*True/.test(lines[j]), unique: /unique\s*=\s*True/.test(lines[j]) });
    }
    entities.push({ name: m[1], kind: 'model', source: django ? 'django' : sqlmodel ? 'sqlmodel' : 'sqlalchemy', fields, file, line: i + 1, endLine: end + 1 });
  });
  return entities;
}

function analyzeEntities(content, language, file) {
  const starts = lineIndex(content);
  if (['javascript', 'typescript'].includes(language)) {
    const out = [];
    if (/mongoose/.test(content)) out.push(...analyzeMongoose(content, starts, file));
    if (/sequelize|DataTypes/i.test(content)) out.push(...analyzeSequelize(content, starts, file));
    if (/@Entity\(/.test(content)) out.push(...analyzeTypeorm(content, starts, file));
    return out;
  }
  if (language === 'php' && /extends\s+(Model|Authenticatable|Pivot)/.test(content)) return analyzeEloquent(content, starts, file);
  if (language === 'python') return analyzePythonModels(content, file);
  if (language === 'go') return analyzeGoModels(content, starts, file).entities;
  return [];
}

module.exports = { analyzeEntities };
