// Owns the on-disk .ai-project/ folder. All stored paths are project-relative; nothing machine-specific is authoritative.
const fs = require('fs');
const path = require('path');
const { newProjectId } = require('../utils/ids');
const { SCHEMA_VERSION, ANALYSIS_VERSION } = require('./versionManager');
const { AiProjectError, ErrorCodes } = require('../utils/errors');
const { KeyedMutex } = require('../utils/mutex');
const crypto = require('crypto');
const { portableParts } = require('../utils/fsNames');

const tmpName = (target) => `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;

const SUBDIRS = [
  'index', 'workflows', 'database', 'features', 'architecture',
  'documentation/workflows', 'documentation/database', 'documentation/features', 'documentation/files',
  'comparisons', 'generation', 'changes', 'snapshots', 'history',
];

async function exists(p) {
  try { await fs.promises.access(p); return true; } catch { return false; }
}

class ProjectStore {
  constructor(workspaceRoot, folderName = '.ai-project') {
    this.workspaceRoot = workspaceRoot;
    this.dir = path.join(workspaceRoot, folderName);
    this.mutex = new KeyedMutex();
  }

  // Serialize read-modify-write cycles on one file: store.update('history/x.json', (cur) => next)
  update(rel, fn, fallback) {
    return this.mutex.run(rel, async () => {
      const next = await fn(await this.readJson(rel, fallback));
      await this.writeJson(rel, next);
      return next;
    });
  }

  // Every stored name is made valid on Windows, macOS and Linux (see utils/fsNames). Portable names are unchanged.
  p(...segments) { return path.join(this.dir, ...portableParts(...segments)); }

  // Same path before that rule existed: lets a project written earlier on macOS/Linux with names like "<string:param>" still be read.
  legacyP(...segments) { return path.join(this.dir, ...segments); }

  async isInitialized() { return exists(this.p('project.json')); }

  // Never destroys existing knowledge: if project.json exists it is loaded untouched.
  async initialize(name) {
    if (await this.isInitialized()) return { project: await this.readJson('project.json'), created: false };
    for (const d of SUBDIRS) await fs.promises.mkdir(this.p(d), { recursive: true });
    const project = {
      projectId: newProjectId(),
      name: name || path.basename(this.workspaceRoot),
      schemaVersion: SCHEMA_VERSION,
      analysisVersion: ANALYSIS_VERSION,
      createdAt: new Date().toISOString(),
    };
    await this.writeJson('project.json', project);
    await this.writeJson('config.json', { excludePatterns: undefined, notes: 'Project-level overrides; workspace settings take precedence when unset.' });
    await this.writeJson('workflows/index.json', { workflows: [] });
    await this.writeJson('features/index.json', { features: [] });
    return { project, created: true };
  }

  async ensureDirs() {
    for (const d of SUBDIRS) await fs.promises.mkdir(this.p(d), { recursive: true });
  }

  async readJson(rel, fallback) {
    try {
      return JSON.parse(await fs.promises.readFile(this.p(rel), 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT' && this.legacyP(rel) !== this.p(rel)) { try { return JSON.parse(await fs.promises.readFile(this.legacyP(rel), 'utf8')); } catch { /* not there either */ } }
      if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
      if (err instanceof SyntaxError) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `Corrupt JSON in .ai-project/${rel}`);
      throw err;
    }
  }

  // Atomic write: temp file + rename, so a crash never leaves half-written knowledge.
  async writeJson(rel, data) {
    const target = this.p(rel);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const tmp = tmpName(target);
    await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    await fs.promises.rename(tmp, target);
  }

  async writeText(rel, text) {
    const target = this.p(rel);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const tmp = tmpName(target);
    await fs.promises.writeFile(tmp, text, 'utf8');
    await fs.promises.rename(tmp, target);
  }

  async readText(rel, fallback) {
    try { return await fs.promises.readFile(this.p(rel), 'utf8'); } catch (e) {
      if (e.code === 'ENOENT' && this.legacyP(rel) !== this.p(rel)) { try { return await fs.promises.readFile(this.legacyP(rel), 'utf8'); } catch { /* not there either */ } }
      if (fallback !== undefined) return fallback; throw e;
    }
  }

  async listDir(rel) {
    try { return await fs.promises.readdir(this.p(rel)); } catch { return []; }
  }

  async remove(rel) { await fs.promises.rm(this.p(rel), { force: true }); }

  async exists(rel) { return exists(this.p(rel)); }
}

module.exports = { ProjectStore, SUBDIRS };
