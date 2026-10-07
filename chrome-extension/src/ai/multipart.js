// Sending a prompt that is too large for one chat message as several messages ("parts").
// Every part says it is part i of N, lists the files it carries and the files still to come, and tells the AI not to answer until the
// final part. Only the final part asks for the answer. Used proactively (prompt over the size limit) and as the retry when the chat
// box refuses a big message (send button never enables, text does not land).
export const MIN_PART_CHARS = 2500;
const OVERHEAD = 1400; // room for the part header and footer

const partHeader = (i, n) => `[PART ${i} of ${n}${i === n ? ' — FINAL' : ''}]`;
export const PART_RE = /^\[PART (\d+) of (\d+)( — FINAL)?\]/;

// text -> pieces of at most `max` chars, cut at line boundaries (a single over-long line is cut hard)
export function splitText(text, max) {
  if (text.length <= max) return [text];
  const out = [];
  let cur = '';
  for (const line of text.split('\n')) {
    let l = line;
    while (l.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(l.slice(0, max)); l = l.slice(max); }
    if (cur.length + l.length + 1 > max && cur) { out.push(cur); cur = l; } else cur = cur ? `${cur}\n${l}` : l;
  }
  if (cur) out.push(cur);
  return out;
}

// blocks: [{ text, label? }] in prompt order. Returns [{ index, total, text, labels }]
export function planParts(blocks, maxChars, { restart = false, what = 'request' } = {}) {
  const budget = Math.max(MIN_PART_CHARS - OVERHEAD, maxChars - OVERHEAD);
  const pieces = [];
  for (const b of blocks) {
    if (!b.text) continue;
    const segs = splitText(b.text, budget);
    segs.forEach((s, k) => {
      const more = segs.length > 1;
      const text = `${more && k > 0 ? '[… continued from the previous message …]\n' : ''}${s}${more && k < segs.length - 1 ? '\n[… continues in the next message …]' : ''}`;
      pieces.push({ text, label: b.label ? `${b.label}${more ? ` (piece ${k + 1} of ${segs.length})` : ''}` : null });
    });
  }
  const groups = [];
  let cur = { texts: [], labels: [], size: 0 };
  for (const p of pieces) {
    if (cur.texts.length && cur.size + p.text.length + 2 > budget) { groups.push(cur); cur = { texts: [], labels: [], size: 0 }; }
    cur.texts.push(p.text); if (p.label) cur.labels.push(p.label); cur.size += p.text.length + 2;
  }
  if (cur.texts.length) groups.push(cur);
  const n = groups.length;
  const allLabels = groups.map((g) => g.labels);
  return groups.map((g, idx) => {
    const i = idx + 1;
    const coming = allLabels.slice(idx + 1).flat();
    const lines = [
      partHeader(i, n),
      ...(restart && i === 1 ? ['RESTART: ignore every earlier message in this chat about parts of this request. The request below starts over from part 1.'] : []),
      `MULTI-PART REQUEST: this ${what} is too large for one message, so it is sent as ${n} messages (parts). Parts 1 to ${n}, in order, together form ONE prompt.`,
      i < n ? `Do NOT analyze, summarize or answer yet. When you have read this part, reply with exactly: RECEIVED ${i}/${n}` : 'This is the last part.',
      ...(g.labels.length ? [`Files in this part: ${g.labels.join(', ')}`] : []),
      ...(i < n && coming.length ? [`The next file(s) will be sent in the next message(s): ${coming.slice(0, 40).join(', ')}${coming.length > 40 ? ', …' : ''}`] : []),
      `=== BEGIN PART ${i} OF ${n} ===`,
      g.texts.join('\n\n'),
      `=== END PART ${i} OF ${n} ===`,
      i < n
        ? `[END OF PART ${i} OF ${n}] More follows in the next message (part ${i + 1} of ${n}). Reply with exactly "RECEIVED ${i}/${n}" and nothing else.`
        : `[END OF PART ${n} OF ${n} — FINAL] That was the last part: parts 1 to ${n} are now complete. Treat them as one single prompt and respond now exactly as that prompt instructs (for an analysis: the single JSON object in one \`\`\`json code block). Do not reply with RECEIVED.`,
    ];
    return { index: i, total: n, text: lines.join('\n'), labels: g.labels };
  });
}

// The chat box refused the message: the send button never enabled or the text did not land. Not a changed website.
export const isSendFailure = (res) => !!res && !res.ok && res.code === 'UI_CHANGED' && /send button|entered reliably|could not be entered|stayed disabled|message was not sent/i.test(res.message || '');

// Paragraph blocks for a plain-text prompt (documentation / comparison / blueprint jobs)
export const blocksFromText = (text) => text.split(/\n{2,}/).map((t) => ({ text: t }));
