import test from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { ChatGPTAdapter } from '../src/ai/chatgptAdapter.js';
import { ClaudeAdapter } from '../src/ai/claudeAdapter.js';
import { GeminiAdapter } from '../src/ai/geminiAdapter.js';
import { GenericAIAdapter } from '../src/ai/genericAdapter.js';

// Minimal pages that mimic each provider's structure (as encoded in the adapters' selectors).
const PAGES = {
  chatgpt: { url: 'https://chatgpt.com/', Adapter: ChatGPTAdapter, html: '<main><div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button">Send</button><div id="chat"></div></main>', assistant: (t) => `<div data-message-author-role="assistant"><div class="markdown">${t}</div></div>`, stop: '<button data-testid="stop-button">Stop</button>' },
  claude: { url: 'https://claude.ai/new', Adapter: ClaudeAdapter, html: '<fieldset><div contenteditable="true" class="ProseMirror"></div><button aria-label="Send message">Send</button></fieldset><div id="chat"></div>', assistant: (t) => `<div data-is-streaming="false"><p>${t}</p></div>`, stop: '<button aria-label="Stop response">Stop</button>' },
  gemini: { url: 'https://gemini.google.com/app', Adapter: GeminiAdapter, html: '<rich-textarea><div class="ql-editor" contenteditable="true"></div></rich-textarea><button class="send-button">Send</button><div id="chat"></div>', assistant: (t) => `<model-response><div class="markdown">${t}</div></model-response>`, stop: '<button aria-label="Stop response">Stop</button>' },
};

function boot(name, { html, breakInput = false, swallow = false } = {}) {
  const p = PAGES[name];
  const dom = new JSDOM(`<!DOCTYPE html><body>${html || p.html}</body>`, { url: p.url, pretendToBeVisual: true });
  const { window } = dom;
  window.__aipiAssumeVisible = true;
  const a = new p.Adapter(window.document, window);
  const log = { sent: [], typed: '' };
  const input = window.document.querySelector('[contenteditable], textarea');
  if (input && swallow) input.addEventListener('input', () => {});
  const btn = window.document.querySelector('button:not([aria-label*="Stop"]):not([data-testid="stop-button"])');
  if (btn) btn.addEventListener('click', () => { log.sent.push(input ? input.textContent : ''); });
  return { dom, window, a, log, page: p, input, btn };
}

// Simulates the site answering: shows the stop button while "streaming", then the assistant message.
function answerAfter(env, text, { streamMs = 60 } = {}) {
  env.btn.addEventListener('click', () => {
    const chat = env.window.document.getElementById('chat');
    chat.insertAdjacentHTML('beforeend', env.page.stop);
    setTimeout(() => { chat.insertAdjacentHTML('beforeend', env.page.assistant(text)); }, streamMs / 2);
    setTimeout(() => { chat.querySelectorAll('button').forEach((b) => b.remove()); }, streamMs);
  });
}

for (const name of Object.keys(PAGES)) {
  test(`${name}: detect, capabilities and interface self-test`, () => {
    const { a } = boot(name);
    assert.strictEqual(a.detect(), true);
    assert.strictEqual(a.getCapabilities().provider, name);
    assert.strictEqual(a.getCapabilities().contextLimit, 'unknown', 'limits are never assumed');
    assert.ok(a.getCapabilities().adapterVersion);
    const t = a.selfTest();
    assert.strictEqual(t.ok, true, JSON.stringify(t));
    assert.ok(a.getInputBox());
  });

  test(`${name}: full cycle enters the prompt, submits, waits for the stream to finish and reads the answer`, async () => {
    const env = boot(name);
    answerAfter(env, '```json\n{"files": []}\n```');
    const prompt = 'Analyze this.\n' + 'x'.repeat(2000);
    const res = await env.a.run(prompt, { timeoutMs: 5000, stableMs: 150 });
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    assert.match(res.text, /"files"/);
    assert.strictEqual(env.log.sent.length, 1);
    assert.ok(env.log.sent[0].startsWith('Analyze this.'), 'the exact prompt was in the box when sent');
    assert.ok(env.log.sent[0].length >= prompt.length * 0.97);
  });

  test(`${name}: when the message box cannot be found it STOPS and sends nothing`, async () => {
    const p = PAGES[name];
    const env = boot(name, { html: p.html.replace(/contenteditable="true"/g, 'data-changed="1"') });
    const res = await env.a.run('secret project context', { timeoutMs: 1000, stableMs: 100 });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.code, 'UI_CHANGED');
    assert.match(res.message, /interface|changed|message box/i);
    assert.strictEqual(env.log.sent.length, 0, 'nothing was submitted');
  });
}

test('an editor that swallows the text is detected and nothing is submitted', async () => {
  const env = boot('chatgpt');
  // Simulate an editor that rewrites content on input (e.g. a framework that clears the field).
  env.input.addEventListener('input', () => { env.input.textContent = ''; });
  const res = await env.a.run('do not send half a prompt '.repeat(50), { timeoutMs: 1000, stableMs: 100 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, 'UI_CHANGED');
  assert.match(res.message, /Nothing was sent/);
  assert.strictEqual(env.log.sent.length, 0);
});

test('limit, login and captcha states are reported instead of sending', async () => {
  let env = boot('chatgpt', { html: PAGES.chatgpt.html + '<div role="alert">You\'ve reached the current usage cap. Try again later.</div>' });
  let res = await env.a.run('x', { timeoutMs: 500, stableMs: 100 });
  assert.strictEqual(res.code, 'LIMIT');
  assert.strictEqual(env.log.sent.length, 0);

  env = boot('chatgpt', { html: '<a href="/auth/login">Log in</a>' });
  res = await env.a.run('x', { timeoutMs: 500 });
  assert.strictEqual(res.code, 'LOGIN');

  env = boot('claude', { html: PAGES.claude.html + '<iframe src="https://challenges.cloudflare.com/x"></iframe>' });
  res = await env.a.run('x', { timeoutMs: 500 });
  assert.strictEqual(res.code, 'CAPTCHA');
});

test('an error that appears while waiting is surfaced; a silent site times out with the partial text', async () => {
  let env = boot('chatgpt');
  env.btn.addEventListener('click', () => setTimeout(() => env.window.document.body.insertAdjacentHTML('beforeend', '<div role="alert">Something went wrong. Please try again.</div>'), 80));
  let res = await env.a.run('hello', { timeoutMs: 3000, stableMs: 100 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, 'NETWORK');

  env = boot('gemini');
  env.btn.addEventListener('click', () => { env.input.textContent = ''; }); // the site took the message (box emptied) but never answers
  res = await env.a.run('hello', { timeoutMs: 700, stableMs: 100 });
  assert.strictEqual(res.code, 'TIMEOUT');
});

test('a click that does nothing is reported with a description of the page, instead of waiting for a reply that will never come', async () => {
  const env = boot('gemini'); // the button exists but the site ignores the click: the box keeps the text
  const res = await env.a.run('hello world', { timeoutMs: 700, stableMs: 100 });
  assert.strictEqual(res.ok, false); assert.strictEqual(res.code, 'UI_CHANGED');
  assert.match(res.message, /clicked but the message was not sent/);
  assert.match(res.message, /Page state: message box found, holds 11 of 11 characters; send button found/);
});

test('a renamed send button is still found when it is labelled "send" inside the same composer; unrelated buttons are never clicked', async () => {
  const env = boot('chatgpt', { html: '<main><form><div id="prompt-textarea" contenteditable="true"></div><button aria-label="Attach files">+</button><button aria-label="Send now" data-x="1">&gt;</button></form><button aria-label="Send feedback elsewhere">fb</button><div id="chat"></div></main>' });
  const clicked = [];
  env.window.document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { clicked.push(b.getAttribute('aria-label')); if (/Send now/.test(b.getAttribute('aria-label'))) env.input.textContent = ''; }));
  const res = await env.a.run('hello world', { timeoutMs: 500, stableMs: 100 });
  assert.deepStrictEqual(clicked, ['Send now'], 'only the send button of the composer was clicked');
  assert.strictEqual(res.code, 'TIMEOUT', 'it was sent (box emptied); only the reply is missing');
});

test('when there is no send button at all the text is verified in the box and Enter is pressed; if that does nothing the page state is reported', async () => {
  let env = boot('chatgpt', { html: '<main><div id="prompt-textarea" contenteditable="true"></div><div id="chat"></div></main>' });
  const keys = [];
  env.input.addEventListener('keydown', (e) => { keys.push(e.key); if (e.key === 'Enter') env.input.textContent = ''; });
  let res = await env.a.run('hello world', { timeoutMs: 500, stableMs: 100 });
  assert.deepStrictEqual(keys, ['Enter']); assert.strictEqual(res.code, 'TIMEOUT', 'Enter sent it');
  env = boot('chatgpt', { html: '<main><div id="prompt-textarea" contenteditable="true"></div><div id="chat"></div></main>' });
  res = await env.a.run('hello world', { timeoutMs: 500, stableMs: 100 });
  assert.strictEqual(res.code, 'UI_CHANGED');
  assert.match(res.message, /send button was not found or stayed disabled/); assert.match(res.message, /send button not found/);
});

test('old answers are not mistaken for the new one', async () => {
  const env = boot('chatgpt');
  env.window.document.getElementById('chat').insertAdjacentHTML('beforeend', PAGES.chatgpt.assistant('OLD ANSWER'));
  answerAfter(env, 'NEW ANSWER');
  const res = await env.a.run('q', { timeoutMs: 5000, stableMs: 150 });
  assert.strictEqual(res.ok, true);
  assert.match(res.text, /NEW ANSWER/);
  assert.doesNotMatch(res.text, /OLD ANSWER/);
});

test('code blocks are exposed separately so UI chrome around them is ignored', async () => {
  const env = boot('chatgpt');
  answerAfter(env, 'json<button>Copy code</button><pre><code>{"files":[]}</code></pre>');
  const res = await env.a.run('q', { timeoutMs: 5000, stableMs: 150 });
  assert.deepStrictEqual(res.codeBlocks, ['{"files":[]}']);
});

test('adapters do not match other sites; generic adapter only describes what it found', () => {
  const env = boot('claude');
  const wrong = new ChatGPTAdapter(env.window.document, env.window);
  assert.strictEqual(wrong.detect(), false);
  const dom = new JSDOM('<textarea></textarea><button type="submit">Send</button>', { url: 'https://chat.example.com/' });
  dom.window.__aipiAssumeVisible = true;
  const g = new GenericAIAdapter(dom.window.document, dom.window);
  assert.strictEqual(g.detect(), true);
  assert.deepStrictEqual(g.describe(), { input: 'textarea', assistantMessages: 0 });
});

test('a run cancelled while waiting never sends: the message is not submitted', async () => {
  const env = boot('chatgpt');
  let cancel = false;
  env.input.addEventListener('input', () => { cancel = true; }); // the worker went away while the text was being entered
  const res = await env.a.run('hello world', { timeoutMs: 500, stableMs: 100, isCancelled: () => cancel });
  assert.strictEqual(res.code, 'CANCELLED');
  assert.strictEqual(env.log.sent.length, 0, 'the send button was not clicked');
});

// A chat page that, like ChatGPT in a long conversation, keeps only the latest turns in the page, so the number of answers stays the same.
function virtualChat(window, reply, keepTurns = 1) {
  const doc = window.document;
  const input = doc.getElementById('prompt-textarea');
  const chat = doc.getElementById('chat');
  doc.querySelector('[data-testid="send-button"]').addEventListener('click', () => {
    const text = input.textContent; input.textContent = '';
    const turn = doc.createElement('div'); turn.className = 'turn';
    turn.innerHTML = '<div data-message-author-role="user"></div>'; turn.firstChild.textContent = text;
    chat.appendChild(turn);
    while (chat.querySelectorAll('.turn').length > keepTurns) chat.querySelector('.turn').remove();
    setTimeout(() => { const a = doc.createElement('div'); a.setAttribute('data-message-author-role', 'assistant'); a.textContent = reply(text); turn.appendChild(a); }, 60);
  });
}

test('an answer word-for-word the same as the previous one (RECEIVED 1/4 after a retry) is still recognised as the new answer', async () => {
  const env = boot('chatgpt');
  const chat = env.window.document.getElementById('chat');
  chat.innerHTML = '<div class="turn"><div data-message-author-role="user">[PART 1 of 4] old attempt</div><div data-message-author-role="assistant">RECEIVED 1/4</div></div>';
  virtualChat(env.window, (t) => `RECEIVED ${/PART (\d+) of (\d+)/.exec(t).slice(1).join('/')}`);
  const res = await env.a.run('[PART 1 of 4]\nRESTART: ignore every earlier message…\nfile content here', { timeoutMs: 3000, stableMs: 150 });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.text, 'RECEIVED 1/4');
  const next = await env.a.run('[PART 2 of 4]\nmore files', { timeoutMs: 3000, stableMs: 150 });
  assert.strictEqual(next.ok, true); assert.strictEqual(next.text, 'RECEIVED 2/4', 'and the next part goes out and is answered');
});

test('when no answer comes, the timeout says what the page looks like', async () => {
  const env = boot('chatgpt');
  env.btn.addEventListener('click', () => { env.input.textContent = ''; });
  const res = await env.a.run('hello', { timeoutMs: 600, stableMs: 100 });
  assert.strictEqual(res.code, 'TIMEOUT');
  assert.match(res.message, /Conversation state: 0 answer\(s\) on the page \(0 before sending\)/);
});

test('the end of one part never cancels the next part (cancellation belongs to one request only)', async () => {
  const onConnect = [];
  globalThis.window = globalThis.window || {};
  delete globalThis.window.__aipiHandlers;
  globalThis.chrome = { runtime: { onMessage: { addListener: () => {}, removeListener: () => {} }, onConnect: { addListener: (f) => onConnect.push(f), removeListener: (f) => { const i = onConnect.indexOf(f); if (i >= 0) onConnect.splice(i, 1); } } } };
  const { installContentRuntime } = await import('../src/content/runtime.js');
  const seen = [];
  installContentRuntime({ id: 'x', run: async (prompt, { isCancelled }) => { await new Promise((r) => setTimeout(r, 80)); seen.push([prompt, isCancelled()]); return { ok: !isCancelled(), text: 'RECEIVED' }; } });
  const mkPort = () => { const p = { name: 'aipi-run', msg: [], disc: [], out: [], onMessage: { addListener: (f) => p.msg.push(f) }, onDisconnect: { addListener: (f) => p.disc.push(f) }, postMessage: (m) => p.out.push(m) }; onConnect.forEach((f) => f(p)); return p; };
  const p1 = mkPort();
  p1.msg.forEach((f) => f({ type: 'RUN', id: 'a', prompt: 'part 1' }));
  await new Promise((r) => setTimeout(r, 120));
  const p2 = mkPort();
  p2.msg.forEach((f) => f({ type: 'RUN', id: 'b', prompt: 'part 2' }));
  p1.disc.forEach((f) => f()); // the worker closes part 1's channel AFTER part 2 started (the race that stopped the analysis)
  await new Promise((r) => setTimeout(r, 150));
  assert.deepStrictEqual(seen, [['part 1', false], ['part 2', false]], 'part 2 was not cancelled');
  assert.ok(p2.out.some((m) => m.type === 'RESULT' && m.ok === true));
  delete globalThis.chrome;
});

test('"The AI has answered — continue": when the page never signals the end of the answer, the user can take what is shown', async () => {
  const env = boot('chatgpt');
  let accept = false;
  env.btn.addEventListener('click', () => {
    env.input.textContent = '';
    const chat = env.window.document.getElementById('chat');
    chat.insertAdjacentHTML('beforeend', PAGES.chatgpt.stop); // a stop button that never goes away
    setTimeout(() => chat.insertAdjacentHTML('beforeend', PAGES.chatgpt.assistant('RECEIVED 1/3')), 50);
  });
  setTimeout(() => { accept = true; }, 600);
  const live = [];
  const t = setInterval(() => { const l = env.a.liveText(); if (l) live.push(l); }, 100);
  const res = await env.a.run('[PART 1 of 3]\nx', { timeoutMs: 5000, stableMs: 100, acceptNow: () => accept });
  clearInterval(t);
  assert.strictEqual(res.ok, true); assert.strictEqual(res.acceptedByUser, true); assert.match(res.text, /RECEIVED 1\/3/);
  assert.ok(live.some((l) => /reply still being generated: yes/.test(l)), 'the panel was told why it was still waiting');
});

// ChatGPT as in the user's screenshot (a chat inside a Project): no data-message-author-role / data-turn labels anywhere.
function unlabelledChat(window, { reply, before = '' } = {}) {
  const doc = window.document;
  doc.body.innerHTML = `<main><div id="thread">${before}</div><div id="composer"><div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button">Send</button></div><div class="footer">ChatGPT can make mistakes. Check important info.</div></main>`;
  const input = doc.getElementById('prompt-textarea');
  doc.querySelector('[data-testid="send-button"]').addEventListener('click', () => {
    const text = input.textContent; input.textContent = '';
    const turn = doc.createElement('div'); turn.className = 'turn';
    turn.innerHTML = '<h5 class="sr-only">You said:</h5><div class="bubble"></div><button>Show less</button><div class="actions"><button aria-label="Copy"></button></div>';
    turn.querySelector('.bubble').innerHTML = text.split('\n').map((l) => `<p></p>`).join('');
    [...turn.querySelectorAll('.bubble p')].forEach((p, i) => { p.textContent = text.split('\n')[i]; });
    doc.getElementById('thread').appendChild(turn);
    setTimeout(() => {
      const a = doc.createElement('div'); a.className = 'turn';
      a.innerHTML = '<h6 class="sr-only">ChatGPT said:</h6><div class="msg"><p></p></div><div class="actions"><button aria-label="Copy"></button><button aria-label="Good response"></button></div>';
      a.querySelector('p').textContent = reply(text);
      doc.getElementById('thread').appendChild(a);
    }, 60);
  });
}

test('ChatGPT without message labels (Project chats): the reply is found right after the message that was sent, and the next part goes out', async () => {
  const env = boot('chatgpt');
  unlabelledChat(env.window, { reply: (t) => `RECEIVED ${/PART (\d+) of (\d+)/.exec(t).slice(1).join('/')}` });
  const a = new ChatGPTAdapter(env.window.document, env.window);
  const part = (i) => `[PART ${i} of 3]\nMULTI-PART REQUEST: …\n=== BEGIN PART ${i} OF 3 ===\nfile text\n=== END PART ${i} OF 3 ===\n[END OF PART ${i} OF 3] Reply with exactly "RECEIVED ${i}/3" and nothing else.`;
  const r1 = await a.run(part(1), { timeoutMs: 3000, stableMs: 150 });
  assert.strictEqual(r1.ok, true, JSON.stringify(r1));
  assert.match(r1.text, /RECEIVED 1\/3/, 'the reply was read even though the prompt itself contains the words "RECEIVED 1/3"');
  assert.doesNotMatch(r1.text, /MULTI-PART|can make mistakes/, 'neither our own message nor the page footer was taken as the reply');
  const r2 = await a.run(part(2), { timeoutMs: 3000, stableMs: 150 });
  assert.match(r2.text, /RECEIVED 2\/3/);
  // the same part sent again after a retry: the earlier identical copy and its identical answer are not mistaken for the new ones
  const r2b = await a.run(part(2), { timeoutMs: 3000, stableMs: 150 });
  assert.strictEqual(r2b.ok, true); assert.match(r2b.text, /RECEIVED 2\/3/);
  assert.strictEqual(env.window.document.querySelectorAll('.turn').length, 6);
});

test('without labels and without a reply, the footer under the message box is never taken as the answer', async () => {
  const env = boot('chatgpt');
  unlabelledChat(env.window, { reply: () => '' });
  const doc = env.window.document;
  doc.querySelector('[data-testid="send-button"]').addEventListener('click', () => { setTimeout(() => doc.querySelectorAll('.turn').forEach((t) => { if (!t.querySelector('.bubble')) t.remove(); }), 70); });
  const a = new ChatGPTAdapter(doc, env.window);
  const r = await a.run('[PART 1 of 3]\nhello', { timeoutMs: 700, stableMs: 100 });
  assert.strictEqual(r.code, 'TIMEOUT');
  assert.match(r.message, /Conversation state/);
});

test('page diagnostics describe the layout without any message text', async () => {
  const env = boot('chatgpt');
  unlabelledChat(env.window, { reply: () => 'RECEIVED 1/3' });
  const a = new ChatGPTAdapter(env.window.document, env.window);
  await a.run('[PART 1 of 3]\nsecret-looking content 12345', { timeoutMs: 3000, stableMs: 150 });
  const d = a.pageDiagnostics();
  assert.match(d, /adapter 2026\.10-6/);
  assert.match(d, /message found: yes \(by its text\); reply found after it: yes/);
  assert.match(d, /<<PROMPT>>/); assert.match(d, /<<RECEIVED>>/);
  assert.doesNotMatch(d, /secret-looking content|12345/, 'no message text leaks into the diagnostics');
});

test('after the extension is reloaded, the tab helper always answers, and a live tab never gets two sets of listeners', async () => {
  globalThis.window = globalThis.window || {};
  const event = () => { const l = []; return { l, addListener: (f) => l.push(f), removeListener: (f) => { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }; };
  const fakeChrome = () => ({ runtime: { id: 'ext', onMessage: event(), onConnect: event() } });
  const { installContentRuntime } = await import('../src/content/runtime.js');
  const ping = (c) => new Promise((res) => { const f = c.runtime.onMessage.l[0]; if (!f) return res(null); f({ target: 'content', type: 'PING' }, {}, res); });
  const adapter = { id: 'chatgpt', adapterVersion: 't', detect: () => true };
  delete globalThis.window.__aipiHandlers;
  // same extension instance: the declared content script and an injected copy both run
  globalThis.chrome = fakeChrome();
  installContentRuntime(adapter); installContentRuntime(adapter);
  assert.strictEqual(globalThis.chrome.runtime.onMessage.l.length, 1, 'no duplicate listeners');
  assert.strictEqual(globalThis.chrome.runtime.onConnect.l.length, 1);
  assert.strictEqual((await ping(globalThis.chrome)).ok, true);
  // extension reloaded, scripts share the page (the copy in the page looks alive): the new copy still installs and answers
  installContentRuntime(adapter);
  assert.strictEqual((await ping(globalThis.chrome)).ok, true);
  // extension reloaded with a new runtime object: the old one is gone, the new one gets the listeners
  globalThis.chrome.runtime.id = undefined;
  globalThis.chrome = fakeChrome();
  installContentRuntime(adapter);
  assert.strictEqual((await ping(globalThis.chrome)).ok, true, 'the reloaded extension reaches the tab');
  delete globalThis.chrome; delete globalThis.window.__aipiHandlers;
});

// The ChatGPT layout from the user's page diagnostics (October 2026, chat inside a Project): no data-message-author-role; user bubbles
// are [data-user-message-bubble], answers are [data-markdown-text-style="assistant-message"], turns carry data-talvt-turn-state, and
// the conversation region is NOT inside the page's <main>.
function chatgpt2026(window, { reply, streamMs = 120 }) {
  const doc = window.document;
  doc.body.innerHTML = `<main><nav>sidebar</nav></main>
  <div class="thread-scroll-container" role="region" aria-label="Conversation"><div id="turns"></div></div>
  <div data-thread-scroll-footer="true"><form data-chatgpt-composer=""><div class="ProseMirror" contenteditable="true" role="textbox" aria-label="Ask ChatGPT" data-virtualkeyboard="true"></div><button data-testid="send-button" aria-label="Send prompt">↑</button></form><div>ChatGPT can make mistakes. Check important info.</div></div>`;
  const input = doc.querySelector('.ProseMirror');
  doc.querySelector('[data-testid="send-button"]').addEventListener('click', () => {
    const text = input.textContent; input.textContent = '';
    const turn = doc.createElement('div');
    turn.className = 'group flex flex-col'; turn.setAttribute('data-talvt-turn-state', 'streaming');
    turn.innerHTML = '<div class="block"><h4 class="sr-only">You said:</h4><div data-content-search-unit-key="t:0:user"><div data-user-message-bubble="true"><div class="whitespace-pre-wrap"></div><button>Show more</button></div></div></div>'
      + '<div class="block"><h4 class="sr-only" data-conversation-role="assistant">ChatGPT said:</h4><div data-content-search-unit-key="t:1:assistant"><div data-markdown-text-style="assistant-message"><p></p></div></div></div>'
      + '<div class="turn-action-controls"><button aria-label="Copy message"></button><button aria-label="Regenerate response"></button></div>';
    turn.querySelector('.whitespace-pre-wrap').textContent = text.slice(0, 10240); // ChatGPT shows at most 10,240 characters of a long message
    doc.getElementById('turns').appendChild(turn);
    const p = turn.querySelector('[data-markdown-text-style] p');
    const words = reply(text).split(' ');
    words.forEach((w, i) => setTimeout(() => { const s = doc.createElement('span'); s.setAttribute('data-d-stream-word', ''); s.textContent = (i ? ' ' : '') + w; p.appendChild(s); }, (streamMs / words.length) * (i + 1)));
    setTimeout(() => turn.setAttribute('data-talvt-turn-state', 'complete'), streamMs + 40);
  });
}

test('ChatGPT 2026 layout (from the user\'s diagnostics): each part is acknowledged, the next one is sent, the final answer is read', async () => {
  const env = boot('chatgpt');
  chatgpt2026(env.window, { reply: (t) => { const m = /^\[PART (\d+) of (\d+)( — FINAL)?\]/.exec(t); return m && !m[3] ? `RECEIVED ${m[1]}/${m[2]}` : 'Here is the analysis result as requested by you'; } });
  const a = new ChatGPTAdapter(env.window.document, env.window);
  const big = 'x'.repeat(15000); // longer than what ChatGPT displays
  const r1 = await a.run(`[PART 1 of 2]\nMULTI-PART REQUEST\n${big}\nReply with exactly "RECEIVED 1/2" and nothing else.`, { timeoutMs: 4000, stableMs: 150 });
  assert.strictEqual(r1.ok, true, JSON.stringify(r1));
  assert.strictEqual(r1.text.trim(), 'RECEIVED 1/2', 'only the answer, not "ChatGPT said:" or our own message');
  const live = a.pageDiagnostics();
  assert.match(live, /message found: yes \(by label\); reply found after it: yes/);
  const r2 = await a.run('[PART 2 of 2 — FINAL]\nThis is the last part.', { timeoutMs: 4000, stableMs: 150 });
  assert.strictEqual(r2.ok, true, JSON.stringify(r2));
  assert.match(r2.text, /analysis result as requested by you/, 'the whole streamed answer, not a half-written one');
});
