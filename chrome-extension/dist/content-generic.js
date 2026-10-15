(() => {
  // src/content/runtime.js
  function installContentRuntime(adapter) {
    if (window.__aipiAlive && window.__aipiAlive()) return;
    const myRuntime = chrome.runtime;
    window.__aipiAlive = () => {
      try {
        return !!(myRuntime && myRuntime.id);
      } catch {
        return false;
      }
    };
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.target !== "content") return false;
      if (msg.type === "PING") {
        sendResponse({ ok: true, provider: adapter.id, adapterVersion: adapter.adapterVersion, ready: adapter.detect() });
        return false;
      }
      if (msg.type === "DIAGNOSE") {
        try {
          sendResponse({ ok: true, text: adapter.pageDiagnostics() });
        } catch (e) {
          sendResponse({ ok: false, text: `diagnostics failed: ${e.message}` });
        }
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
      const run = { cancelled: false, acceptNow: false, beat: null };
      port.onDisconnect.addListener(() => {
        run.cancelled = true;
        clearInterval(run.beat);
      });
      port.onMessage.addListener(async (msg) => {
        if (msg.type === "CANCEL") {
          run.cancelled = true;
          return;
        }
        if (msg.type === "ACCEPT_NOW") {
          run.acceptNow = true;
          return;
        }
        if (msg.type !== "RUN") return;
        run.beat = setInterval(() => {
          try {
            port.postMessage({ type: "PROGRESS", id: msg.id, stage: "ALIVE", detail: adapter.liveText ? adapter.liveText() : null });
          } catch {
          }
        }, 5e3);
        try {
          const res = await adapter.run(msg.prompt, {
            timeoutMs: msg.timeoutMs,
            stableMs: msg.stableMs,
            isCancelled: () => run.cancelled,
            acceptNow: () => run.acceptNow,
            onProgress: (p) => {
              try {
                port.postMessage({ type: "PROGRESS", id: msg.id, ...p });
              } catch {
              }
            }
          });
          try {
            port.postMessage({ type: "RESULT", id: msg.id, ...res });
          } catch {
          }
        } catch (err) {
          try {
            port.postMessage({ type: "RESULT", id: msg.id, ok: false, code: "ADAPTER_ERROR", message: String(err && err.message ? err.message : err) });
          } catch {
          }
        } finally {
          clearInterval(run.beat);
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
      return { input: [], send: [], stop: [], assistant: [], user: [], model: [], error: [], login: [], captcha: [] };
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
      const users = this.all(this.selectors.user || []);
      return { count: els.length, lastText: last ? this.textOf(last) : "", last, streaming: !!this.getStopButton(), userCount: users.length, lastUser: users[users.length - 1] || null };
    }
    // The message we just sent, found in the conversation: the newest user message that starts like our prompt and was not there before.
    // Anchoring on it makes the answer unambiguous even when it is word-for-word the same as an earlier one (e.g. "RECEIVED 1/4" after a retry).
    findAnchor(prompt, baseline) {
      const users = this.all(this.selectors.user || []);
      if (!users.length) return null;
      const norm = (s) => String(s).replace(/\s+/g, " ").trim();
      const head = norm(prompt).slice(0, 60);
      for (let i = users.length - 1; i >= 0; i--) {
        const u = users[i];
        if (!norm(this.textOf(u)).startsWith(head)) continue;
        if (users.length > baseline.userCount || u !== baseline.lastUser) return u;
        return null;
      }
      return null;
    }
    // ---- label-free fallback: works even when the site removes the attributes that mark user/assistant messages ----
    promptHead(prompt) {
      return String(prompt).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).find(Boolean)?.slice(0, 40) || "";
    }
    // text nodes (outside the message box) that contain the first line of our prompt, in page order
    textHits(prompt) {
      const head = this.promptHead(prompt);
      if (!head || !this.doc.createTreeWalker) return [];
      const box = this.getInputBox();
      const root = this.doc.querySelector("main") || this.doc.body;
      const walker = this.doc.createTreeWalker(
        root,
        4
        /* SHOW_TEXT */
      );
      const hits = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.nodeValue && n.nodeValue.replace(/\s+/g, " ").includes(head) && !(box && box.contains(n))) hits.push(n);
      return hits;
    }
    // the newest copy of our prompt shown in the conversation (if it was not there before sending), as the element of our message bubble
    textAnchor(prompt, baseline) {
      const hits = this.textHits(prompt);
      if (hits.length <= (baseline.textHits || 0)) return null;
      const node = hits[hits.length - 1];
      const want = String(prompt).replace(/\s+/g, "").length * 0.9;
      let bubble = node.parentElement;
      for (let el = node.parentElement, i = 0; el && i < 12; el = el.parentElement, i++) {
        bubble = el;
        if (this.textOf(el).replace(/\s+/g, "").length >= want) break;
      }
      if (!bubble) return null;
      bubble.__aipiTextAnchor = true;
      return bubble;
    }
    // the first visible text after our bubble (and before the message box) is the start of the reply; its block is the answer
    replyAfterText(bubble) {
      const root = this.doc.querySelector("main") || this.doc.body;
      const box = this.getInputBox();
      const walker = this.doc.createTreeWalker(
        root,
        4
        /* SHOW_TEXT */
      );
      walker.currentNode = bubble;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (bubble.contains(n)) continue;
        if (box && (box.contains(n) || box.compareDocumentPosition(n) & 4)) return null;
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const el = n.parentElement;
        if (!el || el.closest('button, [role="button"], svg, [aria-hidden="true"], script, style, noscript, textarea, input')) continue;
        let c = el;
        while (c.parentElement && c.parentElement !== root && !c.parentElement.contains(bubble)) c = c.parentElement;
        return c;
      }
      return null;
    }
    answerAfter(anchor) {
      if (anchor.__aipiTextAnchor) return this.replyAfterText(anchor);
      const after = this.all(this.selectors.assistant).filter(
        (el) => anchor.compareDocumentPosition(el) & 4
        /* FOLLOWING */
      );
      return after[after.length - 1] || null;
    }
    // What the extension sees of the conversation, for timeout messages the user can act on (and report).
    describeConversation(baseline) {
      const cur = this.detectResponse();
      return `Conversation state: ${cur.count} answer(s) on the page (${baseline.count} before sending); ${cur.userCount} of your messages (${baseline.userCount} before); reply still being generated: ${cur.streaming ? "yes" : "no"}; last answer ends with: "${cur.lastText.trim().slice(-60)}".`;
    }
    // A privacy-safe picture of the page for troubleshooting: element names, attribute labels, child counts and text LENGTHS, never text.
    // Elements holding the start of the last prompt are marked <<PROMPT>>, ones containing "RECEIVED" are marked <<RECEIVED>>.
    pageDiagnostics() {
      const head = this.lastPrompt ? this.promptHead(this.lastPrompt) : null;
      const count = (list) => Object.fromEntries((list || []).map((s) => {
        let n = 0;
        try {
          n = this.doc.querySelectorAll(s).length;
        } catch {
          n = -1;
        }
        return [s, n];
      }));
      const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("").trim().length;
      const describe = (el, depth) => {
        const attrs = [];
        if (el.id) attrs.push(`#${el.id.slice(0, 30)}`);
        for (const a of el.attributes || []) if (/^(data-|role$|aria-label$|contenteditable$|type$)/.test(a.name) && !/^data-(message-id|id|turn-id|sentry)/.test(a.name)) attrs.push(`${a.name}=${String(a.value).slice(0, 40)}`);
        const cls = (el.getAttribute && el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
        const text = this.textOf(el);
        const marks = [head && text.includes(head) ? "<<PROMPT>>" : "", /RECEIVED \d+\/\d+/.test(text) ? "<<RECEIVED>>" : ""].filter(Boolean).join("");
        const kids = [...el.children];
        const line = `${"  ".repeat(depth)}<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${attrs.length ? ` ${attrs.join(" ")}` : ""}> children=${kids.length} ownText=${own(el)} totalText=${text.length} ${marks}`;
        if (depth >= 24) return [line];
        const shown = kids.length > 6 ? kids.slice(-6) : kids;
        return [line, ...kids.length > 6 ? [`${"  ".repeat(depth + 1)}\u2026 ${kids.length - 6} earlier children omitted`] : [], ...shown.filter((k) => !/^(SCRIPT|STYLE|SVG|PATH|NOSCRIPT)$/i.test(k.tagName)).flatMap((k) => describe(k, depth + 1))];
      };
      const baseline = this.lastBaseline || { count: 0, userCount: 0, textHits: 0 };
      const convo = this.doc.querySelector('[role="region"][aria-label="Conversation" i], [data-testid*="conversation" i]');
      const root = convo || this.doc.querySelector("main") || this.doc.body;
      const anchor = this.lastPrompt ? this.findAnchor(this.lastPrompt, baseline) || this.textAnchor(this.lastPrompt, baseline) : null;
      const reply = anchor ? this.answerAfter(anchor) : null;
      return [
        `AI Project Bridge page diagnostics \xB7 provider ${this.id} \xB7 adapter ${this.adapterVersion} \xB7 ${(/* @__PURE__ */ new Date()).toISOString()}`,
        `url path: ${this.win.location.pathname.replace(/[0-9a-f]{8,}[-0-9a-f]*/gi, "<id>")}`,
        `last prompt starts with: ${head ? JSON.stringify(head.slice(0, 15)) : "(none sent in this tab)"}; copies of it on the page: ${this.lastPrompt ? this.textHits(this.lastPrompt).length : "-"} (before sending: ${baseline.textHits})`,
        `message found: ${anchor ? anchor.__aipiTextAnchor ? "yes (by its text)" : "yes (by label)" : "no"}; reply found after it: ${reply ? `yes, ${this.textOf(reply).length} characters` : "no"}; stop button visible: ${this.getStopButton() ? "yes" : "no"}`,
        `live: ${this.liveText() || "(not waiting)"}`,
        `selectors \u2192 matches: assistant ${JSON.stringify(count(this.selectors.assistant))} user ${JSON.stringify(count(this.selectors.user))} stop ${JSON.stringify(count(this.selectors.stop))} input ${JSON.stringify(count(this.selectors.input))}`,
        "page structure (no text, only lengths):",
        ...describe(root, 0).slice(0, 600)
      ].join("\n");
    }
    // One line for the panel, refreshed while waiting: shows the user what the extension sees on the page right now.
    liveText() {
      const l = this.live;
      if (!l) return null;
      return `${l.phase}: ${l.answersNow} answer(s) on the page (${l.answersBefore} before sending); your message ${l.anchor ? "found" : "not found"} in the chat; answer so far ${l.chars} characters${l.chars ? `, unchanged for ${l.stableSec}s` : ""}; reply still being generated: ${l.streaming ? "yes" : "no"}.`;
    }
    async readResponse({ baseline, prompt = null, timeoutMs = 24e4, stableMs = 3e3, onProgress, isCancelled, acceptNow }) {
      const started = Date.now();
      let lastText = null;
      let lastChange = Date.now();
      let anchor = null;
      let sawStop = false;
      while (Date.now() - started < timeoutMs) {
        if (isCancelled && isCancelled()) return { ok: false, code: "CANCELLED", message: "Cancelled." };
        const problem = this.detectLimit() || this.detectError();
        if (problem) return { ok: false, code: problem.code, message: problem.message };
        const cur2 = this.detectResponse();
        if (cur2.streaming) sawStop = true;
        if (prompt && !anchor) anchor = this.findAnchor(prompt, baseline) || this.textAnchor(prompt, baseline);
        if (anchor && !anchor.isConnected) anchor = null;
        let fresh;
        if (anchor) {
          const a = this.answerAfter(anchor);
          cur2.last = a;
          cur2.lastText = a ? this.textOf(a) : "";
          fresh = !!a;
        } else fresh = cur2.count > baseline.count || cur2.last && cur2.lastText !== baseline.lastText;
        this.live = { phase: "Waiting for the answer", answersNow: cur2.count, answersBefore: baseline.count, anchor: !!anchor, chars: fresh && cur2.last ? cur2.lastText.length : 0, stableSec: Math.round((Date.now() - lastChange) / 1e3), streaming: cur2.streaming };
        if (acceptNow && acceptNow()) {
          const el = anchor && this.answerAfter(anchor) || cur2.last || this.detectResponse().last;
          const text = el ? this.textOf(el) : "";
          if (text.trim()) return { ok: true, text, codeBlocks: this.codeBlocksOf(el), acceptedByUser: true };
        }
        if (fresh && cur2.last) {
          if (cur2.lastText !== lastText) {
            lastText = cur2.lastText;
            lastChange = Date.now();
            if (onProgress) onProgress({ chars: cur2.lastText.length });
          }
          const stable = Date.now() - lastChange >= (sawStop ? stableMs : Math.max(stableMs, Math.min(6e3, timeoutMs / 4)));
          if (!cur2.streaming && stable && cur2.lastText.trim().length > 0) return { ok: true, text: cur2.lastText, codeBlocks: this.codeBlocksOf(cur2.last) };
        }
        await sleep(400);
      }
      const cur = this.detectResponse();
      return { ok: false, code: "TIMEOUT", message: `${this.name}: no complete answer within ${Math.round(timeoutMs / 1e3)}s. ${this.describeConversation(baseline)}`, partial: cur.lastText };
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
    async run(prompt, { timeoutMs, stableMs, onProgress, isCancelled, acceptNow } = {}) {
      if (this.detectCaptcha()) return { ok: false, code: "CAPTCHA", message: `${this.name} is asking you to verify you are human. Complete it in the tab, then retry.` };
      if (this.detectLogin()) return { ok: false, code: "LOGIN", message: `Log in to ${this.name} in this tab, then retry.` };
      const limit = this.detectLimit();
      if (limit) return { ok: false, ...limit };
      const test = this.selfTest();
      if (!test.ok) return { ok: false, code: "UI_CHANGED", message: `${this.name}: interface check failed (${Object.entries(test.checks).filter(([, v]) => !v).map(([k]) => k).join(", ")}). The website may have changed; nothing was sent.` };
      await this.waitIdle();
      if (isCancelled && isCancelled()) return { ok: false, code: "CANCELLED", message: "Cancelled before sending." };
      const baseline = this.detectResponse();
      baseline.textHits = this.textHits(prompt).length;
      this.lastPrompt = prompt;
      this.lastBaseline = baseline;
      this.lastPromptChars = prompt.length;
      const entered = await this.enterPrompt(prompt);
      if (!entered.ok) return entered;
      if (onProgress) onProgress({ stage: "SUBMITTING" });
      if (isCancelled && isCancelled()) return { ok: false, code: "CANCELLED", message: "Cancelled before sending; the text was left in the message box." };
      const sent = await this.submitPrompt(prompt.length, baseline.count);
      if (!sent.ok) return sent;
      if (onProgress) onProgress({ stage: "WAITING_AI" });
      this.live = { phase: "Sent; waiting for the answer", answersNow: baseline.count, answersBefore: baseline.count, anchor: false, chars: 0, stableSec: 0, streaming: false };
      const res = await this.readResponse({ baseline, prompt, timeoutMs, stableMs, onProgress: (p) => onProgress && onProgress({ stage: "RECEIVING", ...p }), isCancelled, acceptNow });
      this.live = null;
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

  // src/ai/genericAdapter.js
  var GenericAIAdapter = class extends AIAdapter {
    get id() {
      return "generic";
    }
    get name() {
      return "Other AI site";
    }
    get adapterVersion() {
      return "2026.09-1";
    }
    get hosts() {
      return [this.win.location.hostname];
    }
    get selectors() {
      return {
        input: ["textarea", 'div[contenteditable="true"]', '[role="textbox"]'],
        send: ['button[type="submit"]', 'button[aria-label*="send" i]', 'button[data-testid*="send" i]', 'button[title*="send" i]'],
        stop: ['button[aria-label*="stop" i]', 'button[title*="stop" i]'],
        assistant: ['[data-role="assistant"]', '[data-message-author-role="assistant"]', ".assistant", '[class*="assistant" i]', '[class*="bot" i][class*="message" i]'],
        model: [],
        error: ['[role="alert"]'],
        login: ['a[href*="login" i]', 'a[href*="signin" i]'],
        captcha: ['iframe[src*="captcha" i]', 'iframe[src*="challenge" i]']
      };
    }
    // The largest visible editable field is the best guess for the chat box.
    getInputBox() {
      const cands = this.selectors.input.flatMap((s) => {
        try {
          return [...this.doc.querySelectorAll(s)];
        } catch {
          return [];
        }
      }).filter((el) => this.visible(el) && this.editable(el));
      if (!cands.length) return null;
      const area = (el) => {
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 0, height: 0 };
        return r.width * r.height;
      };
      return cands.sort((a, b) => area(b) - area(a))[0];
    }
    // Describes what the heuristics found so the user can confirm before anything is sent.
    describe() {
      const box = this.getInputBox();
      return { input: box ? `${box.tagName.toLowerCase()}${box.id ? `#${box.id}` : ""}` : null, assistantMessages: this.all(this.selectors.assistant).length };
    }
  };

  // src/content/genericAI.js
  installContentRuntime(new GenericAIAdapter());
})();
//# sourceMappingURL=content-generic.js.map
