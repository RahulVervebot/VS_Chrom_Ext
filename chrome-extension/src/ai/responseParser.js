// Extracts and validates the JSON an AI answered with. Never accepts free text as knowledge.
import { validateBatchKnowledge } from '../knowledge/schemaValidator.js';

// Finds balanced {...} objects in text (string-aware). Returns candidate substrings, largest first.
export function findJsonObjects(text) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue;
    let depth = 0; let quote = false; let esc = false;
    for (let j = i; j < text.length; j++) {
      const c = text[j];
      if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') quote = false; continue; }
      if (c === '"') quote = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { out.push(text.slice(i, j + 1)); i = j; break; } }
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

// True if the text looks cut off mid-JSON (an opening brace was never closed).
export function looksTruncated(text) {
  const start = text.indexOf('{');
  if (start === -1) return false;
  let depth = 0; let quote = false; let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') quote = false; continue; }
    if (c === '"') quote = true; else if (c === '{') depth++; else if (c === '}') depth--;
  }
  return depth > 0;
}

// input: { text, codeBlocks? } as produced by an adapter. Returns { ok, knowledge, errors, truncated }.
export function parseAiResponse(input) {
  const text = typeof input === 'string' ? input : input.text || '';
  const blocks = typeof input === 'string' ? [] : input.codeBlocks || [];
  const candidates = [];
  for (const b of blocks) candidates.push(...findJsonObjects(b));
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(...findJsonObjects(m[1]));
  candidates.push(...findJsonObjects(text));
  const errors = [];
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    let obj;
    try { obj = JSON.parse(c); } catch (e) { errors.push(`JSON syntax: ${e.message}`); continue; }
    const v = validateBatchKnowledge(obj);
    if (v.valid) return { ok: true, knowledge: obj, errors: [], truncated: false };
    errors.push(...v.errors);
  }
  const truncated = looksTruncated(blocks.join('\n') || text) || looksTruncated(text);
  if (!candidates.length) errors.push(truncated ? 'the JSON was cut off before it was complete' : 'no JSON object found in the response');
  return { ok: false, knowledge: null, errors: [...new Set(errors)].slice(0, 12), truncated };
}

// Parses non-analysis structured answers (comparison, blueprint): any JSON object, validated by the caller.
export function parseAnyJson(input) {
  const text = typeof input === 'string' ? input : input.text || '';
  const blocks = typeof input === 'string' ? [] : input.codeBlocks || [];
  const cands = [...blocks.flatMap(findJsonObjects), ...findJsonObjects(text)];
  for (const c of cands) { try { return { ok: true, value: JSON.parse(c) }; } catch { /* try next */ } }
  return { ok: false, value: null, truncated: looksTruncated(text), errors: [looksTruncated(text) ? 'the JSON was cut off before it was complete' : 'no valid JSON object found'] };
}
