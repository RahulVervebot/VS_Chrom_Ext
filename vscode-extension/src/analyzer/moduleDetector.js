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
    const strKey = (k) => { const m = new RegExp(`['"]${k}['"]\\s*:\\s*(?:_\\(\\s*)?(?:'''([\\s\\S]*?)'''|\"\"\"([\\s\\S]*?)\"\"\"|'([^']*)'|"([^"]*)")`).exec(text); return m ? (m[1] ?? m[2] ?? m[3] ?? m[4]).trim() : null; };
    const listKey = (k) => { const m = new RegExp(`['"]${k}['"]\\s*:\\s*\\[([^\\]]*)\\]`).exec(text); return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : null; };
    const name = strKey('name'); if (name) out.title = name;
    const dep = listKey('depends'); if (dep) out.depends = dep;
    for (const k of ['summary', 'category', 'version', 'license', 'author']) { const v = strKey(k); if (v) out[k] = v.slice(0, 300); }
    const desc = strKey('description'); if (desc) out.description = desc.replace(/\s+/g, ' ').slice(0, 600);
    if (/['"]application['"]\s*:\s*True/.test(text)) out.application = true;
    if (/['"]installable['"]\s*:\s*False/.test(text)) out.installable = false;
    const data = [...(listKey('data') || []), ...(listKey('demo') || []).map((x) => `${x} (demo)`)]; if (data.length) out.data = data.slice(0, 300);
  } else if (kind === 'npm-package' || kind === 'php-package') { try { const j = JSON.parse(text); out.title = j.name || null; if (j.description) out.summary = String(j.description).slice(0, 300); if (j.version) out.version = String(j.version); out.depends = Object.keys({ ...(j.dependencies || j.require || {}) }).filter((d) => !/^(php|ext-)/.test(d)).slice(0, 30); } catch { /* unreadable manifest */ } } else if (kind === 'maven-module') { const own = text.replace(/<parent>[\s\S]*?<\/parent>/, '').replace(/<dependencies>[\s\S]*?<\/dependencies>/, ''); const a = /<artifactId>([^<]+)<\/artifactId>/.exec(own); if (a) out.title = a[1]; const d = /<description>([^<]+)<\/description>/.exec(own); if (d) out.summary = d[1].trim().slice(0, 300); } else if (kind === 'go-module') { const a = /^module\s+(\S+)/m.exec(text); if (a) out.title = a[1]; } else if (kind === 'rust-crate') { const a = /\[package\][\s\S]*?name\s*=\s*["']([^"']+)/.exec(text); if (a) out.title = a[1]; const d = /\[package\][\s\S]*?description\s*=\s*["']([^"']+)/.exec(text); if (d) out.summary = d[1].slice(0, 300); } else if (kind === 'python-package') { const d = /description\s*=\s*["']([^"']+)/.exec(text); if (d) out.summary = d[1].slice(0, 300); const n = /\bname\s*=\s*["']([^"']+)/.exec(text); if (n) out.title = n[1]; } else if (kind === 'dotnet-project') out.depends = [...text.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map((x) => path.posix.basename(x[1].replace(/\\/g, '/')).replace(/\.csproj$/, ''));
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
    const { name: _n, title, depends, ...extra } = d;
    out.push({ path: m.dir, kind: m.kind, name: d.name, ...(title && title !== d.name ? { title } : {}), ...(depends && depends.length ? { depends } : {}), files: own.length, ...(Object.keys(extra).length ? { manifest: extra } : {}) });
  }
  void set;
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

module.exports = { detectModules };
