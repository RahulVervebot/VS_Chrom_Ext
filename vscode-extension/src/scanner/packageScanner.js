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
      const all = { ...entry.dependencies, ...entry.devDependencies };
      for (const [dep, tech] of Object.entries(NODE_TECH)) if (all[dep]) addTech(tech, rel);
      if (pkg.scripts) {
        commands.scripts[rel] = pkg.scripts;
      }
    } else if (base === 'composer.json') {
      const c = await readJson(abs);
      if (!c) continue;
      entry.dependencies = c.require || {};
      addTech('PHP', rel);
      if (entry.dependencies['laravel/framework']) addTech('Laravel', rel);
    } else if (base === 'requirements.txt' || base === 'Pipfile' || base === 'pyproject.toml') {
      const t = (await readText(abs)) || '';
      addTech('Python', rel);
      if (/django/i.test(t)) addTech('Django', rel);
      if (/flask/i.test(t)) addTech('Flask', rel);
      if (/sqlalchemy/i.test(t)) addTech('SQLAlchemy', rel);
    } else if (base === 'pom.xml' || base.startsWith('build.gradle')) {
      const t = (await readText(abs)) || '';
      addTech('Java', rel);
      if (/spring-boot|springframework/i.test(t)) addTech('Spring', rel);
    } else if (base === 'go.mod') {
      addTech('Go', rel);
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
