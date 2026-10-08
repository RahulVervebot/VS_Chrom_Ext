// Schema validation for inbound knowledge packages. Structure and size only; truth is checked by reconciliation.
const { validate } = require('../utils/validation');
const { isCompatibleSchema } = require('./versionManager');

const STATUS = { type: 'string', enum: ['VERIFIED', 'INFERRED', 'UNKNOWN'] };
const str = (max = 4000) => ({ type: 'string', maxLength: max });

const EVIDENCE_REF = {
  type: 'object',
  props: {
    file: { ...str(500), required: true },
    symbol: str(300),
    lineStart: { type: 'number' },
    lineEnd: { type: 'number' },
    sha256: str(80),
    hash: str(80),
  },
};

const CLAIM = {
  type: 'object',
  props: {
    claim: { ...str(2000), required: true },
    status: { ...STATUS, required: true },
    evidence: { type: 'array', maxItems: 50, items: EVIDENCE_REF },
    subject: str(300),
  },
};

const claims = { type: 'array', maxItems: 500, items: CLAIM };

const PACKAGE = {
  type: 'object',
  props: {
    packageType: { type: 'string', enum: ['KNOWLEDGE_PACKAGE'], required: true },
    schemaVersion: { ...str(20), required: true },
    projectId: { ...str(100), required: true },
    analysisId: { ...str(100), required: true },
    source: { type: 'object', props: { provider: { ...str(100), required: true }, model: str(100) }, required: true },
    knowledge: {
      type: 'object',
      required: true,
      props: {
        files: {
          type: 'array', maxItems: 2000,
          items: { type: 'object', props: { path: { ...str(500), required: true }, sha256: str(80), hash: str(80), purpose: str(), role: str(), claims, unknowns: { type: 'array', maxItems: 200, items: str(1000) } } },
        },
        features: {
          type: 'array', maxItems: 500,
          items: { type: 'object', props: { id: { ...str(200), required: true }, name: str(300), purpose: str(), files: { type: 'array', maxItems: 2000, items: str(500) }, claims } },
        },
        workflows: {
          type: 'array', maxItems: 500,
          items: {
            type: 'object',
            props: {
              id: { ...str(200), required: true }, name: str(300), purpose: str(), api: { type: 'any' },
              steps: { type: 'array', maxItems: 500, items: { type: 'object', props: { kind: str(60), file: str(500), symbol: str(300), description: str(2000), status: STATUS } } },
              businessRules: { type: 'array', maxItems: 200, items: CLAIM },
              claims,
            },
          },
        },
        database: {
          type: 'object',
          props: {
            entities: { type: 'array', maxItems: 1000, items: { type: 'object', props: { name: { ...str(200), required: true }, purpose: str(), fields: { type: 'array', maxItems: 500, items: { type: 'object', props: { name: { ...str(200), required: true }, type: str(100), evidence: { type: 'array', maxItems: 20, items: EVIDENCE_REF } } } }, claims } } },
            relationships: { type: 'array', maxItems: 2000, items: { type: 'object', props: { from: { ...str(200), required: true }, to: { ...str(200), required: true }, type: str(50), evidence: { type: 'array', maxItems: 20, items: EVIDENCE_REF }, status: STATUS } } },
          },
        },
        architecture: { type: 'object', props: { overview: str(8000), claims } },
        dependencies: { type: 'array', maxItems: 5000, items: { type: 'object', props: { from: { ...str(500), required: true }, to: { ...str(500), required: true }, status: STATUS } } },
      },
    },
    evidence: claims,
    unknowns: { type: 'array', maxItems: 500, items: { type: 'any' } },
  },
};

// AI answers are almost right more often than exactly right: an "unknown" written as { question, reason } instead of a sentence, a number
// where text was expected, a sentence a little too long. These are repaired instead of rejecting a whole run's worth of knowledge.
// Structure that cannot be repaired (missing required fields, wrong enum values) is still rejected.
function toText(v) {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(toText).filter(Boolean).join('; ');
  if (typeof v === 'object') {
    const pick = (...ks) => ks.map((k) => (typeof v[k] === 'string' && v[k].trim() ? v[k].trim() : null)).find(Boolean);
    const what = pick('question', 'item', 'topic', 'what', 'unknown', 'claim', 'description', 'text', 'summary', 'title', 'name', 'path', 'file');
    const why = pick('reason', 'why', 'detail', 'details', 'note', 'notes', 'explanation', 'because', 'impact');
    if (what) return why && why !== what ? `${what} — ${why}` : what;
    return JSON.stringify(v);
  }
  return String(v);
}

function pathTokens(p) { return [...String(p).replace(/^\$\.?/, '').matchAll(/([^.\[\]]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1])); }

function repairPackage(pkg, errors) {
  let fixed = 0;
  for (const e of errors) {
    const m = /^(\$[^:]*): (expected string, got \w+|longer than (\d+)|more than (\d+) items)$/.exec(e);
    if (!m) continue;
    const t = pathTokens(m[1]);
    let parent = pkg;
    for (const k of t.slice(0, -1)) { if (parent === null || parent === undefined) break; parent = parent[k]; }
    const last = t[t.length - 1];
    if (parent === null || parent === undefined || last === undefined) continue;
    if (m[2].startsWith('expected string')) { parent[last] = toText(parent[last]); fixed++; }
    else if (m[3]) { parent[last] = String(parent[last]).slice(0, Number(m[3])); fixed++; }
    else if (m[4] && Array.isArray(parent[last])) { parent[last] = parent[last].slice(0, Number(m[4])); fixed++; }
  }
  return fixed;
}

function validateKnowledgePackage(pkg) {
  let errors = validate(pkg, PACKAGE);
  let repaired = 0;
  for (let pass = 0; pass < 3 && errors.length && typeof pkg === 'object' && pkg; pass++) {
    const n = repairPackage(pkg, errors);
    if (!n) break;
    repaired += n;
    errors = validate(pkg, PACKAGE);
  }
  if (repaired && pkg.knowledge && Array.isArray(pkg.knowledge.unknowns)) pkg.knowledge.unknowns.push(`NOTE: ${repaired} field(s) in the AI answer had the wrong format (for example an object instead of a sentence) and were converted to text.`);
  if (typeof pkg === 'object' && pkg && typeof pkg.schemaVersion === 'string' && !isCompatibleSchema(pkg.schemaVersion)) {
    errors.push(`$.schemaVersion: incompatible version ${pkg.schemaVersion}`);
  }
  return { valid: errors.length === 0, errors: errors.slice(0, 50), repaired };
}

module.exports = { validateKnowledgePackage, PACKAGE, toText };
