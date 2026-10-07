// Base class: the generic mechanics of "type a prompt, submit it, wait for an answer, read it".
// Website-specific selectors live ONLY in subclasses. If a required element cannot be found, the adapter STOPS and reports
// UI_CHANGED rather than guessing, clicking other elements, or sending data to the wrong place.
import { classifyProblem } from '../batching/limitDetector.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AIAdapter {
  constructor(doc = document, win = window) { this.doc = doc; this.win = win; }

  // ---- identity (override) ----
  get id() { return 'generic'; }
  get name() { return 'Generic AI'; }
  get adapterVersion() { return '0'; }
  get hosts() { return []; }
  // Selector lists are tried in order; the first match wins.
  get selectors() { return { input: [], send: [], stop: [], assistant: [], model: [], error: [], login: [], captcha: [] }; }

  // ---- interface (spec §5) ----
  detect() {
    const host = this.win.location.hostname;
    return this.hosts.some((h) => host === h || host.endsWith(`.${h}`));
  }

  getCapabilities() {
    return { provider: this.id, name: this.name, adapterVersion: this.adapterVersion, contextLimit: 'unknown', maxInput: 'unknown', maxOutput: 'unknown', supportsLongPrompt: true };
  }

  getInputBox() { return this.first(this.selectors.input, (el) => this.visible(el) && this.editable(el)); }
  getSendButton() { return this.first(this.selectors.send, (el) => this.visible(el)); }
  getStopButton() { return this.first(this.selectors.stop, (el) => this.visible(el)); }
  getModelName() { const el = this.first(this.selectors.model); return el ? this.textOf(el).trim().slice(0, 60) || null : null; }

  async enterPrompt(text) {
    const box = this.getInputBox();
    if (!box) return { ok: false, code: 'UI_CHANGED', message: `${this.name}: the message box was not found. The website interface may have changed.` };
    const set = await this.setText(box, text);
    if (!set.ok) return { ok: false, code: 'UI_CHANGED', message: `${this.name}: the prompt could not be entered reliably (${set.reason}). Nothing was sent.` };
    return { ok: true };
  }

  async submitPrompt(chars = 0) {
    // The send button appears/enables only after text is entered. A big message takes the chat page longer to accept, so wait longer for it (up to ~35 s).
    const tries = 20 + Math.min(210, Math.floor(chars / 1500));
    let btn = null;
    for (let i = 0; i < tries && !btn; i++) { btn = this.getSendButton(); if (btn && this.disabled(btn)) btn = null; if (!btn) await sleep(150); }
    if (!btn) return { ok: false, code: 'UI_CHANGED', message: `${this.name}: the send button was not found or stayed disabled. Nothing was sent.${this.lastPromptChars > 8000 ? ' The message may be too large for the chat box.' : ''}` };
    btn.click();
    return { ok: true };
  }

  // Snapshot of assistant output used to tell new answers from old ones.
  detectResponse() {
    const els = this.all(this.selectors.assistant);
    const last = els[els.length - 1] || null;
    return { count: els.length, lastText: last ? this.textOf(last) : '', last, streaming: !!this.getStopButton() };
  }

  async readResponse({ baseline, timeoutMs = 240000, stableMs = 3000, onProgress, isCancelled }) {
    const started = Date.now();
    let lastText = null;
    let lastChange = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (isCancelled && isCancelled()) return { ok: false, code: 'CANCELLED', message: 'Cancelled.' };
      const problem = this.detectLimit() || this.detectError();
      if (problem) return { ok: false, code: problem.code, message: problem.message };
      const cur = this.detectResponse();
      const fresh = cur.count > baseline.count || (cur.last && cur.lastText !== baseline.lastText);
      if (fresh && cur.last) {
        if (cur.lastText !== lastText) { lastText = cur.lastText; lastChange = Date.now(); if (onProgress) onProgress({ chars: cur.lastText.length }); }
        const stable = Date.now() - lastChange >= stableMs;
        if (!cur.streaming && stable && cur.lastText.trim().length > 0) return { ok: true, text: cur.lastText, codeBlocks: this.codeBlocksOf(cur.last) };
      }
      await sleep(400);
    }
    const cur = this.detectResponse();
    return { ok: false, code: 'TIMEOUT', message: `${this.name}: no complete answer within ${Math.round(timeoutMs / 1000)}s.`, partial: cur.lastText };
  }

  // Returns { code, message } if the page shows an error/limit state, else null.
  detectError() {
    const el = this.first(this.selectors.error);
    const text = el ? this.textOf(el) : '';
    const c = classifyProblem(text);
    return c ? { code: c === 'LIMIT' ? 'LIMIT' : c, message: text.trim().slice(0, 200) } : null;
  }

  detectLimit() {
    const el = this.first(this.selectors.error);
    const text = el ? this.textOf(el) : '';
    return classifyProblem(text) === 'LIMIT' ? { code: 'LIMIT', message: text.trim().slice(0, 200) } : null;
  }

  detectLogin() { return !!this.first(this.selectors.login, (el) => this.visible(el)) && !this.getInputBox(); }
  detectCaptcha() { return !!this.first(this.selectors.captcha, (el) => this.visible(el)); }

  // Reports which required elements resolve. Used before every run and by the "check provider" button.
  selfTest() {
    // The send button only exists once text has been entered, so it is verified at submit time, not here.
    const login = this.detectLogin();
    const captcha = this.detectCaptcha();
    const checks = { input: !!this.getInputBox(), assistantSelectors: this.selectors.assistant.length > 0, loggedIn: !login, noCaptcha: !captcha };
    return { ok: checks.input && checks.loggedIn && checks.noCaptcha, provider: this.id, adapterVersion: this.adapterVersion, url: this.win.location.href, checks };
  }

  // Full cycle for one prompt. Never sends anything unless the interface checks pass.
  async run(prompt, { timeoutMs, stableMs, onProgress, isCancelled } = {}) {
    if (this.detectCaptcha()) return { ok: false, code: 'CAPTCHA', message: `${this.name} is asking you to verify you are human. Complete it in the tab, then retry.` };
    if (this.detectLogin()) return { ok: false, code: 'LOGIN', message: `Log in to ${this.name} in this tab, then retry.` };
    const limit = this.detectLimit();
    if (limit) return { ok: false, ...limit };
    const test = this.selfTest();
    if (!test.ok) return { ok: false, code: 'UI_CHANGED', message: `${this.name}: interface check failed (${Object.entries(test.checks).filter(([, v]) => !v).map(([k]) => k).join(', ')}). The website may have changed; nothing was sent.` };
    const baseline = this.detectResponse();
    this.lastPromptChars = prompt.length;
    const entered = await this.enterPrompt(prompt);
    if (!entered.ok) return entered;
    if (onProgress) onProgress({ stage: 'SUBMITTING' });
    const sent = await this.submitPrompt(prompt.length);
    if (!sent.ok) return sent;
    if (onProgress) onProgress({ stage: 'WAITING_AI' });
    const res = await this.readResponse({ baseline, timeoutMs, stableMs, onProgress: (p) => onProgress && onProgress({ stage: 'RECEIVING', ...p }), isCancelled });
    return res.ok ? { ...res, model: this.getModelName(), adapterVersion: this.adapterVersion } : res;
  }

  // ---- DOM helpers ----
  first(selectors, pred) {
    for (const s of selectors) {
      let list = [];
      try { list = [...this.doc.querySelectorAll(s)]; } catch { continue; }
      const hit = pred ? list.find(pred) : list[0];
      if (hit) return hit;
    }
    return null;
  }
  all(selectors) {
    for (const s of selectors) { try { const l = [...this.doc.querySelectorAll(s)]; if (l.length) return l; } catch { /* invalid selector for this browser */ } }
    return [];
  }
  visible(el) {
    if (!el) return false;
    const style = this.win.getComputedStyle ? this.win.getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    return el.getClientRects ? (el.getClientRects().length > 0 || !!this.win.__aipiAssumeVisible) : true;
  }
  // Only real text inputs count: a non-editable element that happens to match a selector must not receive the prompt.
  editable(el) {
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return !el.disabled && !el.readOnly;
    const ce = el.getAttribute('contenteditable');
    return ce === '' || ce === 'true' || ce === 'plaintext-only' || el.isContentEditable === true;
  }
  disabled(el) { return el.disabled === true || el.getAttribute('aria-disabled') === 'true'; }
  textOf(el) { return (el.innerText !== undefined ? el.innerText : el.textContent) || ''; }
  codeBlocksOf(el) {
    const pres = [...el.querySelectorAll('pre')];
    const blocks = pres.length ? pres.map((p) => { const c = p.querySelector('code'); return (c || p).textContent || ''; }) : [...el.querySelectorAll('code')].map((c) => c.textContent || '');
    return blocks.filter((t) => t.trim());
  }

  // Enters text into <textarea>/<input> or a contenteditable, then VERIFIES it landed. Returns { ok, reason }.
  async setText(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? this.win.HTMLTextAreaElement.prototype : this.win.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
      el.dispatchEvent(new this.win.Event('input', { bubbles: true }));
    } else {
      // contenteditable (ProseMirror/Quill): insertText goes through the editor's own input handling.
      const sel = this.win.getSelection();
      const range = this.doc.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges(); sel.addRange(range);
      let ok = false;
      try { ok = this.doc.execCommand('insertText', false, text); } catch { ok = false; }
      if (!ok || !this.matches(this.textOf(el), text)) {
        // Fallback: a synthetic paste event (handled by most rich editors).
        try {
          const dt = new this.win.DataTransfer();
          dt.setData('text/plain', text);
          el.dispatchEvent(new this.win.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        } catch { /* environment without DataTransfer */ }
      }
      if (!this.matches(this.textOf(el), text) && !this.win.ClipboardEvent) { el.textContent = text; el.dispatchEvent(new this.win.Event('input', { bubbles: true })); }
    }
    await sleep(50);
    const now = el.value !== undefined ? el.value : this.textOf(el);
    return this.matches(now, text) ? { ok: true } : { ok: false, reason: `entered ${now.length} of ${text.length} characters` };
  }

  // Editors normalize whitespace; require the length to be within 3% and both ends to match.
  matches(actual, expected) {
    const norm = (s) => s.replace(/\s+/g, ' ').trim();
    const a = norm(actual); const e = norm(expected);
    if (!e.length) return true;
    return Math.abs(a.length - e.length) / e.length <= 0.03 && a.slice(0, 40) === e.slice(0, 40) && a.slice(-40) === e.slice(-40);
  }
}
