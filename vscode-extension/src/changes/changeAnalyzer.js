// Validates AI change proposals (CHANGE_PROPOSAL). Chrome never touches files; this is untrusted input.
const { validate } = require('../utils/validation');
const { normalizeRelative, resolveInside } = require('../utils/paths');
const { compileExclusions } = require('../scanner/exclusions');
const { AiProjectError, ErrorCodes } = require('../utils/errors');

const MAX_CONTENT = 1024 * 1024;
const SCHEMA = {
  type: 'object',
  props: {
    title: { type: 'string', required: true, maxLength: 300 },
    rationale: { type: 'string', maxLength: 5000 },
    analysisId: { type: 'string', maxLength: 100 },
    changes: {
      type: 'array', required: true, maxItems: 100,
      items: { type: 'object', props: {
        path: { type: 'string', required: true, maxLength: 500 },
        operation: { type: 'string', required: true, enum: ['MODIFY', 'CREATE', 'DELETE'] },
        expectedHash: { type: 'string', maxLength: 80 },
        newContent: { type: 'string', maxLength: MAX_CONTENT },
        edits: { type: 'array', maxItems: 200, items: { type: 'object', props: { find: { type: 'string', required: true, maxLength: 20000 }, replace: { type: 'string', required: true, maxLength: 20000 } } } },
      } },
    },
  },
};

const PROTECTED = ['.git', 'node_modules', '.ai-project', '.vscode'];

function parseProposal(payload, { excludePatterns = [], root }) {
  const errors = validate(payload, SCHEMA);
  if (errors.length) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `Invalid change proposal: ${errors.slice(0, 3).join('; ')}`);
  if (!payload.changes.length) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, 'Change proposal contains no changes.');
  const isExcluded = compileExclusions(excludePatterns);
  const seen = new Set();
  const changes = payload.changes.map((c) => {
    const rel = normalizeRelative(c.path);
    resolveInside(root, rel); // throws on traversal/absolute
    if (PROTECTED.some((p) => rel === p || rel.startsWith(p + '/'))) throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Changes to ${rel} are not allowed.`);
    if (/(^|\/)\.env(\..*)?$/.test(rel)) throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Changes to environment files are not allowed: ${rel}`);
    if (isExcluded(rel) && c.operation !== 'CREATE') throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `${rel} is excluded from analysis and cannot be changed by AI proposals.`);
    if (seen.has(rel)) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `Duplicate change for ${rel}.`);
    seen.add(rel);
    if ((c.operation === 'MODIFY' || c.operation === 'DELETE') && !c.expectedHash) throw new AiProjectError(ErrorCodes.HASH_MISMATCH, `${rel}: expectedHash is required so stale changes can be detected.`);
    if (c.operation === 'MODIFY' && c.newContent === undefined && !(c.edits && c.edits.length)) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `${rel}: MODIFY needs newContent or edits.`);
    if (c.operation === 'CREATE' && c.newContent === undefined) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `${rel}: CREATE needs newContent.`);
    return { path: rel, operation: c.operation, expectedHash: c.expectedHash || null, newContent: c.newContent, edits: c.edits };
  });
  return { title: payload.title, rationale: payload.rationale || '', analysisId: payload.analysisId || null, changes };
}

// Apply find/replace edits to text; each `find` must match exactly once.
function applyEdits(text, edits, filePath) {
  let out = text;
  for (const e of edits) {
    const first = out.indexOf(e.find);
    if (first === -1) throw new AiProjectError(ErrorCodes.HASH_MISMATCH, `${filePath}: edit target not found; the file differs from what the AI analyzed.`);
    if (out.indexOf(e.find, first + 1) !== -1) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `${filePath}: edit target is ambiguous (matches more than once).`);
    out = out.slice(0, first) + e.replace + out.slice(first + e.find.length);
  }
  return out;
}

module.exports = { parseProposal, applyEdits };
