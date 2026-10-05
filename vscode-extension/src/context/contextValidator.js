// Last line of defence before anything leaves VS Code.
const { redactDeep, REDACTED } = require('../security/secretDetector');
const { compileExclusions } = require('../scanner/exclusions');
const { normalizeRelative } = require('../utils/paths');
const { AiProjectError, ErrorCodes } = require('../utils/errors');

// Throws when the context is unsafe to send. Returns the (re-redacted) package and remaining findings.
function validateOutbound(pkg, { excludePatterns = [], userExcludeEnv = false } = {}) {
  const isExcluded = compileExclusions(excludePatterns);
  const problems = [];
  for (const f of pkg.files || []) {
    let rel;
    try { rel = normalizeRelative(f.path); } catch { problems.push(`invalid path ${f.path}`); continue; }
    if (rel.startsWith('..') || rel.startsWith('/')) problems.push(`path outside project: ${f.path}`);
    if (isExcluded(rel)) problems.push(`excluded file present: ${f.path}`);
  }
  if (problems.length) throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Refusing to send context: ${problems.slice(0, 3).join('; ')}`);
  // Second-pass scan of everything, including metadata (symbol names, existing knowledge, purposes).
  const { value, findings } = redactDeep(pkg);
  return { pkg: value, secondPassRedactions: findings.length, redactedMarker: REDACTED };
}

module.exports = { validateOutbound };
