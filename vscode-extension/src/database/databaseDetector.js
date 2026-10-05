// Detects database technology from actual evidence (imports, packages, SQL, config) and orchestrates per-file DB analysis.
const { lineIndex, lineAt } = require('../utils/text');
const { analyzeSchema } = require('./schemaAnalyzer');
const { analyzeEntities } = require('./entityAnalyzer');
const { analyzeOrmRelationships } = require('./relationshipAnalyzer');
const { analyzeQueries } = require('./queryAnalyzer');

const TECH_SIGNS = [
  { name: 'MySQL', re: /require\(['"]mysql2?(?:\/promise)?['"]\)|from\s+['"]mysql2?(?:\/promise)?['"]|mysqli_|new\s+mysqli|PDO\(['"]mysql|pymysql|mysql\.connector/ },
  { name: 'PostgreSQL', re: /require\(['"]pg['"]\)|from\s+['"]pg['"]|psycopg2|PDO\(['"]pgsql|pg_connect|postgres(?:ql)?:\/\// },
  { name: 'MongoDB', re: /require\(['"]mongodb['"]\)|from\s+['"]mongodb['"]|MongoClient|pymongo/ },
  { name: 'Mongoose', re: /require\(['"]mongoose['"]\)|from\s+['"]mongoose['"]/ },
  { name: 'Firebase', re: /from\s+['"]firebase(?:\/[\w-]+)?['"]|require\(['"]firebase(?:-admin)?['"]\)|from\s+['"]firebase-admin/ },
  { name: 'Firestore', re: /getFirestore\(|firestore\(\)|from\s+['"]firebase\/firestore['"]/ },
  { name: 'SQLite', re: /sqlite3|better-sqlite3|sqlite:\/\/|import\s+sqlite3/ },
  { name: 'Redis', re: /require\(['"]i?redis['"]\)|from\s+['"]i?redis['"]|redis\.createClient|new\s+Redis\(/ },
  { name: 'Supabase', re: /@supabase\/supabase-js|createClient\([^)]*supabase/ },
  { name: 'Prisma', re: /@prisma\/client|new\s+PrismaClient/ },
  { name: 'Sequelize', re: /require\(['"]sequelize['"]\)|from\s+['"]sequelize['"]|new\s+Sequelize\(/ },
  { name: 'TypeORM', re: /from\s+['"]typeorm['"]|require\(['"]typeorm['"]\)/ },
  { name: 'Knex', re: /require\(['"]knex['"]\)|from\s+['"]knex['"]/ },
  { name: 'Laravel Eloquent', re: /Illuminate\\Database\\Eloquent|extends\s+Model\b/ },
  { name: 'WordPress database', re: /\$wpdb->|global\s+\$wpdb/ },
  { name: 'Django ORM', re: /django\.db\s+import\s+models|models\.Model/ },
  { name: 'SQLAlchemy', re: /sqlalchemy|db\.Model/ },
  { name: 'Custom SQL', re: /\b(?:CREATE\s+TABLE|INSERT\s+INTO|SELECT\s+[\w*,\s`]+\s+FROM)\b/i },
];

function detectTechnologies(content, file) {
  const starts = lineIndex(content);
  const out = [];
  for (const t of TECH_SIGNS) {
    const m = t.re.exec(content);
    if (m) out.push({ name: t.name, file, line: lineAt(starts, m.index) });
  }
  return out;
}

function analyzeDatabaseFile(content, language, file) {
  const schema = analyzeSchema(content, language, file);
  const entities = [...schema.entities, ...analyzeEntities(content, language, file)];
  const relationships = [...schema.relationships, ...analyzeOrmRelationships(content, language, file, entities)];
  const queries = analyzeQueries(content, file);
  return {
    technologies: detectTechnologies(content, file),
    entities,
    relationships,
    indexes: schema.indexes,
    queries: queries.sql,
    ormCalls: queries.ormCalls,
  };
}

module.exports = { analyzeDatabaseFile, detectTechnologies };
