const fs = require('fs');
const path = require('path');
const { compileExclusions } = require('./exclusions');
const { walk, scanFile, mapLimit } = require('./fileScanner');
const { scanFolders } = require('./folderScanner');
const { scanPackages } = require('./packageScanner');
const { scanConfig } = require('./configScanner');
const { scanEnvironment } = require('./environmentScanner');
const { isSourceLanguage } = require('./languageDetector');
const logger = require('../utils/logger');

// Scans the real workspace on disk. `previousFiles` (path -> record) enables incremental scanning.
async function scanProject(root, options = {}) {
  const { excludePatterns = [], previousFiles = {}, concurrency = 16, onProgress } = options;
  const isExcluded = compileExclusions(excludePatterns);
  const errors = [];
  const started = Date.now();

  const { files, folders } = await walk(root, isExcluded, (dir, err) => errors.push({ path: dir, error: err.code || err.message }));
  logger.info('ANALYSIS', 'scan: walked workspace', { files: files.length, folders: folders.length });

  let done = 0;
  const records = (await mapLimit(files, concurrency, async (rel) => {
    try {
      const r = await scanFile(root, rel, previousFiles[rel]);
      if (onProgress && ++done % 50 === 0) onProgress({ done, total: files.length });
      return r;
    } catch (err) {
      errors.push({ path: rel, error: err.code || err.message });
      return null;
    }
  })).filter(Boolean);

  const changed = records.filter((r) => !r.reused).map((r) => r.path);
  const removed = Object.keys(previousFiles).filter((p) => !files.includes(p));

  // Read source text once for env scanning (bounded by file size limit already applied in scanFile).
  const contents = new Map();
  await mapLimit(records.filter((r) => !r.binary && (isSourceLanguage(r.language) || r.language === 'json') && r.size < 512 * 1024), concurrency, async (r) => {
    try { contents.set(r.path, await fs.promises.readFile(path.join(root, r.path), 'utf8')); } catch { /* skip */ }
  });

  const paths = records.map((r) => r.path);
  const [packages, environment] = await Promise.all([scanPackages(root, paths), scanEnvironment(root, paths, contents)]);

  const languages = {};
  for (const r of records) if (!r.binary) languages[r.language] = (languages[r.language] || 0) + 1;

  return {
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    files: records,
    folders: scanFolders(folders, records),
    languages,
    packages,
    config: scanConfig(paths),
    environment,
    delta: { changed, removed },
    errors,
    totals: {
      files: records.length,
      sourceFiles: records.filter((r) => isSourceLanguage(r.language)).length,
      lines: records.reduce((n, r) => n + (r.lines || 0), 0),
      tokens: records.reduce((n, r) => n + (r.tokens || 0), 0),
    },
  };
}

module.exports = { scanProject };
