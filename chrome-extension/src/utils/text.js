export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Provider-agnostic estimate; real limits differ per provider and are configured by the user.
export function estimateTokens(text) { return text ? Math.ceil(text.length / 3.6) : 0; }

export function truncateMiddle(s, max) { return s.length <= max ? s : `${s.slice(0, Math.floor(max * 0.7))}\n…[truncated]…\n${s.slice(-Math.floor(max * 0.25))}`; }
