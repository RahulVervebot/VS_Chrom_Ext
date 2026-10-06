const { analyzeRailsSchema } = require('../analyzer/rubySupport');
// Schema definitions found in source: SQL DDL, Prisma schema, knex/Laravel migrations.
const { lineIndex, lineAt, matchParen, splitArgs } = require('../utils/text');

const SQL_TYPES = /^(int|integer|bigint|smallint|tinyint|serial|bigserial|varchar|char|text|longtext|mediumtext|boolean|bool|date|datetime|timestamp|timestamptz|time|decimal|numeric|float|double|real|json|jsonb|uuid|blob|bytea|enum)/i;

function parseSqlColumns(body) {
  const columns = [];
  const fks = [];
  const pks = [];
  for (const raw of splitArgs(body)) {
    const part = raw.replace(/\s+/g, ' ').trim();
    let m;
    if ((m = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY KEY\s*\(([^)]+)\)/i.exec(part))) { m[1].split(',').forEach((c) => pks.push(c.replace(/[`"\[\]\s]/g, ''))); continue; }
    if ((m = /^(?:CONSTRAINT\s+\S+\s+)?FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/i.exec(part))) {
      fks.push({ column: m[1].replace(/[`"\s]/g, ''), references: m[2], referencedColumn: m[3].replace(/[`"\s]/g, '') });
      continue;
    }
    if (/^(UNIQUE|KEY|INDEX|CHECK|CONSTRAINT|FULLTEXT)\b/i.test(part)) continue;
    m = /^[`"\[]?(\w+)[`"\]]?\s+([\w]+(?:\([^)]*\))?)(.*)$/.exec(part);
    if (!m || !SQL_TYPES.test(m[2])) continue;
    const col = { name: m[1], type: m[2].toLowerCase(), pk: /PRIMARY KEY/i.test(m[3]), nullable: !/NOT NULL|PRIMARY KEY/i.test(m[3]), unique: /\bUNIQUE\b/i.test(m[3]) };
    const ref = /REFERENCES\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/i.exec(m[3]);
    if (ref) fks.push({ column: m[1], references: ref[1], referencedColumn: ref[2].replace(/[`"\s]/g, '') });
    columns.push(col);
  }
  columns.forEach((c) => { if (pks.includes(c.name)) c.pk = true; });
  return { columns, fks };
}

function analyzeSql(content, starts, file) {
  const entities = [];
  const relationships = [];
  const indexes = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?(?:\w+\.)?(\w+)[`"\]]?\s*\(/gi;
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    const close = matchParen(content, open);
    if (close === -1) continue;
    const { columns, fks } = parseSqlColumns(content.slice(open + 1, close));
    const line = lineAt(starts, m.index);
    entities.push({ name: m[1], kind: 'table', source: 'sql', fields: columns, file, line, endLine: lineAt(starts, close) });
    for (const fk of fks) relationships.push({ from: m[1], to: fk.references, type: 'many-to-one', via: `${m[1]}.${fk.column} -> ${fk.references}.${fk.referencedColumn}`, file, line, source: 'sql-foreign-key' });
  }
  const idx = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s+ON\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/gi;
  while ((m = idx.exec(content))) indexes.push({ name: m[2], entity: m[3], columns: m[4].split(',').map((s) => s.trim()), unique: !!m[1], file, line: lineAt(starts, m.index) });
  const alter = /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/gi;
  while ((m = alter.exec(content))) relationships.push({ from: m[1], to: m[3], type: 'many-to-one', via: `${m[1]}.${m[2].trim()} -> ${m[3]}.${m[4].trim()}`, file, line: lineAt(starts, m.index), source: 'sql-foreign-key' });
  return { entities, relationships, indexes };
}

function analyzePrisma(content, starts, file) {
  const entities = [];
  const relationships = [];
  const models = [...content.matchAll(/^model\s+(\w+)\s*\{([^}]*)\}/gm)];
  const names = new Set(models.map((x) => x[1]));
  for (const m of models) {
    const fields = [];
    for (const raw of m[2].split('\n')) {
      const line = raw.trim();
      const f = /^(\w+)\s+([\w]+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!f || line.startsWith('@@') || line.startsWith('//')) continue;
      const isRel = names.has(f[2]);
      if (isRel) {
        const rel = /@relation\(([^)]*)\)/.exec(f[5]);
        const hasFk = rel && /fields\s*:/.test(rel[1]);
        relationships.push({ from: m[1], to: f[2], type: f[3] ? 'one-to-many' : (hasFk ? 'many-to-one' : 'one-to-one'), via: `${m[1]}.${f[1]}`, file, line: lineAt(starts, m.index), source: 'prisma-relation', owner: !!hasFk });
      } else {
        fields.push({ name: f[1], type: f[2].toLowerCase() + (f[3] || ''), pk: /@id\b/.test(f[5]), nullable: !!f[4], unique: /@unique\b/.test(f[5]) });
      }
    }
    entities.push({ name: m[1], kind: 'model', source: 'prisma', fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, m.index + m[0].length) });
  }
  return { entities, relationships, indexes: [] };
}

function analyzeKnexMigration(content, starts, file) {
  const entities = [];
  const relationships = [];
  const re = /\.createTable\(\s*['"]([\w]+)['"]\s*,\s*(?:async\s*)?\(?(\w+)\)?\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    let depth = 0; let end = open;
    for (let i = open; i < content.length; i++) { if (content[i] === '{') depth++; if (content[i] === '}') { depth--; if (!depth) { end = i; break; } } }
    const body = content.slice(open, end);
    const t = m[2];
    const fields = [];
    for (const c of body.matchAll(new RegExp(`${t}\\.(increments|bigIncrements|string|text|integer|bigInteger|boolean|date|dateTime|timestamp|decimal|float|json|uuid|enu|enum)\\(\\s*['"]?(\\w+)?['"]?`, 'g'))) {
      fields.push({ name: c[2] || (c[1].includes('ncrements') ? 'id' : c[1]), type: c[1], pk: c[1].includes('ncrements') });
    }
    for (const r of body.matchAll(new RegExp(`${t}\\.(?:integer|bigInteger|uuid|bigInteger)\\(\\s*['"](\\w+)['"]\\s*\\)[^;]*?\\.references\\(\\s*['"](\\w+)['"]\\s*\\)\\s*\\.inTable\\(\\s*['"](\\w+)['"]`, 'g'))) {
      relationships.push({ from: m[1], to: r[3], type: 'many-to-one', via: `${m[1]}.${r[1]} -> ${r[3]}.${r[2]}`, file, line: lineAt(starts, m.index), source: 'knex-foreign-key' });
    }
    entities.push({ name: m[1], kind: 'table', source: 'knex-migration', fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
  }
  return { entities, relationships, indexes: [] };
}

function analyzeLaravelMigration(content, starts, file) {
  const entities = [];
  const relationships = [];
  const re = /Schema::create\(\s*['"](\w+)['"]\s*,\s*function\s*\([^)]*\)\s*\{/g;
  let m;
  while ((m = re.exec(content))) {
    const open = m.index + m[0].length - 1;
    let depth = 0; let end = open;
    for (let i = open; i < content.length; i++) { if (content[i] === '{') depth++; if (content[i] === '}') { depth--; if (!depth) { end = i; break; } } }
    const body = content.slice(open, end);
    const fields = [];
    for (const c of body.matchAll(/\$table->(id|string|text|integer|bigInteger|unsignedBigInteger|boolean|date|dateTime|timestamp|decimal|float|json|uuid|foreignId|enum)\(\s*(?:['"](\w+)['"])?/g)) {
      fields.push({ name: c[2] || (c[1] === 'id' ? 'id' : c[1]), type: c[1], pk: c[1] === 'id' });
    }
    for (const r of body.matchAll(/\$table->foreignId\(\s*['"](\w+)['"]\s*\)(?:->constrained\(\s*(?:['"](\w+)['"])?\s*\))?/g)) {
      const target = r[2] || r[1].replace(/_id$/, '') + 's';
      relationships.push({ from: m[1], to: target, type: 'many-to-one', via: `${m[1]}.${r[1]}`, file, line: lineAt(starts, m.index), source: 'laravel-foreign-key' });
    }
    entities.push({ name: m[1], kind: 'table', source: 'laravel-migration', fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
  }
  return { entities, relationships, indexes: [] };
}

function analyzeSchema(content, language, file) {
  const starts = lineIndex(content);
  const empty = { entities: [], relationships: [], indexes: [] };
  if (language === 'sql') return analyzeSql(content, starts, file);
  if (language === 'prisma') return analyzePrisma(content, starts, file);
  if (language === 'ruby' && /create_table/.test(content)) return analyzeRailsSchema(content, starts, file);
  if (language === 'php' && /Schema::create/.test(content)) return analyzeLaravelMigration(content, starts, file);
  if (['javascript', 'typescript'].includes(language) && /\.createTable\(/.test(content)) return analyzeKnexMigration(content, starts, file);
  if (['javascript', 'typescript', 'python', 'php', 'ruby', 'go', 'java', 'kotlin', 'csharp', 'rust'].includes(language) && /CREATE\s+TABLE/i.test(content)) return analyzeSql(content, starts, file);
  return empty;
}

module.exports = { analyzeSchema };
