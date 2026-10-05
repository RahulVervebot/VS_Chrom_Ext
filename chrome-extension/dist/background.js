(() => {
  // src/utils/ids.js
  function randomId(prefix, bytes = 6) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return `${prefix}-${[...a].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  }

  // src/bridge/bridgeProtocol.js
  var PROTOCOL = "ai-project";
  var PROTOCOL_VERSION = "1.0";
  var T = Object.freeze(Object.fromEntries([
    "PAIR_REQUEST",
    "PAIR_RESPONSE",
    "PROJECT_REGISTER",
    "PROJECT_REGISTER_RESPONSE",
    "ANALYSIS_REQUEST",
    "ANALYSIS_ACCEPTED",
    "ANALYSIS_BATCH",
    "ANALYSIS_BATCH_ACK",
    "ANALYSIS_PROGRESS",
    "ANALYSIS_COMPLETE",
    "AI_RESPONSE",
    "AI_RESPONSE_ACK",
    "KNOWLEDGE_PACKAGE",
    "KNOWLEDGE_PACKAGE_ACK",
    "KNOWLEDGE_MERGE_REQUEST",
    "KNOWLEDGE_MERGE_RESULT",
    "DOCUMENTATION_REQUEST",
    "DOCUMENTATION_RESPONSE",
    "COMPARISON_REQUEST",
    "COMPARISON_RESPONSE",
    "BLUEPRINT_REQUEST",
    "BLUEPRINT_RESPONSE",
    "CHANGE_PROPOSAL",
    "CANCEL_REQUEST",
    "PAUSE_REQUEST",
    "RESUME_REQUEST",
    "RETRY_REQUEST",
    "ERROR",
    "WARNING",
    "PING",
    "PONG",
    "SESSION_RESUME",
    "SESSION_RESUME_RESPONSE"
  ].map((t) => [t, t])));
  function createMessage(type, { sessionId = null, projectId = null, payload = {}, inReplyTo } = {}) {
    if (!T[type]) throw new Error(`Unknown message type ${type}`);
    const m = { protocol: PROTOCOL, protocolVersion: PROTOCOL_VERSION, messageId: randomId("msg"), messageType: type, sessionId, projectId, timestamp: (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z"), payload };
    if (inReplyTo) m.inReplyTo = inReplyTo;
    return m;
  }
  function parseMessage(raw) {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return { ok: false, error: "invalid JSON" };
    }
    if (!m || m.protocol !== PROTOCOL) return { ok: false, error: "unknown protocol" };
    if (String(m.protocolVersion).split(".")[0] !== PROTOCOL_VERSION.split(".")[0]) return { ok: false, error: `incompatible protocol version ${m.protocolVersion}` };
    if (!T[m.messageType] || !m.payload || typeof m.payload !== "object") return { ok: false, error: "invalid message" };
    return { ok: true, message: m };
  }

  // src/utils/storage.js
  var mem = /* @__PURE__ */ new Map();
  var hasChrome = () => typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  var storage = {
    async get(key, fallback) {
      if (hasChrome()) {
        const r = await chrome.storage.local.get(key);
        return r[key] === void 0 ? fallback : r[key];
      }
      return mem.has(key) ? JSON.parse(mem.get(key)) : fallback;
    },
    async set(key, value) {
      if (hasChrome()) return chrome.storage.local.set({ [key]: value });
      mem.set(key, JSON.stringify(value));
      return void 0;
    },
    async remove(key) {
      if (hasChrome()) return chrome.storage.local.remove(key);
      mem.delete(key);
      return void 0;
    },
    _reset() {
      mem.clear();
    }
  };
  var tails = /* @__PURE__ */ new Map();
  function update(key, fn, fallback) {
    const prev = tails.get(key) || Promise.resolve();
    const next = prev.catch(() => {
    }).then(async () => {
      const v = fn(await storage.get(key, fallback));
      await storage.set(key, v);
      return v;
    });
    tails.set(key, next.catch(() => {
    }));
    return next;
  }

  // src/utils/logger.js
  var MAX = 200;
  var scrub = (s) => String(s).replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[REDACTED_SECRET]").replace(/((?:sessionKey|pairingToken|token|password|secret)["'\s:=]+)["']?[^\s"',;]{6,}/gi, "$1[REDACTED_SECRET]");
  async function log(level, tag, message, data) {
    const entry = { at: (/* @__PURE__ */ new Date()).toISOString(), level, tag, message: scrub(message), data: data ? scrub(JSON.stringify(data)).slice(0, 500) : void 0 };
    if (typeof console !== "undefined") console[level === "error" ? "error" : "log"](`[${tag}] ${entry.message}`);
    try {
      await update("log", (l) => [...l, entry].slice(-MAX), []);
    } catch {
    }
  }

  // src/bridge/vscodeBridge.js
  var DURABLE = /* @__PURE__ */ new Set([T.AI_RESPONSE, T.KNOWLEDGE_PACKAGE, T.ANALYSIS_COMPLETE, T.CHANGE_PROPOSAL, T.DOCUMENTATION_RESPONSE, T.COMPARISON_RESPONSE, T.BLUEPRINT_RESPONSE]);
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function parsePairingCode(input, fallbackPort) {
    const raw = String(input || "").trim().toUpperCase();
    const m = /^(\d{2,5})\s*-\s*([A-Z0-9]{8,32})$/.exec(raw);
    if (m) return { port: Number(m[1]), token: m[2] };
    return { port: fallbackPort, token: raw };
  }
  var VsCodeBridge = class {
    constructor({ onStatus, WebSocketImpl } = {}) {
      this.WS = WebSocketImpl || WebSocket;
      this.onStatus = onStatus || (() => {
      });
      this.handlers = /* @__PURE__ */ new Map();
      this.waiters = [];
      this.state = "DISCONNECTED";
      this.ws = null;
      this.session = null;
      this.creds = null;
      this.wantConnected = false;
      this.attempt = 0;
      this.lastError = null;
    }
    on(type, fn) {
      this.handlers.set(type, fn);
      return this;
    }
    setState(s, err) {
      this.state = s;
      if (err !== void 0) this.lastError = err;
      this.onStatus({ state: s, session: this.session, error: this.lastError });
    }
    async loadCreds() {
      this.creds = await storage.get("pairing", null);
      return this.creds;
    }
    // ---- pairing (user typed the code shown in VS Code) ----
    async pair({ port, token }) {
      this.wantConnected = false;
      this.close();
      this.setState("PAIRING", null);
      let ws;
      try {
        ws = await this.open(port);
      } catch (e) {
        this.setState("DISCONNECTED", e.message);
        throw e;
      }
      const responded = this.waitFor(T.PAIR_RESPONSE, 18e4);
      ws.send(JSON.stringify(createMessage(T.PAIR_REQUEST, { payload: { pairingToken: token.trim(), clientName: "AI Project Bridge (Chrome)", clientVersion: typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest().version : "dev", protocolVersion: PROTOCOL_VERSION } })));
      let res;
      try {
        res = await responded;
      } catch (e) {
        this.close();
        this.setState("DISCONNECTED", e.message);
        throw e;
      }
      const p = res.payload;
      if (!p.accepted) {
        this.close();
        this.setState("DISCONNECTED", p.message || "Pairing failed");
        throw new Error(p.message || "Pairing failed");
      }
      const previousProject = this.creds ? this.creds.projectId : null;
      this.creds = { port, connectionId: p.connectionId, sessionKey: p.sessionKey, projectId: p.projectId };
      await storage.set("pairing", this.creds);
      this.session = { sessionId: p.sessionId, projectId: p.projectId, connectionId: p.connectionId, projectName: p.projectName };
      this.wantConnected = true;
      this.attempt = 0;
      this.setState("CONNECTED", null);
      await log("info", "BRIDGE", "paired with VS Code");
      if (previousProject && previousProject !== p.projectId && this.handlers.has("switched")) await this.handlers.get("switched")({ from: previousProject, to: p.projectId });
      this.flushOutbox();
      return p;
    }
    // ---- reconnect with the stored session (no new pairing) ----
    async connect() {
      if (!this.creds) await this.loadCreds();
      if (!this.creds) throw new Error("Not paired yet. Pair with VS Code first.");
      this.wantConnected = true;
      if (this.state === "CONNECTED" || this.state === "CONNECTING") return;
      this.setState("CONNECTING", null);
      try {
        const ws = await this.open(this.creds.port);
        const responded = this.waitFor(T.SESSION_RESUME_RESPONSE, 15e3);
        ws.send(JSON.stringify(createMessage(T.SESSION_RESUME, { payload: { connectionId: this.creds.connectionId, sessionKey: this.creds.sessionKey } })));
        const res = await responded;
        if (!res.payload.accepted) {
          this.wantConnected = false;
          this.close();
          await storage.remove("pairing");
          this.creds = null;
          this.setState("DISCONNECTED", res.payload.message || "VS Code no longer recognizes this browser. Pair again.");
          throw new Error(res.payload.message || "Resume refused");
        }
        this.session = { sessionId: res.payload.sessionId, projectId: res.payload.projectId, connectionId: this.creds.connectionId };
        this.attempt = 0;
        this.setState("CONNECTED", null);
        await log("info", "BRIDGE", "session resumed");
        if (this.handlers.has("resumed")) await this.handlers.get("resumed")(res.payload);
        this.flushOutbox();
      } catch (e) {
        if (this.state !== "DISCONNECTED") this.setState("DISCONNECTED", e.message);
        this.scheduleReconnect();
        throw e;
      }
    }
    open(port) {
      return new Promise((resolve, reject) => {
        const ws = new this.WS(`ws://127.0.0.1:${port}`);
        let opened = false;
        const timer = setTimeout(() => {
          try {
            ws.close();
          } catch {
          }
          reject(new Error(`VS Code is not listening on port ${port}. Run "AI Project: Pair Chrome" (or Connect Chrome) in VS Code.`));
        }, 8e3);
        ws.onopen = () => {
          opened = true;
          clearTimeout(timer);
          this.ws = ws;
          resolve(ws);
        };
        ws.onerror = () => {
          if (!opened) {
            clearTimeout(timer);
            reject(new Error(`Could not reach VS Code on 127.0.0.1:${port}. Is the bridge running?`));
          }
        };
        ws.onmessage = (ev) => this.onRaw(ev.data);
        ws.onclose = () => {
          if (this.ws === ws) {
            this.ws = null;
            this.onClosed();
          }
        };
      });
    }
    close() {
      const ws = this.ws;
      this.ws = null;
      if (ws) {
        try {
          ws.close();
        } catch {
        }
      }
    }
    disconnect() {
      this.wantConnected = false;
      this.close();
      this.session = null;
      this.setState("DISCONNECTED", null);
    }
    async forget() {
      this.disconnect();
      this.creds = null;
      await storage.remove("pairing");
    }
    onClosed() {
      const was = this.state;
      this.session = was === "CONNECTED" ? this.session : null;
      this.setState("DISCONNECTED");
      if (this.handlers.has("closed")) this.handlers.get("closed")();
      if (this.wantConnected) this.scheduleReconnect();
    }
    scheduleReconnect() {
      if (this.reconnecting || !this.wantConnected) return;
      this.reconnecting = true;
      const delay = Math.min(3e4, 1e3 * 2 ** Math.min(this.attempt++, 5));
      setTimeout(async () => {
        this.reconnecting = false;
        if (!this.wantConnected || this.state === "CONNECTED") return;
        try {
          await this.connect();
        } catch {
        }
      }, delay);
    }
    // ---- messaging ----
    onRaw(raw) {
      const p = parseMessage(raw);
      if (!p.ok) {
        log("warn", "BRIDGE", `dropped invalid message: ${p.error}`);
        return;
      }
      const m = p.message;
      if (m.messageType === T.PING) {
        this.sendNow(T.PONG, { nonce: m.payload.nonce });
        return;
      }
      const i = this.waiters.findIndex((w) => w.type === m.messageType);
      if (i >= 0) {
        const [w] = this.waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(m);
        return;
      }
      const h = this.handlers.get(m.messageType);
      if (h) Promise.resolve(h(m)).catch((e) => log("error", "BRIDGE", `handler for ${m.messageType} failed: ${e.message}`));
    }
    waitFor(type, ms) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.waiters = this.waiters.filter((w) => w.timer !== timer);
          reject(new Error(`No ${type} from VS Code within ${Math.round(ms / 1e3)}s`));
        }, ms);
        this.waiters.push({ type, resolve, timer });
      });
    }
    sendNow(type, payload, opts = {}) {
      if (!this.ws || this.ws.readyState !== 1) return false;
      this.ws.send(JSON.stringify(createMessage(type, { sessionId: this.session && this.session.sessionId, projectId: this.session && this.session.projectId, payload, inReplyTo: opts.inReplyTo })));
      return true;
    }
    // Durable messages are queued if the socket is down OR the message belongs to a different project than the current session.
    // opts.projectId names the project a message is for; it is only ever delivered to that project's session.
    async send(type, payload, opts = {}) {
      const target = opts.projectId || null;
      const here = this.session ? this.session.projectId : null;
      if (this.state === "CONNECTED" && (!target || target === here) && this.sendNow(type, payload, opts)) return true;
      if (DURABLE.has(type)) {
        await update("outbox", (q) => [...q, { type, payload, opts: { inReplyTo: opts.inReplyTo }, projectId: target || this.creds && this.creds.projectId || null, queuedAt: (/* @__PURE__ */ new Date()).toISOString() }].slice(-200), []);
      }
      return false;
    }
    async flushOutbox() {
      if (this.flushing) return;
      this.flushing = true;
      try {
        const here = this.session ? this.session.projectId : null;
        const q = await storage.get("outbox", []);
        const mine = q.filter((m) => !m.projectId || m.projectId === here);
        if (!mine.length) return;
        await storage.set("outbox", q.filter((m) => !mine.includes(m)));
        for (const m of mine) {
          if (!this.sendNow(m.type, m.payload, m.opts)) {
            await update("outbox", (cur) => [m, ...cur], []);
            break;
          }
          await sleep(20);
        }
        await log("info", "BRIDGE", `delivered ${mine.length} queued message(s)`);
      } finally {
        this.flushing = false;
      }
    }
  };

  // src/knowledge/knowledgeStore.js
  var KEYS = { analyses: "analyses", projects: "projects", results: "results" };
  var knowledgeStore = {
    async getAnalyses() {
      return storage.get(KEYS.analyses, {});
    },
    async getAnalysis(id) {
      return (await storage.get(KEYS.analyses, {}))[id] || null;
    },
    saveAnalysis(id, patch) {
      return update(KEYS.analyses, (all) => ({ ...all, [id]: { ...all[id] || {}, ...patch, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } }), {});
    },
    // Checkpoint after every successful AI response: analysisId, batchId, status, response, knowledge, timestamp.
    checkpoint(analysisId, batchId, data) {
      return update(KEYS.analyses, (all) => {
        const a = all[analysisId] || { batches: {} };
        const batches = { ...a.batches || {}, [batchId]: { ...(a.batches || {})[batchId] || {}, ...data, batchId, analysisId, timestamp: (/* @__PURE__ */ new Date()).toISOString() } };
        return { ...all, [analysisId]: { ...a, batches, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } };
      }, {});
    },
    async completedBatches(analysisId) {
      const a = await this.getAnalysis(analysisId);
      return Object.values(a && a.batches || {}).filter((b) => b.status === "completed").map((b) => b.batchId);
    },
    async batchKnowledge(analysisId) {
      const a = await this.getAnalysis(analysisId);
      return Object.values(a && a.batches || {}).filter((b) => b.status === "completed" && b.knowledge).sort((x, y) => (x.batchNumber || 0) - (y.batchNumber || 0)).map((b) => b.knowledge);
    },
    removeAnalysis(id) {
      return update(KEYS.analyses, (all) => {
        const n = { ...all };
        delete n[id];
        return n;
      }, {});
    },
    registerProject(p) {
      return update(KEYS.projects, (all) => ({ ...all, [p.projectId]: { ...all[p.projectId] || {}, ...p, lastSeen: (/* @__PURE__ */ new Date()).toISOString() } }), {});
    },
    async getProjects() {
      return storage.get(KEYS.projects, {});
    },
    addResult(kind, record) {
      return update(KEYS.results, (all) => [...all, { kind, at: (/* @__PURE__ */ new Date()).toISOString(), ...record }].slice(-100), []);
    },
    async getResults(kind) {
      const all = await storage.get(KEYS.results, []);
      return kind ? all.filter((r) => r.kind === kind) : all;
    }
  };

  // src/knowledge/knowledgeMerger.js
  var RANK = { UNKNOWN: 0, INFERRED: 1, VERIFIED: 2 };
  var evKey = (e) => `${e.file}|${e.symbol || ""}|${e.lineStart || ""}|${e.lineEnd || ""}`;
  var dedupeEvidence = (list) => {
    const seen = /* @__PURE__ */ new Set();
    return list.filter((e) => {
      const k = evKey(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  function mergeClaims(a = [], b = []) {
    const map = new Map(a.map((c) => [c.claim, c]));
    for (const c of b) {
      const p = map.get(c.claim);
      if (!p) {
        map.set(c.claim, c);
        continue;
      }
      const winner = RANK[c.status] > RANK[p.status] ? c : p;
      map.set(c.claim, { ...winner, evidence: dedupeEvidence([...p.evidence || [], ...c.evidence || []]) });
    }
    return [...map.values()];
  }
  var uniq = (a = [], b = []) => [...new Set([...a, ...b].map((x) => typeof x === "string" ? x : JSON.stringify(x)))].map((x) => {
    try {
      return JSON.parse(x);
    } catch {
      return x;
    }
  });
  var firstText = (a, b) => a && String(a).trim() ? a : b;
  function mergeKnowledge(list) {
    const out = { files: /* @__PURE__ */ new Map(), features: /* @__PURE__ */ new Map(), workflows: /* @__PURE__ */ new Map(), entities: /* @__PURE__ */ new Map(), relationships: /* @__PURE__ */ new Map(), dependencies: /* @__PURE__ */ new Map(), architecture: { overview: void 0, claims: [] }, evidence: [], unknowns: [], changeProposals: [] };
    for (const k of list) {
      for (const f of k.files || []) {
        const p = out.files.get(f.path);
        out.files.set(f.path, p ? { ...p, ...f, purpose: firstText(p.purpose, f.purpose), role: firstText(p.role, f.role), claims: mergeClaims(p.claims, f.claims), unknowns: uniq(p.unknowns, f.unknowns) } : { ...f, claims: f.claims || [], unknowns: f.unknowns || [] });
      }
      for (const f of k.features || []) {
        const p = out.features.get(f.id);
        out.features.set(f.id, p ? { ...p, ...f, purpose: firstText(p.purpose, f.purpose), files: uniq(p.files, f.files), claims: mergeClaims(p.claims, f.claims) } : { ...f, files: f.files || [], claims: f.claims || [] });
      }
      for (const w of k.workflows || []) {
        const p = out.workflows.get(w.id);
        const steps = new Map([...p ? p.steps : [], ...w.steps || []].map((s) => [`${s.file}|${s.symbol}|${s.kind}`, s]));
        out.workflows.set(w.id, { ...p || {}, ...w, purpose: firstText(p && p.purpose, w.purpose), steps: [...steps.values()], businessRules: mergeClaims(p && p.businessRules, w.businessRules), claims: mergeClaims(p && p.claims, w.claims) });
      }
      for (const e of k.database && k.database.entities || []) {
        const p = out.entities.get(e.name);
        const fields = new Map([...p ? p.fields : [], ...e.fields || []].map((f) => [f.name, f]));
        out.entities.set(e.name, { ...p || {}, ...e, purpose: firstText(p && p.purpose, e.purpose), fields: [...fields.values()], claims: mergeClaims(p && p.claims, e.claims) });
      }
      for (const r of k.database && k.database.relationships || []) out.relationships.set(`${r.from}|${r.to}|${r.type || ""}`, r);
      for (const d of k.dependencies || []) out.dependencies.set(`${d.from}|${d.to}`, d);
      if (k.architecture) {
        out.architecture.overview = firstText(out.architecture.overview, k.architecture.overview);
        out.architecture.claims = mergeClaims(out.architecture.claims, k.architecture.claims);
      }
      out.evidence = mergeClaims(out.evidence, k.evidence);
      out.unknowns = uniq(out.unknowns, k.unknowns);
      if (k.changeProposal) out.changeProposals.push(k.changeProposal);
    }
    return {
      knowledge: {
        files: [...out.files.values()],
        features: [...out.features.values()],
        workflows: [...out.workflows.values()],
        database: { entities: [...out.entities.values()], relationships: [...out.relationships.values()] },
        architecture: out.architecture.overview || out.architecture.claims.length ? out.architecture : {},
        dependencies: [...out.dependencies.values()]
      },
      evidence: out.evidence,
      unknowns: out.unknowns,
      changeProposals: out.changeProposals
    };
  }

  // src/knowledge/sanitizer.js
  var STATUSES = /* @__PURE__ */ new Set(["VERIFIED", "INFERRED", "UNKNOWN"]);
  function fixClaim(c, allowed, notes) {
    const status = STATUSES.has(c.status) ? c.status : "UNKNOWN";
    const evidence = (c.evidence || []).filter((e) => {
      const ok = allowed.has(e.file);
      if (!ok) notes.push(`evidence cites ${e.file}, which was not part of this batch`);
      return ok;
    }).map((e) => ({ ...e, sha256: allowed.get(e.file) }));
    let s = status;
    if (s === "VERIFIED" && evidence.length === 0) {
      s = "INFERRED";
      notes.push(`claim "${String(c.claim).slice(0, 60)}" had no valid evidence; downgraded to INFERRED`);
    }
    return { ...c, status: s, evidence };
  }
  function sanitizeKnowledge(k, batchFiles) {
    const allowed = new Map(batchFiles.map((f) => [f.path, f.hash]));
    const notes = [];
    const claims = (list) => (list || []).map((c) => fixClaim(c, allowed, notes));
    const out = { ...k };
    out.files = (k.files || []).filter((f) => {
      const ok = allowed.has(f.path);
      if (!ok) notes.push(`dropped file item for ${f.path}: not part of this batch`);
      return ok;
    }).map((f) => ({ ...f, sha256: allowed.get(f.path), claims: claims(f.claims) }));
    out.features = (k.features || []).map((f) => ({ ...f, files: (f.files || []).filter((p) => allowed.has(p)), claims: claims(f.claims) }));
    out.workflows = (k.workflows || []).map((w) => ({ ...w, steps: (w.steps || []).map((s) => ({ ...s, status: STATUSES.has(s.status) ? s.status : "INFERRED" })), businessRules: claims(w.businessRules), claims: claims(w.claims) }));
    if (k.database) {
      out.database = {
        entities: (k.database.entities || []).map((e) => ({ ...e, fields: (e.fields || []).map((f) => ({ ...f, evidence: (f.evidence || []).filter((x) => allowed.has(x.file)).map((x) => ({ ...x, sha256: allowed.get(x.file) })) })), claims: claims(e.claims) })),
        relationships: (k.database.relationships || []).map((r) => ({ ...r, evidence: (r.evidence || []).filter((x) => allowed.has(x.file)).map((x) => ({ ...x, sha256: allowed.get(x.file) })) }))
      };
    }
    if (k.architecture) out.architecture = { ...k.architecture, claims: claims(k.architecture.claims) };
    out.evidence = claims(k.evidence);
    out.unknowns = [...k.unknowns || [], ...notes.slice(0, 20).map((n) => `NOTE: ${n}`)];
    if (k.changeProposal) {
      out.changeProposal = { ...k.changeProposal, changes: k.changeProposal.changes.filter((c) => c.operation === "CREATE" || allowed.has(c.path)).map((c) => ({ ...c, ...c.operation === "CREATE" ? {} : { expectedHash: allowed.get(c.path) } })) };
      if (!out.changeProposal.changes.length) delete out.changeProposal;
    }
    return { knowledge: out, notes };
  }

  // src/knowledge/schemaValidator.js
  var STATUSES2 = ["VERIFIED", "INFERRED", "UNKNOWN"];
  var isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  var str = (v, max = 8e3) => typeof v === "string" && v.length <= max;
  function checkEvidence(list, at, errors) {
    if (list === void 0) return;
    if (!Array.isArray(list)) {
      errors.push(`${at}: evidence must be an array`);
      return;
    }
    list.forEach((e, i) => {
      if (!isObj(e) || !str(e.file, 500)) errors.push(`${at}[${i}]: evidence needs a file`);
      else {
        for (const k of ["lineStart", "lineEnd"]) if (e[k] !== void 0 && !(Number.isInteger(e[k]) && e[k] >= 1)) errors.push(`${at}[${i}].${k}: must be a positive integer`);
        if (e.symbol !== void 0 && !str(e.symbol, 300)) errors.push(`${at}[${i}].symbol: must be a string`);
      }
    });
  }
  function checkClaims(list, at, errors) {
    if (list === void 0) return;
    if (!Array.isArray(list)) {
      errors.push(`${at}: claims must be an array`);
      return;
    }
    list.forEach((c, i) => {
      if (!isObj(c) || !str(c.claim, 2e3)) errors.push(`${at}[${i}]: claim text required`);
      else {
        if (!STATUSES2.includes(c.status)) errors.push(`${at}[${i}].status: must be VERIFIED, INFERRED or UNKNOWN`);
        checkEvidence(c.evidence, `${at}[${i}].evidence`, errors);
      }
    });
  }
  var arr = (v, at, errors) => {
    if (v === void 0) return [];
    if (!Array.isArray(v)) {
      errors.push(`${at}: must be an array`);
      return [];
    }
    return v;
  };
  function validateBatchKnowledge(k) {
    const errors = [];
    if (!isObj(k)) return { valid: false, errors: ["response must be a JSON object"] };
    arr(k.files, "files", errors).forEach((f, i) => {
      if (!isObj(f) || !str(f.path, 500)) {
        errors.push(`files[${i}]: path required`);
        return;
      }
      for (const key of ["purpose", "role"]) if (f[key] !== void 0 && !str(f[key])) errors.push(`files[${i}].${key}: must be a string`);
      checkClaims(f.claims, `files[${i}].claims`, errors);
    });
    arr(k.features, "features", errors).forEach((f, i) => {
      if (!isObj(f) || !str(f.id, 200)) errors.push(`features[${i}]: id required`);
      else checkClaims(f.claims, `features[${i}].claims`, errors);
    });
    arr(k.workflows, "workflows", errors).forEach((w, i) => {
      if (!isObj(w) || !str(w.id, 200)) {
        errors.push(`workflows[${i}]: id required`);
        return;
      }
      arr(w.steps, `workflows[${i}].steps`, errors).forEach((s, j) => {
        if (!isObj(s)) errors.push(`workflows[${i}].steps[${j}]: must be an object`);
        else if (s.status !== void 0 && !STATUSES2.includes(s.status)) errors.push(`workflows[${i}].steps[${j}].status: invalid`);
      });
      checkClaims(w.claims, `workflows[${i}].claims`, errors);
      checkClaims(w.businessRules, `workflows[${i}].businessRules`, errors);
    });
    if (k.database !== void 0) {
      if (!isObj(k.database)) errors.push("database: must be an object");
      else {
        arr(k.database.entities, "database.entities", errors).forEach((e, i) => {
          if (!isObj(e) || !str(e.name, 200)) {
            errors.push(`database.entities[${i}]: name required`);
            return;
          }
          arr(e.fields, `database.entities[${i}].fields`, errors).forEach((f, j) => {
            if (!isObj(f) || !str(f.name, 200)) errors.push(`database.entities[${i}].fields[${j}]: name required`);
            else checkEvidence(f.evidence, `database.entities[${i}].fields[${j}].evidence`, errors);
          });
          checkClaims(e.claims, `database.entities[${i}].claims`, errors);
        });
        arr(k.database.relationships, "database.relationships", errors).forEach((r, i) => {
          if (!isObj(r) || !str(r.from, 200) || !str(r.to, 200)) errors.push(`database.relationships[${i}]: from and to required`);
          else checkEvidence(r.evidence, `database.relationships[${i}].evidence`, errors);
        });
      }
    }
    if (k.architecture !== void 0) {
      if (!isObj(k.architecture)) errors.push("architecture: must be an object");
      else checkClaims(k.architecture.claims, "architecture.claims", errors);
    }
    arr(k.dependencies, "dependencies", errors).forEach((d, i) => {
      if (!isObj(d) || !str(d.from, 500) || !str(d.to, 500)) errors.push(`dependencies[${i}]: from and to required`);
    });
    checkClaims(k.evidence, "evidence", errors);
    arr(k.unknowns, "unknowns", errors);
    if (k.changeProposal !== void 0) {
      const c = k.changeProposal;
      if (!isObj(c) || !str(c.title, 300) || !Array.isArray(c.changes) || !c.changes.length) errors.push("changeProposal: title and a non-empty changes array required");
      else c.changes.forEach((ch, i) => {
        if (!isObj(ch) || !str(ch.path, 500) || !["MODIFY", "CREATE", "DELETE"].includes(ch.operation)) errors.push(`changeProposal.changes[${i}]: path and operation required`);
      });
    }
    const known = ["analysisType", "files", "features", "workflows", "database", "architecture", "dependencies", "evidence", "unknowns", "changeProposal"];
    const extra = Object.keys(k).filter((x) => !known.includes(x));
    const anyKnown = known.slice(1).some((x) => k[x] !== void 0);
    if (!anyKnown) errors.push(`response contains none of the expected sections (${known.slice(1).join(", ")})`);
    return { valid: errors.length === 0, errors: errors.slice(0, 20), ignoredKeys: extra };
  }
  function validateOutboundPackage(pkg) {
    const errors = [];
    if (!isObj(pkg)) return { valid: false, errors: ["package must be an object"] };
    if (pkg.packageType !== "KNOWLEDGE_PACKAGE") errors.push("packageType must be KNOWLEDGE_PACKAGE");
    if (pkg.schemaVersion !== "1.0") errors.push("schemaVersion must be 1.0");
    for (const k of ["projectId", "analysisId"]) if (!str(pkg[k], 100)) errors.push(`${k} required`);
    if (!isObj(pkg.source) || !str(pkg.source.provider, 100)) errors.push("source.provider required");
    if (!isObj(pkg.knowledge)) errors.push("knowledge required");
    else {
      const r = validateBatchKnowledge({ ...pkg.knowledge, files: pkg.knowledge.files || [] });
      if (!r.valid && !/none of the expected/.test(r.errors.join())) errors.push(...r.errors);
    }
    return { valid: errors.length === 0, errors };
  }

  // src/utils/text.js
  function estimateTokens(text) {
    return text ? Math.ceil(text.length / 3.6) : 0;
  }

  // src/batching/batchManager.js
  var numbered = (content) => content.split("\n").map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join("\n");
  function applyLimits(batch, settings) {
    const files = [];
    const warnings = [];
    let lines = 0;
    for (const f of batch.context.files.slice(0, settings.maxFilesPerRequest)) {
      let content = f.content;
      const l = content.split("\n");
      if (l.length > settings.maxLinesPerFile) {
        content = l.slice(0, settings.maxLinesPerFile).join("\n") + "\n/* [TRUNCATED by AI Project Bridge] */";
        warnings.push(`${f.path} truncated to ${settings.maxLinesPerFile} lines`);
      }
      lines += Math.min(l.length, settings.maxLinesPerFile);
      if (lines > settings.maxTotalLines) {
        warnings.push(`${f.path} omitted: maxTotalLines reached`);
        continue;
      }
      files.push({ ...f, content });
    }
    if (batch.context.files.length > settings.maxFilesPerRequest) warnings.push(`${batch.context.files.length - settings.maxFilesPerRequest} file(s) omitted: maxFilesPerRequest`);
    return { batch: { ...batch, context: { ...batch.context, files } }, warnings };
  }
  function splitBatch(batch) {
    const files = batch.context.files;
    if (files.length < 2) return null;
    const mid = Math.ceil(files.length / 2);
    const mk = (part, suffix) => {
      const paths = new Set(part.map((f) => f.path));
      return { ...batch, batchId: `${batch.batchId}${suffix}`, parentBatchId: batch.parentBatchId || batch.batchId, context: { ...batch.context, files: part, symbols: batch.context.symbols.filter((s) => paths.has(s.file)), dependencies: batch.context.dependencies.filter((d) => paths.has(d.from)), apis: batch.context.apis.filter((a) => paths.has(a.file)) } };
    };
    return [mk(files.slice(0, mid), "a"), mk(files.slice(mid), "b")];
  }

  // src/ai/contextBuilder.js
  var CONTEXT_BEGIN = "BEGIN_CONTEXT_JSON";
  var CONTEXT_END = "END_CONTEXT_JSON";
  function renderFiles(files) {
    return files.map((f) => `=== FILE: ${f.path} | ${f.hash} | ${f.language}${f.truncated ? " | TRUNCATED" : ""} ===
${numbered(f.content)}
=== END FILE ===`).join("\n\n");
  }
  function renderContextJson(batch, crossBatch) {
    const c = batch.context;
    return JSON.stringify({
      batch: { analysisId: batch.analysisId, batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches, purpose: batch.purpose, previousContextReference: batch.previousContextReference },
      project: c.project,
      projectOverview: c.projectOverview,
      analysis: c.analysis,
      selection: batch.selection,
      filesInThisBatch: c.files.map((f) => ({ path: f.path, sha256: f.hash, language: f.language, relation: f.relation, exports: f.exports, dependencies: f.dependencies, dependents: f.dependents })),
      staticFacts: { symbols: c.symbols, dependencies: c.dependencies, apis: c.apis, clientApiCalls: c.clientApiCalls, database: c.database, workflows: c.workflows, features: c.features },
      crossBatch,
      existingKnowledge: c.existingKnowledge
    });
  }

  // src/ai/promptBuilder.js
  var RULES = `RULES (follow exactly)
1. The source code in this message is the only source of truth. Do not use outside knowledge about what this project "probably" does.
2. Never invent files, functions, classes, components, API endpoints, tables, columns, relationships, dependencies, services, configuration or business rules. If something is not present in the provided material, write it as UNKNOWN or omit it.
3. Label every claim: "VERIFIED" = directly supported by the cited lines; "INFERRED" = a reasonable interpretation that is not directly stated; "UNKNOWN" = cannot be determined from what was provided.
4. Every VERIFIED claim MUST cite evidence: {"file", "symbol" (if any), "lineStart", "lineEnd"}. Use ONLY files listed under "filesInThisBatch". Line numbers are printed at the left of each source line ("  12| code"); do not include them in code you quote.
5. If a dependency or related file was NOT provided, do not describe what it does. Record it under "unknowns".
6. "staticFacts" were extracted by a static analyzer from the real project. Treat them as reliable but incomplete. Do not contradict them without citing evidence.
7. Reply with exactly ONE JSON object inside a single \`\`\`json code block. No prose before or after it.`;
  var SCHEMA = `RESPONSE SCHEMA (omit sections you have nothing verified for; all keys optional except at least one section)
{
  "analysisType": "<mode>",
  "files": [{ "path": "<one of filesInThisBatch>", "purpose": "...", "role": "...", "claims": [Claim], "unknowns": ["..."] }],
  "features": [{ "id": "kebab-case", "name": "...", "purpose": "...", "files": ["..."], "claims": [Claim] }],
  "workflows": [{ "id": "kebab-case", "name": "...", "purpose": "...", "api": { "method": "POST", "endpoint": "/api/x" },
      "steps": [{ "kind": "trigger|frontend|api-call|route|controller|service|logic|db-read|db-write|external-service|response", "file": "...", "symbol": "...", "description": "...", "status": "VERIFIED|INFERRED|UNKNOWN" }],
      "businessRules": [Claim], "claims": [Claim] }],
  "database": { "entities": [{ "name": "...", "purpose": "...", "fields": [{ "name": "...", "type": "...", "evidence": [Evidence] }], "claims": [Claim] }],
                "relationships": [{ "from": "...", "to": "...", "type": "one-to-many|many-to-one|one-to-one|many-to-many", "evidence": [Evidence] }] },
  "architecture": { "overview": "...", "claims": [Claim] },
  "dependencies": [{ "from": "<file>", "to": "<file>" }],
  "evidence": [Claim],
  "unknowns": ["..."]
}
Claim = { "claim": "one factual statement", "status": "VERIFIED|INFERRED|UNKNOWN", "subject": "the identifier the claim is about (optional)", "evidence": [Evidence] }
Evidence = { "file": "path", "symbol": "name", "lineStart": 1, "lineEnd": 5 }`;
  var FILE_TASK = `TASK: FILE ANALYSIS
For each file that matters to understanding how the system works, report: purpose, role, entry points, functions/classes/components, inputs, outputs, imports, exports, dependencies, dependents, APIs, database access, state, side effects, business logic, error handling, security, related features and workflows, tests, and unknowns.
Prioritize how the code participates in workflows and data flow over describing every function. Skip trivial files.`;
  var WORKFLOW_TASK = `TASK: WORKFLOW ANALYSIS
Reconstruct each workflow from the source, following the call path. Answer for each workflow, citing evidence:
- What starts this workflow? What does the user do?
- Which frontend components and functions participate? Which services execute? Which APIs are called and what data is sent?
- How is the data validated? What backend code receives it, and what business logic executes?
- Which database entities are read? Which are modified?
- What external services are called? What response is returned, how does the frontend process it, and how does the UI change?
Return each as an item in "workflows" with ordered "steps". Use the static workflow traces in staticFacts.workflows as the skeleton: confirm, refine or flag them; add "purpose" and "businessRules" only when the code shows them.`;
  var DATABASE_TASK = `TASK: DATABASE ANALYSIS
Focus on: database technology, tables/collections/models, fields, primary keys, foreign keys, indexes, relationships, queries, mutations, transactions, validation, data transformations, the files that access each entity, and the features/workflows/APIs that use them.
Then describe the data flow per API: UI -> API -> service -> database operation -> entity -> relationship -> result -> API -> UI.
Only report relationships and fields visible in the provided source. Put anything else under "unknowns".`;
  var FEATURE_TASK = `TASK: FEATURE ANALYSIS
Describe each feature in the selection: its components, services, APIs, workflows, database entities, tests, and related authentication/payment/order behaviour, based only on the provided files. Return "features", plus "workflows", "database" and "files" details where relevant.`;
  var ARCHITECTURE_TASK = `TASK: ARCHITECTURE / PROJECT ANALYSIS
Understand the application as a system: users -> frontend -> state -> services -> APIs -> backend -> business logic -> database -> external services -> response. Identify major workflows first, then data flow, features, APIs, dependencies and architecture. Do not spend effort re-describing individual files.`;
  var CHANGE_IMPACT_TASK = `TASK: CHANGE IMPACT ANALYSIS
The user describes a change (see "purpose"). Using only the provided files and staticFacts, explain which files, functions, workflows, features, APIs and database entities would be affected and what could break. Do NOT propose code. Put findings in "files", "workflows", "features" and "unknowns".`;
  var CHANGE_PLAN_TASK = `TASK: CHANGE PLAN
The user describes a change (see "purpose"). First give the impact analysis as in a change-impact analysis. Then, only if you are certain the change is safe and fully determined by the provided files, include "changeProposal":
{ "title": "...", "rationale": "...", "changes": [{ "path": "<file in this batch>", "operation": "MODIFY", "edits": [{ "find": "<exact text from the file, unique, WITHOUT line numbers>", "replace": "<new text>" }] }] }
Each "find" must match the file exactly once. Never touch .env files or secrets. Never invent files that the change depends on. If unsure, omit "changeProposal" and explain in "unknowns". Your proposal is only a proposal: a human reviews the diff in VS Code before anything is applied.`;
  function taskFor(batch) {
    const { mode, intent } = batch.context.analysis;
    if (intent === "CHANGE_PLAN") return CHANGE_PLAN_TASK;
    if (intent === "CHANGE_IMPACT") return CHANGE_IMPACT_TASK;
    switch (mode) {
      case "WORKFLOW":
        return WORKFLOW_TASK;
      case "DATABASE":
        return DATABASE_TASK;
      case "FEATURE":
        return FEATURE_TASK;
      case "PROJECT":
        return ARCHITECTURE_TASK;
      case "FOLDER":
        return `${WORKFLOW_TASK}

Then, briefly:
${FILE_TASK}`;
      default:
        return FILE_TASK;
    }
  }
  function buildBatchPrompt(batch, crossBatch) {
    const a = batch.context.analysis;
    return [
      `You are helping the "AI Project Intelligence" tool build verified, evidence-based documentation of a software project. This is batch ${batch.batchNumber} of ${batch.totalBatches} of analysis ${batch.analysisId} (mode ${a.mode}${a.purpose ? `; purpose: ${a.purpose}` : ""}). Earlier batches are summarized in "crossBatch"; you do not need any earlier chat messages.`,
      RULES,
      taskFor(batch),
      SCHEMA,
      `CONTEXT
${CONTEXT_BEGIN}
${renderContextJson(batch, crossBatch)}
${CONTEXT_END}`,
      `SOURCE FILES
${renderFiles(batch.context.files)}`,
      "Now respond with the single JSON object in one ```json code block."
    ].join("\n\n");
  }
  function buildCorrectionPrompt(errors, truncated) {
    return [
      truncated ? "Your previous reply was cut off before the JSON was complete." : "Your previous reply could not be used because it was not valid against the required JSON schema.",
      "Problems found:",
      ...errors.slice(0, 10).map((e) => `- ${e}`),
      truncated ? "Reply again with the COMPLETE JSON object in one ```json code block. Make it shorter: keep only the most important, evidence-backed items and omit low-value claims." : "Reply again with ONLY the corrected JSON object in one ```json code block. Do not add new claims; fix the structure. Keep evidence and statuses honest (UNKNOWN when not determinable)."
    ].join("\n");
  }

  // src/batching/contextManager.js
  function summarizeFindings(knowledgeList, maxTokens = 2500) {
    const summary = { files: [], workflows: [], entities: [], features: [], unknowns: [] };
    for (const k of knowledgeList) {
      for (const f of k.files || []) summary.files.push({ path: f.path, purpose: (f.purpose || "").slice(0, 160) });
      for (const w of k.workflows || []) summary.workflows.push({ id: w.id, name: w.name });
      for (const e of k.database && k.database.entities || []) summary.entities.push({ name: e.name, fields: (e.fields || []).map((f) => f.name).slice(0, 25) });
      for (const f of k.features || []) summary.features.push({ id: f.id, name: f.name });
      for (const u of k.unknowns || []) if (typeof u === "string" && !u.startsWith("NOTE:")) summary.unknowns.push(u.slice(0, 160));
    }
    let text = JSON.stringify(summary);
    while (estimateTokens(text) > maxTokens) {
      const biggest = Object.keys(summary).sort((a, b) => summary[b].length - summary[a].length)[0];
      if (!summary[biggest].length) break;
      summary[biggest] = summary[biggest].slice(0, Math.floor(summary[biggest].length * 0.7));
      text = JSON.stringify(summary);
    }
    return summary;
  }
  function buildCrossBatch(batch, ownPreviousKnowledge) {
    return {
      fromVsCode: batch.context.crossBatch || null,
      previousFindings: summarizeFindings([...(batch.crossBatchFindings || []).map((f) => f.knowledge), ...ownPreviousKnowledge])
    };
  }

  // src/ai/responseParser.js
  function findJsonObjects(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== "{") continue;
      let depth = 0;
      let quote = false;
      let esc = false;
      for (let j = i; j < text.length; j++) {
        const c = text[j];
        if (quote) {
          if (esc) esc = false;
          else if (c === "\\") esc = true;
          else if (c === '"') quote = false;
          continue;
        }
        if (c === '"') quote = true;
        else if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) {
            out.push(text.slice(i, j + 1));
            i = j;
            break;
          }
        }
      }
    }
    return out.sort((a, b) => b.length - a.length);
  }
  function looksTruncated(text) {
    const start = text.indexOf("{");
    if (start === -1) return false;
    let depth = 0;
    let quote = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') quote = false;
        continue;
      }
      if (c === '"') quote = true;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    return depth > 0;
  }
  function parseAiResponse(input) {
    const text = typeof input === "string" ? input : input.text || "";
    const blocks = typeof input === "string" ? [] : input.codeBlocks || [];
    const candidates = [];
    for (const b of blocks) candidates.push(...findJsonObjects(b));
    for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.push(...findJsonObjects(m[1]));
    candidates.push(...findJsonObjects(text));
    const errors = [];
    const seen = /* @__PURE__ */ new Set();
    for (const c of candidates) {
      if (seen.has(c)) continue;
      seen.add(c);
      let obj;
      try {
        obj = JSON.parse(c);
      } catch (e) {
        errors.push(`JSON syntax: ${e.message}`);
        continue;
      }
      const v = validateBatchKnowledge(obj);
      if (v.valid) return { ok: true, knowledge: obj, errors: [], truncated: false };
      errors.push(...v.errors);
    }
    const truncated = looksTruncated(blocks.join("\n") || text) || looksTruncated(text);
    if (!candidates.length) errors.push(truncated ? "the JSON was cut off before it was complete" : "no JSON object found in the response");
    return { ok: false, knowledge: null, errors: [...new Set(errors)].slice(0, 12), truncated };
  }
  function parseAnyJson(input) {
    const text = typeof input === "string" ? input : input.text || "";
    const blocks = typeof input === "string" ? [] : input.codeBlocks || [];
    const cands = [...blocks.flatMap(findJsonObjects), ...findJsonObjects(text)];
    for (const c of cands) {
      try {
        return { ok: true, value: JSON.parse(c) };
      } catch {
      }
    }
    return { ok: false, value: null, truncated: looksTruncated(text), errors: [looksTruncated(text) ? "the JSON was cut off before it was complete" : "no valid JSON object found"] };
  }

  // src/documentation/workflowDocumentation.js
  var workflowDocPrompt = () => `DOCUMENT TYPE: workflow. Sections: Workflow Name, Purpose, Trigger, User Journey, Frontend Flow, Backend Flow, API Flow, Database Flow, Data Transformation, Business Rules, External Services, Files, Functions, Database Entities, Dependencies, Dependents, Error Handling, Security, Tests, Evidence, Unknowns, Change Impact.`;

  // src/documentation/databaseDocumentation.js
  var databaseDocPrompt = () => `DOCUMENT TYPE: database entity or schema. Sections: Entity Name, Purpose, Type, Fields, Relationships, Features, Workflows, Queries, Mutations, Files, Services, APIs, Business Rules, Indexes, Constraints, Transactions, Security, Evidence, Unknowns. Only relationships supported by evidence.`;

  // src/documentation/featureDocumentation.js
  var featureDocPrompt = () => `DOCUMENT TYPE: feature. Sections: Feature, Purpose, Components, Services, APIs, Workflows, Database Entities, Business Rules, Tests, Dependencies, Unknowns.`;

  // src/documentation/architectureDocumentation.js
  var architectureDocPrompt = () => `DOCUMENT TYPE: architecture. Sections: Project Overview, Architecture Overview, Application Flow, Frontend Architecture, Backend Architecture, API Architecture, Database Architecture, Data Flow, Dependency Map, Authentication, Authorization, External Services, Technology Stack, Testing, Deployment. State clearly which parts have not been analyzed.`;

  // src/documentation/documentationManager.js
  var BY_KIND = { workflow: workflowDocPrompt, database: databaseDocPrompt, feature: featureDocPrompt, architecture: architectureDocPrompt };
  function buildDocumentationPrompt(payload) {
    const kind = payload.kind || "architecture";
    const section = (BY_KIND[kind] || architectureDocPrompt)();
    return [
      'You are writing documentation for the "AI Project Intelligence" tool from verified project knowledge (below). Write for developers new to the project.',
      RULES.split("\n").filter((l) => !/^7\./.test(l)).join("\n"),
      section,
      'OUTPUT: reply with one JSON object in a ```json code block: { "key": "<the key given>", "markdown": "<the document in Markdown>" }. In the Markdown, mark unverifiable statements with (INFERRED) or UNKNOWN and never state anything not present in the knowledge.',
      `KEY: ${payload.key}`,
      `KNOWLEDGE
BEGIN_CONTEXT_JSON
${JSON.stringify(payload.knowledge || payload.context || {})}
END_CONTEXT_JSON`
    ].join("\n\n");
  }
  function validateDocumentationResponse(value, key) {
    if (!value || typeof value.markdown !== "string" || !value.markdown.trim()) return { ok: false, errors: ['"markdown" must be a non-empty string'] };
    return { ok: true, doc: { key, markdown: value.markdown } };
  }

  // src/comparison/projectComparator.js
  var SECTIONS = ["commonApproaches", "differences", "architecturalDifferences", "databaseDifferences", "workflowDifferences", "reusablePatterns", "migrationConsiderations", "unknowns"];
  var FORBIDDEN = /* @__PURE__ */ new Set(["score", "scores", "rank", "ranking", "winner", "best", "overallScore", "rating"]);
  var strip = (v) => Array.isArray(v) ? v.map(strip) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k]) => !FORBIDDEN.has(k)).map(([k, x]) => [k, strip(x)])) : v;
  function comparisonPrompt(payload, focus) {
    return [
      `You are comparing software projects for the "AI Project Intelligence" tool. ${focus}`,
      RULES.split("\n").filter((l) => !/^[47]\./.test(l)).join("\n"),
      'COMPARISON RULES: Do not score, rank or declare a winner. Do not say one design is universally better. Report documented structural differences and their implications. Where the projects disagree on a fact, add it to "conflicts" instead of choosing. Anything not established by the provided knowledge goes in "unknowns".',
      `OUTPUT: one JSON object in a \`\`\`json block: { ${SECTIONS.map((s) => `"${s}": ["..."]`).join(", ")}, "conflicts": [{ "topic": "...", "claims": [{ "project": "...", "claim": "...", "evidence": "..." }], "affectedAreas": ["..."] }] }`,
      `KIND: ${payload.kind}
BEGIN_CONTEXT_JSON
${JSON.stringify({ kind: payload.kind, projects: payload.projects, structuralFacts: payload.structural, selection: payload.selection })}
END_CONTEXT_JSON`
    ].join("\n\n");
  }
  function validateComparison(value) {
    if (!value || typeof value !== "object") return { ok: false, errors: ["result must be an object"] };
    const clean = strip(value);
    const result = {};
    for (const s of SECTIONS) result[s] = Array.isArray(clean[s]) ? clean[s] : [];
    if (SECTIONS.every((s) => result[s].length === 0)) return { ok: false, errors: ["none of the comparison sections contain content"] };
    return { ok: true, result, conflicts: Array.isArray(clean.conflicts) ? clean.conflicts : [] };
  }
  var FOCUS = {
    PROJECT: "Compare the whole projects: technology, architecture, folder structure, features, workflows, database, APIs, frontend/backend/data flow, business rules, authentication, authorization, state management, dependencies, external services, testing, security and deployment.",
    FEATURE: "Compare the same feature across the projects: user flow, frontend, backend, API, database, data flow, business rules, error handling, security, testing, dependencies and external services.",
    WORKFLOW: "Compare the workflow across the projects: trigger, frontend flow, API flow, backend flow, database flow, business rules, external services, error handling, security, testing and dependencies.",
    DATABASE: "Compare the database designs: technology, schema, entities, relationships, normalization, queries, transactions, indexes, data ownership and feature relationships. Do not declare one design better.",
    ARCHITECTURE: "Compare the architectures: layers, technology, folder structure, dependency structure and deployment."
  };

  // src/comparison/blueprintBuilder.js
  var BLUEPRINT_SECTIONS = ["purpose", "technologyStack", "architecture", "modules", "features", "workflows", "database", "apis", "businessRules", "externalServices", "authentication", "authorization", "stateManagement", "folderStructure", "components", "services", "models", "environmentRequirements", "commands", "conflicts"];
  function blueprintPrompt(payload) {
    return [
      'You are producing a PROJECT BLUEPRINT (a planning document, not code) for the "AI Project Intelligence" tool, combining the knowledge of the reference projects with the user requirements.',
      RULES.split("\n").filter((l) => !/^[47]\./.test(l)).join("\n"),
      'BLUEPRINT RULES: Base decisions on the reference projects and requirements only. If the projects disagree, do NOT choose silently: add an entry to "conflicts" ({ "topic", "options": [{ "project", "approach" }], "requiresDecision": "..." }). Never describe environment values or secrets. "folderStructure" is a nested object: keys are folder/file names, folders map to objects, files to null.',
      `OUTPUT: one JSON object in a \`\`\`json block with keys: ${BLUEPRINT_SECTIONS.join(", ")}.`,
      `REQUIREMENTS
${payload.requirements}`,
      `BEGIN_CONTEXT_JSON
${JSON.stringify({ projects: payload.projects })}
END_CONTEXT_JSON`
    ].join("\n\n");
  }
  function validateBlueprint(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, errors: ["blueprint must be an object"] };
    const present = BLUEPRINT_SECTIONS.filter((k) => value[k] !== void 0);
    if (present.length < 4) return { ok: false, errors: [`blueprint has only ${present.length} recognized sections`] };
    return { ok: true, blueprint: Object.fromEntries(present.map((k) => [k, value[k]])) };
  }

  // src/utils/secrets.js
  var REDACTED = "[REDACTED_SECRET]";
  var RULES2 = [
    { type: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, whole: true },
    { type: "aws-access-key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, whole: true },
    { type: "aws-secret-key", re: /(aws_?secret_?access_?key["'\s:=]+)["']?([A-Za-z0-9/+=]{40})["']?/gi, group: 2 },
    { type: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, whole: true },
    { type: "stripe-key", re: /\b(?:sk|rk|pk_live|whsec)_(?:live_|test_)?[A-Za-z0-9]{16,}\b/g, whole: true },
    { type: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, whole: true },
    { type: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, whole: true },
    { type: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, whole: true },
    { type: "db-connection-credentials", re: /\b((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^:/\s"']+:)([^@\s"']{3,})(@)/gi, group: 2 },
    { type: "bearer-token", re: /(\bBearer\s+)([A-Za-z0-9._~+/=-]{20,})/g, group: 2 },
    { type: "oauth-client-secret", re: /((?:client[_-]?secret|oauth[_-]?secret|consumer[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{8,})["']/gi, group: 2 },
    { type: "webhook-secret", re: /((?:webhook[_-]?secret|signing[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{8,})["']/gi, group: 2 },
    { type: "jwt-secret", re: /((?:jwt[_-]?secret|secret[_-]?key|session[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{6,})["']/gi, group: 2 },
    { type: "password", re: /((?:password|passwd|pwd|db[_-]?pass(?:word)?)["'\s]*[:=]\s*)["']([^"'\s]{4,})["']/gi, group: 2 },
    { type: "api-key", re: /((?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret)["'\s]*[:=]\s*)["']([A-Za-z0-9_\-./+=]{12,})["']/gi, group: 2 }
  ];
  function redactText(text) {
    const ranges = [];
    for (const rule of RULES2) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let m;
      while (m = re.exec(text)) {
        let start = m.index;
        let end = m.index + m[0].length;
        if (rule.group) {
          const g = m[rule.group];
          if (!g) continue;
          start = m.index + m[0].lastIndexOf(g);
          end = start + g.length;
        }
        if (text.slice(start, end) === REDACTED) continue;
        ranges.push({ start, end, type: rule.type });
      }
    }
    ranges.sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r.start < last.end) {
        last.end = Math.max(last.end, r.end);
        continue;
      }
      merged.push({ ...r });
    }
    let out = text;
    for (let i = merged.length - 1; i >= 0; i--) out = out.slice(0, merged[i].start) + REDACTED + out.slice(merged[i].end);
    return { text: out, findings: merged.map((r) => ({ type: r.type })) };
  }

  // src/utils/settings.js
  var DEFAULT_SETTINGS = {
    provider: "auto",
    // auto | chatgpt | claude | gemini | generic
    maxTokensPerRequest: 24e3,
    maxFilesPerRequest: 20,
    maxLinesPerFile: 1500,
    maxTotalLines: 12e3,
    maxTotalTokens: 2e5,
    responseTimeoutSec: 240,
    stableSec: 3,
    genericSite: "",
    bridgePort: 47821
  };
  async function getSettings() {
    return { ...DEFAULT_SETTINGS, ...await storage.get("settings", {}) };
  }
  async function saveSettings(patch) {
    const next = { ...await getSettings() };
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in DEFAULT_SETTINGS)) throw new Error(`Unknown setting ${k}`);
      if (typeof v !== typeof DEFAULT_SETTINGS[k]) throw new Error(`Setting ${k} expects ${typeof DEFAULT_SETTINGS[k]}`);
      if (typeof v === "number" && !(v > 0)) throw new Error(`Setting ${k} must be positive`);
      next[k] = v;
    }
    await storage.set("settings", next);
    return next;
  }

  // src/background/orchestrator.js
  var keyOf = (projectId, analysisId) => `${projectId}~${analysisId}`;
  var aidOf = (key) => key.slice(key.indexOf("~") + 1);
  var pidOf = (key) => key.slice(0, key.indexOf("~"));
  var Orchestrator = class {
    constructor({ bridge: bridge2, ai: ai2, onChange }) {
      this.bridge = bridge2;
      this.ai = ai2;
      this.onChange = onChange || (() => {
      });
      this.chains = /* @__PURE__ */ new Map();
      this.paused = /* @__PURE__ */ new Set();
      this.cancelled = /* @__PURE__ */ new Set();
      this.suspended = /* @__PURE__ */ new Set();
      this.inFlight = /* @__PURE__ */ new Set();
      this.batchStore = /* @__PURE__ */ new Map();
      this.register();
    }
    register() {
      const b = this.bridge;
      b.on(T.PROJECT_REGISTER, async (m) => {
        await knowledgeStore.registerProject(m.payload);
        b.sendNow(T.PROJECT_REGISTER_RESPONSE, { accepted: true, projectId: m.payload.projectId }, { inReplyTo: m.messageId });
        this.changed();
      });
      b.on(T.ANALYSIS_REQUEST, (m) => this.onAnalysisRequest(m.payload));
      b.on(T.ANALYSIS_BATCH, (m) => this.onBatch(m.payload));
      b.on(T.AI_RESPONSE_ACK, (m) => this.onAck(m.payload));
      b.on(T.KNOWLEDGE_PACKAGE_ACK, (m) => this.onPackageAck(m.payload));
      b.on(T.KNOWLEDGE_MERGE_RESULT, (m) => this.onMergeResult(m.payload));
      b.on(T.PAUSE_REQUEST, (m) => this.control("pause", this.key(m.payload.analysisId)));
      b.on(T.RESUME_REQUEST, (m) => this.control("resume", this.key(m.payload.analysisId)));
      b.on(T.CANCEL_REQUEST, (m) => this.control("stop", this.key(m.payload.analysisId)));
      b.on(T.RETRY_REQUEST, (m) => this.retryBatch(this.key(m.payload.analysisId), m.payload.batchId));
      b.on(T.DOCUMENTATION_REQUEST, (m) => this.queueJob("documentation", m.payload));
      b.on(T.COMPARISON_REQUEST, (m) => this.queueJob("comparison", m.payload));
      b.on(T.BLUEPRINT_REQUEST, (m) => this.queueJob("blueprint", m.payload));
      b.on(T.ERROR, (m) => this.notice("error", m.payload.code, m.payload.message));
      b.on(T.WARNING, (m) => this.notice("info", m.payload.code, m.payload.message));
      b.on("resumed", (p) => this.onResumed(p));
      b.on("switched", (p) => this.onSwitched(p));
      b.on("closed", () => this.onDisconnected());
    }
    changed() {
      this.onChange();
    }
    curProject() {
      return this.bridge.session ? this.bridge.session.projectId : null;
    }
    key(analysisId) {
      return keyOf(this.curProject(), analysisId);
    }
    // Every outbound message about a run is addressed to that run's project, never to whichever session is current.
    out(key, type, payload) {
      return this.bridge.send(type, { analysisId: aidOf(key), ...payload }, { projectId: pidOf(key) });
    }
    inSession(key) {
      return this.curProject() === pidOf(key);
    }
    async setStatus(patch) {
      await update("status", (s) => ({ ...s, ...patch }), {});
      this.changed();
    }
    async notice(level, code, message) {
      await update("notices", (n) => [...n, { at: (/* @__PURE__ */ new Date()).toISOString(), level, code, message }].slice(-30), []);
      await log(level === "error" ? "error" : "info", "VSCODE", `${code}: ${message}`);
      this.changed();
    }
    // ---------- analyses ----------
    // `key` = "<projectId>~<analysisId>". UI commands pass keys; VS Code messages carry plain analysisIds for the current session's project.
    async onAnalysisRequest(p) {
      const pid = this.curProject();
      const key = keyOf(pid, p.analysisId);
      const existing = await knowledgeStore.getAnalysis(key);
      const resumed = !!p.resume && existing && ["RUNNING", "PAUSED", "NEEDS_ATTENTION", "AWAITING_ACK", "DISCONNECTED"].includes(existing.status);
      const record = {
        key,
        analysisId: p.analysisId,
        projectId: pid,
        mode: p.mode,
        purpose: p.purpose || null,
        intent: p.intent || "UNDERSTAND",
        totalBatches: p.totalBatches,
        estimatedTokens: p.estimatedTokens,
        files: p.files || [],
        secretsRedacted: p.secretsRedacted || 0,
        secrets: p.secrets || [],
        providerHint: p.providerHint,
        createdAt: existing && existing.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        status: resumed ? "RUNNING" : "AWAITING_USER",
        batches: existing && existing.batches || {},
        attention: null
      };
      await knowledgeStore.saveAnalysis(key, record);
      this.cancelled.delete(key);
      this.paused.delete(key);
      this.suspended.delete(key);
      if (resumed) {
        const vsDone = new Set(p.completedBatchIds || []);
        for (const b of Object.values(record.batches)) {
          if (b.status === "completed" && b.knowledge && !vsDone.has(b.batchId)) await this.out(key, T.AI_RESPONSE, { batchId: b.batchId, status: "COMPLETED", knowledge: b.knowledge, provider: b.provider, model: b.model });
        }
        await this.out(key, T.ANALYSIS_ACCEPTED, { accepted: true, provider: await this.currentProviderName(), resumed: true });
        await log("info", "ANALYSIS", `resumed ${p.analysisId}`);
        const nDone = Object.values(record.batches).filter((b) => b.status === "completed").length;
        if (record.totalBatches && nDone >= record.totalBatches) await this.finalize(key);
      } else {
        await this.notice("info", "ANALYSIS_REQUEST", `${p.analysisId}: VS Code wants to send ${p.files ? p.files.length : "?"} file(s) to your AI provider. Review and confirm in the panel.`);
      }
      this.changed();
    }
    async currentProviderName() {
      const s = await getSettings();
      const t = this.ai.provider ? await this.ai.provider() : null;
      return t || s.provider;
    }
    // User clicked "Start" after seeing the privacy summary.
    async confirmAnalysis(key) {
      const a = await knowledgeStore.getAnalysis(key);
      if (!a || a.status !== "AWAITING_USER") throw new Error("This analysis is not waiting for confirmation.");
      if (!this.inSession(key)) throw new Error("This analysis belongs to another project. Connect to that project in VS Code first.");
      await knowledgeStore.saveAnalysis(key, { status: "RUNNING", confirmedAt: (/* @__PURE__ */ new Date()).toISOString() });
      await this.out(key, T.ANALYSIS_ACCEPTED, { accepted: true, provider: await this.currentProviderName() });
      this.changed();
    }
    async declineAnalysis(key, reason = "Declined by user") {
      await knowledgeStore.saveAnalysis(key, { status: "CANCELLED", attention: null });
      await this.out(key, T.ANALYSIS_ACCEPTED, { accepted: false, reason });
      this.changed();
    }
    async onBatch(batch) {
      const key = this.key(batch.analysisId);
      const a = await knowledgeStore.getAnalysis(key);
      if (!a || this.cancelled.has(key) || a.status === "CANCELLED") return;
      await this.out(key, T.ANALYSIS_BATCH_ACK, { batchId: batch.batchId, received: true });
      const done = a.batches && a.batches[batch.batchId];
      if (done && done.status === "completed" && done.knowledge) {
        await log("info", "ANALYSIS", `${batch.batchId} already completed: re-sending stored result`);
        await this.out(key, T.AI_RESPONSE, { batchId: batch.batchId, status: "COMPLETED", knowledge: done.knowledge, provider: done.provider, model: done.model });
        return;
      }
      const bkey = `${key}/${batch.batchId}`;
      if (this.inFlight.has(bkey)) {
        await log("info", "ANALYSIS", `${batch.batchId} is already being processed; duplicate delivery ignored`);
        return;
      }
      await update("batchPayloads", (all) => ({ ...all, [bkey]: batch }), {});
      this.batchStore.set(bkey, batch);
      await knowledgeStore.checkpoint(key, batch.batchId, { status: "received", batchNumber: batch.batchNumber, files: batch.context.files.length });
      this.startBatch(key, batch);
      this.changed();
    }
    startBatch(key, batch) {
      const bkey = `${key}/${batch.batchId}`;
      if (this.inFlight.has(bkey)) return;
      this.inFlight.add(bkey);
      this.enqueue(key, () => this.runBatch(key, batch)).finally(() => this.inFlight.delete(bkey));
    }
    enqueue(key, fn) {
      const prev = this.chains.get(key) || Promise.resolve();
      const next = prev.catch(() => {
      }).then(fn).catch((e) => log("error", "ANALYSIS", `batch failed unexpectedly: ${e.message}`));
      this.chains.set(key, next);
      return next;
    }
    async waitWhilePaused(key) {
      while (this.paused.has(key) && !this.cancelled.has(key) && !this.suspended.has(key)) await new Promise((r) => setTimeout(r, 300));
    }
    async runBatch(key, batch) {
      await this.waitWhilePaused(key);
      if (this.cancelled.has(key) || this.suspended.has(key)) return;
      const settings = await getSettings();
      const aid = aidOf(key);
      await knowledgeStore.saveAnalysis(key, { status: "RUNNING", attention: null });
      await this.setStatus({ current: { key, analysisId: aid, batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches, stage: "PREPARING" } });
      const { batch: limited, warnings } = applyLimits(batch, settings);
      const res = await this.processWithSplitting(key, limited, settings, 0);
      if (this.cancelled.has(key)) return;
      if (this.suspended.has(key) && !res.ok) {
        await knowledgeStore.checkpoint(key, batch.batchId, { status: "received", batchNumber: batch.batchNumber });
        return;
      }
      if (!res.ok) return this.failBatch(key, batch, res);
      const knowledge = res.knowledge;
      knowledge.unknowns = [...knowledge.unknowns || [], ...warnings.map((w) => `NOTE: ${w}`)];
      await knowledgeStore.checkpoint(key, batch.batchId, { status: "completed", batchNumber: batch.batchNumber, knowledge, provider: res.provider, model: res.model, redactions: res.redactions, warnings });
      await this.out(key, T.AI_RESPONSE, { batchId: batch.batchId, status: "COMPLETED", knowledge, provider: res.provider, model: res.model });
      await this.setStatus({ current: { key, analysisId: aid, batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches, stage: "CHECKPOINTED" } });
      const a = await knowledgeStore.getAnalysis(key);
      const completed = Object.values(a.batches).filter((b) => b.status === "completed").length;
      if (!this.suspended.has(key) && (batch.batchNumber >= batch.totalBatches || completed >= batch.totalBatches)) await this.finalize(key);
      this.changed();
    }
    // One AI round trip for a (possibly split) batch. Returns { ok, knowledge, provider, model } or { ok:false, code, message }.
    async processWithSplitting(key, batch, settings, depth) {
      const own = await knowledgeStore.batchKnowledge(key);
      const crossBatch = buildCrossBatch(batch, own);
      let prompt = buildBatchPrompt(batch, crossBatch);
      const red = redactText(prompt);
      prompt = red.text;
      if (red.findings.length) await this.notice("info", "SECRETS", `${red.findings.length} possible secret(s) were removed from the prompt before sending (${[...new Set(red.findings.map((f) => f.type))].join(", ")}).`);
      if (estimateTokens(prompt) > settings.maxTokensPerRequest) {
        const parts = depth < 3 ? splitBatch(batch) : null;
        if (parts) return this.runParts(key, parts, settings, depth);
        return { ok: false, code: "CONTEXT_TOO_LARGE", message: `The prompt (~${estimateTokens(prompt)} tokens) exceeds your limit of ${settings.maxTokensPerRequest} and cannot be split further.` };
      }
      const first = await this.askAi(key, batch, prompt, settings);
      if (!first.ok) {
        if ((first.code === "CONTEXT_TOO_LARGE" || first.code === "TRUNCATED") && depth < 3) {
          const parts = splitBatch(batch);
          if (parts) {
            await this.notice("info", "SPLIT", `${batch.batchId}: reducing the batch and retrying.`);
            return this.runParts(key, parts, settings, depth);
          }
        }
        return first;
      }
      let parsed = parseAiResponse(first);
      let last = first;
      if (!parsed.ok) {
        await this.setStatus({ current: { ...await this.current(), stage: "REQUESTING_CORRECTION" } });
        const second = await this.askAi(key, batch, buildCorrectionPrompt(parsed.errors, parsed.truncated), settings);
        if (!second.ok) return second;
        parsed = parseAiResponse(second);
        last = second;
        if (!parsed.ok) {
          if (parsed.truncated && depth < 3) {
            const parts = splitBatch(batch);
            if (parts) return this.runParts(key, parts, settings, depth);
          }
          return { ok: false, code: "INVALID_JSON", message: `The AI's answer could not be validated even after a correction request: ${parsed.errors.slice(0, 3).join("; ")}` };
        }
      }
      const { knowledge, notes } = sanitizeKnowledge(parsed.knowledge, batch.context.files);
      return { ok: true, knowledge, provider: last.provider, model: last.model || null, redactions: red.findings.length, notes };
    }
    async runParts(key, parts, settings, depth) {
      const results = [];
      for (const p of parts) {
        const r = await this.processWithSplitting(key, p, settings, depth + 1);
        if (!r.ok) return r;
        results.push(r);
      }
      const merged = mergeKnowledge(results.map((r) => r.knowledge));
      const flat = { ...merged.knowledge, evidence: merged.evidence, unknowns: merged.unknowns, ...merged.changeProposals[0] ? { changeProposal: merged.changeProposals[0] } : {} };
      return { ok: true, knowledge: flat, provider: results[0].provider, model: results[0].model, redactions: results.reduce((n, r) => n + r.redactions, 0) };
    }
    async askAi(key, batch, prompt, settings) {
      const cur = { key, analysisId: aidOf(key), batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches };
      await this.setStatus({ current: { ...cur, stage: "WAITING_AI" } });
      const res = await this.ai.run(prompt, {
        timeoutMs: settings.responseTimeoutSec * 1e3,
        stableMs: settings.stableSec * 1e3,
        onProgress: (p) => {
          if (this.inSession(key)) this.bridge.sendNow(T.ANALYSIS_PROGRESS, { analysisId: aidOf(key), batchId: batch.batchId, stage: p.stage || "RECEIVING", provider: this.lastProvider });
          this.setStatus({ current: { ...cur, stage: p.stage || "RECEIVING", chars: p.chars } });
        }
      });
      if (res.provider) this.lastProvider = res.provider;
      return res;
    }
    async current() {
      return (await storage.get("status", {})).current || {};
    }
    async failBatch(key, batch, res) {
      await log("error", "ANALYSIS", `${batch.batchId} failed: ${res.code} ${res.message}`);
      await knowledgeStore.checkpoint(key, batch.batchId, { status: "failed", batchNumber: batch.batchNumber, error: res.message, code: res.code });
      await knowledgeStore.saveAnalysis(key, { status: "NEEDS_ATTENTION", attention: { batchId: batch.batchId, code: res.code, message: res.message } });
      await this.out(key, T.AI_RESPONSE, { batchId: batch.batchId, status: "FAILED", error: res.message, code: res.code, provider: this.lastProvider });
      await this.setStatus({ current: { key, analysisId: aidOf(key), batchId: batch.batchId, batchNumber: batch.batchNumber, totalBatches: batch.totalBatches, stage: "FAILED" } });
    }
    // Builds the final package from all completed batches and sends it to VS Code.
    async finalize(key) {
      const a = await knowledgeStore.getAnalysis(key);
      const done = Object.values(a.batches).filter((b) => b.status === "completed").sort((x, y) => x.batchNumber - y.batchNumber);
      if (!done.length) throw new Error("No completed batches to finalize.");
      const merged = mergeKnowledge(done.map((b) => b.knowledge));
      const incomplete = a.totalBatches - done.length;
      const unknowns = [...merged.unknowns];
      if (incomplete > 0) unknowns.push(`${incomplete} of ${a.totalBatches} batches were not completed (failed or skipped); the knowledge is partial.`);
      const provider = done[done.length - 1].provider || this.lastProvider || "unknown";
      const pkg = { packageType: "KNOWLEDGE_PACKAGE", schemaVersion: "1.0", projectId: a.projectId, analysisId: a.analysisId, source: { provider, model: done[done.length - 1].model || "unknown" }, knowledge: merged.knowledge, evidence: merged.evidence, unknowns };
      const v = validateOutboundPackage(pkg);
      if (!v.valid) {
        await this.notice("error", "PACKAGE_INVALID", `Refusing to send malformed knowledge to VS Code: ${v.errors.slice(0, 3).join("; ")}`);
        await knowledgeStore.saveAnalysis(key, { status: "NEEDS_ATTENTION", attention: { code: "PACKAGE_INVALID", message: v.errors.join("; ") } });
        return;
      }
      await this.out(key, T.ANALYSIS_COMPLETE, { status: incomplete ? "PARTIAL" : "COMPLETED", batchesCompleted: done.length, totalBatches: a.totalBatches });
      await this.out(key, T.KNOWLEDGE_PACKAGE, { package: pkg });
      for (const cp of merged.changeProposals) await this.out(key, T.CHANGE_PROPOSAL, { ...cp });
      await knowledgeStore.saveAnalysis(key, { status: "AWAITING_ACK", sentPackageAt: (/* @__PURE__ */ new Date()).toISOString(), packageSummary: { files: pkg.knowledge.files.length, workflows: pkg.knowledge.workflows.length, entities: pkg.knowledge.database ? pkg.knowledge.database.entities.length : 0, unknowns: unknowns.length } });
      await this.setStatus({ current: { key, analysisId: a.analysisId, stage: "PACKAGE_SENT" } });
      this.changed();
    }
    async onAck(p) {
      await log("info", "ANALYSIS", `VS Code checkpointed ${p.batchId}${p.failed ? " (failure recorded)" : ""}`);
    }
    async onPackageAck(p) {
      if (!p.analysisId) return;
      const key = this.key(p.analysisId);
      if (p.accepted) await knowledgeStore.saveAnalysis(key, { status: "COMPLETED", ack: { counts: p.counts, stale: p.stale, rejected: p.rejected } });
      else await knowledgeStore.saveAnalysis(key, { status: "NEEDS_ATTENTION", attention: { code: p.code || "PACKAGE_REJECTED", message: `VS Code rejected the package: ${(p.errors || []).slice(0, 3).join("; ")}` } });
      this.changed();
    }
    async onMergeResult(p) {
      await knowledgeStore.saveAnalysis(this.key(p.analysisId), { mergeResult: { changes: p.changes, conflicts: p.conflicts, unverified: p.unverified, coverage: p.coverage } });
      this.changed();
    }
    // ---------- controls (from the panel or VS Code) ----------
    async control(kind, key) {
      if (kind === "pause") {
        this.paused.add(key);
        await knowledgeStore.saveAnalysis(key, { status: "PAUSED" });
      }
      if (kind === "resume") {
        this.paused.delete(key);
        this.suspended.delete(key);
        const a = await knowledgeStore.getAnalysis(key);
        const failed = a && a.batches ? Object.values(a.batches).filter((b) => b.status === "failed").sort((x, y) => x.batchNumber - y.batchNumber) : [];
        await knowledgeStore.saveAnalysis(key, { status: "RUNNING", attention: null });
        if (failed.length) await this.retryBatch(key, failed[0].batchId || failed[0].id).catch((e) => log("warn", "ANALYSIS", `resume could not restart the failed batch: ${e.message}`));
      }
      if (kind === "stop") {
        this.cancelled.add(key);
        this.paused.delete(key);
        if (this.ai.cancel) this.ai.cancel();
        await knowledgeStore.saveAnalysis(key, { status: "CANCELLED" });
      }
      this.changed();
    }
    // Panel actions echo to VS Code (when it is the connected project) so both sides agree.
    async panelControl(kind, key) {
      await this.control(kind, key);
      const t = { pause: T.PAUSE_REQUEST, resume: T.RESUME_REQUEST, stop: T.CANCEL_REQUEST }[kind];
      if (t && this.inSession(key)) await this.out(key, t, {});
    }
    async retryBatch(key, batchId) {
      const bkey = `${key}/${batchId}`;
      const batch = this.batchStore.get(bkey) || (await storage.get("batchPayloads", {}))[bkey];
      if (!batch) throw new Error(`Batch ${batchId} is no longer stored; ask VS Code to retry it.`);
      this.cancelled.delete(key);
      this.suspended.delete(key);
      await knowledgeStore.checkpoint(key, batchId, { status: "received" });
      this.startBatch(key, batch);
    }
    async skipBatch(key, batchId) {
      await knowledgeStore.checkpoint(key, batchId, { status: "skipped" });
      await knowledgeStore.saveAnalysis(key, { status: "RUNNING", attention: null });
      await this.out(key, T.RETRY_REQUEST, { batchId, skip: true });
      this.changed();
    }
    async onResumed(payload) {
      await log("info", "BRIDGE", `VS Code lists ${payload.resumable ? payload.resumable.length : 0} resumable analysis(es)`);
      this.changed();
    }
    async onDisconnected() {
      const all = await knowledgeStore.getAnalyses();
      for (const a of Object.values(all)) if (["RUNNING", "AWAITING_ACK"].includes(a.status)) await knowledgeStore.saveAnalysis(a.key || keyOf(a.projectId, a.analysisId), { status: a.status, disconnected: true });
      this.changed();
    }
    // The user paired with a different project. Work for the old project is suspended (not lost) and resumes when that project reconnects.
    async onSwitched({ from, to }) {
      const all = await knowledgeStore.getAnalyses();
      let n = 0;
      for (const a of Object.values(all)) {
        if (a.projectId !== from || !["RUNNING", "AWAITING_USER", "NEEDS_ATTENTION", "PAUSED", "AWAITING_ACK"].includes(a.status)) continue;
        const key = a.key || keyOf(a.projectId, a.analysisId);
        this.suspended.add(key);
        if (a.status !== "AWAITING_ACK" && a.status !== "AWAITING_USER") await knowledgeStore.saveAnalysis(key, { status: "PAUSED", attention: { code: "SWITCHED", message: 'Paused because you connected to another project. Open this project in VS Code, connect Chrome to it, and run "AI Project: Resume Analysis". Nothing is lost.' } });
        n++;
      }
      if (n && this.ai.cancel) this.ai.cancel();
      await this.notice("info", "PROJECT_SWITCHED", `Connected to a different project. ${n} unfinished analysis(es) of the previous project were paused and keep their progress.`);
      this.changed();
    }
    // ---------- documentation / comparison / blueprint jobs ----------
    async queueJob(kind, payload) {
      const job = { id: randomId("job"), kind, payload, projectId: this.curProject(), status: "AWAITING_USER", createdAt: (/* @__PURE__ */ new Date()).toISOString(), projects: (payload.projects || []).map((p) => p.project ? p.project.name : p.name).filter(Boolean) };
      await update("jobs", (jobs) => [...jobs, job].slice(-30), []);
      await this.notice("info", `${kind.toUpperCase()}_REQUEST`, `VS Code requested a ${kind}. Review and run it in the panel.`);
      this.changed();
    }
    async setJob(id, patch) {
      await update("jobs", (jobs) => jobs.map((j) => j.id === id ? { ...j, ...patch } : j), []);
      this.changed();
    }
    async runJob(id) {
      const jobs = await storage.get("jobs", []);
      const job = jobs.find((j) => j.id === id);
      if (!job || job.status !== "AWAITING_USER") throw new Error("This job is not waiting to run.");
      if (job.projectId && job.projectId !== this.curProject()) throw new Error("This request belongs to another project. Connect to that project in VS Code first.");
      await this.setJob(id, { status: "RUNNING" });
      const settings = await getSettings();
      const p = job.payload;
      const build = { documentation: () => buildDocumentationPrompt(p), comparison: () => comparisonPrompt(p, FOCUS[p.kind] || FOCUS.PROJECT), blueprint: () => blueprintPrompt(p) }[job.kind];
      let prompt = redactText(build()).text;
      if (estimateTokens(prompt) > settings.maxTokensPerRequest) {
        await this.setJob(id, { status: "FAILED", error: `The request (~${estimateTokens(prompt)} tokens) exceeds your limit of ${settings.maxTokensPerRequest}. Raise "maxTokensPerRequest" in Settings or compare fewer projects.` });
        return;
      }
      const ask = (text) => this.ai.run(text, { timeoutMs: settings.responseTimeoutSec * 1e3, stableMs: settings.stableSec * 1e3, onProgress: (pr) => this.setStatus({ job: { id, stage: pr.stage || "RECEIVING" } }) });
      let res = await ask(prompt);
      if (!res.ok) {
        await this.setJob(id, { status: "FAILED", error: res.message, code: res.code });
        return;
      }
      const check = (r) => {
        const j = parseAnyJson(r);
        if (!j.ok) return { ok: false, errors: j.errors };
        const v2 = { documentation: () => validateDocumentationResponse(j.value, p.key), comparison: () => validateComparison(j.value), blueprint: () => validateBlueprint(j.value) }[job.kind]();
        return v2;
      };
      let v = check(res);
      if (!v.ok) {
        res = await ask(`Your previous reply could not be used: ${v.errors.join("; ")}. Reply again with ONLY the corrected JSON object in one \`\`\`json code block.`);
        if (!res.ok) {
          await this.setJob(id, { status: "FAILED", error: res.message, code: res.code });
          return;
        }
        v = check(res);
        if (!v.ok) {
          await this.setJob(id, { status: "FAILED", error: `Invalid answer after correction: ${v.errors.join("; ")}`, code: "INVALID_JSON" });
          return;
        }
      }
      const provider = res.provider || this.lastProvider || "unknown";
      if (job.kind === "documentation") {
        await this.bridge.send(T.DOCUMENTATION_RESPONSE, { key: v.doc.key, kind: p.kind, markdown: v.doc.markdown, provider }, { projectId: job.projectId });
        await knowledgeStore.addResult("documentation", { key: v.doc.key, markdown: v.doc.markdown, provider });
      }
      if (job.kind === "comparison") {
        const projects = (p.projects || []).map((x) => ({ projectId: (x.project || x).projectId, name: (x.project || x).name }));
        await this.bridge.send(T.COMPARISON_RESPONSE, { kind: p.kind, projects, result: v.result, conflicts: v.conflicts, provider }, { projectId: job.projectId });
        await knowledgeStore.addResult("comparison", { kind: p.kind, projects, result: v.result, conflicts: v.conflicts, provider });
      }
      if (job.kind === "blueprint") {
        const projects = (p.projects || []).map((x) => ({ projectId: (x.project || x).projectId, name: (x.project || x).name }));
        await this.bridge.send(T.BLUEPRINT_RESPONSE, { projects, requirements: p.requirements, blueprint: v.blueprint, provider }, { projectId: job.projectId });
        await knowledgeStore.addResult("blueprint", { projects, requirements: p.requirements, blueprint: v.blueprint, provider });
      }
      await this.setJob(id, { status: "COMPLETED", completedAt: (/* @__PURE__ */ new Date()).toISOString(), provider });
    }
    async dismissJob(id) {
      await update("jobs", (jobs) => jobs.filter((j) => j.id !== id), []);
      this.changed();
    }
  };

  // src/background/providerTabs.js
  var HOSTS = {
    chatgpt: ["chatgpt.com", "chat.openai.com"],
    claude: ["claude.ai"],
    gemini: ["gemini.google.com"]
  };
  var ORDER = ["chatgpt", "claude", "gemini"];
  function providerOfUrl(url, genericSite) {
    let h;
    try {
      h = new URL(url).hostname;
    } catch {
      return null;
    }
    for (const [p, hosts] of Object.entries(HOSTS)) if (hosts.some((x) => h === x || h.endsWith(`.${x}`))) return p;
    if (genericSite) {
      try {
        if (new URL(genericSite).hostname === h) return "generic";
      } catch {
      }
    }
    return null;
  }
  async function findTab(provider, genericSite) {
    const tabs = await chrome.tabs.query({});
    const withP = tabs.filter((t) => t.url).map((t) => ({ tab: t, provider: providerOfUrl(t.url, genericSite) })).filter((x) => x.provider);
    if (provider && provider !== "auto") {
      const hit = withP.find((x) => x.provider === provider) || null;
      return hit && { tabId: hit.tab.id, provider: hit.provider, url: hit.tab.url, title: hit.tab.title };
    }
    const active = withP.find((x) => x.tab.active && x.tab.currentWindow) || withP.find((x) => x.tab.active);
    const pick = active || ORDER.map((p) => withP.find((x) => x.provider === p)).find(Boolean) || withP[0];
    return pick ? { tabId: pick.tab.id, provider: pick.provider, url: pick.tab.url, title: pick.tab.title } : null;
  }
  async function listProviderTabs(genericSite) {
    const tabs = await chrome.tabs.query({});
    return tabs.filter((t) => t.url).map((t) => ({ tabId: t.id, provider: providerOfUrl(t.url, genericSite), url: t.url, title: t.title, active: t.active })).filter((x) => x.provider);
  }
  async function ping(tabId) {
    try {
      return await chrome.tabs.sendMessage(tabId, { target: "content", type: "PING" });
    } catch {
      return null;
    }
  }
  async function ensureContent(tabId, provider) {
    if (await ping(tabId)) return true;
    const file = `dist/content-${provider}.js`;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    } catch (e) {
      return false;
    }
    await new Promise((r) => setTimeout(r, 300));
    return !!await ping(tabId);
  }
  async function selfTest(tabId) {
    try {
      return await chrome.tabs.sendMessage(tabId, { target: "content", type: "SELF_TEST" });
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  function runPrompt(tabId, prompt, { timeoutMs, stableMs, onProgress }) {
    return new Promise((resolve) => {
      let port;
      try {
        port = chrome.tabs.connect(tabId, { name: "aipi-run" });
      } catch (e) {
        resolve({ ok: false, code: "TAB_CLOSED", message: "The AI tab is not reachable." });
        return;
      }
      const id = Math.random().toString(36).slice(2);
      let done = false;
      const finish = (r) => {
        if (!done) {
          done = true;
          try {
            port.disconnect();
          } catch {
          }
          resolve(r);
        }
      };
      port.onMessage.addListener((m) => {
        if (m.id !== id) return;
        if (m.type === "PROGRESS") onProgress && onProgress(m);
        if (m.type === "RESULT") finish(m);
      });
      port.onDisconnect.addListener(() => finish({ ok: false, code: "TAB_CLOSED", message: "The AI tab was closed or reloaded during the request." }));
      port.postMessage({ type: "RUN", id, prompt, timeoutMs, stableMs });
      runPrompt.cancel = () => {
        try {
          port.postMessage({ type: "CANCEL" });
        } catch {
        }
      };
    });
  }

  // src/background/serviceWorker.js
  var bridge;
  var orchestrator;
  var publish = () => storage.set("tick", Date.now());
  async function setBridgeStatus(s) {
    await storage.set("bridge", { state: s.state, error: s.error || null, session: s.session ? { sessionId: s.session.sessionId, projectId: s.session.projectId, projectName: s.session.projectName || null } : null, at: Date.now() });
    publish();
  }
  var ai = {
    current: null,
    async provider() {
      return this.current;
    },
    cancel() {
      if (runPrompt.cancel) runPrompt.cancel();
    },
    async run(prompt, { timeoutMs, stableMs, onProgress }) {
      const s = await getSettings();
      const tab = await findTab(s.provider, s.genericSite);
      if (!tab) return { ok: false, code: "NO_TAB", message: s.provider === "auto" ? "No supported AI tab is open. Open ChatGPT, Claude or Gemini, log in, and retry." : `No ${s.provider} tab is open. Open it, log in, and retry.` };
      this.current = tab.provider;
      if (!await ensureContent(tab.tabId, tab.provider)) return { ok: false, code: "UI_CHANGED", message: `The extension could not attach to the ${tab.provider} tab. Reload the tab and retry.`, provider: tab.provider };
      const res = await runPrompt(tab.tabId, prompt, { timeoutMs, stableMs, onProgress });
      return { ...res, provider: tab.provider };
    }
  };
  async function init() {
    bridge = new VsCodeBridge({ onStatus: setBridgeStatus });
    orchestrator = new Orchestrator({ bridge, ai, onChange: publish });
    await storage.set("status", {});
    await bridge.loadCreds();
    if (bridge.creds) bridge.connect().catch((e) => log("info", "BRIDGE", `not connected yet: ${e.message}`));
  }
  var ready = init();
  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    });
  });
  chrome.runtime.onStartup.addListener(() => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    });
  });
  chrome.alarms.create("aipi-keepalive", { periodInMinutes: 0.5 });
  chrome.alarms.onAlarm.addListener(async (a) => {
    if (a.name !== "aipi-keepalive") return;
    await ready;
    if (bridge.creds && bridge.state === "DISCONNECTED" && bridge.wantConnected) bridge.connect().catch(() => {
    });
  });
  var COMMANDS = {
    async pair({ token, port }) {
      await ready;
      const fallback = port === void 0 || port === "" ? (await getSettings()).bridgePort : Number(port);
      const parsed = parsePairingCode(token, fallback);
      if (!parsed.token) throw new Error("Enter the pairing code shown in VS Code.");
      if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) throw new Error("Enter the VS Code bridge port as a number between 1 and 65535 (default 47821), or paste the full code that includes it, like 47821-ABCDEFGH1234.");
      await bridge.pair({ port: parsed.port, token: parsed.token });
      return { ok: true };
    },
    async connect() {
      await ready;
      await bridge.connect();
      return { ok: true };
    },
    async disconnect({ forget } = {}) {
      await ready;
      if (forget) await bridge.forget();
      else bridge.disconnect();
      return { ok: true };
    },
    async confirmAnalysis({ id }) {
      await ready;
      await orchestrator.confirmAnalysis(id);
      return { ok: true };
    },
    async declineAnalysis({ id }) {
      await ready;
      await orchestrator.declineAnalysis(id);
      return { ok: true };
    },
    async pause({ id }) {
      await ready;
      await orchestrator.panelControl("pause", id);
      return { ok: true };
    },
    async resume({ id }) {
      await ready;
      await orchestrator.panelControl("resume", id);
      return { ok: true };
    },
    async stop({ id }) {
      await ready;
      await orchestrator.panelControl("stop", id);
      return { ok: true };
    },
    async retryBatch({ id, batchId }) {
      await ready;
      await orchestrator.retryBatch(id, batchId);
      return { ok: true };
    },
    async skipBatch({ id, batchId }) {
      await ready;
      await orchestrator.skipBatch(id, batchId);
      return { ok: true };
    },
    async finalize({ id }) {
      await ready;
      await orchestrator.finalize(id);
      return { ok: true };
    },
    async runJob({ id }) {
      await ready;
      orchestrator.runJob(id).catch((e) => orchestrator.setJob(id, { status: "FAILED", error: e.message }));
      return { ok: true };
    },
    async dismissJob({ id }) {
      await ready;
      await orchestrator.dismissJob(id);
      return { ok: true };
    },
    async saveSettings({ patch }) {
      await saveSettings(patch);
      publish();
      return { ok: true };
    },
    async listTabs() {
      const s = await getSettings();
      return listProviderTabs(s.genericSite);
    },
    async checkProvider() {
      const s = await getSettings();
      const tab = await findTab(s.provider, s.genericSite);
      if (!tab) return { ok: false, message: "No supported AI tab found. Open ChatGPT, Claude or Gemini and log in." };
      if (!await ensureContent(tab.tabId, tab.provider)) return { ok: false, tab, message: "Could not attach to the tab. Reload it and try again." };
      return { tab, ...await selfTest(tab.tabId) };
    },
    async clearData() {
      await storage.remove("analyses");
      await storage.remove("jobs");
      await storage.remove("results");
      await storage.remove("batchPayloads");
      await storage.remove("outbox");
      await storage.remove("notices");
      publish();
      return { ok: true };
    }
  };
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.target !== "sw") return false;
    const fn = COMMANDS[msg.cmd];
    if (!fn) {
      sendResponse({ ok: false, error: `Unknown command ${msg.cmd}` });
      return false;
    }
    fn(msg.args || {}).then((r) => sendResponse({ ok: true, result: r }), (e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  });
  self.__aipi = { get bridge() {
    return bridge;
  }, get orchestrator() {
    return orchestrator;
  }, knowledgeStore };
})();
//# sourceMappingURL=background.js.map
