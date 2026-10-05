// Structured logger. Scrubs anything that looks like a secret before writing.
const TAGS = ['AI-PROJECT', 'BRIDGE', 'ANALYSIS', 'KNOWLEDGE', 'WORKFLOW', 'DATABASE', 'SECURITY', 'CHANGE'];

const SCRUB = [
  /(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
  /((?:api[_-]?key|secret|token|password|passwd|pwd)["'\s:=]+)["']?[^\s"',;]{6,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

function scrub(text) {
  let out = String(text);
  for (const re of SCRUB) out = out.replace(re, (m, p1) => `${typeof p1 === 'string' ? p1 : ''}[REDACTED_SECRET]`);
  return out;
}

let sink = (line) => console.log(line);
let level = 'info';
const ORDER = { debug: 0, info: 1, warn: 2, error: 3 };

function setSink(fn) { sink = fn; }
function setLevel(l) { level = l; }

function write(lvl, tag, message, data) {
  if (ORDER[lvl] < ORDER[level]) return;
  const t = TAGS.includes(tag) ? tag : 'AI-PROJECT';
  let line = `${new Date().toISOString()} [${t}] ${lvl.toUpperCase()} ${message}`;
  if (data !== undefined) {
    try { line += ' ' + JSON.stringify(data); } catch { line += ' [unserializable]'; }
  }
  sink(scrub(line));
}

const logger = {
  setSink,
  setLevel,
  debug: (tag, msg, data) => write('debug', tag, msg, data),
  info: (tag, msg, data) => write('info', tag, msg, data),
  warn: (tag, msg, data) => write('warn', tag, msg, data),
  error: (tag, msg, data) => write('error', tag, msg, data),
  scrub,
};

module.exports = logger;
