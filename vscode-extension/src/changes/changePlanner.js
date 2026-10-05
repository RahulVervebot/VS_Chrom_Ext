// Change lifecycle: proposal -> validate -> impact -> hash check -> diff -> (user approval) -> apply -> verify -> rescan.
const fs = require('fs');
const path = require('path');
const { parseProposal, applyEdits } = require('./changeAnalyzer');
const { analyzeImpact } = require('./impactAnalyzer');
const { unifiedDiff } = require('./diffManager');
const { detectCommands, runAll } = require('./verificationManager');
const { hashString } = require('../scanner/hashCalculator');
const { resolveInside } = require('../utils/paths');
const { nextSequentialId } = require('../utils/ids');
const { AiProjectError, ErrorCodes } = require('../utils/errors');
const logger = require('../utils/logger');

const STALE_MESSAGE = 'File changed since analysis. Re-analysis required.';

const toLf = (t) => t.replace(/\r\n/g, '\n');
const eolOf = (t) => (/\r\n/.test(t) ? '\r\n' : '\n');
const withEol = (t, eol) => (eol === '\r\n' ? toLf(t).replace(/\n/g, '\r\n') : t);

async function readOrNull(abs) { try { return await fs.promises.readFile(abs, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }

class ChangePlanner {
  constructor({ root, store, config, getScripts, rescan }) { this.root = root; this.store = store; this.config = config; this.getScripts = getScripts; this.rescan = rescan; }

  async list() {
    const names = (await this.store.listDir('changes')).filter((n) => /^proposal-\d+\.json$/.test(n)).sort();
    const out = [];
    for (const n of names) { const r = await this.store.readJson(`changes/${n}`); out.push({ proposalId: r.proposalId, title: r.title, status: r.status, risk: r.impact.risk, files: r.files.length, createdAt: r.createdAt }); }
    return out;
  }
  async get(id) { return /^proposal-\d+$/.test(id) ? this.store.readJson(`changes/${id}.json`, null) : null; }

  // Validate + analyze a CHANGE_PROPOSAL payload and store it as PROPOSED (or STALE). Nothing is written to source.
  async propose(payload) {
    const parsed = parseProposal(payload, { excludePatterns: this.config.get('excludePatterns'), root: this.root });
    const files = [];
    let stale = false;
    for (const c of parsed.changes) {
      const abs = resolveInside(this.root, c.path);
      const current = await readOrNull(abs);
      const currentHash = current === null ? null : hashString(current);
      const entry = { path: c.path, operation: c.operation, expectedHash: c.expectedHash, currentHash, stale: false, newContent: null, diff: null, added: 0, removed: 0 };
      if (c.operation === 'CREATE') {
        if (current !== null) { entry.stale = true; entry.staleReason = 'file already exists'; }
        entry.newContent = c.newContent;
      } else if (current === null) {
        entry.stale = true; entry.staleReason = 'file no longer exists';
      } else if (c.expectedHash !== currentHash) {
        entry.stale = true; entry.staleReason = STALE_MESSAGE;
      } else if (c.operation === 'MODIFY') {
        // Edits and diffs work on LF text; the file's original line endings are restored on the result.
        try {
          const lf = toLf(current);
          const next = c.newContent !== undefined ? toLf(c.newContent) : applyEdits(lf, c.edits.map((e) => ({ find: toLf(e.find), replace: toLf(e.replace) })), c.path);
          entry.newContent = withEol(next, eolOf(current));
        } catch (e) { entry.stale = true; entry.staleReason = e.message; }
      }
      if (!entry.stale) {
        const d = unifiedDiff(current === null ? null : toLf(current), c.operation === 'DELETE' ? null : toLf(entry.newContent), c.path);
        entry.diff = d.text; entry.added = d.added; entry.removed = d.removed;
      }
      if (entry.stale) stale = true;
      files.push(entry);
    }
    const impact = await analyzeImpact(this.store, files.map((f) => f.path), this.config.get('maxDependencyDepth'));
    const existing = (await this.store.listDir('changes')).map((n) => n.replace(/\.json$/, ''));
    const proposalId = nextSequentialId('proposal', existing);
    const record = { proposalId, createdAt: new Date().toISOString(), title: parsed.title, rationale: parsed.rationale, analysisId: parsed.analysisId, source: 'CHROME', status: stale ? 'STALE' : 'PROPOSED', files, impact, verification: null, appliedAt: null };
    await this.store.writeJson(`changes/${proposalId}.json`, record);
    logger.info('CHANGE', 'proposal stored', { proposalId, status: record.status, files: files.length, risk: impact.risk });
    return record;
  }

  // Re-verifies hashes at apply time. `approve` is an async callback owned by the UI: it must show the diff and return true only on explicit approval.
  async apply(proposalId, { approve, runVerification = true, onOutput } = {}) {
    const rec = await this.get(proposalId);
    if (!rec) throw new AiProjectError(ErrorCodes.ANALYSIS_UNKNOWN, `Unknown proposal ${proposalId}`);
    if (rec.status === 'APPLIED') throw new AiProjectError(ErrorCodes.ANALYSIS_FAILED, 'This proposal was already applied.');
    if (!approve) throw new AiProjectError(ErrorCodes.ANALYSIS_FAILED, 'Applying changes requires explicit user approval.');

    // 1) Hash check against the current disk state. Stops on any mismatch.
    const stale = [];
    for (const f of rec.files) {
      const cur = await readOrNull(resolveInside(this.root, f.path));
      const curHash = cur === null ? null : hashString(cur);
      if (f.operation === 'CREATE' ? cur !== null : (cur === null || curHash !== f.expectedHash)) stale.push(f.path);
    }
    if (stale.length) {
      rec.status = 'STALE'; rec.staleFiles = stale;
      await this.store.writeJson(`changes/${proposalId}.json`, rec);
      throw new AiProjectError(ErrorCodes.HASH_MISMATCH, `${STALE_MESSAGE} (${stale.join(', ')})`, { stale });
    }
    // 2) Explicit approval.
    if (!(await approve(rec))) { rec.status = 'REJECTED'; await this.store.writeJson(`changes/${proposalId}.json`, rec); return { status: 'REJECTED', record: rec }; }

    // 3) Backup + write.
    const backupRoot = `snapshots/changes/${proposalId}`;
    try {
      for (const f of rec.files) {
        const abs = resolveInside(this.root, f.path);
        const cur = await readOrNull(abs);
        if (cur !== null) await this.store.writeText(`${backupRoot}/${f.path}`, cur);
        if (f.operation === 'DELETE') await fs.promises.unlink(abs);
        else { await fs.promises.mkdir(path.dirname(abs), { recursive: true }); await atomicWrite(abs, f.newContent); }
      }
    } catch (err) {
      await this.rollbackFiles(rec, backupRoot);
      rec.status = 'FAILED'; rec.error = err.message;
      await this.store.writeJson(`changes/${proposalId}.json`, rec);
      throw new AiProjectError(ErrorCodes.FILE_PERMISSION, `Could not apply changes (rolled back): ${err.message}`);
    }
    rec.status = 'APPLIED'; rec.appliedAt = new Date().toISOString();

    // 4) Verification: tests, lint, typecheck, build; commands detected from the project.
    if (runVerification) {
      const commands = await detectCommands(this.root, await this.getScripts());
      rec.verification = commands.length ? await runAll(this.root, commands, { onOutput }) : { results: [], ok: null, ran: 0, detected: 0, note: 'No verification commands were detected in this project.' };
      if (rec.verification.ok === false) rec.status = 'APPLIED_VERIFICATION_FAILED';
    }
    await this.store.writeJson(`changes/${proposalId}.json`, rec);

    // 5) Rescan: new hashes, dependency graph, workflows, features, database; documentation goes OUTDATED where affected.
    if (this.rescan) await this.rescan();
    logger.info('CHANGE', 'proposal applied', { proposalId, status: rec.status });
    return { status: rec.status, record: rec };
  }

  async rollbackFiles(rec, backupRoot) {
    for (const f of rec.files) {
      const abs = resolveInside(this.root, f.path);
      const backup = await this.store.readText(`${backupRoot}/${f.path}`, null);
      if (backup !== null) await atomicWrite(abs, backup);
      else if (f.operation === 'CREATE') await fs.promises.unlink(abs).catch(() => {});
    }
  }

  // Restores backed-up originals, but only for files that still equal what this proposal wrote.
  async rollback(proposalId) {
    const rec = await this.get(proposalId);
    if (!rec || !['APPLIED', 'APPLIED_VERIFICATION_FAILED'].includes(rec.status)) throw new AiProjectError(ErrorCodes.ANALYSIS_FAILED, 'Nothing to roll back.');
    for (const f of rec.files) {
      const cur = await readOrNull(resolveInside(this.root, f.path));
      const expected = f.operation === 'DELETE' ? null : f.newContent;
      if (cur !== expected) throw new AiProjectError(ErrorCodes.HASH_MISMATCH, `${f.path} was modified after the proposal was applied; refusing to roll back over your changes.`);
    }
    await this.rollbackFiles(rec, `snapshots/changes/${proposalId}`);
    rec.status = 'ROLLED_BACK';
    await this.store.writeJson(`changes/${proposalId}.json`, rec);
    if (this.rescan) await this.rescan();
    return rec;
  }
}

async function atomicWrite(abs, content) {
  const tmp = `${abs}.${process.pid}.aipi.tmp`;
  await fs.promises.writeFile(tmp, content, 'utf8');
  await fs.promises.rename(tmp, abs);
}

module.exports = { ChangePlanner, STALE_MESSAGE };
