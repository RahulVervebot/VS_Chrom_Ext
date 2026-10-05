// Secret detection and redaction. Findings never contain the secret value itself.
const REDACTED = '[REDACTED_SECRET]';

const RULES = [
  { type: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, whole: true },
  { type: 'aws-access-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, whole: true },
  { type: 'aws-secret-key', re: /(aws_?secret_?access_?key["'\s:=]+)["']?([A-Za-z0-9/+=]{40})["']?/gi, group: 2 },
  { type: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, whole: true },
  { type: 'stripe-key', re: /\b(?:sk|rk|pk_live|whsec)_(?:live_|test_)?[A-Za-z0-9]{16,}\b/g, whole: true },
  { type: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, whole: true },
  { type: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, whole: true },
  { type: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, whole: true },
  { type: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, whole: true },
  { type: 'db-connection-credentials', re: /\b((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^:/\s"']+:)([^@\s"']{3,})(@)/gi, group: 2 },
  { type: 'bearer-token', re: /(\bBearer\s+)([A-Za-z0-9._~+/=-]{20,})/g, group: 2 },
  { type: 'oauth-client-secret', re: /((?:client[_-]?secret|oauth[_-]?secret|consumer[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{8,})["']/gi, group: 2 },
  { type: 'webhook-secret', re: /((?:webhook[_-]?secret|signing[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{8,})["']/gi, group: 2 },
  { type: 'jwt-secret', re: /((?:jwt[_-]?secret|secret[_-]?key|session[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{6,})["']/gi, group: 2 },
  { type: 'password', re: /((?:password|passwd|pwd|db[_-]?pass(?:word)?)["'\s]*[:=]\s*)["']([^"'\s]{4,})["']/gi, group: 2 },
  { type: 'api-key', re: /((?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret)["'\s]*[:=]\s*)["']([A-Za-z0-9_\-./+=]{12,})["']/gi, group: 2 },
];

function isEnvFile(file) {
  return /(^|\/)\.env(\..*)?$/.test(file || '') && !/\.env\.(example|sample|template)$/.test(file || '');
}

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// Returns { text, findings:[{type,line}] }. Line numbers refer to the original text.
function redact(text, file = '') {
  const findings = [];

  if (isEnvFile(file)) {
    const out = text.split('\n').map((ln, i) => {
      const m = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)(.*)$/.exec(ln);
      if (!m || m[2].trim() === '') return ln;
      findings.push({ type: 'env-value', line: i + 1 });
      return m[1] + REDACTED;
    });
    return { text: out.join('\n'), findings };
  }

  // Collect ranges first (on the original text), then apply right-to-left so offsets stay valid.
  const ranges = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let m;
    while ((m = re.exec(text))) {
      let start = m.index;
      let end = m.index + m[0].length;
      if (rule.group) {
        const g = m[rule.group];
        if (!g) continue;
        start = m.index + m[0].lastIndexOf(g);
        end = start + g.length;
      }
      if (text.slice(start, end) === REDACTED) continue;
      ranges.push({ start, end, type: rule.type });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) { last.end = Math.max(last.end, r.end); continue; }
    merged.push({ ...r });
  }
  let out = text;
  for (let i = merged.length - 1; i >= 0; i--) {
    const r = merged[i];
    out = out.slice(0, r.start) + REDACTED + out.slice(r.end);
  }
  for (const r of merged) findings.push({ type: r.type, line: lineOf(text, r.start) });
  findings.sort((a, b) => a.line - b.line);
  return { text: out, findings };
}

function detectSecrets(text, file = '') {
  return redact(text, file).findings;
}

// Deep-redacts every string in a JSON-like value (used on outbound packages as a final check).
function redactDeep(value, file = '') {
  const findings = [];
  const walk = (v) => {
    if (typeof v === 'string') { const r = redact(v, file); findings.push(...r.findings); return r.text; }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return { value: walk(value), findings };
}

module.exports = { redact, detectSecrets, redactDeep, isEnvFile, REDACTED };
