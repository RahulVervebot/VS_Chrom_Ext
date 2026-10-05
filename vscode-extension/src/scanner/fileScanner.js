const fs = require('fs');
const path = require('path');
const { detectLanguage, isBinaryPath } = require('./languageDetector');
const { hashFile } = require('./hashCalculator');
const { estimateTokens } = require('./tokenEstimator');
const { toPosix } = require('../utils/paths');

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

async function readTextIfSmall(abs, size) {
  if (size > MAX_TEXT_BYTES) return null;
  const buf = await fs.promises.readFile(abs);
  if (buf.includes(0)) return null; // binary content
  return buf.toString('utf8');
}

// Scans one file. If `previous` has the same size+mtime the stored hash is reused (hash-based incremental scan).
async function scanFile(root, relPath, previous) {
  const abs = path.join(root, relPath);
  const st = await fs.promises.stat(abs);
  const base = {
    path: relPath,
    language: detectLanguage(relPath),
    size: st.size,
    mtimeMs: Math.round(st.mtimeMs),
  };

  if (isBinaryPath(relPath)) {
    return { ...base, binary: true, hash: await hashFile(abs), lines: 0, tokens: 0 };
  }

  if (previous && previous.size === base.size && previous.mtimeMs === base.mtimeMs && previous.hash) {
    return { ...base, binary: !!previous.binary, hash: previous.hash, lines: previous.lines, tokens: previous.tokens, reused: true };
  }

  const text = await readTextIfSmall(abs, st.size);
  if (text === null) {
    return { ...base, binary: true, hash: await hashFile(abs), lines: 0, tokens: 0 };
  }
  return {
    ...base,
    binary: false,
    hash: await hashFile(abs),
    lines: text.length === 0 ? 0 : text.split('\n').length,
    tokens: estimateTokens(text),
  };
}

// Walks root with an exclusion predicate. Excluded directories are never descended into.
async function walk(root, isExcluded, onError) {
  const files = [];
  const folders = [];
  async function visit(relDir) {
    let entries;
    try {
      entries = await fs.promises.readdir(path.join(root, relDir), { withFileTypes: true });
    } catch (err) {
      if (onError) onError(relDir, err);
      return;
    }
    for (const e of entries) {
      const rel = toPosix(path.posix.join(relDir, e.name));
      if (isExcluded(rel)) continue;
      if (e.isSymbolicLink()) continue; // never follow links out of the project
      if (e.isDirectory()) {
        folders.push(rel);
        await visit(rel);
      } else if (e.isFile()) {
        files.push(rel);
      }
    }
  }
  await visit('');
  files.sort();
  folders.sort();
  return { files, folders };
}

// Bounded-concurrency map.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

module.exports = { scanFile, walk, mapLimit };
