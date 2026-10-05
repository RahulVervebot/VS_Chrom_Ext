// Structure validation of AI responses (per batch) and of the outbound KNOWLEDGE_PACKAGE. Independent of VS Code's copy on purpose:
// Chrome must never send malformed knowledge, and VS Code must never trust that it didn't.
const STATUSES = ['VERIFIED', 'INFERRED', 'UNKNOWN'];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const str = (v, max = 8000) => typeof v === 'string' && v.length <= max;

function checkEvidence(list, at, errors) {
  if (list === undefined) return;
  if (!Array.isArray(list)) { errors.push(`${at}: evidence must be an array`); return; }
  list.forEach((e, i) => {
    if (!isObj(e) || !str(e.file, 500)) errors.push(`${at}[${i}]: evidence needs a file`);
    else {
      for (const k of ['lineStart', 'lineEnd']) if (e[k] !== undefined && !(Number.isInteger(e[k]) && e[k] >= 1)) errors.push(`${at}[${i}].${k}: must be a positive integer`);
      if (e.symbol !== undefined && !str(e.symbol, 300)) errors.push(`${at}[${i}].symbol: must be a string`);
    }
  });
}

function checkClaims(list, at, errors) {
  if (list === undefined) return;
  if (!Array.isArray(list)) { errors.push(`${at}: claims must be an array`); return; }
  list.forEach((c, i) => {
    if (!isObj(c) || !str(c.claim, 2000)) errors.push(`${at}[${i}]: claim text required`);
    else {
      if (!STATUSES.includes(c.status)) errors.push(`${at}[${i}].status: must be VERIFIED, INFERRED or UNKNOWN`);
      checkEvidence(c.evidence, `${at}[${i}].evidence`, errors);
    }
  });
}

const arr = (v, at, errors) => { if (v === undefined) return []; if (!Array.isArray(v)) { errors.push(`${at}: must be an array`); return []; } return v; };

// One batch worth of AI output. Returns { valid, errors }.
export function validateBatchKnowledge(k) {
  const errors = [];
  if (!isObj(k)) return { valid: false, errors: ['response must be a JSON object'] };
  arr(k.files, 'files', errors).forEach((f, i) => {
    if (!isObj(f) || !str(f.path, 500)) { errors.push(`files[${i}]: path required`); return; }
    for (const key of ['purpose', 'role']) if (f[key] !== undefined && !str(f[key])) errors.push(`files[${i}].${key}: must be a string`);
    checkClaims(f.claims, `files[${i}].claims`, errors);
  });
  arr(k.features, 'features', errors).forEach((f, i) => { if (!isObj(f) || !str(f.id, 200)) errors.push(`features[${i}]: id required`); else checkClaims(f.claims, `features[${i}].claims`, errors); });
  arr(k.workflows, 'workflows', errors).forEach((w, i) => {
    if (!isObj(w) || !str(w.id, 200)) { errors.push(`workflows[${i}]: id required`); return; }
    arr(w.steps, `workflows[${i}].steps`, errors).forEach((s, j) => { if (!isObj(s)) errors.push(`workflows[${i}].steps[${j}]: must be an object`); else if (s.status !== undefined && !STATUSES.includes(s.status)) errors.push(`workflows[${i}].steps[${j}].status: invalid`); });
    checkClaims(w.claims, `workflows[${i}].claims`, errors); checkClaims(w.businessRules, `workflows[${i}].businessRules`, errors);
  });
  if (k.database !== undefined) {
    if (!isObj(k.database)) errors.push('database: must be an object');
    else {
      arr(k.database.entities, 'database.entities', errors).forEach((e, i) => {
        if (!isObj(e) || !str(e.name, 200)) { errors.push(`database.entities[${i}]: name required`); return; }
        arr(e.fields, `database.entities[${i}].fields`, errors).forEach((f, j) => { if (!isObj(f) || !str(f.name, 200)) errors.push(`database.entities[${i}].fields[${j}]: name required`); else checkEvidence(f.evidence, `database.entities[${i}].fields[${j}].evidence`, errors); });
        checkClaims(e.claims, `database.entities[${i}].claims`, errors);
      });
      arr(k.database.relationships, 'database.relationships', errors).forEach((r, i) => { if (!isObj(r) || !str(r.from, 200) || !str(r.to, 200)) errors.push(`database.relationships[${i}]: from and to required`); else checkEvidence(r.evidence, `database.relationships[${i}].evidence`, errors); });
    }
  }
  if (k.architecture !== undefined) { if (!isObj(k.architecture)) errors.push('architecture: must be an object'); else checkClaims(k.architecture.claims, 'architecture.claims', errors); }
  arr(k.dependencies, 'dependencies', errors).forEach((d, i) => { if (!isObj(d) || !str(d.from, 500) || !str(d.to, 500)) errors.push(`dependencies[${i}]: from and to required`); });
  checkClaims(k.evidence, 'evidence', errors);
  arr(k.unknowns, 'unknowns', errors);
  if (k.changeProposal !== undefined) {
    const c = k.changeProposal;
    if (!isObj(c) || !str(c.title, 300) || !Array.isArray(c.changes) || !c.changes.length) errors.push('changeProposal: title and a non-empty changes array required');
    else c.changes.forEach((ch, i) => { if (!isObj(ch) || !str(ch.path, 500) || !['MODIFY', 'CREATE', 'DELETE'].includes(ch.operation)) errors.push(`changeProposal.changes[${i}]: path and operation required`); });
  }
  const known = ['analysisType', 'files', 'features', 'workflows', 'database', 'architecture', 'dependencies', 'evidence', 'unknowns', 'changeProposal'];
  const extra = Object.keys(k).filter((x) => !known.includes(x));
  const anyKnown = known.slice(1).some((x) => k[x] !== undefined);
  if (!anyKnown) errors.push(`response contains none of the expected sections (${known.slice(1).join(', ')})`);
  return { valid: errors.length === 0, errors: errors.slice(0, 20), ignoredKeys: extra };
}

// Final package sanity check before it is sent to VS Code.
export function validateOutboundPackage(pkg) {
  const errors = [];
  if (!isObj(pkg)) return { valid: false, errors: ['package must be an object'] };
  if (pkg.packageType !== 'KNOWLEDGE_PACKAGE') errors.push('packageType must be KNOWLEDGE_PACKAGE');
  if (pkg.schemaVersion !== '1.0') errors.push('schemaVersion must be 1.0');
  for (const k of ['projectId', 'analysisId']) if (!str(pkg[k], 100)) errors.push(`${k} required`);
  if (!isObj(pkg.source) || !str(pkg.source.provider, 100)) errors.push('source.provider required');
  if (!isObj(pkg.knowledge)) errors.push('knowledge required');
  else { const r = validateBatchKnowledge({ ...pkg.knowledge, files: pkg.knowledge.files || [] }); if (!r.valid && !/none of the expected/.test(r.errors.join())) errors.push(...r.errors); }
  return { valid: errors.length === 0, errors };
}
