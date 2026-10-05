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
  res = await env.a.run('hello', { timeoutMs: 700, stableMs: 100 });
  assert.strictEqual(res.code, 'TIMEOUT');
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
