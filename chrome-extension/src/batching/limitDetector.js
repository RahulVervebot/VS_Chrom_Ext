// Classifies provider problems from page text so the orchestrator can decide: retry, reduce, wait, or stop.
const PATTERNS = [
  { code: 'LIMIT', re: /usage (?:cap|limit)|reached (?:the |your )?(?:current )?(?:message |usage )?limit|message limit|out of (?:free )?messages|too many requests|rate limit|quota|try again (?:later|in)|come back (?:later|at)/i },
  { code: 'CONTEXT_TOO_LARGE', re: /message (?:is )?too long|too long|input (?:is )?too large|exceeds? the (?:maximum )?(?:context|length)|context (?:length|window)|prompt is too long/i },
  { code: 'LOGIN', re: /log ?in to continue|sign ?in to continue|please (?:log|sign) ?in|session (?:has )?expired/i },
  { code: 'CAPTCHA', re: /verify you are (?:a )?human|captcha|unusual activity/i },
  { code: 'NETWORK', re: /network error|something went wrong|an error occurred|failed to (?:generate|fetch|load)|connection (?:lost|error)|couldn['’]t (?:generate|complete)/i },
];

export function classifyProblem(text) {
  if (!text) return null;
  for (const p of PATTERNS) if (p.re.test(text)) return p.code;
  return null;
}

export const RETRYABLE = new Set(['NETWORK', 'TIMEOUT', 'TRUNCATED', 'INVALID_JSON']);
export const NEEDS_USER = new Set(['LOGIN', 'CAPTCHA', 'UI_CHANGED', 'NO_TAB', 'LIMIT']);
