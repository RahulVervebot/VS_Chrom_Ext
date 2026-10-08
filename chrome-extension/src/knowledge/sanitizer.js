// Normalizes raw AI output against what VS Code actually sent in the batch.
// Chrome cannot verify claims against source (VS Code does that), but it can refuse obvious fabrication cheaply:
//  * paths not present in the batch are dropped and reported as unknowns
//  * hashes are injected from the batch, never taken from the AI
//  * VERIFIED claims without any evidence are downgraded to INFERRED
const STATUSES = new Set(['VERIFIED', 'INFERRED', 'UNKNOWN']);

function fixClaim(c, allowed, notes) {
  const status = STATUSES.has(c.status) ? c.status : 'UNKNOWN';
  const evidence = (c.evidence || []).filter((e) => { const ok = allowed.has(e.file); if (!ok) notes.push(`evidence cites ${e.file}, which was not part of this batch`); return ok; }).map((e) => ({ ...e, sha256: allowed.get(e.file) }));
  let s = status;
  if (s === 'VERIFIED' && evidence.length === 0) { s = 'INFERRED'; notes.push(`claim "${String(c.claim).slice(0, 60)}" had no valid evidence; downgraded to INFERRED`); }
  return { ...c, status: s, evidence };
}

// An "unknown" must be a sentence. Models sometimes answer { question, reason } objects: turn them into text instead of failing the whole run.
function unknownText(u) {
  if (typeof u === 'string') return u;
  if (u === null || u === undefined) return '';
  if (Array.isArray(u)) return u.map(unknownText).filter(Boolean).join('; ');
  if (typeof u === 'object') {
    const pick = (...ks) => ks.map((k) => (typeof u[k] === 'string' && u[k].trim() ? u[k].trim() : null)).find(Boolean);
    const what = pick('question', 'item', 'topic', 'what', 'unknown', 'claim', 'description', 'text', 'summary', 'title', 'name', 'path', 'file');
    const why = pick('reason', 'why', 'detail', 'details', 'note', 'notes', 'explanation', 'because', 'impact');
    if (what) return why && why !== what ? `${what} — ${why}` : what;
    return JSON.stringify(u);
  }
  return String(u);
}
function normalizeUnknowns(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'unknowns' && Array.isArray(v)) node[k] = v.map(unknownText).map((s) => s.slice(0, 1000)).filter(Boolean);
    else if (v && typeof v === 'object') normalizeUnknowns(v, depth + 1);
  }
}

export function sanitizeKnowledge(k, batchFiles) {
  k = JSON.parse(JSON.stringify(k)); normalizeUnknowns(k); // the AI's object is never mutated
  const allowed = new Map(batchFiles.map((f) => [f.path, f.hash]));
  const notes = [];
  const claims = (list) => (list || []).map((c) => fixClaim(c, allowed, notes));
  const out = { ...k };
  out.files = (k.files || []).filter((f) => { const ok = allowed.has(f.path); if (!ok) notes.push(`dropped file item for ${f.path}: not part of this batch`); return ok; }).map((f) => ({ ...f, sha256: allowed.get(f.path), claims: claims(f.claims) }));
  out.features = (k.features || []).map((f) => ({ ...f, files: (f.files || []).filter((p) => allowed.has(p)), claims: claims(f.claims) }));
  out.workflows = (k.workflows || []).map((w) => ({ ...w, steps: (w.steps || []).map((s) => ({ ...s, status: STATUSES.has(s.status) ? s.status : 'INFERRED' })), businessRules: claims(w.businessRules), claims: claims(w.claims) }));
  if (k.database) {
    out.database = {
      entities: (k.database.entities || []).map((e) => ({ ...e, fields: (e.fields || []).map((f) => ({ ...f, evidence: (f.evidence || []).filter((x) => allowed.has(x.file)).map((x) => ({ ...x, sha256: allowed.get(x.file) })) })), claims: claims(e.claims) })),
      relationships: (k.database.relationships || []).map((r) => ({ ...r, evidence: (r.evidence || []).filter((x) => allowed.has(x.file)).map((x) => ({ ...x, sha256: allowed.get(x.file) })) })),
    };
  }
  if (k.architecture) out.architecture = { ...k.architecture, claims: claims(k.architecture.claims) };
  out.evidence = claims(k.evidence);
  out.unknowns = [...(k.unknowns || []), ...notes.slice(0, 20).map((n) => `NOTE: ${n}`)];
  if (k.changeProposal) {
    out.changeProposal = { ...k.changeProposal, changes: k.changeProposal.changes.filter((c) => c.operation === 'CREATE' || allowed.has(c.path)).map((c) => ({ ...c, ...(c.operation === 'CREATE' ? {} : { expectedHash: allowed.get(c.path) }) })) };
    if (!out.changeProposal.changes.length) delete out.changeProposal;
  }
  return { knowledge: out, notes };
}
