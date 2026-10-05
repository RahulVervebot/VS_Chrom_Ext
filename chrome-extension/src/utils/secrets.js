// Final safety net before anything is typed into an AI website. VS Code already redacts; this re-checks.
export const REDACTED = '[REDACTED_SECRET]';

const RULES = [
  { type: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, whole: true },
  { type: 'aws-access-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, whole: true },
  { type: 'aws-secret-key', re: /(aws_?secret_?access_?key["'\s:=]+)["']?([A-Za-z0-9/+=]{40})["']?/gi, group: 2 },
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, whole: true },
  { type: 'stripe-key', re: /\b(?:sk|rk|pk_live|whsec)_(?:live_|test_)?[A-Za-z0-9]{16,}\b/g, whole: true },
  { type: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, whole: true },
  { type: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, whole: true },
  { type: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, whole: true },
  { type: 'db-connection-credentials', re: /\b((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^:/\s"']+:)([^@\s"']{3,})(@)/gi, group: 2 },
  { type: 'bearer-token', re: /(\bBearer\s+)([A-Za-z0-9._~+/=-]{20,})/g, group: 2 },
  { type: 'oauth-client-secret', re: /((?:client[_-]?secret|oauth[_-]?secret|consumer[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{8,})["']/gi, group: 2 },
  { type: 'webhook-secret', re: /((?:webhook[_-]?secret|signing[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{8,})["']/gi, group: 2 },
  { type: 'jwt-secret', re: /((?:jwt[_-]?secret|secret[_-]?key|session[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{6,})["']/gi, group: 2 },
  { type: 'password', re: /((?:password|passwd|pwd|db[_-]?pass(?:word)?)["'\s]*[:=]\s*)["']([^"'\s]{4,})["']/gi, group: 2 },
  { type: 'api-key', re: /((?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret)["'\s]*[:=]\s*)["']([A-Za-z0-9_\-./+=]{12,})["']/gi, group: 2 },
];

// Returns { text, findings:[{type}] } (never the value).
export function redactText(text) {
  const ranges = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let m;
    while ((m = re.exec(text))) {
      let start = m.index; let end = m.index + m[0].length;
      if (rule.group) { const g = m[rule.group]; if (!g) continue; start = m.index + m[0].lastIndexOf(g); end = start + g.length; }
      if (text.slice(start, end) === REDACTED) continue;
      ranges.push({ start, end, type: rule.type });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const r of ranges) { const last = merged[merged.length - 1]; if (last && r.start < last.end) { last.end = Math.max(last.end, r.end); continue; } merged.push({ ...r }); }
  let out = text;
  for (let i = merged.length - 1; i >= 0; i--) out = out.slice(0, merged[i].start) + REDACTED + out.slice(merged[i].end);
  return { text: out, findings: merged.map((r) => ({ type: r.type })) };
}
