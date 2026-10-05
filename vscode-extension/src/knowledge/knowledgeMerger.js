// Item-level merge rules:
//  * stronger evidence status wins; weaker AI output never overwrites stronger knowledge
//  * equal-strength disagreement keeps the existing value and records the alternative
//  * knowledge built from a superseded source hash is stale and is replaced by fresh knowledge
const { RANK } = require('./evidenceManager');

// value cell: { value, status, analysisId, sourceHash, alternatives: [] }
function mergeValue(existing, incoming, { currentHash } = {}) {
  if (!incoming || incoming.value === undefined || incoming.value === null || incoming.value === '') return existing || null;
  if (!existing) return { ...incoming, alternatives: [] };
  const stale = currentHash && existing.sourceHash && existing.sourceHash !== currentHash;
  if (stale && RANK[incoming.status] >= RANK.INFERRED) return { ...incoming, alternatives: existing.alternatives || [] };
  if (existing.value === incoming.value) return { ...existing, status: RANK[incoming.status] > RANK[existing.status] ? incoming.status : existing.status };
  if (RANK[incoming.status] > RANK[existing.status]) {
    return { ...incoming, alternatives: [...(existing.alternatives || []), { value: existing.value, status: existing.status, analysisId: existing.analysisId }] };
  }
  const alts = existing.alternatives || [];
  if (RANK[incoming.status] === RANK[existing.status] && !alts.some((a) => a.value === incoming.value)) {
    return { ...existing, alternatives: [...alts, { value: incoming.value, status: incoming.status, analysisId: incoming.analysisId }] };
  }
  return existing;
}

// Claims are keyed by claim text. Higher status wins; evidence lists are unioned.
function mergeClaims(existing = [], incoming = [], { analysisId, currentHashes = {} } = {}) {
  const map = new Map(existing.map((c) => [c.claim, c]));
  for (const c of incoming) {
    const prev = map.get(c.claim);
    const stamped = { ...c, analysisId };
    if (!prev) { map.set(c.claim, stamped); continue; }
    const prevStale = (prev.evidence || []).some((e) => e.sha256 && currentHashes[e.file] && currentHashes[e.file] !== e.sha256);
    if (prevStale || RANK[c.status] > RANK[prev.status]) map.set(c.claim, { ...stamped, evidence: dedupeEvidence([...(c.evidence || []), ...(prevStale ? [] : prev.evidence || [])]) });
    else map.set(c.claim, { ...prev, evidence: dedupeEvidence([...(prev.evidence || []), ...(c.evidence || [])]) });
  }
  return [...map.values()];
}

function dedupeEvidence(list) {
  const seen = new Set();
  return list.filter((e) => { const k = `${e.file}|${e.symbol || ''}|${e.lineStart || ''}|${e.lineEnd || ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const union = (a = [], b = []) => [...new Set([...a, ...b])];

module.exports = { mergeValue, mergeClaims, dedupeEvidence, union };
