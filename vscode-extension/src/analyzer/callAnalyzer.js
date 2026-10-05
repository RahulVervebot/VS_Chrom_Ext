// Per-symbol call extraction (no nested double-counting), behaviour flags, and UI event handler bindings.
const { lineIndex, lineAt } = require('../utils/text');

const CALLABLE = new Set(['function', 'method', 'component', 'hook']);
const SKIP_CALLEES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'await', 'new', 'require', 'import', 'super', 'console.log', 'console.error', 'console.warn',
  'Promise', 'Promise.all', 'Promise.resolve', 'Promise.reject', 'JSON.stringify', 'JSON.parse', 'Object.keys', 'Object.values', 'Object.entries', 'Object.assign',
  'Array.isArray', 'Array.from', 'String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'Math.round', 'Math.floor', 'Math.max', 'Math.min', 'Math.ceil',
  'setTimeout', 'setInterval', 'clearTimeout', 'Date.now', 'isNaN', 'Error', 'fetch', 'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 'useReducer',
]);
const BUILTIN_RECEIVERS = new Set(['console', 'JSON', 'Math', 'Object', 'Array', 'Promise', 'String', 'Number', 'Date', 'res', 'req', 'response', 'request', 'window', 'document', 'process', 'localStorage']);

const CALL_RE = /(?<![\w$.])((?:this\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/g;

function isCallable(s) { return CALLABLE.has(s.type); }

function innermost(symbols, line) {
  let best = null;
  for (const s of symbols) {
    if (!isCallable(s) || line < s.line || line > s.endLine) continue;
    if (!best || (s.endLine - s.line) <= (best.endLine - best.line)) best = s;
  }
  return best;
}

function extractCalls(codeLines, symbols) {
  for (const s of symbols) {
    if (!isCallable(s)) continue;
    const calls = [];
    for (let ln = s.line; ln <= Math.min(s.endLine, codeLines.length); ln++) {
      if (innermost(symbols, ln) !== s) continue; // belongs to a nested function
      const text = codeLines[ln - 1];
      CALL_RE.lastIndex = 0;
      let m;
      while ((m = CALL_RE.exec(text))) {
        let name = m[1];
        if (ln === s.line && (name === s.name || name.endsWith(`.${s.name}`))) continue;
        if (SKIP_CALLEES.has(name)) continue;
        const recv = name.split('.')[0];
        if (BUILTIN_RECEIVERS.has(recv)) continue;
        if (name.startsWith('this.')) name = name.slice(5) + '@this';
        calls.push({ name, line: ln });
      }
    }
    s.calls = calls;
    const body = codeLines.slice(s.line - 1, s.endLine).join('\n');
    s.flags = {
      responds: /\bres\.(json|send|status|render|redirect|end)\b|return\s+(?:Response|JsonResponse|response\()|jsonify\(|return\s+redirect|wp_send_json|NextResponse\./.test(body),
      handlesErrors: /\btry\s*\{|\.catch\(|\bcatch\s*\(|except\s+\w*|\bnext\(\s*(?:err|error)/.test(body),
      validates: /\b(validate|joi|yup|zod|schema\.parse|checkSchema|express-validator|sanitize)\w*\b|if\s*\(\s*!\w+/i.test(body),
      setsState: /\bset[A-Z]\w*\(|dispatch\(|\.setState\(/.test(body),
      navigates: /\b(navigate|router\.push|history\.push|redirect|window\.location)\b/.test(body),
    };
  }
}

// JSX / Vue event handler bindings, attributed to the enclosing component or function.
function extractUiHandlers(code, symbols) {
  const starts = lineIndex(code);
  const out = [];
  const jsx = /\b(on[A-Z]\w*)\s*=\s*\{\s*(?:(?:async\s*)?\([^)]*\)\s*=>\s*\{?\s*(?:await\s+)?)?([A-Za-z_$][\w$.]*)/g;
  let m;
  while ((m = jsx.exec(code))) {
    const line = lineAt(starts, m.index);
    out.push({ event: m[1], name: m[2], line, inSymbol: (innermost(symbols, line) || {}).name || null });
  }
  const vue = /(?:@|v-on:)([\w.-]+)\s*=\s*["']([A-Za-z_$][\w$.]*)/g;
  while ((m = vue.exec(code))) out.push({ event: m[1], name: m[2], line: lineAt(starts, m.index), inSymbol: null });
  return out;
}

function routeBodyCalls(codeLines, range, symbols) {
  const calls = [];
  for (let ln = range.startLine; ln <= Math.min(range.endLine, codeLines.length); ln++) {
    if (innermost(symbols, ln) && innermost(symbols, ln).line > range.startLine) continue;
    CALL_RE.lastIndex = 0;
    let m;
    while ((m = CALL_RE.exec(codeLines[ln - 1]))) {
      if (SKIP_CALLEES.has(m[1]) || BUILTIN_RECEIVERS.has(m[1].split('.')[0])) continue;
      calls.push({ name: m[1], line: ln });
    }
  }
  return calls;
}

module.exports = { extractCalls, extractUiHandlers, routeBodyCalls, innermost, isCallable };
