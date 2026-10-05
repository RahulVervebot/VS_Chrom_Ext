// Merges per-batch knowledge into one package. Never upgrades a claim's status; stronger evidence status wins, unions evidence.
const RANK = { UNKNOWN: 0, INFERRED: 1, VERIFIED: 2 };

const evKey = (e) => `${e.file}|${e.symbol || ''}|${e.lineStart || ''}|${e.lineEnd || ''}`;
const dedupeEvidence = (list) => { const seen = new Set(); return list.filter((e) => { const k = evKey(e); if (seen.has(k)) return false; seen.add(k); return true; }); };

export function mergeClaims(a = [], b = []) {
  const map = new Map(a.map((c) => [c.claim, c]));
  for (const c of b) {
    const p = map.get(c.claim);
    if (!p) { map.set(c.claim, c); continue; }
    const winner = RANK[c.status] > RANK[p.status] ? c : p;
    map.set(c.claim, { ...winner, evidence: dedupeEvidence([...(p.evidence || []), ...(c.evidence || [])]) });
  }
  return [...map.values()];
}

const uniq = (a = [], b = []) => [...new Set([...a, ...b].map((x) => (typeof x === 'string' ? x : JSON.stringify(x))))].map((x) => { try { return JSON.parse(x); } catch { return x; } });
const firstText = (a, b) => (a && String(a).trim() ? a : b);

export function mergeKnowledge(list) {
  const out = { files: new Map(), features: new Map(), workflows: new Map(), entities: new Map(), relationships: new Map(), dependencies: new Map(), architecture: { overview: undefined, claims: [] }, evidence: [], unknowns: [], changeProposals: [] };
  for (const k of list) {
    for (const f of k.files || []) { const p = out.files.get(f.path); out.files.set(f.path, p ? { ...p, ...f, purpose: firstText(p.purpose, f.purpose), role: firstText(p.role, f.role), claims: mergeClaims(p.claims, f.claims), unknowns: uniq(p.unknowns, f.unknowns) } : { ...f, claims: f.claims || [], unknowns: f.unknowns || [] }); }
    for (const f of k.features || []) { const p = out.features.get(f.id); out.features.set(f.id, p ? { ...p, ...f, purpose: firstText(p.purpose, f.purpose), files: uniq(p.files, f.files), claims: mergeClaims(p.claims, f.claims) } : { ...f, files: f.files || [], claims: f.claims || [] }); }
    for (const w of k.workflows || []) {
      const p = out.workflows.get(w.id);
      const steps = new Map([...(p ? p.steps : []), ...(w.steps || [])].map((s) => [`${s.file}|${s.symbol}|${s.kind}`, s]));
      out.workflows.set(w.id, { ...(p || {}), ...w, purpose: firstText(p && p.purpose, w.purpose), steps: [...steps.values()], businessRules: mergeClaims(p && p.businessRules, w.businessRules), claims: mergeClaims(p && p.claims, w.claims) });
    }
    for (const e of (k.database && k.database.entities) || []) {
      const p = out.entities.get(e.name);
      const fields = new Map([...(p ? p.fields : []), ...(e.fields || [])].map((f) => [f.name, f]));
      out.entities.set(e.name, { ...(p || {}), ...e, purpose: firstText(p && p.purpose, e.purpose), fields: [...fields.values()], claims: mergeClaims(p && p.claims, e.claims) });
    }
    for (const r of (k.database && k.database.relationships) || []) out.relationships.set(`${r.from}|${r.to}|${r.type || ''}`, r);
    for (const d of k.dependencies || []) out.dependencies.set(`${d.from}|${d.to}`, d);
    if (k.architecture) { out.architecture.overview = firstText(out.architecture.overview, k.architecture.overview); out.architecture.claims = mergeClaims(out.architecture.claims, k.architecture.claims); }
    out.evidence = mergeClaims(out.evidence, k.evidence);
    out.unknowns = uniq(out.unknowns, k.unknowns);
    if (k.changeProposal) out.changeProposals.push(k.changeProposal);
  }
  return {
    knowledge: {
      files: [...out.files.values()], features: [...out.features.values()], workflows: [...out.workflows.values()],
      database: { entities: [...out.entities.values()], relationships: [...out.relationships.values()] },
      architecture: out.architecture.overview || out.architecture.claims.length ? out.architecture : {},
      dependencies: [...out.dependencies.values()],
    },
    evidence: out.evidence, unknowns: out.unknowns, changeProposals: out.changeProposals,
  };
}
