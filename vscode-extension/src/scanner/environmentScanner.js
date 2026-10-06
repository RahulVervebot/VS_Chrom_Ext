const fs = require('fs');
const path = require('path');

// Environment variable NAMES only. Values are never read into results.
const REF_PATTERNS = [
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  /os\.environ(?:\.get)?\(?\[?['"]([A-Z_][A-Z0-9_]*)['"]/g,
  /os\.getenv\(['"]([A-Z_][A-Z0-9_]*)['"]/g,
  /getenv\(['"]([A-Z_][A-Z0-9_]*)['"]\)/g,
  /env\(['"]([A-Z_][A-Z0-9_]*)['"]/g,
  /os\.(?:Getenv|LookupEnv)\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g,
  /Environment\.GetEnvironmentVariable\(["']([A-Za-z_][A-Za-z0-9_]*)["']/g,
];

function extractEnvRefs(content) {
  const names = new Set();
  for (const re of REF_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content))) names.add(m[1]);
  }
  return [...names];
}

function envFileKeys(content) {
  const keys = [];
  for (const line of content.split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// fileContents: Map(relPath -> content) for already-read source files.
async function scanEnvironment(root, filePaths, fileContents) {
  const references = {};
  for (const [rel, content] of fileContents) {
    const names = extractEnvRefs(content);
    for (const n of names) (references[n] ||= []).push(rel);
  }
  const declared = {};
  for (const rel of filePaths) {
    const base = path.posix.basename(rel);
    if (!/^\.env(\..*)?$/.test(base)) continue;
    try {
      const txt = await fs.promises.readFile(path.join(root, rel), 'utf8');
      declared[rel] = envFileKeys(txt); // keys only
    } catch { /* unreadable env file: skip */ }
  }
  return {
    variables: Object.keys(references).sort().map((name) => ({ name, usedIn: references[name].sort() })),
    declaredIn: declared,
  };
}

module.exports = { scanEnvironment, extractEnvRefs, envFileKeys };
