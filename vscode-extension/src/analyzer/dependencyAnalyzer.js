// Import/export extraction per file + resolution of imports to project files.
const path = require('path');
const { lineIndex, lineAt } = require('../utils/text');
const { JS_LANGS } = require('./symbolAnalyzer');

function parseNamed(str) {
  return str.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = /^(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(s);
    return m ? { imported: m[1], local: m[2] || m[1] } : null;
  }).filter(Boolean);
}

function extractJs(content, starts) {
  const imports = [];
  const exports = [];
  let m;
  const push = (o) => imports.push(o);

  const esm = /^[ \t]*import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\*\s+as\s+([\w$]+)|\{([^}]*)\})?\s*(?:from\s*)?['"]([^'"]+)['"]/gm;
  while ((m = esm.exec(content))) {
    push({ source: m[4], default: m[1] || null, namespace: m[2] || null, names: m[3] ? parseNamed(m[3]) : [], line: lineAt(starts, m.index), kind: 'esm' });
  }
  const reexport = /^[ \t]*export\s+(?:\*(?:\s+as\s+([\w$]+))?|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/gm;
  while ((m = reexport.exec(content))) {
    push({ source: m[3], default: null, namespace: m[1] || null, names: m[2] ? parseNamed(m[2]) : [], line: lineAt(starts, m.index), kind: 'reexport' });
    if (m[2]) parseNamed(m[2]).forEach((n) => exports.push({ name: n.local, kind: 'reexport', line: lineAt(starts, m.index) }));
  }
  const cjs = /(?:const|let|var)\s+(?:([\w$]+)|\{([^}]*)\})\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)(?:\.([\w$]+))?/g;
  while ((m = cjs.exec(content))) {
    const names = m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const [a, b] = s.split(':').map((x) => x.trim()); return { imported: a, local: b || a }; }) : [];
    push({ source: m[3], default: m[1] || null, namespace: null, names, member: m[4] || null, line: lineAt(starts, m.index), kind: 'cjs' });
  }
  const bareRequire = /^[ \t]*require\(\s*['"]([^'"]+)['"]\s*\)/gm;
  while ((m = bareRequire.exec(content))) push({ source: m[1], default: null, namespace: null, names: [], line: lineAt(starts, m.index), kind: 'cjs' });
  const dyn = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(content))) push({ source: m[1], default: null, namespace: null, names: [], line: lineAt(starts, m.index), kind: 'dynamic' });

  // exports
  const named = /^[ \t]*export\s+(?:async\s+)?(function\*?|class|const|let|var|interface|type|enum)\s+([\w$]+)/gm;
  while ((m = named.exec(content))) exports.push({ name: m[2], kind: m[1].replace('*', ''), line: lineAt(starts, m.index) });
  const def = /^[ \t]*export\s+default\s+(?:async\s+)?(?:(?:function\*?|class)\s+([\w$]+)|([\w$]+)\s*;?\s*$)/gm;
  while ((m = def.exec(content))) exports.push({ name: m[1] || m[2] || 'default', kind: 'default', line: lineAt(starts, m.index) });
  if (/^[ \t]*export\s+default\b/m.test(content) && !exports.some((e) => e.kind === 'default')) {
    exports.push({ name: 'default', kind: 'default', line: lineAt(starts, content.search(/^[ \t]*export\s+default\b/m)) });
  }
  const list = /^[ \t]*export\s*\{([^}]*)\}\s*(?!from)/gm;
  while ((m = list.exec(content))) {
    if (/from\s*['"]/.test(content.slice(m.index, m.index + m[0].length + 40).split('\n')[0])) continue;
    parseNamed(m[1]).forEach((n) => exports.push({ name: n.local, kind: 'named', line: lineAt(starts, m.index) }));
  }
  const modObj = /module\.exports\s*=\s*\{([^}]*)\}/g;
  while ((m = modObj.exec(content))) {
    m[1].split(',').map((s) => s.trim().split(':')[0].trim()).filter((s) => /^[\w$]+$/.test(s)).forEach((n) => exports.push({ name: n, kind: 'cjs', line: lineAt(starts, m.index) }));
  }
  const modSingle = /module\.exports\s*=\s*([\w$]+)\s*;?\s*$/gm;
  while ((m = modSingle.exec(content))) exports.push({ name: m[1], kind: 'cjs-default', line: lineAt(starts, m.index) });
  const modProp = /(?:module\.)?exports\.([\w$]+)\s*=/g;
  while ((m = modProp.exec(content))) exports.push({ name: m[1], kind: 'cjs', line: lineAt(starts, m.index) });

  return { imports, exports };
}

function extractPython(content, starts) {
  const imports = [];
  let m;
  const from = /^[ \t]*from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)/gm;
  while ((m = from.exec(content))) {
    imports.push({ source: m[1], default: null, namespace: null, names: m[2].replace(/[()]/g, '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const [a, b] = s.split(/\s+as\s+/); return { imported: a, local: b || a }; }), line: lineAt(starts, m.index), kind: 'py' });
  }
  const imp = /^[ \t]*import\s+([\w., ]+)/gm;
  while ((m = imp.exec(content))) m[1].split(',').forEach((s) => { const [a, b] = s.trim().split(/\s+as\s+/); if (a) imports.push({ source: a, default: null, namespace: b || a, names: [], line: lineAt(starts, m.index), kind: 'py' }); });
  return { imports, exports: [] };
}

function extractOther(content, starts, language) {
  const imports = [];
  let m;
  const add = (source, idx) => imports.push({ source, default: null, namespace: null, names: [], line: lineAt(starts, idx), kind: language });
  if (language === 'php') {
    const use = /^[ \t]*use\s+([\w\\]+)(?:\s+as\s+\w+)?;/gm;
    while ((m = use.exec(content))) add(m[1], m.index);
    const req = /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g;
    while ((m = req.exec(content))) add(m[1], m.index);
  } else if (language === 'go') {
    const block = /import\s*\(([^)]*)\)/g;
    while ((m = block.exec(content))) for (const q of m[1].matchAll(/"([^"]+)"/g)) add(q[1], m.index);
    const single = /^import\s+(?:\w+\s+)?"([^"]+)"/gm;
    while ((m = single.exec(content))) add(m[1], m.index);
  } else if (language === 'java' || language === 'csharp') {
    const re = language === 'java' ? /^import\s+(?:static\s+)?([\w.]+);/gm : /^using\s+([\w.]+);/gm;
    while ((m = re.exec(content))) add(m[1], m.index);
  } else if (language === 'ruby') {
    const re = /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm;
    while ((m = re.exec(content))) add(m[1], m.index);
  }
  return { imports, exports: [] };
}

function analyzeImportsExports(content, language) {
  const starts = lineIndex(content);
  if (JS_LANGS.has(language)) return extractJs(content, starts);
  if (language === 'python') return extractPython(content, starts);
  return extractOther(content, starts, language);
}

// --- Resolution ---

const JS_EXTS = ['', '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.vue', '.json'];

function resolveJsImport(fromFile, source, fileSet) {
  if (!source.startsWith('.') && !source.startsWith('/')) return null; // package / alias imports are external here
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), source));
  for (const ext of JS_EXTS) if (fileSet.has(base + ext)) return base + ext;
  for (const ext of JS_EXTS.slice(1)) if (fileSet.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
}

function resolvePyImport(fromFile, source, fileSet) {
  let base;
  if (source.startsWith('.')) {
    const dots = source.match(/^\.+/)[0].length;
    let dir = path.posix.dirname(fromFile);
    for (let i = 1; i < dots; i++) dir = path.posix.dirname(dir);
    base = path.posix.join(dir, source.slice(dots).replace(/\./g, '/'));
  } else {
    base = source.replace(/\./g, '/');
  }
  for (const c of [`${base}.py`, `${base}/__init__.py`]) if (fileSet.has(c)) return c;
  return null;
}

function resolveImport(fromFile, imp, language, fileSet) {
  if (JS_LANGS.has(language)) return resolveJsImport(fromFile, imp.source, fileSet);
  if (language === 'python') return resolvePyImport(fromFile, imp.source, fileSet);
  if (language === 'php' && /[./]/.test(imp.source) && !imp.source.includes('\\')) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), imp.source));
    return fileSet.has(base) ? base : null;
  }
  return null;
}

// Builds direct dependencies for every file. Unresolved imports are recorded as external / unresolved.
function buildDependencies(fileAnalyses, fileSet) {
  const deps = {};
  for (const fa of fileAnalyses) {
    const internal = new Map();
    const external = new Set();
    for (const imp of fa.imports) {
      const target = resolveImport(fa.path, imp, fa.language, fileSet);
      if (target && target !== fa.path) {
        const e = internal.get(target) || { path: target, names: [], line: imp.line };
        for (const n of imp.names) e.names.push(n.imported);
        if (imp.default) e.names.push('default');
        internal.set(target, e);
      } else if (!target) {
        external.add(imp.source);
      }
    }
    deps[fa.path] = { internal: [...internal.values()], external: [...external].sort() };
  }
  return deps;
}

module.exports = { analyzeImportsExports, buildDependencies, resolveImport };
