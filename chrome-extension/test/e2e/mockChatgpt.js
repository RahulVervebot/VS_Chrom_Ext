// Local HTTPS stand-in for chatgpt.com. The DOM follows the structure the ChatGPT adapter targets and the answer streams in
// while a stop button is visible. NOTE: this validates the extension's mechanics, not the real site's current markup.
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { answerFor } from '../support/scriptedAi.js';

const PAGE = (variant) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ChatGPT (mock)</title></head><body style="font-family:sans-serif">
<main style="max-width:800px;margin:20px auto"><div id="chat"></div>
<div ${variant === 'changedUi' ? 'id="renamed-box"' : 'id="prompt-textarea"'} ${variant === 'changedUi' ? 'data-x="1"' : 'contenteditable="true"'} style="min-height:60px;border:1px solid #888;padding:6px;white-space:pre-wrap"></div>
<button data-testid="send-button" style="display:none">Send</button></main>
<script>
const input = document.querySelector('#prompt-textarea, #renamed-box'), send = document.querySelector('[data-testid="send-button"]'), chat = document.getElementById('chat');
input.addEventListener('input', () => { send.style.display = input.innerText.trim() ? 'inline-block' : 'none'; });
send.addEventListener('click', async () => {
  const prompt = input.innerText; input.textContent = ''; send.style.display = 'none';
  chat.insertAdjacentHTML('beforeend', '<div data-message-author-role="user">(prompt of ' + prompt.length + ' chars)</div>');
  chat.insertAdjacentHTML('beforeend', '<button data-testid="stop-button">Stop</button>');
  const r = await fetch('/__ai', { method: 'POST', body: prompt }).then((x) => x.json());
  if (r.error) { chat.querySelector('[data-testid="stop-button"]').remove(); document.body.insertAdjacentHTML('beforeend', '<div role="alert">' + r.error + '</div>'); return; }
  const box = document.createElement('div'); box.setAttribute('data-message-author-role', 'assistant');
  box.innerHTML = '<div class="markdown"><p>json</p><button>Copy code</button><pre><code></code></pre></div>'; chat.appendChild(box);
  const code = box.querySelector('code');
  for (let i = 0; i < r.text.length; i += 700) { code.textContent += r.text.slice(i, i + 700); await new Promise((z) => setTimeout(z, 15)); }
  chat.querySelector('[data-testid="stop-button"]').remove();
});
</script></body></html>`;

export async function startMock() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aipi-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=chatgpt.com'], { stdio: 'ignore' });
  const state = { variant: 'ok', mode: 'ok', prompts: [], corrupt: 0 };
  const server = https.createServer({ key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }, async (req, res) => {
    if (req.method === 'POST' && req.url === '/__ai') {
      let body = ''; for await (const c of req) body += c;
      state.prompts.push(body);
      res.setHeader('content-type', 'application/json');
      if (state.mode === 'limit') return res.end(JSON.stringify({ error: "You've reached the current usage cap. Try again later." }));
      if (state.corrupt > 0) { state.corrupt--; return res.end(JSON.stringify({ text: 'I looked at it and here are my thoughts, in prose only.' })); }
      try {
        if (body.includes('BEGIN_CONTEXT_JSON')) state.lastContext = body; // follow-up (correction) prompts refer to the earlier message, like a real chat
        return res.end(JSON.stringify({ text: JSON.stringify(answerFor(state.lastContext)) }));
      } catch (e) { return res.end(JSON.stringify({ error: 'mock failure ' + e.message })); }
    }
    res.setHeader('content-type', 'text/html'); res.end(PAGE(state.variant));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { state, port: server.address().port, close: () => new Promise((r) => server.close(r)) };
}
