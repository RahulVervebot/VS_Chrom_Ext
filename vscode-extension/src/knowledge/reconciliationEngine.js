// Verifies AI knowledge against actual source evidence, then reconciles it into .ai-project/.
// AI output is untrusted: nothing becomes VERIFIED unless the cited evidence exists in the current source.
const fs = require('fs');
const { resolveInside, normalizeRelative } = require('../utils/paths');
const { AiProjectError, ErrorCodes } = require('../utils/errors');
const { mergeValue, mergeClaims, union } = require('./knowledgeMerger');
const { RANK } = require('./evidenceManager');
const { safeName } = require('./knowledgeStore');
const logger = require('../utils/logger');

const MAX_READ_BYTES = 2 * 1024 * 1024;
const COMMON = new Set(['the', 'this', 'that', 'with', 'from', 'into', 'when', 'then', 'which', 'where', 'table', 'field', 'function', 'class', 'file', 'route', 'endpoint', 'method', 'returns', 'calls', 'uses', 'null', 'true', 'false', 'string', 'number']);

// ---- static index (loaded from .ai-project, so verification never depends on in-memory state) ----

async function loadStaticIndex(projectStore) {
  const files = (await projectStore.readJson('index/files.json', { files: [] })).files;
  const symbols = (await projectStore.readJson('index/symbols.json', { symbols: [] })).symbols;
  const entities = (await projectStore.readJson('database/entities.json', { entities: [] })).entities;
  const relationships = (await projectStore.readJson('database/relationships.json', { relationships: [] })).relationships;
  const dependencies = (await projectStore.readJson('index/dependencies.json', { dependencies: {} })).dependencies;
  const symbolsByFile = new Map();
  for (const s of symbols) (symbolsByFile.get(s.file) || symbolsByFile.set(s.file, []).get(s.file)).push(s);
  return { files: new Map(files.map((f) => [f.path, f])), symbolsByFile, entities, relationships, dependencies };
}

// ---- source reader with per-run cache ----

class SourceReader {
  constructor(root) { this.root = root; this.cache = new Map(); }
  async lines(rel) {
    if (this.cache.has(rel)) return this.cache.get(rel);
    let out = null;
    try {
      const abs = resolveInside(this.root, rel);
      const st = await fs.promises.stat(abs);
      if (st.size <= MAX_READ_BYTES) out = (await fs.promises.readFile(abs, 'utf8')).split('\n');
    } catch { out = null; }
    this.cache.set(rel, out);
    return out;
  }
}

function extractTokens(text) {
  const tokens = new Set();
  for (const m of text.matchAll(/`([^`]{2,80})`|'([^']{3,80})'|"([^"]{3,80})"/g)) tokens.add((m[1] || m[2] || m[3]).trim());
  for (const m of text.matchAll(/\b[a-z]+(?:_[a-z0-9]+)+\b|\b[a-z]+(?:[A-Z][a-z0-9]+)+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b|\/[\w/.:-]{3,}/g)) tokens.add(m[0]);
  return [...tokens].filter((t) => t.length >= 3 && !COMMON.has(t.toLowerCase())).slice(0, 8);
}

function textHas(haystack, needle) {
  if (!needle) return false;
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(/^\w/.test(needle) ? `\\b${esc}` + (/\w$/.test(needle) ? '\\b' : '') : esc, 'i').test(haystack);
}

// ---- evidence reference verification ----

async function checkRef(ref, ctx) {
  const out = { file: ref.file, symbol: ref.symbol, lineStart: ref.lineStart, lineEnd: ref.lineEnd, sha256: ref.sha256 || ref.hash, valid: false, reason: null };
  let rel;
  try {
    rel = normalizeRelative(ref.file);
    resolveInside(ctx.root, rel); // rejects absolute paths and traversal
  } catch (e) {
    out.reason = e.code === ErrorCodes.PATH_TRAVERSAL ? 'path rejected (outside project)' : 'invalid path';
    return out;
  }
  out.file = rel;
  const rec = ctx.index.files.get(rel);
  if (!rec) { out.reason = 'file is not part of the scanned project'; return out; }
  if (out.sha256 && out.sha256 !== rec.hash) { out.reason = 'file changed since analysis (hash mismatch)'; out.stale = true; return out; }
  out.sha256 = rec.hash;
  const lines = await ctx.reader.lines(rel);
  if (!lines) { out.reason = 'file could not be read'; return out; }
  if (ref.lineStart !== undefined) {
    const s = ref.lineStart;
    const e = ref.lineEnd === undefined ? s : ref.lineEnd;
    if (!(s >= 1 && e >= s && e <= lines.length)) { out.reason = 'line range outside file'; return out; }
  }
  if (ref.symbol) {
    const last = ref.symbol.split(/[.#]/).pop();
    const known = (ctx.index.symbolsByFile.get(rel) || []).some((s) => s.name === last);
    if (!known && !lines.some((l) => textHas(l, last))) { out.reason = `symbol ${ref.symbol} not found in file`; return out; }
    out.symbolVerified = known;
  }
  out.valid = true;
  out.text = ref.lineStart !== undefined ? lines.slice(ref.lineStart - 1, (ref.lineEnd === undefined ? ref.lineStart : ref.lineEnd)).join('\n') : lines.join('\n');
  return out;
}

async function verifyClaim(claim, ctx, tokensOverride) {
  const aiStatus = claim.status;
  const refs = [];
  for (const r of (claim.evidence || [])) refs.push(await checkRef(r, ctx));
  const good = refs.filter((r) => r.valid);
  const stale = refs.filter((r) => r.stale);
  const tokens = tokensOverride || (claim.subject ? [claim.subject] : extractTokens(claim.claim));
  const checks = [];
  let status = aiStatus;

  if (aiStatus === 'VERIFIED') {
    if (good.length === 0) {
      if (stale.length) { status = 'UNKNOWN'; checks.push('evidence is stale: re-analysis required'); }
      else if (refs.length) { status = 'UNKNOWN'; checks.push(`cited evidence does not hold: ${refs.map((r) => r.reason).filter(Boolean).join('; ')}`); }
      else { status = 'INFERRED'; checks.push('claimed VERIFIED without any evidence'); }
    } else if (tokens.length) {
      const found = tokens.filter((t) => good.some((r) => textHas(r.text, t)));
      if (found.length) checks.push(`found in source: ${found.join(', ')}`);
      else { status = 'UNKNOWN'; checks.push(`subject not found in cited evidence: ${tokens.join(', ')}`); }
    } else if (good.some((r) => r.symbolVerified)) {
      checks.push('cited symbol exists');
    } else {
      status = 'INFERRED';
      checks.push('evidence exists but claim content is not machine-checkable');
    }
  } else if (aiStatus === 'INFERRED') {
    checks.push(good.length ? 'evidence present; kept INFERRED' : 'no valid evidence; kept INFERRED');
  }
  return { claim: claim.claim, subject: claim.subject, aiStatus, status, evidence: refs.map(({ text, valid, ...keep }) => keep), evidenceValid: good.length, checks };
}

async function verifyClaims(list, ctx) {
  const out = [];
  for (const c of list || []) out.push(await verifyClaim(c, ctx));
  return out;
}

const looksSame = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// Main entry: returns verified package sections + report. Does not write anything.
async function verifyPackage(pkg, { root, index }) {
  const ctx = { root, index, reader: new SourceReader(root) };
  const report = { counts: { VERIFIED: 0, INFERRED: 0, UNKNOWN: 0 }, rejected: [], stale: [], conflicts: [], unverified: [] };
  const tally = (list) => list.forEach((c) => { report.counts[c.status]++; });
  const k = pkg.knowledge;
  const accepted = { files: [], features: [], workflows: [], database: { entities: [], relationships: [] }, architecture: null, dependencies: [], evidence: [] };

  for (const f of k.files || []) {
    let rel;
    try { rel = normalizeRelative(f.path); resolveInside(root, rel); } catch { report.rejected.push({ kind: 'file', path: f.path, reason: 'path rejected' }); continue; }
    const rec = index.files.get(rel);
    if (!rec) { report.rejected.push({ kind: 'file', path: f.path, reason: 'not part of the scanned project' }); continue; }
    const claimedHash = f.sha256 || f.hash;
    const staleFile = !!(claimedHash && claimedHash !== rec.hash);
    if (staleFile) report.stale.push(rel);
    const claims = staleFile ? (f.claims || []).map((c) => ({ ...c, status: c.status === 'VERIFIED' ? 'UNKNOWN' : c.status, evidence: [] })).map((c) => ({ claim: c.claim, status: c.status, aiStatus: c.status, evidence: [], evidenceValid: 0, checks: ['file changed since analysis'] })) : await verifyClaims(f.claims, ctx);
    tally(claims);
    accepted.files.push({ path: rel, sourceHash: rec.hash, stale: staleFile, purpose: f.purpose, role: f.role, claims, unknowns: f.unknowns || [] });
  }

  for (const f of k.features || []) {
    const files = [];
    const unknownFiles = [];
    for (const p of f.files || []) { const rel = safeRel(root, p); (rel && index.files.has(rel) ? files : unknownFiles).push(rel || p); }
    const claims = await verifyClaims(f.claims, ctx);
    tally(claims);
    accepted.features.push({ id: safeId(f.id), name: f.name, purpose: f.purpose, files, unknownFiles, claims });
  }

  for (const w of k.workflows || []) {
    const steps = [];
    for (const s of w.steps || []) {
      let status = 'UNKNOWN';
      const rel = s.file ? safeRel(root, s.file) : null;
      const rec = rel ? index.files.get(rel) : null;
      const note = [];
      if (rec) {
        const syms = index.symbolsByFile.get(rel) || [];
        if (!s.symbol) status = 'INFERRED';
        else if (syms.some((x) => x.name === s.symbol.split('.').pop())) status = s.status === 'UNKNOWN' ? 'UNKNOWN' : 'VERIFIED';
        else { status = 'UNKNOWN'; note.push(`symbol ${s.symbol} not found in ${rel}`); }
      } else if (s.file) note.push('file is not part of the scanned project');
      else status = s.status === 'UNKNOWN' ? 'UNKNOWN' : 'INFERRED';
      report.counts[status]++;
      steps.push({ kind: s.kind, file: rel, symbol: s.symbol, description: s.description, status, aiStatus: s.status, note: note.join('; ') || undefined });
    }
    const claims = await verifyClaims(w.claims, ctx);
    const rules = await verifyClaims(w.businessRules, ctx);
    tally(claims); tally(rules);
    accepted.workflows.push({ id: safeId(w.id), name: w.name, purpose: w.purpose, api: w.api || null, steps, businessRules: rules, claims });
  }

  const db = k.database || {};
  for (const e of db.entities || []) {
    const st = index.entities.find((x) => x.name === e.name || x.table === e.name || looksSame(x.name, e.name));
    const claims = await verifyClaims(e.claims, ctx);
    tally(claims);
    const fields = [];
    for (const f of e.fields || []) {
      const staticField = st && (st.fields || []).find((x) => looksSame(x.name, f.name));
      if (staticField) {
        if (f.type && staticField.type && !looksSame(f.type, staticField.type) && !String(staticField.type).toLowerCase().includes(String(f.type).toLowerCase())) {
          report.conflicts.push({ kind: 'field-type', entity: e.name, field: f.name, source: 'SOURCE', sourceValue: staticField.type, aiValue: f.type, resolution: 'source wins' });
        }
        fields.push({ name: staticField.name, type: staticField.type, status: 'VERIFIED', basis: 'static analysis' });
        report.counts.VERIFIED++;
        continue;
      }
      const refs = [];
      for (const r of f.evidence || []) refs.push(await checkRef(r, ctx));
      const hit = refs.find((r) => r.valid && textHas(r.text, f.name));
      if (hit) { fields.push({ name: f.name, type: f.type, status: 'VERIFIED', basis: 'source text', evidence: [{ file: hit.file, lineStart: hit.lineStart, lineEnd: hit.lineEnd, sha256: hit.sha256 }] }); report.counts.VERIFIED++; }
      else { report.unverified.push({ kind: 'field', entity: e.name, field: f.name, reason: 'no supporting evidence in source' }); report.counts.UNKNOWN++; }
    }
    let entityStatus = st ? 'VERIFIED' : 'UNKNOWN';
    if (!st) {
      const refs = [];
      for (const r of e.evidence || []) refs.push(await checkRef(r, ctx));
      if (fields.length || claims.some((c) => c.status === 'VERIFIED')) entityStatus = 'VERIFIED';
      else report.unverified.push({ kind: 'entity', entity: e.name, reason: 'entity not found in source analysis' });
    }
    accepted.database.entities.push({ name: st ? st.name : e.name, staticMatch: !!st, status: entityStatus, purpose: e.purpose, fields, claims });
  }
  for (const r of db.relationships || []) {
    const st = index.relationships.find((x) => (looksSame(x.from, r.from) && looksSame(x.to, r.to)) || (looksSame(x.from, r.to) && looksSame(x.to, r.from)));
    if (st) {
      if (r.type && st.type && !looksSame(r.type, st.type) && !(looksSame(x_inverse(st.type), r.type))) report.conflicts.push({ kind: 'relationship-type', from: r.from, to: r.to, source: 'SOURCE', sourceValue: st.type, aiValue: r.type, resolution: 'source wins' });
      accepted.database.relationships.push({ from: st.from, to: st.to, type: st.type, status: 'VERIFIED', basis: 'static analysis' });
      report.counts.VERIFIED++;
      continue;
    }
    const refs = [];
    for (const ref of r.evidence || []) refs.push(await checkRef(ref, ctx));
    const hit = refs.find((x) => x.valid && textHas(x.text, r.from) && textHas(x.text, r.to));
    if (hit) { accepted.database.relationships.push({ from: r.from, to: r.to, type: r.type, status: 'INFERRED', basis: 'both entities appear in cited source', evidence: [{ file: hit.file, lineStart: hit.lineStart, lineEnd: hit.lineEnd, sha256: hit.sha256 }] }); report.counts.INFERRED++; }
    else { report.unverified.push({ kind: 'relationship', from: r.from, to: r.to, reason: 'not verifiable from source' }); report.counts.UNKNOWN++; }
  }

  for (const d of k.dependencies || []) {
    const from = safeRel(root, d.from);
    const to = safeRel(root, d.to);
    const edge = from && to && ((index.dependencies[from] || {}).internal || []).some((x) => x.path === to);
    if (edge) { accepted.dependencies.push({ from, to, status: 'VERIFIED' }); report.counts.VERIFIED++; }
    else { report.unverified.push({ kind: 'dependency', from: d.from, to: d.to, reason: 'import edge not found in source analysis' }); report.counts.UNKNOWN++; }
  }

  if (k.architecture) {
    const claims = await verifyClaims(k.architecture.claims, ctx);
    tally(claims);
    accepted.architecture = { overview: k.architecture.overview, overviewStatus: 'INFERRED', claims };
  }
  accepted.evidence = await verifyClaims(pkg.evidence, ctx);
  tally(accepted.evidence);
  return { accepted, report };
}

function x_inverse(t) { return ({ 'one-to-many': 'many-to-one', 'many-to-one': 'one-to-many' })[t] || t; }
function safeRel(root, p) { try { const r = normalizeRelative(p); resolveInside(root, r); return r; } catch { return null; } }
function safeId(id) { return String(id).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'item'; }

// ---- reconciliation into .ai-project ----

async function reconcile({ projectStore, knowledgeStore, verified, analysisId, provider, index }) {
  const { accepted, report } = verified;
  const currentHashes = Object.fromEntries([...index.files.values()].map((f) => [f.path, f.hash]));
  const changes = { filesUpdated: 0, featuresUpdated: 0, workflowsUpdated: 0, entitiesUpdated: 0, relationshipsAdded: 0, newAiOnly: [] };
  const cell = (value, status, hash) => (value ? { value, status, analysisId, provider, sourceHash: hash } : null);

  // files
  const analyzedStatuses = [];
  for (const f of accepted.files) {
    const prev = (await knowledgeStore.getFileKnowledge(f.path)) || { path: f.path, claims: [], unknowns: [] };
    const h = f.sourceHash;
    const next = {
      ...prev,
      path: f.path,
      sourceHash: f.stale ? prev.sourceHash : h,
      purpose: mergeValue(prev.purpose, cell(f.purpose, 'INFERRED', h), { currentHash: h }),
      role: mergeValue(prev.role, cell(f.role, 'INFERRED', h), { currentHash: h }),
      claims: mergeClaims(prev.claims, f.claims.map(stripAi), { analysisId, currentHashes }),
      unknowns: union(prev.unknowns, f.unknowns),
      analysisIds: union(prev.analysisIds, [analysisId]),
      updatedAt: new Date().toISOString(),
    };
    await knowledgeStore.saveFileKnowledge(f.path, next);
    await knowledgeStore.recordDocumentation(`files/${f.path}`, { [f.path]: h }, f.stale ? 'OUTDATED' : (next.unknowns.length || f.claims.some((c) => c.status === 'UNKNOWN') ? 'PARTIAL' : 'ANALYZED'));
    changes.filesUpdated++;
    if (!f.stale) analyzedStatuses.push({ path: f.path, hash: h, status: next.unknowns.length || f.claims.some((c) => c.status === 'UNKNOWN') ? 'PARTIAL' : 'ANALYZED' });
  }
  await knowledgeStore.markAnalyzed(analysisId, analyzedStatuses);

  // features
  const featIndex = await projectStore.readJson('features/index.json', { features: [] });
  for (const f of accepted.features) {
    const existing = await projectStore.readJson(`features/${f.id}.json`, null);
    const doc = existing || { id: f.id, name: f.name || f.id, origin: 'AI', status: 'INFERRED', files: f.files, tests: [], apis: [], entities: [] };
    const hashes = Object.fromEntries(f.files.map((p) => [p, currentHashes[p]]));
    const k = doc.knowledge || { purpose: null, claims: [] };
    doc.knowledge = { ...k, purpose: mergeValue(k.purpose, cell(f.purpose, 'INFERRED', null)), claims: mergeClaims(k.claims, f.claims.map(stripAi), { analysisId, currentHashes }), unknownFiles: union(k.unknownFiles, f.unknownFiles), analysisIds: union(k.analysisIds, [analysisId]) };
    await projectStore.writeJson(`features/${f.id}.json`, doc);
    await knowledgeStore.recordDocumentation(`features/${f.id}`, hashes);
    if (!existing) { featIndex.features.push({ id: f.id, name: doc.name, status: 'INFERRED', origin: 'AI', files: f.files.length, apis: 0, entities: [] }); changes.newAiOnly.push(`feature:${f.id}`); }
    changes.featuresUpdated++;
  }
  await projectStore.writeJson('features/index.json', featIndex);

  // workflows
  const wfIndex = await projectStore.readJson('workflows/index.json', { workflows: [] });
  for (const w of accepted.workflows) {
    let target = await projectStore.readJson(`workflows/${w.id}.json`, null);
    if (!target && w.api && w.api.endpoint) {
      const hit = wfIndex.workflows.find((x) => x.api && x.api.endpoint === w.api.endpoint && (!w.api.method || x.api.method === String(w.api.method).toUpperCase()));
      if (hit) target = await projectStore.readJson(`workflows/${hit.id}.json`, null);
    }
    const doc = target || { id: w.id, name: w.name || w.id, origin: 'AI', status: 'INFERRED', trigger: { type: 'UNKNOWN' }, api: w.api, steps: [], summary: { files: [], apiCalls: [], databaseReads: [], databaseWrites: [], externalServices: [] }, unknowns: [] };
    const k = doc.knowledge || { purpose: null, claims: [], steps: [], businessRules: [] };
    const stepKey = (s) => `${s.file}|${s.symbol}|${s.kind}`;
    const merged = new Map((k.steps || []).map((s) => [stepKey(s), s]));
    for (const s of w.steps) { const prev = merged.get(stepKey(s)); if (!prev || RANK[s.status] >= RANK[prev.status]) merged.set(stepKey(s), { ...s, analysisId }); }
    doc.knowledge = { ...k, purpose: mergeValue(k.purpose, cell(w.purpose, 'INFERRED', null)), steps: [...merged.values()], claims: mergeClaims(k.claims, w.claims.map(stripAi), { analysisId, currentHashes }), businessRules: mergeClaims(k.businessRules, w.businessRules.map(stripAi), { analysisId, currentHashes }), analysisIds: union(k.analysisIds, [analysisId]) };
    await projectStore.writeJson(`workflows/${doc.id}.json`, doc);
    const files = [...new Set([...(doc.summary.files || []), ...w.steps.map((s) => s.file).filter(Boolean)])];
    await knowledgeStore.recordDocumentation(`workflows/${doc.id}`, Object.fromEntries(files.filter((p) => currentHashes[p]).map((p) => [p, currentHashes[p]])));
    if (!target) { wfIndex.workflows.push({ id: doc.id, name: doc.name, status: 'INFERRED', origin: 'AI', trigger: 'UNKNOWN', api: doc.api, files: files.length, databaseWrites: [], sourceFiles: files }); changes.newAiOnly.push(`workflow:${doc.id}`); }
    changes.workflowsUpdated++;
  }
  await projectStore.writeJson('workflows/index.json', wfIndex);

  // database
  const entDoc = await projectStore.readJson('database/entities.json', { entities: [] });
  for (const e of accepted.database.entities) {
    if (e.status === 'UNKNOWN') continue; // unverified entities are reported, not stored
    let target = entDoc.entities.find((x) => x.name === e.name);
    if (!target) { target = { name: e.name, kind: 'unknown', origin: 'AI', source: 'ai', fields: [], file: null, knowledge: null }; entDoc.entities.push(target); changes.newAiOnly.push(`entity:${e.name}`); }
    const k = target.knowledge || { purpose: null, claims: [], fields: [] };
    const fm = new Map((k.fields || []).map((f) => [f.name, f]));
    for (const f of e.fields) { const p = fm.get(f.name); if (!p || RANK[f.status] >= RANK[p.status]) fm.set(f.name, { ...f, analysisId }); }
    target.knowledge = { ...k, purpose: mergeValue(k.purpose, cell(e.purpose, 'INFERRED', null)), fields: [...fm.values()], claims: mergeClaims(k.claims, e.claims.map(stripAi), { analysisId, currentHashes }), analysisIds: union(k.analysisIds, [analysisId]) };
    if (target.file && currentHashes[target.file]) await knowledgeStore.recordDocumentation(`database/${e.name}`, { [target.file]: currentHashes[target.file] });
    changes.entitiesUpdated++;
  }
  await projectStore.writeJson('database/entities.json', entDoc);
  const relDoc = await projectStore.readJson('database/relationships.json', { relationships: [] });
  for (const r of accepted.database.relationships) {
    if (relDoc.relationships.some((x) => looksSame(x.from, r.from) && looksSame(x.to, r.to))) continue;
    relDoc.relationships.push({ ...r, origin: 'AI', analysisId, source: 'ai-verified-against-source' });
    changes.relationshipsAdded++;
  }
  await projectStore.writeJson('database/relationships.json', relDoc);

  // architecture
  if (accepted.architecture) {
    const prev = await projectStore.readJson('architecture/knowledge.json', { overview: null, claims: [] });
    await projectStore.writeJson('architecture/knowledge.json', { overview: mergeValue(prev.overview, cell(accepted.architecture.overview, 'INFERRED', null)), claims: mergeClaims(prev.claims, accepted.architecture.claims.map(stripAi), { analysisId, currentHashes }), updatedAt: new Date().toISOString() });
  }

  // conflicts are recorded, never silently resolved
  if (report.conflicts.length) {
    const cf = await projectStore.readJson('index/conflicts.json', { conflicts: [] });
    for (const c of report.conflicts) cf.conflicts.push({ ...c, analysisId, at: new Date().toISOString() });
    await projectStore.writeJson('index/conflicts.json', cf);
  }
  logger.info('KNOWLEDGE', 'reconciled', { analysisId, counts: report.counts, conflicts: report.conflicts.length });
  return { changes, report };
}

function stripAi(c) { const { aiStatus, checks, evidenceValid, ...rest } = c; return { ...rest, checks }; }

module.exports = { verifyPackage, reconcile, loadStaticIndex, extractTokens, textHas, checkRef, SourceReader };
