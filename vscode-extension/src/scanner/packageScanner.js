const fs = require('fs');
const path = require('path');

const MANIFESTS = [
  'package.json', 'composer.json', 'requirements.txt', 'pyproject.toml', 'Pipfile', 'pom.xml', 'build.gradle', 'build.gradle.kts',
  'go.mod', 'Gemfile', '*.csproj',
];

async function readJson(abs) {
  try { return JSON.parse(await fs.promises.readFile(abs, 'utf8')); } catch { return null; }
}

async function readText(abs) {
  try { return await fs.promises.readFile(abs, 'utf8'); } catch { return null; }
}

// Technology detection is evidence-based: each technology lists the manifest that proved it.
const NODE_TECH = {
  react: 'React', next: 'Next.js', vue: 'Vue', '@angular/core': 'Angular', express: 'Express', '@nestjs/core': 'NestJS',
  mysql: 'MySQL', mysql2: 'MySQL', pg: 'PostgreSQL', mongodb: 'MongoDB', mongoose: 'Mongoose', firebase: 'Firebase',
  'firebase-admin': 'Firebase', sqlite3: 'SQLite', 'better-sqlite3': 'SQLite', redis: 'Redis', ioredis: 'Redis',
  '@supabase/supabase-js': 'Supabase', '@prisma/client': 'Prisma', prisma: 'Prisma', sequelize: 'Sequelize', typeorm: 'TypeORM',
  stripe: 'Stripe', '@sendgrid/mail': 'SendGrid', twilio: 'Twilio', 'aws-sdk': 'AWS', jsonwebtoken: 'JWT', passport: 'Passport',
  jest: 'Jest', vitest: 'Vitest', mocha: 'Mocha', graphql: 'GraphQL', 'socket.io': 'Socket.IO', ws: 'WebSocket',
};

const GO_TECH = { 'github.com/gin-gonic/gin': 'Gin', 'github.com/labstack/echo': 'Echo', 'github.com/gofiber/fiber': 'Fiber', 'github.com/go-chi/chi': 'chi', 'github.com/gorilla/mux': 'Gorilla Mux', 'gorm.io/gorm': 'GORM', 'github.com/jmoiron/sqlx': 'sqlx', 'github.com/jackc/pgx': 'PostgreSQL', 'github.com/lib/pq': 'PostgreSQL', 'github.com/go-sql-driver/mysql': 'MySQL', 'go.mongodb.org/mongo-driver': 'MongoDB', 'github.com/redis/go-redis': 'Redis', 'github.com/go-redis/redis': 'Redis', 'github.com/golang-jwt/jwt': 'JWT', 'github.com/stripe/stripe-go': 'Stripe', 'github.com/go-playground/validator': 'go-playground/validator' };
const PY_TECH = { django: 'Django', flask: 'Flask', fastapi: 'FastAPI', sqlalchemy: 'SQLAlchemy', sqlmodel: 'SQLModel', pydantic: 'Pydantic', celery: 'Celery', 'djangorestframework': 'Django REST framework', marshmallow: 'marshmallow', pymongo: 'MongoDB', redis: 'Redis', stripe: 'Stripe', 'psycopg2': 'PostgreSQL', 'psycopg2-binary': 'PostgreSQL', pyjwt: 'JWT', alembic: 'Alembic' };

// go.mod "require" lines (block or single) -> { module: version }
function parseGoMod(text) {
  const deps = {};
  for (const m of text.matchAll(/^\s*require\s+([^\s(]+)\s+(v[^\s]+)/gm)) deps[m[1]] = m[2];
  for (const b of text.matchAll(/^\s*require\s*\(([\s\S]*?)^\s*\)/gm)) for (const l of b[1].split('\n')) { const m = /^\s*([^\s/][^\s]*)\s+(v[^\s]+)/.exec(l.replace(/\/\/.*$/, '')); if (m) deps[m[1]] = m[2]; }
  return deps;
}

// requirements.txt / pyproject.toml (PEP 621 and Poetry) -> { package: version spec }
function parsePython(text, base) {
  const deps = {};
  const add = (spec) => { const m = /^\s*([A-Za-z0-9_.-]+)\s*(?:\[[^\]]*\])?\s*((?:[=<>!~]=?|===)\s*[^\s;#,]+(?:\s*,\s*[=<>!~]=?\s*[^\s;#,]+)*)?/.exec(spec); if (m && m[1] && !/^(python|-r|-e)$/i.test(m[1])) deps[m[1].toLowerCase()] = (m[2] || '*').replace(/\s+/g, ''); };
  if (base === 'requirements.txt') { for (const l of text.split('\n')) { const t = l.replace(/#.*$/, '').trim(); if (t && !t.startsWith('-') && !t.startsWith('http')) add(t); } return deps; }
  const proj = /\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/.exec(text);
  if (proj) for (const m of proj[1].matchAll(/["']([^"']+)["']/g)) add(m[1]);
  const poetry = /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/.exec(text);
  if (poetry) for (const m of poetry[1].matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:["']([^"']+)["']|\{[^}]*version\s*=\s*["']([^"']+)["'])/gm)) if (m[1].toLowerCase() !== 'python') deps[m[1].toLowerCase()] = m[2] || m[3];
  return deps;
}

async function scanPackages(root, filePaths) {
  const found = [];
  const technologies = new Map();
  const commands = { scripts: {} };
  const addTech = (name, file) => {
    if (!technologies.has(name)) technologies.set(name, new Set());
    technologies.get(name).add(file);
  };

  const manifestFiles = filePaths.filter((p) => {
    const base = path.posix.basename(p);
    return MANIFESTS.some((m) => (m.startsWith('*') ? base.endsWith(m.slice(1)) : base === m));
  });

  for (const rel of manifestFiles) {
    const abs = path.join(root, rel);
    const base = path.posix.basename(rel);
    const entry = { path: rel, kind: base, dependencies: {}, devDependencies: {} };

    if (base === 'package.json') {
      const pkg = await readJson(abs);
      if (!pkg) continue;
      entry.name = pkg.name;
      entry.version = pkg.version;
      entry.dependencies = pkg.dependencies || {};
      entry.devDependencies = pkg.devDependencies || {};
      addTech('Node.js', rel);
      entry.ecosystem = 'npm';
      const all = { ...entry.dependencies, ...entry.devDependencies };
      for (const [dep, tech] of Object.entries(NODE_TECH)) if (all[dep]) addTech(tech, rel);
      if (pkg.scripts) {
        commands.scripts[rel] = pkg.scripts;
      }
    } else if (base === 'composer.json') {
      const c = await readJson(abs);
      if (!c) continue;
      entry.dependencies = c.require || {};
      entry.ecosystem = 'composer';
      addTech('PHP', rel);
      if (entry.dependencies['laravel/framework']) addTech('Laravel', rel);
    } else if (base === 'requirements.txt' || base === 'Pipfile' || base === 'pyproject.toml') {
      const t = (await readText(abs)) || '';
      addTech('Python', rel);
      entry.ecosystem = 'pip';
      entry.dependencies = base === 'Pipfile' ? {} : parsePython(t, base);
      for (const [dep, tech] of Object.entries(PY_TECH)) if (entry.dependencies[dep]) addTech(tech, rel);
      if (/django/i.test(t)) addTech('Django', rel);
      if (/flask/i.test(t)) addTech('Flask', rel);
      if (/sqlalchemy/i.test(t)) addTech('SQLAlchemy', rel);
    } else if (base === 'pom.xml' || base.startsWith('build.gradle')) {
      const t = (await readText(abs)) || '';
      addTech('Java', rel);
      if (/spring-boot|springframework/i.test(t)) addTech('Spring', rel);
    } else if (base === 'go.mod') {
      const t = (await readText(abs)) || '';
      addTech('Go', rel);
      entry.ecosystem = 'go';
      entry.name = (/^\s*module\s+(\S+)/m.exec(t) || [])[1];
      entry.dependencies = parseGoMod(t);
      for (const [dep, tech] of Object.entries(GO_TECH)) if (Object.keys(entry.dependencies).some((d) => d === dep || d.startsWith(`${dep}/`))) addTech(tech, rel);
    } else if (base === 'Gemfile') {
      addTech('Ruby', rel);
    } else if (base.endsWith('.csproj')) {
      addTech('.NET', rel);
    }
    found.push(entry);
  }

  return {
    manifests: found,
    technologies: [...technologies.entries()].map(([name, files]) => ({ name, evidence: [...files].sort() })).sort((a, b) => a.name.localeCompare(b.name)),
    commands,
  };
}

module.exports = { scanPackages };
