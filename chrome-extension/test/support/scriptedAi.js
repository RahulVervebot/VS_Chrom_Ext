// Stand-in for an AI website: reads the CONTEXT_JSON the prompt builder embedded and answers like a well-behaved (and
// slightly overconfident) model: real evidence from the provided symbols, plus a fabricated claim VS Code must reject.
import { CONTEXT_BEGIN, CONTEXT_END } from '../../src/ai/contextBuilder.js';
import { PART_RE } from '../../src/ai/multipart.js';

export function contextOf(prompt) {
  const a = prompt.indexOf(CONTEXT_BEGIN); const b = prompt.indexOf(CONTEXT_END);
  if (a < 0 || b < 0) return null;
  return JSON.parse(prompt.slice(a + CONTEXT_BEGIN.length, b));
}

export function answerFor(prompt, { fabricate = true } = {}) {
  const ctx = contextOf(prompt);
  const sf = ctx.staticFacts;
  const files = ctx.filesInThisBatch.map((f) => {
    const sym = sf.symbols.find((s) => s.file === f.path && ['function', 'method', 'component'].includes(s.type));
    const claims = [];
    if (sym) claims.push({ claim: `${f.path} defines ${sym.name}`, status: 'VERIFIED', subject: sym.name, evidence: [{ file: f.path, symbol: sym.name, lineStart: sym.line, lineEnd: sym.endLine }] });
    if (fabricate && sym) claims.push({ claim: 'the orders table has a payment_status column', status: 'VERIFIED', subject: 'payment_status', evidence: [{ file: f.path, symbol: sym.name, lineStart: sym.line, lineEnd: sym.endLine }] });
    return { path: f.path, purpose: `Handles ${f.path.split('/').pop()}`, role: 'unknown', claims, unknowns: [] };
  });
  const out = { analysisType: ctx.analysis.mode, files, unknowns: [] };
  if (sf.workflows && sf.workflows.length) out.workflows = sf.workflows.map((w) => ({ id: w.id, name: w.name, purpose: `Implements ${w.name}`, steps: w.steps.filter((s) => s.file).slice(0, 6).map((s) => ({ kind: s.kind, file: s.file, symbol: s.symbol, description: `${s.kind} step`, status: 'VERIFIED' })), claims: [] }));
  if (sf.database && sf.database.entities && sf.database.entities.length) out.database = { entities: sf.database.entities.map((e) => ({ name: e.name, purpose: `${e.name} records`, fields: [...(e.fields || []).slice(0, 3).map((f) => ({ name: f.name, type: f.type })), ...(fabricate && e.file ? [{ name: 'payment_status', type: 'varchar', evidence: [{ file: e.file, lineStart: 1, lineEnd: 1 }] }] : [])], claims: [] })), relationships: [] };
  if (ctx.analysis.intent === 'CHANGE_PLAN') {
    const f = ctx.filesInThisBatch.find((x) => x.path.endsWith('orderService.js') && x.relation === 'selected');
    if (f) out.changeProposal = { title: 'Reject negative quantities', rationale: 'Validation gap in validateOrder', changes: [{ path: f.path, operation: 'MODIFY', edits: [{ find: "throw new Error('Cart is empty');", replace: "throw new Error('Cart is empty');\n  if (items.some((i) => i.qty < 0)) throw new Error('Negative quantity');" }] }] };
  }
  return out;
}

// what a reader makes of the inner text of parts 1..N: a block cut by "continues in the next message" is glued to its continuation, other parts are separated by a blank line
export function reassemble(partBuffer) {
  let full = '';
  for (const part of partBuffer) {
    const cont = full.endsWith('\u0000CONT');
    if (cont) full = full.slice(0, -5);
    const body = part.replace(/^\[… continued from the previous message …\]\n/, '');
    const endsCont = /\n\[… continues in the next message …\]$/.test(body);
    full += (full && !cont ? '\n\n' : '') + body.replace(/\n\[… continues in the next message …\]$/, '') + (endsCont ? '\u0000CONT' : '');
  }
  return full.replace(/\u0000CONT/g, '');
}
export const partInner = (message) => { const at = message.indexOf('=== BEGIN PART'); return message.slice(at + message.slice(at).indexOf('\n') + 1, message.lastIndexOf('=== END PART')).replace(/\n$/, ''); };

export const asReply = (obj) => { const json = JSON.stringify(obj); return { ok: true, text: '```json\n' + json + '\n```', codeBlocks: [json], provider: 'chatgpt', model: 'scripted-1' }; };

// Configurable fake `ai` for the orchestrator. `script` may override behaviour per call (return null to fall through).
export function scriptedAi({ script } = {}) {
  const calls = [];
  let lastContextPrompt = null; // a real chat remembers the earlier message when it receives a follow-up correction
  let partBuffer = []; // a real chat also remembers earlier parts of a split message
  return {
    calls, current: 'chatgpt',
    async provider() { return 'chatgpt'; },
    cancel() {},
    async run(prompt, opts) {
      calls.push(prompt);
      if (opts && opts.onProgress) opts.onProgress({ stage: 'WAITING_AI' });
      const pm = PART_RE.exec(prompt);
      if (pm) {
        // the script may refuse long messages like a chat box that never enables its send button
        if (script) { const r = await script(prompt, calls.length, calls); if (r) return r; }
        const [, i, n] = pm;
        const inner = partInner(prompt);
        if (Number(i) === 1) partBuffer = [];
        partBuffer.push(inner);
        if (Number(i) < Number(n)) return { ok: true, text: `RECEIVED ${i}/${n}`, codeBlocks: [], provider: 'chatgpt', model: 'scripted-1' };
        const full = reassemble(partBuffer);
        lastContextPrompt = full;
        return asReply(answerFor(full));
      }
      if (prompt.includes(CONTEXT_BEGIN)) lastContextPrompt = prompt;
      if (script) { const r = await script(prompt, calls.length, calls); if (r) return r; }
      return asReply(answerFor(prompt.includes(CONTEXT_BEGIN) ? prompt : lastContextPrompt));
    },
  };
}
