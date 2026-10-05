const path = require('path');

const CONFIG_MATCHERS = [
  { re: /^(\.eslintrc.*|eslint\.config\..*)$/, kind: 'lint' },
  { re: /^(\.prettierrc.*|prettier\.config\..*)$/, kind: 'format' },
  { re: /^(webpack|vite|rollup|esbuild|next|nuxt|vue|angular|babel|jest|vitest|playwright|cypress)\.config\..*$/, kind: 'build-or-test' },
  { re: /^(tsconfig|jsconfig)\.json$/, kind: 'compiler' },
  { re: /^(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/, kind: 'deployment' },
  { re: /^(vercel\.json|netlify\.toml|serverless\.ya?ml|firebase\.json|app\.yaml|Procfile|fly\.toml)$/, kind: 'deployment' },
  { re: /^\.github$/, kind: 'ci' },
  { re: /^(\.gitlab-ci\.yml|Jenkinsfile|azure-pipelines\.yml|\.travis\.yml|bitbucket-pipelines\.yml)$/, kind: 'ci' },
  { re: /^(\.env(\..*)?|\.env\.example)$/, kind: 'environment' },
  { re: /^(schema\.prisma|knexfile\..*|ormconfig\..*|sequelize\.config\..*|\.sequelizerc)$/, kind: 'database' },
  { re: /^(wp-config\.php|artisan|manage\.py|settings\.py|application\.(properties|ya?ml)|appsettings.*\.json)$/, kind: 'framework' },
];

function scanConfig(filePaths) {
  const out = [];
  for (const p of filePaths) {
    const base = path.posix.basename(p);
    const inWorkflows = p.startsWith('.github/workflows/');
    if (inWorkflows) { out.push({ path: p, kind: 'ci' }); continue; }
    for (const m of CONFIG_MATCHERS) {
      if (m.re.test(base)) { out.push({ path: p, kind: m.kind }); break; }
    }
  }
  return out;
}

module.exports = { scanConfig };
