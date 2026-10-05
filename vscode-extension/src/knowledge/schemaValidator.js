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

function validateKnowledgePackage(pkg) {
  const errors = validate(pkg, PACKAGE);
  if (typeof pkg === 'object' && pkg && typeof pkg.schemaVersion === 'string' && !isCompatibleSchema(pkg.schemaVersion)) {
    errors.push(`$.schemaVersion: incompatible version ${pkg.schemaVersion}`);
  }
  return { valid: errors.length === 0, errors: errors.slice(0, 50) };
}

module.exports = { validateKnowledgePackage, PACKAGE };
