// Sub-projects inside a repository: monorepo packages, Odoo add-ons, Django apps, Maven/Gradle modules, Go modules, Rust crates,
// .NET projects, Composer/Ruby/Python packages. Detected from marker files, never from guesses about code.
const fs = require('fs');
const path = require('path');

const MARKERS = [
  { re: /(^|\/)__(manifest|openerp)__\.py$/, kind: 'odoo-addon' },
  { re: /(^|\/)apps\.py$/, kind: 'django-app', needs: /(models|views|urls|admin|serializers)\.py$/ },
  { re: /(^|\/)package\.json$/, kind: 'npm-package' },
  { re: /(^|\/)pom\.xml$/, kind: 'maven-module' },
  { re: /(^|\/)build\.gradle(\.kts)?$/, kind: 'gradle-module' },
  { re: /(^|\/)go\.mod$/, kind: 'go-module' },
  { re: /(^|\/)Cargo\.toml$/, kind: 'rust-crate' },
  { re: /\.csproj$/, kind: 'dotnet-project' },
  { re: /(^|\/)composer\.json$/, kind: 'php-package' },
  { re: /(^|\/)[\w.-]+\.gemspec$/, kind: 'ruby-gem' },
  { re: /(^|\/)(setup\.py|pyproject\.toml)$/, kind: 'python-package' },
];
const WORKSPACE_DIRS = new Set(['apps', 'packages', 'services', 'libs', 'modules', 'addons', 'plugins', 'projects', 'extensions', 'crates', 'components']);

const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

async function readSmall(root, rel) {
  try { const abs = path.join(root, rel); const st = await fs.promises.stat(abs); if (st.size > 64 * 1024) return ''; return await fs.promises.readFile(abs, 'utf8'); } catch { return ''; }
}

async function describe(root, kind, markerPath, dirName) {
  const text = await readSmall(root, markerPath);
  const out = { name: dirName };
  if (kind === 'odoo-addon') {
    const name = /['"]name['"]\s*:\s*['"]([^'"]+)['"]/.exec(text); if (name) out.title = name[1];
    const dep = /['"]depends['"]\s*:\s*\[([^\]]*)\]/.exec(text); if (dep) out.depends = [...dep[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  } else if (kind === 'npm-package' || kind === 'php-package') { try { const j = JSON.parse(text); out.title = j.name || null; out.depends = Object.keys({ ...(j.dependencies || j.require || {}) }).filter((d) => !/^(php|ext-)/.test(d)).slice(0, 30); } catch { /* unreadable manifest */ } } else if (kind === 'maven-module') { const a = /<artifactId>([^<]+)<\/artifactId>/.exec(text.replace(/<parent>[\s\S]*?<\/parent>/, '')); if (a) out.title = a[1]; } else if (kind === 'go-module') { const a = /^module\s+(\S+)/m.exec(text); if (a) out.title = a[1]; } else if (kind === 'rust-crate') { const a = /\[package\][\s\S]*?name\s*=\s*["']([^"']+)/.exec(text); if (a) out.title = a[1]; } else if (kind === 'dotnet-project') out.depends = [...text.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map((x) => path.posix.basename(x[1].replace(/\\/g, '/')).replace(/\.csproj$/, ''));
  return out;
}

// files: scan file records. Returns [{ path, kind, name, title?, depends?, files }] (the repository root itself is not listed).
async function detectModules(root, files) {
  const paths = files.map((f) => f.path).filter((p) => !p.startsWith('.ai-project/'));
  const set = new Set(paths);
  const found = new Map(); // dir -> module
  for (const p of paths) {
    for (const mk of MARKERS) {
      if (!mk.re.test(p)) continue;
      const dir = dirOf(p);
      if (!dir) break; // the repository root itself
      if (/(^|\/)(node_modules|vendor|dist|build|target|\.venv|venv|site-packages|__pycache__|\.git)(\/|$)/.test(dir)) break;
      if (mk.needs && !paths.some((q) => dirOf(q) === dir && mk.needs.test(q))) break;
      if (found.has(dir) && found.get(dir).kind !== 'python-package' && found.get(dir).kind !== 'npm-package') break; // a more specific marker already claimed it
      found.set(dir, { dir, kind: mk.kind, marker: p });
      break;
    }
  }
  // folders like apps/*, packages/*, services/* with several children are workspaces even without a manifest
  const children = new Map();
  for (const p of paths) { const segs = p.split('/'); for (let i = 0; i < segs.length - 1; i++) if (WORKSPACE_DIRS.has(segs[i].toLowerCase())) { const base = segs.slice(0, i + 1).join('/'); const child = `${base}/${segs[i + 1]}`; if (segs.length > i + 2) (children.get(base) || children.set(base, new Set()).get(base)).add(child); break; } }
  for (const [, kids] of children) if (kids.size >= 2) for (const k of kids) if (!found.has(k)) found.set(k, { dir: k, kind: 'workspace-folder', marker: null });
  const out = [];
  for (const m of found.values()) {
    const d = await describe(root, m.kind, m.marker, path.posix.basename(m.dir));
    const own = paths.filter((p) => p === m.dir || p.startsWith(`${m.dir}/`));
    if (!own.length) continue;
    out.push({ path: m.dir, kind: m.kind, name: d.name, ...(d.title && d.title !== d.name ? { title: d.title } : {}), ...(d.depends && d.depends.length ? { depends: d.depends } : {}), files: own.length });
  }
  void set;
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = { detectModules };
