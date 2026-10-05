// Provider-agnostic estimate (~4 chars/token, code skews a little denser).
// Real limits differ per provider; this is deliberately an estimate and is labelled as one.
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.6);
}

module.exports = { estimateTokens };
