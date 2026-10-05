// Static symbol extraction. Pattern-based (not a full parser): results are syntactic facts with line ranges.
const { lineIndex, lineAt, matchBrace } = require('../utils/text');

const JS_LANGS = new Set(['javascript', 'typescript', 'vue', 'svelte']);
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'do', 'try', 'with', 'super', 'new']);

function paramsOf(str) {
  return (str || '').split(',').map((s) => s.trim().replace(/\s*=.*$/, '')).filter(Boolean);
}

function classify(name, isJsx) {
  if (/^use[A-Z0-9]/.test(name)) return 'hook';
  if (isJsx && /^[A-Z]/.test(name)) return 'component';
  return 'function';
}

function analyzeJs(content, starts, language) {
  const symbols = [];
  const isJsx = /<[A-Za-z][\w.]*(\s[^>]*)?\/?>/.test(content) || /from\s+['"]react['"]/.test(content);
  const push = (s) => symbols.push(s);

  const fnRe = /^[ \t]*(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm;
  const arrowRe = /^[ \t]*(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(async\s+)?(?:function\s*\*?\s*[\w$]*\s*)?(\(([^)]*)\)|[A-Za-z_$][\w$]*)\s*(?:=>|\{)/gm;
  const classRe = /^[ \t]*(export\s+)?(default\s+)?(abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([\w$.]+))?/gm;
  const constRe = /^(export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*=/gm;
  let m;

  while ((m = fnRe.exec(content))) {
    const open = content.indexOf('{', m.index + m[0].length);
    const end = open === -1 ? m.index + m[0].length : matchBrace(content, open);
    push({ name: m[4], type: classify(m[4], isJsx), line: lineAt(starts, m.index), endLine: lineAt(starts, end), exported: !!m[1], default: !!m[2], async: !!m[3], params: paramsOf(m[5]) });
  }

  while ((m = arrowRe.exec(content))) {
    const isFn = m[0].includes('=>') || /function/.test(m[0]);
    if (!isFn) continue; // `const x = {` is a value, not a function
    const bodyStart = m.index + m[0].length - 1;
    let end;
    if (content[bodyStart] === '{') end = matchBrace(content, bodyStart);
    else {
      // expression-bodied arrow: ends at the statement terminator on its line or a following block
      const nextBrace = content.indexOf('{', bodyStart);
      const nextNl = content.indexOf('\n', bodyStart);
      end = nextNl === -1 ? content.length - 1 : nextNl;
      if (nextBrace !== -1 && nextBrace < end + 1 && /=>\s*\{/.test(content.slice(m.index, nextBrace + 1))) end = matchBrace(content, nextBrace);
    }
    push({ name: m[3], type: classify(m[3], isJsx), line: lineAt(starts, m.index), endLine: lineAt(starts, end), exported: !!m[1], async: !!m[4], params: paramsOf(m[6] !== undefined ? m[6] : m[5]) });
  }

  while ((m = classRe.exec(content))) {
    const open = content.indexOf('{', m.index);
    const end = open === -1 ? m.index + m[0].length : matchBrace(content, open);
    const cls = { name: m[4], type: /extends\s+(React\.)?(Pure)?Component/.test(m[0]) ? 'component' : 'class', line: lineAt(starts, m.index), endLine: lineAt(starts, end), exported: !!m[1], default: !!m[2], extends: m[5] || null, params: [] };
    push(cls);
    // methods
    const body = content.slice(open + 1, end);
    const methodRe = /^[ \t]+(?:(static)\s+)?(async\s+)?(?:get\s+|set\s+)?(#?[A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm;
    let mm;
    while ((mm = methodRe.exec(body))) {
      if (KEYWORDS.has(mm[3])) continue;
      const abs = open + 1 + mm.index;
      const mOpen = abs + mm[0].length - 1;
      push({ name: mm[3], type: 'method', className: cls.name, line: lineAt(starts, abs), endLine: lineAt(starts, matchBrace(content, mOpen)), exported: false, static: !!mm[1], async: !!mm[2], params: paramsOf(mm[4]) });
    }
  }

  while ((m = constRe.exec(content))) {
    push({ name: m[2], type: 'constant', line: lineAt(starts, m.index), endLine: lineAt(starts, m.index), exported: !!m[1], params: [] });
  }

  // Interfaces / types are only expected in typed sources that may exist in analyzed projects.
  if (language === 'typescript') {
    const ifaceRe = /^[ \t]*(export\s+)?(interface|type)\s+([A-Za-z_$][\w$]*)/gm;
    while ((m = ifaceRe.exec(content))) push({ name: m[3], type: m[2], line: lineAt(starts, m.index), endLine: lineAt(starts, m.index), exported: !!m[1], params: [] });
  }
  return symbols;
}

// Indentation-scoped languages.
function analyzePython(content, starts) {
  const symbols = [];
  const lines = content.split('\n');
  const re = /^(\s*)(async\s+)?(def|class)\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?/;
  lines.forEach((ln, i) => {
    const m = re.exec(ln);
    if (!m) return;
    const indent = m[1].length;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === '') continue;
      if (lines[j].match(/^(\s*)/)[1].length <= indent) break;
      end = j;
    }
    const isClass = m[3] === 'class';
    symbols.push({ name: m[4], type: isClass ? 'class' : (indent > 0 ? 'method' : 'function'), line: i + 1, endLine: end + 1, exported: indent === 0 && !m[4].startsWith('_'), async: !!m[2], params: isClass ? [] : paramsOf(m[5]).filter((p) => p !== 'self' && p !== 'cls') });
  });
  return symbols;
}

function analyzeBraceLang(content, starts, language) {
  const symbols = [];
  const patterns = {
    php: [
      { re: /^[ \t]*(?:abstract\s+|final\s+)?class\s+(\w+)/gm, type: 'class' },
      { re: /^[ \t]*(?:public|protected|private|static|\s)*function\s+(\w+)\s*\(([^)]*)\)/gm, type: 'function' },
    ],
    go: [
      { re: /^func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(([^)]*)\)/gm, type: 'function' },
      { re: /^type\s+(\w+)\s+struct/gm, type: 'class' },
    ],
    java: [
      { re: /^[ \t]*(?:public\s+|abstract\s+|final\s+)*(?:class|interface|enum)\s+(\w+)/gm, type: 'class' },
      { re: /^[ \t]+(?:public|protected|private)\s+(?:static\s+)?(?:[\w<>\[\],?]+\s+)(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w, ]+)?\{/gm, type: 'method' },
    ],
    csharp: [
      { re: /^[ \t]*(?:public\s+|internal\s+|abstract\s+|sealed\s+|static\s+)*(?:class|interface|record)\s+(\w+)/gm, type: 'class' },
      { re: /^[ \t]+(?:public|protected|private|internal)\s+(?:static\s+)?(?:async\s+)?(?:[\w<>\[\],?]+\s+)(\w+)\s*\(([^)]*)\)\s*\{?/gm, type: 'method' },
    ],
    ruby: [
      { re: /^[ \t]*class\s+(\w+)/gm, type: 'class' },
      { re: /^[ \t]*def\s+(?:self\.)?(\w+[?!]?)\s*(?:\(([^)]*)\))?/gm, type: 'function' },
    ],
  };
  for (const { re, type } of patterns[language] || []) {
    let m;
    while ((m = re.exec(content))) {
      const line = lineAt(starts, m.index);
      let endLine = line;
      const open = content.indexOf('{', m.index);
      if (open !== -1 && open - m.index < 400 && language !== 'ruby') endLine = lineAt(starts, matchBrace(content, open));
      symbols.push({ name: m[1], type, line, endLine, exported: !/private|protected/.test(m[0]), params: paramsOf(m[2]) });
    }
  }
  return symbols;
}

function analyzeSymbols(content, language) {
  const starts = lineIndex(content);
  let symbols = [];
  if (JS_LANGS.has(language)) symbols = analyzeJs(content, starts, language);
  else if (language === 'python') symbols = analyzePython(content, starts);
  else symbols = analyzeBraceLang(content, starts, language);
  // De-duplicate (function + arrow regexes can both match `const x = function`).
  const seen = new Set();
  symbols = symbols.filter((s) => { const k = `${s.type}:${s.name}:${s.line}`; if (seen.has(k)) return false; seen.add(k); return true; });
  symbols.sort((a, b) => a.line - b.line);
  return symbols;
}

module.exports = { analyzeSymbols, JS_LANGS };
