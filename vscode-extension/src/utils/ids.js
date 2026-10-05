const crypto = require('crypto');

function pad(n, width = 3) { return String(n).padStart(width, '0'); }

// analysis-001 style sequential ids, given existing ids.
function nextSequentialId(prefix, existing) {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const id of existing) {
    const m = re.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${pad(max + 1)}`;
}

function randomId(prefix, bytes = 6) {
  return `${prefix}-${crypto.randomBytes(bytes).toString('hex')}`;
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Stable project id, not derived from any machine path.
function newProjectId() { return randomId('project', 5); }

module.exports = { nextSequentialId, randomId, randomToken, newProjectId, pad };
