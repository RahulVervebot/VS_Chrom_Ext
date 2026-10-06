// Queries and mutations. SQL statements are verified syntactically; ORM calls are resolved against known entities later.
const { lineIndex, lineAt } = require('../utils/text');
const { analyzeGoOrmCalls } = require('../analyzer/goSupport');
const { analyzeJvmOrmCalls } = require('../analyzer/jvmSupport');
const { analyzeDotnetOrmCalls } = require('../analyzer/dotnetSupport');

const READ = new Set(['find', 'findOne', 'findAll', 'findById', 'findByPk', 'findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'get', 'select', 'where', 'all', 'first', 'countDocuments', 'exists']);
const WRITE = new Set(['create', 'insert', 'insertMany', 'insertOne', 'save', 'update', 'updateOne', 'updateMany', 'upsert', 'delete', 'destroy', 'remove', 'deleteOne', 'deleteMany', 'findByIdAndUpdate', 'findByIdAndDelete', 'findOneAndUpdate', 'bulkCreate', 'set', 'add']);

function analyzeSqlQueries(content, starts, file) {
  const queries = [];
  const patterns = [
    { re: /\bSELECT\b[\s\S]{0,400}?\bFROM\s+[`"]?(\w+)[`"]?/gi, op: 'SELECT', kind: 'read' },
    { re: /\bINSERT\s+INTO\s+[`"]?(\w+)[`"]?/gi, op: 'INSERT', kind: 'write' },
    { re: /\bUPDATE\s+[`"]?(\w+)[`"]?\s+SET\b/gi, op: 'UPDATE', kind: 'write' },
    { re: /\bDELETE\s+FROM\s+[`"]?(\w+)[`"]?/gi, op: 'DELETE', kind: 'write' },
  ];
  for (const { re, op, kind } of patterns) {
    let m;
    while ((m = re.exec(content))) {
      // Require SQL to sit inside a string/template or a .sql file to avoid prose matches.
      const before = content.slice(Math.max(0, m.index - 2), m.index);
      if (file.endsWith('.sql') || /['"`(]\s*$|^\s*$/.test(before) || /(query|execute|raw|sql)\s*\(/i.test(content.slice(Math.max(0, m.index - 60), m.index))) {
        queries.push({ entity: m[1], operation: op, kind, line: lineAt(starts, m.index), orm: 'sql', file, status: 'VERIFIED' });
      }
    }
  }
  const joins = /\bJOIN\s+[`"]?(\w+)[`"]?/gi;
  let m;
  while ((m = joins.exec(content))) queries.push({ entity: m[1], operation: 'JOIN', kind: 'read', line: lineAt(starts, m.index), orm: 'sql', file, status: 'VERIFIED' });
  if (/\b(BEGIN|START TRANSACTION|beginTransaction|\.transaction\(|\$transaction)\b/.test(content)) {
    queries.push({ entity: null, operation: 'TRANSACTION', kind: 'transaction', line: lineAt(starts, content.search(/\b(BEGIN|START TRANSACTION|beginTransaction|\.transaction\(|\$transaction)\b/)), orm: 'sql', file, status: 'VERIFIED' });
  }
  return queries;
}

// Candidates: capitalized receiver + known method. Resolved to entities at project level.
function analyzeOrmCalls(content, starts, file) {
  const calls = [];
  const re = /\b([A-Z]\w*|prisma\.\w+)\.(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(content))) {
    const method = m[2];
    const kind = READ.has(method) ? 'read' : WRITE.has(method) ? 'write' : null;
    if (!kind) continue;
    const receiver = m[1].startsWith('prisma.') ? m[1].slice(7) : m[1];
    calls.push({ receiver, prisma: m[1].startsWith('prisma.'), operation: method, kind, line: lineAt(starts, m.index), file });
  }
  // Eloquent
  const el = /\b([A-Z]\w*)::(find|findOrFail|all|where|create|update|delete|first|get|firstOrCreate|updateOrCreate|destroy|insert)\s*\(/g;
  while ((m = el.exec(content))) {
    const kind = ['find', 'findOrFail', 'all', 'where', 'first', 'get'].includes(m[2]) ? 'read' : 'write';
    calls.push({ receiver: m[1], operation: m[2], kind, line: lineAt(starts, m.index), file, orm: 'eloquent' });
  }
  // Django
  const dj = /\b([A-Z]\w*)\.objects\.(get|filter|all|create|update|delete|exclude|count)\s*\(/g;
  while ((m = dj.exec(content))) calls.push({ receiver: m[1], operation: m[2], kind: ['create', 'update', 'delete'].includes(m[2]) ? 'write' : 'read', line: lineAt(starts, m.index), file, orm: 'django' });
  return calls;
}

function analyzeCollectionQueries(content, starts, file) {
  const out = [];
  let m;
  // Firestore / Mongo native / knex
  const col = /\b(?:collection|doc)\(\s*(?:[\w.]+\s*,\s*)?['"](\w+)['"]/g;
  while ((m = col.exec(content))) {
    const window = content.slice(m.index, m.index + 300);
    const op = /\.(get|getDocs|getDoc|onSnapshot|find|findOne)\(/.exec(window) ? 'read' : /\.(add|addDoc|set|setDoc|update|updateDoc|delete|deleteDoc|insertOne|insertMany|updateOne|deleteOne)\(/.exec(window) ? 'write' : 'reference';
    out.push({ entity: m[1], operation: 'collection', kind: op, line: lineAt(starts, m.index), orm: 'collection', file, status: 'VERIFIED' });
  }
  const knex = /\b(?:knex|db)\(\s*['"](\w+)['"]\s*\)\.(select|where|first|insert|update|del|delete)/g;
  while ((m = knex.exec(content))) out.push({ entity: m[1], operation: m[2], kind: ['select', 'where', 'first'].includes(m[2]) ? 'read' : 'write', line: lineAt(starts, m.index), orm: 'knex', file, status: 'VERIFIED' });
  return out;
}

function analyzeQueries(content, file) {
  const starts = lineIndex(content);
  return {
    sql: [...analyzeSqlQueries(content, starts, file), ...analyzeCollectionQueries(content, starts, file)],
    ormCalls: [...analyzeOrmCalls(content, starts, file), ...(file.endsWith('.go') ? analyzeGoOrmCalls(content, starts, file) : []), ...(/\.(java|kt)$/.test(file) ? analyzeJvmOrmCalls(content, starts, file) : []), ...(file.endsWith('.cs') ? analyzeDotnetOrmCalls(content, starts, file) : [])],
  };
}

module.exports = { analyzeQueries };
