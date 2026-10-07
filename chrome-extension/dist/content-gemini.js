(() => {
  // src/content/runtime.js
  function installContentRuntime(adapter) {
    if (window.__aipiInstalled) return;
    window.__aipiInstalled = true;
    let cancelled = false;
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.target !== "content") return false;
      if (msg.type === "PING") {
        sendResponse({ ok: true, provider: adapter.id, adapterVersion: adapter.adapterVersion, ready: adapter.detect() });
        return false;
      }
      if (msg.type === "SELF_TEST") {
        sendResponse({ ...adapter.selfTest(), capabilities: adapter.getCapabilities(), extra: adapter.describe ? adapter.describe() : void 0 });
        return false;
      }
      return false;
    });
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== "aipi-run") return;
      port.onMessage.addListener(async (msg) => {
        if (msg.type === "CANCEL") {
          cancelled = true;
          return;
        }
        if (msg.type !== "RUN") return;
        cancelled = false;
        try {
          const res = await adapter.run(msg.prompt, {
            timeoutMs: msg.timeoutMs,
            stableMs: msg.stableMs,
            isCancelled: () => cancelled,
            onProgress: (p) => {
              try {
                port.postMessage({ type: "PROGRESS", id: msg.id, ...p });
              } catch {
              }
            }
          });
          port.postMessage({ type: "RESULT", id: msg.id, ...res });
        } catch (err) {
          port.postMessage({ type: "RESULT", id: msg.id, ok: false, code: "ADAPTER_ERROR", message: String(err && err.message ? err.message : err) });
        }
      });
    });
  }

  // src/batching/limitDetector.js
  var PATTERNS = [
    { code: "LIMIT", re: /usage (?:cap|limit)|reached (?:the |your )?(?:current )?(?:message |usage )?limit|message limit|out of (?:free )?messages|too many requests|rate limit|quota|try again (?:later|in)|come back (?:later|at)/i },
    { code: "CONTEXT_TOO_LARGE", re: /message (?:is )?too long|too long|input (?:is )?too large|exceeds? the (?:maximum )?(?:context|length)|context (?:length|window)|prompt is too long/i },
    { code: "LOGIN", re: /log ?in to continue|sign ?in to continue|please (?:log|sign) ?in|session (?:has )?expired/i },
    { code: "CAPTCHA", re: /verify you are (?:a )?human|captcha|unusual activity/i },
    { code: "NETWORK", re: /network error|something went wrong|an error occurred|failed to (?:generate|fetch|load)|connection (?:lost|error)|couldn['’]t (?:generate|complete)/i }
  ];
  function classifyProblem(text) {
    if (!text) return null;
    for (const p of PATTERNS) if (p.re.test(text)) return p.code;
    return null;
  }

  // src/ai/aiAdapter.js
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  var AIAdapter = class {
    constructor(doc = document, win = window) {
      this.doc = doc;
      this.win = win;
    }
    // ---- identity (override) ----
    get id() {
      return "generic";
    }
    get name() {
      return "Generic AI";
    }
    get adapterVersion() {
      return "0";
    }
    get hosts() {
      return [];
    }
    // Selector lists are tried in order; the first match wins.
    get selectors() {
      return { input: [], send: [], stop: [], assistant: [], model: [], error: [], login: [], captcha: [] };
    }
    // ---- interface (spec §5) ----
    detect() {
      const host = this.win.location.hostname;
      return this.hosts.some((h) => host === h || host.endsWith(`.${h}`));
    }
    getCapabilities() {
      return { provider: this.id, name: this.name, adapterVersion: this.adapterVersion, contextLimit: "unknown", maxInput: "unknown", maxOutput: "unknown", supportsLongPrompt: true };
    }
    getInputBox() {
      return this.first(this.selectors.input, (el) => this.visible(el) && this.editable(el));
    }
    getSendButton() {
      return this.first(this.selectors.send, (el) => this.visible(el)) || this.nearbySendButton();
    }
    // The site renamed its send button: accept a button labelled "send"/"submit" that sits in the same composer as the message box (never elsewhere on the page).
    nearbySendButton() {
      const box = this.getInputBox();
      let node = box;
      for (let i = 0; i < 7 && node && node.parentElement; i++) {
        node = node.parentElement;
        const hit = [...node.querySelectorAll('button, [role="button"]')].find((b) => {
          if (!this.visible(b)) return false;
          const label = this.labelOf(b);
          return /\b(send|submit)\b/i.test(label) && !/attach|upload|voice|dictat|stop|file|photo|image|search|tool/i.test(label);
        });
        if (hit) return hit;
      }
      return null;
    }
    labelOf(b) {
      return `${b.getAttribute("aria-label") || ""} ${b.getAttribute("data-testid") || ""} ${b.getAttribute("title") || ""} ${b.id || ""} ${b.getAttribute("type") === "submit" ? "submit" : ""}`.trim();
    }
    valueOf(el) {
      return el.value !== void 0 ? el.value : this.textOf(el);
    }
    // What the page looks like around the message box, for error messages the user can act on (and report).
    diagnose(expectedChars) {
      const box = this.getInputBox();
      const btn = this.getSendButton();
      const labels = [];
      let node = box;
      for (let i = 0; i < 4 && node && node.parentElement && !labels.length; i++) {
        node = node.parentElement;
        for (const b of node.querySelectorAll('button, [role="button"]')) {
          const l = this.labelOf(b) || (b.textContent || "").trim().slice(0, 24);
          if (l && labels.length < 8) labels.push(l);
        }
      }
      return `Page state: message box ${box ? `found, holds ${this.valueOf(box).length} of ${expectedChars} characters` : "not found"}; send button ${btn ? this.disabled(btn) ? "found but disabled" : "found" : "not found"}; reply still being generated: ${this.getStopButton() ? "yes" : "no"}; buttons next to the box: ${labels.join(" | ") || "none"}.`;
    }
    async waitIdle(maxMs = 2e4) {
      const t0 = Date.now();
      while (this.getStopButton() && Date.now() - t0 < maxMs) await sleep(300);
    }
    pressEnter(el) {
      el.focus();
      for (const type of ["keydown", "keypress", "keyup"]) el.dispatchEvent(new this.win.KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    }
    // Was the message taken? Evidence: the box emptied, a reply started, or a new message/answer appeared. Only "no sign at all" counts as not sent.
    async waitSubmitted(box, before, baselineCount, ms = 4e3) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (this.getStopButton()) return true;
        if (this.detectError()) return true;
        if (box && this.valueOf(box).length < before * 0.5) return true;
        if (this.detectResponse().count > baselineCount) return true;
        await sleep(150);
      }
      return false;
    }
    getStopButton() {
      return this.first(this.selectors.stop, (el) => this.visible(el));
    }
    getModelName() {
      const el = this.first(this.selectors.model);
      return el ? this.textOf(el).trim().slice(0, 60) || null : null;
    }
    async enterPrompt(text) {
      const box = this.getInputBox();
      if (!box) return { ok: false, code: "UI_CHANGED", message: `${this.name}: the message box was not found. The website interface may have changed.` };
      const set = await this.setText(box, text);
      if (!set.ok) return { ok: false, code: "UI_CHANGED", message: `${this.name}: the prompt could not be entered reliably (${set.reason}). Nothing was sent. ${this.diagnose(text.length)}` };
      return { ok: true };
    }
    async submitPrompt(chars = 0, baselineCount = 0) {
      const box = this.getInputBox();
      const before = box ? this.valueOf(box).length : 0;
      const tries = 20 + Math.min(210, Math.floor(chars / 1500));
      let btn = null;
      for (let i = 0; i < tries && !btn; i++) {
        btn = this.getSendButton();
        if (btn && this.disabled(btn)) btn = null;
        if (!btn) await sleep(150);
      }
      if (btn) {
        btn.click();
        if (await this.waitSubmitted(box, before, baselineCount)) return { ok: true };
        return { ok: false, code: "UI_CHANGED", message: `${this.name}: the send button was clicked but the message was not sent (the box still holds it and no reply started). Nothing more was done. ${this.diagnose(chars)}` };
      }
      if (box && before >= chars * 0.9 && chars > 0) {
        this.pressEnter(box);
        if (await this.waitSubmitted(box, before, baselineCount, 3e3)) return { ok: true };
      }
      return { ok: false, code: "UI_CHANGED", message: `${this.name}: the send button was not found or stayed disabled. Nothing was sent. ${this.diagnose(chars)}` };
    }
    // Snapshot of assistant output used to tell new answers from old ones.
    detectResponse() {
      const els = this.all(this.selectors.assistant);
      const last = els[els.length - 1] || null;
      return { count: els.length, lastText: last ? this.textOf(last) : "", last, streaming: !!this.getStopButton() };
    }
    async readResponse({ baseline, timeoutMs = 24e4, stableMs = 3e3, onProgress, isCancelled }) {
      const started = Date.now();
      let lastText = null;
      let lastChange = Date.now();
      while (Date.now() - started < timeoutMs) {
        if (isCancelled && isCancelled()) return { ok: false, code: "CANCELLED", message: "Cancelled." };
        const problem = this.detectLimit() || this.detectError();
        if (problem) return { ok: false, code: problem.code, message: problem.message };
        const cur2 = this.detectResponse();
        const fresh = cur2.count > baseline.count || cur2.last && cur2.lastText !== baseline.lastText;
        if (fresh && cur2.last) {
          if (cur2.lastText !== lastText) {
            lastText = cur2.lastText;
            lastChange = Date.now();
            if (onProgress) onProgress({ chars: cur2.lastText.length });
          }
          const stable = Date.now() - lastChange >= stableMs;
          if (!cur2.streaming && stable && cur2.lastText.trim().length > 0) return { ok: true, text: cur2.lastText, codeBlocks: this.codeBlocksOf(cur2.last) };
        }
        await sleep(400);
      }
      const cur = this.detectResponse();
      return { ok: false, code: "TIMEOUT", message: `${this.name}: no complete answer within ${Math.round(timeoutMs / 1e3)}s.`, partial: cur.lastText };
    }
    // Returns { code, message } if the page shows an error/limit state, else null.
    detectError() {
      const el = this.first(this.selectors.error);
      const text = el ? this.textOf(el) : "";
      const c = classifyProblem(text);
      return c ? { code: c === "LIMIT" ? "LIMIT" : c, message: text.trim().slice(0, 200) } : null;
    }
    detectLimit() {
      const el = this.first(this.selectors.error);
      const text = el ? this.textOf(el) : "";
      return classifyProblem(text) === "LIMIT" ? { code: "LIMIT", message: text.trim().slice(0, 200) } : null;
    }
    detectLogin() {
      return !!this.first(this.selectors.login, (el) => this.visible(el)) && !this.getInputBox();
    }
    detectCaptcha() {
      return !!this.first(this.selectors.captcha, (el) => this.visible(el));
    }
    // Reports which required elements resolve. Used before every run and by the "check provider" button.
    selfTest() {
      const login = this.detectLogin();
      const captcha = this.detectCaptcha();
      const checks = { input: !!this.getInputBox(), assistantSelectors: this.selectors.assistant.length > 0, loggedIn: !login, noCaptcha: !captcha };
      return { ok: checks.input && checks.loggedIn && checks.noCaptcha, provider: this.id, adapterVersion: this.adapterVersion, url: this.win.location.href, checks };
    }
    // Full cycle for one prompt. Never sends anything unless the interface checks pass.
    async run(prompt, { timeoutMs, stableMs, onProgress, isCancelled } = {}) {
      if (this.detectCaptcha()) return { ok: false, code: "CAPTCHA", message: `${this.name} is asking you to verify you are human. Complete it in the tab, then retry.` };
      if (this.detectLogin()) return { ok: false, code: "LOGIN", message: `Log in to ${this.name} in this tab, then retry.` };
      const limit = this.detectLimit();
      if (limit) return { ok: false, ...limit };
      const test = this.selfTest();
      if (!test.ok) return { ok: false, code: "UI_CHANGED", message: `${this.name}: interface check failed (${Object.entries(test.checks).filter(([, v]) => !v).map(([k]) => k).join(", ")}). The website may have changed; nothing was sent.` };
      await this.waitIdle();
      const baseline = this.detectResponse();
      this.lastPromptChars = prompt.length;
      const entered = await this.enterPrompt(prompt);
      if (!entered.ok) return entered;
      if (onProgress) onProgress({ stage: "SUBMITTING" });
      const sent = await this.submitPrompt(prompt.length, baseline.count);
      if (!sent.ok) return sent;
      if (onProgress) onProgress({ stage: "WAITING_AI" });
      const res = await this.readResponse({ baseline, timeoutMs, stableMs, onProgress: (p) => onProgress && onProgress({ stage: "RECEIVING", ...p }), isCancelled });
      return res.ok ? { ...res, model: this.getModelName(), adapterVersion: this.adapterVersion } : res;
    }
    // ---- DOM helpers ----
    first(selectors, pred) {
      for (const s of selectors) {
        let list = [];
        try {
          list = [...this.doc.querySelectorAll(s)];
        } catch {
          continue;
        }
        const hit = pred ? list.find(pred) : list[0];
        if (hit) return hit;
      }
      return null;
    }
    all(selectors) {
      for (const s of selectors) {
        try {
          const l = [...this.doc.querySelectorAll(s)];
          if (l.length) return l;
        } catch {
        }
      }
      return [];
    }
    visible(el) {
      if (!el) return false;
      const style = this.win.getComputedStyle ? this.win.getComputedStyle(el) : null;
      if (style && (style.display === "none" || style.visibility === "hidden")) return false;
      return el.getClientRects ? el.getClientRects().length > 0 || !!this.win.__aipiAssumeVisible : true;
    }
    // Only real text inputs count: a non-editable element that happens to match a selector must not receive the prompt.
    editable(el) {
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return !el.disabled && !el.readOnly;
      const ce = el.getAttribute("contenteditable");
      return ce === "" || ce === "true" || ce === "plaintext-only" || el.isContentEditable === true;
    }
    disabled(el) {
      return el.disabled === true || el.getAttribute("aria-disabled") === "true";
    }
    textOf(el) {
      return (el.innerText !== void 0 ? el.innerText : el.textContent) || "";
    }
    codeBlocksOf(el) {
      const pres = [...el.querySelectorAll("pre")];
      const blocks = pres.length ? pres.map((p) => {
        const c = p.querySelector("code");
        return (c || p).textContent || "";
      }) : [...el.querySelectorAll("code")].map((c) => c.textContent || "");
      return blocks.filter((t) => t.trim());
    }
    // Enters text into <textarea>/<input> or a contenteditable, then VERIFIES it landed. Returns { ok, reason }.
    async setText(el, text) {
      el.focus();
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const proto = el.tagName === "TEXTAREA" ? this.win.HTMLTextAreaElement.prototype : this.win.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
        el.dispatchEvent(new this.win.Event("input", { bubbles: true }));
      } else {
        const sel = this.win.getSelection();
        const range = this.doc.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        let ok = false;
        try {
          ok = this.doc.execCommand("insertText", false, text);
        } catch {
          ok = false;
        }
        if (!ok || !this.matches(this.textOf(el), text)) {
          try {
            const dt = new this.win.DataTransfer();
            dt.setData("text/plain", text);
            el.dispatchEvent(new this.win.ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          } catch {
          }
        }
        if (!this.matches(this.textOf(el), text) && !this.win.ClipboardEvent) {
          el.textContent = text;
          el.dispatchEvent(new this.win.Event("input", { bubbles: true }));
        }
      }
      await sleep(50);
      const now = el.value !== void 0 ? el.value : this.textOf(el);
      return this.matches(now, text) ? { ok: true } : { ok: false, reason: `entered ${now.length} of ${text.length} characters` };
    }
    // Editors normalize whitespace; require the length to be within 3% and both ends to match.
    matches(actual, expected) {
      const norm = (s) => s.replace(/\s+/g, " ").trim();
      const a = norm(actual);
      const e = norm(expected);
      if (!e.length) return true;
      return Math.abs(a.length - e.length) / e.length <= 0.03 && a.slice(0, 40) === e.slice(0, 40) && a.slice(-40) === e.slice(-40);
    }
  };

  // src/ai/geminiAdapter.js
  var GeminiAdapter = class extends AIAdapter {
    get id() {
      return "gemini";
    }
    get name() {
      return "Gemini";
    }
    get adapterVersion() {
      return "2026.09-1";
    }
    get hosts() {
      return ["gemini.google.com"];
    }
    get selectors() {
      return {
        input: ['rich-textarea div.ql-editor[contenteditable="true"]', 'div.ql-editor[contenteditable="true"]', "rich-textarea textarea"],
        send: ["button.send-button", 'button[aria-label="Send message"]', 'button[mattooltip="Send message"]'],
        stop: ['button[aria-label="Stop response"]', "button.stop", 'button[aria-label="Stop generating"]'],
        assistant: ["model-response .markdown", "model-response message-content", "message-content.model-response-text", ".model-response-text"],
        model: ["bard-mode-switcher button", '[data-test-id="bard-mode-menu-button"]'],
        error: ['[role="alert"]', "error-message", ".error-message"],
        login: ['a[href*="accounts.google.com/ServiceLogin"]', 'a[aria-label*="Sign in" i]'],
        captcha: ['iframe[src*="recaptcha"]']
      };
    }
  };

  // src/content/gemini.js
  installContentRuntime(new GeminiAdapter());
})();
//# sourceMappingURL=content-gemini.js.map
