// Evidence model: every important claim is VERIFIED, INFERRED or UNKNOWN.
const STATUS = { VERIFIED: 'VERIFIED', INFERRED: 'INFERRED', UNKNOWN: 'UNKNOWN' };

function makeClaim(claim, status, evidence = []) {
  if (!Object.values(STATUS).includes(status)) throw new Error(`Invalid evidence status: ${status}`);
  // A claim cannot be VERIFIED without evidence.
  if (status === STATUS.VERIFIED && evidence.length === 0) status = STATUS.UNKNOWN;
  return { claim, status, evidence };
}

function evidenceRef(file, extra = {}) {
  return { file, ...extra };
}

// Weakest-wins combination, used when merging claims about the same fact.
const RANK = { UNKNOWN: 0, INFERRED: 1, VERIFIED: 2 };
function stronger(a, b) { return RANK[a] >= RANK[b] ? a : b; }

module.exports = { STATUS, makeClaim, evidenceRef, stronger, RANK };
