var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/config/configManager.js
var require_configManager = __commonJS({
  "src/config/configManager.js"(exports2, module2) {
    var DEFAULTS = {
      provider: "auto",
      model: "",
      maxTokens: 8e3,
      maxFiles: 40,
      maxLinesPerFile: 1500,
      maxTotalLines: 2e4,
      maxTokensPerFile: 6e3,
      maxTotalTokens: 2e5,
      maxDependencyDepth: 2,
      maxWorkflowDepth: 8,
      maxDocumentationDepth: 3,
      excludePatterns: ["node_modules", ".git", "dist", "build", ".next", "coverage", ".env", "*.log"],
      autoScan: false,
      autoUpdateDocumentation: false,
      detectSecrets: true,
      aiProjectFolder: ".ai-project",
      saveHistory: true,
      requireApprovalForChanges: true,
      chromeBridgePort: 47821,
      chromeBridgeHost: "127.0.0.1"
    };
    var PRESETS = {
      "Node.js": ["node_modules", "dist", "build", "coverage", "*.log"],
      React: ["node_modules", "build", "dist", "coverage"],
      "Next.js": ["node_modules", ".next", "out", "coverage"],
      Vue: ["node_modules", "dist", "coverage"],
      Angular: ["node_modules", "dist", ".angular", "coverage"],
      Python: ["__pycache__", ".venv", "venv", "*.pyc", ".pytest_cache"],
      PHP: ["vendor"],
      Laravel: ["vendor", "storage", "bootstrap/cache"],
      WordPress: ["wp-admin", "wp-includes", "wp-content/uploads"],
      Java: ["target", "build", ".gradle", "*.class"],
      ".NET": ["bin", "obj", "packages"]
    };
    var ConfigManager2 = class {
      constructor(vscodeApi) {
        this.vscode = vscodeApi || null;
        this.overrides = {};
      }
      get(key) {
        if (key in this.overrides) return this.overrides[key];
        if (this.vscode) {
          const v = this.vscode.workspace.getConfiguration("aiProject").get(key);
          if (v !== void 0) return v;
        }
        return DEFAULTS[key];
      }
      all() {
        const out = {};
        for (const k of Object.keys(DEFAULTS)) out[k] = this.get(k);
        return out;
      }
      async set(key, value) {
        if (!(key in DEFAULTS)) throw new Error(`Unknown setting: ${key}`);
        if (typeof value !== typeof DEFAULTS[key]) throw new Error(`Setting ${key} expects ${typeof DEFAULTS[key]}`);
        if (this.vscode) {
          await this.vscode.workspace.getConfiguration("aiProject").update(key, value, this.vscode.ConfigurationTarget.Workspace);
        } else {
          this.overrides[key] = value;
        }
      }
    };
    module2.exports = { ConfigManager: ConfigManager2, DEFAULTS, PRESETS };
  }
});

// src/utils/ids.js
var require_ids = __commonJS({
  "src/utils/ids.js"(exports2, module2) {
    var crypto = require("crypto");
    function pad(n, width = 3) {
      return String(n).padStart(width, "0");
    }
    function nextSequentialId(prefix, existing) {
      let max = 0;
      const re = new RegExp(`^${prefix}-(\\d+)$`);
      for (const id of existing) {
        const m = re.exec(id);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
      return `${prefix}-${pad(max + 1)}`;
    }
    function randomId(prefix, bytes = 6) {
      return `${prefix}-${crypto.randomBytes(bytes).toString("hex")}`;
    }
    function randomToken(bytes = 24) {
      return crypto.randomBytes(bytes).toString("base64url");
    }
    function newProjectId() {
      return randomId("project", 5);
    }
    module2.exports = { nextSequentialId, randomId, randomToken, newProjectId, pad };
  }
});

// src/knowledge/versionManager.js
var require_versionManager = __commonJS({
  "src/knowledge/versionManager.js"(exports2, module2) {
    var SCHEMA_VERSION = "1.0";
    var ANALYSIS_VERSION = "1.0";
    function isCompatibleSchema(v) {
      return typeof v === "string" && v.split(".")[0] === SCHEMA_VERSION.split(".")[0];
    }
    module2.exports = { SCHEMA_VERSION, ANALYSIS_VERSION, isCompatibleSchema };
  }
});

// src/utils/errors.js
var require_errors = __commonJS({
  "src/utils/errors.js"(exports2, module2) {
    var AiProjectError = class extends Error {
      constructor(code, message, details) {
        super(message);
        this.name = "AiProjectError";
        this.code = code;
        this.details = details;
      }
    };
    var ErrorCodes = {
      NO_WORKSPACE: "NO_WORKSPACE",
      NOT_INITIALIZED: "NOT_INITIALIZED",
      INVALID_MESSAGE: "INVALID_MESSAGE",
      PAIRING_FAILED: "PAIRING_FAILED",
      UNAUTHENTICATED: "UNAUTHENTICATED",
      PROTOCOL_MISMATCH: "PROTOCOL_MISMATCH",
      SCHEMA_MISMATCH: "SCHEMA_MISMATCH",
      PROJECT_MISMATCH: "PROJECT_MISMATCH",
      ANALYSIS_UNKNOWN: "ANALYSIS_UNKNOWN",
      PATH_TRAVERSAL: "PATH_TRAVERSAL",
      HASH_MISMATCH: "HASH_MISMATCH",
      CHROME_UNAVAILABLE: "CHROME_UNAVAILABLE",
      CONTEXT_TOO_LARGE: "CONTEXT_TOO_LARGE",
      ANALYSIS_FAILED: "ANALYSIS_FAILED",
      FILE_PERMISSION: "FILE_PERMISSION",
      UNSUPPORTED_PROJECT: "UNSUPPORTED_PROJECT"
    };
    function toUserMessage2(err) {
      if (err instanceof AiProjectError) return `${err.message} (${err.code})`;
      return err && err.message ? err.message : String(err);
    }
    module2.exports = { AiProjectError, ErrorCodes, toUserMessage: toUserMessage2 };
  }
});

// src/utils/mutex.js
var require_mutex = __commonJS({
  "src/utils/mutex.js"(exports2, module2) {
    var KeyedMutex = class {
      constructor() {
        this.tails = /* @__PURE__ */ new Map();
      }
      run(key, fn) {
        const prev = this.tails.get(key) || Promise.resolve();
        const next = prev.catch(() => {
        }).then(fn);
        const tail = next.catch(() => {
        });
        this.tails.set(key, tail);
        tail.then(() => {
          if (this.tails.get(key) === tail) this.tails.delete(key);
        });
        return next;
      }
    };
    module2.exports = { KeyedMutex };
  }
});

// src/utils/fsNames.js
var require_fsNames = __commonJS({
  "src/utils/fsNames.js"(exports2, module2) {
    var crypto = require("crypto");
    var ILLEGAL = /[<>:"|?*\u0000-\u001f]/g;
    var RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
    var MAX_SEGMENT = 120;
    function portableSegment(seg) {
      if (seg === "" || seg === "." || seg === "..") return seg;
      let s = String(seg).replace(ILLEGAL, "-");
      s = s.replace(/^\s+/, (m) => "_".repeat(m.length)).replace(/[\s.]+$/, (m) => "_".repeat(m.length));
      if (RESERVED.test(s.split(".")[0].trim())) s = `_${s}`;
      const m0 = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(s);
      let base = m0[1];
      const ext = m0[2] || "";
      if (s.length > MAX_SEGMENT) base = base.slice(0, MAX_SEGMENT - 10 - ext.length);
      const out = base + ext;
      if (out === seg) return seg;
      const hash = crypto.createHash("sha1").update(String(seg)).digest("hex").slice(0, 6);
      return `${base}~${hash}${ext}`;
    }
    var portableParts = (...segments) => segments.flatMap((x) => String(x).split(/[\\/]+/)).map(portableSegment);
    module2.exports = { portableSegment, portableParts };
  }
});

// src/knowledge/projectStore.js
var require_projectStore = __commonJS({
  "src/knowledge/projectStore.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { newProjectId } = require_ids();
    var { SCHEMA_VERSION, ANALYSIS_VERSION } = require_versionManager();
    var { AiProjectError, ErrorCodes } = require_errors();
    var { KeyedMutex } = require_mutex();
    var crypto = require("crypto");
    var { portableParts } = require_fsNames();
    var tmpName = (target) => `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    var SUBDIRS = [
      "index",
      "workflows",
      "database",
      "features",
      "architecture",
      "documentation/workflows",
      "documentation/database",
      "documentation/features",
      "documentation/files",
      "comparisons",
      "generation",
      "changes",
      "snapshots",
      "history"
    ];
    async function exists(p) {
      try {
        await fs.promises.access(p);
        return true;
      } catch {
        return false;
      }
    }
    var ProjectStore = class {
      constructor(workspaceRoot, folderName = ".ai-project") {
        this.workspaceRoot = workspaceRoot;
        this.dir = path.join(workspaceRoot, folderName);
        this.mutex = new KeyedMutex();
      }
      // Serialize read-modify-write cycles on one file: store.update('history/x.json', (cur) => next)
      update(rel, fn, fallback) {
        return this.mutex.run(rel, async () => {
          const next = await fn(await this.readJson(rel, fallback));
          await this.writeJson(rel, next);
          return next;
        });
      }
      // Every stored name is made valid on Windows, macOS and Linux (see utils/fsNames). Portable names are unchanged.
      p(...segments) {
        return path.join(this.dir, ...portableParts(...segments));
      }
      // Same path before that rule existed: lets a project written earlier on macOS/Linux with names like "<string:param>" still be read.
      legacyP(...segments) {
        return path.join(this.dir, ...segments);
      }
      async isInitialized() {
        return exists(this.p("project.json"));
      }
      // Never destroys existing knowledge: if project.json exists it is loaded untouched.
      async initialize(name) {
        if (await this.isInitialized()) return { project: await this.readJson("project.json"), created: false };
        for (const d of SUBDIRS) await fs.promises.mkdir(this.p(d), { recursive: true });
        const project = {
          projectId: newProjectId(),
          name: name || path.basename(this.workspaceRoot),
          schemaVersion: SCHEMA_VERSION,
          analysisVersion: ANALYSIS_VERSION,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await this.writeJson("project.json", project);
        await this.writeJson("config.json", { excludePatterns: void 0, notes: "Project-level overrides; workspace settings take precedence when unset." });
        await this.writeJson("workflows/index.json", { workflows: [] });
        await this.writeJson("features/index.json", { features: [] });
        return { project, created: true };
      }
      async ensureDirs() {
        for (const d of SUBDIRS) await fs.promises.mkdir(this.p(d), { recursive: true });
      }
      async readJson(rel, fallback) {
        try {
          return JSON.parse(await fs.promises.readFile(this.p(rel), "utf8"));
        } catch (err) {
          if (err.code === "ENOENT" && this.legacyP(rel) !== this.p(rel)) {
            try {
              return JSON.parse(await fs.promises.readFile(this.legacyP(rel), "utf8"));
            } catch {
            }
          }
          if (err.code === "ENOENT" && fallback !== void 0) return fallback;
          if (err instanceof SyntaxError) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `Corrupt JSON in .ai-project/${rel}`);
          throw err;
        }
      }
      // Atomic write: temp file + rename, so a crash never leaves half-written knowledge.
      async writeJson(rel, data) {
        const target = this.p(rel);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const tmp = tmpName(target);
        await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
        await fs.promises.rename(tmp, target);
      }
      async writeText(rel, text) {
        const target = this.p(rel);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const tmp = tmpName(target);
        await fs.promises.writeFile(tmp, text, "utf8");
        await fs.promises.rename(tmp, target);
      }
      async readText(rel, fallback) {
        try {
          return await fs.promises.readFile(this.p(rel), "utf8");
        } catch (e) {
          if (e.code === "ENOENT" && this.legacyP(rel) !== this.p(rel)) {
            try {
              return await fs.promises.readFile(this.legacyP(rel), "utf8");
            } catch {
            }
          }
          if (fallback !== void 0) return fallback;
          throw e;
        }
      }
      async listDir(rel) {
        try {
          return await fs.promises.readdir(this.p(rel));
        } catch {
          return [];
        }
      }
      async remove(rel) {
        await fs.promises.rm(this.p(rel), { force: true });
      }
      async exists(rel) {
        return exists(this.p(rel));
      }
    };
    module2.exports = { ProjectStore, SUBDIRS };
  }
});

// src/knowledge/coverageManager.js
var require_coverageManager = __commonJS({
  "src/knowledge/coverageManager.js"(exports2, module2) {
    function computeCoverage({ files, workflows = [], entities = [], history = [] }) {
      const analyzedStatuses = /* @__PURE__ */ new Set(["ANALYZED", "OUTDATED", "PARTIAL"]);
      const analyzed = files.filter((f) => analyzedStatuses.has(f.status));
      const outdated = files.filter((f) => f.status === "OUTDATED");
      const foldersAnalyzed = /* @__PURE__ */ new Set();
      for (const f of analyzed) {
        const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        if (dir) foldersAnalyzed.add(dir);
      }
      const sourceFiles = files.filter((f) => !f.binary && f.isSource);
      const total = sourceFiles.length || files.length;
      const upToDate = analyzed.filter((f) => f.status === "ANALYZED").length;
      let coverageStatus = "NOT_ANALYZED";
      if (analyzed.length > 0) {
        coverageStatus = analyzed.length >= total && outdated.length === 0 ? "COMPLETE" : "PARTIAL";
      }
      if (outdated.length > 0 && coverageStatus === "COMPLETE") coverageStatus = "PARTIAL";
      return {
        filesTotal: files.length,
        sourceFilesTotal: sourceFiles.length,
        filesAnalyzed: analyzed.length,
        filesUpToDate: upToDate,
        filesOutdated: outdated.length,
        foldersAnalyzed: foldersAnalyzed.size,
        workflowsAnalyzed: workflows.length,
        databaseEntitiesAnalyzed: entities.length,
        analysesCompleted: history.filter((h) => h.status === "COMPLETED").length,
        percent: total ? Math.round(analyzed.length / total * 100) : 0,
        coverageStatus
      };
    }
    module2.exports = { computeCoverage };
  }
});

// src/analyzer/reverseDependencyAnalyzer.js
var require_reverseDependencyAnalyzer = __commonJS({
  "src/analyzer/reverseDependencyAnalyzer.js"(exports2, module2) {
    function buildDependents(dependencies) {
      const dependents = {};
      for (const p of Object.keys(dependencies)) dependents[p] ||= [];
      for (const [file, d] of Object.entries(dependencies)) {
        for (const i of d.internal) (dependents[i.path] ||= []).push({ path: file, names: i.names });
      }
      for (const k of Object.keys(dependents)) dependents[k].sort((a, b) => a.path.localeCompare(b.path));
      return dependents;
    }
    function traverse(graph, start, direction, maxDepth) {
      const getNext = (p) => (direction === "dependents" ? graph.dependents[p] || [] : (graph.dependencies[p] || {}).internal || []).map((x) => x.path);
      const seen = /* @__PURE__ */ new Map([[start, 0]]);
      let frontier = [start];
      for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
        const next = [];
        for (const f of frontier) for (const n of getNext(f)) if (!seen.has(n)) {
          seen.set(n, depth);
          next.push(n);
        }
        frontier = next;
      }
      seen.delete(start);
      return [...seen.entries()].map(([path, depth]) => ({ path, depth })).sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
    }
    module2.exports = { buildDependents, traverse };
  }
});

// src/knowledge/knowledgeStore.js
var require_knowledgeStore = __commonJS({
  "src/knowledge/knowledgeStore.js"(exports2, module2) {
    var { computeCoverage } = require_coverageManager();
    var { traverse } = require_reverseDependencyAnalyzer();
    var fileDocKey = (p) => `files/${p}`;
    var safeName = (p) => p.replace(/[\\/]/g, "__");
    var KnowledgeStore = class {
      constructor(projectStore) {
        this.store = projectStore;
      }
      async getFiles() {
        return this.store.readJson("index/files.json", { files: [] }).then((d) => d.files);
      }
      async getFileMap() {
        return Object.fromEntries((await this.getFiles()).map((f) => [f.path, f]));
      }
      // Per-file analysis cache keyed by hash so unchanged files are never re-analyzed.
      async loadAnalysisCache() {
        const cache = await this.store.readJson("index/analysis-cache.json", { entries: {} });
        return new Map(Object.entries(cache.entries));
      }
      // Persist a scan + static analysis. Returns what changed and what that impacts.
      async saveStatic(scan, analysis, { maxImpactDepth = 2 } = {}) {
        const prev = await this.getFileMap();
        const analyzedByPath = new Map(analysis.files.map((a) => [a.path, a]));
        const outdated = [];
        const files = scan.files.map((f) => {
          const p = prev[f.path];
          let status = "NOT_ANALYZED";
          let analyzedHash = null;
          let analysisIds = [];
          if (p && p.analyzedHash) {
            analyzedHash = p.analyzedHash;
            analysisIds = p.analysisIds || [];
            if (p.analyzedHash === f.hash) status = p.status === "PARTIAL" ? "PARTIAL" : "ANALYZED";
            else {
              status = "OUTDATED";
              if (p.status !== "OUTDATED") outdated.push(f.path);
            }
          }
          const a = analyzedByPath.get(f.path);
          return { path: f.path, hash: f.hash, language: f.language, size: f.size, lines: f.lines, tokens: f.tokens, mtimeMs: f.mtimeMs, binary: !!f.binary, isSource: !!(a && a.isSource), isTest: !!(a && a.isTest), status, analyzedHash, analysisIds };
        });
        const currentPaths = new Set(files.map((f) => f.path));
        const removed = Object.keys(prev).filter((p) => !currentPaths.has(p));
        const changed = files.filter((f) => !prev[f.path] || prev[f.path].hash !== f.hash).map((f) => f.path);
        const changedExisting = changed.filter((p) => prev[p]).concat(removed);
        const impact = this.computeImpact(changedExisting, analysis, maxImpactDepth);
        const touched = /* @__PURE__ */ new Set([...impact.changedFiles, ...impact.dependents]);
        const docStatus = await this.getDocStatus();
        impact.documentation = Object.entries(docStatus.items).filter(([, it]) => Object.keys(it.sourceHashes || {}).some((p) => touched.has(p))).map(([k]) => k).sort();
        await this.store.writeJson("index/files.json", { schemaVersion: "1.0", generatedAt: (/* @__PURE__ */ new Date()).toISOString(), files });
        await this.store.writeJson("index/symbols.json", { symbols: analysis.files.flatMap((a) => a.symbols.map((s) => ({ file: a.path, name: s.name, type: s.type, className: s.className || null, line: s.line, endLine: s.endLine, exported: !!s.exported, params: s.params, calls: (s.calls || []).map((c) => c.name) }))) });
        await this.store.writeJson("index/imports.json", { imports: Object.fromEntries(analysis.files.filter((a) => a.imports.length).map((a) => [a.path, a.imports])) });
        await this.store.writeJson("index/exports.json", { exports: Object.fromEntries(analysis.files.filter((a) => a.exports.length).map((a) => [a.path, a.exports])) });
        await this.store.writeJson("index/dependencies.json", { dependencies: analysis.dependencies });
        await this.store.writeJson("index/dependents.json", { dependents: analysis.dependents });
        await this.store.writeJson("index/routes.json", { routes: analysis.apis });
        await this.store.writeJson("index/apis.json", { apis: analysis.apis.map((a) => ({ method: a.method, endpoint: a.endpoint, file: a.file, line: a.line, handler: a.handler, middleware: a.middleware, framework: a.framework })), clientCalls: analysis.apiLinks, auth: analysis.auth, externalServices: analysis.externalServices, events: analysis.events });
        await this.store.writeJson("index/database.json", { technologies: analysis.database.technologies, fileEntities: analysis.database.fileEntities });
        await this.store.writeJson("index/environment.json", scan.environment);
        await this.store.writeJson("index/validation.json", { validation: analysis.validation || [] });
        await this.store.writeJson("index/business-rules.json", { businessRules: analysis.businessLogic || [], stateManagement: analysis.stateManagement || [], events: analysis.events || [] });
        await this.store.writeJson("index/packages.json", { manifests: (scan.packages.manifests || []).map((m) => ({ path: m.path, kind: m.kind, name: m.name || null, version: m.version || null, ecosystem: m.ecosystem || null, dependencies: m.dependencies || {}, devDependencies: m.devDependencies || {} })), scripts: scan.packages.commands ? scan.packages.commands.scripts : {} });
        await this.store.writeJson("index/analysis-cache.json", { entries: Object.fromEntries(analysis.files.map((a) => [a.path, { hash: a.hash, analysis: a }])) });
        await this._saveDatabase(analysis.database);
        await this._saveFeatures(analysis.features);
        await this._saveArchitectureIndex(analysis, scan);
        if (impact.documentation.length || outdated.length) await this.refreshDocumentationStatus(Object.fromEntries(files.map((f) => [f.path, f.hash])));
        return { files, changed, removed, outdated, impact };
      }
      // What is affected when these files change: dependents, workflows, features, entities, documentation.
      computeImpact(changedPaths, analysis, depth) {
        const set = new Set(changedPaths);
        const graph = { dependencies: analysis.dependencies, dependents: analysis.dependents };
        const dependents = /* @__PURE__ */ new Set();
        for (const p of set) for (const d of traverse(graph, p, "dependents", depth)) dependents.add(d.path);
        const affected = /* @__PURE__ */ new Set([...set, ...dependents]);
        return {
          changedFiles: [...set].sort(),
          dependents: [...dependents].filter((d) => !set.has(d)).sort(),
          workflows: analysis.workflows.filter((w) => w.summary.files.some((f) => affected.has(f))).map((w) => w.id),
          features: analysis.features.filter((f) => f.files.some((x) => affected.has(x))).map((f) => f.id),
          entities: analysis.database.entities.filter((e) => affected.has(e.file)).map((e) => e.name),
          documentation: []
        };
      }
      async _saveDatabase(db) {
        const prev = await this.store.readJson("database/entities.json", { entities: [] });
        const prevByName = new Map(prev.entities.map((e) => [e.name, e]));
        const entities = db.entities.map((e) => ({ ...e, static: true, knowledge: (prevByName.get(e.name) || {}).knowledge || null }));
        for (const e of prev.entities) if (!db.entities.some((x) => x.name === e.name) && e.knowledge && e.staticMissing !== true && e.origin === "AI") entities.push(e);
        await this.store.writeJson("database/entities.json", { entities });
        await this.store.writeJson("database/schema.json", { technologies: db.technologies.map((t) => t.name), tables: db.entities.filter((e) => e.kind === "table").map((e) => ({ name: e.name, fields: e.fields, file: e.file })), indexes: db.indexes });
        const prevRel = await this.store.readJson("database/relationships.json", { relationships: [] });
        const keep = prevRel.relationships.filter((r) => r.origin === "AI" && !db.relationships.some((x) => x.from === r.from && x.to === r.to && x.type === r.type));
        await this.store.writeJson("database/relationships.json", { relationships: [...db.relationships, ...keep] });
        await this.store.writeJson("database/queries.json", { queries: db.queries });
        await this.store.writeJson("database/data-flows.json", { dataFlows: db.dataFlows });
      }
      async _saveFeatures(features) {
        const prevIndex = await this.store.readJson("features/index.json", { features: [] });
        for (const f of features) {
          const prev = await this.store.readJson(`features/${f.id}.json`, null);
          await this.store.writeJson(`features/${f.id}.json`, { ...f, knowledge: prev ? prev.knowledge || null : null });
        }
        const aiOnly = prevIndex.features.filter((f) => f.origin === "AI" && !features.some((x) => x.id === f.id));
        await this.store.writeJson("features/index.json", { features: [...features.map((f) => ({ id: f.id, name: f.name, status: f.status, files: f.files.length, apis: f.apis.length, entities: f.entities })), ...aiOnly], generatedAt: (/* @__PURE__ */ new Date()).toISOString() });
      }
      async _saveArchitectureIndex(analysis, scan) {
        await this.store.writeJson("architecture/architecture.json", { ...analysis.architecture, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), scanTotals: scan.totals });
      }
      // ---- documentation status (hash based) ----
      async getDocStatus() {
        return this.store.readJson("documentation/status.json", { items: {} });
      }
      // Record that a documentation item was produced from these source files at these hashes.
      async recordDocumentation(key, sourceHashes, status = "ANALYZED") {
        const doc = await this.getDocStatus();
        doc.items[key] = { status, sourceHashes, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        await this.store.writeJson("documentation/status.json", doc);
      }
      // Marks documentation OUTDATED when any source hash it was built from has changed or the file is gone.
      async refreshDocumentationStatus(currentHashes) {
        const doc = await this.getDocStatus();
        const outdated = [];
        for (const [key, item] of Object.entries(doc.items)) {
          const stale = Object.entries(item.sourceHashes || {}).some(([p, h]) => currentHashes[p] !== h);
          if (stale && item.status !== "OUTDATED") {
            item.status = "OUTDATED";
            item.outdatedAt = (/* @__PURE__ */ new Date()).toISOString();
            outdated.push(key);
          }
        }
        if (outdated.length) await this.store.writeJson("documentation/status.json", doc);
        return outdated;
      }
      // ---- file knowledge ----
      async getFileKnowledge(p) {
        return this.store.readJson(`documentation/files/${safeName(p)}.json`, null);
      }
      async saveFileKnowledge(p, data) {
        await this.store.writeJson(`documentation/files/${safeName(p)}.json`, data);
      }
      // Called after reconciliation accepted knowledge about files: sets ANALYZED + analyzedHash.
      async markAnalyzed(analysisId, fileStatuses) {
        const files = await this.getFiles();
        const map = new Map(files.map((f) => [f.path, f]));
        for (const { path: p, hash, status } of fileStatuses) {
          const f = map.get(p);
          if (!f || f.hash !== hash) continue;
          f.analyzedHash = hash;
          f.status = status || "ANALYZED";
          f.analysisIds = [.../* @__PURE__ */ new Set([...f.analysisIds || [], analysisId])];
        }
        await this.store.writeJson("index/files.json", { schemaVersion: "1.0", generatedAt: (/* @__PURE__ */ new Date()).toISOString(), files });
      }
      async coverage(history = []) {
        const files = await this.getFiles();
        const wf = await this.store.readJson("workflows/index.json", { workflows: [] });
        const ents = await this.store.readJson("database/entities.json", { entities: [] });
        const workflows = [];
        for (const w of wf.workflows) {
          const d = await this.store.readJson(`workflows/${w.id}.json`, null);
          if (d && d.knowledge) workflows.push(w);
        }
        return computeCoverage({ files, workflows, entities: ents.entities.filter((e) => e.knowledge), history });
      }
    };
    module2.exports = { KnowledgeStore, safeName, fileDocKey };
  }
});

// src/knowledge/historyManager.js
var require_historyManager = __commonJS({
  "src/knowledge/historyManager.js"(exports2, module2) {
    var { nextSequentialId } = require_ids();
    var HistoryManager = class {
      constructor(store) {
        this.store = store;
      }
      async list() {
        const names = (await this.store.listDir("history")).filter((n) => /^analysis-\d+\.json$/.test(n)).sort();
        const out = [];
        for (const n of names) out.push(await this.store.readJson(`history/${n}`));
        return out;
      }
      async get(analysisId) {
        if (!/^analysis-\d+$/.test(analysisId)) return null;
        return this.store.readJson(`history/${analysisId}.json`, null);
      }
      async create({ projectId, mode, purpose, selection, files, provider }) {
        const existing = (await this.store.listDir("history")).map((n) => n.replace(/\.json$/, ""));
        const analysisId = nextSequentialId("analysis", existing);
        const record = {
          analysisId,
          projectId,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          mode,
          purpose: purpose || null,
          selection: selection || { files: [], folders: [], features: [], workflows: [] },
          files: files || [],
          // [{path, hash}] at time of analysis
          status: "CREATED",
          provider: provider || null,
          batches: [],
          checkpoints: [],
          knowledgeChanges: null,
          coverageBefore: null,
          coverageAfter: null
        };
        await this.store.writeJson(`history/${analysisId}.json`, record);
        return record;
      }
      async update(analysisId, patch) {
        if (!/^analysis-\d+$/.test(analysisId)) throw new Error(`Unknown analysis ${analysisId}`);
        return this.store.update(`history/${analysisId}.json`, (rec) => {
          if (!rec) throw new Error(`Unknown analysis ${analysisId}`);
          return { ...rec, ...patch, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        }, null);
      }
      // Checkpoint after every successful batch, so an interrupted analysis resumes without repeating work.
      async checkpoint(analysisId, cp) {
        if (!/^analysis-\d+$/.test(analysisId)) throw new Error(`Unknown analysis ${analysisId}`);
        return this.store.update(`history/${analysisId}.json`, (rec) => {
          if (!rec) throw new Error(`Unknown analysis ${analysisId}`);
          const existing = rec.checkpoints.filter((c) => c.batchId !== cp.batchId);
          existing.push({ analysisId, batchId: cp.batchId, status: cp.status, responseReceived: !!cp.responseReceived, knowledgeMerged: !!cp.knowledgeMerged, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
          return { ...rec, checkpoints: existing, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        }, null);
      }
      completedBatchIds(record) {
        return new Set(record.checkpoints.filter((c) => c.status === "completed" && c.responseReceived).map((c) => c.batchId));
      }
      // Analyses that can be resumed.
      async resumable() {
        return (await this.list()).filter((r) => ["SENT", "IN_PROGRESS", "PAUSED", "DISCONNECTED", "FAILED"].includes(r.status));
      }
    };
    module2.exports = { HistoryManager };
  }
});

// src/workflows/workflowStore.js
var require_workflowStore = __commonJS({
  "src/workflows/workflowStore.js"(exports2, module2) {
    function toIndexEntry(w) {
      return { id: w.id, name: w.name, status: w.status, trigger: w.trigger.type, api: w.api, files: w.summary.files.length, databaseWrites: w.summary.databaseWrites, sourceFiles: w.summary.files };
    }
    var WorkflowStore = class {
      constructor(store) {
        this.store = store;
      }
      async list() {
        return (await this.store.readJson("workflows/index.json", { workflows: [] })).workflows;
      }
      async get(id) {
        return this.store.readJson(`workflows/${id}.json`, null);
      }
      async saveAll(workflows) {
        const existingIds = (await this.list()).map((w) => w.id);
        for (const w of workflows) {
          const prev = await this.get(w.id);
          const merged = prev ? { ...w, knowledge: prev.knowledge || null } : { ...w, knowledge: null };
          if (prev && prev.origin === "AI" && !w.steps.length) continue;
          await this.store.writeJson(`workflows/${w.id}.json`, merged);
        }
        await this.store.writeJson("workflows/index.json", { workflows: workflows.map(toIndexEntry), generatedAt: (/* @__PURE__ */ new Date()).toISOString() });
        return { written: workflows.length, removed: existingIds.filter((id) => !workflows.some((w) => w.id === id)) };
      }
    };
    module2.exports = { WorkflowStore };
  }
});

// src/scanner/exclusions.js
var require_exclusions = __commonJS({
  "src/scanner/exclusions.js"(exports2, module2) {
    function globToRegex(glob) {
      const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
      return new RegExp(`^${esc}$`, "i");
    }
    function compileExclusions(patterns) {
      const rules = (patterns || []).map((p) => String(p).trim().replace(/^\.?\//, "").replace(/\/$/, "")).filter(Boolean).map((p) => {
        const hasSlash = p.includes("/");
        const hasGlob = p.includes("*");
        return { p, hasSlash, re: hasGlob ? globToRegex(p) : null };
      });
      return function isExcluded(relPath) {
        const segments = relPath.split("/");
        const base = segments[segments.length - 1];
        for (const r of rules) {
          if (r.hasSlash) {
            if (r.re ? r.re.test(relPath) : relPath.toLowerCase() === r.p.toLowerCase() || relPath.toLowerCase().startsWith(r.p.toLowerCase() + "/")) return true;
          } else if (r.re) {
            if (segments.some((s) => r.re.test(s))) return true;
          } else if (segments.some((x) => x.toLowerCase() === r.p.toLowerCase())) {
            return true;
          }
        }
        return false;
      };
    }
    module2.exports = { compileExclusions };
  }
});

// src/scanner/languageDetector.js
var require_languageDetector = __commonJS({
  "src/scanner/languageDetector.js"(exports2, module2) {
    var path = require("path");
    var EXT = {
      ".js": "javascript",
      ".jsx": "javascript",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".ts": "typescript",
      ".tsx": "typescript",
      ".vue": "vue",
      ".svelte": "svelte",
      ".py": "python",
      ".php": "php",
      ".rb": "ruby",
      ".go": "go",
      ".java": "java",
      ".kt": "kotlin",
      ".cs": "csharp",
      ".rs": "rust",
      ".swift": "swift",
      ".dart": "dart",
      ".sql": "sql",
      ".prisma": "prisma",
      ".graphql": "graphql",
      ".gql": "graphql",
      ".json": "json",
      ".yml": "yaml",
      ".yaml": "yaml",
      ".toml": "toml",
      ".xml": "xml",
      ".ini": "ini",
      ".html": "html",
      ".htm": "html",
      ".css": "css",
      ".scss": "scss",
      ".less": "less",
      ".md": "markdown",
      ".sh": "shell",
      ".env": "env",
      ".properties": "properties"
    };
    var SPECIAL = {
      Dockerfile: "dockerfile",
      Makefile: "makefile",
      ".env": "env",
      ".env.example": "env"
    };
    var BINARY_EXT = /* @__PURE__ */ new Set([
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".webp",
      ".ico",
      ".bmp",
      ".svg",
      ".pdf",
      ".zip",
      ".gz",
      ".tar",
      ".tgz",
      ".rar",
      ".7z",
      ".woff",
      ".woff2",
      ".ttf",
      ".eot",
      ".otf",
      ".mp3",
      ".mp4",
      ".mov",
      ".avi",
      ".wav",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".class",
      ".jar",
      ".pyc",
      ".lock",
      ".map",
      ".psd",
      ".sqlite",
      ".db"
    ]);
    var SOURCE_LANGS = /* @__PURE__ */ new Set([
      "javascript",
      "typescript",
      "vue",
      "svelte",
      "python",
      "php",
      "ruby",
      "go",
      "java",
      "kotlin",
      "csharp",
      "rust",
      "swift",
      "dart"
    ]);
    function detectLanguage(relPath) {
      const base = path.posix.basename(relPath);
      if (SPECIAL[base]) return SPECIAL[base];
      if (base.startsWith(".env")) return "env";
      const ext = path.posix.extname(base).toLowerCase();
      return EXT[ext] || "unknown";
    }
    var isBinaryPath = (relPath) => BINARY_EXT.has(path.posix.extname(relPath).toLowerCase());
    var isSourceLanguage = (lang) => SOURCE_LANGS.has(lang);
    module2.exports = { detectLanguage, isBinaryPath, isSourceLanguage };
  }
});

// src/scanner/hashCalculator.js
var require_hashCalculator = __commonJS({
  "src/scanner/hashCalculator.js"(exports2, module2) {
    var crypto = require("crypto");
    var fs = require("fs");
    function hashBuffer(buf) {
      return "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
    }
    function hashString(s) {
      return hashBuffer(Buffer.from(s, "utf8"));
    }
    function hashFile(absPath) {
      return new Promise((resolve, reject) => {
        const h = crypto.createHash("sha256");
        const s = fs.createReadStream(absPath);
        s.on("error", reject);
        s.on("data", (c) => h.update(c));
        s.on("end", () => resolve("sha256:" + h.digest("hex")));
      });
    }
    module2.exports = { hashBuffer, hashString, hashFile };
  }
});

// src/scanner/tokenEstimator.js
var require_tokenEstimator = __commonJS({
  "src/scanner/tokenEstimator.js"(exports2, module2) {
    function estimateTokens(text) {
      if (!text) return 0;
      return Math.ceil(text.length / 3.6);
    }
    module2.exports = { estimateTokens };
  }
});

// src/utils/paths.js
var require_paths = __commonJS({
  "src/utils/paths.js"(exports2, module2) {
    var path = require("path");
    var { AiProjectError, ErrorCodes } = require_errors();
    function toPosix(p) {
      return p.split(path.sep).join("/");
    }
    function toRelative(root, absolute) {
      return toPosix(path.relative(root, absolute));
    }
    function resolveInside(root, rel) {
      if (typeof rel !== "string" || rel.length === 0 || rel.includes("\0")) {
        throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, "Invalid path.");
      }
      if (path.isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel)) {
        throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Absolute paths are not accepted: ${rel}`);
      }
      const abs = path.resolve(root, rel);
      const relBack = path.relative(root, abs);
      if (relBack.startsWith("..") || path.isAbsolute(relBack)) {
        throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Path escapes the project: ${rel}`);
      }
      return abs;
    }
    function normalizeRelative(rel) {
      return toPosix(path.posix.normalize(rel.replace(/\\/g, "/"))).replace(/^\.\//, "");
    }
    module2.exports = { toPosix, toRelative, resolveInside, normalizeRelative };
  }
});

// src/scanner/fileScanner.js
var require_fileScanner = __commonJS({
  "src/scanner/fileScanner.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { detectLanguage, isBinaryPath } = require_languageDetector();
    var { hashFile } = require_hashCalculator();
    var { estimateTokens } = require_tokenEstimator();
    var { toPosix } = require_paths();
    var MAX_TEXT_BYTES = 2 * 1024 * 1024;
    async function readTextIfSmall(abs, size) {
      if (size > MAX_TEXT_BYTES) return null;
      const buf = await fs.promises.readFile(abs);
      if (buf.includes(0)) return null;
      return buf.toString("utf8");
    }
    async function scanFile(root, relPath, previous) {
      const abs = path.join(root, relPath);
      const st = await fs.promises.stat(abs);
      const base = {
        path: relPath,
        language: detectLanguage(relPath),
        size: st.size,
        mtimeMs: Math.round(st.mtimeMs)
      };
      if (isBinaryPath(relPath)) {
        return { ...base, binary: true, hash: await hashFile(abs), lines: 0, tokens: 0 };
      }
      if (previous && previous.size === base.size && previous.mtimeMs === base.mtimeMs && previous.hash) {
        return { ...base, binary: !!previous.binary, hash: previous.hash, lines: previous.lines, tokens: previous.tokens, reused: true };
      }
      const text = await readTextIfSmall(abs, st.size);
      if (text === null) {
        return { ...base, binary: true, hash: await hashFile(abs), lines: 0, tokens: 0 };
      }
      return {
        ...base,
        binary: false,
        hash: await hashFile(abs),
        lines: text.length === 0 ? 0 : text.split("\n").length,
        tokens: estimateTokens(text)
      };
    }
    async function walk(root, isExcluded, onError) {
      const files = [];
      const folders = [];
      async function visit(relDir) {
        let entries;
        try {
          entries = await fs.promises.readdir(path.join(root, relDir), { withFileTypes: true });
        } catch (err) {
          if (onError) onError(relDir, err);
          return;
        }
        for (const e of entries) {
          const rel = toPosix(path.posix.join(relDir, e.name));
          if (isExcluded(rel)) continue;
          if (e.isSymbolicLink()) continue;
          if (e.isDirectory()) {
            folders.push(rel);
            await visit(rel);
          } else if (e.isFile()) {
            files.push(rel);
          }
        }
      }
      await visit("");
      files.sort();
      folders.sort();
      return { files, folders };
    }
    async function mapLimit(items, limit, fn) {
      const out = new Array(items.length);
      let i = 0;
      async function worker() {
        while (i < items.length) {
          const idx = i++;
          out[idx] = await fn(items[idx], idx);
        }
      }
      await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
      return out;
    }
    module2.exports = { scanFile, walk, mapLimit };
  }
});

// src/scanner/folderScanner.js
var require_folderScanner = __commonJS({
  "src/scanner/folderScanner.js"(exports2, module2) {
    function scanFolders(folderPaths, fileRecords) {
      const map = new Map(folderPaths.map((p) => [p, { path: p, files: 0, lines: 0, tokens: 0, languages: {} }]));
      for (const f of fileRecords) {
        let dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
        while (dir) {
          const rec = map.get(dir);
          if (rec) {
            rec.files += 1;
            rec.lines += f.lines || 0;
            rec.tokens += f.tokens || 0;
            rec.languages[f.language] = (rec.languages[f.language] || 0) + 1;
          }
          dir = dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "";
        }
      }
      return [...map.values()];
    }
    module2.exports = { scanFolders };
  }
});

// src/scanner/packageScanner.js
var require_packageScanner = __commonJS({
  "src/scanner/packageScanner.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var MANIFESTS = [
      "package.json",
      "composer.json",
      "requirements.txt",
      "pyproject.toml",
      "Pipfile",
      "pom.xml",
      "build.gradle",
      "build.gradle.kts",
      "go.mod",
      "Gemfile",
      "*.csproj"
    ];
    async function readJson(abs) {
      try {
        return JSON.parse(await fs.promises.readFile(abs, "utf8"));
      } catch {
        return null;
      }
    }
    async function readText(abs) {
      try {
        return await fs.promises.readFile(abs, "utf8");
      } catch {
        return null;
      }
    }
    var NODE_TECH = {
      react: "React",
      next: "Next.js",
      vue: "Vue",
      "@angular/core": "Angular",
      express: "Express",
      "@nestjs/core": "NestJS",
      mysql: "MySQL",
      mysql2: "MySQL",
      pg: "PostgreSQL",
      mongodb: "MongoDB",
      mongoose: "Mongoose",
      firebase: "Firebase",
      "firebase-admin": "Firebase",
      sqlite3: "SQLite",
      "better-sqlite3": "SQLite",
      redis: "Redis",
      ioredis: "Redis",
      "@supabase/supabase-js": "Supabase",
      "@prisma/client": "Prisma",
      prisma: "Prisma",
      sequelize: "Sequelize",
      typeorm: "TypeORM",
      stripe: "Stripe",
      "@sendgrid/mail": "SendGrid",
      twilio: "Twilio",
      "aws-sdk": "AWS",
      jsonwebtoken: "JWT",
      passport: "Passport",
      jest: "Jest",
      vitest: "Vitest",
      mocha: "Mocha",
      graphql: "GraphQL",
      "socket.io": "Socket.IO",
      ws: "WebSocket"
    };
    var GO_TECH = { "github.com/gin-gonic/gin": "Gin", "github.com/labstack/echo": "Echo", "github.com/gofiber/fiber": "Fiber", "github.com/go-chi/chi": "chi", "github.com/gorilla/mux": "Gorilla Mux", "gorm.io/gorm": "GORM", "github.com/jmoiron/sqlx": "sqlx", "github.com/jackc/pgx": "PostgreSQL", "github.com/lib/pq": "PostgreSQL", "github.com/go-sql-driver/mysql": "MySQL", "go.mongodb.org/mongo-driver": "MongoDB", "github.com/redis/go-redis": "Redis", "github.com/go-redis/redis": "Redis", "github.com/golang-jwt/jwt": "JWT", "github.com/stripe/stripe-go": "Stripe", "github.com/go-playground/validator": "go-playground/validator" };
    var PY_TECH = { django: "Django", flask: "Flask", fastapi: "FastAPI", sqlalchemy: "SQLAlchemy", sqlmodel: "SQLModel", pydantic: "Pydantic", celery: "Celery", "djangorestframework": "Django REST framework", marshmallow: "marshmallow", pymongo: "MongoDB", redis: "Redis", stripe: "Stripe", "psycopg2": "PostgreSQL", "psycopg2-binary": "PostgreSQL", pyjwt: "JWT", alembic: "Alembic" };
    function parseGoMod(text) {
      const deps = {};
      for (const m of text.matchAll(/^\s*require\s+([^\s(]+)\s+(v[^\s]+)/gm)) deps[m[1]] = m[2];
      for (const b of text.matchAll(/^\s*require\s*\(([\s\S]*?)^\s*\)/gm)) for (const l of b[1].split("\n")) {
        const m = /^\s*([^\s/][^\s]*)\s+(v[^\s]+)/.exec(l.replace(/\/\/.*$/, ""));
        if (m) deps[m[1]] = m[2];
      }
      return deps;
    }
    function parsePython(text, base) {
      const deps = {};
      const add = (spec) => {
        const m = /^\s*([A-Za-z0-9_.-]+)\s*(?:\[[^\]]*\])?\s*((?:[=<>!~]=?|===)\s*[^\s;#,]+(?:\s*,\s*[=<>!~]=?\s*[^\s;#,]+)*)?/.exec(spec);
        if (m && m[1] && !/^(python|-r|-e)$/i.test(m[1])) deps[m[1].toLowerCase()] = (m[2] || "*").replace(/\s+/g, "");
      };
      if (base === "requirements.txt") {
        for (const l of text.split("\n")) {
          const t = l.replace(/#.*$/, "").trim();
          if (t && !t.startsWith("-") && !t.startsWith("http")) add(t);
        }
        return deps;
      }
      const proj = /\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/.exec(text);
      if (proj) for (const m of proj[1].matchAll(/["']([^"']+)["']/g)) add(m[1]);
      const poetry = /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/.exec(text);
      if (poetry) {
        for (const m of poetry[1].matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:["']([^"']+)["']|\{[^}]*version\s*=\s*["']([^"']+)["'])/gm)) if (m[1].toLowerCase() !== "python") deps[m[1].toLowerCase()] = m[2] || m[3];
      }
      return deps;
    }
    async function scanPackages(root, filePaths) {
      const found = [];
      const technologies = /* @__PURE__ */ new Map();
      const commands = { scripts: {} };
      const addTech = (name, file) => {
        if (!technologies.has(name)) technologies.set(name, /* @__PURE__ */ new Set());
        technologies.get(name).add(file);
      };
      const manifestFiles = filePaths.filter((p) => {
        const base = path.posix.basename(p);
        return MANIFESTS.some((m) => m.startsWith("*") ? base.endsWith(m.slice(1)) : base === m);
      });
      for (const rel of manifestFiles) {
        const abs = path.join(root, rel);
        const base = path.posix.basename(rel);
        const entry = { path: rel, kind: base, dependencies: {}, devDependencies: {} };
        if (base === "package.json") {
          const pkg = await readJson(abs);
          if (!pkg) continue;
          entry.name = pkg.name;
          entry.version = pkg.version;
          entry.dependencies = pkg.dependencies || {};
          entry.devDependencies = pkg.devDependencies || {};
          addTech("Node.js", rel);
          entry.ecosystem = "npm";
          const all = { ...entry.dependencies, ...entry.devDependencies };
          for (const [dep, tech] of Object.entries(NODE_TECH)) if (all[dep]) addTech(tech, rel);
          if (pkg.scripts) {
            commands.scripts[rel] = pkg.scripts;
          }
        } else if (base === "composer.json") {
          const c = await readJson(abs);
          if (!c) continue;
          entry.dependencies = c.require || {};
          entry.ecosystem = "composer";
          addTech("PHP", rel);
          if (entry.dependencies["laravel/framework"]) addTech("Laravel", rel);
        } else if (base === "requirements.txt" || base === "Pipfile" || base === "pyproject.toml") {
          const t = await readText(abs) || "";
          addTech("Python", rel);
          entry.ecosystem = "pip";
          entry.dependencies = base === "Pipfile" ? {} : parsePython(t, base);
          for (const [dep, tech] of Object.entries(PY_TECH)) if (entry.dependencies[dep]) addTech(tech, rel);
          if (/django/i.test(t)) addTech("Django", rel);
          if (/flask/i.test(t)) addTech("Flask", rel);
          if (/sqlalchemy/i.test(t)) addTech("SQLAlchemy", rel);
        } else if (base === "pom.xml" || base.startsWith("build.gradle")) {
          const t = await readText(abs) || "";
          addTech("Java", rel);
          if (/spring-boot|springframework/i.test(t)) addTech("Spring", rel);
        } else if (base === "go.mod") {
          const t = await readText(abs) || "";
          addTech("Go", rel);
          entry.ecosystem = "go";
          entry.name = (/^\s*module\s+(\S+)/m.exec(t) || [])[1];
          entry.dependencies = parseGoMod(t);
          for (const [dep, tech] of Object.entries(GO_TECH)) if (Object.keys(entry.dependencies).some((d) => d === dep || d.startsWith(`${dep}/`))) addTech(tech, rel);
        } else if (base === "Gemfile") {
          addTech("Ruby", rel);
        } else if (base.endsWith(".csproj")) {
          addTech(".NET", rel);
        }
        found.push(entry);
      }
      return {
        manifests: found,
        technologies: [...technologies.entries()].map(([name, files]) => ({ name, evidence: [...files].sort() })).sort((a, b) => a.name.localeCompare(b.name)),
        commands
      };
    }
    module2.exports = { scanPackages };
  }
});

// src/scanner/configScanner.js
var require_configScanner = __commonJS({
  "src/scanner/configScanner.js"(exports2, module2) {
    var path = require("path");
    var CONFIG_MATCHERS = [
      { re: /^(\.eslintrc.*|eslint\.config\..*)$/, kind: "lint" },
      { re: /^(\.prettierrc.*|prettier\.config\..*)$/, kind: "format" },
      { re: /^(webpack|vite|rollup|esbuild|next|nuxt|vue|angular|babel|jest|vitest|playwright|cypress)\.config\..*$/, kind: "build-or-test" },
      { re: /^(tsconfig|jsconfig)\.json$/, kind: "compiler" },
      { re: /^(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/, kind: "deployment" },
      { re: /^(vercel\.json|netlify\.toml|serverless\.ya?ml|firebase\.json|app\.yaml|Procfile|fly\.toml)$/, kind: "deployment" },
      { re: /^\.github$/, kind: "ci" },
      { re: /^(\.gitlab-ci\.yml|Jenkinsfile|azure-pipelines\.yml|\.travis\.yml|bitbucket-pipelines\.yml)$/, kind: "ci" },
      { re: /^(\.env(\..*)?|\.env\.example)$/, kind: "environment" },
      { re: /^(schema\.prisma|knexfile\..*|ormconfig\..*|sequelize\.config\..*|\.sequelizerc)$/, kind: "database" },
      { re: /^(wp-config\.php|artisan|manage\.py|settings\.py|application\.(properties|ya?ml)|appsettings.*\.json)$/, kind: "framework" }
    ];
    function scanConfig(filePaths) {
      const out = [];
      for (const p of filePaths) {
        const base = path.posix.basename(p);
        const inWorkflows = p.startsWith(".github/workflows/");
        if (inWorkflows) {
          out.push({ path: p, kind: "ci" });
          continue;
        }
        for (const m of CONFIG_MATCHERS) {
          if (m.re.test(base)) {
            out.push({ path: p, kind: m.kind });
            break;
          }
        }
      }
      return out;
    }
    module2.exports = { scanConfig };
  }
});

// src/scanner/environmentScanner.js
var require_environmentScanner = __commonJS({
  "src/scanner/environmentScanner.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var REF_PATTERNS = [
      /process\.env\.([A-Z_][A-Z0-9_]*)/g,
      /process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g,
      /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
      /os\.environ(?:\.get)?\(?\[?['"]([A-Z_][A-Z0-9_]*)['"]/g,
      /os\.getenv\(['"]([A-Z_][A-Z0-9_]*)['"]/g,
      /getenv\(['"]([A-Z_][A-Z0-9_]*)['"]\)/g,
      /env\(['"]([A-Z_][A-Z0-9_]*)['"]/g,
      /os\.(?:Getenv|LookupEnv)\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g,
      /Environment\.GetEnvironmentVariable\(["']([A-Za-z_][A-Za-z0-9_]*)["']/g
    ];
    function extractEnvRefs(content) {
      const names = /* @__PURE__ */ new Set();
      for (const re of REF_PATTERNS) {
        re.lastIndex = 0;
        let m;
        while (m = re.exec(content)) names.add(m[1]);
      }
      return [...names];
    }
    function envFileKeys(content) {
      const keys = [];
      for (const line of content.split("\n")) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
        if (m) keys.push(m[1]);
      }
      return keys;
    }
    async function scanEnvironment(root, filePaths, fileContents) {
      const references = {};
      for (const [rel, content] of fileContents) {
        const names = extractEnvRefs(content);
        for (const n of names) (references[n] ||= []).push(rel);
      }
      const declared = {};
      for (const rel of filePaths) {
        const base = path.posix.basename(rel);
        if (!/^\.env(\..*)?$/.test(base)) continue;
        try {
          const txt = await fs.promises.readFile(path.join(root, rel), "utf8");
          declared[rel] = envFileKeys(txt);
        } catch {
        }
      }
      return {
        variables: Object.keys(references).sort().map((name) => ({ name, usedIn: references[name].sort() })),
        declaredIn: declared
      };
    }
    module2.exports = { scanEnvironment, extractEnvRefs, envFileKeys };
  }
});

// src/utils/logger.js
var require_logger = __commonJS({
  "src/utils/logger.js"(exports2, module2) {
    var TAGS = ["AI-PROJECT", "BRIDGE", "ANALYSIS", "KNOWLEDGE", "WORKFLOW", "DATABASE", "SECURITY", "CHANGE"];
    var SCRUB = [
      /(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
      /((?:api[_-]?key|secret|token|password|passwd|pwd)["'\s:=]+)["']?[^\s"',;]{6,}/gi,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
    ];
    function scrub(text) {
      let out = String(text);
      for (const re of SCRUB) out = out.replace(re, (m, p1) => `${typeof p1 === "string" ? p1 : ""}[REDACTED_SECRET]`);
      return out;
    }
    var sink = (line) => console.log(line);
    var level = "info";
    var ORDER = { debug: 0, info: 1, warn: 2, error: 3 };
    function setSink(fn) {
      sink = fn;
    }
    function setLevel(l) {
      level = l;
    }
    function write(lvl, tag, message, data) {
      if (ORDER[lvl] < ORDER[level]) return;
      const t = TAGS.includes(tag) ? tag : "AI-PROJECT";
      let line = `${(/* @__PURE__ */ new Date()).toISOString()} [${t}] ${lvl.toUpperCase()} ${message}`;
      if (data !== void 0) {
        try {
          line += " " + JSON.stringify(data);
        } catch {
          line += " [unserializable]";
        }
      }
      sink(scrub(line));
    }
    var logger2 = {
      setSink,
      setLevel,
      debug: (tag, msg, data) => write("debug", tag, msg, data),
      info: (tag, msg, data) => write("info", tag, msg, data),
      warn: (tag, msg, data) => write("warn", tag, msg, data),
      error: (tag, msg, data) => write("error", tag, msg, data),
      scrub
    };
    module2.exports = logger2;
  }
});

// src/scanner/projectScanner.js
var require_projectScanner = __commonJS({
  "src/scanner/projectScanner.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { compileExclusions } = require_exclusions();
    var { walk, scanFile, mapLimit } = require_fileScanner();
    var { scanFolders } = require_folderScanner();
    var { scanPackages } = require_packageScanner();
    var { scanConfig } = require_configScanner();
    var { scanEnvironment } = require_environmentScanner();
    var { isSourceLanguage } = require_languageDetector();
    var logger2 = require_logger();
    async function scanProject(root, options = {}) {
      const { excludePatterns = [], previousFiles = {}, concurrency = 16, onProgress } = options;
      const isExcluded = compileExclusions(excludePatterns);
      const errors = [];
      const started = Date.now();
      const { files, folders } = await walk(root, isExcluded, (dir, err) => errors.push({ path: dir, error: err.code || err.message }));
      logger2.info("ANALYSIS", "scan: walked workspace", { files: files.length, folders: folders.length });
      let done = 0;
      const records = (await mapLimit(files, concurrency, async (rel) => {
        try {
          const r = await scanFile(root, rel, previousFiles[rel]);
          if (onProgress && ++done % 50 === 0) onProgress({ done, total: files.length });
          return r;
        } catch (err) {
          errors.push({ path: rel, error: err.code || err.message });
          return null;
        }
      })).filter(Boolean);
      const changed = records.filter((r) => !r.reused).map((r) => r.path);
      const removed = Object.keys(previousFiles).filter((p) => !files.includes(p));
      const contents = /* @__PURE__ */ new Map();
      await mapLimit(records.filter((r) => !r.binary && (isSourceLanguage(r.language) || r.language === "json") && r.size < 512 * 1024), concurrency, async (r) => {
        try {
          contents.set(r.path, await fs.promises.readFile(path.join(root, r.path), "utf8"));
        } catch {
        }
      });
      const paths = records.map((r) => r.path);
      const [packages, environment] = await Promise.all([scanPackages(root, paths), scanEnvironment(root, paths, contents)]);
      const languages = {};
      for (const r of records) if (!r.binary) languages[r.language] = (languages[r.language] || 0) + 1;
      return {
        scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
        durationMs: Date.now() - started,
        files: records,
        folders: scanFolders(folders, records),
        languages,
        packages,
        config: scanConfig(paths),
        environment,
        delta: { changed, removed },
        errors,
        totals: {
          files: records.length,
          sourceFiles: records.filter((r) => isSourceLanguage(r.language)).length,
          lines: records.reduce((n, r) => n + (r.lines || 0), 0),
          tokens: records.reduce((n, r) => n + (r.tokens || 0), 0)
        }
      };
    }
    module2.exports = { scanProject };
  }
});

// src/utils/text.js
var require_text = __commonJS({
  "src/utils/text.js"(exports2, module2) {
    function lineIndex(content) {
      const starts = [0];
      for (let i = 0; i < content.length; i++) if (content.charCodeAt(i) === 10) starts.push(i + 1);
      return starts;
    }
    function lineAt(starts, offset) {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = lo + hi + 1 >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1;
    }
    function stripComments(content, language) {
      if (["python", "ruby", "shell", "yaml", "toml", "env"].includes(language)) {
        return content.replace(/(^|[^\\'"])#.*$/gm, (m, p1) => p1 + " ".repeat(m.length - p1.length));
      }
      return content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:'"`\\])\/\/.*$/gm, (m, p1) => p1 + " ".repeat(m.length - p1.length));
    }
    function matchBrace(content, openIdx) {
      let depth = 0;
      let quote = null;
      for (let i = openIdx; i < content.length; i++) {
        const c = content[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "{") depth++;
        else if (c === "}") {
          depth--;
          if (depth === 0) return i;
        }
      }
      return content.length - 1;
    }
    module2.exports = { lineIndex, lineAt, stripComments, matchBrace };
    function matchParen(content, openIdx) {
      let depth = 0;
      let quote = null;
      for (let i = openIdx; i < content.length; i++) {
        const c = content[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "(") depth++;
        else if (c === ")") {
          depth--;
          if (depth === 0) return i;
        }
      }
      return -1;
    }
    function splitArgs(str) {
      const out = [];
      let depth = 0;
      let quote = null;
      let cur = "";
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (quote) {
          cur += c;
          if (c === "\\") {
            cur += str[++i] || "";
          } else if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") {
          quote = c;
          cur += c;
          continue;
        }
        if ("([{".includes(c)) depth++;
        if (")]}".includes(c)) depth--;
        if (c === "," && depth === 0) {
          out.push(cur.trim());
          cur = "";
        } else cur += c;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    }
    module2.exports.matchParen = matchParen;
    module2.exports.splitArgs = splitArgs;
  }
});

// src/analyzer/symbolAnalyzer.js
var require_symbolAnalyzer = __commonJS({
  "src/analyzer/symbolAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt, matchBrace } = require_text();
    var JS_LANGS = /* @__PURE__ */ new Set(["javascript", "typescript", "vue", "svelte"]);
    var KEYWORDS = /* @__PURE__ */ new Set(["if", "for", "while", "switch", "catch", "function", "return", "else", "do", "try", "with", "super", "new"]);
    function paramsOf(str) {
      return (str || "").split(",").map((s) => s.trim().replace(/\s*=.*$/, "")).filter(Boolean);
    }
    function classify(name, isJsx) {
      if (/^use[A-Z0-9]/.test(name)) return "hook";
      if (isJsx && /^[A-Z]/.test(name)) return "component";
      return "function";
    }
    function analyzeJs(content, starts, language) {
      const symbols = [];
      const isJsx = /<[A-Za-z][\w.]*(\s[^>]*)?\/?>/.test(content) || /from\s+['"]react['"]/.test(content);
      const push = (s) => symbols.push(s);
      const fnRe = /^[ \t]*(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm;
      const arrowRe = /^[ \t]*(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(async\s+)?(?:function\s*\*?\s*[\w$]*\s*)?(\(([^)]*)\)|[A-Za-z_$][\w$]*)\s*(?:=>|\{)/gm;
      const classRe = /^[ \t]*(export\s+)?(default\s+)?(abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([\w$.]+))?/gm;
      const constRe = /^(export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*=/gm;
      let m;
      while (m = fnRe.exec(content)) {
        const open = content.indexOf("{", m.index + m[0].length);
        const end = open === -1 ? m.index + m[0].length : matchBrace(content, open);
        push({ name: m[4], type: classify(m[4], isJsx), line: lineAt(starts, m.index), endLine: lineAt(starts, end), exported: !!m[1], default: !!m[2], async: !!m[3], params: paramsOf(m[5]) });
      }
      while (m = arrowRe.exec(content)) {
        const isFn = m[0].includes("=>") || /function/.test(m[0]);
        if (!isFn) continue;
        const bodyStart = m.index + m[0].length - 1;
        let end;
        if (content[bodyStart] === "{") end = matchBrace(content, bodyStart);
        else {
          const nextBrace = content.indexOf("{", bodyStart);
          const nextNl = content.indexOf("\n", bodyStart);
          end = nextNl === -1 ? content.length - 1 : nextNl;
          if (nextBrace !== -1 && nextBrace < end + 1 && /=>\s*\{/.test(content.slice(m.index, nextBrace + 1))) end = matchBrace(content, nextBrace);
        }
        push({ name: m[3], type: classify(m[3], isJsx), line: lineAt(starts, m.index), endLine: lineAt(starts, end), exported: !!m[1], async: !!m[4], params: paramsOf(m[6] !== void 0 ? m[6] : m[5]) });
      }
      while (m = classRe.exec(content)) {
        const open = content.indexOf("{", m.index);
        const end = open === -1 ? m.index + m[0].length : matchBrace(content, open);
        const cls = { name: m[4], type: /extends\s+(React\.)?(Pure)?Component/.test(m[0]) ? "component" : "class", line: lineAt(starts, m.index), endLine: lineAt(starts, end), exported: !!m[1], default: !!m[2], extends: m[5] || null, params: [] };
        push(cls);
        const body = content.slice(open + 1, end);
        const methodRe = /^[ \t]+(?:(static)\s+)?(async\s+)?(?:get\s+|set\s+)?(#?[A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/gm;
        let mm;
        while (mm = methodRe.exec(body)) {
          if (KEYWORDS.has(mm[3])) continue;
          const abs = open + 1 + mm.index;
          const mOpen = abs + mm[0].length - 1;
          push({ name: mm[3], type: "method", className: cls.name, line: lineAt(starts, abs), endLine: lineAt(starts, matchBrace(content, mOpen)), exported: false, static: !!mm[1], async: !!mm[2], params: paramsOf(mm[4]) });
        }
      }
      while (m = constRe.exec(content)) {
        push({ name: m[2], type: "constant", line: lineAt(starts, m.index), endLine: lineAt(starts, m.index), exported: !!m[1], params: [] });
      }
      if (language === "typescript") {
        const ifaceRe = /^[ \t]*(export\s+)?(interface|type)\s+([A-Za-z_$][\w$]*)/gm;
        while (m = ifaceRe.exec(content)) push({ name: m[3], type: m[2], line: lineAt(starts, m.index), endLine: lineAt(starts, m.index), exported: !!m[1], params: [] });
      }
      return symbols;
    }
    function analyzePython(content, starts) {
      const symbols = [];
      const lines = content.split("\n");
      const re = /^(\s*)(async\s+)?(def|class)\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?/;
      lines.forEach((ln, i) => {
        const m = re.exec(ln);
        if (!m) return;
        const indent = m[1].length;
        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() === "") continue;
          if (lines[j].match(/^(\s*)/)[1].length <= indent) break;
          end = j;
        }
        const isClass = m[3] === "class";
        symbols.push({ name: m[4], type: isClass ? "class" : indent > 0 ? "method" : "function", line: i + 1, endLine: end + 1, exported: indent === 0 && !m[4].startsWith("_"), async: !!m[2], params: isClass ? [] : paramsOf(m[5]).filter((p) => p !== "self" && p !== "cls") });
      });
      return symbols;
    }
    function analyzeBraceLang(content, starts, language) {
      const symbols = [];
      const patterns = {
        php: [
          { re: /^[ \t]*(?:abstract\s+|final\s+)?class\s+(\w+)/gm, type: "class" },
          { re: /^[ \t]*(?:public|protected|private|static|\s)*function\s+(\w+)\s*\(([^)]*)\)/gm, type: "function" }
        ],
        go: [
          { re: /^func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(([^)]*)\)/gm, type: "function" },
          { re: /^type\s+(\w+)\s+struct/gm, type: "class" }
        ],
        java: [
          { re: /^[ \t]*(?:public\s+|abstract\s+|final\s+)*(?:class|interface|enum)\s+(\w+)/gm, type: "class" },
          { re: /^[ \t]+(?:public|protected|private)\s+(?:static\s+)?(?:[\w<>\[\],?]+\s+)(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w, ]+)?\{/gm, type: "method" }
        ],
        csharp: [
          { re: /^[ \t]*(?:public\s+|internal\s+|abstract\s+|sealed\s+|static\s+)*(?:class|interface|record)\s+(\w+)/gm, type: "class" },
          { re: /^[ \t]+(?:public|protected|private|internal)\s+(?:static\s+)?(?:async\s+)?(?:[\w<>\[\],?]+\s+)(\w+)\s*\(([^)]*)\)\s*\{?/gm, type: "method" }
        ],
        ruby: [
          { re: /^[ \t]*class\s+(\w+)/gm, type: "class" },
          { re: /^[ \t]*def\s+(?:self\.)?(\w+[?!]?)\s*(?:\(([^)]*)\))?/gm, type: "function" }
        ]
      };
      for (const { re, type } of patterns[language] || []) {
        let m;
        while (m = re.exec(content)) {
          const line = lineAt(starts, m.index);
          let endLine = line;
          const open = content.indexOf("{", m.index);
          if (open !== -1 && open - m.index < 400 && language !== "ruby") endLine = lineAt(starts, matchBrace(content, open));
          symbols.push({ name: m[1], type, line, endLine, exported: !/private|protected/.test(m[0]), params: paramsOf(m[2]) });
        }
      }
      return symbols;
    }
    function analyzeSymbols(content, language) {
      const starts = lineIndex(content);
      let symbols = [];
      if (JS_LANGS.has(language)) symbols = analyzeJs(content, starts, language);
      else if (language === "python") symbols = analyzePython(content, starts);
      else symbols = analyzeBraceLang(content, starts, language);
      const seen = /* @__PURE__ */ new Set();
      symbols = symbols.filter((s) => {
        const k = `${s.type}:${s.name}:${s.line}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      symbols.sort((a, b) => a.line - b.line);
      return symbols;
    }
    module2.exports = { analyzeSymbols, JS_LANGS };
  }
});

// src/analyzer/dependencyAnalyzer.js
var require_dependencyAnalyzer = __commonJS({
  "src/analyzer/dependencyAnalyzer.js"(exports2, module2) {
    var path = require("path");
    var { lineIndex, lineAt } = require_text();
    var { JS_LANGS } = require_symbolAnalyzer();
    function parseNamed(str) {
      return str.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
        const m = /^(?:type\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(s);
        return m ? { imported: m[1], local: m[2] || m[1] } : null;
      }).filter(Boolean);
    }
    function extractJs(content, starts) {
      const imports = [];
      const exports3 = [];
      let m;
      const push = (o) => imports.push(o);
      const esm = /^[ \t]*import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\*\s+as\s+([\w$]+)|\{([^}]*)\})?\s*(?:from\s*)?['"]([^'"]+)['"]/gm;
      while (m = esm.exec(content)) {
        push({ source: m[4], default: m[1] || null, namespace: m[2] || null, names: m[3] ? parseNamed(m[3]) : [], line: lineAt(starts, m.index), kind: "esm" });
      }
      const reexport = /^[ \t]*export\s+(?:\*(?:\s+as\s+([\w$]+))?|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/gm;
      while (m = reexport.exec(content)) {
        push({ source: m[3], default: null, namespace: m[1] || null, names: m[2] ? parseNamed(m[2]) : [], line: lineAt(starts, m.index), kind: "reexport" });
        if (m[2]) parseNamed(m[2]).forEach((n) => exports3.push({ name: n.local, kind: "reexport", line: lineAt(starts, m.index) }));
      }
      const cjs = /(?:const|let|var)\s+(?:([\w$]+)|\{([^}]*)\})\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)(?:\.([\w$]+))?/g;
      while (m = cjs.exec(content)) {
        const names = m[2] ? m[2].split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
          const [a, b] = s.split(":").map((x) => x.trim());
          return { imported: a, local: b || a };
        }) : [];
        push({ source: m[3], default: m[1] || null, namespace: null, names, member: m[4] || null, line: lineAt(starts, m.index), kind: "cjs" });
      }
      const bareRequire = /^[ \t]*require\(\s*['"]([^'"]+)['"]\s*\)/gm;
      while (m = bareRequire.exec(content)) push({ source: m[1], default: null, namespace: null, names: [], line: lineAt(starts, m.index), kind: "cjs" });
      const dyn = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
      while (m = dyn.exec(content)) push({ source: m[1], default: null, namespace: null, names: [], line: lineAt(starts, m.index), kind: "dynamic" });
      const named = /^[ \t]*export\s+(?:async\s+)?(function\*?|class|const|let|var|interface|type|enum)\s+([\w$]+)/gm;
      while (m = named.exec(content)) exports3.push({ name: m[2], kind: m[1].replace("*", ""), line: lineAt(starts, m.index) });
      const def = /^[ \t]*export\s+default\s+(?:async\s+)?(?:(?:function\*?|class)\s+([\w$]+)|([\w$]+)\s*;?\s*$)/gm;
      while (m = def.exec(content)) exports3.push({ name: m[1] || m[2] || "default", kind: "default", line: lineAt(starts, m.index) });
      if (/^[ \t]*export\s+default\b/m.test(content) && !exports3.some((e) => e.kind === "default")) {
        exports3.push({ name: "default", kind: "default", line: lineAt(starts, content.search(/^[ \t]*export\s+default\b/m)) });
      }
      const list = /^[ \t]*export\s*\{([^}]*)\}\s*(?!from)/gm;
      while (m = list.exec(content)) {
        if (/from\s*['"]/.test(content.slice(m.index, m.index + m[0].length + 40).split("\n")[0])) continue;
        parseNamed(m[1]).forEach((n) => exports3.push({ name: n.local, kind: "named", line: lineAt(starts, m.index) }));
      }
      const modObj = /module\.exports\s*=\s*\{([^}]*)\}/g;
      while (m = modObj.exec(content)) {
        m[1].split(",").map((s) => s.trim().split(":")[0].trim()).filter((s) => /^[\w$]+$/.test(s)).forEach((n) => exports3.push({ name: n, kind: "cjs", line: lineAt(starts, m.index) }));
      }
      const modSingle = /module\.exports\s*=\s*([\w$]+)\s*;?\s*$/gm;
      while (m = modSingle.exec(content)) exports3.push({ name: m[1], kind: "cjs-default", line: lineAt(starts, m.index) });
      const modProp = /(?:module\.)?exports\.([\w$]+)\s*=/g;
      while (m = modProp.exec(content)) exports3.push({ name: m[1], kind: "cjs", line: lineAt(starts, m.index) });
      return { imports, exports: exports3 };
    }
    function extractPython(content, starts) {
      const imports = [];
      let m;
      const from = /^[ \t]*from\s+(\.*[\w.]*)\s+import\s+([\w*, ()]+)/gm;
      while (m = from.exec(content)) {
        imports.push({ source: m[1], default: null, namespace: null, names: m[2].replace(/[()]/g, "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
          const [a, b] = s.split(/\s+as\s+/);
          return { imported: a, local: b || a };
        }), line: lineAt(starts, m.index), kind: "py" });
      }
      const imp = /^[ \t]*import\s+([\w., ]+)/gm;
      while (m = imp.exec(content)) m[1].split(",").forEach((s) => {
        const [a, b] = s.trim().split(/\s+as\s+/);
        if (a) imports.push({ source: a, default: null, namespace: b || a, names: [], line: lineAt(starts, m.index), kind: "py" });
      });
      return { imports, exports: [] };
    }
    function extractOther(content, starts, language) {
      const imports = [];
      let m;
      const add = (source, idx) => imports.push({ source, default: null, namespace: null, names: [], line: lineAt(starts, idx), kind: language });
      if (language === "php") {
        const use = /^[ \t]*use\s+([\w\\]+)(?:\s+as\s+\w+)?;/gm;
        while (m = use.exec(content)) add(m[1], m.index);
        const req = /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g;
        while (m = req.exec(content)) add(m[1], m.index);
      } else if (language === "go") {
        const block = /import\s*\(([^)]*)\)/g;
        while (m = block.exec(content)) for (const q of m[1].matchAll(/"([^"]+)"/g)) add(q[1], m.index);
        const single = /^import\s+(?:\w+\s+)?"([^"]+)"/gm;
        while (m = single.exec(content)) add(m[1], m.index);
      } else if (language === "java" || language === "csharp") {
        const re = language === "java" ? /^import\s+(?:static\s+)?([\w.]+);/gm : /^using\s+([\w.]+);/gm;
        while (m = re.exec(content)) add(m[1], m.index);
      } else if (language === "ruby") {
        const re = /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm;
        while (m = re.exec(content)) add(m[1], m.index);
      }
      return { imports, exports: [] };
    }
    function analyzeImportsExports(content, language) {
      const starts = lineIndex(content);
      if (JS_LANGS.has(language)) return extractJs(content, starts);
      if (language === "python") return extractPython(content, starts);
      return extractOther(content, starts, language);
    }
    var JS_EXTS = ["", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".vue", ".json"];
    function resolveJsImport(fromFile, source, fileSet) {
      if (!source.startsWith(".") && !source.startsWith("/")) return null;
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), source));
      for (const ext of JS_EXTS) if (fileSet.has(base + ext)) return base + ext;
      for (const ext of JS_EXTS.slice(1)) if (fileSet.has(`${base}/index${ext}`)) return `${base}/index${ext}`;
      return null;
    }
    function resolvePyImport(fromFile, source, fileSet) {
      let base;
      if (source.startsWith(".")) {
        const dots = source.match(/^\.+/)[0].length;
        let dir = path.posix.dirname(fromFile);
        for (let i = 1; i < dots; i++) dir = path.posix.dirname(dir);
        base = path.posix.join(dir, source.slice(dots).replace(/\./g, "/"));
      } else {
        base = source.replace(/\./g, "/");
      }
      for (const c of [`${base}.py`, `${base}/__init__.py`]) if (fileSet.has(c)) return c;
      return null;
    }
    function resolveImport(fromFile, imp, language, fileSet) {
      if (JS_LANGS.has(language)) return resolveJsImport(fromFile, imp.source, fileSet);
      if (language === "python") return resolvePyImport(fromFile, imp.source, fileSet);
      if (language === "php" && /[./]/.test(imp.source) && !imp.source.includes("\\")) {
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), imp.source));
        return fileSet.has(base) ? base : null;
      }
      return null;
    }
    function buildDependencies(fileAnalyses, fileSet) {
      const deps = {};
      for (const fa of fileAnalyses) {
        const internal = /* @__PURE__ */ new Map();
        const external = /* @__PURE__ */ new Set();
        for (const imp of fa.imports) {
          const target = resolveImport(fa.path, imp, fa.language, fileSet);
          if (target && target !== fa.path) {
            const e = internal.get(target) || { path: target, names: [], line: imp.line };
            for (const n of imp.names) e.names.push(n.imported);
            if (imp.default) e.names.push("default");
            internal.set(target, e);
          } else if (!target) {
            external.add(imp.source);
          }
        }
        deps[fa.path] = { internal: [...internal.values()], external: [...external].sort() };
      }
      return deps;
    }
    module2.exports = { analyzeImportsExports, buildDependencies, resolveImport };
  }
});

// src/analyzer/goSupport.js
var require_goSupport = __commonJS({
  "src/analyzer/goSupport.js"(exports2, module2) {
    var { lineAt, matchBrace, matchParen, splitArgs } = require_text();
    var unq = (s) => {
      const m = /^\s*["`](.*)["`]\s*$/s.exec(s || "");
      return m ? m[1] : null;
    };
    var ident = (s) => {
      const m = /^\s*&?([\w.]+)(?:\(\s*\))?\s*$/.exec(s || "");
      return m ? m[1] : null;
    };
    var VERBS = { GET: "GET", POST: "POST", PUT: "PUT", PATCH: "PATCH", DELETE: "DELETE", HEAD: "HEAD", OPTIONS: "OPTIONS", Get: "GET", Post: "POST", Put: "PUT", Patch: "PATCH", Delete: "DELETE", Head: "HEAD", Options: "OPTIONS", Any: "ANY", All: "ANY" };
    function analyzeGoRoutes(content, starts, file) {
      const routes = [];
      const prefix = /* @__PURE__ */ new Map();
      const mw = /* @__PURE__ */ new Map();
      let m;
      const group = /\b(\w+)\s*:?=\s*(\w+)\.Group\(/g;
      const groups = [];
      while (m = group.exec(content)) {
        const open = m.index + m[0].length - 1;
        const close = matchParen(content, open);
        if (close === -1) continue;
        const args = splitArgs(content.slice(open + 1, close));
        groups.push({ v: m[1], parent: m[2], path: unq(args[0]) || "", mw: args.slice(1).map(ident).filter(Boolean) });
      }
      const resolve = (v, depth = 0) => {
        const g = groups.find((x) => x.v === v);
        if (!g || depth > 6) return { path: "", mw: [] };
        const up = resolve(g.parent, depth + 1);
        return { path: up.path + g.path, mw: [...up.mw, ...g.mw] };
      };
      for (const g of groups) {
        const r = resolve(g.v);
        prefix.set(g.v, r.path);
        mw.set(g.v, r.mw);
      }
      const use = /\b(\w+)\.Use\(/g;
      while (m = use.exec(content)) {
        const open = m.index + m[0].length - 1;
        const close = matchParen(content, open);
        if (close !== -1) mw.set(m[1], [...mw.get(m[1]) || [], ...splitArgs(content.slice(open + 1, close)).map(ident).filter(Boolean)]);
      }
      const chiRanges = [];
      const route = /\b(\w+)\.Route\(\s*(["`][^"`]*["`])\s*,\s*func\(\s*(\w+)\s+[\w.*]*Router\s*\)\s*\{/g;
      while (m = route.exec(content)) {
        const open = m.index + m[0].length - 1;
        chiRanges.push({ outer: m[1], inner: m[3], path: unq(m[2]), start: open, end: matchBrace(content, open) });
      }
      const chiPrefix = (idx, v) => {
        let p = "";
        let cur = v;
        for (let guard = 0; guard < 8; guard++) {
          const r = chiRanges.filter((x) => x.start < idx && idx < x.end && x.inner === cur).sort((a, b) => b.start - a.start)[0];
          if (!r) break;
          p = r.path + p;
          cur = r.outer;
          idx = r.start;
        }
        return p;
      };
      const verb = /\b(\w+)\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|Any|Get|Post|Put|Patch|Delete|Head|Options|All)\(/g;
      while (m = verb.exec(content)) {
        const open = m.index + m[0].length - 1;
        const close = matchParen(content, open);
        if (close === -1) continue;
        const args = splitArgs(content.slice(open + 1, close));
        const p = unq(args[0]);
        if (p === null || !(p.startsWith("/") || p === "" || p === "*")) continue;
        const rest = args.slice(1);
        const owner = m[1];
        const full = (chiPrefix(m.index, owner) || "") + (prefix.get(owner) || "") + p;
        routes.push({ method: VERBS[m[2]], path: full || "/", line: lineAt(starts, m.index), framework: "go-http", handler: ident(rest[rest.length - 1]), inline: /^\s*func\b/.test(rest[rest.length - 1] || ""), middleware: [...mw.get(owner) || [], ...rest.slice(0, -1).map(ident).filter(Boolean)], file, owner });
      }
      const mux = /\b(\w+)\.(?:HandleFunc|Handle)\(\s*(["`][^"`]*["`])\s*,\s*([^)]*)\)\s*\.Methods\(([^)]*)\)/g;
      while (m = mux.exec(content)) for (const meth of m[4].split(",").map(unq).filter(Boolean)) routes.push({ method: meth.toUpperCase(), path: (prefix.get(m[1]) || "") + unq(m[2]), line: lineAt(starts, m.index), framework: "go-mux", handler: ident(m[3].split(",").pop()), inline: false, middleware: [], file, owner: m[1] });
      const std = /\b\w+\.(?:HandleFunc|Handle)\(\s*(["`][^"`]*["`])\s*,\s*([^)]*)\)(?!\s*\.Methods)/g;
      while (m = std.exec(content)) {
        const pat = unq(m[1]);
        const mm = /^([A-Z]+)\s+(\/.*)$/.exec(pat);
        if (!mm && !pat.startsWith("/")) continue;
        if (routes.some((r) => r.line === lineAt(starts, m.index))) continue;
        routes.push({ method: mm ? mm[1] : "ANY", path: mm ? mm[2] : pat, line: lineAt(starts, m.index), framework: "go-nethttp", handler: ident(m[2].split(",").pop()), inline: /func\b/.test(m[2]), middleware: [], file, owner: "http" });
      }
      return routes;
    }
    var GO_TYPES = { string: "string", bool: "bool", int: "int", int8: "int", int16: "int", int32: "int", int64: "int", uint: "int", uint8: "int", uint16: "int", uint32: "int", uint64: "int", float32: "float", float64: "float", byte: "byte", rune: "int" };
    function goType(raw) {
      const t = raw.replace(/^\*/, "").replace(/^\[\](?!byte)/, "");
      if (GO_TYPES[t]) return GO_TYPES[t];
      if (/^\[\]byte$/.test(raw)) return "bytes";
      if (/time\.Time$|gorm\.DeletedAt$|sql\.NullTime$/.test(t)) return "datetime";
      if (/uuid\.UUID$|UUID$/.test(t)) return "uuid";
      if (/decimal\.Decimal$/.test(t)) return "decimal";
      if (/sql\.Null(String)$/.test(t)) return "string";
      if (/sql\.Null(Int\d*|Int64)$/.test(t)) return "int";
      if (/sql\.NullBool$/.test(t)) return "bool";
      if (/sql\.NullFloat64$/.test(t)) return "float";
      if (/datatypes\.JSON|json\.RawMessage|jsonb|JSONB/i.test(t)) return "json";
      return t.replace(/^.*\./, "").toLowerCase();
    }
    var isBuiltin = (t) => !!GO_TYPES[t.replace(/^\*|^\[\]/g, "")] || /\./.test(t) || /^\[\]byte$/.test(t);
    function structFields(content, starts, bodyStart, bodyEnd) {
      const out = [];
      const body = content.slice(bodyStart + 1, bodyEnd);
      const baseLine = lineAt(starts, bodyStart);
      body.split("\n").forEach((raw, i) => {
        const line = raw.replace(/\/\/.*$/, "").trim();
        if (!line) return;
        const tagM = /`([^`]*)`/.exec(line);
        const decl = line.replace(/`[^`]*`/, "").trim();
        const f = /^(\w+(?:\s*,\s*\w+)*)\s+(\*?(?:\[\d*\])?\*?[\w.]+(?:\[[^\]]*\])?)\s*$/.exec(decl);
        const embedded = /^\*?([\w.]+)$/.exec(decl);
        const tags = {};
        if (tagM) for (const t of tagM[1].matchAll(/(\w+):"([^"]*)"/g)) tags[t[1]] = t[2];
        const lineNo = baseLine + i;
        if (f) {
          for (const name of f[1].split(",").map((x) => x.trim())) out.push({ name, goType: f[2], type: goType(f[2]), tags, nullable: f[2].startsWith("*") || /^sql\.Null/.test(f[2]), line: lineNo });
        } else if (embedded) out.push({ name: embedded[1], goType: embedded[1], embedded: true, tags, line: lineNo });
      });
      return out;
    }
    var snake = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").toLowerCase();
    function columnName(f) {
      const col = /(?:^|;)\s*column:([\w]+)/.exec(f.tags.gorm || "");
      if (col) return col[1];
      if (f.tags.db && f.tags.db !== "-") return f.tags.db.split(",")[0];
      return f.name;
    }
    function parseStructs(content, starts) {
      const structs = [];
      const re = /\btype\s+(\w+)\s+struct\s*\{/g;
      let m;
      while (m = re.exec(content)) {
        const open = m.index + m[0].length - 1;
        const end = matchBrace(content, open);
        if (end === -1) continue;
        structs.push({ name: m[1], line: lineAt(starts, m.index), endLine: lineAt(starts, end), fields: structFields(content, starts, open, end) });
      }
      return structs;
    }
    function analyzeGoModels(content, starts, file) {
      const structs = parseStructs(content, starts);
      const names = new Set(structs.map((s) => s.name));
      const migrated = new Set([...content.matchAll(/AutoMigrate\(([^)]*)\)/g)].flatMap((x) => [...x[1].matchAll(/&?(\w+)\{\}/g)].map((y) => y[1])));
      const tableName = (n) => {
        const t = new RegExp(`func\\s*\\(\\s*\\w*\\s*\\*?${n}\\s*\\)\\s*TableName\\(\\)\\s*string\\s*\\{[^}]*return\\s*["\`]([^"\`]+)["\`]`).exec(content);
        return t ? t[1] : null;
      };
      const entities = [];
      const relationships = [];
      for (const s of structs) {
        const embedsModel = s.fields.some((f) => f.embedded && /^gorm\.Model$/.test(f.name));
        const hasGormTag = s.fields.some((f) => f.tags.gorm !== void 0 || f.tags.db !== void 0);
        if (!(embedsModel || hasGormTag || migrated.has(s.name))) continue;
        const fields = [];
        if (embedsModel) fields.push({ name: "ID", type: "int", pk: true, unique: false }, { name: "CreatedAt", type: "datetime", pk: false, unique: false }, { name: "UpdatedAt", type: "datetime", pk: false, unique: false }, { name: "DeletedAt", type: "datetime", pk: false, unique: false });
        for (const f of s.fields) {
          if (f.embedded || f.tags.gorm === "-" || f.tags.db === "-") continue;
          const base = f.goType.replace(/^\*|^\[\]\*?/, "");
          const relation = !isBuiltin(f.goType) && (names.has(base) || /^[A-Z]/.test(base)) && f.type !== "datetime";
          if (relation) {
            relationships.push({ from: s.name, to: base.replace(/^.*\./, ""), type: f.goType.startsWith("[]") ? "one-to-many" : "many-to-one", via: `${s.name}.${f.name}`, file, line: f.line, source: "gorm-relation" });
            continue;
          }
          const gorm = f.tags.gorm || "";
          const dbType = /\btype:([\w]+)/i.exec(gorm);
          fields.push({ name: columnName(f), type: dbType && !/^(uuid|json)/i.test(dbType[1]) ? dbType[1].toLowerCase() : f.type, pk: /primaryKey|primary_key/i.test(gorm) || f.name === "ID" && !/\bprimaryKey:false/.test(gorm), unique: /\bunique\b|uniqueIndex/i.test(gorm), nullable: !/not null|primaryKey/i.test(gorm) && f.nullable ? true : void 0 });
        }
        entities.push({ name: s.name, table: tableName(s.name), kind: "model", source: /\bdb:"/.test(content) && !/gorm/.test(content) ? "sqlx" : "gorm", fields, file, line: s.line, endLine: s.endLine });
      }
      return { entities, relationships };
    }
    function analyzeGoValidation(content, starts) {
      const out = [];
      for (const s of parseStructs(content, starts)) {
        for (const f of s.fields) {
          if (f.embedded) continue;
          const g = f.tags.gorm;
          if (g && g !== "-") {
            const rules = [];
            if (/not null|primaryKey/i.test(g)) rules.push("required");
            if (/\bunique\b|uniqueIndex/i.test(g)) rules.push("unique");
            const size = /\bsize:(\d+)/.exec(g);
            if (size) rules.push(`maxlength(${size[1]})`);
            const def = /\bdefault:([^;]+)/.exec(g);
            if (def) rules.push(`default(${def[1].trim()})`);
            if (rules.length) out.push({ kind: "schema", field: columnName(f), rules, line: f.line, status: "VERIFIED" });
          }
          for (const lib of ["binding", "validate"]) {
            const v = f.tags[lib];
            if (!v || v === "-") continue;
            const rules = v.split(/[,|]/).map((x) => x.trim()).filter(Boolean).map((x) => x.replace(/=/, "(") + (x.includes("=") ? ")" : ""));
            if (rules.length) out.push({ kind: lib === "binding" ? "gin-binding" : "go-validator", field: (f.tags.json || f.name).split(",")[0] || f.name, rules, line: f.line, status: "VERIFIED" });
          }
        }
      }
      return out;
    }
    var READ = /* @__PURE__ */ new Set(["First", "Last", "Take", "Find", "FindInBatches", "Count", "Scan", "Pluck", "Rows", "Row"]);
    var WRITE = /* @__PURE__ */ new Set(["Create", "CreateInBatches", "Save", "Delete", "Update", "Updates", "UpdateColumn", "UpdateColumns", "FirstOrCreate"]);
    function typeOfVar(content, v, before) {
      const head = content.slice(0, before);
      const pats = [
        new RegExp(`\\b${v}\\s*:?=\\s*&?(?:\\[\\]\\s*)?\\*?(?:\\w+\\.)?(\\w+)\\{`, "g"),
        new RegExp(`\\bvar\\s+${v}\\s+(?:\\[\\]\\s*)?\\*?(?:\\w+\\.)?(\\w+)\\b`, "g"),
        new RegExp(`[(,]\\s*${v}\\s+(?:\\[\\]\\s*)?\\*?(?:\\w+\\.)?(\\w+)\\s*[,)]`, "g"),
        new RegExp(`\\b${v}\\s*:?=\\s*(?:new\\(|make\\(\\[\\])\\*?(?:\\w+\\.)?(\\w+)`, "g")
      ];
      let best = null;
      for (const re of pats) {
        let m;
        while (m = re.exec(head)) if (!best || m.index > best.index) best = { index: m.index, type: m[1] };
      }
      return best ? best.type : null;
    }
    function analyzeGoOrmCalls(content, starts, file) {
      const calls = [];
      const re = /\.(Create|CreateInBatches|Save|First|Last|Take|Find|FindInBatches|Count|Delete|Update|Updates|UpdateColumn|FirstOrCreate|Scan|Pluck|Model)\(\s*(&?)(\w+)(\{)?/g;
      let m;
      while (m = re.exec(content)) {
        const [, method, , arg, literal] = m;
        const type = literal ? arg : typeOfVar(content, arg, m.index);
        if (!type || !/^[A-Z]/.test(type)) continue;
        let kind = READ.has(method) ? "read" : WRITE.has(method) ? "write" : null;
        let op = method;
        if (method === "Model") {
          const rest = content.slice(m.index, content.indexOf("\n", m.index) === -1 ? void 0 : content.indexOf("\n", m.index));
          const t = /\.(Create|Save|Delete|Update|Updates|UpdateColumn|UpdateColumns|First|Last|Take|Find|Count|Scan|Pluck)\(/.exec(rest);
          if (!t) continue;
          op = t[1];
          kind = WRITE.has(op) ? "write" : "read";
        }
        if (!kind) continue;
        calls.push({ receiver: type, operation: op, kind, line: lineAt(starts, m.index), file, orm: "gorm" });
      }
      return calls;
    }
    var analyzeGoEnv = (content) => [...new Set([...content.matchAll(/\bos\.(?:Getenv|LookupEnv)\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((x) => x[1]).concat([...content.matchAll(/\b(?:viper|v)\.(?:Get\w*|BindEnv)\(\s*"([A-Za-z_][\w.]*)"/g)].map((x) => x[1].toUpperCase().replace(/\./g, "_"))))];
    module2.exports = { analyzeGoRoutes, analyzeGoModels, analyzeGoValidation, analyzeGoOrmCalls, analyzeGoEnv, parseStructs, snake };
  }
});

// src/analyzer/routeAnalyzer.js
var require_routeAnalyzer = __commonJS({
  "src/analyzer/routeAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt, matchParen, splitArgs, matchBrace } = require_text();
    var { analyzeGoRoutes } = require_goSupport();
    var METHODS = "get|post|put|patch|delete|head|options|all";
    function unquote(s) {
      const m = /^\s*(['"`])(.*)\1\s*$/s.exec(s);
      return m ? m[2] : null;
    }
    function handlerFromArg(arg) {
      const id = /^([\w$]+(?:\.[\w$]+)*)$/.exec(arg.trim());
      return id ? id[1] : null;
    }
    function analyzeExpress(content, starts, path) {
      const routes = [];
      const mounts = [];
      const re = new RegExp(`\\b([\\w$]+)\\.(${METHODS}|use)\\s*\\(`, "g");
      let m;
      while (m = re.exec(content)) {
        const open = m.index + m[0].length - 1;
        const close = matchParen(content, open);
        if (close === -1) continue;
        const args = splitArgs(content.slice(open + 1, close));
        if (!args.length) continue;
        const owner = m[1];
        if (m[2] === "use") {
          const p2 = unquote(args[0]);
          const target = handlerFromArg(args[args.length - 1]);
          if (p2 && target && args.length >= 2) mounts.push({ path: p2, target, line: lineAt(starts, m.index), owner });
          continue;
        }
        const p = unquote(args[0]);
        if (p === null || !p.startsWith("/")) continue;
        if (!/^(app|router|route|server|api|\w*[rR]outer|\w*[aA]pp)$/.test(owner)) continue;
        const rest = args.slice(1);
        const last = rest[rest.length - 1] || "";
        const inline = /=>|^(async\s+)?function\b/.test(last);
        let bodyRange = null;
        if (inline) {
          const bo = content.indexOf("{", open + 1 + content.slice(open + 1).indexOf(last));
          if (bo !== -1 && bo < close) bodyRange = { startLine: lineAt(starts, bo), endLine: lineAt(starts, matchBrace(content, bo)) };
        }
        routes.push({
          method: m[2].toUpperCase(),
          path: p,
          line: lineAt(starts, m.index),
          framework: "express",
          handler: inline ? null : handlerFromArg(last),
          inline,
          bodyRange,
          middleware: rest.slice(0, -1).map(handlerFromArg).filter(Boolean),
          file: path,
          owner
        });
      }
      return { routes, mounts };
    }
    function analyzeNest(content, starts, path) {
      const routes = [];
      const ctrl = /@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/.exec(content);
      if (!ctrl) return routes;
      const prefix = ctrl[1] ? `/${ctrl[1].replace(/^\//, "")}` : "";
      const re = /@(Get|Post|Put|Patch|Delete|All)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)\s*(?:@[\w]+\([^)]*\)\s*)*(?:async\s+)?([\w$]+)\s*\(/g;
      let m;
      while (m = re.exec(content)) {
        const sub = m[2] ? `/${m[2].replace(/^\//, "")}` : "";
        routes.push({ method: m[1].toUpperCase(), path: prefix + sub || "/", line: lineAt(starts, m.index), framework: "nestjs", handler: m[3], inline: false, middleware: [], file: path });
      }
      return routes;
    }
    function analyzePython(content, starts, path) {
      const routes = [];
      let m;
      const flask = /@([\w.]+)\.(route|get|post|put|patch|delete)\(\s*['"]([^'"]+)['"](?:\s*,\s*methods\s*=\s*\[([^\]]*)\])?[^)]*\)\s*\n\s*(?:async\s+)?def\s+(\w+)/g;
      while (m = flask.exec(content)) {
        const methods = m[2] === "route" ? m[4] ? m[4].replace(/['"\s]/g, "").split(",") : ["GET"] : [m[2]];
        for (const meth of methods) routes.push({ method: meth.toUpperCase(), path: m[3], line: lineAt(starts, m.index), framework: "flask/fastapi", handler: m[5], inline: false, middleware: [], file: path });
      }
      const django = /\bpath\(\s*['"]([^'"]*)['"]\s*,\s*([\w.]+)/g;
      while (m = django.exec(content)) routes.push({ method: "ANY", path: `/${m[1]}`, line: lineAt(starts, m.index), framework: "django", handler: m[2], inline: false, middleware: [], file: path });
      return routes;
    }
    function analyzePhp(content, starts, path) {
      const routes = [];
      let m;
      const laravel = new RegExp(`Route::(${METHODS})\\(\\s*['"]([^'"]+)['"]\\s*,\\s*(?:\\[\\s*([\\w\\\\:]+)(?:::class)?\\s*,\\s*['"](\\w+)['"]\\s*\\]|['"]([\\w\\\\@]+)['"]|function)`, "g");
      while (m = laravel.exec(content)) {
        routes.push({ method: m[1].toUpperCase(), path: m[2].startsWith("/") ? m[2] : `/${m[2]}`, line: lineAt(starts, m.index), framework: "laravel", handler: m[4] ? `${m[3]}.${m[4]}` : m[5] || null, inline: !m[3] && !m[5], middleware: [], file: path });
      }
      const wp = /register_rest_route\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
      while (m = wp.exec(content)) routes.push({ method: "ANY", path: `/wp-json/${m[1]}${m[2]}`, line: lineAt(starts, m.index), framework: "wordpress", handler: null, inline: false, middleware: [], file: path });
      return routes;
    }
    function analyzeSpring(content, starts, path) {
      const routes = [];
      const base = /@RequestMapping\(\s*(?:value\s*=\s*)?["']([^"']+)["']/.exec(content);
      const prefix = base ? base[1] : "";
      const re = /@(Get|Post|Put|Patch|Delete)Mapping\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["'])?[^)]*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*public\s+[\w<>\[\],?\s]+?\s+(\w+)\s*\(/g;
      let m;
      while (m = re.exec(content)) routes.push({ method: m[1].toUpperCase(), path: prefix + (m[2] || "") || "/", line: lineAt(starts, m.index), framework: "spring", handler: m[3], inline: false, middleware: [], file: path });
      return routes;
    }
    function analyzeFileRoute(filePath, content) {
      const routes = [];
      let m = /^(?:src\/)?pages\/api\/(.+)\.(?:js|jsx|ts|tsx)$/.exec(filePath);
      if (m) {
        const p = `/api/${m[1].replace(/\/index$/, "").replace(/\[\.\.\.(\w+)\]/g, ":$1*").replace(/\[(\w+)\]/g, ":$1")}`;
        routes.push({ method: "ANY", path: p, line: 1, framework: "nextjs-pages-api", handler: "default", inline: false, middleware: [], file: filePath });
      }
      m = /^(?:src\/)?app\/(.+\/)?route\.(?:js|ts)$/.exec(filePath);
      if (m) {
        const p = `/${(m[1] || "").replace(/\/$/, "").replace(/\[(\w+)\]/g, ":$1")}`;
        const methods = [...content.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map((x) => x[1]);
        for (const meth of methods) routes.push({ method: meth, path: p === "/" ? "/" : p, line: 1, framework: "nextjs-app-route", handler: meth, inline: false, middleware: [], file: filePath });
      }
      return routes;
    }
    function analyzeRoutes(filePath, content, language) {
      const starts = lineIndex(content);
      let routes = [];
      let mounts = [];
      if (["javascript", "typescript"].includes(language)) {
        const ex = analyzeExpress(content, starts, filePath);
        routes = ex.routes;
        mounts = ex.mounts;
        routes.push(...analyzeNest(content, starts, filePath));
        routes.push(...analyzeFileRoute(filePath, content));
      } else if (language === "python") routes = analyzePython(content, starts, filePath);
      else if (language === "php") routes = analyzePhp(content, starts, filePath);
      else if (language === "java") routes = analyzeSpring(content, starts, filePath);
      else if (language === "go") routes = analyzeGoRoutes(content, starts, filePath);
      return { routes, mounts };
    }
    module2.exports = { analyzeRoutes };
  }
});

// src/analyzer/apiAnalyzer.js
var require_apiAnalyzer = __commonJS({
  "src/analyzer/apiAnalyzer.js"(exports2, module2) {
    var path = require("path");
    var { lineIndex, lineAt, matchParen, splitArgs } = require_text();
    var { resolveImport } = require_dependencyAnalyzer();
    function templateToPath(s) {
      return s.replace(/\$\{[^}]*\}/g, ":param");
    }
    function pathOf(url) {
      const noHost = url.replace(/^https?:\/\/[^/]+/i, "");
      return templateToPath(noHost.split("?")[0]).replace(/\/+$/, "") || "/";
    }
    function analyzeApiCalls(content, language) {
      if (!["javascript", "typescript", "vue", "svelte"].includes(language)) return analyzeNonJsCalls(content, language);
      const starts = lineIndex(content);
      const calls = [];
      let m;
      const fetchRe = /\bfetch\s*\(/g;
      while (m = fetchRe.exec(content)) {
        const open = m.index + m[0].length - 1;
        const close = matchParen(content, open);
        if (close === -1) continue;
        const args = splitArgs(content.slice(open + 1, close));
        const u = /^(['"`])(.*)\1$/s.exec(args[0] || "");
        if (!u) {
          calls.push({ method: "GET", url: null, dynamic: true, line: lineAt(starts, m.index), client: "fetch" });
          continue;
        }
        const meth = /method\s*:\s*['"](\w+)['"]/i.exec(args[1] || "");
        calls.push({ method: meth ? meth[1].toUpperCase() : "GET", url: u[2], path: pathOf(u[2]), line: lineAt(starts, m.index), client: "fetch" });
      }
      const axiosRe = /\b(axios|api|http|client|request|\$http)\.(get|post|put|patch|delete)\s*\(\s*(['"`])((?:\\.|(?!\3).)*)\3/g;
      while (m = axiosRe.exec(content)) {
        calls.push({ method: m[2].toUpperCase(), url: m[4], path: pathOf(m[4]), line: lineAt(starts, m.index), client: m[1] });
      }
      const axiosCfg = /\baxios\s*\(\s*\{[^}]*url\s*:\s*(['"`])([^'"`]+)\1[^}]*\}/g;
      while (m = axiosCfg.exec(content)) {
        const meth = /method\s*:\s*['"](\w+)['"]/i.exec(m[0]);
        calls.push({ method: meth ? meth[1].toUpperCase() : "GET", url: m[2], path: pathOf(m[2]), line: lineAt(starts, m.index), client: "axios" });
      }
      const ajax = /\$\.(get|post|ajax)\s*\(\s*['"]([^'"]+)['"]/g;
      while (m = ajax.exec(content)) calls.push({ method: m[1] === "post" ? "POST" : "GET", url: m[2], path: pathOf(m[2]), line: lineAt(starts, m.index), client: "jquery" });
      return calls;
    }
    function analyzeNonJsCalls(content, language) {
      const starts = lineIndex(content);
      const calls = [];
      let m;
      if (language === "python") {
        const re = /\brequests\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
        while (m = re.exec(content)) calls.push({ method: m[1].toUpperCase(), url: m[2], path: pathOf(m[2]), line: lineAt(starts, m.index), client: "requests" });
      } else if (language === "php") {
        const re = /(?:wp_remote_(get|post)|Http::(get|post|put|delete))\(\s*['"]([^'"]+)['"]/g;
        while (m = re.exec(content)) calls.push({ method: (m[1] || m[2]).toUpperCase(), url: m[3], path: pathOf(m[3]), line: lineAt(starts, m.index), client: "php-http" });
      }
      return calls;
    }
    function analyzeRealtimeAndGraphQL(content) {
      const starts = lineIndex(content);
      const out = { graphql: [], websocket: [], rpc: [], serverActions: [] };
      let m;
      const gql = /\b(?:gql|graphql)\s*`([^`]*)`/g;
      while (m = gql.exec(content)) {
        const op = /\b(query|mutation|subscription|type|schema)\s+(\w+)?/.exec(m[1]);
        out.graphql.push({ kind: op ? op[1] : "document", name: op && op[2] ? op[2] : null, line: lineAt(starts, m.index) });
      }
      if (/new\s+ApolloServer|graphqlHTTP\(|buildSchema\(/.test(content)) out.graphql.push({ kind: "server", name: null, line: lineAt(starts, content.search(/new\s+ApolloServer|graphqlHTTP\(|buildSchema\(/)) });
      const ws = /new\s+(?:WebSocket|WebSocketServer|Server)\(\s*(?:\{[^}]*\}|['"`]([^'"`]+)['"`])?/g;
      while (m = ws.exec(content)) if (/WebSocket/.test(m[0])) out.websocket.push({ url: m[1] || null, line: lineAt(starts, m.index) });
      const sio = /\bio\(\s*['"`]([^'"`]+)['"`]|new\s+Server\(\s*\w+\s*\)/g;
      while (m = sio.exec(content)) if (/socket\.io/.test(content)) out.websocket.push({ url: m[1] || null, line: lineAt(starts, m.index), library: "socket.io" });
      const rpc = /\b(?:trpc|grpc)\b[.\w]*/g;
      while (m = rpc.exec(content)) out.rpc.push({ kind: m[0], line: lineAt(starts, m.index) });
      if (/^\s*['"]use server['"]/m.test(content)) out.serverActions.push({ line: lineAt(starts, content.search(/['"]use server['"]/)) });
      return out;
    }
    function normalizePath(p) {
      return ("/" + p.replace(/^\/+/, "")).replace(/\/+$/, "").replace(/\/+/g, "/").replace(/\{[^}]+\}|<[^>]+>|:[\w]+\*?|\[[^\]]+\]|\*\w+/g, ":param") || "/";
    }
    function resolveRoutes(fileAnalyses, dependencies) {
      const byPath = new Map(fileAnalyses.map((f) => [f.path, f]));
      const fileSet = new Set(byPath.keys());
      const prefixByFile = /* @__PURE__ */ new Map();
      for (const fa of fileAnalyses) {
        for (const mt of fa.mounts || []) {
          const imp = fa.imports.find((i) => i.default === mt.target || i.names.some((n) => n.local === mt.target));
          if (!imp) continue;
          const target = resolveImport(fa.path, imp, fa.language, fileSet);
          if (target) prefixByFile.set(target, (prefixByFile.get(fa.path) || "") + mt.path);
        }
      }
      const apis = [];
      for (const fa of fileAnalyses) {
        for (const r of fa.routes || []) {
          const prefix = prefixByFile.get(fa.path) || "";
          const full = normalizePath(prefix + r.path);
          apis.push({ ...r, endpoint: full, prefix: prefix || null, file: fa.path });
        }
      }
      return apis;
    }
    function methodsMatch(a, b) {
      return a === "ANY" || b === "ANY" || a === "ALL" || b === "ALL" || a === b;
    }
    function matchCallsToRoutes(fileAnalyses, apis) {
      const links = [];
      for (const fa of fileAnalyses) {
        for (const c of fa.apiCalls || []) {
          if (!c.path) continue;
          const np = normalizePath(c.path);
          const matches = apis.filter((r) => r.endpoint === np && methodsMatch(r.method, c.method));
          for (const r of matches) links.push({ from: { file: fa.path, line: c.line, client: c.client }, method: c.method, path: np, route: { file: r.file, handler: r.handler, line: r.line, endpoint: r.endpoint, method: r.method }, status: "VERIFIED" });
        }
      }
      return links;
    }
    module2.exports = { analyzeApiCalls, analyzeRealtimeAndGraphQL, resolveRoutes, matchCallsToRoutes, normalizePath };
  }
});

// src/database/schemaAnalyzer.js
var require_schemaAnalyzer = __commonJS({
  "src/database/schemaAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt, matchParen, splitArgs } = require_text();
    var SQL_TYPES = /^(int|integer|bigint|smallint|tinyint|serial|bigserial|varchar|char|text|longtext|mediumtext|boolean|bool|date|datetime|timestamp|timestamptz|time|decimal|numeric|float|double|real|json|jsonb|uuid|blob|bytea|enum)/i;
    function parseSqlColumns(body) {
      const columns = [];
      const fks = [];
      const pks = [];
      for (const raw of splitArgs(body)) {
        const part = raw.replace(/\s+/g, " ").trim();
        let m;
        if (m = /^(?:CONSTRAINT\s+\S+\s+)?PRIMARY KEY\s*\(([^)]+)\)/i.exec(part)) {
          m[1].split(",").forEach((c) => pks.push(c.replace(/[`"\[\]\s]/g, "")));
          continue;
        }
        if (m = /^(?:CONSTRAINT\s+\S+\s+)?FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/i.exec(part)) {
          fks.push({ column: m[1].replace(/[`"\s]/g, ""), references: m[2], referencedColumn: m[3].replace(/[`"\s]/g, "") });
          continue;
        }
        if (/^(UNIQUE|KEY|INDEX|CHECK|CONSTRAINT|FULLTEXT)\b/i.test(part)) continue;
        m = /^[`"\[]?(\w+)[`"\]]?\s+([\w]+(?:\([^)]*\))?)(.*)$/.exec(part);
        if (!m || !SQL_TYPES.test(m[2])) continue;
        const col = { name: m[1], type: m[2].toLowerCase(), pk: /PRIMARY KEY/i.test(m[3]), nullable: !/NOT NULL|PRIMARY KEY/i.test(m[3]), unique: /\bUNIQUE\b/i.test(m[3]) };
        const ref = /REFERENCES\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/i.exec(m[3]);
        if (ref) fks.push({ column: m[1], references: ref[1], referencedColumn: ref[2].replace(/[`"\s]/g, "") });
        columns.push(col);
      }
      columns.forEach((c) => {
        if (pks.includes(c.name)) c.pk = true;
      });
      return { columns, fks };
    }
    function analyzeSql(content, starts, file) {
      const entities = [];
      const relationships = [];
      const indexes = [];
      const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\[]?(?:\w+\.)?(\w+)[`"\]]?\s*\(/gi;
      let m;
      while (m = re.exec(content)) {
        const open = m.index + m[0].length - 1;
        const close = matchParen(content, open);
        if (close === -1) continue;
        const { columns, fks } = parseSqlColumns(content.slice(open + 1, close));
        const line = lineAt(starts, m.index);
        entities.push({ name: m[1], kind: "table", source: "sql", fields: columns, file, line, endLine: lineAt(starts, close) });
        for (const fk of fks) relationships.push({ from: m[1], to: fk.references, type: "many-to-one", via: `${m[1]}.${fk.column} -> ${fk.references}.${fk.referencedColumn}`, file, line, source: "sql-foreign-key" });
      }
      const idx = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s+ON\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/gi;
      while (m = idx.exec(content)) indexes.push({ name: m[2], entity: m[3], columns: m[4].split(",").map((s) => s.trim()), unique: !!m[1], file, line: lineAt(starts, m.index) });
      const alter = /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+[`"]?(\w+)[`"]?\s*\(([^)]+)\)/gi;
      while (m = alter.exec(content)) relationships.push({ from: m[1], to: m[3], type: "many-to-one", via: `${m[1]}.${m[2].trim()} -> ${m[3]}.${m[4].trim()}`, file, line: lineAt(starts, m.index), source: "sql-foreign-key" });
      return { entities, relationships, indexes };
    }
    function analyzePrisma(content, starts, file) {
      const entities = [];
      const relationships = [];
      const models = [...content.matchAll(/^model\s+(\w+)\s*\{([^}]*)\}/gm)];
      const names = new Set(models.map((x) => x[1]));
      for (const m of models) {
        const fields = [];
        for (const raw of m[2].split("\n")) {
          const line = raw.trim();
          const f = /^(\w+)\s+([\w]+)(\[\])?(\?)?\s*(.*)$/.exec(line);
          if (!f || line.startsWith("@@") || line.startsWith("//")) continue;
          const isRel = names.has(f[2]);
          if (isRel) {
            const rel = /@relation\(([^)]*)\)/.exec(f[5]);
            const hasFk = rel && /fields\s*:/.test(rel[1]);
            relationships.push({ from: m[1], to: f[2], type: f[3] ? "one-to-many" : hasFk ? "many-to-one" : "one-to-one", via: `${m[1]}.${f[1]}`, file, line: lineAt(starts, m.index), source: "prisma-relation", owner: !!hasFk });
          } else {
            fields.push({ name: f[1], type: f[2].toLowerCase() + (f[3] || ""), pk: /@id\b/.test(f[5]), nullable: !!f[4], unique: /@unique\b/.test(f[5]) });
          }
        }
        entities.push({ name: m[1], kind: "model", source: "prisma", fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, m.index + m[0].length) });
      }
      return { entities, relationships, indexes: [] };
    }
    function analyzeKnexMigration(content, starts, file) {
      const entities = [];
      const relationships = [];
      const re = /\.createTable\(\s*['"]([\w]+)['"]\s*,\s*(?:async\s*)?\(?(\w+)\)?\s*=>\s*\{/g;
      let m;
      while (m = re.exec(content)) {
        const open = m.index + m[0].length - 1;
        let depth = 0;
        let end = open;
        for (let i = open; i < content.length; i++) {
          if (content[i] === "{") depth++;
          if (content[i] === "}") {
            depth--;
            if (!depth) {
              end = i;
              break;
            }
          }
        }
        const body = content.slice(open, end);
        const t = m[2];
        const fields = [];
        for (const c of body.matchAll(new RegExp(`${t}\\.(increments|bigIncrements|string|text|integer|bigInteger|boolean|date|dateTime|timestamp|decimal|float|json|uuid|enu|enum)\\(\\s*['"]?(\\w+)?['"]?`, "g"))) {
          fields.push({ name: c[2] || (c[1].includes("ncrements") ? "id" : c[1]), type: c[1], pk: c[1].includes("ncrements") });
        }
        for (const r of body.matchAll(new RegExp(`${t}\\.(?:integer|bigInteger|uuid|bigInteger)\\(\\s*['"](\\w+)['"]\\s*\\)[^;]*?\\.references\\(\\s*['"](\\w+)['"]\\s*\\)\\s*\\.inTable\\(\\s*['"](\\w+)['"]`, "g"))) {
          relationships.push({ from: m[1], to: r[3], type: "many-to-one", via: `${m[1]}.${r[1]} -> ${r[3]}.${r[2]}`, file, line: lineAt(starts, m.index), source: "knex-foreign-key" });
        }
        entities.push({ name: m[1], kind: "table", source: "knex-migration", fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
      }
      return { entities, relationships, indexes: [] };
    }
    function analyzeLaravelMigration(content, starts, file) {
      const entities = [];
      const relationships = [];
      const re = /Schema::create\(\s*['"](\w+)['"]\s*,\s*function\s*\([^)]*\)\s*\{/g;
      let m;
      while (m = re.exec(content)) {
        const open = m.index + m[0].length - 1;
        let depth = 0;
        let end = open;
        for (let i = open; i < content.length; i++) {
          if (content[i] === "{") depth++;
          if (content[i] === "}") {
            depth--;
            if (!depth) {
              end = i;
              break;
            }
          }
        }
        const body = content.slice(open, end);
        const fields = [];
        for (const c of body.matchAll(/\$table->(id|string|text|integer|bigInteger|unsignedBigInteger|boolean|date|dateTime|timestamp|decimal|float|json|uuid|foreignId|enum)\(\s*(?:['"](\w+)['"])?/g)) {
          fields.push({ name: c[2] || (c[1] === "id" ? "id" : c[1]), type: c[1], pk: c[1] === "id" });
        }
        for (const r of body.matchAll(/\$table->foreignId\(\s*['"](\w+)['"]\s*\)(?:->constrained\(\s*(?:['"](\w+)['"])?\s*\))?/g)) {
          const target = r[2] || r[1].replace(/_id$/, "") + "s";
          relationships.push({ from: m[1], to: target, type: "many-to-one", via: `${m[1]}.${r[1]}`, file, line: lineAt(starts, m.index), source: "laravel-foreign-key" });
        }
        entities.push({ name: m[1], kind: "table", source: "laravel-migration", fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
      }
      return { entities, relationships, indexes: [] };
    }
    function analyzeSchema(content, language, file) {
      const starts = lineIndex(content);
      const empty = { entities: [], relationships: [], indexes: [] };
      if (language === "sql") return analyzeSql(content, starts, file);
      if (language === "prisma") return analyzePrisma(content, starts, file);
      if (language === "php" && /Schema::create/.test(content)) return analyzeLaravelMigration(content, starts, file);
      if (["javascript", "typescript"].includes(language) && /\.createTable\(/.test(content)) return analyzeKnexMigration(content, starts, file);
      if (["javascript", "typescript", "python", "php"].includes(language) && /CREATE\s+TABLE/i.test(content)) return analyzeSql(content, starts, file);
      return empty;
    }
    module2.exports = { analyzeSchema };
  }
});

// src/database/entityAnalyzer.js
var require_entityAnalyzer = __commonJS({
  "src/database/entityAnalyzer.js"(exports2, module2) {
    var { analyzeGoModels } = require_goSupport();
    var { lineIndex, lineAt, matchBrace, matchParen } = require_text();
    function objectFields(body) {
      const fields = [];
      let depth = 0;
      let key = "";
      let i = 0;
      const flush = (valueStart) => {
        const rest = body.slice(valueStart, valueStart + 200);
        const t = /(?:type\s*:\s*)?(?:\[\s*\{?\s*(?:type\s*:\s*)?)?(?:mongoose\.)?(?:DataTypes\.|Sequelize\.|Schema\.Types\.|Types\.)?([A-Za-z]+)/.exec(rest);
        fields.push({ name: key, type: t ? t[1].toLowerCase() : "unknown", pk: /primaryKey\s*:\s*true/.test(rest.slice(0, 120)), unique: /unique\s*:\s*true/.test(rest.slice(0, 120)) });
      };
      while (i < body.length) {
        const c = body[i];
        if ("{[(".includes(c)) depth++;
        else if ("}])".includes(c)) depth--;
        else if (depth === 0 && c === ":") {
          const before = body.slice(0, i).match(/([A-Za-z_$][\w$]*)\s*$/) || body.slice(0, i).match(/['"]([\w$]+)['"]\s*$/);
          if (before) {
            key = before[1];
            flush(i + 1);
          }
        }
        i++;
      }
      return fields.filter((f) => f.name && !["type", "required", "default", "ref"].includes(f.name));
    }
    function analyzeMongoose(content, starts, file) {
      const entities = [];
      const schemas = /* @__PURE__ */ new Map();
      let m;
      const sc = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{/g;
      while (m = sc.exec(content)) {
        const open = m.index + m[0].length - 1;
        const end = matchBrace(content, open);
        schemas.set(m[1], { fields: objectFields(content.slice(open + 1, end)), line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
      }
      const mo = /(?:mongoose\.)?model\(\s*['"](\w+)['"]\s*,\s*(\w+)/g;
      while (m = mo.exec(content)) {
        const s = schemas.get(m[2]) || { fields: [], line: lineAt(starts, m.index), endLine: lineAt(starts, m.index) };
        entities.push({ name: m[1], kind: "collection", source: "mongoose", fields: s.fields, file, line: s.line, endLine: Math.max(s.endLine, lineAt(starts, m.index)) });
      }
      return entities;
    }
    function analyzeSequelize(content, starts, file) {
      const entities = [];
      let m;
      const def = /\.define\(\s*['"](\w+)['"]\s*,\s*\{/g;
      while (m = def.exec(content)) {
        const open = m.index + m[0].length - 1;
        const end = matchBrace(content, open);
        entities.push({ name: m[1], kind: "model", source: "sequelize", fields: objectFields(content.slice(open + 1, end)), file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
      }
      const init = /class\s+(\w+)\s+extends\s+Model[\s\S]*?\1\.init\(\s*\{/g;
      while (m = init.exec(content)) {
        const open = m.index + m[0].length - 1;
        const end = matchBrace(content, open);
        entities.push({ name: m[1], kind: "model", source: "sequelize", fields: objectFields(content.slice(open + 1, end)), file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
      }
      return entities;
    }
    function analyzeTypeorm(content, starts, file) {
      const entities = [];
      const re = /@Entity\(\s*(?:['"](\w+)['"])?[^)]*\)\s*(?:export\s+)?class\s+(\w+)\s*\{/g;
      let m;
      while (m = re.exec(content)) {
        const open = m.index + m[0].length - 1;
        const end = matchBrace(content, open);
        const body = content.slice(open, end);
        const fields = [...body.matchAll(/@((?:Primary(?:Generated)?)?Column)\([^)]*\)\s*(\w+)\s*[!?]?\s*:\s*(\w+)/g)].map((f) => ({ name: f[2], type: f[3].toLowerCase(), pk: f[1].startsWith("Primary") }));
        entities.push({ name: m[2], table: m[1] || null, kind: "model", source: "typeorm", fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
      }
      return entities;
    }
    function analyzeEloquent(content, starts, file) {
      const entities = [];
      const re = /class\s+(\w+)\s+extends\s+(?:Model|Authenticatable|Pivot)\b[^{]*\{/g;
      let m;
      while (m = re.exec(content)) {
        const open = m.index + m[0].length - 1;
        const end = matchBrace(content, open);
        const body = content.slice(open, end);
        const table = /\$table\s*=\s*['"](\w+)['"]/.exec(body);
        const fillable = /\$fillable\s*=\s*\[([^\]]*)\]/.exec(body);
        const fields = fillable ? [...fillable[1].matchAll(/['"](\w+)['"]/g)].map((f) => ({ name: f[1], type: "unknown" })) : [];
        entities.push({ name: m[1], table: table ? table[1] : null, kind: "model", source: "eloquent", fields, file, line: lineAt(starts, m.index), endLine: lineAt(starts, end) });
      }
      return entities;
    }
    function analyzePythonModels(content, file) {
      const entities = [];
      const lines = content.split("\n");
      lines.forEach((ln, i) => {
        let m = /^class\s+(\w+)\(\s*(?:models\.Model|db\.Model|Base\b|DeclarativeBase|declarative_base\(\)|SQLModel)[^)]*\)\s*:/.exec(ln);
        if (!m) return;
        if (/SQLModel/.test(ln) && !/table\s*=\s*True/.test(ln)) return;
        const django = /models\.Model/.test(ln);
        const sqlmodel = /SQLModel/.test(ln);
        const fields = [];
        let end = i;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() && !/^\s/.test(lines[j])) break;
          end = j;
          let f = django ? /^\s+(\w+)\s*=\s*models\.(\w+)Field|^\s+(\w+)\s*=\s*models\.(ForeignKey|ManyToManyField|OneToOneField)/.exec(lines[j]) : sqlmodel ? /^\s+(\w+)\s*:\s*(?:Optional\[)?([\w.]+)/.exec(lines[j]) : /^\s+(\w+)\s*=\s*(?:db\.|sa\.)?Column\(\s*(?:db\.|sa\.)?(\w+)/.exec(lines[j]) || /^\s+(\w+)\s*:\s*Mapped\[(?:Optional\[)?([\w.]+)[^=]*=\s*(?:db\.)?mapped_column/.exec(lines[j]);
          if (f && !(sqlmodel && ["model_config", "Config"].includes(f[1]))) fields.push({ name: f[1] || f[3], type: (f[2] || f[4] || "unknown").toLowerCase().replace(/^str$/, "string").replace(/^bool$/, "bool"), pk: /primary_key\s*=\s*True/.test(lines[j]), unique: /unique\s*=\s*True/.test(lines[j]) });
        }
        entities.push({ name: m[1], kind: "model", source: django ? "django" : sqlmodel ? "sqlmodel" : "sqlalchemy", fields, file, line: i + 1, endLine: end + 1 });
      });
      return entities;
    }
    function analyzeEntities(content, language, file) {
      const starts = lineIndex(content);
      if (["javascript", "typescript"].includes(language)) {
        const out = [];
        if (/mongoose/.test(content)) out.push(...analyzeMongoose(content, starts, file));
        if (/sequelize|DataTypes/i.test(content)) out.push(...analyzeSequelize(content, starts, file));
        if (/@Entity\(/.test(content)) out.push(...analyzeTypeorm(content, starts, file));
        return out;
      }
      if (language === "php" && /extends\s+(Model|Authenticatable|Pivot)/.test(content)) return analyzeEloquent(content, starts, file);
      if (language === "python") return analyzePythonModels(content, file);
      if (language === "go") return analyzeGoModels(content, starts, file).entities;
      return [];
    }
    module2.exports = { analyzeEntities };
  }
});

// src/database/relationshipAnalyzer.js
var require_relationshipAnalyzer = __commonJS({
  "src/database/relationshipAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt } = require_text();
    var { analyzeGoModels } = require_goSupport();
    function analyzeOrmRelationships(content, language, file, entities) {
      const starts = lineIndex(content);
      const rels = [];
      let m;
      if (["javascript", "typescript"].includes(language)) {
        const seq = /(\w+)\.(hasMany|hasOne|belongsTo|belongsToMany)\(\s*(\w+)/g;
        while (m = seq.exec(content)) {
          const type = { hasMany: "one-to-many", hasOne: "one-to-one", belongsTo: "many-to-one", belongsToMany: "many-to-many" }[m[2]];
          rels.push({ from: m[1], to: m[3], type, via: `${m[1]}.${m[2]}(${m[3]})`, file, line: lineAt(starts, m.index), source: "sequelize-association" });
        }
        const typeorm = /@(OneToMany|ManyToOne|OneToOne|ManyToMany)\(\s*\(\)\s*=>\s*(\w+)[^)]*\)[\s\S]{0,120}?(\w+)\s*[!?]?\s*:/g;
        for (const e of entities.filter((x) => x.source === "typeorm")) {
          const region = content.split("\n").slice(e.line - 1, e.endLine).join("\n");
          while (m = typeorm.exec(region)) {
            const type = { OneToMany: "one-to-many", ManyToOne: "many-to-one", OneToOne: "one-to-one", ManyToMany: "many-to-many" }[m[1]];
            rels.push({ from: e.name, to: m[2], type, via: `${e.name}.${m[3]}`, file, line: e.line, source: "typeorm-relation" });
          }
        }
        for (const e of entities.filter((x) => x.source === "mongoose")) {
          const region = content.split("\n").slice(e.line - 1, e.endLine).join("\n");
          for (const r of region.matchAll(/(\w+)\s*:\s*\{?\s*\[?\s*\{?[^}]*?ref\s*:\s*['"](\w+)['"]/g)) {
            rels.push({ from: e.name, to: r[2], type: /\[\s*\{?[^\]]*ref/.test(r[0]) ? "one-to-many" : "many-to-one", via: `${e.name}.${r[1]}`, file, line: e.line, source: "mongoose-ref" });
          }
        }
      } else if (language === "php") {
        const re = /public\s+function\s+(\w+)\s*\([^)]*\)[^{]*\{\s*return\s+\$this->(hasMany|hasOne|belongsTo|belongsToMany)\(\s*(\w+)::class/g;
        while (m = re.exec(content)) {
          const owner = entities.find((e) => e.line <= lineAt(starts, m.index) && e.endLine >= lineAt(starts, m.index));
          if (!owner) continue;
          const type = { hasMany: "one-to-many", hasOne: "one-to-one", belongsTo: "many-to-one", belongsToMany: "many-to-many" }[m[2]];
          rels.push({ from: owner.name, to: m[3], type, via: `${owner.name}::${m[1]}()`, file, line: lineAt(starts, m.index), source: "eloquent-relation" });
        }
      } else if (language === "go") {
        rels.push(...analyzeGoModels(content, starts, file).relationships);
      } else if (language === "python") {
        const re = /^\s+(\w+)\s*=\s*models\.(ForeignKey|ManyToManyField|OneToOneField)\(\s*['"]?(\w+)/gm;
        while (m = re.exec(content)) {
          const owner = entities.find((e) => e.line <= lineAt(starts, m.index) && e.endLine >= lineAt(starts, m.index));
          if (!owner) continue;
          const type = { ForeignKey: "many-to-one", ManyToManyField: "many-to-many", OneToOneField: "one-to-one" }[m[2]];
          rels.push({ from: owner.name, to: m[3], type, via: `${owner.name}.${m[1]}`, file, line: lineAt(starts, m.index), source: "django-relation" });
        }
      }
      return rels;
    }
    module2.exports = { analyzeOrmRelationships };
  }
});

// src/database/queryAnalyzer.js
var require_queryAnalyzer = __commonJS({
  "src/database/queryAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt } = require_text();
    var { analyzeGoOrmCalls } = require_goSupport();
    var READ = /* @__PURE__ */ new Set(["find", "findOne", "findAll", "findById", "findByPk", "findMany", "findFirst", "findUnique", "count", "aggregate", "get", "select", "where", "all", "first", "countDocuments", "exists"]);
    var WRITE = /* @__PURE__ */ new Set(["create", "insert", "insertMany", "insertOne", "save", "update", "updateOne", "updateMany", "upsert", "delete", "destroy", "remove", "deleteOne", "deleteMany", "findByIdAndUpdate", "findByIdAndDelete", "findOneAndUpdate", "bulkCreate", "set", "add"]);
    function analyzeSqlQueries(content, starts, file) {
      const queries = [];
      const patterns = [
        { re: /\bSELECT\b[\s\S]{0,400}?\bFROM\s+[`"]?(\w+)[`"]?/gi, op: "SELECT", kind: "read" },
        { re: /\bINSERT\s+INTO\s+[`"]?(\w+)[`"]?/gi, op: "INSERT", kind: "write" },
        { re: /\bUPDATE\s+[`"]?(\w+)[`"]?\s+SET\b/gi, op: "UPDATE", kind: "write" },
        { re: /\bDELETE\s+FROM\s+[`"]?(\w+)[`"]?/gi, op: "DELETE", kind: "write" }
      ];
      for (const { re, op, kind } of patterns) {
        let m2;
        while (m2 = re.exec(content)) {
          const before = content.slice(Math.max(0, m2.index - 2), m2.index);
          if (file.endsWith(".sql") || /['"`(]\s*$|^\s*$/.test(before) || /(query|execute|raw|sql)\s*\(/i.test(content.slice(Math.max(0, m2.index - 60), m2.index))) {
            queries.push({ entity: m2[1], operation: op, kind, line: lineAt(starts, m2.index), orm: "sql", file, status: "VERIFIED" });
          }
        }
      }
      const joins = /\bJOIN\s+[`"]?(\w+)[`"]?/gi;
      let m;
      while (m = joins.exec(content)) queries.push({ entity: m[1], operation: "JOIN", kind: "read", line: lineAt(starts, m.index), orm: "sql", file, status: "VERIFIED" });
      if (/\b(BEGIN|START TRANSACTION|beginTransaction|\.transaction\(|\$transaction)\b/.test(content)) {
        queries.push({ entity: null, operation: "TRANSACTION", kind: "transaction", line: lineAt(starts, content.search(/\b(BEGIN|START TRANSACTION|beginTransaction|\.transaction\(|\$transaction)\b/)), orm: "sql", file, status: "VERIFIED" });
      }
      return queries;
    }
    function analyzeOrmCalls(content, starts, file) {
      const calls = [];
      const re = /\b([A-Z]\w*|prisma\.\w+)\.(\w+)\s*\(/g;
      let m;
      while (m = re.exec(content)) {
        const method = m[2];
        const kind = READ.has(method) ? "read" : WRITE.has(method) ? "write" : null;
        if (!kind) continue;
        const receiver = m[1].startsWith("prisma.") ? m[1].slice(7) : m[1];
        calls.push({ receiver, prisma: m[1].startsWith("prisma."), operation: method, kind, line: lineAt(starts, m.index), file });
      }
      const el = /\b([A-Z]\w*)::(find|findOrFail|all|where|create|update|delete|first|get|firstOrCreate|updateOrCreate|destroy|insert)\s*\(/g;
      while (m = el.exec(content)) {
        const kind = ["find", "findOrFail", "all", "where", "first", "get"].includes(m[2]) ? "read" : "write";
        calls.push({ receiver: m[1], operation: m[2], kind, line: lineAt(starts, m.index), file, orm: "eloquent" });
      }
      const dj = /\b([A-Z]\w*)\.objects\.(get|filter|all|create|update|delete|exclude|count)\s*\(/g;
      while (m = dj.exec(content)) calls.push({ receiver: m[1], operation: m[2], kind: ["create", "update", "delete"].includes(m[2]) ? "write" : "read", line: lineAt(starts, m.index), file, orm: "django" });
      return calls;
    }
    function analyzeCollectionQueries(content, starts, file) {
      const out = [];
      let m;
      const col = /\b(?:collection|doc)\(\s*(?:[\w.]+\s*,\s*)?['"](\w+)['"]/g;
      while (m = col.exec(content)) {
        const window = content.slice(m.index, m.index + 300);
        const op = /\.(get|getDocs|getDoc|onSnapshot|find|findOne)\(/.exec(window) ? "read" : /\.(add|addDoc|set|setDoc|update|updateDoc|delete|deleteDoc|insertOne|insertMany|updateOne|deleteOne)\(/.exec(window) ? "write" : "reference";
        out.push({ entity: m[1], operation: "collection", kind: op, line: lineAt(starts, m.index), orm: "collection", file, status: "VERIFIED" });
      }
      const knex = /\b(?:knex|db)\(\s*['"](\w+)['"]\s*\)\.(select|where|first|insert|update|del|delete)/g;
      while (m = knex.exec(content)) out.push({ entity: m[1], operation: m[2], kind: ["select", "where", "first"].includes(m[2]) ? "read" : "write", line: lineAt(starts, m.index), orm: "knex", file, status: "VERIFIED" });
      return out;
    }
    function analyzeQueries(content, file) {
      const starts = lineIndex(content);
      return {
        sql: [...analyzeSqlQueries(content, starts, file), ...analyzeCollectionQueries(content, starts, file)],
        ormCalls: [...analyzeOrmCalls(content, starts, file), ...file.endsWith(".go") ? analyzeGoOrmCalls(content, starts, file) : []]
      };
    }
    module2.exports = { analyzeQueries };
  }
});

// src/database/databaseDetector.js
var require_databaseDetector = __commonJS({
  "src/database/databaseDetector.js"(exports2, module2) {
    var { lineIndex, lineAt } = require_text();
    var { analyzeSchema } = require_schemaAnalyzer();
    var { analyzeEntities } = require_entityAnalyzer();
    var { analyzeOrmRelationships } = require_relationshipAnalyzer();
    var { analyzeQueries } = require_queryAnalyzer();
    var TECH_SIGNS = [
      { name: "MySQL", re: /require\(['"]mysql2?(?:\/promise)?['"]\)|from\s+['"]mysql2?(?:\/promise)?['"]|mysqli_|new\s+mysqli|PDO\(['"]mysql|pymysql|mysql\.connector/ },
      { name: "PostgreSQL", re: /require\(['"]pg['"]\)|from\s+['"]pg['"]|psycopg2|PDO\(['"]pgsql|pg_connect|postgres(?:ql)?:\/\// },
      { name: "MongoDB", re: /require\(['"]mongodb['"]\)|from\s+['"]mongodb['"]|MongoClient|pymongo/ },
      { name: "Mongoose", re: /require\(['"]mongoose['"]\)|from\s+['"]mongoose['"]/ },
      { name: "Firebase", re: /from\s+['"]firebase(?:\/[\w-]+)?['"]|require\(['"]firebase(?:-admin)?['"]\)|from\s+['"]firebase-admin/ },
      { name: "Firestore", re: /getFirestore\(|firestore\(\)|from\s+['"]firebase\/firestore['"]/ },
      { name: "SQLite", re: /sqlite3|better-sqlite3|sqlite:\/\/|import\s+sqlite3/ },
      { name: "Redis", re: /require\(['"]i?redis['"]\)|from\s+['"]i?redis['"]|redis\.createClient|new\s+Redis\(/ },
      { name: "Supabase", re: /@supabase\/supabase-js|createClient\([^)]*supabase/ },
      { name: "Prisma", re: /@prisma\/client|new\s+PrismaClient/ },
      { name: "Sequelize", re: /require\(['"]sequelize['"]\)|from\s+['"]sequelize['"]|new\s+Sequelize\(/ },
      { name: "TypeORM", re: /from\s+['"]typeorm['"]|require\(['"]typeorm['"]\)/ },
      { name: "Knex", re: /require\(['"]knex['"]\)|from\s+['"]knex['"]/ },
      { name: "Laravel Eloquent", re: /Illuminate\\Database\\Eloquent|extends\s+Model\b/ },
      { name: "WordPress database", re: /\$wpdb->|global\s+\$wpdb/ },
      { name: "Django ORM", re: /django\.db\s+import\s+models|models\.Model/ },
      { name: "SQLAlchemy", re: /sqlalchemy|db\.Model/ },
      { name: "Custom SQL", re: /\b(?:CREATE\s+TABLE|INSERT\s+INTO|SELECT\s+[\w*,\s`]+\s+FROM)\b/i }
    ];
    function detectTechnologies(content, file) {
      const starts = lineIndex(content);
      const out = [];
      for (const t of TECH_SIGNS) {
        const m = t.re.exec(content);
        if (m) out.push({ name: t.name, file, line: lineAt(starts, m.index) });
      }
      return out;
    }
    function analyzeDatabaseFile(content, language, file) {
      const schema = analyzeSchema(content, language, file);
      const entities = [...schema.entities, ...analyzeEntities(content, language, file)];
      const relationships = [...schema.relationships, ...analyzeOrmRelationships(content, language, file, entities)];
      const queries = analyzeQueries(content, file);
      return {
        technologies: detectTechnologies(content, file),
        entities,
        relationships,
        indexes: schema.indexes,
        queries: queries.sql,
        ormCalls: queries.ormCalls
      };
    }
    module2.exports = { analyzeDatabaseFile, detectTechnologies };
  }
});

// src/analyzer/databaseAnalyzer.js
var require_databaseAnalyzer = __commonJS({
  "src/analyzer/databaseAnalyzer.js"(exports2, module2) {
    var { analyzeDatabaseFile } = require_databaseDetector();
    var { isSourceLanguage } = require_languageDetector();
    function analyzeDatabase(content, language, file) {
      const relevant = isSourceLanguage(language) || ["sql", "prisma"].includes(language);
      if (!relevant) return { technologies: [], entities: [], relationships: [], indexes: [], queries: [], ormCalls: [] };
      return analyzeDatabaseFile(content, language, file);
    }
    module2.exports = { analyzeDatabase };
  }
});

// src/analyzer/authAnalyzer.js
var require_authAnalyzer = __commonJS({
  "src/analyzer/authAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt } = require_text();
    var PATTERNS = [
      { kind: "jwt", type: "authentication", re: /\bjwt\.(sign|verify|decode)\s*\(|jsonwebtoken|JWT::|jwt\.encode|PyJWT|jwt_required|JwtAuthGuard/ },
      { kind: "password-hashing", type: "authentication", re: /\bbcrypt(?:js)?\b|argon2|password_hash\(|password_verify\(|make_password|check_password/ },
      { kind: "passport", type: "authentication", re: /passport\.(authenticate|use)\(|from\s+['"]passport/ },
      { kind: "oauth", type: "authentication", re: /oauth|OAuth2|GoogleAuthProvider|signInWithPopup|next-auth|NextAuth|openid/i },
      { kind: "session", type: "authentication", re: /express-session|req\.session|session\(\s*\{|\$_SESSION|session\[['"]/ },
      { kind: "cookie", type: "authentication", re: /cookie-parser|res\.cookie\(|document\.cookie|setcookie\(|set_cookie/i },
      { kind: "login", type: "authentication", re: /\b(?:login|signIn|signin|authenticate)\s*\(|signInWithEmailAndPassword|\/login\b/ },
      { kind: "signup", type: "authentication", re: /\b(?:signup|signUp|register|createUser)\s*\(|createUserWithEmailAndPassword|\/(?:signup|register)\b/ },
      { kind: "auth-middleware", type: "authorization", re: /\b(?:isAuthenticated|requireAuth|authMiddleware|ensureAuth\w*|verifyToken|authenticateToken|protect|auth)\b(?=\s*[,)])|@UseGuards\(|middleware\(\s*['"]auth|@login_required|login_required|permission_classes|@PreAuthorize|\[Authorize/ },
      { kind: "role-check", type: "authorization", re: /\b(?:hasRole|hasPermission|isAdmin|checkRole|requireRole|authorize|can)\s*\(|\.role\s*(?:===?|!==?)\s*['"]|roles?\.includes\(|@Roles\(|Gate::(?:allows|denies)|@permission_required/ },
      { kind: "rbac", type: "authorization", re: /\bRBAC\b|rbac|casbin|accesscontrol/i },
      { kind: "protected-route", type: "authorization", re: /ProtectedRoute|PrivateRoute|RequireAuth|useAuth\(\)|withAuth\(/ }
    ];
    function analyzeAuth(content) {
      const starts = lineIndex(content);
      const out = [];
      for (const p of PATTERNS) {
        const re = new RegExp(p.re.source, p.re.flags.includes("i") ? "gi" : "g");
        let m;
        let count = 0;
        while ((m = re.exec(content)) && count < 5) {
          out.push({ kind: p.kind, type: p.type, line: lineAt(starts, m.index), match: m[0].slice(0, 40) });
          count++;
        }
      }
      return out;
    }
    module2.exports = { analyzeAuth };
  }
});

// src/analyzer/externalServiceAnalyzer.js
var require_externalServiceAnalyzer = __commonJS({
  "src/analyzer/externalServiceAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt } = require_text();
    var SERVICES = [
      { name: "Stripe", re: /\bstripe\b|api\.stripe\.com|Stripe\(/i },
      { name: "PayPal", re: /paypal/i },
      { name: "AWS", re: /aws-sdk|@aws-sdk|boto3|amazonaws\.com|\bS3Client\b|new\s+AWS\./ },
      { name: "Google APIs", re: /googleapis|google-auth|maps\.googleapis\.com|@google-cloud/ },
      { name: "Firebase", re: /firebase/i },
      { name: "Twilio", re: /\btwilio\b/i },
      { name: "SendGrid", re: /sendgrid/i },
      { name: "Mail (SMTP)", re: /nodemailer|createTransport\(|smtplib|Mail::send|PHPMailer|wp_mail\(/ },
      { name: "Cloudinary", re: /cloudinary/i },
      { name: "Analytics", re: /google-analytics|gtag\(|mixpanel|segment\.com|analytics\.track|amplitude|posthog/i },
      { name: "Sentry", re: /@sentry\/|sentry_sdk|Sentry\.init/ },
      { name: "Maps", re: /mapbox|leaflet|google\.maps|maps\.googleapis/i },
      { name: "Slack", re: /slack\.com\/api|@slack\/|hooks\.slack\.com/i },
      { name: "OpenAI/LLM API", re: /api\.openai\.com|api\.anthropic\.com|from\s+['"]openai['"]/ }
    ];
    function analyzeExternalServices(content) {
      const starts = lineIndex(content);
      const out = [];
      for (const s of SERVICES) {
        const re = new RegExp(s.re.source, s.re.flags.includes("i") ? "gi" : "g");
        const lines = [];
        let first = null;
        let m;
        while ((m = re.exec(content)) && lines.length < 30) {
          if (!first) first = m;
          const ln = lineAt(starts, m.index);
          if (lines[lines.length - 1] !== ln) lines.push(ln);
        }
        if (first) out.push({ name: s.name, line: lines[0], lines, match: first[0].slice(0, 40) });
      }
      const hosts = /* @__PURE__ */ new Set();
      for (const m of content.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?:[/:'"`?]|$)/gi)) {
        const h = m[1].toLowerCase();
        if (!/^(localhost|127\.0\.0\.1|example\.(com|org)|www\.w3\.org|schemas\.|json-schema\.org)/.test(h)) hosts.add(h);
      }
      return { services: out, hosts: [...hosts].sort() };
    }
    module2.exports = { analyzeExternalServices };
  }
});

// src/analyzer/eventAnalyzer.js
var require_eventAnalyzer = __commonJS({
  "src/analyzer/eventAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt } = require_text();
    function analyzeEvents(content) {
      const starts = lineIndex(content);
      const res = { events: [], queues: [], jobs: [], webhooks: [] };
      let m;
      const emit = /\b([\w$.]+)\.emit\(\s*['"`]([\w:.-]+)['"`]/g;
      while (m = emit.exec(content)) res.events.push({ name: m[2], role: "emit", line: lineAt(starts, m.index) });
      const on = /\b(?!app\b|router\b)([\w$.]+)\.(?:on|once|addListener)\(\s*['"`]([\w:.-]+)['"`]/g;
      while (m = on.exec(content)) if (!["click", "change", "submit", "keydown", "load", "error", "close", "data", "end", "open", "message", "connection"].includes(m[2]) || /io|socket|emitter|events/i.test(m[1])) res.events.push({ name: m[2], role: "listen", line: lineAt(starts, m.index) });
      const q = /new\s+(?:Bull|BullMQ|Queue|Worker)\(\s*['"`]([\w:-]+)['"`]|\b(?:celery|Celery)\(|@(?:shared_task|app\.task)|sqs\.(?:sendMessage|receiveMessage)|Queue::push|dispatch\(/g;
      while (m = q.exec(content)) res.queues.push({ name: m[1] || null, line: lineAt(starts, m.index), match: m[0].slice(0, 30) });
      const job = /cron\.schedule\(\s*['"`]([^'"`]+)['"`]|node-cron|agenda\.define\(\s*['"`]([\w:-]+)['"`]|@Cron\(|schedule\.every|wp_schedule_event|\$schedule->|@Scheduled\(/g;
      while (m = job.exec(content)) res.jobs.push({ name: m[2] || m[1] || null, line: lineAt(starts, m.index), match: m[0].slice(0, 30) });
      const wh = /['"`](\/[\w/-]*webhooks?[\w/-]*)['"`]|constructEvent\(|X-Hub-Signature|stripe-signature/gi;
      while (m = wh.exec(content)) res.webhooks.push({ path: m[1] || null, line: lineAt(starts, m.index), match: m[0].slice(0, 30) });
      return res;
    }
    var TEST_PATH = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_[\w]+\.py$|_test\.(go|py|rb)$|Test\.(java|php)$/;
    function isTestFile(path) {
      return TEST_PATH.test(path);
    }
    module2.exports = { analyzeEvents, isTestFile };
  }
});

// src/analyzer/stateAnalyzer.js
var require_stateAnalyzer = __commonJS({
  "src/analyzer/stateAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt } = require_text();
    var LIBS = [
      { lib: "redux", re: /createSlice\(|createStore\(|configureStore\(|useSelector\(|useDispatch\(|combineReducers\(/ },
      { lib: "zustand", re: /from\s+['"]zustand|\bcreate\(\s*\(?set/ },
      { lib: "react-context", re: /createContext\(|useContext\(/ },
      { lib: "vuex/pinia", re: /defineStore\(|createStore\(\s*\{|useStore\(\)|mapState\(/ },
      { lib: "mobx", re: /makeObservable|makeAutoObservable|observer\(/ },
      { lib: "recoil/jotai", re: /\batom\(|useRecoilState|useAtom\(/ },
      { lib: "react-query", re: /useQuery\(|useMutation\(|QueryClient/ },
      { lib: "react-state", re: /\buseState\(|useReducer\(/ },
      { lib: "ngrx", re: /createAction\(|createReducer\(|@ngrx/ }
    ];
    function analyzeState(content) {
      const starts = lineIndex(content);
      const out = [];
      for (const l of LIBS) {
        const m = l.re.exec(content);
        if (m) out.push({ library: l.lib, line: lineAt(starts, m.index), match: m[0].slice(0, 30) });
      }
      const setters = [...content.matchAll(/const\s+\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState/g)].map((m) => ({ state: m[1], setter: m[2], line: lineAt(starts, m.index) }));
      return { libraries: out, localState: setters };
    }
    module2.exports = { analyzeState };
  }
});

// src/analyzer/businessLogicAnalyzer.js
var require_businessLogicAnalyzer = __commonJS({
  "src/analyzer/businessLogicAnalyzer.js"(exports2, module2) {
    var RULES = [
      { kind: "validation", re: /^(validate|verify|check|is(?:Valid|Eligible|Allowed)|assert|ensure|sanitize)/i },
      { kind: "calculation", re: /^(calculate|compute|apply(?:Discount|Tax|Coupon)|get(?:Total|Price|Tax|Discount)|total|subtotal|discount|tax|round)/i },
      { kind: "permission-check", re: /(permission|authorize|canAccess|hasRole|isAdmin|canEdit|canDelete)/i },
      { kind: "stock-check", re: /(stock|inventory|availability|isAvailable)/i },
      { kind: "status-transition", re: /(status|transition|advance|approve|reject|cancel|complete|fulfill|refund)/i },
      { kind: "eligibility", re: /(eligib|qualif|limit|quota|threshold)/i },
      { kind: "payment-rule", re: /(payment|charge|invoice|billing|subscription|checkout)/i }
    ];
    function analyzeBusinessLogic(symbols, isTest) {
      if (isTest) return [];
      const out = [];
      for (const s of symbols) {
        if (!["function", "method"].includes(s.type)) continue;
        for (const r of RULES) {
          if (r.re.test(s.name)) {
            out.push({ symbol: s.name, kind: r.kind, line: s.line, endLine: s.endLine, status: "INFERRED", basis: "symbol name" });
            break;
          }
        }
      }
      return out;
    }
    module2.exports = { analyzeBusinessLogic };
  }
});

// src/analyzer/validationAnalyzer.js
var require_validationAnalyzer = __commonJS({
  "src/analyzer/validationAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt, matchBrace } = require_text();
    var { analyzeGoValidation } = require_goSupport();
    var MAX_PER_FILE = 80;
    var SCHEMA_RULES = ["required", "unique", "minlength", "maxlength", "min", "max", "enum", "match", "default", "lowercase", "uppercase", "trim", "index"];
    function chainRules(chain) {
      const rules = [];
      const re = /\.?\b([A-Za-z_]\w*)\s*(\(([^()]*)\))?/g;
      let m;
      while (m = re.exec(chain)) {
        const name = m[1];
        if (["Joi", "z", "yup", "Yup", "v", "body", "check", "param", "query", "header", "cookie"].includes(name)) continue;
        const arg = m[3] !== void 0 ? m[3].trim().replace(/\s+/g, " ").slice(0, 40) : "";
        rules.push(arg && !/^['"`]?$/.test(arg) && /^[\w'"`./\\^$*+?|[\]{}()-]+(?:,\s*[\w'"`./-]+)?$/.test(arg) ? `${name}(${arg})` : name);
      }
      return rules;
    }
    function schemaOptions(content, starts, out) {
      const re = /([A-Za-z_$][\w$]*)\s*:\s*\{([^{}]*\btype\s*:[^{}]*)\}/g;
      let m;
      while (m = re.exec(content)) {
        const field = m[1];
        if (["type", "default", "validate", "ref"].includes(field)) continue;
        const body = m[2];
        const rules = [];
        for (const r of SCHEMA_RULES) {
          const hit = new RegExp(`\\b${r}\\s*:\\s*(\\[[^\\]]*\\]|/[^/\\n]+/[a-z]*|'[^']*'|"[^"]*"|[\\w.]+)`).exec(body);
          if (!hit) continue;
          const value = hit[1].trim().slice(0, 60);
          if (value === "false") continue;
          rules.push(value === "true" ? r : `${r}(${value})`);
        }
        if (rules.length) out.push({ kind: "schema", field, rules, line: lineAt(starts, m.index), status: "VERIFIED" });
      }
    }
    function chainedValidators(content, starts, out) {
      const keyed = /([A-Za-z_$][\w$]*)\s*:\s*((?:Joi|z|yup|Yup)\s*\.\s*[A-Za-z_]\w*\s*\([^)]*\)(?:\s*\.\s*[A-Za-z_]\w*\s*\((?:[^()]|\([^()]*\))*\))*)/g;
      let m;
      while (m = keyed.exec(content)) {
        const lib = /^(Joi|z|yup|Yup)/.exec(m[2])[1].toLowerCase().replace("yup", "yup");
        out.push({ kind: lib === "z" ? "zod" : lib, field: m[1], rules: chainRules(m[2]), line: lineAt(starts, m.index), status: "VERIFIED" });
      }
      const ev = /\b(body|check|param|query|header|cookie)\(\s*['"]([\w.[\]*-]+)['"][^)]*\)((?:\s*\.\s*[A-Za-z_]\w*\s*\((?:[^()]|\([^()]*\))*\))*)/g;
      while (m = ev.exec(content)) {
        const rules = chainRules(m[3]);
        if (rules.length) out.push({ kind: "express-validator", field: m[2], source: m[1], rules, line: lineAt(starts, m.index), status: "VERIFIED" });
      }
      const cv = /((?:@(?:Is\w+|Min|Max|Length|MinLength|MaxLength|Matches|Contains|ArrayNotEmpty|ArrayMinSize|ArrayMaxSize|ValidateNested|Allow|NotEquals|Equals)\s*\([^)]*\)\s*)+)(?:public\s+|private\s+|readonly\s+)*([A-Za-z_$][\w$]*)\s*[!?]?\s*:/g;
      while (m = cv.exec(content)) {
        const rules = [...m[1].matchAll(/@([A-Za-z]+)\s*\(([^)]*)\)/g)].map((d) => {
          const a = d[2].trim().replace(/\s+/g, " ").slice(0, 30);
          return a && !/^\{/.test(a) ? `${d[1]}(${a})` : d[1];
        });
        out.push({ kind: "class-validator", field: m[2], rules, line: lineAt(starts, m.index), status: "VERIFIED" });
      }
    }
    function formAttributes(content, starts, out) {
      const tag = /<(input|select|textarea)\b([^>]*?)\/?>/gi;
      let m;
      while (m = tag.exec(content)) {
        const attrs = m[2];
        const name = /\bname\s*=\s*["'{]\s*['"]?([\w.-]+)/.exec(attrs);
        if (!name) continue;
        const rules = [];
        const type = /\btype\s*=\s*["']([\w-]+)["']/.exec(attrs);
        if (type && ["email", "url", "number", "tel", "date", "password"].includes(type[1])) rules.push(`type(${type[1]})`);
        if (/\brequired\b/.test(attrs)) rules.push("required");
        for (const a of ["minLength", "maxLength", "min", "max", "pattern", "step"]) {
          const v = new RegExp(`\\b${a}\\s*=\\s*(?:\\{\\s*([\\w.]+)\\s*\\}|["']([^"']{1,40})["'])`, "i").exec(attrs);
          if (v) rules.push(`${a.toLowerCase()}(${v[1] || v[2]})`);
        }
        if (rules.length) out.push({ kind: "html-form", field: name[1], rules, line: lineAt(starts, m.index), status: "VERIFIED" });
      }
    }
    function guards(content, starts, out) {
      const throwRe = /\bthrow\s+new\s+\w*Error\s*\(\s*(['"`])([^'"`\n]{3,100})\1/g;
      let m;
      let n = 0;
      while ((m = throwRe.exec(content)) && n < 15) {
        out.push({ kind: "guard", field: null, rules: [m[2]], line: lineAt(starts, m.index), status: "INFERRED", basis: "throws an error with this message" });
        n++;
      }
      const resRe = /\bres\.status\(\s*(4\d\d)\s*\)\s*\.(?:json|send)\(\s*\{?[^)]*?(['"`])([^'"`\n]{3,100})\2/g;
      n = 0;
      while ((m = resRe.exec(content)) && n < 15) {
        out.push({ kind: "guard", field: null, rules: [`HTTP ${m[1]}: ${m[3]}`], line: lineAt(starts, m.index), status: "INFERRED", basis: "responds with this client error" });
        n++;
      }
    }
    var GO_STATUS = { BadRequest: 400, Unauthorized: 401, Forbidden: 403, NotFound: 404, Conflict: 409, UnprocessableEntity: 422, TooManyRequests: 429 };
    function goGuards(content, starts, out) {
      let m;
      let n = 0;
      const lastMessage = (rest) => [...rest.matchAll(/(["`])([^"`\n]{3,100})\1/g)].map((x) => x[2]).filter((x) => !/^(error|message|msg|detail|status)$/i.test(x)).pop();
      const http = /\bhttp\.Error\(\s*\w+\s*,\s*(["`])([^"`\n]{3,100})\1\s*,\s*(?:http\.Status(\w+)|(4\d\d))/g;
      while ((m = http.exec(content)) && n < 15) {
        const code = GO_STATUS[m[3]] || m[4];
        if (code) {
          out.push({ kind: "guard", field: null, rules: [`HTTP ${code}: ${m[2]}`], line: lineAt(starts, m.index), status: "INFERRED", basis: "responds with this client error" });
          n++;
        }
      }
      const gin = /\.(?:JSON|AbortWithStatusJSON|String|Status)\(\s*(?:http\.Status(\w+)|fiber\.Status(\w+)|(4\d\d))([^\n]*)/g;
      n = 0;
      while ((m = gin.exec(content)) && n < 15) {
        const code = GO_STATUS[m[1] || m[2]] || m[3];
        const msg = lastMessage(m[4]);
        if (code && msg) {
          out.push({ kind: "guard", field: null, rules: [`HTTP ${code}: ${msg}`], line: lineAt(starts, m.index), status: "INFERRED", basis: "responds with this client error" });
          n++;
        }
      }
      const errs = /\b(?:errors\.New|fmt\.Errorf)\(\s*(["`])([^"`\n]{3,100})\1/g;
      n = 0;
      while ((m = errs.exec(content)) && n < 15) {
        out.push({ kind: "guard", field: null, rules: [m[2]], line: lineAt(starts, m.index), status: "INFERRED", basis: "returns an error with this message" });
        n++;
      }
    }
    function pythonValidation(content, starts, out) {
      let m;
      const call = (args, key) => {
        const r = new RegExp(`\\b${key}\\s*=\\s*([^,)]+)`).exec(args);
        return r ? r[1].trim() : null;
      };
      const django = /^[ \t]+(\w+)\s*=\s*models\.(\w+)\(([^\n]*)\)\s*$/gm;
      while (m = django.exec(content)) {
        const [, field, type, args] = m;
        if (/^(ManyToManyField)$/.test(type)) continue;
        const rules = [];
        if (call(args, "null") !== "True" && !/AutoField|BigAutoField/.test(type)) rules.push("required");
        if (call(args, "unique") === "True" || call(args, "primary_key") === "True") rules.push("unique");
        const ml = call(args, "max_length");
        if (ml) rules.push(`maxlength(${ml})`);
        const df = call(args, "default");
        if (df) rules.push(`default(${df.slice(0, 30)})`);
        if (call(args, "choices")) rules.push("enum(choices)");
        for (const v of ["MinValueValidator", "MaxValueValidator", "EmailValidator", "RegexValidator", "validate_email"]) {
          const vm = new RegExp(`${v}\\(([^)]*)\\)`).exec(args);
          if (vm) rules.push(`${v}(${vm[1].slice(0, 20)})`);
        }
        out.push({ kind: "schema", field, rules, line: lineAt(starts, m.index), status: "VERIFIED" });
      }
      const sa = /^[ \t]+(\w+)\s*(?::\s*Mapped\[((?:[^\[\]]|\[[^\]]*\])+)\])?\s*=\s*(?:db\.|sa\.|sqlalchemy\.)?(?:Column|mapped_column)\(([^\n]*)\)\s*$/gm;
      while (m = sa.exec(content)) {
        const [, field, mapped, args] = m;
        const rules = [];
        if (call(args, "nullable") === "False" || call(args, "primary_key") === "True" || mapped && !/Optional|None/.test(mapped) && call(args, "nullable") !== "True") rules.push("required");
        if (call(args, "unique") === "True" || call(args, "primary_key") === "True") rules.push("unique");
        const sz = /\bString\(\s*(\d+)\s*\)/.exec(args);
        if (sz) rules.push(`maxlength(${sz[1]})`);
        const df = call(args, "default");
        if (df) rules.push(`default(${df.slice(0, 30)})`);
        out.push({ kind: "schema", field, rules, line: lineAt(starts, m.index), status: "VERIFIED" });
      }
      const classRe = /^class\s+(\w+)\(([^)]*\b(?:BaseModel|SQLModel|BaseSettings)\b[^)]*)\)\s*:/gm;
      while (m = classRe.exec(content)) {
        const rest = content.slice(m.index + m[0].length);
        const end = rest.search(/^\S/m);
        const body = end === -1 ? rest : rest.slice(0, end);
        const base = lineAt(starts, m.index + m[0].length);
        body.split("\n").forEach((ln, i) => {
          const f = /^[ \t]+(\w+)\s*:\s*([\w\[\], .|"']+?)\s*(?:=\s*(.+))?$/.exec(ln);
          if (!f || ["model_config", "Config", "class"].includes(f[1])) return;
          const [, field, ann, dflt] = f;
          const rules = [];
          const optional = /Optional\[|\|\s*None|None\s*\|/.test(ann);
          const hasDefault = dflt !== void 0 && !/^Field\(\s*(\.\.\.|Ellipsis)/.test(dflt.trim()) && dflt.trim() !== "...";
          const fieldCall = dflt && /^Field\(/.test(dflt.trim()) ? dflt : "";
          const fieldHasDefault = fieldCall && /\bdefault\s*=|^Field\(\s*(?!\w+\s*=)[^.\s)][^,)]*[,)]/.test(fieldCall) && !/^Field\(\s*\.\.\./.test(fieldCall);
          if (!optional && !(hasDefault && !fieldCall) && !fieldHasDefault) rules.push("required");
          const types = { EmailStr: "email", HttpUrl: "url", AnyUrl: "url", UUID: "uuid", SecretStr: "secret", PositiveInt: "positive", conint: "int-range", constr: "string-constraint" };
          for (const [k, v] of Object.entries(types)) if (new RegExp(`\\b${k}\\b`).test(ann + (dflt || ""))) rules.push(`type(${v})`);
          for (const [k, label] of [["min_length", "minlength"], ["max_length", "maxlength"], ["ge", "min"], ["gt", "greater"], ["le", "max"], ["lt", "less"], ["pattern", "pattern"], ["regex", "pattern"], ["min_items", "minitems"], ["max_items", "maxitems"]]) {
            const v = call(fieldCall + " " + (dflt || ""), k);
            if (v) rules.push(`${label}(${v.slice(0, 24)})`);
          }
          out.push({ kind: m[2].includes("SQLModel") ? "sqlmodel" : "pydantic", field, rules, line: base + i, status: "VERIFIED" });
        });
      }
      for (const v of content.matchAll(/@(?:field_validator|validator)\(\s*['"](\w+)['"][^)]*\)/g)) out.push({ kind: "pydantic", field: v[1], rules: ["custom validator"], line: lineAt(starts, v.index), status: "VERIFIED" });
      const mm = /^[ \t]+(\w+)\s*=\s*(?:fields|serializers)\.(\w+)\(([^\n]*)\)\s*$/gm;
      while (m = mm.exec(content)) {
        const rules = [];
        const req = call(m[3], "required");
        if (req === "True" || /serializers\./.test(m[0]) && req !== "False" && !call(m[3], "read_only")) rules.push("required");
        const ml = call(m[3], "max_length") || (/Length\([^)]*max\s*=\s*(\d+)/.exec(m[3]) || [])[1];
        if (ml) rules.push(`maxlength(${ml})`);
        const mn = call(m[3], "min_length") || (/Length\([^)]*min\s*=\s*(\d+)/.exec(m[3]) || [])[1];
        if (mn) rules.push(`minlength(${mn})`);
        if (/Email/.test(m[2])) rules.push("type(email)");
        if (rules.length) out.push({ kind: /serializers\./.test(m[0]) ? "drf-serializer" : "marshmallow", field: m[1], rules, line: lineAt(starts, m.index), status: "VERIFIED" });
      }
      const wtf = /^[ \t]+(\w+)\s*=\s*\w+Field\([^\n]*validators\s*=\s*\[([^\]]*)\]/gm;
      while (m = wtf.exec(content)) out.push({ kind: "wtforms", field: m[1], rules: [...m[2].matchAll(/(\w+)(?:\(([^)]*)\))?/g)].map((x) => x[2] ? `${x[1]}(${x[2].slice(0, 20)})` : x[1]).filter((x) => /^[A-Z]/.test(x)), line: lineAt(starts, m.index), status: "VERIFIED" });
      let n = 0;
      const raise = /\braise\s+(?:ValueError|ValidationError|ValidationException|HTTPException|BadRequest|PermissionDenied)\([^\n]*?(["'])([^"'\n]{3,100})\1/g;
      while ((m = raise.exec(content)) && n < 15) {
        out.push({ kind: "guard", field: null, rules: [m[2]], line: lineAt(starts, m.index), status: "INFERRED", basis: "raises an error with this message" });
        n++;
      }
      const abort = /\babort\(\s*(4\d\d)\s*(?:,\s*(?:description\s*=\s*)?(["'])([^"'\n]{3,100})\2)?/g;
      n = 0;
      while ((m = abort.exec(content)) && n < 10) {
        out.push({ kind: "guard", field: null, rules: [`HTTP ${m[1]}${m[3] ? `: ${m[3]}` : ""}`], line: lineAt(starts, m.index), status: "INFERRED", basis: "aborts with this client error" });
        n++;
      }
      const hx = /status_code\s*=\s*(4\d\d)[^)\n]*detail\s*=\s*(["'])([^"'\n]{3,100})\2/g;
      n = 0;
      while ((m = hx.exec(content)) && n < 10) {
        out.push({ kind: "guard", field: null, rules: [`HTTP ${m[1]}: ${m[3]}`], line: lineAt(starts, m.index), status: "INFERRED", basis: "responds with this client error" });
        n++;
      }
    }
    function finish(out) {
      const seen = /* @__PURE__ */ new Set();
      return out.filter((v) => {
        const k = `${v.kind}|${v.field}|${v.rules.join(",")}|${v.line}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).sort((a, b) => a.line - b.line).slice(0, MAX_PER_FILE);
    }
    function analyzeValidation(code, language, isTest) {
      if (isTest || !code) return [];
      const starts = lineIndex(code);
      const out = [];
      if (language === "go") {
        out.push(...analyzeGoValidation(code, starts));
        goGuards(code, starts, out);
        return finish(out);
      }
      if (language === "python") {
        pythonValidation(code, starts, out);
        return finish(out);
      }
      schemaOptions(code, starts, out);
      chainedValidators(code, starts, out);
      formAttributes(code, starts, out);
      guards(code, starts, out);
      return finish(out);
    }
    module2.exports = { analyzeValidation };
  }
});

// src/analyzer/callAnalyzer.js
var require_callAnalyzer = __commonJS({
  "src/analyzer/callAnalyzer.js"(exports2, module2) {
    var { lineIndex, lineAt } = require_text();
    var CALLABLE = /* @__PURE__ */ new Set(["function", "method", "component", "hook"]);
    var SKIP_CALLEES = /* @__PURE__ */ new Set([
      "if",
      "for",
      "while",
      "switch",
      "catch",
      "function",
      "return",
      "typeof",
      "await",
      "new",
      "require",
      "import",
      "super",
      "console.log",
      "console.error",
      "console.warn",
      "Promise",
      "Promise.all",
      "Promise.resolve",
      "Promise.reject",
      "JSON.stringify",
      "JSON.parse",
      "Object.keys",
      "Object.values",
      "Object.entries",
      "Object.assign",
      "Array.isArray",
      "Array.from",
      "String",
      "Number",
      "Boolean",
      "parseInt",
      "parseFloat",
      "Math.round",
      "Math.floor",
      "Math.max",
      "Math.min",
      "Math.ceil",
      "setTimeout",
      "setInterval",
      "clearTimeout",
      "Date.now",
      "isNaN",
      "Error",
      "fetch",
      "useState",
      "useEffect",
      "useMemo",
      "useCallback",
      "useRef",
      "useContext",
      "useReducer"
    ]);
    var BUILTIN_RECEIVERS = /* @__PURE__ */ new Set(["console", "JSON", "Math", "Object", "Array", "Promise", "String", "Number", "Date", "res", "req", "response", "request", "window", "document", "process", "localStorage"]);
    var CALL_RE = /(?<![\w$.])((?:this\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/g;
    function isCallable(s) {
      return CALLABLE.has(s.type);
    }
    function innermost(symbols, line) {
      let best = null;
      for (const s of symbols) {
        if (!isCallable(s) || line < s.line || line > s.endLine) continue;
        if (!best || s.endLine - s.line <= best.endLine - best.line) best = s;
      }
      return best;
    }
    function extractCalls(codeLines, symbols) {
      for (const s of symbols) {
        if (!isCallable(s)) continue;
        const calls = [];
        for (let ln = s.line; ln <= Math.min(s.endLine, codeLines.length); ln++) {
          if (innermost(symbols, ln) !== s) continue;
          const text = codeLines[ln - 1];
          CALL_RE.lastIndex = 0;
          let m;
          while (m = CALL_RE.exec(text)) {
            let name = m[1];
            if (ln === s.line && (name === s.name || name.endsWith(`.${s.name}`))) continue;
            if (SKIP_CALLEES.has(name)) continue;
            const recv = name.split(".")[0];
            if (BUILTIN_RECEIVERS.has(recv)) continue;
            if (name.startsWith("this.")) name = name.slice(5) + "@this";
            calls.push({ name, line: ln });
          }
        }
        s.calls = calls;
        const body = codeLines.slice(s.line - 1, s.endLine).join("\n");
        s.flags = {
          responds: /\bres\.(json|send|status|render|redirect|end)\b|return\s+(?:Response|JsonResponse|response\()|jsonify\(|return\s+redirect|wp_send_json|NextResponse\./.test(body),
          handlesErrors: /\btry\s*\{|\.catch\(|\bcatch\s*\(|except\s+\w*|\bnext\(\s*(?:err|error)/.test(body),
          validates: /\b(validate|joi|yup|zod|schema\.parse|checkSchema|express-validator|sanitize)\w*\b|if\s*\(\s*!\w+/i.test(body),
          setsState: /\bset[A-Z]\w*\(|dispatch\(|\.setState\(/.test(body),
          navigates: /\b(navigate|router\.push|history\.push|redirect|window\.location)\b/.test(body)
        };
      }
    }
    function extractUiHandlers(code, symbols) {
      const starts = lineIndex(code);
      const out = [];
      const jsx = /\b(on[A-Z]\w*)\s*=\s*\{\s*(?:(?:async\s*)?\([^)]*\)\s*=>\s*\{?\s*(?:await\s+)?)?([A-Za-z_$][\w$.]*)/g;
      let m;
      while (m = jsx.exec(code)) {
        const line = lineAt(starts, m.index);
        out.push({ event: m[1], name: m[2], line, inSymbol: (innermost(symbols, line) || {}).name || null });
      }
      const vue = /(?:@|v-on:)([\w.-]+)\s*=\s*["']([A-Za-z_$][\w$.]*)/g;
      while (m = vue.exec(code)) out.push({ event: m[1], name: m[2], line: lineAt(starts, m.index), inSymbol: null });
      return out;
    }
    function routeBodyCalls(codeLines, range, symbols) {
      const calls = [];
      for (let ln = range.startLine; ln <= Math.min(range.endLine, codeLines.length); ln++) {
        if (innermost(symbols, ln) && innermost(symbols, ln).line > range.startLine) continue;
        CALL_RE.lastIndex = 0;
        let m;
        while (m = CALL_RE.exec(codeLines[ln - 1])) {
          if (SKIP_CALLEES.has(m[1]) || BUILTIN_RECEIVERS.has(m[1].split(".")[0])) continue;
          calls.push({ name: m[1], line: ln });
        }
      }
      return calls;
    }
    module2.exports = { extractCalls, extractUiHandlers, routeBodyCalls, innermost, isCallable };
  }
});

// src/analyzer/fileAnalyzer.js
var require_fileAnalyzer = __commonJS({
  "src/analyzer/fileAnalyzer.js"(exports2, module2) {
    var { stripComments } = require_text();
    var { analyzeSymbols } = require_symbolAnalyzer();
    var { analyzeImportsExports } = require_dependencyAnalyzer();
    var { analyzeRoutes } = require_routeAnalyzer();
    var { analyzeApiCalls, analyzeRealtimeAndGraphQL } = require_apiAnalyzer();
    var { analyzeDatabase } = require_databaseAnalyzer();
    var { analyzeAuth } = require_authAnalyzer();
    var { analyzeExternalServices } = require_externalServiceAnalyzer();
    var { analyzeEvents, isTestFile } = require_eventAnalyzer();
    var { analyzeState } = require_stateAnalyzer();
    var { analyzeBusinessLogic } = require_businessLogicAnalyzer();
    var { analyzeValidation } = require_validationAnalyzer();
    var { extractCalls, extractUiHandlers, routeBodyCalls } = require_callAnalyzer();
    var { extractEnvRefs } = require_environmentScanner();
    var { isSourceLanguage } = require_languageDetector();
    var EMPTY_DB = { technologies: [], entities: [], relationships: [], indexes: [], queries: [], ormCalls: [] };
    function analyzeFile({ path, language, hash, content }) {
      const isSource = isSourceLanguage(language);
      const base = { path, language, hash, isSource, lines: content.split("\n").length, isTest: isTestFile(path) };
      if (!isSource && !["sql", "prisma"].includes(language)) {
        return { ...base, symbols: [], imports: [], exports: [], routes: [], mounts: [], apiCalls: [], realtime: {}, database: EMPTY_DB, auth: [], externalServices: { services: [], hosts: [] }, events: {}, state: { libraries: [], localState: [] }, businessLogic: [], validation: [], envRefs: [], uiHandlers: [] };
      }
      const code = stripComments(content, language);
      const symbols = analyzeSymbols(code, language);
      const { imports, exports: exports3 } = analyzeImportsExports(code, language);
      const { routes, mounts } = analyzeRoutes(path, code, language);
      const isTest = base.isTest;
      const codeLines = code.split("\n");
      extractCalls(codeLines, symbols);
      for (const r of routes) if (r.bodyRange) r.calls = routeBodyCalls(codeLines, r.bodyRange, symbols);
      return {
        ...base,
        symbols,
        imports,
        exports: exports3,
        routes: isTest ? [] : routes,
        mounts,
        apiCalls: isTest ? [] : analyzeApiCalls(code, language),
        realtime: analyzeRealtimeAndGraphQL(code),
        database: analyzeDatabase(code, language, path),
        auth: analyzeAuth(code),
        externalServices: analyzeExternalServices(code),
        events: analyzeEvents(code),
        state: analyzeState(code),
        businessLogic: analyzeBusinessLogic(symbols, isTest),
        validation: analyzeValidation(code, language, isTest),
        envRefs: extractEnvRefs(code),
        uiHandlers: extractUiHandlers(code, symbols)
      };
    }
    module2.exports = { analyzeFile };
  }
});

// src/analyzer/architectureAnalyzer.js
var require_architectureAnalyzer = __commonJS({
  "src/analyzer/architectureAnalyzer.js"(exports2, module2) {
    var path = require("path");
    var ROLE_RULES = [
      { role: "test", re: /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$|(^|\/)test_\w+\.py$/ },
      { role: "migration", re: /(^|\/)(migrations?|seeds?)\// },
      { role: "model", re: /(^|\/)(models?|entities|schemas?)\/|\.(model|entity)\.[a-z]+$|Model\.[a-z]+$|(^|\/)(models?|schemas?|serializers?)\.py$|_models?\.(go|py)$/i },
      { role: "controller", re: /(^|\/)(controllers?|handlers?)\/|\.controller\.[a-z]+$|Controller\.[a-z]+$|(^|\/)views?\.py$|_views?\.py$|(^|\/|_)handlers?\.go$|_controllers?\.(go|py)$/i },
      { role: "route", re: /(^|\/)(routes?|routers?)\/|\.routes?\.[a-z]+$|Routes?\.[a-z]+$|(^|\/)pages\/api\/|(^|\/)app\/.*route\.[a-z]+$|(^|\/)urls\.py$|(^|\/|_)routes?\.(py|go)$|(^|\/|_)routers?\.(py|go)$/i },
      { role: "repository", re: /(^|\/)(repositor(y|ies)|dao)\/|Repository\.[a-z]+$|(^|\/|_)repositor(y|ies)\.(py|go)$/i },
      { role: "service", re: /(^|\/)(services?)\/|\.service\.[a-z]+$|Service\.[a-z]+$|(^|\/|_)services?\.(py|go)$/i },
      { role: "middleware", re: /(^|\/)middlewares?\/|\.middleware\.[a-z]+$|Middleware\.[a-z]+$|(^|\/|_)middlewares?\.(py|go)$/i },
      { role: "state", re: /(^|\/)(store|stores|state|redux|context|contexts)\/|(Slice|Store|Reducer|Context)\.[a-z]+$/i },
      { role: "hook", re: /(^|\/)hooks?\/|(^|\/)use[A-Z]\w*\.[jt]sx?$/ },
      { role: "component", re: /(^|\/)(components?|widgets?|views?)\/|\.(jsx|tsx|vue|svelte)$/ },
      { role: "page", re: /(^|\/)(pages|screens|app)\// },
      { role: "api-client", re: /(^|\/)(api|clients?)\/|Api\.[a-z]+$/i },
      { role: "util", re: /(^|\/)(utils?|helpers?|lib|common|shared)\// },
      { role: "config", re: /(^|\/)(config|configs)\/|\.config\.[a-z]+$|(^|\/)(config|settings)\.(go|py)$/i }
    ];
    function classifyRole(filePath) {
      for (const r of ROLE_RULES) if (r.re.test(filePath)) return r.role;
      return "other";
    }
    var ENTRY_NAMES = /^(index|main|app|server|manage|wsgi|asgi|program|application)\.[a-z]+$/i;
    function analyzeArchitecture({ fileAnalyses, scan, dependencies, dependents }) {
      const layers = {};
      for (const fa of fileAnalyses) {
        if (!fa.isSource) continue;
        const role = classifyRole(fa.path);
        (layers[role] ||= []).push(fa.path);
      }
      const entryPoints = [];
      for (const fa of fileAnalyses) {
        if (!fa.isSource) continue;
        const base = path.posix.basename(fa.path);
        const deps = (dependencies[fa.path] || {}).internal || [];
        const dependentsCount = (dependents[fa.path] || []).length;
        if (ENTRY_NAMES.test(base) && (dependentsCount === 0 || fa.path.split("/").length <= 2)) entryPoints.push({ path: fa.path, reason: "conventional entry filename", dependencies: deps.length, status: "INFERRED" });
      }
      for (const m of scan.packages.manifests) {
        if (m.kind === "package.json") {
        }
      }
      const frontend = (layers.component || []).length + (layers.page || []).length > 0;
      const backend = ["route", "controller", "service", "model", "repository"].some((r) => (layers[r] || []).length > 0);
      return {
        technologies: scan.packages.technologies,
        languages: scan.languages,
        layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.sort()])),
        tiers: { frontend, backend },
        entryPoints,
        config: scan.config
      };
    }
    module2.exports = { analyzeArchitecture, classifyRole };
  }
});

// src/analyzer/featureAnalyzer.js
var require_featureAnalyzer = __commonJS({
  "src/analyzer/featureAnalyzer.js"(exports2, module2) {
    var path = require("path");
    var { classifyRole } = require_architectureAnalyzer();
    var SUFFIX = /(Controller|Service|Model|Routes?|Router|Repository|Store|Slice|Reducer|Context|Page|Form|List|Card|View|Screen|Api|Client|Hook|Modal|Table|Container|Provider|Schema|Entity|Dto|Guard|Middleware|Handler)s?$/;
    var CONTAINERS = /* @__PURE__ */ new Set(["components", "pages", "features", "modules", "routes", "controllers", "services", "models", "views", "screens", "store", "stores", "hooks", "api", "apis", "app", "src", "lib", "server", "client", "backend", "frontend", "utils", "helpers", "entities", "repositories", "middleware", "middlewares", "handlers", "tests", "test", "__tests__", "internal", "pkg", "cmd", "handler", "routers", "router", "repository", "domain", "usecase", "usecases", "entity", "dto", "schemas", "serializers", "templates", "static", "migrations", "config", "common", "shared"]);
    function words(s) {
      s = s.replace(/[_-](controllers?|services?|models?|routes?|routers?|repositor(?:y|ies)|handlers?|views?|serializers?|schemas?|apis?|stores?|forms?|dto|entity|entities|tests?)(?=\.|$)/gi, "");
      return s.replace(/\.(test|spec)\.[a-z]+$/i, "").replace(/^test_/, "").replace(/\.[a-z]+$/i, "").replace(/^use(?=[A-Z])/, "").replace(SUFFIX, "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s.]+/g, "-").toLowerCase().replace(/^-|-$/g, "");
    }
    function featureKey(filePath) {
      const segs = filePath.split("/");
      const base = path.posix.basename(filePath);
      for (let i = 0; i < segs.length - 1; i++) {
        const s = segs[i].toLowerCase();
        if (CONTAINERS.has(s)) continue;
        return words(segs[i]);
      }
      const w = words(base);
      return w && !["index", "app", "main", "server"].includes(w) ? w : null;
    }
    var singular = (s) => s.replace(/ies$/, "y").replace(/s$/, "");
    function detectFeatures({ fileAnalyses, apis, queries, dependencies }) {
      const features = /* @__PURE__ */ new Map();
      const get = (key) => {
        const k = singular(key);
        if (!features.has(k)) features.set(k, { id: k, name: k, files: /* @__PURE__ */ new Set(), routes: /* @__PURE__ */ new Set(), apis: [], entities: /* @__PURE__ */ new Set(), tests: /* @__PURE__ */ new Set(), signals: /* @__PURE__ */ new Set() });
        return features.get(k);
      };
      for (const fa of fileAnalyses) {
        if (!fa.isSource) continue;
        const key = featureKey(fa.path);
        if (!key) continue;
        const f = get(key);
        f.files.add(fa.path);
        f.signals.add(classifyRole(fa.path));
        if (fa.isTest) f.tests.add(fa.path);
      }
      for (const a of apis) {
        const seg = a.endpoint.split("/").filter((x) => x && !["api", "v1", "v2", ":param", "wp-json"].includes(x) && !/^[:<{[]/.test(x.trim()) && !/[<>{}[\]]/.test(x))[0];
        if (!seg) continue;
        const f = get(seg);
        f.apis.push({ method: a.method, endpoint: a.endpoint, file: a.file, line: a.line });
        f.files.add(a.file);
        f.signals.add("api-group");
      }
      for (const fa of fileAnalyses) {
        if (!fa.isTest) continue;
        for (const d of (dependencies[fa.path] || {}).internal || []) {
          for (const f of features.values()) if (f.files.has(d.path)) {
            f.tests.add(fa.path);
            f.files.add(fa.path);
          }
        }
      }
      const entityByFile = {};
      for (const q of queries) if (q.entity) (entityByFile[q.file] ||= /* @__PURE__ */ new Set()).add(q.entity);
      for (const f of features.values()) {
        for (const file of f.files) for (const e of entityByFile[file] || []) f.entities.add(e);
        for (const file of [...f.files]) for (const d of (dependencies[file] || {}).internal || []) for (const e of entityByFile[d.path] || []) f.entities.add(e);
      }
      return [...features.values()].filter((f) => f.files.size >= 2 || f.apis.length).map((f) => ({
        id: f.id,
        name: f.name,
        status: "INFERRED",
        basis: [...f.signals].sort(),
        files: [...f.files].sort(),
        tests: [...f.tests].sort(),
        apis: f.apis,
        entities: [...f.entities].sort()
      })).sort((a, b) => a.id.localeCompare(b.id));
    }
    module2.exports = { detectFeatures };
  }
});

// src/database/dataFlowAnalyzer.js
var require_dataFlowAnalyzer = __commonJS({
  "src/database/dataFlowAnalyzer.js"(exports2, module2) {
    function entityKey(n) {
      return String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    }
    function singular(s) {
      return s.replace(/ies$/, "y").replace(/s$/, "");
    }
    function buildEntityIndex(entities) {
      const byKey = /* @__PURE__ */ new Map();
      for (const e of entities) {
        for (const k of [entityKey(e.name), entityKey(e.table), singular(entityKey(e.name)), singular(entityKey(e.table))]) {
          if (k) {
            if (!byKey.has(k)) byKey.set(k, e);
          }
        }
      }
      return byKey;
    }
    function matchEntity(index, name, entities) {
      if (entities) {
        const exact = entities.find((e) => e.name === name || e.table === name);
        if (exact) return exact;
      }
      const k = entityKey(name);
      return index.get(k) || index.get(singular(k)) || null;
    }
    function resolveQueries(fileAnalyses, entities) {
      const index = buildEntityIndex(entities);
      const queries = [];
      for (const fa of fileAnalyses) {
        const db = fa.database;
        if (!db) continue;
        for (const q of db.queries) {
          const e = q.entity ? matchEntity(index, q.entity, entities) : null;
          queries.push({ ...q, entity: e ? e.name : q.entity, entityKnown: !!e });
        }
        for (const c of db.ormCalls) {
          const e = matchEntity(index, c.receiver, entities);
          if (!e) continue;
          queries.push({ entity: e.name, entityKnown: true, operation: c.operation, kind: c.kind, line: c.line, orm: c.orm || (c.prisma ? "prisma" : "orm"), file: fa.path, status: "VERIFIED" });
        }
      }
      return queries;
    }
    function mapFilesToEntities(queries) {
      const map = {};
      for (const q of queries) {
        if (!q.entity) continue;
        const m = map[q.file] ||= { reads: /* @__PURE__ */ new Set(), writes: /* @__PURE__ */ new Set() };
        (q.kind === "write" ? m.writes : m.reads).add(q.entity);
      }
      return Object.fromEntries(Object.entries(map).map(([f, v]) => [f, { reads: [...v.reads].sort(), writes: [...v.writes].sort() }]));
    }
    function buildDataFlows(workflows) {
      return workflows.map((w) => ({
        workflowId: w.id,
        entry: w.trigger,
        api: w.api || null,
        reads: [...new Set(w.steps.filter((s) => s.kind === "db-read").map((s) => s.entity))],
        writes: [...new Set(w.steps.filter((s) => s.kind === "db-write").map((s) => s.entity))],
        status: w.status
      })).filter((f) => f.reads.length || f.writes.length);
    }
    module2.exports = { buildEntityIndex, matchEntity, resolveQueries, mapFilesToEntities, buildDataFlows };
  }
});

// src/workflows/workflowGraph.js
var require_workflowGraph = __commonJS({
  "src/workflows/workflowGraph.js"(exports2, module2) {
    var { resolveImport } = require_dependencyAnalyzer();
    var { isCallable, innermost } = require_callAnalyzer();
    var nodeId = (file, name, className) => `${file}#${className ? className + "." : ""}${name}`;
    var WorkflowGraph = class {
      constructor(fileAnalyses) {
        this.files = new Map(fileAnalyses.map((f) => [f.path, f]));
        this.fileSet = new Set(this.files.keys());
        this.nodes = /* @__PURE__ */ new Map();
        this.edges = /* @__PURE__ */ new Map();
        this.reverse = /* @__PURE__ */ new Map();
        this.byName = /* @__PURE__ */ new Map();
        this._build();
      }
      _build() {
        for (const fa of this.files.values()) {
          for (const s of fa.symbols) {
            if (!isCallable(s)) continue;
            const id = nodeId(fa.path, s.name, s.className);
            this.nodes.set(id, { id, file: fa.path, name: s.name, className: s.className || null, symbol: s });
            (this.byName.get(s.name) || this.byName.set(s.name, []).get(s.name)).push(id);
          }
        }
        for (const node of this.nodes.values()) {
          const fa = this.files.get(node.file);
          const out = [];
          for (const call of node.symbol.calls || []) {
            const r = this.resolveCall(fa, call.name, node);
            if (r && r.id !== node.id) out.push({ to: r.id, via: call.name, line: call.line, status: r.status });
          }
          this.edges.set(node.id, out);
          for (const e of out) (this.reverse.get(e.to) || this.reverse.set(e.to, []).get(e.to)).push({ from: node.id, line: e.line, status: e.status });
        }
      }
      findInFile(file, name, className) {
        const id = nodeId(file, name, className);
        if (this.nodes.has(id)) return id;
        const fa = this.files.get(file);
        if (!fa) return null;
        const s = fa.symbols.find((x) => isCallable(x) && x.name === name);
        return s ? nodeId(file, s.name, s.className) : null;
      }
      importFor(fa, ident) {
        return fa.imports.find((i) => i.default === ident || i.namespace === ident || i.names.some((n) => n.local === ident));
      }
      resolveCall(fa, rawName, fromNode) {
        let name = rawName;
        const isThis = name.endsWith("@this");
        if (isThis) name = name.slice(0, -5);
        const parts = name.split(".");
        if (isThis) {
          const id = this.findInFile(fa.path, parts[0], fromNode.className);
          return id ? { id, status: "VERIFIED" } : null;
        }
        if (parts.length === 1) {
          const local = this.findInFile(fa.path, name);
          if (local) return { id: local, status: "VERIFIED" };
          const imp = this.importFor(fa, name);
          if (imp) {
            const target = resolveImport(fa.path, imp, fa.language, this.fileSet);
            if (target) {
              const binding = imp.names.find((n) => n.local === name);
              const importedName = binding ? binding.imported : name;
              const id = this.findInFile(target, importedName) || (imp.default === name ? this._defaultExport(target) : null);
              if (id) return { id, status: "VERIFIED" };
            }
            return null;
          }
        } else {
          const [recv, member] = parts;
          const imp = this.importFor(fa, recv);
          if (imp) {
            const target = resolveImport(fa.path, imp, fa.language, this.fileSet);
            if (target) {
              const id = this.findInFile(target, member) || this._methodInFile(target, member, recv);
              if (id) return { id, status: "VERIFIED" };
            }
            return null;
          }
          const localMethod = this.findInFile(fa.path, member, recv);
          if (localMethod && this.nodes.has(nodeId(fa.path, member, recv))) return { id: localMethod, status: "VERIFIED" };
          return null;
        }
        const cands = this.byName.get(name) || [];
        if (cands.length === 1) return { id: cands[0], status: "INFERRED" };
        return null;
      }
      _defaultExport(file) {
        const fa = this.files.get(file);
        const d = fa && fa.exports.find((e) => e.kind === "default" || e.kind === "cjs-default");
        return d ? this.findInFile(file, d.name) : null;
      }
      _methodInFile(file, member) {
        const fa = this.files.get(file);
        const s = fa && fa.symbols.find((x) => x.type === "method" && x.name === member);
        return s ? nodeId(file, s.name, s.className) : null;
      }
      // Resolve a route handler reference (e.g. "orderController.createOrder") from the route file.
      resolveHandler(routeFile, handlerName) {
        const fa = this.files.get(routeFile);
        if (!fa || !handlerName) return null;
        const fake = { id: null, className: null };
        return this.resolveCall(fa, handlerName, fake);
      }
      enclosing(file, line) {
        const fa = this.files.get(file);
        if (!fa) return null;
        const s = innermost(fa.symbols, line);
        return s ? nodeId(file, s.name, s.className) : null;
      }
      callers(id) {
        return this.reverse.get(id) || [];
      }
      callees(id) {
        return this.edges.get(id) || [];
      }
    };
    module2.exports = { WorkflowGraph, nodeId };
  }
});

// src/workflows/workflowTracer.js
var require_workflowTracer = __commonJS({
  "src/workflows/workflowTracer.js"(exports2, module2) {
    var { classifyRole } = require_architectureAnalyzer();
    var { resolveImport } = require_dependencyAnalyzer();
    var unresolved = (s) => (s.status === "INFERRED" || s.status === "UNKNOWN") && !s.basis;
    function slug(s) {
      return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    var WorkflowTracer = class {
      constructor({ graph, project, maxDepth = 8 }) {
        this.g = graph;
        this.project = project;
        this.maxDepth = maxDepth;
        this.queriesByFile = /* @__PURE__ */ new Map();
        for (const q of project.queries) (this.queriesByFile.get(q.file) || this.queriesByFile.set(q.file, []).get(q.file)).push(q);
      }
      stepKindFor(file) {
        const role = classifyRole(file);
        return { service: "service", controller: "controller", repository: "repository", model: "model", middleware: "middleware", component: "frontend", page: "frontend", hook: "frontend", state: "state", "api-client": "frontend-service" }[role] || "logic";
      }
      symbolStep(id, status, extra = {}) {
        const n = this.g.nodes.get(id);
        return { kind: this.stepKindFor(n.file), file: n.file, symbol: n.className ? `${n.className}.${n.name}` : n.name, line: n.symbol.line, endLine: n.symbol.endLine, status, ...extra };
      }
      // DB/external evidence inside a symbol's line range.
      evidenceSteps(id) {
        const n = this.g.nodes.get(id);
        const steps = [];
        for (const q of this.queriesByFile.get(n.file) || []) {
          if (q.line < n.symbol.line || q.line > n.symbol.endLine || !q.entity) continue;
          if (q.kind === "transaction") {
            steps.push({ kind: "transaction", file: n.file, symbol: n.name, line: q.line, status: "VERIFIED" });
            continue;
          }
          steps.push({ kind: q.kind === "write" ? "db-write" : "db-read", entity: q.entity, operation: q.operation, orm: q.orm, file: n.file, symbol: n.name, line: q.line, status: q.entityKnown ? "VERIFIED" : "INFERRED" });
        }
        const fa = this.g.files.get(n.file);
        for (const s of fa.externalServices.services) {
          const inRange = (s.lines || [s.line]).filter((l) => l >= n.symbol.line && l <= n.symbol.endLine);
          if (inRange.length && !/Analytics/.test(s.name)) steps.push({ kind: "external-service", service: s.name, file: n.file, symbol: n.name, line: inRange[0], status: "VERIFIED" });
        }
        for (const a of fa.auth) {
          if (a.type === "authorization" && a.line >= n.symbol.line && a.line <= n.symbol.endLine) steps.push({ kind: "security-check", check: a.kind, file: n.file, symbol: n.name, line: a.line, status: "VERIFIED" });
        }
        return steps;
      }
      // BFS downward from a handler node. Returns ordered steps (dedup, depth-bounded).
      traceDown(startId, startStatus = "VERIFIED") {
        const steps = [];
        const seen = /* @__PURE__ */ new Set([startId]);
        let queue = [{ id: startId, status: startStatus, depth: 0 }];
        while (queue.length) {
          const next = [];
          for (const cur of queue) {
            steps.push(this.symbolStep(cur.id, cur.status, { depth: cur.depth }));
            steps.push(...this.evidenceSteps(cur.id));
            if (cur.depth >= this.maxDepth) continue;
            for (const e of this.g.callees(cur.id)) {
              if (seen.has(e.to)) continue;
              seen.add(e.to);
              next.push({ id: e.to, status: e.status === "INFERRED" || cur.status === "INFERRED" ? "INFERRED" : "VERIFIED", depth: cur.depth + 1 });
            }
          }
          queue = next;
        }
        return steps;
      }
      // Shortest caller chain from `fromId` up to a node that has a UI binding or no callers.
      traceUp(startId) {
        const chain = [startId];
        const seen = /* @__PURE__ */ new Set([startId]);
        let cur = startId;
        for (let i = 0; i < this.maxDepth; i++) {
          const bound = this.uiBindingFor(cur);
          if (bound) return { chain, trigger: bound };
          const callers = this.g.callers(cur).filter((c2) => !seen.has(c2.from));
          if (!callers.length) break;
          const c = callers[0];
          seen.add(c.from);
          chain.unshift(c.from);
          cur = c.from;
        }
        return { chain, trigger: this.uiBindingFor(cur) };
      }
      uiBindingFor(id) {
        const n = this.g.nodes.get(id);
        for (const fa of this.g.files.values()) {
          for (const h of fa.uiHandlers || []) {
            const parts = h.name.split(".");
            if (parts[parts.length - 1] !== n.name) continue;
            if (fa.path === n.file) return { event: h.event, file: fa.path, line: h.line, inSymbol: h.inSymbol };
            const imp = this.g.importFor(fa, parts[0]);
            if (imp && resolveImport(fa.path, imp, fa.language, this.g.fileSet) === n.file) return { event: h.event, file: fa.path, line: h.line, inSymbol: h.inSymbol };
          }
        }
        return null;
      }
      // Full-stack workflow for a client->route link.
      traceApiLink(link) {
        const steps = [];
        let status = "VERIFIED";
        const callerId = this.g.enclosing(link.from.file, link.from.line);
        let trigger = { type: "API_CALL", file: link.from.file, line: link.from.line };
        if (callerId) {
          const up = this.traceUp(callerId);
          if (up.trigger) {
            trigger = { type: "UI_EVENT", event: up.trigger.event, file: up.trigger.file, line: up.trigger.line, component: up.trigger.inSymbol };
            steps.push({ kind: "trigger", event: up.trigger.event, file: up.trigger.file, symbol: up.trigger.inSymbol, line: up.trigger.line, status: "VERIFIED" });
          }
          up.chain.forEach((id, i) => {
            const step = this.symbolStep(id, "VERIFIED", { phase: "frontend" });
            steps.push(step);
            if (this.g.nodes.get(id).symbol.flags?.setsState) steps.push({ kind: "state-change", file: step.file, symbol: step.symbol, line: step.line, status: "INFERRED", basis: "state setter/dispatch call in body" });
            if (i === up.chain.length - 1) return;
          });
        }
        steps.push({ kind: "api-call", method: link.method, endpoint: link.path, client: link.from.client, file: link.from.file, line: link.from.line, status: "VERIFIED" });
        steps.push({ kind: "route", method: link.route.method, endpoint: link.route.endpoint, file: link.route.file, line: link.route.line, status: "VERIFIED" });
        steps.push(...this.traceRouteHandler(link.route, (s) => {
          if (s === "INFERRED") status = "PARTIAL";
        }));
        if (steps.some(unresolved)) status = "PARTIAL";
        return { steps, trigger, status, api: { method: link.method, endpoint: link.path } };
      }
      traceRouteHandler(route, onStatus = () => {
      }) {
        const full = this.project.apis.find((a) => a.file === route.file && a.line === route.line && a.endpoint === route.endpoint) || route;
        const steps = [];
        for (const mw of full.middleware || []) {
          const r = this.g.resolveHandler(full.file, mw);
          if (r) steps.push(this.symbolStep(r.id, r.status, { kind: "middleware", depth: 0 }), ...this.evidenceSteps(r.id));
        }
        if (full.inline && full.calls) {
          steps.push({ kind: "controller", file: full.file, symbol: "(inline handler)", line: full.bodyRange.startLine, endLine: full.bodyRange.endLine, status: "VERIFIED" });
          const fa = this.g.files.get(full.file);
          for (const c of full.calls) {
            const r = this.g.resolveCall(fa, c.name, { id: null, className: null });
            if (r) steps.push(...this.traceDown(r.id, r.status));
          }
          for (const q of this.queriesByFile.get(full.file) || []) {
            if (q.line >= full.bodyRange.startLine && q.line <= full.bodyRange.endLine && q.entity) steps.push({ kind: q.kind === "write" ? "db-write" : "db-read", entity: q.entity, operation: q.operation, orm: q.orm, file: full.file, symbol: "(inline handler)", line: q.line, status: q.entityKnown ? "VERIFIED" : "INFERRED" });
          }
        } else if (full.handler) {
          const r = this.g.resolveHandler(full.file, full.handler);
          if (r) {
            onStatus(r.status);
            steps.push(...this.traceDown(r.id, r.status).map((s, i) => i === 0 ? { ...s, kind: "controller" } : s));
          } else {
            steps.push({ kind: "controller", file: full.file, symbol: full.handler, line: full.line, status: "UNKNOWN", note: "Handler could not be resolved to a source symbol." });
            onStatus("INFERRED");
          }
        }
        const responds = (s) => s.file && this.g.nodes.get(`${s.file}#${s.symbol}`)?.symbol.flags?.responds;
        const responder = steps.find((s) => s.kind === "controller" && responds(s)) || steps.find((s) => s.kind !== "middleware" && responds(s));
        if (responder) steps.push({ kind: "response", file: responder.file, symbol: responder.symbol, line: responder.line, status: "INFERRED", basis: "response call in handler body" });
        return steps;
      }
      // Backend-only workflow (route with no matched client call).
      traceRoute(route) {
        const steps = [{ kind: "route", method: route.method, endpoint: route.endpoint, file: route.file, line: route.line, status: "VERIFIED" }];
        let status = "VERIFIED";
        steps.push(...this.traceRouteHandler(route, (s) => {
          if (s === "INFERRED") status = "PARTIAL";
        }));
        if (steps.some(unresolved)) status = "PARTIAL";
        return { steps, trigger: { type: "HTTP_REQUEST", method: route.method, endpoint: route.endpoint, file: route.file, line: route.line }, status, api: { method: route.method, endpoint: route.endpoint } };
      }
    };
    module2.exports = { WorkflowTracer, slug };
  }
});

// src/workflows/workflowEngine.js
var require_workflowEngine = __commonJS({
  "src/workflows/workflowEngine.js"(exports2, module2) {
    var { WorkflowGraph } = require_workflowGraph();
    var { WorkflowTracer, slug } = require_workflowTracer();
    var { buildDataFlows } = require_dataFlowAnalyzer();
    function uniqueId(base, used) {
      let id = base || "workflow";
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      return id;
    }
    function summarize(w) {
      const entities = (kind) => [...new Set(w.steps.filter((s) => s.kind === kind).map((s) => s.entity))];
      return {
        files: [...new Set(w.steps.filter((s) => s.file).map((s) => s.file))],
        apiCalls: w.steps.filter((s) => s.kind === "api-call").map((s) => `${s.method} ${s.endpoint}`),
        databaseReads: entities("db-read"),
        databaseWrites: entities("db-write"),
        externalServices: [...new Set(w.steps.filter((s) => s.kind === "external-service").map((s) => s.service))]
      };
    }
    function discoverWorkflows({ fileAnalyses, apis, apiLinks, queries, maxDepth = 8 }) {
      const graph = new WorkflowGraph(fileAnalyses);
      const tracer = new WorkflowTracer({ graph, project: { fileAnalyses, queries, apiLinks, apis }, maxDepth });
      const used = /* @__PURE__ */ new Set();
      const workflows = [];
      const tracedRoutes = /* @__PURE__ */ new Set();
      for (const link of apiLinks) {
        const traced = tracer.traceApiLink(link);
        const key = `${link.route.file}:${link.route.line}`;
        tracedRoutes.add(key);
        const id = uniqueId(slug(`${traced.trigger.type === "UI_EVENT" ? (traced.trigger.component || "") + " " : ""}${link.method} ${link.path}`), used);
        workflows.push({ id, name: `${link.method} ${link.path}`, purpose: null, trigger: traced.trigger, api: traced.api, steps: traced.steps, status: traced.status, unknowns: ["Purpose and business intent are not derivable from static analysis alone."] });
      }
      for (const r of apis) {
        if (tracedRoutes.has(`${r.file}:${r.line}`)) continue;
        const traced = tracer.traceRoute(r);
        const id = uniqueId(slug(`${r.method} ${r.endpoint}`), used);
        workflows.push({ id, name: `${r.method} ${r.endpoint}`, purpose: null, trigger: traced.trigger, api: traced.api, steps: traced.steps, status: traced.status, unknowns: ["No frontend caller was found for this endpoint."] });
      }
      for (const w of workflows) {
        w.summary = summarize(w);
        w.analyzedFrom = "STATIC_ANALYSIS";
      }
      return { workflows, dataFlows: buildDataFlows(workflows), graph };
    }
    module2.exports = { discoverWorkflows };
  }
});

// src/analyzer/projectAnalyzer.js
var require_projectAnalyzer = __commonJS({
  "src/analyzer/projectAnalyzer.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { analyzeFile } = require_fileAnalyzer();
    var { buildDependencies } = require_dependencyAnalyzer();
    var { buildDependents } = require_reverseDependencyAnalyzer();
    var { resolveRoutes, matchCallsToRoutes } = require_apiAnalyzer();
    var { analyzeArchitecture } = require_architectureAnalyzer();
    var { detectFeatures } = require_featureAnalyzer();
    var { resolveQueries, mapFilesToEntities } = require_dataFlowAnalyzer();
    var { discoverWorkflows } = require_workflowEngine();
    var { mapLimit } = require_fileScanner();
    var { isSourceLanguage } = require_languageDetector();
    var logger2 = require_logger();
    var MAX_ANALYZE_BYTES = 1024 * 1024;
    function shouldAnalyze(f) {
      return !f.binary && f.size <= MAX_ANALYZE_BYTES && (isSourceLanguage(f.language) || ["sql", "prisma"].includes(f.language));
    }
    async function analyzeProject(root, scan, options = {}) {
      const { cache = /* @__PURE__ */ new Map(), maxWorkflowDepth = 8, concurrency = 16 } = options;
      const started = Date.now();
      let reused = 0;
      const analyses = (await mapLimit(scan.files.filter(shouldAnalyze), concurrency, async (f) => {
        const hit = cache.get(f.path);
        if (hit && hit.hash === f.hash && hit.analysis.validation !== void 0) {
          reused++;
          return hit.analysis;
        }
        try {
          const content = await fs.promises.readFile(path.join(root, f.path), "utf8");
          return analyzeFile({ path: f.path, language: f.language, hash: f.hash, content });
        } catch (err) {
          logger2.warn("ANALYSIS", "file analysis failed", { path: f.path, error: err.code || err.message });
          return null;
        }
      })).filter(Boolean);
      const fileSet = new Set(scan.files.map((f) => f.path));
      const dependencies = buildDependencies(analyses, fileSet);
      const dependents = buildDependents(dependencies);
      const apis = resolveRoutes(analyses, dependencies);
      const apiLinks = matchCallsToRoutes(analyses, apis);
      const entities = [];
      const relationships = [];
      const indexes = [];
      const technologies = /* @__PURE__ */ new Map();
      for (const a of analyses) {
        entities.push(...a.database.entities);
        relationships.push(...a.database.relationships);
        indexes.push(...a.database.indexes);
        for (const t of a.database.technologies) (technologies.get(t.name) || technologies.set(t.name, []).get(t.name)).push({ file: t.file, line: t.line });
      }
      const queries = resolveQueries(analyses, entities);
      const fileEntities = mapFilesToEntities(queries);
      const entityNames = new Set(entities.map((e) => e.name.toLowerCase()));
      const verifiedRelationships = relationships.map((r) => ({ ...r, status: entityNames.has(String(r.to).toLowerCase()) && entityNames.has(String(r.from).toLowerCase()) ? "VERIFIED" : "INFERRED" }));
      const { workflows, dataFlows, graph } = discoverWorkflows({ fileAnalyses: analyses, apis, apiLinks, queries, maxDepth: maxWorkflowDepth });
      const features = detectFeatures({ fileAnalyses: analyses, apis, queries, dependencies });
      const architecture = analyzeArchitecture({ fileAnalyses: analyses, scan, dependencies, dependents });
      const auth = analyses.filter((a) => a.auth.length).map((a) => ({ file: a.path, items: a.auth }));
      const externalServices = {};
      for (const a of analyses) for (const s of a.externalServices.services) (externalServices[s.name] ||= []).push({ file: a.path, line: s.line });
      const stateManagement = analyses.filter((a) => a.state.libraries.length).map((a) => ({ file: a.path, libraries: a.state.libraries.map((l) => l.library) }));
      const businessLogic = analyses.filter((a) => a.businessLogic.length).map((a) => ({ file: a.path, rules: a.businessLogic }));
      const validation = analyses.filter((a) => a.validation && a.validation.length).map((a) => ({ file: a.path, items: a.validation }));
      const events = analyses.filter((a) => a.events.events && (a.events.events.length || a.events.queues.length || a.events.jobs.length || a.events.webhooks.length)).map((a) => ({ file: a.path, ...a.events }));
      logger2.info("ANALYSIS", "project analysis complete", { files: analyses.length, reused, workflows: workflows.length, apis: apis.length });
      return {
        analyzedAt: (/* @__PURE__ */ new Date()).toISOString(),
        durationMs: Date.now() - started,
        reusedFromCache: reused,
        files: analyses,
        dependencies,
        dependents,
        apis,
        apiLinks,
        database: {
          technologies: [...technologies.entries()].map(([name, evidence]) => ({ name, evidence: evidence.slice(0, 5) })),
          entities,
          relationships: verifiedRelationships,
          indexes,
          queries,
          fileEntities,
          dataFlows
        },
        workflows,
        features,
        architecture,
        auth,
        externalServices,
        stateManagement,
        businessLogic,
        validation,
        events,
        graph
      };
    }
    module2.exports = { analyzeProject };
  }
});

// src/context/contextSelector.js
var require_contextSelector = __commonJS({
  "src/context/contextSelector.js"(exports2, module2) {
    var { normalizeRelative } = require_paths();
    var MODES = ["FILE", "FOLDER", "FEATURE", "WORKFLOW", "DATABASE", "PROJECT", "DOCUMENTATION", "COMPARISON", "BLUEPRINT"];
    var under = (p, folder) => p === folder || p.startsWith(folder.replace(/\/$/, "") + "/");
    function selectFiles({ mode, selection = {}, analysis, files }) {
      const all = files.filter((f) => !f.binary && f.isSource);
      const set = /* @__PURE__ */ new Set();
      const notes = [];
      const known = new Set(files.map((f) => f.path));
      for (const raw of selection.files || []) {
        const p = normalizeRelative(raw);
        if (known.has(p)) set.add(p);
        else notes.push(`file not in project index: ${raw}`);
      }
      for (const raw of selection.folders || []) {
        const folder = normalizeRelative(raw).replace(/\/$/, "");
        const hits = all.filter((f) => under(f.path, folder));
        if (!hits.length) notes.push(`no source files under folder: ${raw}`);
        hits.forEach((f) => set.add(f.path));
      }
      for (const id of selection.features || []) {
        const f = analysis.features.find((x) => x.id === id);
        if (!f) {
          notes.push(`unknown feature: ${id}`);
          continue;
        }
        f.files.forEach((p) => known.has(p) && set.add(p));
      }
      for (const id of selection.workflows || []) {
        const w = analysis.workflows.find((x) => x.id === id);
        if (!w) {
          notes.push(`unknown workflow: ${id}`);
          continue;
        }
        w.summary.files.forEach((p) => known.has(p) && set.add(p));
      }
      for (const name of selection.entities || []) {
        const e = analysis.database.entities.find((x) => x.name === name);
        if (!e) {
          notes.push(`unknown database entity: ${name}`);
          continue;
        }
        if (e.file) set.add(e.file);
        for (const q of analysis.database.queries) if (q.entity === name) set.add(q.file);
      }
      for (const key of selection.apis || []) {
        const a = analysis.apis.find((x) => `${x.method} ${x.endpoint}` === key);
        if (!a) {
          notes.push(`unknown API: ${key}`);
          continue;
        }
        set.add(a.file);
      }
      if (mode === "PROJECT" || selection.project) all.forEach((f) => set.add(f.path));
      if (mode === "DATABASE" && !(selection.entities || []).length && !set.size) {
        for (const e of analysis.database.entities) if (e.file) set.add(e.file);
        for (const q of analysis.database.queries) set.add(q.file);
      }
      return { files: [...set].sort(), notes };
    }
    module2.exports = { selectFiles, MODES };
  }
});

// src/context/dependencyContext.js
var require_dependencyContext = __commonJS({
  "src/context/dependencyContext.js"(exports2, module2) {
    var { traverse } = require_reverseDependencyAnalyzer();
    function dependencyContext(primary, analysis, { depth = 2, includeDependents = true } = {}) {
      const graph = { dependencies: analysis.dependencies, dependents: analysis.dependents };
      const out = /* @__PURE__ */ new Map();
      const primarySet = new Set(primary);
      for (const p of primary) {
        for (const d of traverse(graph, p, "dependencies", depth)) {
          if (primarySet.has(d.path)) continue;
          const cur = out.get(d.path);
          if (!cur || d.depth < cur.depth) out.set(d.path, { path: d.path, reason: "dependency", depth: d.depth, priority: 1 + d.depth });
        }
        if (includeDependents) for (const d of traverse(graph, p, "dependents", 1)) {
          if (primarySet.has(d.path) || out.has(d.path)) continue;
          out.set(d.path, { path: d.path, reason: "dependent", depth: 1, priority: 2 });
        }
      }
      return [...out.values()].sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
    }
    module2.exports = { dependencyContext };
  }
});

// src/context/workflowContext.js
var require_workflowContext = __commonJS({
  "src/context/workflowContext.js"(exports2, module2) {
    function workflowContext(filePaths, analysis) {
      const set = new Set(filePaths);
      return analysis.workflows.filter((w) => w.summary.files.some((f) => set.has(f))).map((w) => ({ id: w.id, name: w.name, status: w.status, trigger: w.trigger, api: w.api, steps: w.steps.map((s) => ({ kind: s.kind, file: s.file, symbol: s.symbol, line: s.line, entity: s.entity, status: s.status })), summary: w.summary }));
    }
    module2.exports = { workflowContext };
  }
});

// src/context/databaseContext.js
var require_databaseContext = __commonJS({
  "src/context/databaseContext.js"(exports2, module2) {
    function databaseContext(filePaths, analysis) {
      const set = new Set(filePaths);
      const db = analysis.database;
      const names = /* @__PURE__ */ new Set();
      for (const e of db.entities) if (e.file && set.has(e.file)) names.add(e.name);
      for (const q of db.queries) if (set.has(q.file) && q.entity) names.add(q.entity);
      const entities = db.entities.filter((e) => names.has(e.name));
      const lower = new Set([...names].map((n) => n.toLowerCase()));
      return {
        technologies: db.technologies.map((t) => t.name),
        entities: entities.map((e) => ({ name: e.name, kind: e.kind, source: e.source, file: e.file, fields: e.fields })),
        relationships: db.relationships.filter((r) => lower.has(String(r.from).toLowerCase()) || lower.has(String(r.to).toLowerCase())).map((r) => ({ from: r.from, to: r.to, type: r.type, via: r.via, status: r.status, file: r.file })),
        queries: db.queries.filter((q) => set.has(q.file)).map((q) => ({ entity: q.entity, operation: q.operation, kind: q.kind, file: q.file, line: q.line, orm: q.orm }))
      };
    }
    module2.exports = { databaseContext };
  }
});

// src/context/featureContext.js
var require_featureContext = __commonJS({
  "src/context/featureContext.js"(exports2, module2) {
    function featureContext(filePaths, analysis) {
      const set = new Set(filePaths);
      return analysis.features.filter((f) => f.files.some((p) => set.has(p))).map((f) => ({ id: f.id, name: f.name, status: f.status, files: f.files, apis: f.apis, entities: f.entities, tests: f.tests }));
    }
    module2.exports = { featureContext };
  }
});

// src/context/projectContext.js
var require_projectContext = __commonJS({
  "src/context/projectContext.js"(exports2, module2) {
    function projectContext(project, analysis, scan) {
      return {
        projectId: project.projectId,
        name: project.name,
        technologies: analysis.architecture.technologies.map((t) => t.name),
        languages: analysis.architecture.languages,
        tiers: analysis.architecture.tiers,
        layers: Object.fromEntries(Object.entries(analysis.architecture.layers).map(([k, v]) => [k, v.length])),
        entryPoints: analysis.architecture.entryPoints.map((e) => e.path),
        totals: { files: scan ? scan.totals.files : void 0, apis: analysis.apis.length, workflows: analysis.workflows.length, features: analysis.features.length, entities: analysis.database.entities.length }
      };
    }
    module2.exports = { projectContext };
  }
});

// src/context/contextReducer.js
var require_contextReducer = __commonJS({
  "src/context/contextReducer.js"(exports2, module2) {
    var { estimateTokens } = require_tokenEstimator();
    function truncateFile(content, maxLines, maxTokens) {
      let lines = content.split("\n");
      let truncated = false;
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        truncated = true;
      }
      let text = lines.join("\n");
      while (estimateTokens(text) > maxTokens && lines.length > 10) {
        lines = lines.slice(0, Math.floor(lines.length * 0.8));
        text = lines.join("\n");
        truncated = true;
      }
      if (truncated) text += "\n/* [TRUNCATED by AI Project Intelligence: file exceeds configured limits] */";
      return { text, truncated, keptLines: lines.length };
    }
    function reduceContext(items, limits) {
      const kept = [];
      const omitted = [];
      let totalTokens = 0;
      let totalLines = 0;
      for (const it of items) {
        if (kept.length >= limits.maxFiles) {
          omitted.push({ path: it.path, reason: "maxFiles reached" });
          continue;
        }
        const t = truncateFile(it.content, limits.maxLinesPerFile, limits.maxTokensPerFile);
        const tokens = estimateTokens(t.text);
        if (totalTokens + tokens > limits.maxTotalTokens) {
          omitted.push({ path: it.path, reason: "maxTotalTokens reached" });
          continue;
        }
        if (totalLines + t.keptLines > limits.maxTotalLines) {
          omitted.push({ path: it.path, reason: "maxTotalLines reached" });
          continue;
        }
        totalTokens += tokens;
        totalLines += t.keptLines;
        kept.push({ ...it, content: t.text, truncated: t.truncated, lines: t.keptLines, tokens });
      }
      return { kept, omitted, totalTokens, totalLines };
    }
    module2.exports = { reduceContext, truncateFile };
  }
});

// src/security/secretDetector.js
var require_secretDetector = __commonJS({
  "src/security/secretDetector.js"(exports2, module2) {
    var REDACTED = "[REDACTED_SECRET]";
    var RULES = [
      { type: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, whole: true },
      { type: "aws-access-key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, whole: true },
      { type: "aws-secret-key", re: /(aws_?secret_?access_?key["'\s:=]+)["']?([A-Za-z0-9/+=]{40})["']?/gi, group: 2 },
      { type: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, whole: true },
      { type: "stripe-key", re: /\b(?:sk|rk|pk_live|whsec)_(?:live_|test_)?[A-Za-z0-9]{16,}\b/g, whole: true },
      { type: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, whole: true },
      { type: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, whole: true },
      { type: "google-api-key", re: /\bAIza[0-9A-Za-z_-]{35}\b/g, whole: true },
      { type: "sendgrid-key", re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, whole: true },
      { type: "db-connection-credentials", re: /\b((?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp):\/\/[^:/\s"']+:)([^@\s"']{3,})(@)/gi, group: 2 },
      { type: "bearer-token", re: /(\bBearer\s+)([A-Za-z0-9._~+/=-]{20,})/g, group: 2 },
      { type: "oauth-client-secret", re: /((?:client[_-]?secret|oauth[_-]?secret|consumer[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{8,})["']/gi, group: 2 },
      { type: "webhook-secret", re: /((?:webhook[_-]?secret|signing[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{8,})["']/gi, group: 2 },
      { type: "jwt-secret", re: /((?:jwt[_-]?secret|secret[_-]?key|session[_-]?secret)["'\s]*[:=]\s*)["']([^"'\s]{6,})["']/gi, group: 2 },
      { type: "password", re: /((?:password|passwd|pwd|db[_-]?pass(?:word)?)["'\s]*[:=]\s*)["']([^"'\s]{4,})["']/gi, group: 2 },
      { type: "api-key", re: /((?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret)["'\s]*[:=]\s*)["']([A-Za-z0-9_\-./+=]{12,})["']/gi, group: 2 }
    ];
    function isEnvFile(file) {
      return /(^|\/)\.env(\..*)?$/.test(file || "") && !/\.env\.(example|sample|template)$/.test(file || "");
    }
    function lineOf(text, index) {
      let n = 1;
      for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
      return n;
    }
    function redact(text, file = "") {
      const findings = [];
      if (isEnvFile(file)) {
        const out2 = text.split("\n").map((ln, i) => {
          const m = /^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)(.*)$/.exec(ln);
          if (!m || m[2].trim() === "") return ln;
          findings.push({ type: "env-value", line: i + 1 });
          return m[1] + REDACTED;
        });
        return { text: out2.join("\n"), findings };
      }
      const ranges = [];
      for (const rule of RULES) {
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
      for (let i = merged.length - 1; i >= 0; i--) {
        const r = merged[i];
        out = out.slice(0, r.start) + REDACTED + out.slice(r.end);
      }
      for (const r of merged) findings.push({ type: r.type, line: lineOf(text, r.start) });
      findings.sort((a, b) => a.line - b.line);
      return { text: out, findings };
    }
    function detectSecrets(text, file = "") {
      return redact(text, file).findings;
    }
    function redactDeep(value, file = "") {
      const findings = [];
      const walk = (v) => {
        if (typeof v === "string") {
          const r = redact(v, file);
          findings.push(...r.findings);
          return r.text;
        }
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
        return v;
      };
      return { value: walk(value), findings };
    }
    module2.exports = { redact, detectSecrets, redactDeep, isEnvFile, REDACTED };
  }
});

// src/context/contextValidator.js
var require_contextValidator = __commonJS({
  "src/context/contextValidator.js"(exports2, module2) {
    var { redactDeep, REDACTED } = require_secretDetector();
    var { compileExclusions } = require_exclusions();
    var { normalizeRelative } = require_paths();
    var { AiProjectError, ErrorCodes } = require_errors();
    function validateOutbound(pkg, { excludePatterns = [], userExcludeEnv = false } = {}) {
      const isExcluded = compileExclusions(excludePatterns);
      const problems = [];
      for (const f of pkg.files || []) {
        let rel;
        try {
          rel = normalizeRelative(f.path);
        } catch {
          problems.push(`invalid path ${f.path}`);
          continue;
        }
        if (rel.startsWith("..") || rel.startsWith("/")) problems.push(`path outside project: ${f.path}`);
        if (isExcluded(rel)) problems.push(`excluded file present: ${f.path}`);
      }
      if (problems.length) throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Refusing to send context: ${problems.slice(0, 3).join("; ")}`);
      const { value, findings } = redactDeep(pkg);
      return { pkg: value, secondPassRedactions: findings.length, redactedMarker: REDACTED };
    }
    module2.exports = { validateOutbound };
  }
});

// src/context/batchManager.js
var require_batchManager = __commonJS({
  "src/context/batchManager.js"(exports2, module2) {
    var { estimateTokens } = require_tokenEstimator();
    function orderForBatching(files, analysis) {
      const byPath = new Map(files.map((f) => [f.path, f]));
      const visited = /* @__PURE__ */ new Set();
      const ordered = [];
      const visit = (p) => {
        if (visited.has(p) || !byPath.has(p)) return;
        visited.add(p);
        ordered.push(byPath.get(p));
        const deps = ((analysis.dependencies[p] || {}).internal || []).map((d) => d.path).sort();
        for (const d of deps) visit(d);
      };
      const primaries = files.filter((f) => f.priority === 0).map((f) => f.path).sort();
      primaries.forEach(visit);
      files.map((f) => f.path).sort().forEach(visit);
      return ordered;
    }
    function createBatches(files, analysis, { maxTokens, maxFiles = 40 }) {
      const ordered = orderForBatching(files, analysis);
      const batches = [];
      let cur = { files: [], tokens: 0 };
      const flush = () => {
        if (cur.files.length) batches.push(cur);
        cur = { files: [], tokens: 0 };
      };
      for (const f of ordered) {
        const t = f.tokens || estimateTokens(f.content);
        if (cur.files.length && (cur.tokens + t > maxTokens || cur.files.length >= maxFiles)) flush();
        cur.files.push(f);
        cur.tokens += t;
      }
      flush();
      return batches.map((b, i) => ({ batchId: `batch-${String(i + 1).padStart(3, "0")}`, batchNumber: i + 1, totalBatches: batches.length, files: b.files, tokens: b.tokens }));
    }
    function crossBatchState(previousBatches, analysis, priorFindings = []) {
      const paths = new Set(previousBatches.flatMap((b) => b.files.map((f) => f.path)));
      return {
        knownFiles: [...paths],
        knownSymbols: [...paths].flatMap((p) => (analysis.files.find((a) => a.path === p) || { symbols: [] }).symbols.filter((s) => s.exported).map((s) => ({ name: s.name, file: p, type: s.type }))).slice(0, 300),
        knownAPIs: analysis.apis.filter((a) => paths.has(a.file)).map((a) => `${a.method} ${a.endpoint}`),
        knownDatabaseEntities: analysis.database.entities.filter((e) => e.file && paths.has(e.file)).map((e) => e.name),
        knownWorkflows: analysis.workflows.filter((w) => w.summary.files.some((f) => paths.has(f))).map((w) => w.id),
        knownFeatures: analysis.features.filter((f) => f.files.some((x) => paths.has(x))).map((f) => f.id),
        knownDependencies: [...paths].flatMap((p) => ((analysis.dependencies[p] || {}).internal || []).map((d) => ({ from: p, to: d.path }))).slice(0, 500),
        unknowns: [],
        previousFindings: priorFindings
      };
    }
    module2.exports = { createBatches, crossBatchState, orderForBatching };
  }
});

// src/context/contextBuilder.js
var require_contextBuilder = __commonJS({
  "src/context/contextBuilder.js"(exports2, module2) {
    var fs = require("fs");
    var { resolveInside } = require_paths();
    var { selectFiles } = require_contextSelector();
    var { dependencyContext } = require_dependencyContext();
    var { workflowContext } = require_workflowContext();
    var { databaseContext } = require_databaseContext();
    var { featureContext } = require_featureContext();
    var { projectContext } = require_projectContext();
    var { reduceContext } = require_contextReducer();
    var { validateOutbound } = require_contextValidator();
    var { createBatches, crossBatchState } = require_batchManager();
    var { redact } = require_secretDetector();
    var { estimateTokens } = require_tokenEstimator();
    var logger2 = require_logger();
    var INSTRUCTIONS = { sourceOfTruth: "SOURCE_CODE", doNotInvent: true, useEvidenceLabels: true };
    async function readContent(root, rel, detectSecrets) {
      const abs = resolveInside(root, rel);
      const raw = await fs.promises.readFile(abs, "utf8");
      if (!detectSecrets) return { text: raw, findings: [] };
      return redact(raw, rel);
    }
    async function build({ root, project, analysisId, mode, purpose, intent = "UNDERSTAND", selection, analysis, scan, fileIndex, existingKnowledge = {}, config, provider }) {
      const limits = {
        maxFiles: config.maxFiles,
        maxLinesPerFile: config.maxLinesPerFile,
        maxTotalLines: config.maxTotalLines,
        maxTokensPerFile: config.maxTokensPerFile,
        maxTotalTokens: config.maxTotalTokens
      };
      const detectSecrets = config.detectSecrets !== false;
      const { files: primary, notes } = selectFiles({ mode, selection, analysis, files: fileIndex });
      const deps = ["DOCUMENTATION", "COMPARISON", "BLUEPRINT"].includes(mode) ? [] : dependencyContext(primary, analysis, { depth: config.maxDependencyDepth });
      const candidates = [
        ...primary.map((p) => ({ path: p, priority: 0, reason: "selected" })),
        ...deps.map((d) => ({ path: d.path, priority: d.priority, reason: d.reason }))
      ];
      const items = [];
      const secrets = [];
      for (const c of candidates) {
        const rec = fileIndex.find((f) => f.path === c.path);
        if (!rec || rec.binary) continue;
        try {
          const { text, findings } = await readContent(root, c.path, detectSecrets);
          findings.forEach((f) => secrets.push({ file: c.path, type: f.type, line: f.line }));
          const fa = analysis.files.find((a) => a.path === c.path);
          items.push({ path: c.path, language: rec.language, hash: rec.hash, content: text, priority: c.priority, reason: c.reason, redactions: findings.length, fa });
        } catch (err) {
          notes.push(`could not read ${c.path}: ${err.code || err.message}`);
        }
      }
      items.sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
      const reduced = reduceContext(items, limits);
      const included = reduced.kept.map((f) => f.path);
      const filesOut = reduced.kept.map((f) => ({
        path: f.path,
        language: f.language,
        hash: f.hash,
        content: f.content,
        truncated: f.truncated,
        relation: f.reason,
        symbols: (f.fa ? f.fa.symbols : []).map((s) => ({ name: s.name, type: s.type, className: s.className, line: s.line, endLine: s.endLine, exported: !!s.exported, params: s.params })),
        imports: (f.fa ? f.fa.imports : []).map((i) => ({ source: i.source, names: i.names.map((n) => n.imported).concat(i.default ? ["default"] : []) })),
        exports: (f.fa ? f.fa.exports : []).map((e) => e.name),
        dependencies: ((analysis.dependencies[f.path] || {}).internal || []).map((d) => d.path),
        dependents: (analysis.dependents[f.path] || []).map((d) => d.path)
      }));
      const wfCtx = workflowContext(included, analysis);
      const dbCtx = databaseContext(included, analysis);
      const base = {
        packageType: "PROJECT_ANALYSIS",
        schemaVersion: "1.0",
        project: { projectId: project.projectId, name: project.name },
        projectOverview: projectContext(project, analysis, scan),
        analysis: { analysisId, mode, purpose: purpose || null, intent, provider: provider || null },
        selection: { files: selection.files || [], folders: selection.folders || [], features: selection.features || [], workflows: selection.workflows || [] },
        existingKnowledge,
        instructions: INSTRUCTIONS
      };
      const batchesRaw = createBatches(filesOut.map((f) => ({ ...f, priority: f.relation === "selected" ? 0 : 1, tokens: estimateTokens(f.content) })), analysis, { maxTokens: config.maxTokens, maxFiles: config.maxFiles });
      const total = batchesRaw.length || 1;
      const batches = [];
      const done = [];
      for (const b of batchesRaw) {
        const paths = new Set(b.files.map((f) => f.path));
        const fileList = b.files.map(({ priority, tokens, ...rest }) => rest);
        const raw = {
          analysisId,
          batchId: b.batchId,
          batchNumber: b.batchNumber,
          totalBatches: total,
          purpose: `${mode.toLowerCase()} analysis${purpose ? `: ${purpose}` : ""}`,
          selection: base.selection,
          previousContextReference: b.batchNumber > 1 ? batchesRaw[b.batchNumber - 2].batchId : null,
          context: {
            project: base.project,
            projectOverview: base.projectOverview,
            analysis: base.analysis,
            files: fileList,
            symbols: fileList.flatMap((f) => f.symbols.map((s) => ({ ...s, file: f.path }))),
            dependencies: fileList.flatMap((f) => f.dependencies.map((to) => ({ from: f.path, to }))),
            apis: analysis.apis.filter((a) => paths.has(a.file)).map((a) => ({ method: a.method, endpoint: a.endpoint, file: a.file, line: a.line, handler: a.handler, middleware: a.middleware })),
            clientApiCalls: analysis.apiLinks.filter((l) => paths.has(l.from.file)).map((l) => ({ from: l.from, method: l.method, path: l.path, route: l.route })),
            database: databaseContext([...paths], analysis),
            workflows: workflowContext([...paths], analysis),
            features: featureContext([...paths], analysis),
            existingKnowledge,
            crossBatch: crossBatchState(done, analysis),
            instructions: INSTRUCTIONS
          },
          estimatedTokens: b.tokens
        };
        const validated = validateOutbound(raw, { excludePatterns: config.excludePatterns });
        if (validated.secondPassRedactions) secrets.push({ file: "(metadata)", type: "second-pass", count: validated.secondPassRedactions });
        batches.push(validated.pkg);
        done.push(b);
      }
      const stats = {
        selectedFiles: primary.length,
        includedFiles: filesOut.length,
        omitted: reduced.omitted,
        notes,
        totalTokens: reduced.totalTokens,
        totalLines: reduced.totalLines,
        batches: batches.length,
        secretsRedacted: secrets.length,
        secrets
        // locations/types only
      };
      logger2.info("ANALYSIS", "context built", { analysisId, mode, files: filesOut.length, batches: batches.length, redactions: secrets.length });
      return {
        analysisPackage: { ...base, selection: base.selection, files: filesOut.map((f) => ({ path: f.path, hash: f.hash, language: f.language })), workflows: wfCtx, database: dbCtx },
        batches,
        fileHashes: filesOut.map((f) => ({ path: f.path, hash: f.hash })),
        stats
      };
    }
    module2.exports = { build };
  }
});

// src/knowledge/evidenceManager.js
var require_evidenceManager = __commonJS({
  "src/knowledge/evidenceManager.js"(exports2, module2) {
    var STATUS = { VERIFIED: "VERIFIED", INFERRED: "INFERRED", UNKNOWN: "UNKNOWN" };
    function makeClaim(claim, status, evidence = []) {
      if (!Object.values(STATUS).includes(status)) throw new Error(`Invalid evidence status: ${status}`);
      if (status === STATUS.VERIFIED && evidence.length === 0) status = STATUS.UNKNOWN;
      return { claim, status, evidence };
    }
    function evidenceRef(file, extra = {}) {
      return { file, ...extra };
    }
    var RANK = { UNKNOWN: 0, INFERRED: 1, VERIFIED: 2 };
    function stronger(a, b) {
      return RANK[a] >= RANK[b] ? a : b;
    }
    module2.exports = { STATUS, makeClaim, evidenceRef, stronger, RANK };
  }
});

// src/knowledge/knowledgeMerger.js
var require_knowledgeMerger = __commonJS({
  "src/knowledge/knowledgeMerger.js"(exports2, module2) {
    var { RANK } = require_evidenceManager();
    function mergeValue(existing, incoming, { currentHash } = {}) {
      if (!incoming || incoming.value === void 0 || incoming.value === null || incoming.value === "") return existing || null;
      if (!existing) return { ...incoming, alternatives: [] };
      const stale = currentHash && existing.sourceHash && existing.sourceHash !== currentHash;
      if (stale && RANK[incoming.status] >= RANK.INFERRED) return { ...incoming, alternatives: existing.alternatives || [] };
      if (existing.value === incoming.value) return { ...existing, status: RANK[incoming.status] > RANK[existing.status] ? incoming.status : existing.status };
      if (RANK[incoming.status] > RANK[existing.status]) {
        return { ...incoming, alternatives: [...existing.alternatives || [], { value: existing.value, status: existing.status, analysisId: existing.analysisId }] };
      }
      const alts = existing.alternatives || [];
      if (RANK[incoming.status] === RANK[existing.status] && !alts.some((a) => a.value === incoming.value)) {
        return { ...existing, alternatives: [...alts, { value: incoming.value, status: incoming.status, analysisId: incoming.analysisId }] };
      }
      return existing;
    }
    function mergeClaims(existing = [], incoming = [], { analysisId, currentHashes = {} } = {}) {
      const map = new Map(existing.map((c) => [c.claim, c]));
      for (const c of incoming) {
        const prev = map.get(c.claim);
        const stamped = { ...c, analysisId };
        if (!prev) {
          map.set(c.claim, stamped);
          continue;
        }
        const prevStale = (prev.evidence || []).some((e) => e.sha256 && currentHashes[e.file] && currentHashes[e.file] !== e.sha256);
        if (prevStale || RANK[c.status] > RANK[prev.status]) map.set(c.claim, { ...stamped, evidence: dedupeEvidence([...c.evidence || [], ...prevStale ? [] : prev.evidence || []]) });
        else map.set(c.claim, { ...prev, evidence: dedupeEvidence([...prev.evidence || [], ...c.evidence || []]) });
      }
      return [...map.values()];
    }
    function dedupeEvidence(list) {
      const seen = /* @__PURE__ */ new Set();
      return list.filter((e) => {
        const k = `${e.file}|${e.symbol || ""}|${e.lineStart || ""}|${e.lineEnd || ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
    var union = (a = [], b = []) => [.../* @__PURE__ */ new Set([...a, ...b])];
    module2.exports = { mergeValue, mergeClaims, dedupeEvidence, union };
  }
});

// src/knowledge/reconciliationEngine.js
var require_reconciliationEngine = __commonJS({
  "src/knowledge/reconciliationEngine.js"(exports2, module2) {
    var fs = require("fs");
    var { resolveInside, normalizeRelative } = require_paths();
    var { AiProjectError, ErrorCodes } = require_errors();
    var { mergeValue, mergeClaims, union } = require_knowledgeMerger();
    var { RANK } = require_evidenceManager();
    var { safeName } = require_knowledgeStore();
    var logger2 = require_logger();
    var MAX_READ_BYTES = 2 * 1024 * 1024;
    var COMMON = /* @__PURE__ */ new Set(["the", "this", "that", "with", "from", "into", "when", "then", "which", "where", "table", "field", "function", "class", "file", "route", "endpoint", "method", "returns", "calls", "uses", "null", "true", "false", "string", "number"]);
    async function loadStaticIndex(projectStore) {
      const files = (await projectStore.readJson("index/files.json", { files: [] })).files;
      const symbols = (await projectStore.readJson("index/symbols.json", { symbols: [] })).symbols;
      const entities = (await projectStore.readJson("database/entities.json", { entities: [] })).entities;
      const relationships = (await projectStore.readJson("database/relationships.json", { relationships: [] })).relationships;
      const dependencies = (await projectStore.readJson("index/dependencies.json", { dependencies: {} })).dependencies;
      const symbolsByFile = /* @__PURE__ */ new Map();
      for (const s of symbols) (symbolsByFile.get(s.file) || symbolsByFile.set(s.file, []).get(s.file)).push(s);
      return { files: new Map(files.map((f) => [f.path, f])), symbolsByFile, entities, relationships, dependencies };
    }
    var SourceReader = class {
      constructor(root) {
        this.root = root;
        this.cache = /* @__PURE__ */ new Map();
      }
      async lines(rel) {
        if (this.cache.has(rel)) return this.cache.get(rel);
        let out = null;
        try {
          const abs = resolveInside(this.root, rel);
          const st = await fs.promises.stat(abs);
          if (st.size <= MAX_READ_BYTES) out = (await fs.promises.readFile(abs, "utf8")).split("\n");
        } catch {
          out = null;
        }
        this.cache.set(rel, out);
        return out;
      }
    };
    function extractTokens(text) {
      const tokens = /* @__PURE__ */ new Set();
      for (const m of text.matchAll(/`([^`]{2,80})`|'([^']{3,80})'|"([^"]{3,80})"/g)) tokens.add((m[1] || m[2] || m[3]).trim());
      for (const m of text.matchAll(/\b[a-z]+(?:_[a-z0-9]+)+\b|\b[a-z]+(?:[A-Z][a-z0-9]+)+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b|\/[\w/.:-]{3,}/g)) tokens.add(m[0]);
      return [...tokens].filter((t) => t.length >= 3 && !COMMON.has(t.toLowerCase())).slice(0, 8);
    }
    function textHas(haystack, needle) {
      if (!needle) return false;
      const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(/^\w/.test(needle) ? `\\b${esc}` + (/\w$/.test(needle) ? "\\b" : "") : esc, "i").test(haystack);
    }
    async function checkRef(ref, ctx) {
      const out = { file: ref.file, symbol: ref.symbol, lineStart: ref.lineStart, lineEnd: ref.lineEnd, sha256: ref.sha256 || ref.hash, valid: false, reason: null };
      let rel;
      try {
        rel = normalizeRelative(ref.file);
        resolveInside(ctx.root, rel);
      } catch (e) {
        out.reason = e.code === ErrorCodes.PATH_TRAVERSAL ? "path rejected (outside project)" : "invalid path";
        return out;
      }
      out.file = rel;
      const rec = ctx.index.files.get(rel);
      if (!rec) {
        out.reason = "file is not part of the scanned project";
        return out;
      }
      if (out.sha256 && out.sha256 !== rec.hash) {
        out.reason = "file changed since analysis (hash mismatch)";
        out.stale = true;
        return out;
      }
      out.sha256 = rec.hash;
      const lines = await ctx.reader.lines(rel);
      if (!lines) {
        out.reason = "file could not be read";
        return out;
      }
      if (ref.lineStart !== void 0) {
        const s = ref.lineStart;
        const e = ref.lineEnd === void 0 ? s : ref.lineEnd;
        if (!(s >= 1 && e >= s && e <= lines.length)) {
          out.reason = "line range outside file";
          return out;
        }
      }
      if (ref.symbol) {
        const last = ref.symbol.split(/[.#]/).pop();
        const known = (ctx.index.symbolsByFile.get(rel) || []).some((s) => s.name === last);
        if (!known && !lines.some((l) => textHas(l, last))) {
          out.reason = `symbol ${ref.symbol} not found in file`;
          return out;
        }
        out.symbolVerified = known;
      }
      out.valid = true;
      out.text = ref.lineStart !== void 0 ? lines.slice(ref.lineStart - 1, ref.lineEnd === void 0 ? ref.lineStart : ref.lineEnd).join("\n") : lines.join("\n");
      return out;
    }
    async function verifyClaim(claim, ctx, tokensOverride) {
      const aiStatus = claim.status;
      const refs = [];
      for (const r of claim.evidence || []) refs.push(await checkRef(r, ctx));
      const good = refs.filter((r) => r.valid);
      const stale = refs.filter((r) => r.stale);
      const tokens = tokensOverride || (claim.subject ? [claim.subject] : extractTokens(claim.claim));
      const checks = [];
      let status = aiStatus;
      if (aiStatus === "VERIFIED") {
        if (good.length === 0) {
          if (stale.length) {
            status = "UNKNOWN";
            checks.push("evidence is stale: re-analysis required");
          } else if (refs.length) {
            status = "UNKNOWN";
            checks.push(`cited evidence does not hold: ${refs.map((r) => r.reason).filter(Boolean).join("; ")}`);
          } else {
            status = "INFERRED";
            checks.push("claimed VERIFIED without any evidence");
          }
        } else if (tokens.length) {
          const found = tokens.filter((t) => good.some((r) => textHas(r.text, t)));
          if (found.length) checks.push(`found in source: ${found.join(", ")}`);
          else {
            status = "UNKNOWN";
            checks.push(`subject not found in cited evidence: ${tokens.join(", ")}`);
          }
        } else if (good.some((r) => r.symbolVerified)) {
          checks.push("cited symbol exists");
        } else {
          status = "INFERRED";
          checks.push("evidence exists but claim content is not machine-checkable");
        }
      } else if (aiStatus === "INFERRED") {
        checks.push(good.length ? "evidence present; kept INFERRED" : "no valid evidence; kept INFERRED");
      }
      return { claim: claim.claim, subject: claim.subject, aiStatus, status, evidence: refs.map(({ text, valid, ...keep }) => keep), evidenceValid: good.length, checks };
    }
    async function verifyClaims(list, ctx) {
      const out = [];
      for (const c of list || []) out.push(await verifyClaim(c, ctx));
      return out;
    }
    var looksSame = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
    async function verifyPackage(pkg, { root, index }) {
      const ctx = { root, index, reader: new SourceReader(root) };
      const report = { counts: { VERIFIED: 0, INFERRED: 0, UNKNOWN: 0 }, rejected: [], stale: [], conflicts: [], unverified: [] };
      const tally = (list) => list.forEach((c) => {
        report.counts[c.status]++;
      });
      const k = pkg.knowledge;
      const accepted = { files: [], features: [], workflows: [], database: { entities: [], relationships: [] }, architecture: null, dependencies: [], evidence: [] };
      for (const f of k.files || []) {
        let rel;
        try {
          rel = normalizeRelative(f.path);
          resolveInside(root, rel);
        } catch {
          report.rejected.push({ kind: "file", path: f.path, reason: "path rejected" });
          continue;
        }
        const rec = index.files.get(rel);
        if (!rec) {
          report.rejected.push({ kind: "file", path: f.path, reason: "not part of the scanned project" });
          continue;
        }
        const claimedHash = f.sha256 || f.hash;
        const staleFile = !!(claimedHash && claimedHash !== rec.hash);
        if (staleFile) report.stale.push(rel);
        const claims = staleFile ? (f.claims || []).map((c) => ({ ...c, status: c.status === "VERIFIED" ? "UNKNOWN" : c.status, evidence: [] })).map((c) => ({ claim: c.claim, status: c.status, aiStatus: c.status, evidence: [], evidenceValid: 0, checks: ["file changed since analysis"] })) : await verifyClaims(f.claims, ctx);
        tally(claims);
        accepted.files.push({ path: rel, sourceHash: rec.hash, stale: staleFile, purpose: f.purpose, role: f.role, claims, unknowns: f.unknowns || [] });
      }
      for (const f of k.features || []) {
        const files = [];
        const unknownFiles = [];
        for (const p of f.files || []) {
          const rel = safeRel(root, p);
          (rel && index.files.has(rel) ? files : unknownFiles).push(rel || p);
        }
        const claims = await verifyClaims(f.claims, ctx);
        tally(claims);
        accepted.features.push({ id: safeId(f.id), name: f.name, purpose: f.purpose, files, unknownFiles, claims });
      }
      for (const w of k.workflows || []) {
        const steps = [];
        for (const s of w.steps || []) {
          let status = "UNKNOWN";
          const rel = s.file ? safeRel(root, s.file) : null;
          const rec = rel ? index.files.get(rel) : null;
          const note = [];
          if (rec) {
            const syms = index.symbolsByFile.get(rel) || [];
            if (!s.symbol) status = "INFERRED";
            else if (syms.some((x) => x.name === s.symbol.split(".").pop())) status = s.status === "UNKNOWN" ? "UNKNOWN" : "VERIFIED";
            else {
              status = "UNKNOWN";
              note.push(`symbol ${s.symbol} not found in ${rel}`);
            }
          } else if (s.file) note.push("file is not part of the scanned project");
          else status = s.status === "UNKNOWN" ? "UNKNOWN" : "INFERRED";
          report.counts[status]++;
          steps.push({ kind: s.kind, file: rel, symbol: s.symbol, description: s.description, status, aiStatus: s.status, note: note.join("; ") || void 0 });
        }
        const claims = await verifyClaims(w.claims, ctx);
        const rules = await verifyClaims(w.businessRules, ctx);
        tally(claims);
        tally(rules);
        accepted.workflows.push({ id: safeId(w.id), name: w.name, purpose: w.purpose, api: w.api || null, steps, businessRules: rules, claims });
      }
      const db = k.database || {};
      for (const e of db.entities || []) {
        const st = index.entities.find((x) => x.name === e.name || x.table === e.name || looksSame(x.name, e.name));
        const claims = await verifyClaims(e.claims, ctx);
        tally(claims);
        const fields = [];
        for (const f of e.fields || []) {
          const staticField = st && (st.fields || []).find((x) => looksSame(x.name, f.name));
          if (staticField) {
            if (f.type && staticField.type && !looksSame(f.type, staticField.type) && !String(staticField.type).toLowerCase().includes(String(f.type).toLowerCase())) {
              report.conflicts.push({ kind: "field-type", entity: e.name, field: f.name, source: "SOURCE", sourceValue: staticField.type, aiValue: f.type, resolution: "source wins" });
            }
            fields.push({ name: staticField.name, type: staticField.type, status: "VERIFIED", basis: "static analysis" });
            report.counts.VERIFIED++;
            continue;
          }
          const refs = [];
          for (const r of f.evidence || []) refs.push(await checkRef(r, ctx));
          const hit = refs.find((r) => r.valid && textHas(r.text, f.name));
          if (hit) {
            fields.push({ name: f.name, type: f.type, status: "VERIFIED", basis: "source text", evidence: [{ file: hit.file, lineStart: hit.lineStart, lineEnd: hit.lineEnd, sha256: hit.sha256 }] });
            report.counts.VERIFIED++;
          } else {
            report.unverified.push({ kind: "field", entity: e.name, field: f.name, reason: "no supporting evidence in source" });
            report.counts.UNKNOWN++;
          }
        }
        let entityStatus = st ? "VERIFIED" : "UNKNOWN";
        if (!st) {
          const refs = [];
          for (const r of e.evidence || []) refs.push(await checkRef(r, ctx));
          if (fields.length || claims.some((c) => c.status === "VERIFIED")) entityStatus = "VERIFIED";
          else report.unverified.push({ kind: "entity", entity: e.name, reason: "entity not found in source analysis" });
        }
        accepted.database.entities.push({ name: st ? st.name : e.name, staticMatch: !!st, status: entityStatus, purpose: e.purpose, fields, claims });
      }
      for (const r of db.relationships || []) {
        const st = index.relationships.find((x) => looksSame(x.from, r.from) && looksSame(x.to, r.to) || looksSame(x.from, r.to) && looksSame(x.to, r.from));
        if (st) {
          if (r.type && st.type && !looksSame(r.type, st.type) && !looksSame(x_inverse(st.type), r.type)) report.conflicts.push({ kind: "relationship-type", from: r.from, to: r.to, source: "SOURCE", sourceValue: st.type, aiValue: r.type, resolution: "source wins" });
          accepted.database.relationships.push({ from: st.from, to: st.to, type: st.type, status: "VERIFIED", basis: "static analysis" });
          report.counts.VERIFIED++;
          continue;
        }
        const refs = [];
        for (const ref of r.evidence || []) refs.push(await checkRef(ref, ctx));
        const hit = refs.find((x) => x.valid && textHas(x.text, r.from) && textHas(x.text, r.to));
        if (hit) {
          accepted.database.relationships.push({ from: r.from, to: r.to, type: r.type, status: "INFERRED", basis: "both entities appear in cited source", evidence: [{ file: hit.file, lineStart: hit.lineStart, lineEnd: hit.lineEnd, sha256: hit.sha256 }] });
          report.counts.INFERRED++;
        } else {
          report.unverified.push({ kind: "relationship", from: r.from, to: r.to, reason: "not verifiable from source" });
          report.counts.UNKNOWN++;
        }
      }
      for (const d of k.dependencies || []) {
        const from = safeRel(root, d.from);
        const to = safeRel(root, d.to);
        const edge = from && to && ((index.dependencies[from] || {}).internal || []).some((x) => x.path === to);
        if (edge) {
          accepted.dependencies.push({ from, to, status: "VERIFIED" });
          report.counts.VERIFIED++;
        } else {
          report.unverified.push({ kind: "dependency", from: d.from, to: d.to, reason: "import edge not found in source analysis" });
          report.counts.UNKNOWN++;
        }
      }
      if (k.architecture) {
        const claims = await verifyClaims(k.architecture.claims, ctx);
        tally(claims);
        accepted.architecture = { overview: k.architecture.overview, overviewStatus: "INFERRED", claims };
      }
      accepted.evidence = await verifyClaims(pkg.evidence, ctx);
      tally(accepted.evidence);
      return { accepted, report };
    }
    function x_inverse(t) {
      return { "one-to-many": "many-to-one", "many-to-one": "one-to-many" }[t] || t;
    }
    function safeRel(root, p) {
      try {
        const r = normalizeRelative(p);
        resolveInside(root, r);
        return r;
      } catch {
        return null;
      }
    }
    function safeId(id) {
      return String(id).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "item";
    }
    async function reconcile({ projectStore, knowledgeStore, verified, analysisId, provider, index }) {
      const { accepted, report } = verified;
      const currentHashes = Object.fromEntries([...index.files.values()].map((f) => [f.path, f.hash]));
      const changes = { filesUpdated: 0, featuresUpdated: 0, workflowsUpdated: 0, entitiesUpdated: 0, relationshipsAdded: 0, newAiOnly: [] };
      const cell = (value, status, hash) => value ? { value, status, analysisId, provider, sourceHash: hash } : null;
      const analyzedStatuses = [];
      for (const f of accepted.files) {
        const prev = await knowledgeStore.getFileKnowledge(f.path) || { path: f.path, claims: [], unknowns: [] };
        const h = f.sourceHash;
        const next = {
          ...prev,
          path: f.path,
          sourceHash: f.stale ? prev.sourceHash : h,
          purpose: mergeValue(prev.purpose, cell(f.purpose, "INFERRED", h), { currentHash: h }),
          role: mergeValue(prev.role, cell(f.role, "INFERRED", h), { currentHash: h }),
          claims: mergeClaims(prev.claims, f.claims.map(stripAi), { analysisId, currentHashes }),
          unknowns: union(prev.unknowns, f.unknowns),
          analysisIds: union(prev.analysisIds, [analysisId]),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await knowledgeStore.saveFileKnowledge(f.path, next);
        await knowledgeStore.recordDocumentation(`files/${f.path}`, { [f.path]: h }, f.stale ? "OUTDATED" : next.unknowns.length || f.claims.some((c) => c.status === "UNKNOWN") ? "PARTIAL" : "ANALYZED");
        changes.filesUpdated++;
        if (!f.stale) analyzedStatuses.push({ path: f.path, hash: h, status: next.unknowns.length || f.claims.some((c) => c.status === "UNKNOWN") ? "PARTIAL" : "ANALYZED" });
      }
      await knowledgeStore.markAnalyzed(analysisId, analyzedStatuses);
      const featIndex = await projectStore.readJson("features/index.json", { features: [] });
      for (const f of accepted.features) {
        const existing = await projectStore.readJson(`features/${f.id}.json`, null);
        const doc = existing || { id: f.id, name: f.name || f.id, origin: "AI", status: "INFERRED", files: f.files, tests: [], apis: [], entities: [] };
        const hashes = Object.fromEntries(f.files.map((p) => [p, currentHashes[p]]));
        const k = doc.knowledge || { purpose: null, claims: [] };
        doc.knowledge = { ...k, purpose: mergeValue(k.purpose, cell(f.purpose, "INFERRED", null)), claims: mergeClaims(k.claims, f.claims.map(stripAi), { analysisId, currentHashes }), unknownFiles: union(k.unknownFiles, f.unknownFiles), analysisIds: union(k.analysisIds, [analysisId]) };
        await projectStore.writeJson(`features/${f.id}.json`, doc);
        await knowledgeStore.recordDocumentation(`features/${f.id}`, hashes);
        if (!existing) {
          featIndex.features.push({ id: f.id, name: doc.name, status: "INFERRED", origin: "AI", files: f.files.length, apis: 0, entities: [] });
          changes.newAiOnly.push(`feature:${f.id}`);
        }
        changes.featuresUpdated++;
      }
      await projectStore.writeJson("features/index.json", featIndex);
      const wfIndex = await projectStore.readJson("workflows/index.json", { workflows: [] });
      for (const w of accepted.workflows) {
        let target = await projectStore.readJson(`workflows/${w.id}.json`, null);
        if (!target && w.api && w.api.endpoint) {
          const hit = wfIndex.workflows.find((x) => x.api && x.api.endpoint === w.api.endpoint && (!w.api.method || x.api.method === String(w.api.method).toUpperCase()));
          if (hit) target = await projectStore.readJson(`workflows/${hit.id}.json`, null);
        }
        const doc = target || { id: w.id, name: w.name || w.id, origin: "AI", status: "INFERRED", trigger: { type: "UNKNOWN" }, api: w.api, steps: [], summary: { files: [], apiCalls: [], databaseReads: [], databaseWrites: [], externalServices: [] }, unknowns: [] };
        const k = doc.knowledge || { purpose: null, claims: [], steps: [], businessRules: [] };
        const stepKey = (s) => `${s.file}|${s.symbol}|${s.kind}`;
        const merged = new Map((k.steps || []).map((s) => [stepKey(s), s]));
        for (const s of w.steps) {
          const prev = merged.get(stepKey(s));
          if (!prev || RANK[s.status] >= RANK[prev.status]) merged.set(stepKey(s), { ...s, analysisId });
        }
        doc.knowledge = { ...k, purpose: mergeValue(k.purpose, cell(w.purpose, "INFERRED", null)), steps: [...merged.values()], claims: mergeClaims(k.claims, w.claims.map(stripAi), { analysisId, currentHashes }), businessRules: mergeClaims(k.businessRules, w.businessRules.map(stripAi), { analysisId, currentHashes }), analysisIds: union(k.analysisIds, [analysisId]) };
        await projectStore.writeJson(`workflows/${doc.id}.json`, doc);
        const files = [.../* @__PURE__ */ new Set([...doc.summary.files || [], ...w.steps.map((s) => s.file).filter(Boolean)])];
        await knowledgeStore.recordDocumentation(`workflows/${doc.id}`, Object.fromEntries(files.filter((p) => currentHashes[p]).map((p) => [p, currentHashes[p]])));
        if (!target) {
          wfIndex.workflows.push({ id: doc.id, name: doc.name, status: "INFERRED", origin: "AI", trigger: "UNKNOWN", api: doc.api, files: files.length, databaseWrites: [], sourceFiles: files });
          changes.newAiOnly.push(`workflow:${doc.id}`);
        }
        changes.workflowsUpdated++;
      }
      await projectStore.writeJson("workflows/index.json", wfIndex);
      const entDoc = await projectStore.readJson("database/entities.json", { entities: [] });
      for (const e of accepted.database.entities) {
        if (e.status === "UNKNOWN") continue;
        let target = entDoc.entities.find((x) => x.name === e.name);
        if (!target) {
          target = { name: e.name, kind: "unknown", origin: "AI", source: "ai", fields: [], file: null, knowledge: null };
          entDoc.entities.push(target);
          changes.newAiOnly.push(`entity:${e.name}`);
        }
        const k = target.knowledge || { purpose: null, claims: [], fields: [] };
        const fm = new Map((k.fields || []).map((f) => [f.name, f]));
        for (const f of e.fields) {
          const p = fm.get(f.name);
          if (!p || RANK[f.status] >= RANK[p.status]) fm.set(f.name, { ...f, analysisId });
        }
        target.knowledge = { ...k, purpose: mergeValue(k.purpose, cell(e.purpose, "INFERRED", null)), fields: [...fm.values()], claims: mergeClaims(k.claims, e.claims.map(stripAi), { analysisId, currentHashes }), analysisIds: union(k.analysisIds, [analysisId]) };
        if (target.file && currentHashes[target.file]) await knowledgeStore.recordDocumentation(`database/${e.name}`, { [target.file]: currentHashes[target.file] });
        changes.entitiesUpdated++;
      }
      await projectStore.writeJson("database/entities.json", entDoc);
      const relDoc = await projectStore.readJson("database/relationships.json", { relationships: [] });
      for (const r of accepted.database.relationships) {
        if (relDoc.relationships.some((x) => looksSame(x.from, r.from) && looksSame(x.to, r.to))) continue;
        relDoc.relationships.push({ ...r, origin: "AI", analysisId, source: "ai-verified-against-source" });
        changes.relationshipsAdded++;
      }
      await projectStore.writeJson("database/relationships.json", relDoc);
      if (accepted.architecture) {
        const prev = await projectStore.readJson("architecture/knowledge.json", { overview: null, claims: [] });
        await projectStore.writeJson("architecture/knowledge.json", { overview: mergeValue(prev.overview, cell(accepted.architecture.overview, "INFERRED", null)), claims: mergeClaims(prev.claims, accepted.architecture.claims.map(stripAi), { analysisId, currentHashes }), updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
      }
      if (report.conflicts.length) {
        const cf = await projectStore.readJson("index/conflicts.json", { conflicts: [] });
        for (const c of report.conflicts) cf.conflicts.push({ ...c, analysisId, at: (/* @__PURE__ */ new Date()).toISOString() });
        await projectStore.writeJson("index/conflicts.json", cf);
      }
      logger2.info("KNOWLEDGE", "reconciled", { analysisId, counts: report.counts, conflicts: report.conflicts.length });
      return { changes, report };
    }
    function stripAi(c) {
      const { aiStatus, checks, evidenceValid, ...rest } = c;
      return { ...rest, checks };
    }
    module2.exports = { verifyPackage, reconcile, loadStaticIndex, extractTokens, textHas, checkRef, SourceReader };
  }
});

// src/utils/validation.js
var require_validation = __commonJS({
  "src/utils/validation.js"(exports2, module2) {
    function typeOf(v) {
      if (Array.isArray(v)) return "array";
      if (v === null) return "null";
      return typeof v;
    }
    function validate(value, schema, at = "$") {
      const errors = [];
      const t = typeOf(value);
      if (schema.type && schema.type !== "any" && t !== schema.type) {
        errors.push(`${at}: expected ${schema.type}, got ${t}`);
        return errors;
      }
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${at}: must be one of ${schema.enum.join(", ")}`);
      }
      if (schema.type === "string" && schema.pattern && !schema.pattern.test(value)) {
        errors.push(`${at}: does not match ${schema.pattern}`);
      }
      if (schema.type === "string" && schema.maxLength && value.length > schema.maxLength) {
        errors.push(`${at}: longer than ${schema.maxLength}`);
      }
      if (schema.type === "array") {
        if (schema.maxItems && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
        if (schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, `${at}[${i}]`)));
      }
      if (schema.type === "object" && schema.props) {
        for (const [key, sub] of Object.entries(schema.props)) {
          if (value[key] === void 0) {
            if (sub.required) errors.push(`${at}.${key}: required`);
          } else {
            errors.push(...validate(value[key], sub, `${at}.${key}`));
          }
        }
      }
      return errors;
    }
    module2.exports = { validate, typeOf };
  }
});

// src/knowledge/schemaValidator.js
var require_schemaValidator = __commonJS({
  "src/knowledge/schemaValidator.js"(exports2, module2) {
    var { validate } = require_validation();
    var { isCompatibleSchema } = require_versionManager();
    var STATUS = { type: "string", enum: ["VERIFIED", "INFERRED", "UNKNOWN"] };
    var str = (max = 4e3) => ({ type: "string", maxLength: max });
    var EVIDENCE_REF = {
      type: "object",
      props: {
        file: { ...str(500), required: true },
        symbol: str(300),
        lineStart: { type: "number" },
        lineEnd: { type: "number" },
        sha256: str(80),
        hash: str(80)
      }
    };
    var CLAIM = {
      type: "object",
      props: {
        claim: { ...str(2e3), required: true },
        status: { ...STATUS, required: true },
        evidence: { type: "array", maxItems: 50, items: EVIDENCE_REF },
        subject: str(300)
      }
    };
    var claims = { type: "array", maxItems: 500, items: CLAIM };
    var PACKAGE = {
      type: "object",
      props: {
        packageType: { type: "string", enum: ["KNOWLEDGE_PACKAGE"], required: true },
        schemaVersion: { ...str(20), required: true },
        projectId: { ...str(100), required: true },
        analysisId: { ...str(100), required: true },
        source: { type: "object", props: { provider: { ...str(100), required: true }, model: str(100) }, required: true },
        knowledge: {
          type: "object",
          required: true,
          props: {
            files: {
              type: "array",
              maxItems: 2e3,
              items: { type: "object", props: { path: { ...str(500), required: true }, sha256: str(80), hash: str(80), purpose: str(), role: str(), claims, unknowns: { type: "array", maxItems: 200, items: str(1e3) } } }
            },
            features: {
              type: "array",
              maxItems: 500,
              items: { type: "object", props: { id: { ...str(200), required: true }, name: str(300), purpose: str(), files: { type: "array", maxItems: 2e3, items: str(500) }, claims } }
            },
            workflows: {
              type: "array",
              maxItems: 500,
              items: {
                type: "object",
                props: {
                  id: { ...str(200), required: true },
                  name: str(300),
                  purpose: str(),
                  api: { type: "any" },
                  steps: { type: "array", maxItems: 500, items: { type: "object", props: { kind: str(60), file: str(500), symbol: str(300), description: str(2e3), status: STATUS } } },
                  businessRules: { type: "array", maxItems: 200, items: CLAIM },
                  claims
                }
              }
            },
            database: {
              type: "object",
              props: {
                entities: { type: "array", maxItems: 1e3, items: { type: "object", props: { name: { ...str(200), required: true }, purpose: str(), fields: { type: "array", maxItems: 500, items: { type: "object", props: { name: { ...str(200), required: true }, type: str(100), evidence: { type: "array", maxItems: 20, items: EVIDENCE_REF } } } }, claims } } },
                relationships: { type: "array", maxItems: 2e3, items: { type: "object", props: { from: { ...str(200), required: true }, to: { ...str(200), required: true }, type: str(50), evidence: { type: "array", maxItems: 20, items: EVIDENCE_REF }, status: STATUS } } }
              }
            },
            architecture: { type: "object", props: { overview: str(8e3), claims } },
            dependencies: { type: "array", maxItems: 5e3, items: { type: "object", props: { from: { ...str(500), required: true }, to: { ...str(500), required: true }, status: STATUS } } }
          }
        },
        evidence: claims,
        unknowns: { type: "array", maxItems: 500, items: { type: "any" } }
      }
    };
    function validateKnowledgePackage(pkg) {
      const errors = validate(pkg, PACKAGE);
      if (typeof pkg === "object" && pkg && typeof pkg.schemaVersion === "string" && !isCompatibleSchema(pkg.schemaVersion)) {
        errors.push(`$.schemaVersion: incompatible version ${pkg.schemaVersion}`);
      }
      return { valid: errors.length === 0, errors: errors.slice(0, 50) };
    }
    module2.exports = { validateKnowledgePackage, PACKAGE };
  }
});

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && (typeof params.client_max_window_bits === "number" ? opts.clientMaxWindowBits > params.client_max_window_bits : !params.client_max_window_bits)) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation2 = __commonJS({
  "node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation2();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation2();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation2();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL } = require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver = require_receiver();
    var Sender = require_sender();
    var { isBlob } = require_validation2();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            if (!options || options.protocols === void 0) {
              protocols = [];
            } else if (Array.isArray(options.protocols)) {
              protocols = options.protocols;
            } else {
              protocols = [options.protocols];
            }
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              if (options.protocols === void 0) {
                protocols = [];
              } else if (Array.isArray(options.protocols)) {
                protocols = options.protocols;
              } else {
                protocols = [options.protocols];
              }
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        this._readyState = _WebSocket.CLOSING;
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket.prototype.addEventListener = addEventListener;
    WebSocket.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        protocols: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket.CLOSED) return;
      if (websocket.readyState === WebSocket.OPEN) {
        websocket._readyState = WebSocket.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation2();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/ws/index.js
var require_ws = __commonJS({
  "node_modules/ws/index.js"(exports2, module2) {
    "use strict";
    var createWebSocketStream = require_stream();
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver = require_receiver();
    var Sender = require_sender();
    var subprotocol = require_subprotocol();
    var WebSocket = require_websocket();
    var WebSocketServer = require_websocket_server();
    WebSocket.createWebSocketStream = createWebSocketStream;
    WebSocket.extension = extension;
    WebSocket.PerMessageDeflate = PerMessageDeflate;
    WebSocket.Receiver = Receiver;
    WebSocket.Sender = Sender;
    WebSocket.Server = WebSocketServer;
    WebSocket.subprotocol = subprotocol;
    WebSocket.WebSocket = WebSocket;
    WebSocket.WebSocketServer = WebSocketServer;
    module2.exports = WebSocket;
  }
});

// src/bridge/bridgeProtocol.js
var require_bridgeProtocol = __commonJS({
  "src/bridge/bridgeProtocol.js"(exports2, module2) {
    var { randomId } = require_ids();
    var PROTOCOL = "ai-project";
    var PROTOCOL_VERSION = "1.0";
    var MAX_MESSAGE_BYTES = 32 * 1024 * 1024;
    var MessageType = Object.freeze(Object.fromEntries([
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
    var PRE_AUTH = /* @__PURE__ */ new Set([MessageType.PAIR_REQUEST, MessageType.SESSION_RESUME, MessageType.PING]);
    var ErrorCode = Object.freeze({
      INVALID_MESSAGE: "INVALID_MESSAGE",
      UNSUPPORTED_MESSAGE: "UNSUPPORTED_MESSAGE",
      PROTOCOL_MISMATCH: "PROTOCOL_MISMATCH",
      UNAUTHENTICATED: "UNAUTHENTICATED",
      PAIRING_FAILED: "PAIRING_FAILED",
      PAIRING_REJECTED: "PAIRING_REJECTED",
      TOKEN_EXPIRED: "TOKEN_EXPIRED",
      SESSION_MISMATCH: "SESSION_MISMATCH",
      PROJECT_MISMATCH: "PROJECT_MISMATCH",
      ANALYSIS_UNKNOWN: "ANALYSIS_UNKNOWN",
      SCHEMA_INVALID: "SCHEMA_INVALID",
      RATE_LIMITED: "RATE_LIMITED",
      INTERNAL: "INTERNAL"
    });
    var isoTs = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
    function createMessage(messageType, { sessionId = null, projectId = null, payload = {}, inReplyTo } = {}) {
      if (!MessageType[messageType]) throw new Error(`Unknown message type ${messageType}`);
      const msg = {
        protocol: PROTOCOL,
        protocolVersion: PROTOCOL_VERSION,
        messageId: randomId("msg"),
        messageType,
        sessionId,
        projectId,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        payload
      };
      if (inReplyTo) msg.inReplyTo = inReplyTo;
      return msg;
    }
    function major(v) {
      return String(v).split(".")[0];
    }
    function isCompatibleVersion(v) {
      return typeof v === "string" && /^\d+\.\d+$/.test(v) && major(v) === major(PROTOCOL_VERSION);
    }
    function parseMessage(raw) {
      if (typeof raw !== "string" && !Buffer.isBuffer(raw)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: "message must be text" };
      const size = Buffer.byteLength(raw);
      if (size > MAX_MESSAGE_BYTES) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: `message exceeds ${MAX_MESSAGE_BYTES} bytes` };
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: "invalid JSON" };
      }
      return validateEnvelope(msg);
    }
    function validateEnvelope(msg) {
      if (!msg || typeof msg !== "object" || Array.isArray(msg)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: "envelope must be an object" };
      if (msg.protocol !== PROTOCOL) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: "unknown protocol" };
      if (!isCompatibleVersion(msg.protocolVersion)) return { ok: false, code: ErrorCode.PROTOCOL_MISMATCH, error: `protocol version ${msg.protocolVersion} is not compatible with ${PROTOCOL_VERSION}` };
      if (typeof msg.messageId !== "string" || msg.messageId.length < 3 || msg.messageId.length > 100) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: "invalid messageId" };
      if (!MessageType[msg.messageType]) return { ok: false, code: ErrorCode.UNSUPPORTED_MESSAGE, error: `unsupported messageType ${String(msg.messageType).slice(0, 40)}` };
      for (const k of ["sessionId", "projectId"]) if (msg[k] !== null && msg[k] !== void 0 && (typeof msg[k] !== "string" || msg[k].length > 100)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: `invalid ${k}` };
      if (typeof msg.timestamp !== "string" || !isoTs.test(msg.timestamp)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: "invalid timestamp" };
      if (!msg.payload || typeof msg.payload !== "object" || Array.isArray(msg.payload)) return { ok: false, code: ErrorCode.INVALID_MESSAGE, error: "payload must be an object" };
      return { ok: true, message: msg };
    }
    module2.exports = { PROTOCOL, PROTOCOL_VERSION, MAX_MESSAGE_BYTES, MessageType, PRE_AUTH, ErrorCode, createMessage, parseMessage, validateEnvelope, isCompatibleVersion };
  }
});

// src/bridge/bridgeServer.js
var require_bridgeServer = __commonJS({
  "src/bridge/bridgeServer.js"(exports2, module2) {
    var EventEmitter = require("events");
    var { WebSocketServer } = require_ws();
    var { randomId } = require_ids();
    var { MAX_MESSAGE_BYTES } = require_bridgeProtocol();
    var logger2 = require_logger();
    var WsConnection = class extends EventEmitter {
      constructor(ws, req) {
        super();
        this.ws = ws;
        this.id = randomId("sock");
        this.remote = req.socket.remoteAddress;
        this.origin = req.headers.origin || null;
        ws.on("message", (data) => this.emit("message", data.toString()));
        ws.on("close", () => this.emit("close"));
        ws.on("error", (err) => this.emit("error", err));
        ws.on("pong", () => this.emit("pong"));
      }
      send(text) {
        if (this.ws.readyState === 1) this.ws.send(text);
      }
      close(code = 1e3, reason = "") {
        try {
          this.ws.close(code, reason.slice(0, 100));
        } catch {
        }
      }
      terminate() {
        try {
          this.ws.terminate();
        } catch {
        }
      }
    };
    var WebSocketTransport = class extends EventEmitter {
      // originCheck(origin) -> boolean : decided by SecurityManager before the socket is accepted
      constructor({ host = "127.0.0.1", port, originCheck }) {
        super();
        if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error(`Bridge host must be loopback, got ${host}`);
        this.host = host;
        this.port = port;
        this.originCheck = originCheck;
        this.server = null;
      }
      start() {
        return new Promise((resolve, reject) => {
          const server = new WebSocketServer({
            host: this.host,
            port: this.port,
            maxPayload: MAX_MESSAGE_BYTES,
            verifyClient: (info, cb) => {
              const ok = this.originCheck ? this.originCheck(info.origin) : false;
              if (!ok) logger2.warn("BRIDGE", "rejected connection from disallowed origin");
              cb(ok, 403, "Origin not allowed");
            }
          });
          server.once("error", reject);
          server.once("listening", () => {
            this.server = server;
            this.port = server.address().port;
            server.on("connection", (ws, req) => this.emit("connection", new WsConnection(ws, req)));
            server.on("error", (err) => this.emit("error", err));
            resolve({ host: this.host, port: this.port });
          });
        });
      }
      stop() {
        return new Promise((resolve) => {
          if (!this.server) return resolve();
          for (const c of this.server.clients) c.terminate();
          this.server.close(() => {
            this.server = null;
            resolve();
          });
        });
      }
    };
    module2.exports = { WebSocketTransport, WsConnection };
  }
});

// src/bridge/securityManager.js
var require_securityManager = __commonJS({
  "src/bridge/securityManager.js"(exports2, module2) {
    var crypto = require("crypto");
    var { randomToken, randomId } = require_ids();
    var PAIRING_TTL_MS = 2 * 60 * 1e3;
    var sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
    function safeEqual(a, b) {
      const x = Buffer.from(String(a));
      const y = Buffer.from(String(b));
      return x.length === y.length && crypto.timingSafeEqual(x, y);
    }
    var SecurityManager = class {
      // secretStore: { get(key)->Promise<string|undefined>, store(key,value), delete(key) } (VS Code SecretStorage shape)
      constructor({ secretStore, ttlMs = PAIRING_TTL_MS, allowNoOrigin = false, now = () => Date.now() } = {}) {
        this.secretStore = secretStore;
        this.ttlMs = ttlMs;
        this.allowNoOrigin = allowNoOrigin;
        this.now = now;
        this.pending = /* @__PURE__ */ new Map();
        this.expired = /* @__PURE__ */ new Map();
        this.failures = /* @__PURE__ */ new Map();
      }
      // ---- pairing ----
      createPairingToken(projectId) {
        const token = randomToken(9).replace(/[-_]/g, "x").slice(0, 12).toUpperCase();
        const expiresAt = this.now() + this.ttlMs;
        this._sweep();
        this.pending.set(sha256(token), { expiresAt, projectId });
        return { token, expiresAt: new Date(expiresAt).toISOString() };
      }
      // Single use. Returns { ok, reason?, projectId? }.
      consumePairingToken(token) {
        if (typeof token !== "string") return { ok: false, reason: "missing" };
        const h = sha256(token.trim().toUpperCase());
        const rec = this.pending.get(h);
        if (!rec) return { ok: false, reason: this.expired.has(h) ? "expired" : "unknown" };
        this.pending.delete(h);
        if (rec.expiresAt < this.now()) return { ok: false, reason: "expired" };
        return { ok: true, projectId: rec.projectId };
      }
      _sweep() {
        for (const [h, v] of this.pending) if (v.expiresAt < this.now()) {
          this.pending.delete(h);
          this.expired.set(h, v.expiresAt);
        }
        for (const [h, at] of this.expired) if (this.now() - at > 10 * 6e4) this.expired.delete(h);
      }
      hasPendingToken() {
        this._sweep();
        return this.pending.size > 0;
      }
      cancelPairing() {
        this.pending.clear();
      }
      // ---- origin ----
      checkOrigin(origin, pinnedExtensionId) {
        if (!origin) return this.allowNoOrigin;
        const m = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
        if (!m) return false;
        return !pinnedExtensionId || pinnedExtensionId === m[1];
      }
      extensionIdFromOrigin(origin) {
        const m = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin || "");
        return m ? m[1] : null;
      }
      // ---- paired connections (persisted via SecretStorage; only a hash of the key is stored) ----
      async registerConnection({ projectId, extensionId, label }) {
        const connectionId = randomId("conn");
        const sessionKey = randomToken(32);
        const rec = { connectionId, keyHash: sha256(sessionKey), projectId, extensionId: extensionId || null, label: label || null, createdAt: new Date(this.now()).toISOString() };
        const all = await this._loadAll();
        all[connectionId] = rec;
        await this._saveAll(all);
        return { connectionId, sessionKey };
      }
      async verifyConnection(connectionId, sessionKey) {
        const all = await this._loadAll();
        const rec = all[connectionId];
        if (!rec || typeof sessionKey !== "string") return null;
        return safeEqual(rec.keyHash, sha256(sessionKey)) ? rec : null;
      }
      async revokeConnection(connectionId) {
        const all = await this._loadAll();
        const had = !!all[connectionId];
        delete all[connectionId];
        await this._saveAll(all);
        return had;
      }
      async revokeAll() {
        await this._saveAll({});
      }
      async listConnections() {
        return Object.values(await this._loadAll()).map(({ keyHash, ...rest }) => rest);
      }
      async _loadAll() {
        if (!this.secretStore) return this._mem || (this._mem = {});
        try {
          return JSON.parse(await this.secretStore.get("aiProject.bridge.connections") || "{}");
        } catch {
          return {};
        }
      }
      async _saveAll(all) {
        if (!this.secretStore) {
          this._mem = all;
          return;
        }
        await this.secretStore.store("aiProject.bridge.connections", JSON.stringify(all));
      }
      // ---- brute-force protection on the pairing/resume handshake ----
      recordFailure(remote) {
        const f = this.failures.get(remote) || { count: 0, until: 0 };
        f.count++;
        if (f.count >= 5) f.until = this.now() + 6e4;
        this.failures.set(remote, f);
      }
      isBlocked(remote) {
        const f = this.failures.get(remote);
        if (!f) return false;
        if (f.until && f.until < this.now()) {
          this.failures.delete(remote);
          return false;
        }
        return f.until > this.now();
      }
      clearFailures(remote) {
        this.failures.delete(remote);
      }
    };
    var RateLimiter = class {
      constructor({ perSecond = 200, burst = 400 } = {}) {
        this.perSecond = perSecond;
        this.burst = burst;
        this.tokens = burst;
        this.last = Date.now();
      }
      allow() {
        const now = Date.now();
        this.tokens = Math.min(this.burst, this.tokens + (now - this.last) / 1e3 * this.perSecond);
        this.last = now;
        if (this.tokens < 1) return false;
        this.tokens -= 1;
        return true;
      }
    };
    module2.exports = { SecurityManager, RateLimiter, sha256, safeEqual, PAIRING_TTL_MS };
  }
});

// src/bridge/connectionManager.js
var require_connectionManager = __commonJS({
  "src/bridge/connectionManager.js"(exports2, module2) {
    var EventEmitter = require("events");
    var { RateLimiter } = require_securityManager();
    var { MessageType, createMessage } = require_bridgeProtocol();
    var State = Object.freeze({ UNAUTHENTICATED: "UNAUTHENTICATED", PAIRING: "PAIRING", CONNECTED: "CONNECTED", CLOSED: "CLOSED" });
    var Connection = class {
      constructor(socket) {
        this.socket = socket;
        this.state = State.UNAUTHENTICATED;
        this.connectionId = null;
        this.session = null;
        this.extensionId = null;
        this.limiter = new RateLimiter();
        this.lastPong = Date.now();
        this.violations = 0;
        this.openedAt = Date.now();
      }
      send(msg) {
        this.socket.send(JSON.stringify(msg));
      }
      close(code, reason) {
        this.state = State.CLOSED;
        this.socket.close(code, reason);
      }
    };
    var ConnectionManager = class extends EventEmitter {
      constructor({ heartbeatMs = 15e3, timeoutMs = 45e3, authTimeoutMs = 15e4 } = {}) {
        super();
        this.connections = /* @__PURE__ */ new Map();
        this.heartbeatMs = heartbeatMs;
        this.timeoutMs = timeoutMs;
        this.authTimeoutMs = authTimeoutMs;
        this.timer = null;
      }
      add(socket) {
        const c = new Connection(socket);
        this.connections.set(socket.id, c);
        socket.on("close", () => {
          this.connections.delete(socket.id);
          c.state = State.CLOSED;
          this.emit("closed", c);
        });
        return c;
      }
      active() {
        return [...this.connections.values()].find((c) => c.state === State.CONNECTED) || null;
      }
      all() {
        return [...this.connections.values()];
      }
      startHeartbeat() {
        if (this.timer) return;
        this.timer = setInterval(() => {
          const now = Date.now();
          for (const c of this.connections.values()) {
            if (c.state === State.CONNECTED) {
              if (now - c.lastPong > this.timeoutMs) {
                this.emit("timeout", c);
                c.socket.terminate && c.socket.terminate();
                continue;
              }
              c.send(createMessage(MessageType.PING, { sessionId: c.session && c.session.sessionId, projectId: c.session && c.session.projectId, payload: {} }));
            } else if (now - c.openedAt > this.authTimeoutMs) {
              c.close(4001, "authentication timeout");
            }
          }
        }, this.heartbeatMs);
        if (this.timer.unref) this.timer.unref();
      }
      stopHeartbeat() {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }
      closeAll(code = 1001, reason = "bridge stopping") {
        for (const c of this.connections.values()) c.close(code, reason);
      }
    };
    module2.exports = { ConnectionManager, Connection, State };
  }
});

// src/bridge/sessionManager.js
var require_sessionManager = __commonJS({
  "src/bridge/sessionManager.js"(exports2, module2) {
    var { randomId } = require_ids();
    var SessionManager = class {
      constructor({ resumeWindowMs = 30 * 60 * 1e3 } = {}) {
        this.sessions = /* @__PURE__ */ new Map();
        this.byConnection = /* @__PURE__ */ new Map();
        this.resumeWindowMs = resumeWindowMs;
      }
      // Get-or-create the session for a paired connection.
      open({ connectionId, projectId, extensionId }) {
        const existingId = this.byConnection.get(connectionId);
        let s = existingId && this.sessions.get(existingId);
        if (s && Date.now() - s.lastSeen > this.resumeWindowMs) s = null;
        if (!s) {
          s = { sessionId: randomId("session"), connectionId, projectId, extensionId: extensionId || null, createdAt: (/* @__PURE__ */ new Date()).toISOString(), lastSeen: Date.now(), socketId: null, provider: null, activeAnalyses: /* @__PURE__ */ new Set(), completedMessages: /* @__PURE__ */ new Set() };
          this.sessions.set(s.sessionId, s);
          this.byConnection.set(connectionId, s.sessionId);
        }
        s.lastSeen = Date.now();
        return s;
      }
      attach(sessionId, socketId) {
        const s = this.sessions.get(sessionId);
        if (s) {
          s.socketId = socketId;
          s.lastSeen = Date.now();
        }
        return s;
      }
      detach(sessionId) {
        const s = this.sessions.get(sessionId);
        if (s) {
          s.socketId = null;
          s.lastSeen = Date.now();
        }
        return s;
      }
      get(sessionId) {
        return this.sessions.get(sessionId) || null;
      }
      touch(sessionId) {
        const s = this.sessions.get(sessionId);
        if (s) s.lastSeen = Date.now();
      }
      close(sessionId) {
        const s = this.sessions.get(sessionId);
        if (s) {
          this.byConnection.delete(s.connectionId);
          this.sessions.delete(sessionId);
        }
      }
      closeByConnection(connectionId) {
        const id = this.byConnection.get(connectionId);
        if (id) this.close(id);
      }
      list() {
        return [...this.sessions.values()];
      }
    };
    module2.exports = { SessionManager };
  }
});

// src/bridge/messageManager.js
var require_messageManager = __commonJS({
  "src/bridge/messageManager.js"(exports2, module2) {
    var { createMessage, MessageType } = require_bridgeProtocol();
    var MessageManager = class {
      constructor({ maxSeen = 2e3 } = {}) {
        this.seen = /* @__PURE__ */ new Map();
        this.maxSeen = maxSeen;
      }
      build(type, ctx) {
        return createMessage(type, ctx);
      }
      error(code, message, ctx = {}) {
        return createMessage(MessageType.ERROR, { ...ctx, payload: { code, message, ...ctx.details ? { details: ctx.details } : {} } });
      }
      warning(code, message, ctx = {}) {
        return createMessage(MessageType.WARNING, { ...ctx, payload: { code, message } });
      }
      isDuplicate(messageId) {
        return this.seen.has(messageId);
      }
      cachedReplies(messageId) {
        return this.seen.get(messageId) || [];
      }
      remember(messageId, replies = []) {
        this.seen.set(messageId, replies);
        if (this.seen.size > this.maxSeen) this.seen.delete(this.seen.keys().next().value);
      }
      addReply(messageId, serialized) {
        const list = this.seen.get(messageId);
        if (list) list.push(serialized);
      }
    };
    module2.exports = { MessageManager };
  }
});

// src/bridge/requestManager.js
var require_requestManager = __commonJS({
  "src/bridge/requestManager.js"(exports2, module2) {
    var RequestManager = class {
      constructor({ defaultTimeoutMs = 6e4 } = {}) {
        this.pending = /* @__PURE__ */ new Map();
        this.defaultTimeoutMs = defaultTimeoutMs;
      }
      // key: the messageId of the request. Resolves with the reply message.
      expect(key, { type, timeoutMs } = {}) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(key);
            const e = new Error(`Timed out waiting for reply to ${type || key}`);
            e.code = "TIMEOUT";
            reject(e);
          }, timeoutMs || this.defaultTimeoutMs);
          if (timer.unref) timer.unref();
          this.pending.set(key, { resolve, reject, timer, type });
        });
      }
      // Returns true when the message satisfied a pending request.
      fulfil(message) {
        const key = message.inReplyTo || message.payload && message.payload.requestId;
        const p = key && this.pending.get(key);
        if (!p) return false;
        clearTimeout(p.timer);
        this.pending.delete(key);
        p.resolve(message);
        return true;
      }
      rejectAll(reason) {
        for (const [key, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error(reason));
          this.pending.delete(key);
        }
      }
      get size() {
        return this.pending.size;
      }
    };
    module2.exports = { RequestManager };
  }
});

// src/bridge/responseManager.js
var require_responseManager = __commonJS({
  "src/bridge/responseManager.js"(exports2, module2) {
    var { MessageType, ErrorCode } = require_bridgeProtocol();
    var logger2 = require_logger();
    var ResponseManager = class {
      constructor({ messages }) {
        this.messages = messages;
        this.handlers = /* @__PURE__ */ new Map();
      }
      on(type, handler) {
        this.handlers.set(type, handler);
        return this;
      }
      // handler(message, ctx) -> Promise<Array<message>|message|void>; returned messages are sent back on the same connection.
      async dispatch(message, ctx) {
        if (this.messages.isDuplicate(message.messageId)) {
          logger2.debug("BRIDGE", "duplicate message; replaying cached replies", { type: message.messageType });
          return this.messages.cachedReplies(message.messageId).map((s) => JSON.parse(s));
        }
        this.messages.remember(message.messageId, []);
        const handler = this.handlers.get(message.messageType);
        if (!handler) return [this.messages.error(ErrorCode.UNSUPPORTED_MESSAGE, `No handler for ${message.messageType}`, { sessionId: ctx.session && ctx.session.sessionId, projectId: ctx.projectId, inReplyTo: message.messageId })];
        let out;
        try {
          out = await handler(message, ctx);
        } catch (err) {
          logger2.error("BRIDGE", "handler failed", { type: message.messageType, error: err.message });
          out = [this.messages.error(err.code && ErrorCode[err.code] ? err.code : ErrorCode.INTERNAL, err.message, { sessionId: ctx.session && ctx.session.sessionId, projectId: ctx.projectId, inReplyTo: message.messageId })];
        }
        const list = out === void 0 || out === null ? [] : Array.isArray(out) ? out : [out];
        for (const m of list) if (!m.inReplyTo) m.inReplyTo = message.messageId;
        for (const m of list) this.messages.addReply(message.messageId, JSON.stringify(m));
        return list;
      }
    };
    module2.exports = { ResponseManager };
  }
});

// src/bridge/analysisRunner.js
var require_analysisRunner = __commonJS({
  "src/bridge/analysisRunner.js"(exports2, module2) {
    var EventEmitter = require("events");
    var { MessageType, ErrorCode } = require_bridgeProtocol();
    var { validateKnowledgePackage } = require_schemaValidator();
    var logger2 = require_logger();
    var Status = Object.freeze({ AWAITING_ACCEPT: "AWAITING_ACCEPT", IN_PROGRESS: "IN_PROGRESS", PAUSED: "PAUSED", WAITING_PACKAGE: "WAITING_PACKAGE", COMPLETED: "COMPLETED", FAILED: "FAILED", CANCELLED: "CANCELLED", DISCONNECTED: "DISCONNECTED" });
    var LIVE = /* @__PURE__ */ new Set([Status.AWAITING_ACCEPT, Status.IN_PROGRESS, Status.PAUSED, Status.WAITING_PACKAGE, Status.DISCONNECTED, Status.FAILED]);
    var AnalysisRunner = class extends EventEmitter {
      constructor({ bridge, history }) {
        super();
        this.bridge = bridge;
        this.history = history;
        this.runs = /* @__PURE__ */ new Map();
      }
      register(router) {
        const M = MessageType;
        router.on(M.ANALYSIS_ACCEPTED, (m, c) => this._accepted(m, c));
        router.on(M.ANALYSIS_BATCH_ACK, (m, c) => this._batchAck(m, c));
        router.on(M.ANALYSIS_PROGRESS, (m, c) => this._progress(m, c));
        router.on(M.AI_RESPONSE, (m, c) => this._aiResponse(m, c));
        router.on(M.ANALYSIS_COMPLETE, (m, c) => this._complete(m, c));
        router.on(M.KNOWLEDGE_PACKAGE, (m, c) => this._package(m, c));
        router.on(M.KNOWLEDGE_MERGE_REQUEST, (m, c) => this._package({ ...m, payload: { package: m.payload.package || m.payload } }, c));
        router.on(M.PAUSE_REQUEST, (m, c) => this._peerControl("pause", m, c));
        router.on(M.RESUME_REQUEST, (m, c) => this._peerControl("resume", m, c));
        router.on(M.CANCEL_REQUEST, (m, c) => this._peerControl("cancel", m, c));
        router.on(M.RETRY_REQUEST, (m, c) => this._peerControl("retry", m, c));
      }
      // ---- public API ----
      // batches: from contextBuilder. Sends ANALYSIS_REQUEST; batches follow once Chrome accepts.
      async start({ analysisId, mode, purpose, intent = "UNDERSTAND", batches, stats, provider, completedBatchIds = [], resume = false }) {
        if (this.runs.has(analysisId) && LIVE.has(this.runs.get(analysisId).status) && !resume) throw new Error(`${analysisId} is already running`);
        const done = new Set(completedBatchIds);
        const run = { analysisId, mode, purpose, intent, batches, stats, provider: provider || null, status: Status.AWAITING_ACCEPT, done, failed: /* @__PURE__ */ new Set(), current: null, paused: false, partials: {}, startedAt: Date.now(), error: null, stage: "Waiting for Chrome to accept", progress: null };
        this.runs.set(analysisId, run);
        await this.history.update(analysisId, { status: "SENT", provider: run.provider, batches: batches.map((b) => ({ batchId: b.batchId, files: b.context.files.map((f) => ({ path: f.path, hash: f.hash })), estimatedTokens: b.estimatedTokens })) });
        this.bridge.send(MessageType.ANALYSIS_REQUEST, {
          analysisId,
          mode,
          purpose,
          intent,
          providerHint: run.provider,
          resume,
          totalBatches: batches.length,
          completedBatchIds: [...done],
          estimatedTokens: batches.reduce((n, b) => n + b.estimatedTokens, 0),
          files: [...new Map(batches.flatMap((b) => b.context.files.map((f) => [f.path, { path: f.path, hash: f.hash }]))).values()],
          secretsRedacted: stats ? stats.secretsRedacted : 0,
          secrets: stats ? stats.secrets : []
        });
        this._emit(run);
        return this.snapshot(run);
      }
      pause(analysisId) {
        const r = this._run(analysisId);
        r.paused = true;
        r.status = Status.PAUSED;
        r.stage = "Paused";
        this._safeSend(MessageType.PAUSE_REQUEST, { analysisId });
        this._persist(r, "PAUSED");
        this._emit(r);
      }
      resume(analysisId) {
        const r = this._run(analysisId);
        r.failed.clear();
        r.error = null;
        r.paused = false;
        r.status = Status.IN_PROGRESS;
        r.stage = "Resumed";
        this._safeSend(MessageType.RESUME_REQUEST, { analysisId });
        this._persist(r, "IN_PROGRESS");
        if (!r.current) this._sendNext(r);
        this._emit(r);
      }
      cancel(analysisId) {
        const r = this._run(analysisId);
        r.status = Status.CANCELLED;
        r.stage = "Cancelled";
        this._safeSend(MessageType.CANCEL_REQUEST, { analysisId });
        this._persist(r, "CANCELLED");
        this._emit(r);
      }
      retry(analysisId, batchId) {
        const r = this._run(analysisId);
        const id = batchId || r.current && r.current.batchId || [...r.failed][0];
        const b = r.batches.find((x) => x.batchId === id);
        if (!b) throw new Error(`No batch to retry in ${analysisId}`);
        r.failed.delete(id);
        r.done.delete(id);
        r.status = Status.IN_PROGRESS;
        r.error = null;
        r.paused = false;
        this._sendBatch(r, b);
        this._emit(r);
      }
      skip(analysisId, batchId) {
        const r = this._run(analysisId);
        const id = batchId || r.current && r.current.batchId || [...r.failed][0];
        if (!id) throw new Error("No batch to skip");
        r.failed.delete(id);
        r.done.add(id);
        r.current = null;
        if (r.status === Status.FAILED) r.status = Status.IN_PROGRESS;
        this._sendNext(r);
        this._emit(r);
      }
      summary() {
        const live = [...this.runs.values()].filter((r) => LIVE.has(r.status)).pop();
        return live ? this.snapshot(live) : null;
      }
      list() {
        return [...this.runs.values()].map((r) => this.snapshot(r));
      }
      snapshot(r) {
        return { analysisId: r.analysisId, mode: r.mode, purpose: r.purpose, status: r.status, stage: r.stage, provider: r.provider, batchNumber: r.current ? r.current.batchNumber : Math.min(r.done.size + 1, r.batches.length), totalBatches: r.batches.length, completedBatches: [...r.done], failedBatches: [...r.failed], estimatedTokens: r.batches.reduce((n, b) => n + b.estimatedTokens, 0), filesTotal: new Set(r.batches.flatMap((b) => b.context.files.map((f) => f.path))).size, filesDone: new Set(r.batches.filter((b) => r.done.has(b.batchId)).flatMap((b) => b.context.files.map((f) => f.path))).size, error: r.error, progress: r.progress };
      }
      // ---- session recovery ----
      async resumableFor() {
        const out = [];
        for (const r of this.runs.values()) if ([Status.DISCONNECTED, Status.IN_PROGRESS, Status.AWAITING_ACCEPT, Status.PAUSED, Status.FAILED].includes(r.status)) out.push({ analysisId: r.analysisId, completedBatchIds: [...r.done], totalBatches: r.batches.length, status: r.status });
        if (this.history) {
          for (const h of await this.history.resumable()) if (!out.some((o) => o.analysisId === h.analysisId)) out.push({ analysisId: h.analysisId, completedBatchIds: [...this.history.completedBatchIds(h)], totalBatches: h.batches.length, status: h.status, inMemory: false });
        }
        return out;
      }
      // Continue every in-memory analysis that lost its Chrome connection.
      resumeAfterReconnect() {
        for (const r of this.runs.values()) {
          if (r.status !== Status.DISCONNECTED) continue;
          r.status = Status.AWAITING_ACCEPT;
          r.stage = "Reconnected: waiting for Chrome to accept";
          r.current = null;
          this.bridge.send(MessageType.ANALYSIS_REQUEST, { analysisId: r.analysisId, mode: r.mode, purpose: r.purpose, intent: r.intent, providerHint: r.provider, resume: true, totalBatches: r.batches.length, completedBatchIds: [...r.done], estimatedTokens: r.batches.reduce((n, b) => n + b.estimatedTokens, 0), files: [] });
          this._persist(r, "SENT");
          this._emit(r);
        }
      }
      onDisconnected() {
        for (const r of this.runs.values()) if ([Status.AWAITING_ACCEPT, Status.IN_PROGRESS, Status.PAUSED, Status.WAITING_PACKAGE].includes(r.status)) {
          r.status = Status.DISCONNECTED;
          r.stage = "Chrome disconnected: progress saved";
          r.current = null;
          this._persist(r, "DISCONNECTED");
          this._emit(r);
        }
      }
      onBridgeStopped() {
        this.onDisconnected();
      }
      // ---- inbound handlers ----
      _find(m) {
        const id = m.payload.analysisId;
        const r = id && this.runs.get(id);
        return r || null;
      }
      _unknown(m, ctx) {
        return this.bridge.messages.error(ErrorCode.ANALYSIS_UNKNOWN, `Unknown analysisId ${String(m.payload.analysisId).slice(0, 40)}`, { sessionId: ctx.session.sessionId, projectId: ctx.projectId, inReplyTo: m.messageId });
      }
      async _accepted(m, ctx) {
        const r = this._find(m);
        if (!r) return this._unknown(m, ctx);
        if (m.payload.provider) {
          r.provider = String(m.payload.provider).slice(0, 60);
          this.bridge.setProvider(r.provider);
        }
        if (m.payload.accepted === false) {
          r.status = Status.CANCELLED;
          r.stage = `Chrome declined: ${String(m.payload.reason || "no reason given").slice(0, 200)}`;
          await this._persist(r, "CANCELLED");
          this._emit(r);
          return;
        }
        r.status = Status.IN_PROGRESS;
        r.stage = "Sending batches";
        await this._persist(r, "IN_PROGRESS");
        this._sendNext(r);
        this._emit(r);
      }
      async _batchAck(m, ctx) {
        const r = this._find(m);
        if (!r) return this._unknown(m, ctx);
        r.stage = `Batch ${m.payload.batchId} received by Chrome`;
        this._emit(r);
      }
      async _progress(m, ctx) {
        const r = this._find(m);
        if (!r) return this._unknown(m, ctx);
        r.stage = String(m.payload.stage || m.payload.message || r.stage).slice(0, 200);
        r.progress = typeof m.payload.percent === "number" ? m.payload.percent : r.progress;
        if (m.payload.provider) r.provider = String(m.payload.provider).slice(0, 60);
        this._emit(r);
      }
      async _aiResponse(m, ctx) {
        const r = this._find(m);
        if (!r) return this._unknown(m, ctx);
        const { batchId, status } = m.payload;
        const batch = r.batches.find((b) => b.batchId === batchId);
        if (!batch) return this.bridge.messages.error(ErrorCode.SCHEMA_INVALID, `Unknown batch ${String(batchId).slice(0, 40)}`, { sessionId: ctx.session.sessionId, projectId: ctx.projectId, inReplyTo: m.messageId });
        if (status === "COMPLETED") {
          r.done.add(batchId);
          r.failed.delete(batchId);
          if (r.status === Status.FAILED) {
            r.status = Status.IN_PROGRESS;
            r.error = null;
          }
          if (m.payload.knowledge && typeof m.payload.knowledge === "object") r.partials[batchId] = m.payload.knowledge;
          await this.history.checkpoint(r.analysisId, { batchId, status: "completed", responseReceived: true, knowledgeMerged: false });
          r.current = null;
          r.stage = `Batch ${batch.batchNumber}/${r.batches.length} complete`;
          const ack = this.bridge.messages.build(MessageType.AI_RESPONSE_ACK, { sessionId: ctx.session.sessionId, projectId: ctx.projectId, payload: { analysisId: r.analysisId, batchId, checkpointed: true } });
          this._emit(r);
          setImmediate(() => {
            if (!r.paused && r.status === Status.IN_PROGRESS) this._sendNext(r);
          });
          return ack;
        }
        r.failed.add(batchId);
        r.error = String(m.payload.error || "AI response failed").slice(0, 500);
        r.stage = `Batch ${batch.batchNumber} failed: ${r.error}`;
        r.current = null;
        r.status = Status.FAILED;
        await this.history.checkpoint(r.analysisId, { batchId, status: "failed", responseReceived: false, knowledgeMerged: false });
        await this._persist(r, "FAILED");
        this._emit(r);
        return this.bridge.messages.build(MessageType.AI_RESPONSE_ACK, { sessionId: ctx.session.sessionId, projectId: ctx.projectId, payload: { analysisId: r.analysisId, batchId, checkpointed: false, failed: true } });
      }
      async _complete(m, ctx) {
        const r = this._find(m);
        if (!r) return this._unknown(m, ctx);
        r.status = Status.WAITING_PACKAGE;
        r.stage = "Waiting for knowledge package";
        this._emit(r);
      }
      async _package(m, ctx) {
        const pkg = m.payload.package || m.payload;
        const M = MessageType;
        const base = { sessionId: ctx.session.sessionId, projectId: ctx.projectId };
        const reject = (code, errors) => [this.bridge.messages.build(M.KNOWLEDGE_PACKAGE_ACK, { ...base, payload: { analysisId: pkg && pkg.analysisId, accepted: false, code, errors } })];
        const v = validateKnowledgePackage(pkg);
        if (!v.valid) return reject(ErrorCode.SCHEMA_INVALID, v.errors);
        if (pkg.projectId !== ctx.projectId) return reject(ErrorCode.PROJECT_MISMATCH, ["projectId does not match the open project"]);
        const r = this.runs.get(pkg.analysisId);
        const rec = r ? null : await this.history.get(pkg.analysisId);
        if (!r && !rec) return reject(ErrorCode.ANALYSIS_UNKNOWN, [`analysisId ${pkg.analysisId} was not issued by this project`]);
        if (r && [Status.CANCELLED].includes(r.status)) return reject(ErrorCode.ANALYSIS_UNKNOWN, ["analysis was cancelled"]);
        if (!this.bridge.services.onKnowledgePackage) return reject(ErrorCode.INTERNAL, ["knowledge processing is not available"]);
        let result;
        try {
          result = await this.bridge.services.onKnowledgePackage(pkg, { provider: pkg.source.provider, run: r });
        } catch (err) {
          logger2.error("KNOWLEDGE", "package processing failed", { error: err.message });
          return reject(ErrorCode.INTERNAL, [err.message]);
        }
        if (r) {
          r.status = Status.COMPLETED;
          r.stage = "Knowledge reconciled";
          r.progress = 100;
          await this._persist(r, "COMPLETED");
          this._emit(r);
        }
        return [
          this.bridge.messages.build(M.KNOWLEDGE_PACKAGE_ACK, { ...base, payload: { analysisId: pkg.analysisId, accepted: true, counts: result.report.counts, stale: result.report.stale, rejected: result.report.rejected } }),
          this.bridge.messages.build(M.KNOWLEDGE_MERGE_RESULT, { ...base, payload: { analysisId: pkg.analysisId, changes: result.changes, conflicts: result.report.conflicts, unverified: result.report.unverified, coverage: result.coverage } })
        ];
      }
      async _peerControl(kind, m, ctx) {
        const r = this._find(m);
        if (!r) return this._unknown(m, ctx);
        if (kind === "pause") {
          r.paused = true;
          r.status = Status.PAUSED;
          r.stage = "Paused from Chrome";
          await this._persist(r, "PAUSED");
        }
        if (kind === "resume") {
          r.failed.clear();
          r.error = null;
          r.paused = false;
          r.status = Status.IN_PROGRESS;
          r.stage = "Resumed from Chrome";
          await this._persist(r, "IN_PROGRESS");
          if (!r.current) this._sendNext(r);
        }
        if (kind === "cancel") {
          r.status = Status.CANCELLED;
          r.stage = "Cancelled from Chrome";
          await this._persist(r, "CANCELLED");
        }
        if (kind === "retry" && m.payload.skip) {
          r.failed.delete(m.payload.batchId);
          r.done.add(m.payload.batchId);
          r.current = null;
          if (r.status === Status.FAILED) r.status = Status.IN_PROGRESS;
          await this.history.checkpoint(r.analysisId, { batchId: m.payload.batchId, status: "skipped", responseReceived: false, knowledgeMerged: false });
          this._emit(r);
          this._sendNext(r);
          return;
        }
        if (kind === "retry") {
          const id = m.payload.batchId;
          const b = r.batches.find((x) => x.batchId === id);
          if (b) {
            r.failed.delete(id);
            r.done.delete(id);
            r.status = Status.IN_PROGRESS;
            this._sendBatch(r, b);
          }
        }
        this._emit(r);
      }
      // ---- internals ----
      _sendNext(r) {
        if (r.paused || r.status === Status.CANCELLED) return;
        const next = r.batches.find((b) => !r.done.has(b.batchId) && !r.failed.has(b.batchId));
        if (!next) {
          if (r.failed.size === 0) {
            r.status = Status.WAITING_PACKAGE;
            r.stage = "All batches complete: waiting for knowledge package";
          } else {
            r.status = Status.FAILED;
            r.stage = "Some batches failed";
            this._persist(r, "FAILED");
          }
          this._emit(r);
          return;
        }
        this._sendBatch(r, next);
      }
      _sendBatch(r, batch) {
        r.current = batch;
        r.stage = `Sent batch ${batch.batchNumber}/${r.batches.length}`;
        try {
          this.bridge.send(MessageType.ANALYSIS_BATCH, { ...batch, crossBatchFindings: this._priorFindings(r, batch) });
        } catch (err) {
          this.onDisconnected();
          return;
        }
        this._emit(r);
      }
      // Partial knowledge from earlier batches, summarized as structured context for later ones.
      _priorFindings(r, batch) {
        return batch.batchNumber > 1 ? r.batches.filter((b) => b.batchNumber < batch.batchNumber && r.partials[b.batchId]).map((b) => ({ batchId: b.batchId, knowledge: r.partials[b.batchId] })) : [];
      }
      _run(id) {
        const r = this.runs.get(id);
        if (!r) throw new Error(`Unknown analysis ${id}`);
        return r;
      }
      _safeSend(type, payload) {
        try {
          this.bridge.send(type, payload);
        } catch {
        }
      }
      async _persist(r, status) {
        try {
          await this.history.update(r.analysisId, { status });
        } catch (e) {
          logger2.warn("ANALYSIS", "history update failed", { error: e.message });
        }
      }
      _emit(r) {
        this.emit("updated", this.snapshot(r));
        this.bridge.emit("analysis", this.snapshot(r));
        this.bridge.emit("status", this.bridge.getStatus());
      }
    };
    module2.exports = { AnalysisRunner, Status };
  }
});

// src/bridge/chromeBridge.js
var require_chromeBridge = __commonJS({
  "src/bridge/chromeBridge.js"(exports2, module2) {
    var EventEmitter = require("events");
    var { WebSocketTransport } = require_bridgeServer();
    var { ConnectionManager, State } = require_connectionManager();
    var { SessionManager } = require_sessionManager();
    var { SecurityManager } = require_securityManager();
    var { MessageManager } = require_messageManager();
    var { RequestManager } = require_requestManager();
    var { ResponseManager } = require_responseManager();
    var { AnalysisRunner } = require_analysisRunner();
    var { MessageType, PRE_AUTH, ErrorCode, PROTOCOL_VERSION, parseMessage, createMessage } = require_bridgeProtocol();
    var logger2 = require_logger();
    var ChromeBridge = class extends EventEmitter {
      /**
       * @param {object} o
       * @param {() => object|null} o.getProject           current project {projectId,name,...} or null
       * @param {(info) => Promise<boolean>} o.confirmPairing  user confirmation UI
       * @param {object} o.services                        { history, onKnowledgePackage, onChangeProposal, onDocumentation, onComparison, onBlueprint }
       * @param {object} [o.secretStore]                   VS Code SecretStorage-shaped store
       * @param {Function} [o.transportFactory]            (opts) => transport; defaults to WebSocketTransport
       */
      constructor({ getProject, confirmPairing, services = {}, secretStore, host = "127.0.0.1", port = 47821, transportFactory, allowNoOrigin = false, heartbeatMs, timeoutMs, pairingTtlMs }) {
        super();
        this.getProject = getProject;
        this.confirmPairing = confirmPairing;
        this.services = services;
        this.host = host;
        this.port = port;
        this.security = new SecurityManager({ secretStore, allowNoOrigin, ttlMs: pairingTtlMs });
        this.connections = new ConnectionManager({ heartbeatMs, timeoutMs });
        this.sessions = new SessionManager();
        this.messages = new MessageManager();
        this.requests = new RequestManager();
        this.router = new ResponseManager({ messages: this.messages });
        this.transportFactory = transportFactory || ((o) => new WebSocketTransport(o));
        this.transport = null;
        this.pairingRecord = null;
        this.runner = new AnalysisRunner({ bridge: this, history: services.history });
        this._registerHandlers();
        this.connections.on("closed", (c) => this._onClosed(c));
        this.connections.on("timeout", (c) => logger2.warn("BRIDGE", "heartbeat timeout", { connectionId: c.connectionId }));
      }
      // ---- lifecycle ----
      // Listens on the configured port; if another VS Code window (another project) already uses it, the next free port is taken.
      // The pairing code includes the port, so the user never has to know which one was chosen.
      async start() {
        if (this.transport) return this.getStatus();
        const base = this.port;
        for (let i = 0; i < 10; i++) {
          const port = base === 0 ? 0 : base + i;
          const t = this.transportFactory({ host: this.host, port, originCheck: (origin) => this._originAllowed(origin) });
          t.on("connection", (sock) => this._onConnection(sock));
          t.on("error", (err) => {
            logger2.error("BRIDGE", "transport error", { error: err.message });
            this.emit("status", this.getStatus());
          });
          let bound;
          try {
            bound = await t.start();
          } catch (err) {
            if (err.code === "EADDRINUSE" && base !== 0) {
              logger2.warn("BRIDGE", `port ${port} is in use (another project window?); trying the next one`);
              continue;
            }
            throw err;
          }
          this.transport = t;
          this.port = bound.port;
          this.connections.startHeartbeat();
          logger2.info("BRIDGE", "listening", { host: bound.host, port: bound.port });
          this.emit("status", this.getStatus());
          return this.getStatus();
        }
        const e = new Error(`Ports ${base}-${base + 9} are all in use. Close the other AI Project windows or change aiProject.chromeBridgePort.`);
        e.code = "EADDRINUSE";
        throw e;
      }
      async stop() {
        this.runner.onBridgeStopped();
        this.connections.stopHeartbeat();
        this.connections.closeAll();
        this.requests.rejectAll("bridge stopped");
        this.security.cancelPairing();
        if (this.transport) {
          await this.transport.stop();
          this.transport = null;
        }
        this.emit("status", this.getStatus());
      }
      async startPairing() {
        const project = this.getProject();
        if (!project) {
          const e = new Error("Initialize the project before pairing Chrome.");
          e.code = "NOT_INITIALIZED";
          throw e;
        }
        await this.start();
        const { token, expiresAt } = this.security.createPairingToken(project.projectId);
        this.pairingRecord = { expiresAt };
        logger2.info("BRIDGE", "pairing started", { expiresAt });
        this.emit("status", this.getStatus());
        return { token, code: `${this.port}-${token}`, expiresAt, host: this.host, port: this.port, projectId: project.projectId };
      }
      async disconnect({ revoke = false } = {}) {
        const c = this.connections.active();
        if (c) {
          if (revoke && c.connectionId) {
            await this.security.revokeConnection(c.connectionId);
            this.sessions.closeByConnection(c.connectionId);
          }
          c.close(1e3, "disconnected by VS Code");
        } else if (revoke) await this.security.revokeAll();
        this.emit("status", this.getStatus());
      }
      getStatus() {
        const c = this.connections.active();
        const project = this.getProject && this.getProject();
        let state = "STOPPED";
        if (this.transport) state = c ? "CONNECTED" : this.security.hasPendingToken() ? "PAIRING" : "LISTENING";
        return {
          state,
          host: this.host,
          port: this.port,
          protocolVersion: PROTOCOL_VERSION,
          projectId: project ? project.projectId : null,
          sessionId: c && c.session ? c.session.sessionId : null,
          connectionId: c ? c.connectionId : null,
          provider: c && c.session ? c.session.provider : null,
          extensionId: c ? c.extensionId : null,
          pairingExpiresAt: this.security.hasPendingToken() && this.pairingRecord ? this.pairingRecord.expiresAt : null,
          activeAnalysis: this.runner.summary()
        };
      }
      // ---- sending ----
      activeConnection() {
        return this.connections.active();
      }
      send(type, payload, { inReplyTo } = {}) {
        const c = this.connections.active();
        if (!c) {
          const e = new Error("Chrome is not connected.");
          e.code = "CHROME_UNAVAILABLE";
          throw e;
        }
        const msg = createMessage(type, { sessionId: c.session.sessionId, projectId: c.session.projectId, payload, inReplyTo });
        c.send(msg);
        return msg;
      }
      // Send and wait for the correlated reply.
      request(type, payload, { timeoutMs } = {}) {
        const c = this.connections.active();
        if (!c) return Promise.reject(Object.assign(new Error("Chrome is not connected."), { code: "CHROME_UNAVAILABLE" }));
        const msg = createMessage(type, { sessionId: c.session.sessionId, projectId: c.session.projectId, payload });
        const p = this.requests.expect(msg.messageId, { type, timeoutMs });
        c.send(msg);
        return p;
      }
      // ---- inbound ----
      _originAllowed(origin) {
        return this.security.checkOrigin(origin, this._pinnedExtensionId);
      }
      _onConnection(sock) {
        if (this.security.isBlocked(sock.remote)) {
          sock.close(4029, "too many failed attempts");
          return;
        }
        const conn = this.connections.add(sock);
        conn.extensionId = this.security.extensionIdFromOrigin(sock.origin);
        sock.on("message", (raw) => this._onRaw(conn, raw));
        sock.on("error", (err) => logger2.warn("BRIDGE", "socket error", { error: err.message }));
        sock.on("pong", () => {
          conn.lastPong = Date.now();
        });
        this.emit("status", this.getStatus());
      }
      async _onRaw(conn, raw) {
        if (!conn.limiter.allow()) {
          conn.send(this.messages.error(ErrorCode.RATE_LIMITED, "Too many messages.", {}));
          if (++conn.violations > 3) conn.close(4008, "rate limited");
          return;
        }
        const parsed = parseMessage(raw);
        if (!parsed.ok) {
          conn.send(this.messages.error(parsed.code, parsed.error, {}));
          if (++conn.violations > 5) conn.close(4e3, "protocol violations");
          return;
        }
        const msg = parsed.message;
        conn.lastPong = Date.now();
        if (conn.state !== State.CONNECTED && !PRE_AUTH.has(msg.messageType)) {
          conn.send(this.messages.error(ErrorCode.UNAUTHENTICATED, "Pair or resume the session first.", { inReplyTo: msg.messageId }));
          if (++conn.violations > 3) conn.close(4003, "unauthenticated");
          return;
        }
        if (conn.state === State.CONNECTED) {
          const project = this.getProject();
          if (msg.sessionId !== conn.session.sessionId) {
            conn.send(this.messages.error(ErrorCode.SESSION_MISMATCH, "sessionId does not match this connection.", { sessionId: conn.session.sessionId, inReplyTo: msg.messageId }));
            return;
          }
          if (!project || msg.projectId && msg.projectId !== project.projectId) {
            conn.send(this.messages.error(ErrorCode.PROJECT_MISMATCH, "projectId does not match the open project.", { sessionId: conn.session.sessionId, inReplyTo: msg.messageId }));
            return;
          }
          this.sessions.touch(conn.session.sessionId);
        }
        if (this.requests.fulfil(msg)) return;
        const replies = await this.router.dispatch(msg, { conn, session: conn.session, projectId: conn.session && conn.session.projectId, bridge: this });
        for (const r of replies) conn.send(r);
      }
      _onClosed(conn) {
        if (conn.session) {
          this.sessions.detach(conn.session.sessionId);
          this.runner.onDisconnected(conn.session.sessionId);
        }
        this.emit("status", this.getStatus());
      }
      // ---- handlers ----
      _registerHandlers() {
        const M = MessageType;
        const r = this.router;
        r.on(M.PING, async (m, ctx) => this.messages.build(M.PONG, { sessionId: ctx.session && ctx.session.sessionId, projectId: ctx.projectId, payload: { nonce: m.payload.nonce } }));
        r.on(M.PONG, async (m, ctx) => {
          ctx.conn.lastPong = Date.now();
        });
        r.on(M.PAIR_REQUEST, (m, ctx) => this._handlePair(m, ctx));
        r.on(M.SESSION_RESUME, (m, ctx) => this._handleResume(m, ctx));
        r.on(M.PROJECT_REGISTER_RESPONSE, async () => {
        });
        r.on(M.ERROR, async (m) => {
          logger2.warn("BRIDGE", "peer reported error", { code: m.payload.code });
          this.emit("peer-error", m.payload);
        });
        r.on(M.WARNING, async (m) => {
          logger2.warn("BRIDGE", "peer warning", { code: m.payload.code });
          this.emit("peer-warning", m.payload);
        });
        r.on(M.CHANGE_PROPOSAL, (m, ctx) => this._svc("onChangeProposal", m, ctx));
        r.on(M.DOCUMENTATION_RESPONSE, (m, ctx) => this._svc("onDocumentation", m, ctx));
        r.on(M.COMPARISON_RESPONSE, (m, ctx) => this._svc("onComparison", m, ctx));
        r.on(M.BLUEPRINT_RESPONSE, (m, ctx) => this._svc("onBlueprint", m, ctx));
        this.runner.register(r);
      }
      // Service handlers return undefined, or { code, message } which is relayed to Chrome as a WARNING (informational) message.
      async _svc(name, m, ctx) {
        const base = { sessionId: ctx.session.sessionId, projectId: ctx.projectId };
        const fn = this.services[name];
        if (!fn) return this.messages.warning("NOT_SUPPORTED", `${name} is not available`, base);
        try {
          const out = await fn(m.payload, ctx);
          this.emit(name, m.payload);
          return out && out.code ? this.messages.warning(out.code, out.message, base) : void 0;
        } catch (err) {
          const code = { SCHEMA_MISMATCH: ErrorCode.SCHEMA_INVALID, PROJECT_MISMATCH: ErrorCode.PROJECT_MISMATCH }[err.code] || ErrorCode.INTERNAL;
          return this.messages.error(code, err.message, { ...base, details: err.details });
        }
      }
      async _handlePair(m, ctx) {
        const conn = ctx.conn;
        const p = m.payload;
        const fail = (code, message) => {
          this.security.recordFailure(conn.socket.remote);
          return [this.messages.build(MessageType.PAIR_RESPONSE, { payload: { accepted: false, code, message } })];
        };
        const ver = String(p.protocolVersion || m.protocolVersion);
        if (ver.split(".")[0] !== PROTOCOL_VERSION.split(".")[0]) {
          const out = fail(ErrorCode.PROTOCOL_MISMATCH, `Compatible versions required: VS Code speaks ${PROTOCOL_VERSION}, Chrome sent ${ver}.`);
          setTimeout(() => conn.close(4002, "protocol mismatch"), 50);
          return out;
        }
        const res = this.security.consumePairingToken(p.pairingToken);
        if (!res.ok) {
          const out = fail(res.reason === "expired" ? ErrorCode.TOKEN_EXPIRED : ErrorCode.PAIRING_FAILED, res.reason === "expired" ? 'Pairing token expired. Run "AI Project: Pair Chrome" again.' : "Invalid pairing token.");
          setTimeout(() => conn.close(4003, "pairing failed"), 50);
          return out;
        }
        const project = this.getProject();
        if (!project || project.projectId !== res.projectId) return fail(ErrorCode.PROJECT_MISMATCH, "The pairing token was issued for a different project.");
        conn.state = State.PAIRING;
        const info = { extensionId: conn.extensionId, clientName: String(p.clientName || "Chrome extension").slice(0, 80), clientVersion: String(p.clientVersion || "").slice(0, 20), projectName: project.name };
        let accepted = false;
        try {
          accepted = await this.confirmPairing(info);
        } catch {
          accepted = false;
        }
        if (!accepted) {
          setTimeout(() => conn.close(4004, "pairing rejected"), 50);
          return [this.messages.build(MessageType.PAIR_RESPONSE, { payload: { accepted: false, code: ErrorCode.PAIRING_REJECTED, message: "Pairing was rejected in VS Code." } })];
        }
        const { connectionId, sessionKey } = await this.security.registerConnection({ projectId: project.projectId, extensionId: conn.extensionId, label: info.clientName });
        return this._establish(conn, { connectionId, projectId: project.projectId, extensionId: conn.extensionId }, (session) => this.messages.build(MessageType.PAIR_RESPONSE, {
          sessionId: session.sessionId,
          projectId: project.projectId,
          payload: { accepted: true, connectionId, sessionId: session.sessionId, sessionKey, projectId: project.projectId, projectName: project.name, protocolVersion: PROTOCOL_VERSION }
        }));
      }
      async _handleResume(m, ctx) {
        const conn = ctx.conn;
        const p = m.payload;
        const rec = await this.security.verifyConnection(p.connectionId, p.sessionKey);
        const project = this.getProject();
        if (!rec || !project || rec.projectId !== project.projectId) {
          this.security.recordFailure(conn.socket.remote);
          setTimeout(() => conn.close(4003, "resume failed"), 50);
          return [this.messages.build(MessageType.SESSION_RESUME_RESPONSE, { payload: { accepted: false, code: ErrorCode.UNAUTHENTICATED, message: "Unknown or revoked connection. Pair again." } })];
        }
        if (rec.extensionId && conn.extensionId && rec.extensionId !== conn.extensionId) {
          setTimeout(() => conn.close(4003, "origin mismatch"), 50);
          return [this.messages.build(MessageType.SESSION_RESUME_RESPONSE, { payload: { accepted: false, code: ErrorCode.UNAUTHENTICATED, message: "Extension identity changed. Pair again." } })];
        }
        this.security.clearFailures(conn.socket.remote);
        return this._establish(conn, { connectionId: rec.connectionId, projectId: rec.projectId, extensionId: rec.extensionId }, async (session) => {
          const resumable = await this.runner.resumableFor(session);
          return this.messages.build(MessageType.SESSION_RESUME_RESPONSE, { sessionId: session.sessionId, projectId: project.projectId, payload: { accepted: true, connectionId: rec.connectionId, sessionId: session.sessionId, projectId: project.projectId, resumable } });
        }, { resumed: true });
      }
      async _establish(conn, { connectionId, projectId, extensionId }, buildReply, { resumed = false } = {}) {
        for (const other of this.connections.all()) if (other !== conn && other.state === State.CONNECTED) other.close(4005, "replaced by a newer connection");
        const session = this.sessions.open({ connectionId, projectId, extensionId });
        this.sessions.attach(session.sessionId, conn.socket.id);
        conn.connectionId = connectionId;
        conn.session = session;
        conn.state = State.CONNECTED;
        conn.lastPong = Date.now();
        this._pinnedExtensionId = extensionId || this._pinnedExtensionId;
        const reply = await buildReply(session);
        const project = this.getProject();
        const register = createMessage(MessageType.PROJECT_REGISTER, { sessionId: session.sessionId, projectId, payload: { projectId, name: project.name, schemaVersion: "1.0", ...this.services.projectSummary ? await this.services.projectSummary() : {} } });
        logger2.info("BRIDGE", resumed ? "session resumed" : "paired", { connectionId });
        if (resumed) setImmediate(() => this.runner.resumeAfterReconnect());
        this.emit("connected", { connectionId, sessionId: session.sessionId, resumed });
        this.emit("status", this.getStatus());
        return [reply, register];
      }
      setProvider(provider) {
        const c = this.connections.active();
        if (c && c.session) {
          c.session.provider = provider;
          this.emit("status", this.getStatus());
        }
      }
    };
    module2.exports = { ChromeBridge };
  }
});

// src/comparison/projectComparator.js
var require_projectComparator = __commonJS({
  "src/comparison/projectComparator.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { ProjectStore } = require_projectStore();
    function resolveProjectDir(dir, folderName = ".ai-project") {
      const norm = String(dir).replace(/[\\/]+$/, "");
      if (path.basename(norm).toLowerCase() === folderName.toLowerCase() && fs.existsSync(path.join(norm, "project.json"))) return path.dirname(norm);
      return dir;
    }
    async function loadProjectSummary(dir, folderName = ".ai-project") {
      dir = resolveProjectDir(dir, folderName);
      const store = new ProjectStore(dir, folderName);
      if (!await store.isInitialized()) throw new Error(`No ${folderName}/project.json found in ${path.basename(dir)}.`);
      const project = await store.readJson("project.json");
      const arch = await store.readJson("architecture/architecture.json", { technologies: [], layers: {}, tiers: {}, languages: {}, entryPoints: [] });
      const archK = await store.readJson("architecture/knowledge.json", null);
      const wfIdx = (await store.readJson("workflows/index.json", { workflows: [] })).workflows;
      const workflows = [];
      for (const w of wfIdx) {
        const d = await store.readJson(`workflows/${w.id}.json`, null);
        if (d) workflows.push(d);
      }
      const featIdx = (await store.readJson("features/index.json", { features: [] })).features;
      const features = [];
      for (const f of featIdx) {
        const d = await store.readJson(`features/${f.id}.json`, null);
        if (d) features.push(d);
      }
      const entities = (await store.readJson("database/entities.json", { entities: [] })).entities;
      const relationships = (await store.readJson("database/relationships.json", { relationships: [] })).relationships;
      const apis = await store.readJson("index/apis.json", { apis: [] });
      const dbIdx = await store.readJson("index/database.json", { technologies: [] });
      const files = (await store.readJson("index/files.json", { files: [] })).files;
      const analyzed = files.filter((f) => ["ANALYZED", "PARTIAL", "OUTDATED"].includes(f.status)).length;
      return {
        project: { projectId: project.projectId, name: project.name },
        coverage: { filesTotal: files.length, filesAnalyzed: analyzed, status: analyzed === 0 ? "NOT_ANALYZED" : "PARTIAL_OR_COMPLETE" },
        technologies: arch.technologies.map((t) => t.name),
        languages: arch.languages,
        layers: Object.fromEntries(Object.entries(arch.layers || {}).map(([k, v]) => [k, v.length])),
        architectureSummary: archK && archK.overview ? archK.overview : null,
        features: features.map((f) => ({ id: f.id, name: f.name, files: f.files.length, apis: (f.apis || []).map((a) => `${a.method} ${a.endpoint}`), entities: f.entities || [], purpose: f.knowledge && f.knowledge.purpose ? f.knowledge.purpose : null })),
        workflows: workflows.map((w) => ({ id: w.id, name: w.name, status: w.status, api: w.api, trigger: w.trigger && w.trigger.type, steps: w.steps.map((s) => ({ kind: s.kind, symbol: s.symbol, entity: s.entity })), reads: w.summary.databaseReads, writes: w.summary.databaseWrites, externalServices: w.summary.externalServices, purpose: w.knowledge && w.knowledge.purpose ? w.knowledge.purpose : null })),
        database: { technologies: dbIdx.technologies.map((t) => t.name), entities: entities.map((e) => ({ name: e.name, kind: e.kind, fields: (e.fields || []).map((f) => ({ name: f.name, type: f.type })) })), relationships: relationships.map((r) => ({ from: r.from, to: r.to, type: r.type, status: r.status })) },
        apis: apis.apis.map((a) => `${a.method} ${a.endpoint}`),
        externalServices: Object.keys(apis.externalServices || {}),
        authentication: [...new Set((apis.auth || []).flatMap((a) => a.items.map((i) => i.kind)))]
      };
    }
    var setDiff = (a, b) => ({ common: a.filter((x) => b.includes(x)), onlyA: a.filter((x) => !b.includes(x)), onlyB: b.filter((x) => !a.includes(x)) });
    function structuralDiff(summaries) {
      const names = summaries.map((s) => s.project.name);
      const pair = (fn) => {
        const out = [];
        for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) out.push({ a: names[i], b: names[j], ...fn(summaries[i], summaries[j]) });
        return out;
      };
      return {
        projects: summaries.map((s) => s.project),
        technologies: pair((a, b) => setDiff(a.technologies, b.technologies)),
        apis: pair((a, b) => setDiff(a.apis, b.apis)),
        features: pair((a, b) => setDiff(a.features.map((f) => f.id), b.features.map((f) => f.id))),
        entities: pair((a, b) => setDiff(a.database.entities.map((e) => e.name), b.database.entities.map((e) => e.name))),
        externalServices: pair((a, b) => setDiff(a.externalServices, b.externalServices)),
        authentication: pair((a, b) => setDiff(a.authentication, b.authentication)),
        coverage: summaries.map((s) => ({ project: s.project.name, ...s.coverage })),
        unknowns: summaries.filter((s) => s.coverage.status !== "PARTIAL_OR_COMPLETE").map((s) => `${s.project.name} has no analyzed files; its knowledge is incomplete.`)
      };
    }
    module2.exports = { loadProjectSummary, structuralDiff, setDiff, resolveProjectDir };
  }
});

// src/spec/specBuilder.js
var require_specBuilder = __commonJS({
  "src/spec/specBuilder.js"(exports2, module2) {
    var path = require("path");
    var { ProjectStore } = require_projectStore();
    var { resolveProjectDir } = require_projectComparator();
    var uniq = (xs) => [...new Set(xs)];
    async function buildSpec(dir, folderName = ".ai-project") {
      const root = resolveProjectDir(dir, folderName);
      const s = new ProjectStore(root, folderName);
      if (!await s.isInitialized()) throw new Error(`No ${folderName}/project.json found in ${path.basename(root)}. Pick the project folder (the one that contains ${folderName}).`);
      const [project, arch, archK, files, apiIdx, ents, rels, validationIdx, rulesIdx, pkgIdx, env, dbIdx, featIdx, wfIdx, depsIdx] = await Promise.all([
        s.readJson("project.json"),
        s.readJson("architecture/architecture.json", { technologies: [], languages: {}, layers: {}, tiers: {}, entryPoints: [], config: [] }),
        s.readJson("architecture/knowledge.json", null),
        s.readJson("index/files.json", { files: [] }),
        s.readJson("index/apis.json", { apis: [] }),
        s.readJson("database/entities.json", { entities: [] }),
        s.readJson("database/relationships.json", { relationships: [] }),
        s.readJson("index/validation.json", { validation: [] }),
        s.readJson("index/business-rules.json", { businessRules: [], stateManagement: [], events: [] }),
        s.readJson("index/packages.json", { manifests: [], scripts: {} }),
        s.readJson("index/environment.json", { variables: [], declaredIn: {} }),
        s.readJson("index/database.json", { technologies: [] }),
        s.readJson("features/index.json", { features: [] }),
        s.readJson("workflows/index.json", { workflows: [] }),
        s.readJson("index/dependencies.json", { dependencies: {} })
      ]);
      const source = files.files.filter((f) => !f.path.startsWith(`${folderName}/`));
      const analyzed = source.filter((f) => ["ANALYZED", "PARTIAL", "OUTDATED"].includes(f.status)).length;
      const unknowns = [];
      const hasValidationIndex = await s.exists("index/validation.json");
      if (!hasValidationIndex) unknowns.push("Validation rules were not extracted: re-scan the project with this version of the extension.");
      const runtime = [];
      const dev = [];
      for (const m of pkgIdx.manifests) {
        for (const [name, version] of Object.entries(m.dependencies || {})) runtime.push({ name, version: String(version), manifest: m.path, ecosystem: m.ecosystem || null });
        for (const [name, version] of Object.entries(m.devDependencies || {})) dev.push({ name, version: String(version), manifest: m.path, ecosystem: m.ecosystem || null });
      }
      const languages = {};
      for (const f of source) if (f.isSource) languages[f.language] = (languages[f.language] || 0) + 1;
      const validation = [];
      for (const v of validationIdx.validation) for (const it of v.items) validation.push({ file: v.file, kind: it.kind, field: it.field || null, rules: it.rules, line: it.line, status: it.status || "VERIFIED", ...it.basis ? { basis: it.basis } : {} });
      const entities = ents.entities.map((e) => {
        const own = validation.filter((v) => v.kind === "schema" && v.file === e.file && v.line >= (e.line || 0) && v.line <= (e.endLine || 1e9));
        return {
          name: e.name,
          kind: e.kind,
          source: e.source || null,
          file: e.file || null,
          fields: (e.fields || []).map((f) => {
            const rules = uniq(own.filter((v) => v.field === f.name).flatMap((v) => v.rules));
            return { name: f.name, type: f.type || "unknown", pk: !!f.pk, unique: !!f.unique || !!f.pk || rules.includes("unique"), required: rules.includes("required") || f.nullable === false || !!f.pk, nullable: f.nullable, rules };
          }),
          status: e.static === false ? "INFERRED" : "VERIFIED",
          purpose: e.knowledge && e.knowledge.purpose ? e.knowledge.purpose : null
        };
      });
      const apis = apiIdx.apis.map((a) => ({ key: `${a.method} ${a.endpoint}`, method: a.method, endpoint: a.endpoint, handler: a.handler || null, middleware: a.middleware || [], file: a.file, line: a.line, protected: (a.middleware || []).some((x) => /auth|protect|guard|jwt|token|login/i.test(String(x))) }));
      const clientCalls = (apiIdx.clientCalls || []).map((c) => ({ key: `${c.method} ${c.path}`, from: c.from && c.from.file, client: c.from && c.from.client, status: c.status }));
      const features = [];
      for (const f of featIdx.features) {
        const d = await s.readJson(`features/${f.id}.json`, null);
        if (!d) continue;
        const purpose = d.knowledge && d.knowledge.purpose ? d.knowledge.purpose : null;
        if (!purpose) unknowns.push(`Feature "${d.name}": purpose not yet established by AI analysis (structure only).`);
        features.push({ id: d.id, name: d.name, status: d.status, basis: d.basis || [], purpose, files: d.files || [], tests: d.tests || [], apis: (d.apis || []).map((a) => `${a.method} ${a.endpoint}`), entities: d.entities || [], knowledge: d.knowledge || null });
      }
      const workflows = [];
      for (const w of wfIdx.workflows) {
        const d = await s.readJson(`workflows/${w.id}.json`, null);
        if (!d) continue;
        workflows.push({ id: d.id, name: d.name, status: d.status, purpose: d.purpose || d.knowledge && d.knowledge.purpose || null, trigger: d.trigger ? { type: d.trigger.type, event: d.trigger.event, file: d.trigger.file } : null, api: d.api ? `${d.api.method} ${d.api.endpoint}` : null, steps: (d.steps || []).map((x) => ({ kind: x.kind, symbol: x.symbol || null, entity: x.entity || null, operation: x.operation || null, file: x.file || null, status: x.status })), reads: d.summary && d.summary.databaseReads || [], writes: d.summary && d.summary.databaseWrites || [], externalServices: d.summary && d.summary.externalServices || [] });
      }
      const authMap = /* @__PURE__ */ new Map();
      for (const a of apiIdx.auth || []) for (const it of a.items) {
        const k = `${it.type}:${it.kind}`;
        if (!authMap.has(k)) authMap.set(k, { type: it.type, kind: it.kind, files: /* @__PURE__ */ new Set() });
        authMap.get(k).files.add(a.file);
      }
      const auth = [...authMap.values()].map((a) => ({ type: a.type, kind: a.kind, files: [...a.files].sort() })).sort((x, y) => (x.type + x.kind).localeCompare(y.type + y.kind));
      const externalServices = Object.entries(apiIdx.externalServices || {}).map(([name, ev]) => ({ name, files: uniq(ev.map((e) => e.file)).sort() })).sort((x, y) => x.name.localeCompare(y.name));
      const stateLibs = /* @__PURE__ */ new Map();
      for (const st of rulesIdx.stateManagement || []) for (const l of st.libraries) (stateLibs.get(l) || stateLibs.set(l, /* @__PURE__ */ new Set()).get(l)).add(st.file);
      const businessRules = (rulesIdx.businessRules || []).flatMap((b) => b.rules.map((r) => ({ kind: r.kind, symbol: r.symbol, file: b.file, line: r.line, status: r.status || "INFERRED" })));
      return {
        specVersion: "1.0",
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { projectId: project.projectId, name: project.name },
        coverage: { filesTotal: source.length, filesAnalyzed: analyzed, status: analyzed === 0 ? "NOT_ANALYZED" : analyzed >= source.filter((f) => f.isSource).length ? "COMPLETE" : "PARTIAL" },
        overview: archK && archK.overview ? archK.overview : null,
        stack: { languages, technologies: arch.technologies, runtimeModules: runtime, devModules: dev, scripts: pkgIdx.scripts || {} },
        architecture: { layers: arch.layers, tiers: arch.tiers, entryPoints: arch.entryPoints || [], config: arch.config || [] },
        features,
        database: { technologies: dbIdx.technologies.map((t) => t.name), entities, relationships: rels.relationships.map((r) => ({ from: r.from, to: r.to, type: r.type, via: r.via, status: r.status || "VERIFIED" })) },
        apis,
        clientCalls,
        validation,
        businessRules,
        workflows,
        auth,
        externalServices,
        environment: { variables: env.variables.map((v) => ({ name: v.name, usedIn: v.usedIn })), declaredIn: env.declaredIn || {} },
        state: [...stateLibs.entries()].map(([library, f]) => ({ library, files: [...f].sort() })),
        tests: source.filter((f) => f.isTest).map((f) => f.path),
        unknowns: uniq(unknowns)
      };
    }
    module2.exports = { buildSpec };
  }
});

// src/spec/specRenderer.js
var require_specRenderer = __commonJS({
  "src/spec/specRenderer.js"(exports2, module2) {
    var L = (n) => n === 1 ? "" : "s";
    var flag = (s) => s && s !== "VERIFIED" ? ` [${s}]` : "";
    var kv = (o) => Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(", ");
    function renderSpec(spec) {
      const sections = [];
      const out = [];
      const section = (id, title, count, lines) => {
        sections.push({ id, title, count });
        out.push("", "=".repeat(78), `${sections.length}. ${title}${count !== null ? `  (${count})` : ""}`, "=".repeat(78), ...lines);
      };
      out.push(
        `PROJECT SPECIFICATION: ${spec.project.name}`,
        `Generated: ${spec.generatedAt}   Project id: ${spec.project.projectId}   Spec version: ${spec.specVersion}`,
        `Analysis coverage: ${spec.coverage.filesAnalyzed} of ${spec.coverage.filesTotal} files analysed (${spec.coverage.status})`,
        "",
        "HOW TO USE THIS FILE",
        "- This is a complete, evidence-based description of an existing project. It contains no source code.",
        "- To rebuild the project: implement every module, feature, database table/field, API endpoint, validation rule and workflow below, with the listed packages.",
        "- To compare with another project: compare section by section (features, database fields, APIs, validation, modules, environment).",
        '- Marks: no mark = found directly in the source. [INFERRED] = a reasonable reading of the code, not proven. [UNKNOWN] / "not established" = the analysis could not tell: ask, do not invent.',
        "- Do not assume anything that is not written here. Section 16 lists what is missing."
      );
      section("overview", "OVERVIEW", null, [
        spec.overview ? spec.overview : "Purpose of the project: not established (no AI-verified overview yet).",
        `Languages: ${Object.keys(spec.stack.languages).length ? kv(spec.stack.languages) : "none detected"}`,
        `Tiers: ${Object.entries(spec.architecture.tiers || {}).filter(([, v]) => v).map(([k]) => k).join(", ") || "not established"}`,
        `Technologies: ${spec.stack.technologies.map((t) => t.name).join(", ") || "none detected"}`
      ]);
      const mod = (m) => `  - ${m.name} ${m.version}${spec.stack.runtimeModules.concat(spec.stack.devModules).filter((x) => x.name === m.name).length > 1 ? `  (${m.manifest})` : ""}`;
      section("modules", "REQUIRED MODULES (PACKAGES)", spec.stack.runtimeModules.length + spec.stack.devModules.length, [
        "Runtime dependencies:",
        ...spec.stack.runtimeModules.length ? spec.stack.runtimeModules.map(mod) : ["  (none declared)"],
        "Development dependencies:",
        ...spec.stack.devModules.length ? spec.stack.devModules.map(mod) : ["  (none declared)"],
        "Scripts:",
        ...Object.keys(spec.stack.scripts).length ? Object.entries(spec.stack.scripts).flatMap(([file, s]) => Object.entries(s).map(([k, v]) => `  - ${k}: ${v}   (${file})`)) : ["  (none)"]
      ]);
      const layers = Object.entries(spec.architecture.layers || {});
      section("architecture", "ARCHITECTURE AND FOLDER STRUCTURE", layers.length, [
        ...layers.flatMap(([role, files]) => [`Layer "${role}" (${files.length} file${L(files.length)}):`, ...files.map((f) => `  - ${f}`)]),
        "Entry points:",
        ...(spec.architecture.entryPoints || []).length ? spec.architecture.entryPoints.map((e) => `  - ${e.path}${e.reason ? ` (${e.reason})` : ""}`) : ["  (none established)"],
        "Configuration / deployment files:",
        ...(spec.architecture.config || []).length ? spec.architecture.config.map((c) => `  - ${c.path}${c.kind ? ` (${c.kind})` : ""}`) : ["  (none)"]
      ]);
      section("features", "FEATURES", spec.features.length, spec.features.length ? spec.features.flatMap((f) => [
        `Feature: ${f.name}${flag(f.status)}`,
        `  Purpose: ${f.purpose || "not established"}`,
        `  Files: ${f.files.join(", ") || "none"}`,
        `  API endpoints: ${f.apis.join(", ") || "none"}`,
        `  Database entities: ${f.entities.join(", ") || "none"}`,
        `  Tests: ${f.tests.join(", ") || "none found"}`,
        ""
      ]) : ["(no features detected)"]);
      const dbLines = [`Database technologies: ${spec.database.technologies.join(", ") || "none detected"}`, ""];
      for (const e of spec.database.entities) {
        dbLines.push(`Table / collection: ${e.name} (${e.kind}${e.source ? `, ${e.source}` : ""})${flag(e.status)}   defined in ${e.file || "unknown file"}`);
        if (e.purpose) dbLines.push(`  Purpose: ${e.purpose}`);
        if (!e.fields.length) dbLines.push("  Fields: not established");
        for (const f of e.fields) dbLines.push(`  - ${f.name}: ${f.type}${f.pk ? ", primary key" : ""}${f.required ? ", required" : ""}${f.unique ? ", unique" : ""}${f.rules.filter((r) => !["required", "unique"].includes(r)).length ? `, rules: ${f.rules.filter((r) => !["required", "unique"].includes(r)).join(" ")}` : ""}`);
        dbLines.push("");
      }
      dbLines.push("Relationships:", ...spec.database.relationships.length ? spec.database.relationships.map((r) => `  - ${r.from} -> ${r.to} (${r.type})${r.via ? `  via ${r.via}` : ""}${flag(r.status)}`) : ["  (none established)"]);
      section("database", "DATABASE (TABLES, FIELDS, RELATIONSHIPS)", spec.database.entities.length, dbLines);
      section("apis", "API ENDPOINTS", spec.apis.length, spec.apis.length ? [
        ...spec.apis.map((a) => `${a.key}   handler: ${a.handler || "unknown"}   middleware: ${a.middleware.join(", ") || "none"}${a.protected ? "   (protected)" : ""}   [${a.file}:${a.line}]`),
        "",
        "Calls made by the front end:",
        ...spec.clientCalls.length ? spec.clientCalls.map((c) => `  - ${c.key} from ${c.from || "unknown"}${c.status ? ` [${c.status}]` : ""}`) : ["  (none found)"]
      ] : ["(no API endpoints detected)"]);
      const byField = spec.validation.filter((v) => v.kind !== "guard");
      const guards = spec.validation.filter((v) => v.kind === "guard");
      section("validation", "VALIDATION RULES", spec.validation.length, spec.validation.length ? [
        ...byField.map((v) => `  - ${v.field}: ${v.rules.join(", ")}   (${v.kind}, ${v.file}:${v.line})`),
        ...guards.length ? ["Guards and error responses [INFERRED]:", ...guards.map((v) => `  - ${v.rules[0]}   (${v.file}:${v.line})`)] : []
      ] : ["(no validation rules found in source; do not assume any)"]);
      section("rules", "BUSINESS RULES (CANDIDATES)", spec.businessRules.length, spec.businessRules.length ? ["Detected from function names and structure, so all are [INFERRED]:", ...spec.businessRules.map((b) => `  - ${b.kind}: ${b.symbol}   (${b.file}:${b.line})`)] : ["(none detected)"]);
      section("workflows", "WORKFLOWS (UI -> API -> BACKEND -> DATABASE)", spec.workflows.length, spec.workflows.length ? spec.workflows.flatMap((w) => [
        `Workflow: ${w.name}${flag(w.status)}${w.api ? `   API: ${w.api}` : ""}`,
        w.trigger ? `  Trigger: ${w.trigger.type}${w.trigger.event ? ` ${w.trigger.event}` : ""}${w.trigger.file ? ` in ${w.trigger.file}` : ""}` : "  Trigger: not established",
        ...w.steps.map((s, i) => `  ${i + 1}. ${s.kind}${s.symbol ? ` ${s.symbol}` : ""}${s.entity ? ` -> ${s.entity}${s.operation ? ` (${s.operation})` : ""}` : ""}${s.file ? `  [${s.file}]` : ""}${flag(s.status)}`),
        `  Reads: ${w.reads.join(", ") || "none"}   Writes: ${w.writes.join(", ") || "none"}   External services: ${w.externalServices.join(", ") || "none"}`,
        ""
      ]) : ["(none traced)"]);
      section("auth", "AUTHENTICATION AND AUTHORIZATION", spec.auth.length, spec.auth.length ? spec.auth.map((a) => `  - ${a.type}: ${a.kind}   (${a.files.join(", ")})`) : ["(none found in source)"]);
      section("external", "EXTERNAL SERVICES", spec.externalServices.length, spec.externalServices.length ? spec.externalServices.map((s) => `  - ${s.name}   (${s.files.join(", ")})`) : ["(none found)"]);
      section("environment", "ENVIRONMENT VARIABLES (NAMES ONLY; VALUES ARE NEVER INCLUDED)", spec.environment.variables.length, spec.environment.variables.length ? spec.environment.variables.map((v) => `  - ${v.name}   (used in ${v.usedIn.join(", ")})`) : ["(none referenced)"]);
      section("state", "STATE MANAGEMENT", spec.state.length, spec.state.length ? spec.state.map((s) => `  - ${s.library}   (${s.files.join(", ")})`) : ["(none found)"]);
      section("tests", "TESTS", spec.tests.length, spec.tests.length ? spec.tests.map((t) => `  - ${t}`) : ["(no test files found)"]);
      section("build", "BUILD AND RUN", null, Object.keys(spec.stack.scripts).length ? Object.entries(spec.stack.scripts).flatMap(([file, s]) => [`${file}:`, ...Object.entries(s).map(([k, v]) => `  npm run ${k}   ->   ${v}`)]) : ["(no scripts found)"]);
      section("unknowns", "UNKNOWNS AND GAPS (DO NOT INVENT THESE)", spec.unknowns.length, spec.unknowns.length ? spec.unknowns.map((u) => `  - ${u}`) : ["(none recorded)"]);
      return { text: `${out.join("\n")}
`, sections };
    }
    module2.exports = { renderSpec };
  }
});

// src/spec/specStore.js
var require_specStore = __commonJS({
  "src/spec/specStore.js"(exports2, module2) {
    var { buildSpec } = require_specBuilder();
    var { renderSpec } = require_specRenderer();
    async function exportSpec(store, root, folderName = ".ai-project") {
      const spec = await buildSpec(root, folderName);
      const { text, sections } = renderSpec(spec);
      await store.writeText("exports/project-spec.txt", text);
      await store.writeJson("exports/project-spec.json", spec);
      return { spec, text, sections, textPath: "exports/project-spec.txt", jsonPath: "exports/project-spec.json" };
    }
    module2.exports = { exportSpec };
  }
});

// src/utils/markdown.js
var require_markdown = __commonJS({
  "src/utils/markdown.js"(exports2, module2) {
    var esc = (s) => String(s === void 0 || s === null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
    var table = (headers, rows) => rows.length ? [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`)].join("\n") : "_None found in source._";
    var list = (items, empty = "_None found in source._") => items.length ? items.map((i) => `- ${i}`).join("\n") : empty;
    var badge = (status) => `\`${status || "UNKNOWN"}\``;
    var code = (s) => "`" + String(s).replace(/`/g, "'") + "`";
    var loc = (file, line) => code(`${file}${line ? `:${line}` : ""}`);
    function cell(c, unknownText = "UNKNOWN: not established by source analysis or verified AI knowledge") {
      if (!c || !c.value) return `_${unknownText}_`;
      return `${c.value} ${badge(c.status)}`;
    }
    function header({ title, status, sources, generatedAt }) {
      return [
        `# ${title}`,
        "",
        `> Documentation status: ${badge(status)}  \xB7  Generated: ${generatedAt}`,
        "> Source of truth is the source code. This document is derived; VERIFIED = confirmed against source, INFERRED = reasonable interpretation, UNKNOWN = not established.",
        sources && sources.length ? `> Based on ${sources.length} source file(s) at recorded hashes (see \`documentation/status.json\`).` : "",
        ""
      ].filter((l) => l !== "").join("\n") + "\n\n";
    }
    module2.exports = { table, list, badge, code, loc, cell, header, esc };
  }
});

// src/documentation/fileDocumentation.js
var require_fileDocumentation = __commonJS({
  "src/documentation/fileDocumentation.js"(exports2, module2) {
    var md = require_markdown();
    function renderFileDoc(d, generatedAt, status) {
      const k = d.knowledge || {};
      const out = [md.header({ title: d.file.path, status, sources: [d.file.path], generatedAt })];
      out.push(`## Purpose
${md.cell(k.purpose)}
`);
      out.push(`## Role
${md.cell(k.role, `Static classification: ${d.role}`)}
`);
      out.push(`## Source
- Language: ${d.file.language}
- Lines: ${d.file.lines}
- Source hash: ${md.code(d.file.hash)}
- Analysis status: ${md.badge(d.file.status)}
`);
      out.push(`## Functions, Classes, Components
${md.table(["Name", "Type", "Lines", "Exported", "Params"], d.symbols.map((s) => [s.className ? `${s.className}.${s.name}` : s.name, s.type, `${s.line}-${s.endLine}`, s.exported ? "yes" : "no", (s.params || []).join(", ")]))}
`);
      out.push(`## Imports
${md.table(["Source", "Names", "Line"], d.imports.map((i) => [i.source, [i.default && "default", ...i.names.map((n) => n.imported)].filter(Boolean).join(", "), i.line]))}
`);
      out.push(`## Exports
${md.list(d.exports.map((e) => `${md.code(e.name)} (${e.kind}, line ${e.line})`))}
`);
      out.push(`## Dependencies
${md.list(d.dependencies.map((x) => md.code(x.path)))}
`);
      out.push(`## Dependents
${md.list(d.dependents.map((x) => md.code(x.path)))}
`);
      out.push(`## APIs
${md.list(d.routes.map((r) => `${r.method} ${md.code(r.endpoint)} (line ${r.line})`))}
`);
      out.push(`## Database
${d.entities.reads.length || d.entities.writes.length ? `- Reads: ${d.entities.reads.join(", ") || "none"}
- Writes: ${d.entities.writes.join(", ") || "none"}` : "_No database access found in this file._"}
`);
      out.push(`## Workflows
${md.list(d.workflows.map((w) => `${md.code(w.id)} \u2014 ${w.name}`))}
`);
      out.push(`## Features
${md.list(d.features.map((f) => md.code(f.id)))}
`);
      out.push(`## Tests
${md.list(d.tests.map(md.code), "_No tests importing this file were found._")}
`);
      out.push(`## Verified Claims and Evidence
${md.table(["Claim", "Status", "Evidence"], (k.claims || []).map((c) => [c.claim, c.status, (c.evidence || []).map((e) => `${e.file}${e.symbol ? "#" + e.symbol : ""}${e.lineStart ? ":" + e.lineStart : ""}`).join("; ")]))}
`);
      out.push(`## Unknowns
${md.list((k.unknowns || []).map((u) => u), "_None recorded._")}
`);
      return out.join("\n");
    }
    module2.exports = { renderFileDoc };
  }
});

// src/documentation/workflowDocumentation.js
var require_workflowDocumentation = __commonJS({
  "src/documentation/workflowDocumentation.js"(exports2, module2) {
    var md = require_markdown();
    var stepDesc = (s) => {
      switch (s.kind) {
        case "trigger":
          return `User event ${md.code(s.event)} in ${md.code(s.symbol || "component")}`;
        case "api-call":
          return `${s.method} ${md.code(s.endpoint)} via ${s.client}`;
        case "route":
          return `${s.method} ${md.code(s.endpoint)}`;
        case "db-read":
          return `Reads ${md.code(s.entity)} (${s.operation})`;
        case "db-write":
          return `Writes ${md.code(s.entity)} (${s.operation})`;
        case "external-service":
          return `Calls ${s.service}`;
        case "security-check":
          return `Security check: ${s.check}`;
        case "state-change":
          return "State update";
        case "response":
          return "Returns a response";
        default:
          return s.symbol ? md.code(s.symbol) : s.kind;
      }
    };
    function renderWorkflowDoc(w, generatedAt, status) {
      const k = w.knowledge || {};
      const files = w.summary.files;
      const out = [md.header({ title: `Workflow: ${w.name}`, status, sources: files, generatedAt })];
      out.push(`## Purpose
${md.cell(k.purpose)}
`);
      out.push(`## Trigger
${w.trigger.type === "UI_EVENT" ? `UI event ${md.code(w.trigger.event)} in ${md.code(w.trigger.file)} (${md.code(w.trigger.component || "unknown component")})` : `${w.trigger.type}${w.trigger.endpoint ? ` ${w.trigger.method} ${md.code(w.trigger.endpoint)}` : ""}`}
`);
      out.push(`## Trace (from source)
Trace status: ${md.badge(w.status)}

${md.table(["#", "Step", "What", "Location", "Evidence"], w.steps.map((s, i) => [i + 1, s.kind, stepDesc(s), s.file ? `${s.file}:${s.line}` : "", s.status]))}
`);
      const grouped = (kinds) => w.steps.filter((s) => kinds.includes(s.kind));
      out.push(`## Frontend Flow
${md.list(grouped(["trigger", "frontend", "frontend-service", "state-change"]).map((s) => stepDesc(s) + ` \u2014 ${md.loc(s.file, s.line)}`))}
`);
      out.push(`## API Flow
${md.list(grouped(["api-call", "route", "middleware"]).map((s) => stepDesc(s) + ` \u2014 ${md.loc(s.file, s.line)}`))}
`);
      out.push(`## Backend Flow
${md.list(grouped(["controller", "service", "repository", "model", "logic"]).map((s) => `${md.code(s.symbol)} \u2014 ${md.loc(s.file, s.line)} ${md.badge(s.status)}`))}
`);
      out.push(`## Database Flow
${md.table(["Entity", "Operation", "Kind", "Location", "Evidence"], grouped(["db-read", "db-write"]).map((s) => [s.entity, s.operation, s.kind === "db-write" ? "write" : "read", `${s.file}:${s.line}`, s.status]))}
`);
      out.push(`## External Services
${md.list(w.summary.externalServices)}
`);
      out.push(`## Business Rules
${md.table(["Rule", "Status", "Evidence"], (k.businessRules || []).map((c) => [c.claim, c.status, (c.evidence || []).map((e) => `${e.file}${e.symbol ? "#" + e.symbol : ""}`).join("; ")]))}
`);
      out.push(`## Error Handling and Security
${md.list(grouped(["security-check"]).map((s) => `${s.check} at ${md.loc(s.file, s.line)}`), "_No security checks found on this path._")}
`);
      out.push(`## Files
${md.list(files.map(md.code))}
`);
      out.push(`## AI-Provided Steps
${md.table(["Step", "Symbol", "Description", "Status"], (k.steps || []).map((s) => [s.kind || "", s.symbol || "", s.description || "", s.status]))}
`);
      out.push(`## Unknowns
${md.list([...w.unknowns || []])}
`);
      return out.join("\n");
    }
    module2.exports = { renderWorkflowDoc };
  }
});

// src/documentation/databaseDocumentation.js
var require_databaseDocumentation = __commonJS({
  "src/documentation/databaseDocumentation.js"(exports2, module2) {
    var md = require_markdown();
    function renderEntityDoc(e, ctx, generatedAt, status) {
      const k = e.knowledge || {};
      const out = [md.header({ title: `Entity: ${e.name}`, status, sources: e.file ? [e.file] : [], generatedAt })];
      out.push(`## Purpose
${md.cell(k.purpose)}
`);
      out.push(`## Type
${e.kind} (${e.source}) \u2014 defined at ${e.file ? md.loc(e.file, e.line) : "UNKNOWN location"}
`);
      const aiFields = new Map((k.fields || []).map((f) => [f.name, f]));
      const fields = [
        ...(e.fields || []).map((f) => [f.name, f.type, f.pk ? "PK" : "", f.nullable === false ? "NOT NULL" : "", "VERIFIED (source)"]),
        ...[...aiFields.values()].filter((f) => !(e.fields || []).some((x) => x.name === f.name)).map((f) => [f.name, f.type || "", "", "", f.status])
      ];
      out.push(`## Fields
${md.table(["Field", "Type", "Key", "Nullable", "Evidence"], fields)}
`);
      const rels = ctx.relationships.filter((r) => String(r.from).toLowerCase() === e.name.toLowerCase() || String(r.to).toLowerCase() === e.name.toLowerCase());
      out.push(`## Relationships
${md.table(["From", "To", "Type", "Via", "Evidence"], rels.map((r) => [r.from, r.to, r.type, r.via || "", r.status || (r.origin === "AI" ? "VERIFIED" : "VERIFIED")]))}
`);
      const qs = ctx.queries.filter((q) => q.entity === e.name);
      out.push(`## Queries
${md.table(["Operation", "Location", "ORM"], qs.filter((q) => q.kind === "read").map((q) => [q.operation, `${q.file}:${q.line}`, q.orm]))}
`);
      out.push(`## Mutations
${md.table(["Operation", "Location", "ORM"], qs.filter((q) => q.kind === "write").map((q) => [q.operation, `${q.file}:${q.line}`, q.orm]))}
`);
      out.push(`## Workflows
${md.list(ctx.workflows.filter((w) => w.summary.databaseReads.includes(e.name) || w.summary.databaseWrites.includes(e.name)).map((w) => `${md.code(w.id)} \u2014 ${w.name}`))}
`);
      out.push(`## Files and Services
${md.list([...new Set(qs.map((q) => q.file))].map(md.code))}
`);
      out.push(`## Claims and Evidence
${md.table(["Claim", "Status"], (k.claims || []).map((c) => [c.claim, c.status]))}
`);
      out.push(`## Unknowns
- Business rules, constraints and transactions are documented only when found in source or verified knowledge.
`);
      return out.join("\n");
    }
    function renderDatabaseOverview(ctx, generatedAt, status, sources) {
      const out = [md.header({ title: "Database Overview", status, sources, generatedAt })];
      out.push(`## Technologies (from source evidence)
${md.list(ctx.technologies.map((t) => `${t.name} \u2014 ${t.evidence.map((e) => md.loc(e.file, e.line)).join(", ")}`), "_No database technology detected._")}
`);
      out.push(`## Entities
${md.table(["Entity", "Kind", "Source", "Fields", "Defined at"], ctx.entities.map((e) => [e.name, e.kind, e.source, (e.fields || []).length, e.file ? `${e.file}:${e.line}` : "UNKNOWN"]))}
`);
      out.push(`## Relationships (only those supported by evidence)
${md.table(["From", "To", "Type", "Evidence", "Source"], ctx.relationships.map((r) => [r.from, r.to, r.type, r.status || "VERIFIED", r.source]))}
`);
      out.push(`## Data Flows
${md.table(["Workflow", "API", "Reads", "Writes"], ctx.dataFlows.map((f) => [f.workflowId, f.api ? `${f.api.method} ${f.api.endpoint}` : "", f.reads.join(", "), f.writes.join(", ")]))}
`);
      return out.join("\n");
    }
    module2.exports = { renderEntityDoc, renderDatabaseOverview };
  }
});

// src/documentation/featureDocumentation.js
var require_featureDocumentation = __commonJS({
  "src/documentation/featureDocumentation.js"(exports2, module2) {
    var md = require_markdown();
    function renderFeatureDoc(f, generatedAt, status) {
      const k = f.knowledge || {};
      const out = [md.header({ title: `Feature: ${f.name}`, status, sources: f.files, generatedAt })];
      out.push(`## Purpose
${md.cell(k.purpose)}
`);
      out.push(`## Detection
Status ${md.badge(f.status)} \u2014 grouped from: ${(f.basis || []).join(", ") || "AI knowledge only"}. Grouping is heuristic; member files are real project files.
`);
      out.push(`## Files
${md.list(f.files.map(md.code))}
`);
      out.push(`## APIs
${md.table(["Method", "Endpoint", "Location"], (f.apis || []).map((a) => [a.method, a.endpoint, `${a.file}:${a.line}`]))}
`);
      out.push(`## Database Entities
${md.list((f.entities || []).map(md.code))}
`);
      out.push(`## Tests
${md.list((f.tests || []).map(md.code), "_No tests found._")}
`);
      out.push(`## Claims and Evidence
${md.table(["Claim", "Status"], (k.claims || []).map((c) => [c.claim, c.status]))}
`);
      return out.join("\n");
    }
    module2.exports = { renderFeatureDoc };
  }
});

// src/documentation/architectureDocumentation.js
var require_architectureDocumentation = __commonJS({
  "src/documentation/architectureDocumentation.js"(exports2, module2) {
    var md = require_markdown();
    function renderArchitecture(a, knowledge, ctx, generatedAt, status) {
      const out = [md.header({ title: "Architecture Overview", status, sources: ctx.sources, generatedAt })];
      const cov = ctx.coverage;
      out.push(`## Coverage
Analysis coverage is **${cov.coverageStatus}**: ${cov.filesAnalyzed} of ${cov.sourceFilesTotal || cov.filesTotal} source files have verified analysis (${cov.percent}%). ${cov.coverageStatus !== "COMPLETE" ? "Parts of the project have not been analyzed and are not described here." : ""}
`);
      out.push(`## Summary
${knowledge && knowledge.overview ? md.cell(knowledge.overview) : "_UNKNOWN: no verified summary yet. Run an AI analysis._"}
`);
      out.push(`## Technology Stack (from manifests and imports)
${md.list(a.technologies.map((t) => `${t.name} \u2014 ${t.evidence.map(md.code).join(", ")}`))}
`);
      out.push(`## Languages
${md.table(["Language", "Files"], Object.entries(a.languages))}
`);
      out.push(`## Tiers
- Frontend evidence: ${a.tiers.frontend ? "yes" : "no"}
- Backend evidence: ${a.tiers.backend ? "yes" : "no"}
`);
      out.push(`## Layers
${md.table(["Role", "Files"], Object.entries(a.layers).map(([r, f]) => [r, f.length]))}
`);
      out.push(`## Entry Points
${md.list(a.entryPoints.map((e) => `${md.code(e.path)} ${md.badge(e.status)} \u2014 ${e.reason}`))}
`);
      out.push(`## Configuration and Deployment Files
${md.table(["File", "Kind"], a.config.map((c) => [c.path, c.kind]))}
`);
      out.push(`## Authentication and Authorization (evidence)
${md.table(["File", "Kinds"], ctx.auth.map((x) => [x.file, [...new Set(x.items.map((i) => i.kind))].join(", ")]))}
`);
      out.push(`## External Services (evidence)
${md.table(["Service", "Files"], Object.entries(ctx.externalServices).map(([n, e]) => [n, [...new Set(e.map((x) => x.file))].join(", ")]))}
`);
      out.push(`## Workflows
${md.table(["Workflow", "Status", "Files"], ctx.workflows.map((w) => [w.name, w.status, w.files]))}
`);
      return out.join("\n");
    }
    function renderDependencyMap(ctx, generatedAt, status) {
      const rows = Object.entries(ctx.dependencies).filter(([, d]) => d.internal.length).map(([f, d]) => [f, d.internal.map((i) => i.path).join(", "), (ctx.dependents[f] || []).length]);
      return md.header({ title: "Dependency Map", status, sources: ctx.sources, generatedAt }) + `## Internal dependencies
${md.table(["File", "Depends on", "Dependents"], rows)}

## External packages
${md.table(["File", "Packages"], Object.entries(ctx.dependencies).filter(([, d]) => d.external.length).map(([f, d]) => [f, d.external.join(", ")]))}
`;
    }
    function renderApplicationFlow(ctx, generatedAt, status) {
      const lines = ctx.workflows.map((w) => `### ${w.name}
${w.steps.map((s) => `${s.symbol || s.endpoint || s.kind}${s.entity ? ` \u2192 ${s.entity}` : ""}`).join(" \u2192 ")}
`);
      return md.header({ title: "Application Flow", status, sources: ctx.sources, generatedAt }) + (lines.join("\n") || "_No workflows were traced from source._") + "\n";
    }
    module2.exports = { renderArchitecture, renderDependencyMap, renderApplicationFlow };
  }
});

// src/documentation/projectDocumentation.js
var require_projectDocumentation = __commonJS({
  "src/documentation/projectDocumentation.js"(exports2, module2) {
    var md = require_markdown();
    function renderProjectOverview(ctx, generatedAt, status) {
      const { project, coverage: c, counts } = ctx;
      return md.header({ title: `${project.name} \u2014 Project Overview`, status, sources: ctx.sources, generatedAt }) + [
        `- Project ID: ${md.code(project.projectId)}`,
        `- Analysis coverage: **${c.coverageStatus}** (${c.filesAnalyzed}/${c.sourceFilesTotal} source files analyzed, ${c.filesOutdated} outdated)`,
        `- Files: ${counts.files} \xB7 Workflows: ${counts.workflows} \xB7 Features: ${counts.features} \xB7 Entities: ${counts.entities} \xB7 APIs: ${counts.apis}`,
        "",
        "## Analyses",
        md.table(["Analysis", "Mode", "Status", "Provider", "Files"], ctx.analyses.map((a) => [a.analysisId, a.mode, a.status, a.provider || "", a.files])),
        "",
        "## Documents",
        md.list(ctx.documents.map((d) => `${md.code(d.key)} ${md.badge(d.status)}`)),
        ""
      ].join("\n");
    }
    module2.exports = { renderProjectOverview };
  }
});

// src/documentation/documentationManager.js
var require_documentationManager = __commonJS({
  "src/documentation/documentationManager.js"(exports2, module2) {
    var path = require("path");
    var { exportSpec } = require_specStore();
    var logger2 = require_logger();
    var { renderFileDoc } = require_fileDocumentation();
    var { renderWorkflowDoc } = require_workflowDocumentation();
    var { renderEntityDoc, renderDatabaseOverview } = require_databaseDocumentation();
    var { renderFeatureDoc } = require_featureDocumentation();
    var { renderArchitecture, renderDependencyMap, renderApplicationFlow } = require_architectureDocumentation();
    var { renderProjectOverview } = require_projectDocumentation();
    var { safeName } = require_knowledgeStore();
    var { classifyRole } = require_architectureAnalyzer();
    var { computeCoverage } = require_coverageManager();
    var DocumentationManager = class {
      constructor({ store, knowledge, history }) {
        this.store = store;
        this.knowledge = knowledge;
        this.history = history;
      }
      async load() {
        const s = this.store;
        const files = await this.knowledge.getFiles();
        const symbols = (await s.readJson("index/symbols.json", { symbols: [] })).symbols;
        const imports = (await s.readJson("index/imports.json", { imports: {} })).imports;
        const exports_ = (await s.readJson("index/exports.json", { exports: {} })).exports;
        const dependencies = (await s.readJson("index/dependencies.json", { dependencies: {} })).dependencies;
        const dependents = (await s.readJson("index/dependents.json", { dependents: {} })).dependents;
        const routes = (await s.readJson("index/routes.json", { routes: [] })).routes;
        const apisIdx = await s.readJson("index/apis.json", {});
        const entities = (await s.readJson("database/entities.json", { entities: [] })).entities;
        const relationships = (await s.readJson("database/relationships.json", { relationships: [] })).relationships;
        const queries = (await s.readJson("database/queries.json", { queries: [] })).queries;
        const dataFlows = (await s.readJson("database/data-flows.json", { dataFlows: [] })).dataFlows;
        const dbIdx = await s.readJson("index/database.json", { technologies: [], fileEntities: {} });
        const wfIndex = (await s.readJson("workflows/index.json", { workflows: [] })).workflows;
        const workflows = [];
        for (const w of wfIndex) {
          const d = await s.readJson(`workflows/${w.id}.json`, null);
          if (d) workflows.push(d);
        }
        const featIndex = (await s.readJson("features/index.json", { features: [] })).features;
        const features = [];
        for (const f of featIndex) {
          const d = await s.readJson(`features/${f.id}.json`, null);
          if (d) features.push(d);
        }
        const architecture = await s.readJson("architecture/architecture.json", null);
        const archKnowledge = await s.readJson("architecture/knowledge.json", null);
        const history = await this.history.list();
        const docStatus = await this.knowledge.getDocStatus();
        return { files, symbols, imports, exports: exports_, dependencies, dependents, routes, apisIdx, entities, relationships, queries, dataFlows, dbIdx, workflows, features, architecture, archKnowledge, history, docStatus, project: await s.readJson("project.json") };
      }
      // Writes a doc, archiving the previous version. Returns true if content changed.
      async write(rel, content, key, sourceFiles, hashes, statusOverride) {
        const force = this.force === true;
        const previous = await this.store.readText(rel, null);
        const body = content.replace(/Generated: [^\n]*/, "Generated: {{GENERATED}}");
        const prevBody = previous ? previous.replace(/Generated: [^\n]*/, "Generated: {{GENERATED}}") : null;
        if (prevBody === body && !force) return false;
        if (previous) {
          const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
          await this.store.writeText(`snapshots/documentation/${safeName(key)}/${stamp}.md`, previous);
        }
        await this.store.writeText(rel, content);
        const status = statusOverride || "ANALYZED";
        await this.knowledge.recordDocumentation(key, Object.fromEntries(sourceFiles.filter((p) => hashes[p]).map((p) => [p, hashes[p]])), status);
        return true;
      }
      async updateAll({ force = false } = {}) {
        this.force = force;
        try {
          return await this._updateAll();
        } finally {
          this.force = false;
        }
      }
      async _updateAll() {
        const d = await this.load();
        const hashes = Object.fromEntries(d.files.map((f) => [f.path, f.hash]));
        const at = (/* @__PURE__ */ new Date()).toISOString();
        const wrote = [];
        const bySymbolsFile = /* @__PURE__ */ new Map();
        for (const s of d.symbols) (bySymbolsFile.get(s.file) || bySymbolsFile.set(s.file, []).get(s.file)).push(s);
        const exportsBy = d.exports;
        const coverage = computeCoverage({ files: d.files, workflows: d.workflows.filter((w) => w.knowledge), entities: d.entities.filter((e) => e.knowledge), history: d.history });
        const sourceFiles = d.files.filter((f) => f.isSource).map((f) => f.path);
        for (const f of d.files) {
          if (!f.isSource) continue;
          const know = await this.knowledge.getFileKnowledge(f.path);
          if (!know) continue;
          const fileEntities = d.dbIdx.fileEntities[f.path] || { reads: [], writes: [] };
          const doc = renderFileDoc({
            file: f,
            role: classifyRole(f.path),
            knowledge: know,
            symbols: bySymbolsFile.get(f.path) || [],
            imports: d.imports[f.path] || [],
            exports: exportsBy[f.path] || [],
            dependencies: (d.dependencies[f.path] || { internal: [] }).internal,
            dependents: d.dependents[f.path] || [],
            routes: d.routes.filter((r) => r.file === f.path),
            entities: fileEntities,
            workflows: d.workflows.filter((w) => w.summary.files.includes(f.path)),
            features: d.features.filter((x) => x.files.includes(f.path)),
            tests: d.files.filter((t) => t.isTest && (d.dependencies[t.path] || { internal: [] }).internal.some((i) => i.path === f.path)).map((t) => t.path)
          }, at, f.status === "OUTDATED" ? "OUTDATED" : f.status === "PARTIAL" ? "PARTIAL" : "ANALYZED");
          if (await this.write(`documentation/files/${safeName(f.path)}.md`, doc, `files/${f.path}`, [f.path], hashes, f.status === "OUTDATED" ? "OUTDATED" : void 0)) wrote.push(`files/${f.path}`);
        }
        for (const w of d.workflows) {
          const files = w.summary.files;
          const partial = w.status !== "VERIFIED" || !w.knowledge;
          if (await this.write(`documentation/workflows/${w.id}.md`, renderWorkflowDoc(w, at, partial ? "PARTIAL" : "ANALYZED"), `workflows/${w.id}`, files, hashes, partial ? "PARTIAL" : "ANALYZED")) wrote.push(`workflows/${w.id}`);
        }
        const dbCtx = { relationships: d.relationships, queries: d.queries, workflows: d.workflows, technologies: d.dbIdx.technologies, entities: d.entities, dataFlows: d.dataFlows };
        for (const e of d.entities) {
          if (await this.write(`documentation/database/${safeName(e.name)}.md`, renderEntityDoc(e, dbCtx, at, e.knowledge ? "ANALYZED" : "PARTIAL"), `database/${e.name}`, e.file ? [e.file] : [], hashes, e.knowledge ? "ANALYZED" : "PARTIAL")) wrote.push(`database/${e.name}`);
        }
        if (d.entities.length || d.dbIdx.technologies.length) {
          const dbFiles = [...new Set(d.entities.map((e) => e.file).filter(Boolean))];
          if (await this.write("documentation/database/overview.md", renderDatabaseOverview(dbCtx, at, "PARTIAL", dbFiles), "database/overview", dbFiles, hashes, "PARTIAL")) wrote.push("database/overview");
        }
        for (const f of d.features) {
          if (await this.write(`documentation/features/${safeName(f.id)}.md`, renderFeatureDoc(f, at, f.knowledge ? "ANALYZED" : "PARTIAL"), `features/${f.id}`, f.files, hashes, f.knowledge ? "ANALYZED" : "PARTIAL")) wrote.push(`features/${f.id}`);
        }
        if (d.architecture) {
          const auth = (await this.store.readJson("index/apis.json", {})).auth || [];
          const externalServices = (await this.store.readJson("index/apis.json", {})).externalServices || {};
          const ctx = { sources: sourceFiles, coverage, auth, externalServices, workflows: d.workflows.map((w) => ({ name: w.name, status: w.status, files: w.summary.files.length, steps: w.steps })), dependencies: d.dependencies, dependents: d.dependents };
          const status = coverage.coverageStatus === "COMPLETE" ? "ANALYZED" : "PARTIAL";
          const arch = renderArchitecture(d.architecture, d.archKnowledge, ctx, at, status);
          if (await this.write("architecture/overview.md", arch, "architecture/overview", sourceFiles, hashes, status)) wrote.push("architecture/overview");
          if (await this.write("documentation/architecture.md", arch, "documentation/architecture", sourceFiles, hashes, status)) wrote.push("documentation/architecture");
          if (await this.write("architecture/dependency-map.md", renderDependencyMap(ctx, at, status), "architecture/dependency-map", sourceFiles, hashes, status)) wrote.push("architecture/dependency-map");
          if (await this.write("architecture/application-flow.md", renderApplicationFlow(ctx, at, status), "architecture/application-flow", sourceFiles, hashes, status)) wrote.push("architecture/application-flow");
          const stack = `# Technology Stack

${d.architecture.technologies.map((t) => `- **${t.name}** \u2014 evidence: ${t.evidence.join(", ")}`).join("\n") || "_None detected._"}
`;
          await this.write("architecture/technology-stack.md", stack, "architecture/technology-stack", [], hashes, "ANALYZED");
          const dataFlow = `# Data Flow

${d.dataFlows.map((f) => `- **${f.workflowId}** (${f.api ? `${f.api.method} ${f.api.endpoint}` : "n/a"}): reads ${f.reads.join(", ") || "\u2014"}; writes ${f.writes.join(", ") || "\u2014"} \u2014 ${f.status}`).join("\n") || "_No data flows traced from source._"}
`;
          await this.write("architecture/data-flow.md", dataFlow, "architecture/data-flow", sourceFiles, hashes, "PARTIAL");
        }
        const docStatus = await this.knowledge.getDocStatus();
        const counts = { files: d.files.length, workflows: d.workflows.length, features: d.features.length, entities: d.entities.length, apis: d.routes.length };
        const overview = renderProjectOverview({ project: d.project, coverage, counts, sources: sourceFiles, analyses: d.history.map((h) => ({ analysisId: h.analysisId, mode: h.mode, status: h.status, provider: h.provider, files: h.files.length })), documents: Object.entries(docStatus.items).filter(([key]) => key !== "documentation/project-overview").map(([key, v]) => ({ key, status: v.status })) }, at, coverage.coverageStatus === "COMPLETE" ? "ANALYZED" : "PARTIAL");
        if (await this.write("documentation/project-overview.md", overview, "documentation/project-overview", sourceFiles, hashes, "PARTIAL")) wrote.push("documentation/project-overview");
        let spec = null;
        try {
          spec = await exportSpec(this.store, this.store.workspaceRoot, path.basename(this.store.dir));
        } catch (e) {
          logger2.warn("DOCS", "specification export failed", { error: e.message });
        }
        return { wrote, coverage, specExported: !!spec };
      }
      // AI-authored documentation is stored as an unverified draft next to (never over) generated documentation.
      async storeAiDocument(payload) {
        if (!payload || typeof payload.markdown !== "string" || !payload.markdown.trim()) throw Object.assign(new Error("Documentation response has no markdown."), { code: "SCHEMA_MISMATCH" });
        const key = String(payload.key || "");
        const rel = this.pathFor(key);
        if (!rel) throw Object.assign(new Error(`Unknown documentation key ${key.slice(0, 80)}`), { code: "SCHEMA_MISMATCH" });
        const target = rel.replace(/\.md$/, ".ai-draft.md");
        const prev = await this.store.readText(target, null);
        if (prev) await this.store.writeText(`snapshots/documentation/${safeName(key)}/${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.ai-draft.md`, prev);
        const banner = `> AI-GENERATED DRAFT (${payload.provider || "unknown provider"}). NOT VERIFIED against source. Do not treat as authoritative.

`;
        await this.store.writeText(target, banner + payload.markdown.slice(0, 5e5));
        return { path: target };
      }
      async list() {
        const status = await this.knowledge.getDocStatus();
        return Object.entries(status.items).map(([key, v]) => ({ key, status: v.status, updatedAt: v.updatedAt })).sort((a, b) => a.key.localeCompare(b.key));
      }
      // key -> markdown path
      pathFor(key) {
        if (key.startsWith("files/")) return `documentation/files/${safeName(key.slice(6))}.md`;
        if (key.startsWith("workflows/")) return `documentation/workflows/${key.slice(10)}.md`;
        if (key.startsWith("features/")) return `documentation/features/${safeName(key.slice(9))}.md`;
        if (key.startsWith("database/")) return `documentation/database/${safeName(key.slice(9))}.md`;
        if (key === "documentation/architecture") return "documentation/architecture.md";
        if (key.startsWith("architecture/")) return `${key}.md`;
        if (key === "documentation/project-overview") return "documentation/project-overview.md";
        return null;
      }
      async read(key) {
        const rel = this.pathFor(key);
        return rel ? this.store.readText(rel, null) : null;
      }
      async versions(key) {
        const names = await this.store.listDir(`snapshots/documentation/${safeName(key)}`);
        return names.sort().reverse();
      }
    };
    module2.exports = { DocumentationManager };
  }
});

// src/changes/changeAnalyzer.js
var require_changeAnalyzer = __commonJS({
  "src/changes/changeAnalyzer.js"(exports2, module2) {
    var { validate } = require_validation();
    var { normalizeRelative, resolveInside } = require_paths();
    var { compileExclusions } = require_exclusions();
    var { AiProjectError, ErrorCodes } = require_errors();
    var MAX_CONTENT = 1024 * 1024;
    var SCHEMA = {
      type: "object",
      props: {
        title: { type: "string", required: true, maxLength: 300 },
        rationale: { type: "string", maxLength: 5e3 },
        analysisId: { type: "string", maxLength: 100 },
        changes: {
          type: "array",
          required: true,
          maxItems: 100,
          items: { type: "object", props: {
            path: { type: "string", required: true, maxLength: 500 },
            operation: { type: "string", required: true, enum: ["MODIFY", "CREATE", "DELETE"] },
            expectedHash: { type: "string", maxLength: 80 },
            newContent: { type: "string", maxLength: MAX_CONTENT },
            edits: { type: "array", maxItems: 200, items: { type: "object", props: { find: { type: "string", required: true, maxLength: 2e4 }, replace: { type: "string", required: true, maxLength: 2e4 } } } }
          } }
        }
      }
    };
    var PROTECTED = [".git", "node_modules", ".ai-project", ".vscode"];
    function parseProposal(payload, { excludePatterns = [], root }) {
      const errors = validate(payload, SCHEMA);
      if (errors.length) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `Invalid change proposal: ${errors.slice(0, 3).join("; ")}`);
      if (!payload.changes.length) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, "Change proposal contains no changes.");
      const isExcluded = compileExclusions(excludePatterns);
      const seen = /* @__PURE__ */ new Set();
      const changes = payload.changes.map((c) => {
        const rel = normalizeRelative(c.path);
        resolveInside(root, rel);
        if (PROTECTED.some((p) => rel === p || rel.startsWith(p + "/"))) throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Changes to ${rel} are not allowed.`);
        if (/(^|\/)\.env(\..*)?$/.test(rel)) throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Changes to environment files are not allowed: ${rel}`);
        if (isExcluded(rel) && c.operation !== "CREATE") throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `${rel} is excluded from analysis and cannot be changed by AI proposals.`);
        if (seen.has(rel)) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `Duplicate change for ${rel}.`);
        seen.add(rel);
        if ((c.operation === "MODIFY" || c.operation === "DELETE") && !c.expectedHash) throw new AiProjectError(ErrorCodes.HASH_MISMATCH, `${rel}: expectedHash is required so stale changes can be detected.`);
        if (c.operation === "MODIFY" && c.newContent === void 0 && !(c.edits && c.edits.length)) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `${rel}: MODIFY needs newContent or edits.`);
        if (c.operation === "CREATE" && c.newContent === void 0) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `${rel}: CREATE needs newContent.`);
        return { path: rel, operation: c.operation, expectedHash: c.expectedHash || null, newContent: c.newContent, edits: c.edits };
      });
      return { title: payload.title, rationale: payload.rationale || "", analysisId: payload.analysisId || null, changes };
    }
    function applyEdits(text, edits, filePath) {
      let out = text;
      for (const e of edits) {
        const first = out.indexOf(e.find);
        if (first === -1) throw new AiProjectError(ErrorCodes.HASH_MISMATCH, `${filePath}: edit target not found; the file differs from what the AI analyzed.`);
        if (out.indexOf(e.find, first + 1) !== -1) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `${filePath}: edit target is ambiguous (matches more than once).`);
        out = out.slice(0, first) + e.replace + out.slice(first + e.find.length);
      }
      return out;
    }
    module2.exports = { parseProposal, applyEdits };
  }
});

// src/changes/impactAnalyzer.js
var require_impactAnalyzer = __commonJS({
  "src/changes/impactAnalyzer.js"(exports2, module2) {
    var { traverse } = require_reverseDependencyAnalyzer();
    async function analyzeImpact(store, changedPaths, depth = 2) {
      const deps = (await store.readJson("index/dependencies.json", { dependencies: {} })).dependencies;
      const dependents = (await store.readJson("index/dependents.json", { dependents: {} })).dependents;
      const graph = { dependencies: deps, dependents };
      const set = new Set(changedPaths);
      const dependentSet = /* @__PURE__ */ new Map();
      for (const p of changedPaths) for (const d of traverse(graph, p, "dependents", depth)) if (!set.has(d.path)) dependentSet.set(d.path, Math.min(dependentSet.get(d.path) || 99, d.depth));
      const affected = /* @__PURE__ */ new Set([...set, ...dependentSet.keys()]);
      const wfIdx = (await store.readJson("workflows/index.json", { workflows: [] })).workflows;
      const workflows = wfIdx.filter((w) => (w.sourceFiles || []).some((f) => affected.has(f))).map((w) => ({ id: w.id, name: w.name, direct: (w.sourceFiles || []).some((f) => set.has(f)) }));
      const feats = (await store.readJson("features/index.json", { features: [] })).features;
      const features = [];
      for (const f of feats) {
        const d = await store.readJson(`features/${f.id}.json`, null);
        if (d && d.files.some((x) => affected.has(x))) features.push({ id: d.id, name: d.name });
      }
      const entities = (await store.readJson("database/entities.json", { entities: [] })).entities.filter((e) => e.file && affected.has(e.file)).map((e) => ({ name: e.name, direct: set.has(e.file) }));
      const routes = (await store.readJson("index/routes.json", { routes: [] })).routes.filter((r) => set.has(r.file)).map((r) => `${r.method} ${r.endpoint}`);
      const dbFiles = entities.some((e) => e.direct);
      let risk = "LOW";
      const reasons = [];
      if (dependentSet.size >= 5) {
        risk = "MEDIUM";
        reasons.push(`${dependentSet.size} dependent files`);
      }
      if (workflows.some((w) => w.direct)) {
        risk = "MEDIUM";
        reasons.push("changes files on a traced workflow");
      }
      if (routes.length) {
        risk = "MEDIUM";
        reasons.push(`changes route definitions: ${routes.join(", ")}`);
      }
      if (dbFiles) {
        risk = "HIGH";
        reasons.push("changes database schema/model definitions");
      }
      if (dependentSet.size >= 15) {
        risk = "HIGH";
        reasons.push("very wide dependent set");
      }
      return { changedFiles: [...set], dependents: [...dependentSet.entries()].map(([path, depth2]) => ({ path, depth: depth2 })).sort((a, b) => a.depth - b.depth), workflows, features, entities, routes, risk, riskReasons: reasons };
    }
    module2.exports = { analyzeImpact };
  }
});

// src/changes/diffManager.js
var require_diffManager = __commonJS({
  "src/changes/diffManager.js"(exports2, module2) {
    function lcsDiff(a, b) {
      const n = a.length;
      const m = b.length;
      if (n * m > 4e6) return [...a.map((l) => ["-", l]), ...b.map((l) => ["+", l])];
      const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
      for (let i2 = n - 1; i2 >= 0; i2--) for (let j2 = m - 1; j2 >= 0; j2--) dp[i2][j2] = a[i2] === b[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
      const out = [];
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (a[i] === b[j]) {
          out.push([" ", a[i]]);
          i++;
          j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push(["-", a[i++]]);
        else out.push(["+", b[j++]]);
      }
      while (i < n) out.push(["-", a[i++]]);
      while (j < m) out.push(["+", b[j++]]);
      return out;
    }
    function unifiedDiff(oldText, newText, filePath, context = 3) {
      const a = oldText === null ? [] : oldText.split("\n");
      const b = newText === null ? [] : newText.split("\n");
      const ops = lcsDiff(a, b);
      const hunks = [];
      let cur = null;
      let ai = 1;
      let bi = 1;
      let lastChange = -Infinity;
      ops.forEach(([t, line], idx) => {
        const changed = t !== " ";
        if (changed) {
          if (!cur) {
            const start = Math.max(0, idx - context);
            cur = { start, aStart: ai - (idx - start), bStart: bi - (idx - start), lines: ops.slice(start, idx) };
          }
          cur.lines.push([t, line]);
          lastChange = idx;
        } else if (cur) {
          if (idx - lastChange <= context) cur.lines.push([t, line]);
          else {
            hunks.push(cur);
            cur = null;
          }
        }
        if (t !== "+") ai++;
        if (t !== "-") bi++;
      });
      if (cur) hunks.push(cur);
      const head = `--- ${oldText === null ? "/dev/null" : "a/" + filePath}
+++ ${newText === null ? "/dev/null" : "b/" + filePath}
`;
      const body = hunks.map((h) => {
        const aCount = h.lines.filter((l) => l[0] !== "+").length;
        const bCount = h.lines.filter((l) => l[0] !== "-").length;
        return `@@ -${h.aStart},${aCount} +${h.bStart},${bCount} @@
${h.lines.map(([t, l]) => t + l).join("\n")}`;
      }).join("\n");
      return { text: head + body, added: ops.filter((o) => o[0] === "+").length, removed: ops.filter((o) => o[0] === "-").length };
    }
    module2.exports = { unifiedDiff, lcsDiff };
  }
});

// src/changes/verificationManager.js
var require_verificationManager = __commonJS({
  "src/changes/verificationManager.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { spawn } = require("child_process");
    var WANTED = [
      { kind: "test", re: /^(test|tests|test:unit|unit|test:ci)$/ },
      { kind: "lint", re: /^(lint|lint:ci|eslint)$/ },
      { kind: "typecheck", re: /^(typecheck|type-check|tsc|check-types|types)$/ },
      { kind: "build", re: /^(build|compile|build:prod)$/ }
    ];
    var PLACEHOLDER = /no test specified|echo\s+["']?error/i;
    async function exists(p) {
      try {
        await fs.promises.access(p);
        return true;
      } catch {
        return false;
      }
    }
    async function packageManager(dir) {
      if (await exists(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
      if (await exists(path.join(dir, "yarn.lock"))) return "yarn";
      if (await exists(path.join(dir, "bun.lockb"))) return "bun";
      return "npm";
    }
    async function detectCommands(root, scripts = {}) {
      const out = [];
      for (const [manifest, s] of Object.entries(scripts)) {
        const dir = path.join(root, path.posix.dirname(manifest) === "." ? "" : path.posix.dirname(manifest));
        const pm2 = await packageManager(dir);
        for (const [name, body] of Object.entries(s)) {
          const w = WANTED.find((x) => x.re.test(name));
          if (!w || PLACEHOLDER.test(String(body))) continue;
          out.push({ kind: w.kind, label: `${pm2} run ${name}`, command: pm2, args: pm2 === "npm" && name === "test" ? ["test"] : ["run", name], cwd: path.posix.dirname(manifest) === "." ? "" : path.posix.dirname(manifest), source: `${manifest} scripts.${name}` });
        }
      }
      const composer = path.join(root, "composer.json");
      if (await exists(composer)) {
        try {
          const c = JSON.parse(await fs.promises.readFile(composer, "utf8"));
          for (const [name] of Object.entries(c.scripts || {})) {
            const w = WANTED.find((x) => x.re.test(name));
            if (w) out.push({ kind: w.kind, label: `composer run ${name}`, command: "composer", args: ["run", name], cwd: "", source: `composer.json scripts.${name}` });
          }
        } catch {
        }
      }
      const make = path.join(root, "Makefile");
      if (await exists(make)) {
        const t = await fs.promises.readFile(make, "utf8");
        for (const w of WANTED) {
          const m = new RegExp(`^(${w.kind}):`, "m").exec(t);
          if (m) out.push({ kind: w.kind, label: `make ${w.kind}`, command: "make", args: [w.kind], cwd: "", source: `Makefile target ${w.kind}` });
        }
      }
      const order = { test: 0, lint: 1, typecheck: 2, build: 3 };
      return out.sort((a, b) => order[a.kind] - order[b.kind]);
    }
    var SAFE_ARG = /^[\w:.@/-]+$/;
    function spawnOptions(cmd, cwd, platform = process.platform) {
      const win = platform === "win32";
      if (win && ![cmd.command, ...cmd.args].every((a) => SAFE_ARG.test(a))) return null;
      return { cwd, env: { ...process.env, CI: "1" }, shell: win, windowsHide: true };
    }
    function run(root, cmd, { timeoutMs = 10 * 6e4, onOutput } = {}) {
      return new Promise((resolve) => {
        const started = Date.now();
        const cwd = path.join(root, cmd.cwd || "");
        let output = "";
        const opts = spawnOptions(cmd, cwd);
        if (!opts) {
          resolve({ ...cmd, exitCode: -1, ok: false, output: `Refusing to run ${cmd.label}: script name contains unsupported characters.`, durationMs: 0 });
          return;
        }
        const child = spawn(cmd.command, cmd.args, opts);
        const append = (d) => {
          const s = d.toString();
          output = (output + s).slice(-2e4);
          if (onOutput) onOutput(s);
        };
        child.stdout.on("data", append);
        child.stderr.on("data", append);
        const timer = setTimeout(() => {
          output += "\n[timed out]";
          child.kill("SIGKILL");
        }, timeoutMs);
        child.on("error", (err) => {
          clearTimeout(timer);
          resolve({ ...cmd, exitCode: -1, ok: false, output: `Could not start ${cmd.command}: ${err.message}`, durationMs: Date.now() - started });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ ...cmd, exitCode: code, ok: code === 0, output, durationMs: Date.now() - started });
        });
      });
    }
    async function runAll(root, commands, opts) {
      const results = [];
      for (const c of commands) {
        const r = await run(root, c, opts);
        results.push(r);
        if (!r.ok) break;
      }
      return { results, ok: results.length > 0 && results.every((r) => r.ok), ran: results.length, detected: commands.length };
    }
    module2.exports = { detectCommands, run, runAll, spawnOptions };
  }
});

// src/changes/changePlanner.js
var require_changePlanner = __commonJS({
  "src/changes/changePlanner.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    var { parseProposal, applyEdits } = require_changeAnalyzer();
    var { analyzeImpact } = require_impactAnalyzer();
    var { unifiedDiff } = require_diffManager();
    var { detectCommands, runAll } = require_verificationManager();
    var { hashString } = require_hashCalculator();
    var { resolveInside } = require_paths();
    var { nextSequentialId } = require_ids();
    var { AiProjectError, ErrorCodes } = require_errors();
    var logger2 = require_logger();
    var STALE_MESSAGE = "File changed since analysis. Re-analysis required.";
    var toLf = (t) => t.replace(/\r\n/g, "\n");
    var eolOf = (t) => /\r\n/.test(t) ? "\r\n" : "\n";
    var withEol = (t, eol) => eol === "\r\n" ? toLf(t).replace(/\n/g, "\r\n") : t;
    async function readOrNull(abs) {
      try {
        return await fs.promises.readFile(abs, "utf8");
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    }
    var ChangePlanner = class {
      constructor({ root, store, config, getScripts, rescan }) {
        this.root = root;
        this.store = store;
        this.config = config;
        this.getScripts = getScripts;
        this.rescan = rescan;
      }
      async list() {
        const names = (await this.store.listDir("changes")).filter((n) => /^proposal-\d+\.json$/.test(n)).sort();
        const out = [];
        for (const n of names) {
          const r = await this.store.readJson(`changes/${n}`);
          out.push({ proposalId: r.proposalId, title: r.title, status: r.status, risk: r.impact.risk, files: r.files.length, createdAt: r.createdAt });
        }
        return out;
      }
      async get(id) {
        return /^proposal-\d+$/.test(id) ? this.store.readJson(`changes/${id}.json`, null) : null;
      }
      // Validate + analyze a CHANGE_PROPOSAL payload and store it as PROPOSED (or STALE). Nothing is written to source.
      async propose(payload) {
        const parsed = parseProposal(payload, { excludePatterns: this.config.get("excludePatterns"), root: this.root });
        const files = [];
        let stale = false;
        for (const c of parsed.changes) {
          const abs = resolveInside(this.root, c.path);
          const current = await readOrNull(abs);
          const currentHash = current === null ? null : hashString(current);
          const entry = { path: c.path, operation: c.operation, expectedHash: c.expectedHash, currentHash, stale: false, newContent: null, diff: null, added: 0, removed: 0 };
          if (c.operation === "CREATE") {
            if (current !== null) {
              entry.stale = true;
              entry.staleReason = "file already exists";
            }
            entry.newContent = c.newContent;
          } else if (current === null) {
            entry.stale = true;
            entry.staleReason = "file no longer exists";
          } else if (c.expectedHash !== currentHash) {
            entry.stale = true;
            entry.staleReason = STALE_MESSAGE;
          } else if (c.operation === "MODIFY") {
            try {
              const lf = toLf(current);
              const next = c.newContent !== void 0 ? toLf(c.newContent) : applyEdits(lf, c.edits.map((e) => ({ find: toLf(e.find), replace: toLf(e.replace) })), c.path);
              entry.newContent = withEol(next, eolOf(current));
            } catch (e) {
              entry.stale = true;
              entry.staleReason = e.message;
            }
          }
          if (!entry.stale) {
            const d = unifiedDiff(current === null ? null : toLf(current), c.operation === "DELETE" ? null : toLf(entry.newContent), c.path);
            entry.diff = d.text;
            entry.added = d.added;
            entry.removed = d.removed;
          }
          if (entry.stale) stale = true;
          files.push(entry);
        }
        const impact = await analyzeImpact(this.store, files.map((f) => f.path), this.config.get("maxDependencyDepth"));
        const existing = (await this.store.listDir("changes")).map((n) => n.replace(/\.json$/, ""));
        const proposalId = nextSequentialId("proposal", existing);
        const record = { proposalId, createdAt: (/* @__PURE__ */ new Date()).toISOString(), title: parsed.title, rationale: parsed.rationale, analysisId: parsed.analysisId, source: "CHROME", status: stale ? "STALE" : "PROPOSED", files, impact, verification: null, appliedAt: null };
        await this.store.writeJson(`changes/${proposalId}.json`, record);
        logger2.info("CHANGE", "proposal stored", { proposalId, status: record.status, files: files.length, risk: impact.risk });
        return record;
      }
      // Re-verifies hashes at apply time. `approve` is an async callback owned by the UI: it must show the diff and return true only on explicit approval.
      async apply(proposalId, { approve, runVerification = true, onOutput } = {}) {
        const rec = await this.get(proposalId);
        if (!rec) throw new AiProjectError(ErrorCodes.ANALYSIS_UNKNOWN, `Unknown proposal ${proposalId}`);
        if (rec.status === "APPLIED") throw new AiProjectError(ErrorCodes.ANALYSIS_FAILED, "This proposal was already applied.");
        if (!approve) throw new AiProjectError(ErrorCodes.ANALYSIS_FAILED, "Applying changes requires explicit user approval.");
        const stale = [];
        for (const f of rec.files) {
          const cur = await readOrNull(resolveInside(this.root, f.path));
          const curHash = cur === null ? null : hashString(cur);
          if (f.operation === "CREATE" ? cur !== null : cur === null || curHash !== f.expectedHash) stale.push(f.path);
        }
        if (stale.length) {
          rec.status = "STALE";
          rec.staleFiles = stale;
          await this.store.writeJson(`changes/${proposalId}.json`, rec);
          throw new AiProjectError(ErrorCodes.HASH_MISMATCH, `${STALE_MESSAGE} (${stale.join(", ")})`, { stale });
        }
        if (!await approve(rec)) {
          rec.status = "REJECTED";
          await this.store.writeJson(`changes/${proposalId}.json`, rec);
          return { status: "REJECTED", record: rec };
        }
        const backupRoot = `snapshots/changes/${proposalId}`;
        try {
          for (const f of rec.files) {
            const abs = resolveInside(this.root, f.path);
            const cur = await readOrNull(abs);
            if (cur !== null) await this.store.writeText(`${backupRoot}/${f.path}`, cur);
            if (f.operation === "DELETE") await fs.promises.unlink(abs);
            else {
              await fs.promises.mkdir(path.dirname(abs), { recursive: true });
              await atomicWrite(abs, f.newContent);
            }
          }
        } catch (err) {
          await this.rollbackFiles(rec, backupRoot);
          rec.status = "FAILED";
          rec.error = err.message;
          await this.store.writeJson(`changes/${proposalId}.json`, rec);
          throw new AiProjectError(ErrorCodes.FILE_PERMISSION, `Could not apply changes (rolled back): ${err.message}`);
        }
        rec.status = "APPLIED";
        rec.appliedAt = (/* @__PURE__ */ new Date()).toISOString();
        if (runVerification) {
          const commands = await detectCommands(this.root, await this.getScripts());
          rec.verification = commands.length ? await runAll(this.root, commands, { onOutput }) : { results: [], ok: null, ran: 0, detected: 0, note: "No verification commands were detected in this project." };
          if (rec.verification.ok === false) rec.status = "APPLIED_VERIFICATION_FAILED";
        }
        await this.store.writeJson(`changes/${proposalId}.json`, rec);
        if (this.rescan) await this.rescan();
        logger2.info("CHANGE", "proposal applied", { proposalId, status: rec.status });
        return { status: rec.status, record: rec };
      }
      async rollbackFiles(rec, backupRoot) {
        for (const f of rec.files) {
          const abs = resolveInside(this.root, f.path);
          const backup = await this.store.readText(`${backupRoot}/${f.path}`, null);
          if (backup !== null) await atomicWrite(abs, backup);
          else if (f.operation === "CREATE") await fs.promises.unlink(abs).catch(() => {
          });
        }
      }
      // Restores backed-up originals, but only for files that still equal what this proposal wrote.
      async rollback(proposalId) {
        const rec = await this.get(proposalId);
        if (!rec || !["APPLIED", "APPLIED_VERIFICATION_FAILED"].includes(rec.status)) throw new AiProjectError(ErrorCodes.ANALYSIS_FAILED, "Nothing to roll back.");
        for (const f of rec.files) {
          const cur = await readOrNull(resolveInside(this.root, f.path));
          const expected = f.operation === "DELETE" ? null : f.newContent;
          if (cur !== expected) throw new AiProjectError(ErrorCodes.HASH_MISMATCH, `${f.path} was modified after the proposal was applied; refusing to roll back over your changes.`);
        }
        await this.rollbackFiles(rec, `snapshots/changes/${proposalId}`);
        rec.status = "ROLLED_BACK";
        await this.store.writeJson(`changes/${proposalId}.json`, rec);
        if (this.rescan) await this.rescan();
        return rec;
      }
    };
    async function atomicWrite(abs, content) {
      const tmp = `${abs}.${process.pid}.aipi.tmp`;
      await fs.promises.writeFile(tmp, content, "utf8");
      await fs.promises.rename(tmp, abs);
    }
    module2.exports = { ChangePlanner, STALE_MESSAGE };
  }
});

// src/comparison/featureComparator.js
var require_featureComparator = __commonJS({
  "src/comparison/featureComparator.js"(exports2, module2) {
    var { setDiff } = require_projectComparator();
    function extractFeature(summary, id) {
      const f = summary.features.find((x) => x.id === id);
      if (!f) return null;
      return { project: summary.project, feature: f, workflows: summary.workflows.filter((w) => (f.apis || []).includes(w.api && `${w.api.method} ${w.api.endpoint}`)), entities: summary.database.entities.filter((e) => f.entities.includes(e.name)) };
    }
    function compareFeatures(summaries, ids) {
      const parts = summaries.map((s, i) => extractFeature(s, ids[i] || ids[0]));
      const out = { features: parts.map((p, i) => p || { project: summaries[i].project, feature: null }), diffs: [], unknowns: [] };
      parts.forEach((p, i) => {
        if (!p) out.unknowns.push(`Feature ${ids[i] || ids[0]} was not found in ${summaries[i].project.name}.`);
      });
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (parts[i] && parts[j]) out.diffs.push({ a: parts[i].project.name, b: parts[j].project.name, apis: setDiff(parts[i].feature.apis, parts[j].feature.apis), entities: setDiff(parts[i].feature.entities, parts[j].feature.entities) });
      return out;
    }
    module2.exports = { compareFeatures, extractFeature };
  }
});

// src/comparison/workflowComparator.js
var require_workflowComparator = __commonJS({
  "src/comparison/workflowComparator.js"(exports2, module2) {
    var { setDiff } = require_projectComparator();
    function compareWorkflows(summaries, ids) {
      const picked = summaries.map((s, i) => ({ project: s.project, workflow: s.workflows.find((w) => w.id === (ids[i] || ids[0])) || null }));
      const diffs = [];
      for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) {
        const a = picked[i].workflow;
        const b = picked[j].workflow;
        if (a && b) diffs.push({ a: picked[i].project.name, b: picked[j].project.name, stepKinds: setDiff([...new Set(a.steps.map((s) => s.kind))], [...new Set(b.steps.map((s) => s.kind))]), reads: setDiff(a.reads, b.reads), writes: setDiff(a.writes, b.writes), externalServices: setDiff(a.externalServices, b.externalServices) });
      }
      return { workflows: picked, diffs, unknowns: picked.filter((p) => !p.workflow).map((p) => `Workflow not found in ${p.project.name}.`) };
    }
    module2.exports = { compareWorkflows };
  }
});

// src/comparison/databaseComparator.js
var require_databaseComparator = __commonJS({
  "src/comparison/databaseComparator.js"(exports2, module2) {
    var { setDiff } = require_projectComparator();
    function compareDatabases(summaries) {
      const diffs = [];
      for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) {
        const a = summaries[i].database;
        const b = summaries[j].database;
        const shared = a.entities.filter((e) => b.entities.some((x) => x.name.toLowerCase() === e.name.toLowerCase()));
        diffs.push({
          a: summaries[i].project.name,
          b: summaries[j].project.name,
          technologies: setDiff(a.technologies, b.technologies),
          entities: setDiff(a.entities.map((e) => e.name), b.entities.map((e) => e.name)),
          fieldDifferences: shared.map((e) => {
            const o = b.entities.find((x) => x.name.toLowerCase() === e.name.toLowerCase());
            return { entity: e.name, ...setDiff(e.fields.map((f) => f.name), o.fields.map((f) => f.name)) };
          }),
          relationships: setDiff(a.relationships.map((r) => `${r.from}->${r.to}`), b.relationships.map((r) => `${r.from}->${r.to}`))
        });
      }
      return { diffs };
    }
    module2.exports = { compareDatabases };
  }
});

// src/comparison/architectureComparator.js
var require_architectureComparator = __commonJS({
  "src/comparison/architectureComparator.js"(exports2, module2) {
    var { setDiff } = require_projectComparator();
    function compareArchitectures(summaries) {
      const diffs = [];
      for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) {
        const a = summaries[i];
        const b = summaries[j];
        diffs.push({ a: a.project.name, b: b.project.name, technologies: setDiff(a.technologies, b.technologies), layers: setDiff(Object.keys(a.layers), Object.keys(b.layers)), languages: setDiff(Object.keys(a.languages), Object.keys(b.languages)) });
      }
      return { diffs };
    }
    module2.exports = { compareArchitectures };
  }
});

// src/comparison/documentationComparator.js
var require_documentationComparator = __commonJS({
  "src/comparison/documentationComparator.js"(exports2, module2) {
    var path = require("path");
    var { ProjectStore } = require_projectStore();
    var { resolveProjectDir } = require_projectComparator();
    var { redact } = require_secretDetector();
    var PER_DOC_CHARS = 6e3;
    var PER_PROJECT_CHARS = 6e4;
    var ORDER = [/^project-overview$/, /^architecture$/, /^features\//, /^workflows\//, /^database\//, /^files\//];
    var rank = (key) => {
      const i = ORDER.findIndex((r) => r.test(key));
      return i < 0 ? ORDER.length : i;
    };
    async function listMarkdown(store, rel) {
      const out = [];
      for (const name of await store.listDir(rel)) {
        const child = `${rel}/${name}`;
        if (name.endsWith(".md")) out.push(child);
        else if (!name.includes(".")) out.push(...await listMarkdown(store, child));
      }
      return out;
    }
    async function loadProjectDocuments(dir, folderName = ".ai-project") {
      dir = resolveProjectDir(dir, folderName);
      const store = new ProjectStore(dir, folderName);
      if (!await store.isInitialized()) throw new Error(`No ${folderName}/project.json found in ${path.basename(dir)}. Pick the project folder (the one that contains ${folderName}).`);
      const project = await store.readJson("project.json");
      const paths = await listMarkdown(store, "documentation");
      if (!paths.length) throw new Error(`${project.name || path.basename(dir)} has no generated documentation yet. Run "AI Project: Update Documentation" in that project first.`);
      const docs = paths.map((p) => ({ path: p, key: p.replace(/^documentation\//, "").replace(/\.md$/, "") })).sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
      const documents = [];
      const omitted = [];
      let budget = PER_PROJECT_CHARS;
      for (const d of docs) {
        const raw = await store.readText(d.path, "");
        if (budget <= 0) {
          omitted.push(d.key);
          continue;
        }
        const text = redact(raw, d.path).text;
        const slice = text.slice(0, Math.min(PER_DOC_CHARS, budget));
        budget -= slice.length;
        documents.push({ key: d.key, text: slice, truncated: slice.length < text.length, chars: raw.length });
      }
      return { project: { projectId: project.projectId, name: project.name }, documents, omitted, totalDocuments: docs.length };
    }
    var setDiff = (a, b) => ({ common: a.filter((x) => b.includes(x)), onlyA: a.filter((x) => !b.includes(x)), onlyB: b.filter((x) => !a.includes(x)) });
    function compareDocumentation(summaries) {
      const names = summaries.map((s) => s.project.name);
      const keys = summaries.map((s) => [...s.documents.map((d) => d.key), ...s.omitted]);
      const pairs = [];
      for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) pairs.push({ a: names[i], b: names[j], documents: setDiff(keys[i], keys[j]) });
      return {
        projects: summaries.map((s) => s.project),
        pairs,
        coverage: summaries.map((s, i) => ({ project: names[i], documents: s.totalDocuments, sentToAi: s.documents.length, truncated: s.documents.filter((d) => d.truncated).map((d) => d.key), notSent: s.omitted }))
      };
    }
    module2.exports = { loadProjectDocuments, compareDocumentation, PER_DOC_CHARS, PER_PROJECT_CHARS };
  }
});

// src/knowledge/scopeView.js
var require_scopeView = __commonJS({
  "src/knowledge/scopeView.js"(exports2, module2) {
    var { resolveScope } = require_scopedComparator();
    var inSet = (set, p) => !!p && set.has(p);
    async function selectionScope(store, sel, folderName = ".ai-project") {
      if (!sel || sel.project) return null;
      const base = { files: sel.files || [], folders: sel.folders || [], features: sel.features || [], workflows: sel.workflows || [] };
      const resolved = await resolveScope(store, base, folderName);
      const files = new Set(resolved.files);
      const labels = resolved.label === "selection" ? [] : [resolved.label];
      if ((sel.entities || []).length) {
        const ents = (await store.readJson("database/entities.json", { entities: [] })).entities;
        for (const e of ents) if (sel.entities.includes(e.name) && e.file) files.add(e.file);
        for (const q of (await store.readJson("database/queries.json", { queries: [] })).queries) if (sel.entities.includes(q.entity) && q.file) files.add(q.file);
        labels.push(`entit${sel.entities.length === 1 ? "y" : "ies"} ${sel.entities.join(", ")}`);
      }
      if ((sel.apis || []).length) {
        for (const a of (await store.readJson("index/apis.json", { apis: [] })).apis) if (sel.apis.includes(`${a.method} ${a.endpoint}`) && a.file) files.add(a.file);
        labels.push(`${sel.apis.length} API(s)`);
      }
      if (!files.size) return null;
      return { files, label: labels.join(" + ") || "selection" };
    }
    function filterArchitecture(arch, set) {
      if (!arch) return arch;
      const layers = {};
      for (const [role, list] of Object.entries(arch.layers || {})) {
        const l = list.filter((p) => set.has(p));
        if (l.length) layers[role] = l;
      }
      const languages = {};
      return { ...arch, layers, languages, technologies: [], config: (arch.config || []).filter((c) => set.has(c.path)), entryPoints: (arch.entryPoints || []).filter((e) => set.has(e.path)), scoped: true };
    }
    function filterApis(a, set) {
      const externalServices = {};
      for (const [name, ev] of Object.entries(a.externalServices || {})) {
        const e = ev.filter((x) => set.has(x.file));
        if (e.length) externalServices[name] = e;
      }
      return { apis: a.apis.filter((x) => set.has(x.file)), clientCalls: (a.clientCalls || []).filter((c) => set.has(c.from && c.from.file) || set.has(c.route && c.route.file)), auth: (a.auth || []).filter((x) => set.has(x.file)), externalServices };
    }
    function filterDatabase(db, set) {
      const queries = db.queries.filter((q) => set.has(q.file));
      const names = new Set(queries.map((q) => q.entity));
      const entities = db.entities.filter((e) => names.has(e.name) || set.has(e.file));
      const keep = new Set(entities.map((e) => e.name.toLowerCase()));
      return { ...db, entities, queries, relationships: db.relationships.filter((r) => keep.has(String(r.from).toLowerCase()) && keep.has(String(r.to).toLowerCase())), dataFlows: (db.dataFlows || []).filter((f) => set.has(f.entry && f.entry.file)), scoped: true };
    }
    async function filterFeatures(store, list, set) {
      const out = [];
      for (const f of list) {
        const d = await store.readJson(`features/${f.id}.json`, null);
        const own = d ? [...d.files || [], ...d.tests || []] : [];
        const overlap = own.filter((p) => set.has(p)).length;
        if (overlap) out.push({ ...f, filesInScope: overlap, files: (d.files || []).length });
      }
      return out;
    }
    async function filterWorkflows(store, list, set) {
      const out = [];
      for (const w of list) {
        const d = await store.readJson(`workflows/${w.id}.json`, null);
        if (d && (d.steps || []).some((s) => set.has(s.file))) out.push({ ...w, stepsInScope: d.steps.filter((s) => set.has(s.file)).length, steps: d.steps.length });
      }
      return out;
    }
    function scopeDependencies(dependencies, dependents, set) {
      const internal = [];
      const dependsOnOutside = {};
      const usedByOutside = {};
      const packages = /* @__PURE__ */ new Set();
      for (const f of set) {
        const d = dependencies[f] || { internal: [], external: [] };
        for (const i of d.internal) {
          if (set.has(i.path)) internal.push({ from: f, to: i.path, names: i.names || [] });
          else (dependsOnOutside[i.path] = dependsOnOutside[i.path] || []).push(f);
        }
        for (const x of d.external) packages.add(x);
        for (const u of dependents[f] || []) if (!set.has(u.path)) (usedByOutside[u.path] = usedByOutside[u.path] || []).push(f);
      }
      const rows = (m) => Object.entries(m).map(([path, via]) => ({ path, via: [...new Set(via)].sort() })).sort((a, b) => a.path.localeCompare(b.path));
      return { files: [...set].sort(), internal, dependsOnOutside: rows(dependsOnOutside), usedByOutside: rows(usedByOutside), packages: [...packages].sort() };
    }
    module2.exports = { selectionScope, filterArchitecture, filterApis, filterDatabase, filterFeatures, filterWorkflows, scopeDependencies, inSet };
  }
});

// src/comparison/scopedComparator.js
var require_scopedComparator = __commonJS({
  "src/comparison/scopedComparator.js"(exports2, module2) {
    var path = require("path");
    var { ProjectStore } = require_projectStore();
    var { redact } = require_secretDetector();
    var { resolveProjectDir, setDiff } = require_projectComparator();
    var safeName = (p) => p.replace(/[\\/]/g, "__");
    var MAX_FILES = 60;
    var DOC_CHARS = 5e3;
    var DOC_BUDGET = 4e4;
    async function openStore(dir, folderName) {
      const root = resolveProjectDir(dir, folderName);
      const store = new ProjectStore(root, folderName);
      if (!await store.isInitialized()) throw new Error(`No ${folderName}/project.json found in ${path.basename(root)}. Pick the project folder (the one that contains ${folderName}).`);
      return { root, store, project: await store.readJson("project.json") };
    }
    async function listScopeChoices(dir, folderName = ".ai-project") {
      const { store } = await openStore(dir, folderName);
      const features = (await store.readJson("features/index.json", { features: [] })).features.map((f) => ({ id: f.id, name: f.name || f.id, files: f.files }));
      const workflows = (await store.readJson("workflows/index.json", { workflows: [] })).workflows.map((w) => ({ id: w.id, name: w.name || w.id }));
      const files = (await store.readJson("index/files.json", { files: [] })).files.filter((f) => !f.binary && f.isSource && !f.path.startsWith(`${folderName}/`)).map((f) => f.path);
      return { features, workflows, files };
    }
    async function resolveScope(store, scope, folderName) {
      const all = (await store.readJson("index/files.json", { files: [] })).files.map((f) => f.path).filter((p) => !p.startsWith(`${folderName}/`));
      const set = /* @__PURE__ */ new Set();
      for (const f of scope.files || []) if (all.includes(f)) set.add(f);
      for (const d of scope.folders || []) {
        const pre = d.replace(/\/$/, "") + "/";
        for (const p of all) if (p.startsWith(pre)) set.add(p);
      }
      const featureNames = [];
      for (const id of scope.features || []) {
        const f = await store.readJson(`features/${id}.json`, null);
        if (f) {
          featureNames.push(f.name || id);
          for (const p of f.files || []) set.add(p);
          for (const p of f.tests || []) set.add(p);
        }
      }
      const workflowNames = [];
      for (const id of scope.workflows || []) {
        const w = await store.readJson(`workflows/${id}.json`, null);
        if (w) {
          workflowNames.push(w.name || id);
          for (const s of w.steps || []) if (s.file) set.add(s.file);
        }
      }
      const parts = [];
      if (featureNames.length) parts.push(`feature ${featureNames.join(", ")}`);
      if (workflowNames.length) parts.push(`workflow ${workflowNames.join(", ")}`);
      if ((scope.files || []).length) parts.push(`${scope.files.length} file(s)`);
      if ((scope.folders || []).length) parts.push(`folder ${scope.folders.join(", ")}`);
      return { files: [...set].sort(), label: parts.join(" + ") || "selection" };
    }
    async function readScopedDocs(store, scope, files) {
      const keys = files.map((f) => ({ key: `files/${f}`, rel: `documentation/files/${safeName(f)}.md` }));
      for (const id of scope.features || []) keys.push({ key: `features/${id}`, rel: `documentation/features/${safeName(id)}.md` });
      for (const id of scope.workflows || []) keys.push({ key: `workflows/${id}`, rel: `documentation/workflows/${safeName(id)}.md` });
      const documents = [];
      const missing = [];
      let budget = DOC_BUDGET;
      for (const k of keys) {
        const raw = await store.readText(k.rel, null);
        if (raw === null) {
          if (k.key.startsWith("files/")) missing.push(k.key.slice(6));
          continue;
        }
        if (budget <= 0) {
          missing.push(`${k.key} (size limit)`);
          continue;
        }
        const text = redact(raw, k.rel).text.slice(0, Math.min(DOC_CHARS, budget));
        budget -= text.length;
        documents.push({ key: k.key, text, truncated: text.length < raw.length });
      }
      return { documents, undocumented: missing };
    }
    async function loadScopedSummary(dir, folderName = ".ai-project", scope = {}) {
      const { store, project } = await openStore(dir, folderName);
      const resolved = await resolveScope(store, scope, folderName);
      if (!resolved.files.length) throw new Error(`Nothing in ${project.name || path.basename(dir)} matched the selection.`);
      const inScope = new Set(resolved.files.slice(0, MAX_FILES));
      const truncatedFiles = resolved.files.length - inScope.size;
      const idx = (await store.readJson("index/files.json", { files: [] })).files.filter((f) => inScope.has(f.path));
      const symbols = (await store.readJson("index/symbols.json", { symbols: [] })).symbols.filter((s) => inScope.has(s.file));
      const exportsBy = (await store.readJson("index/exports.json", { exports: {} })).exports;
      const importsBy = (await store.readJson("index/imports.json", { imports: {} })).imports;
      const apis = (await store.readJson("index/apis.json", { apis: [] })).apis.filter((a) => inScope.has(a.file));
      const queries = (await store.readJson("database/queries.json", { queries: [] })).queries.filter((q) => inScope.has(q.file));
      const entityNames = new Set(queries.map((q) => q.entity));
      const entities = (await store.readJson("database/entities.json", { entities: [] })).entities.filter((e) => entityNames.has(e.name) || e.file && inScope.has(e.file));
      const workflows = [];
      for (const w of (await store.readJson("workflows/index.json", { workflows: [] })).workflows) {
        const d = await store.readJson(`workflows/${w.id}.json`, null);
        if (!d) continue;
        const mine = (d.steps || []).filter((s) => s.file && inScope.has(s.file));
        if (mine.length) workflows.push({ id: d.id, name: d.name, api: d.api, stepsInScope: mine.map((s) => ({ kind: s.kind, symbol: s.symbol, entity: s.entity, file: s.file, status: s.status })), stepsTotal: (d.steps || []).length });
      }
      const features = [];
      for (const f of (await store.readJson("features/index.json", { features: [] })).features) {
        const d = await store.readJson(`features/${f.id}.json`, null);
        const overlap = d ? (d.files || []).filter((p) => inScope.has(p)).length : 0;
        if (overlap) features.push({ id: f.id, name: f.name, filesInScope: overlap, filesTotal: (d.files || []).length, purpose: d.knowledge && d.knowledge.purpose ? d.knowledge.purpose : null });
      }
      const docs = await readScopedDocs(store, scope, [...inScope]);
      const { scopeDependencies } = require_scopeView();
      const depsAll = (await store.readJson("index/dependencies.json", { dependencies: {} })).dependencies;
      const dependentsAll = (await store.readJson("index/dependents.json", { dependents: {} })).dependents;
      const sd = scopeDependencies(depsAll, dependentsAll, inScope);
      const arch = await store.readJson("architecture/architecture.json", { layers: {} });
      const layers = {};
      for (const [role, list] of Object.entries(arch.layers || {})) {
        const l = list.filter((p) => inScope.has(p));
        if (l.length) layers[role] = l;
      }
      const external = (f) => [...new Set((importsBy[f] || []).map((i) => i.source).filter((s) => s && !s.startsWith(".")))];
      return {
        project: { projectId: project.projectId, name: project.name },
        scope: { label: resolved.label, files: [...inScope], filesNotIncluded: truncatedFiles },
        files: idx.map((f) => ({ path: f.path, language: f.language, lines: f.lines, status: f.status, symbols: symbols.filter((s) => s.file === f.path).map((s) => ({ name: s.name, type: s.type, line: s.line, exported: s.exported })), exports: (exportsBy[f.path] || []).map((e) => e.name), externalImports: external(f.path), internalImports: (importsBy[f.path] || []).map((i) => i.source).filter((s) => s && s.startsWith(".")) })),
        apis: apis.map((a) => ({ api: `${a.method} ${a.endpoint}`, file: a.file, handler: a.handler, middleware: a.middleware })),
        database: { queries: queries.map((q) => ({ entity: q.entity, operation: q.operation, kind: q.kind, file: q.file })), entities: entities.map((e) => ({ name: e.name, kind: e.kind, fields: (e.fields || []).map((x) => `${x.name}:${x.type}`) })) },
        architecture: { layers, packages: sd.packages },
        dependencies: { insideScope: sd.internal.map((e) => ({ from: e.from, to: e.to })), needsFromOutside: sd.dependsOnOutside.length, usedByOutside: sd.usedByOutside.length },
        workflows,
        features,
        documents: docs.documents,
        undocumentedFiles: docs.undocumented
      };
    }
    var names = (xs) => [...new Set(xs)].sort();
    function compareScoped(summaries) {
      const key = (s) => ({
        symbols: names(s.files.flatMap((f) => f.symbols.map((x) => x.name))),
        exports: names(s.files.flatMap((f) => f.exports)),
        packages: names(s.files.flatMap((f) => f.externalImports)),
        apis: names(s.apis.map((a) => a.api)),
        middleware: names(s.apis.flatMap((a) => a.middleware || [])),
        entities: names(s.database.entities.map((e) => e.name)),
        queryOperations: names(s.database.queries.map((q) => `${q.kind}:${q.operation}`)),
        workflowSteps: names(s.workflows.flatMap((w) => w.stepsInScope.map((x) => x.kind))),
        layers: Object.keys(s.architecture.layers).sort(),
        layerSizes: Object.entries(s.architecture.layers).map(([r, l]) => `${r}:${l.length}`).sort(),
        internalDependencyCount: [`${s.dependencies.insideScope.length}`],
        documents: names(s.documents.map((d) => d.key.replace(/^files\/.*\//, "files/")))
      });
      const k = summaries.map(key);
      const pairs = [];
      for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) {
        pairs.push({ a: summaries[i].project.name, b: summaries[j].project.name, ...Object.fromEntries(Object.keys(k[i]).map((f) => [f, setDiff(k[i][f], k[j][f])])) });
      }
      return {
        scopes: summaries.map((s) => ({ project: s.project.name, scope: s.scope.label, files: s.scope.files.length, filesNotIncluded: s.scope.filesNotIncluded })),
        pairs,
        coverage: summaries.map((s) => ({ project: s.project.name, filesWithoutDocumentation: s.undocumentedFiles, documentsSent: s.documents.length }))
      };
    }
    module2.exports = { listScopeChoices, loadScopedSummary, compareScoped, resolveScope };
  }
});

// src/comparison/comparisonManager.js
var require_comparisonManager = __commonJS({
  "src/comparison/comparisonManager.js"(exports2, module2) {
    var { structuralDiff } = require_projectComparator();
    var { compareFeatures } = require_featureComparator();
    var { compareWorkflows } = require_workflowComparator();
    var { compareDatabases } = require_databaseComparator();
    var { compareArchitectures } = require_architectureComparator();
    var { compareDocumentation } = require_documentationComparator();
    var { compareScoped } = require_scopedComparator();
    var { nextSequentialId } = require_ids();
    var KINDS = ["PROJECT", "FEATURE", "WORKFLOW", "DATABASE", "ARCHITECTURE", "DOCUMENTATION", "SPEC"];
    var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["score", "scores", "rank", "ranking", "winner", "best", "overallScore", "rating"]);
    var SECTIONS = ["commonApproaches", "differences", "architecturalDifferences", "databaseDifferences", "workflowDifferences", "reusablePatterns", "migrationConsiderations", "unknowns"];
    function structuralFor(kind, summaries, ids) {
      if (summaries.every((s) => s.scope)) return compareScoped(summaries);
      if (kind === "FEATURE") return compareFeatures(summaries, ids);
      if (kind === "WORKFLOW") return compareWorkflows(summaries, ids);
      if (kind === "DATABASE") return compareDatabases(summaries);
      if (kind === "DOCUMENTATION") return compareDocumentation(summaries);
      if (kind === "ARCHITECTURE") return compareArchitectures(summaries);
      return structuralDiff(summaries);
    }
    function buildComparisonRequest({ kind, summaries, ids = [] }) {
      if (!KINDS.includes(kind)) throw new Error(`Unknown comparison kind ${kind}`);
      if (summaries.length < 2) throw new Error("Select at least two projects to compare.");
      return {
        kind,
        projects: summaries,
        structural: structuralFor(kind, summaries, ids),
        // deterministic facts computed from source knowledge
        ...summaries.every((s) => s.scope) ? { scopes: summaries.map((s) => ({ projectId: s.project.projectId, project: s.project.name, label: s.scope.label, files: s.scope.files })) } : {},
        selection: ids,
        instructions: { noScoring: true, noRanking: true, recordConflicts: true, useEvidenceLabels: true, sections: SECTIONS }
      };
    }
    function stripRanking(v) {
      if (Array.isArray(v)) return v.map(stripRanking);
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !FORBIDDEN_KEYS.has(k)).map(([k, x]) => [k, stripRanking(x)]));
      return v;
    }
    var mdOf = (record) => {
      const result = record.result;
      const sect = SECTIONS.flatMap((s) => [`## ${s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}`, result[s].length ? result[s].map((x) => `- ${typeof x === "string" ? x : JSON.stringify(x)}`).join("\n") : "_None reported._", ""]);
      const ai = record.ai ? ["", `# AI analysis (${record.ai.provider || "unknown provider"})`, "", ...SECTIONS.flatMap((s) => [`## ${s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}`, (record.ai.result[s] || []).length ? record.ai.result[s].map((x) => `- ${typeof x === "string" ? x : JSON.stringify(x)}`).join("\n") : "_None reported._", ""])] : [];
      return [`# Comparison ${record.comparisonId} (${record.kind})`, "", `Projects: ${record.projects.map((p) => p.name || p.projectId).join(", ")}`, "", ...record.scopes ? ["Compared parts only:", ...record.scopes.map((s) => `- ${s.project}: ${s.label} (${s.files.length} file(s))`), ""] : [], ...sect, record.conflicts.length ? `## Conflicts
${record.conflicts.map((c) => `- CONFLICT: ${JSON.stringify(c)}`).join("\n")}
` : "", ...ai].join("\n");
    };
    async function storeSpecComparison(store, { matrices }) {
      if (!Array.isArray(matrices) || !matrices.length) throw new Error("Nothing to store.");
      const existing = (await store.listDir("comparisons")).map((n) => n.replace(/\.(json|md)$/, ""));
      const id = nextSequentialId("comparison", existing);
      const result = Object.fromEntries(SECTIONS.map((s) => [s, []]));
      for (const m of matrices) {
        for (const c of m.categories) {
          if (c.counts.common) result.commonApproaches.push(`${m.a.name} / ${m.b.name} \xB7 ${c.title}: ${c.counts.common} in common (${c.common.slice(0, 6).map((x) => x.label).join("; ")}${c.counts.common > 6 ? "; \u2026" : ""})`);
          if (c.counts.onlyA || c.counts.onlyB) result.differences.push(`${c.title}: ${c.counts.onlyA} only in ${m.a.name}${c.onlyA.length ? ` (${c.onlyA.slice(0, 6).map((x) => x.label).join("; ")})` : ""}; ${c.counts.onlyB} only in ${m.b.name}${c.onlyB.length ? ` (${c.onlyB.slice(0, 6).map((x) => x.label).join("; ")})` : ""}`);
          if (["tables", "fields", "relationships"].includes(c.id) && (c.counts.onlyA || c.counts.onlyB)) result.databaseDifferences.push(`${c.title}: only in ${m.a.name}: ${c.onlyA.map((x) => x.label).join("; ") || "none"} \xB7 only in ${m.b.name}: ${c.onlyB.map((x) => x.label).join("; ") || "none"}`);
          if (c.id === "workflows" && (c.counts.onlyA || c.counts.onlyB)) result.workflowDifferences.push(`Only in ${m.a.name}: ${c.onlyA.map((x) => x.label).join("; ") || "none"} \xB7 only in ${m.b.name}: ${c.onlyB.map((x) => x.label).join("; ") || "none"}`);
          if (["layers", "auth", "modules"].includes(c.id) && (c.counts.onlyA || c.counts.onlyB)) result.architecturalDifferences.push(`${c.title}: only in ${m.a.name}: ${c.onlyA.map((x) => x.label).join("; ") || "none"} \xB7 only in ${m.b.name}: ${c.onlyB.map((x) => x.label).join("; ") || "none"}`);
          for (const d of c.different) result.migrationConsiderations.push(`${d.label}: ${m.a.name} = ${d.a || "\u2013"}, ${m.b.name} = ${d.b || "\u2013"} (${d.why})`);
        }
        for (const s of m.suggestions.filter((x) => x.direction === "adopt")) result.reusablePatterns.push(`${s.title}: ${s.items.slice(0, 6).join("; ")}${s.more ? "; \u2026" : ""}`);
        for (const side of [m.a, m.b]) if (side.coverage.status !== "COMPLETE") result.unknowns.push(`${side.name}: only ${side.coverage.filesAnalyzed} of ${side.coverage.filesTotal} files have been analysed by AI (${side.coverage.status}); the comparison reflects what static analysis and AI knowledge established so far.`);
      }
      const first = matrices[0];
      const record = { comparisonId: id, kind: "SPEC", source: "local", createdAt: (/* @__PURE__ */ new Date()).toISOString(), projects: [first.a, ...matrices.map((m) => m.b)].map((p) => ({ projectId: p.projectId, name: p.name })), provider: null, result, conflicts: [], matrices, ai: null };
      await store.writeJson(`comparisons/${id}.json`, record);
      await store.writeText(`comparisons/${id}.md`, mdOf(record));
      return record;
    }
    async function storeComparison(store, payload) {
      if (payload && payload.ref && /^comparison-\d{3,}$/.test(String(payload.ref))) {
        const rec = await store.readJson(`comparisons/${payload.ref}.json`, null);
        if (rec && rec.kind === "SPEC") {
          const result2 = stripRanking(payload.result || {});
          for (const s of SECTIONS) if (!Array.isArray(result2[s])) result2[s] = [];
          rec.ai = { result: result2, conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [], provider: payload.provider || null, receivedAt: (/* @__PURE__ */ new Date()).toISOString() };
          await store.writeJson(`comparisons/${rec.comparisonId}.json`, rec);
          await store.writeText(`comparisons/${rec.comparisonId}.md`, mdOf(rec));
          return rec;
        }
      }
      if (!payload || !KINDS.includes(payload.kind) || typeof payload.result !== "object" || payload.result === null) throw new Error("Invalid comparison response.");
      const result = stripRanking(payload.result);
      for (const s of SECTIONS) if (!Array.isArray(result[s])) result[s] = [];
      const existing = (await store.listDir("comparisons")).map((n) => n.replace(/\.(json|md)$/, ""));
      const id = nextSequentialId("comparison", existing);
      const record = { comparisonId: id, kind: payload.kind, createdAt: (/* @__PURE__ */ new Date()).toISOString(), projects: (payload.projects || []).map((p) => ({ projectId: String(p.projectId || ""), name: String(p.name || "") })), provider: payload.provider || null, ...Array.isArray(payload.scopes) ? { scopes: payload.scopes.slice(0, 10).map((s) => ({ project: String(s.project || "").slice(0, 120), label: String(s.label || "").slice(0, 300), files: (Array.isArray(s.files) ? s.files : []).slice(0, 100).map((f) => String(f).slice(0, 300)) })) } : {}, result, conflicts: Array.isArray(payload.conflicts) ? payload.conflicts : [] };
      await store.writeJson(`comparisons/${id}.json`, record);
      const md = [`# Comparison ${id} (${record.kind})`, "", `Projects: ${record.projects.map((p) => p.name || p.projectId).join(", ")}`, "", ...record.scopes ? ["Compared parts only:", ...record.scopes.map((s) => `- ${s.project}: ${s.label} (${s.files.length} file(s))`), ""] : [], ...SECTIONS.flatMap((s) => [`## ${s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}`, result[s].length ? result[s].map((x) => `- ${typeof x === "string" ? x : JSON.stringify(x)}`).join("\n") : "_None reported._", ""]), record.conflicts.length ? `## Conflicts
${record.conflicts.map((c) => `- CONFLICT: ${JSON.stringify(c)}`).join("\n")}
` : ""].join("\n");
      await store.writeText(`comparisons/${id}.md`, md);
      return record;
    }
    module2.exports = { buildComparisonRequest, storeComparison, storeSpecComparison, stripRanking, KINDS, SECTIONS };
  }
});

// src/generation/blueprintGenerator.js
var require_blueprintGenerator = __commonJS({
  "src/generation/blueprintGenerator.js"(exports2, module2) {
    var REQUIRED = ["purpose", "technologyStack", "architecture", "modules", "features", "workflows", "database", "apis", "businessRules", "externalServices", "authentication", "authorization", "stateManagement", "folderStructure", "environmentRequirements", "commands"];
    function buildBlueprintRequest({ summaries, requirements, specs, gaps }) {
      if (!summaries.length) throw new Error("Select at least one project as a blueprint input.");
      if (!requirements || !String(requirements).trim()) throw new Error("Enter the requirements for the new project.");
      return { projects: summaries, ...specs && specs.length ? { specs } : {}, ...gaps && gaps.length ? { gaps } : {}, requirements: String(requirements).slice(0, 2e4), instructions: { planningOnly: true, recordConflicts: true, noSilentChoices: true, sections: REQUIRED } };
    }
    async function storeBlueprint(store, payload) {
      const bp = payload && payload.blueprint;
      if (!bp || typeof bp !== "object") throw new Error("Invalid blueprint response.");
      const missing = REQUIRED.filter((k) => bp[k] === void 0);
      const prev = await store.readJson("generation/project-blueprint.json", null);
      if (prev) {
        const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
        await store.writeJson(`snapshots/blueprint-${stamp}.json`, prev);
      }
      const record = { type: "PROJECT_BLUEPRINT", schemaVersion: "1.0", createdAt: (/* @__PURE__ */ new Date()).toISOString(), inputs: (payload.projects || []).map((p) => ({ projectId: String(p.projectId || ""), name: String(p.name || "") })), requirements: payload.requirements || null, provider: payload.provider || null, missingSections: missing, conflicts: Array.isArray(bp.conflicts) ? bp.conflicts : [], blueprint: bp, appliedToSource: false };
      await store.writeJson("generation/project-blueprint.json", record);
      return record;
    }
    module2.exports = { buildBlueprintRequest, storeBlueprint, REQUIRED };
  }
});

// src/core/projectManager.js
var require_projectManager = __commonJS({
  "src/core/projectManager.js"(exports2, module2) {
    var EventEmitter = require("events");
    var path = require("path");
    var { ProjectStore } = require_projectStore();
    var { KnowledgeStore } = require_knowledgeStore();
    var { HistoryManager } = require_historyManager();
    var { WorkflowStore } = require_workflowStore();
    var { scanProject } = require_projectScanner();
    var { analyzeProject } = require_projectAnalyzer();
    var contextBuilder = require_contextBuilder();
    var { verifyPackage, reconcile, loadStaticIndex } = require_reconciliationEngine();
    var { validateKnowledgePackage } = require_schemaValidator();
    var { ChromeBridge } = require_chromeBridge();
    var { AiProjectError, ErrorCodes } = require_errors();
    var { isCompatibleSchema } = require_versionManager();
    var { DocumentationManager } = require_documentationManager();
    var { ChangePlanner } = require_changePlanner();
    var { storeComparison } = require_comparisonManager();
    var { storeBlueprint } = require_blueprintGenerator();
    var logger2 = require_logger();
    var ProjectManager2 = class extends EventEmitter {
      constructor({ root, config, secretStore, confirmPairing, transportFactory, allowNoOrigin, bridgeOptions = {} }) {
        super();
        if (!root) throw new AiProjectError(ErrorCodes.NO_WORKSPACE, "Open a folder or workspace first.");
        this.root = root;
        this.config = config;
        this.store = new ProjectStore(root, config.get("aiProjectFolder"));
        this.knowledge = new KnowledgeStore(this.store);
        this.history = new HistoryManager(this.store);
        this.workflowStore = new WorkflowStore(this.store);
        this.project = null;
        this.scanResult = null;
        this.analysis = null;
        this.scanning = null;
        this.bridge = new ChromeBridge({
          getProject: () => this.project,
          confirmPairing: confirmPairing || (async () => false),
          secretStore,
          host: config.get("chromeBridgeHost"),
          port: config.get("chromeBridgePort"),
          transportFactory,
          allowNoOrigin,
          ...bridgeOptions,
          services: {
            history: this.history,
            onKnowledgePackage: (pkg, ctx) => this.processKnowledgePackage(pkg, ctx),
            projectSummary: () => this.projectSummary(),
            onChangeProposal: (payload) => this.emitService("changeProposal", payload),
            onDocumentation: (payload) => this.emitService("documentation", payload),
            onComparison: (payload) => this.emitService("comparison", payload),
            onBlueprint: (payload) => this.emitService("blueprint", payload)
          }
        });
        this.bridge.on("status", (s) => this.emit("chrome", s));
        this.bridge.on("analysis", (a) => this.emit("analysis", a));
        this.services = {};
        this.documentation = new DocumentationManager({ store: this.store, knowledge: this.knowledge, history: this.history });
        this.changes = new ChangePlanner({
          root,
          store: this.store,
          config,
          getScripts: async () => this.scanResult ? this.scanResult.packages.commands.scripts : (await this.ensureScan()).packages.commands.scripts,
          rescan: async () => {
            await this.scan();
            if (this.config.get("autoUpdateDocumentation")) await this.documentation.updateAll();
          }
        });
        this.registerService("changeProposal", async (payload) => {
          const rec = await this.changes.propose(payload);
          this.emit("changed", "changes");
          return { code: rec.status === "STALE" ? "CHANGE_PROPOSAL_STALE" : "CHANGE_PROPOSAL_RECEIVED", message: `${rec.proposalId}: ${rec.status}. Review it in VS Code (AI Project: Review AI Changes).` };
        });
        this.registerService("comparison", async (payload) => {
          const r = await storeComparison(this.store, payload);
          this.emit("changed", "comparison");
          return { code: "COMPARISON_STORED", message: `${r.comparisonId} stored.` };
        });
        this.registerService("blueprint", async (payload) => {
          const r = await storeBlueprint(this.store, payload);
          this.emit("changed", "blueprint");
          return { code: "BLUEPRINT_STORED", message: `Blueprint stored${r.missingSections.length ? `; missing sections: ${r.missingSections.join(", ")}` : ""}.` };
        });
        this.registerService("documentation", async (payload) => {
          const r = await this.documentation.storeAiDocument(payload);
          this.emit("changed", "documentation");
          return { code: "DOCUMENTATION_STORED", message: `Stored ${r.path}` };
        });
      }
      async ensureScan() {
        if (!this.scanResult) await this.scan();
        return this.scanResult;
      }
      registerService(name, fn) {
        this.services[name] = fn;
      }
      async emitService(name, payload) {
        const fn = this.services[name];
        if (!fn) return void 0;
        return fn(payload);
      }
      // ---- lifecycle ----
      async load() {
        if (await this.store.isInitialized()) {
          this.project = await this.store.readJson("project.json");
          if (!isCompatibleSchema(this.project.schemaVersion)) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `.ai-project schema ${this.project.schemaVersion} is not compatible with this extension.`);
          logger2.info("AI-PROJECT", "loaded project", { projectId: this.project.projectId });
        }
        return this.project;
      }
      isInitialized() {
        return !!this.project;
      }
      async initialize(name) {
        const { project, created } = await this.store.initialize(name);
        this.project = project;
        await this.store.ensureDirs();
        this.emit("changed", "project");
        return { project, created };
      }
      requireProject() {
        if (!this.project) throw new AiProjectError(ErrorCodes.NOT_INITIALIZED, 'Run "AI Project: Initialize Project" first.');
        return this.project;
      }
      // ---- scanning + static analysis ----
      scan(opts = {}) {
        if (this.scanning) return this.scanning;
        this.scanning = this._scan(opts).finally(() => {
          this.scanning = null;
        });
        return this.scanning;
      }
      async _scan({ onProgress } = {}) {
        this.requireProject();
        const previous = await this.knowledge.getFileMap();
        const scan = await scanProject(this.root, { excludePatterns: this.exclusions(), previousFiles: previous, onProgress });
        const cache = await this.knowledge.loadAnalysisCache();
        const analysis = await analyzeProject(this.root, scan, { cache, maxWorkflowDepth: this.config.get("maxWorkflowDepth") });
        const saved = await this.knowledge.saveStatic(scan, analysis, { maxImpactDepth: this.config.get("maxDependencyDepth") });
        await this.workflowStore.saveAll(analysis.workflows);
        this.scanResult = scan;
        this.analysis = analysis;
        this.lastScan = { scannedAt: scan.scannedAt, totals: scan.totals, languages: scan.languages, technologies: scan.packages.technologies, config: scan.config, errors: scan.errors.length, durationMs: scan.durationMs };
        this.lastDelta = { changed: saved.changed, removed: saved.removed, outdated: saved.outdated, impact: saved.impact };
        if (saved.outdated.length) logger2.warn("KNOWLEDGE", "analyzed files changed: documentation OUTDATED", { files: saved.outdated.length });
        this.emit("changed", "scan");
        return { scan, analysis, saved };
      }
      exclusions() {
        return this.config.get("excludePatterns");
      }
      async ensureAnalysis() {
        if (!this.analysis) await this.scan();
        return this.analysis;
      }
      // ---- analysis (send to Chrome) ----
      // Builds context + batches without sending, for the privacy summary shown before anything leaves VS Code.
      async prepareAnalysis({ mode, selection = {}, purpose, intent, analysisId = "analysis-preview" }) {
        this.requireProject();
        const analysis = await this.ensureAnalysis();
        const fileIndex = await this.knowledge.getFiles();
        const existingKnowledge = await this.existingKnowledgeFor(selection);
        return contextBuilder.build({
          root: this.root,
          project: this.project,
          analysisId,
          mode,
          purpose,
          intent,
          selection,
          analysis,
          scan: this.scanResult,
          fileIndex,
          existingKnowledge,
          config: this.config.all(),
          provider: this.config.get("provider")
        });
      }
      async existingKnowledgeFor(selection) {
        const out = { files: {}, features: {}, workflows: {}, entities: {} };
        for (const p of (selection.files || []).slice(0, 50)) {
          const k = await this.knowledge.getFileKnowledge(p);
          if (k) out.files[p] = { purpose: k.purpose, role: k.role, claims: k.claims, unknowns: k.unknowns };
        }
        for (const id of selection.features || []) {
          const f = await this.store.readJson(`features/${id}.json`, null);
          if (f && f.knowledge) out.features[id] = f.knowledge;
        }
        for (const id of selection.workflows || []) {
          const w = await this.store.readJson(`workflows/${id}.json`, null);
          if (w && w.knowledge) out.workflows[id] = w.knowledge;
        }
        return out;
      }
      // Creates the analysis record, builds context, and hands it to the bridge. Returns the snapshot.
      async startAnalysis({ mode, selection = {}, purpose, intent = "UNDERSTAND" }) {
        this.requireProject();
        if (!this.bridge.activeConnection()) throw new AiProjectError(ErrorCodes.CHROME_UNAVAILABLE, 'Chrome is not connected. Run "AI Project: Pair Chrome" or "Connect Chrome".');
        const analysis = await this.ensureAnalysis();
        const coverageBefore = await this.knowledge.coverage(await this.history.list());
        const rec = await this.history.create({ projectId: this.project.projectId, mode, purpose, selection, provider: this.config.get("provider") });
        await this.history.update(rec.analysisId, { intent });
        let built;
        try {
          built = await this.prepareAnalysis({ mode, selection, purpose, intent, analysisId: rec.analysisId });
        } catch (err) {
          await this.history.update(rec.analysisId, { status: "FAILED", error: err.message });
          throw err;
        }
        if (!built.batches.length) {
          await this.history.update(rec.analysisId, { status: "FAILED", error: "Nothing to analyze for this selection." });
          throw new AiProjectError(ErrorCodes.ANALYSIS_FAILED, "The selection contains no analyzable source files.");
        }
        await this.history.update(rec.analysisId, { files: built.fileHashes, coverageBefore, selection: { files: selection.files || [], folders: selection.folders || [], features: selection.features || [], workflows: selection.workflows || [] } });
        return this.bridge.runner.start({ analysisId: rec.analysisId, mode, purpose, intent, batches: built.batches, stats: built.stats, provider: this.config.get("provider") });
      }
      // Rebuild an interrupted analysis from its recorded selection; completed batches whose file hashes are unchanged are skipped.
      async resumeAnalysis(analysisId) {
        this.requireProject();
        const rec = await this.history.get(analysisId);
        if (!rec) throw new AiProjectError(ErrorCodes.ANALYSIS_UNKNOWN, `Unknown analysis ${analysisId}`);
        const live = this.bridge.runner.runs.get(analysisId);
        if (live && live.status === "FAILED" && this.bridge.activeConnection()) {
          this.bridge.runner.resume(analysisId);
          return this.bridge.runner.snapshot(live);
        }
        if (live && live.status === "DISCONNECTED") {
          this.bridge.runner.resumeAfterReconnect();
          return this.bridge.runner.snapshot(live);
        }
        if (!this.bridge.activeConnection()) throw new AiProjectError(ErrorCodes.CHROME_UNAVAILABLE, "Connect Chrome to resume this analysis.");
        await this.scan();
        const built = await this.prepareAnalysis({ mode: rec.mode, selection: rec.selection, purpose: rec.purpose, intent: rec.intent, analysisId });
        const doneIds = this.history.completedBatchIds(rec);
        const oldByBatch = new Map((rec.batches || []).map((b) => [b.batchId, b]));
        const skip = built.batches.filter((b) => {
          const old = oldByBatch.get(b.batchId);
          if (!old || !doneIds.has(b.batchId)) return false;
          const now = new Map(b.context.files.map((f) => [f.path, f.hash]));
          return old.files.length === b.context.files.length && old.files.every((f) => now.get(f.path) === f.hash);
        }).map((b) => b.batchId);
        return this.bridge.runner.start({ analysisId, mode: rec.mode, purpose: rec.purpose, intent: rec.intent, batches: built.batches, stats: built.stats, provider: rec.provider, completedBatchIds: skip, resume: true });
      }
      // ---- knowledge in ----
      async processKnowledgePackage(pkg) {
        const project = this.requireProject();
        const v = validateKnowledgePackage(pkg);
        if (!v.valid) throw new AiProjectError(ErrorCodes.SCHEMA_MISMATCH, `Knowledge package rejected: ${v.errors.slice(0, 3).join("; ")}`);
        if (pkg.projectId !== project.projectId) throw new AiProjectError(ErrorCodes.PROJECT_MISMATCH, "Knowledge package is for a different project.");
        const rec = await this.history.get(pkg.analysisId);
        if (!rec) throw new AiProjectError(ErrorCodes.ANALYSIS_UNKNOWN, `Unknown analysisId ${pkg.analysisId}`);
        await this.scan();
        const index = await loadStaticIndex(this.store);
        const coverageBefore = rec.coverageBefore || await this.knowledge.coverage(await this.history.list());
        const verified = await verifyPackage(pkg, { root: this.root, index });
        const { changes, report } = await reconcile({ projectStore: this.store, knowledgeStore: this.knowledge, verified, analysisId: pkg.analysisId, provider: pkg.source.provider, index });
        const doneHistory = await this.history.update(pkg.analysisId, { status: "COMPLETED", provider: pkg.source.provider, model: pkg.source.model || null, completedAt: (/* @__PURE__ */ new Date()).toISOString(), knowledgeChanges: { ...changes, counts: report.counts, conflicts: report.conflicts.length, rejected: report.rejected, stale: report.stale, unverified: report.unverified.length }, coverageBefore });
        await this.history.checkpoint(pkg.analysisId, { batchId: "final", status: "completed", responseReceived: true, knowledgeMerged: true });
        const coverage = await this.knowledge.coverage(await this.history.list());
        await this.history.update(pkg.analysisId, { coverageAfter: coverage });
        if (this.config.get("autoUpdateDocumentation") && this.documentation) await this.documentation.updateAll().catch((e) => logger2.warn("KNOWLEDGE", "auto documentation failed", { error: e.message }));
        this.emit("changed", "knowledge");
        return { changes, report, coverage, history: doneHistory };
      }
      // ---- read models for the UI and commands ----
      async projectSummary() {
        if (!this.project) return {};
        const coverage = await this.knowledge.coverage(await this.history.list());
        return { coverage };
      }
      async state() {
        const base = { workspace: { root: path.basename(this.root) }, initialized: !!this.project, project: this.project, settings: this.config.all(), chrome: this.bridge.getStatus(), scanned: !!this.lastScan, lastScan: this.lastScan || null };
        if (!this.project) return base;
        const history = await this.history.list();
        const files = await this.knowledge.getFiles();
        const wf = await this.store.readJson("workflows/index.json", { workflows: [] });
        const feats = await this.store.readJson("features/index.json", { features: [] });
        const ents = await this.store.readJson("database/entities.json", { entities: [] });
        const apis = await this.store.readJson("index/apis.json", { apis: [] });
        const deps = await this.store.readJson("index/dependencies.json", { dependencies: {} });
        const docs = await this.knowledge.getDocStatus();
        const conflicts = await this.store.readJson("index/conflicts.json", { conflicts: [] });
        return {
          ...base,
          coverage: await this.knowledge.coverage(history),
          counts: { files: files.length, sourceFiles: files.filter((f) => f.isSource).length, workflows: wf.workflows.length, features: feats.features.length, entities: ents.entities.length, apis: apis.apis.length, dependencyEdges: Object.values(deps.dependencies).reduce((n, d) => n + d.internal.length, 0), conflicts: conflicts.conflicts.length },
          docStatus: summarizeDocs(docs),
          analyses: history.slice(-30).reverse().map(summarizeHistory),
          runner: this.bridge.runner.list(),
          delta: this.lastDelta || null
        };
      }
    };
    var summarizeHistory = (h) => ({ analysisId: h.analysisId, mode: h.mode, purpose: h.purpose, status: h.status, provider: h.provider, timestamp: h.timestamp, files: h.files.length, batches: h.batches.length, completedBatches: h.checkpoints.filter((c) => c.status === "completed" && c.batchId !== "final").length, counts: h.knowledgeChanges && h.knowledgeChanges.counts });
    function summarizeDocs(docs) {
      const c = { ANALYZED: 0, OUTDATED: 0, PARTIAL: 0 };
      for (const it of Object.values(docs.items)) c[it.status] = (c[it.status] || 0) + 1;
      return { total: Object.keys(docs.items).length, ...c };
    }
    module2.exports = { ProjectManager: ProjectManager2 };
  }
});

// src/core/selectionState.js
var require_selectionState = __commonJS({
  "src/core/selectionState.js"(exports2, module2) {
    var EventEmitter = require("events");
    var { normalizeRelative } = require_paths();
    var KINDS = ["files", "folders", "features", "workflows", "entities", "apis"];
    var empty = () => ({ files: [], folders: [], features: [], workflows: [], entities: [], apis: [], project: false });
    var SelectionState2 = class extends EventEmitter {
      constructor(initial) {
        super();
        this.sel = { ...empty(), ...initial || {} };
      }
      get() {
        return JSON.parse(JSON.stringify(this.sel));
      }
      add(kind, items) {
        if (kind === "project") {
          this.sel.project = true;
          this.emit("changed");
          return;
        }
        if (!KINDS.includes(kind)) throw new Error(`Unknown selection kind ${kind}`);
        const list = (Array.isArray(items) ? items : [items]).map((x) => kind === "files" || kind === "folders" ? normalizeRelative(String(x)).replace(/\/$/, "") : String(x));
        this.sel[kind] = [.../* @__PURE__ */ new Set([...this.sel[kind], ...list])];
        this.emit("changed");
      }
      remove(kind, item) {
        if (kind === "project") this.sel.project = false;
        else if (KINDS.includes(kind)) this.sel[kind] = this.sel[kind].filter((x) => x !== item);
        this.emit("changed");
      }
      set(sel) {
        const next = empty();
        for (const k of KINDS) if (Array.isArray(sel[k])) next[k] = sel[k].map(String);
        next.project = !!sel.project;
        this.sel = next;
        this.emit("changed");
      }
      clear() {
        this.sel = empty();
        this.emit("changed");
      }
      isEmpty() {
        return !this.sel.project && KINDS.every((k) => this.sel[k].length === 0);
      }
      mode() {
        const s = this.sel;
        if (s.project) return "PROJECT";
        if (s.workflows.length) return "WORKFLOW";
        if (s.features.length) return "FEATURE";
        if (s.entities.length) return "DATABASE";
        if (s.folders.length) return "FOLDER";
        return "FILE";
      }
      summary() {
        const s = this.sel;
        return KINDS.map((k) => s[k].length ? `${s[k].length} ${k}` : null).filter(Boolean).concat(s.project ? ["entire project"] : []).join(", ") || "nothing selected";
      }
    };
    module2.exports = { SelectionState: SelectionState2, KINDS };
  }
});

// src/commands/common.js
var require_common = __commonJS({
  "src/commands/common.js"(exports2, module2) {
    var path = require("path");
    var { AiProjectError, ErrorCodes } = require_errors();
    function requirePm(ctx) {
      const pm2 = ctx.pm();
      if (!pm2) throw new AiProjectError(ErrorCodes.NO_WORKSPACE, "Open a folder or workspace first.");
      return pm2;
    }
    function requireProject(ctx) {
      const pm2 = requirePm(ctx);
      pm2.requireProject();
      return pm2;
    }
    function progress(ctx, title, fn, { cancellable = false } = {}) {
      const v = ctx.vscode;
      return v.window.withProgress({ location: v.ProgressLocation.Notification, title, cancellable }, fn);
    }
    async function ensureScanned(ctx) {
      const pm2 = requireProject(ctx);
      if (!pm2.analysis) await progress(ctx, "AI Project: scanning project\u2026", () => pm2.scan());
      return pm2;
    }
    function toRel(ctx, uri) {
      const root = requirePm(ctx).root;
      const rel = path.relative(root, uri.fsPath).split(path.sep).join("/");
      if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, "That path is outside the open project.");
      return rel;
    }
    var fmt = (n) => Number(n).toLocaleString("en-US");
    async function confirmSend(ctx, prepared, { provider, purpose } = {}) {
      const s = prepared.stats;
      const types = {};
      for (const x of s.secrets) types[x.type] = (types[x.type] || 0) + (x.count || 1);
      const secretLine = s.secretsRedacted ? `Secrets redacted before sending: ${s.secretsRedacted} (${Object.entries(types).map(([t, n]) => `${t} \xD7${n}`).join(", ")}). Secret values are never sent.` : "No secrets detected.";
      const lines = [
        `Files: ${fmt(s.includedFiles)} (${fmt(s.selectedFiles)} selected, ${fmt(s.includedFiles - s.selectedFiles)} dependencies/dependents)`,
        `Batches: ${s.batches} \xB7 Estimated tokens: ${fmt(s.totalTokens)} (an estimate; provider limits vary)`,
        `AI provider: ${provider && provider !== "auto" ? provider : "chosen in Chrome"}`,
        secretLine,
        s.omitted.length ? `Omitted because of configured limits: ${s.omitted.length} file(s).` : null,
        purpose ? `Purpose: ${purpose}` : null
      ].filter(Boolean);
      const choice = await ctx.vscode.window.showInformationMessage("Send this analysis context to the Chrome extension?", { modal: true, detail: lines.join("\n") }, "Send");
      return choice === "Send";
    }
    async function runAnalysis2(ctx, { mode, selection, purpose, intent }) {
      const v = ctx.vscode;
      const pm2 = await ensureScanned(ctx);
      const prepared = await progress(ctx, "AI Project: preparing context\u2026", () => pm2.prepareAnalysis({ mode, selection, purpose, intent }));
      if (!prepared.stats.includedFiles) {
        v.window.showWarningMessage(`Nothing to analyze. ${prepared.stats.notes.join(" ")}`.trim());
        return null;
      }
      if (!await confirmSend(ctx, prepared, { provider: pm2.config.get("provider"), purpose })) return null;
      if (!pm2.bridge.activeConnection()) {
        const pick = await v.window.showWarningMessage("Chrome is not connected.", "Pair Chrome", "Cancel");
        if (pick !== "Pair Chrome") return null;
        await v.commands.executeCommand("aiProject.pairChrome");
        v.window.showInformationMessage("Finish pairing in Chrome, then run the analysis command again.");
        return null;
      }
      const snap = await pm2.startAnalysis({ mode, selection, purpose, intent });
      v.window.showInformationMessage(`${snap.analysisId} sent to Chrome (${snap.totalBatches} batch${snap.totalBatches === 1 ? "" : "es"}). Confirm it in the Chrome extension.`);
      ctx.host.openPanel("active");
      return snap;
    }
    async function askPurpose(ctx, placeHolder, value) {
      return ctx.vscode.window.showInputBox({ prompt: "What should the AI focus on? (optional)", placeHolder, value, ignoreFocusOut: true });
    }
    module2.exports = { requirePm, requireProject, progress, ensureScanned, toRel, confirmSend, runAnalysis: runAnalysis2, askPurpose, fmt };
  }
});

// src/commands/startHere.js
var require_startHere = __commonJS({
  "src/commands/startHere.js"(exports2, module2) {
    var { fmt } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.start": async () => {
        const v = ctx.vscode;
        if (!ctx.pm()) {
          const pick = await v.window.showInformationMessage("AI Project needs a project folder. Open the folder you want to analyze first.", "Open Folder\u2026");
          if (pick) await v.commands.executeCommand("workbench.action.files.openFolder");
          return;
        }
        const run = (id, ...a) => v.commands.executeCommand(id, ...a);
        for (; ; ) {
          const pm2 = ctx.pm();
          const initialized = pm2.isInitialized();
          const fileCount = initialized ? (await pm2.knowledge.getFiles()).length : 0;
          const scanned = fileCount > 0;
          const hasSel = !ctx.selection.isEmpty();
          const connected = pm2.bridge.getStatus().state === "CONNECTED";
          const steps = [
            { id: "init", done: initialized, title: "1. Set up this project", detail: initialized ? "Done: .ai-project folder exists" : "Creates a .ai-project folder next to your code (safe to run again)" },
            { id: "scan", done: scanned, title: "2. Scan the code", detail: scanned ? `Done: ${fmt(fileCount)} files indexed. Pick again to refresh after edits` : "Reads your files and finds workflows, APIs and database usage. No AI involved yet" },
            { id: "select", done: hasSel, title: "3. Choose what to analyze", detail: hasSel ? `Selected: ${ctx.selection.summary()}` : "The entire project, one folder, or specific files" },
            { id: "pair", done: connected, title: "4. Connect Chrome (once)", detail: connected ? "Done: Chrome is connected" : "Shows a code to type into the Chrome extension" },
            { id: "analyze", done: false, title: "5. Analyze with AI", detail: "Sends your selection to the AI through Chrome, after you review and approve it" }
          ];
          const next = steps.find((s) => !s.done && s.id !== "analyze") || steps[4];
          const items = [
            ...steps.map((s) => ({ id: s.id, label: `${s.done ? "$(check)" : s === next ? "$(arrow-right)" : "$(circle-large-outline)"}  ${s.title}`, description: s === next ? "next" : "", detail: s.detail })),
            { kind: v.QuickPickItemKind.Separator, label: "" },
            { id: "dash", label: "$(dashboard)  Open the dashboard", detail: "Workflows, database, dependencies, documentation" }
          ];
          const pick = await v.window.showQuickPick(items, { title: "AI Project: Start Here", placeHolder: "Pick a step (Esc to close). Each step runs, then this list comes back", matchOnDetail: true });
          if (!pick) return;
          if (pick.id === "dash") {
            await run("aiProject.openDashboard");
            return;
          }
          if (!ctx.pm().isInitialized() && pick.id !== "init") await run("aiProject.initializeProject");
          if (pick.id !== "init" && !ctx.pm().isInitialized()) continue;
          const needScan = pick.id !== "init" && pick.id !== "pair";
          if (needScan && !ctx.pm().analysis && (await ctx.pm().knowledge.getFiles()).length === 0) await run("aiProject.scanProject");
          if (pick.id === "init") await run("aiProject.initializeProject");
          else if (pick.id === "scan") await run("aiProject.scanProject");
          else if (pick.id === "select") {
            const choice = await v.window.showQuickPick([
              { id: "project", label: "$(root-folder)  The entire project", detail: "Everything that is not excluded. Large projects are split into batches" },
              { id: "folder", label: "$(folder)  A folder\u2026", detail: "Pick one or more folders" },
              { id: "files", label: "$(file-code)  Specific files\u2026", detail: "Pick one or more files" },
              ...hasSel ? [{ id: "clear", label: "$(clear-all)  Clear my selection" }] : []
            ], { title: "What should be analyzed?" });
            if (!choice) continue;
            if (choice.id === "project") {
              ctx.selection.clear();
              ctx.selection.add("project");
              v.window.showInformationMessage("AI Project: the entire project is selected.");
            }
            if (choice.id === "folder") {
              ctx.selection.remove("project");
              await run("aiProject.selectFolder");
            }
            if (choice.id === "files") {
              ctx.selection.remove("project");
              await run("aiProject.selectFiles");
            }
            if (choice.id === "clear") ctx.selection.clear();
          } else if (pick.id === "pair") {
            if (connected) v.window.showInformationMessage("AI Project: Chrome is already connected.");
            else {
              await run("aiProject.pairChrome");
              return;
            }
          } else if (pick.id === "analyze") {
            if (ctx.selection.isEmpty()) {
              v.window.showInformationMessage("Choose what to analyze first (step 3).");
              continue;
            }
            await run("aiProject.analyzeSelection");
            return;
          }
          ctx.refresh();
        }
      }
    });
  }
});

// src/commands/initializeProject.js
var require_initializeProject = __commonJS({
  "src/commands/initializeProject.js"(exports2, module2) {
    var path = require("path");
    var { requirePm, progress } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.initializeProject": async () => {
        const v = ctx.vscode;
        const pm2 = requirePm(ctx);
        if (pm2.isInitialized()) {
          v.window.showInformationMessage(`AI Project: loaded existing project intelligence "${pm2.project.name}" (${pm2.project.projectId}). Nothing was changed.`);
          return pm2.project;
        }
        const name = await v.window.showInputBox({ prompt: "Project name", value: path.basename(pm2.root), ignoreFocusOut: true });
        if (!name) return null;
        const { project } = await pm2.initialize(name);
        v.window.showInformationMessage(`AI Project: created ${pm2.config.get("aiProjectFolder")}/ for "${project.name}".`);
        if (pm2.config.get("autoScan")) await progress(ctx, "AI Project: scanning\u2026", () => pm2.scan());
        ctx.refresh();
        return project;
      }
    });
  }
});

// src/commands/scanProject.js
var require_scanProject = __commonJS({
  "src/commands/scanProject.js"(exports2, module2) {
    var { requireProject, progress, fmt } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.scanProject": async () => {
        const pm2 = requireProject(ctx);
        const r = await progress(ctx, "AI Project: scanning project\u2026", () => pm2.scan());
        const { saved, scan } = r;
        const parts = [`${fmt(scan.totals.files)} files`, `${fmt(scan.totals.lines)} lines`, `${saved.changed.length} changed`];
        if (saved.outdated.length) parts.push(`${saved.outdated.length} analyzed file(s) now OUTDATED`);
        ctx.vscode.window.showInformationMessage(`AI Project: scan complete \u2014 ${parts.join(", ")}.`);
        if (saved.impact.documentation.length) ctx.out.appendLine(`[AI-PROJECT] Documentation outdated: ${saved.impact.documentation.join(", ")}`);
        ctx.refresh();
        return { files: scan.totals.files, changed: saved.changed.length, outdated: saved.outdated.length };
      },
      "aiProject.detectFeatures": async () => {
        const v = ctx.vscode;
        const pm2 = requireProject(ctx);
        await progress(ctx, "AI Project: detecting features\u2026", () => pm2.scan());
        ctx.refresh();
        const feats = (await pm2.store.readJson("features/index.json", { features: [] })).features;
        if (!feats.length) {
          v.window.showInformationMessage("AI Project: no features were detected from routes, folders or naming.");
          return [];
        }
        ctx.host.openPanel("features");
        return feats;
      }
    });
  }
});

// src/commands/selectFiles.js
var require_selectFiles = __commonJS({
  "src/commands/selectFiles.js"(exports2, module2) {
    var { requireProject, toRel } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.selectFiles": async (uri, uris) => {
        const v = ctx.vscode;
        const pm2 = requireProject(ctx);
        let rels;
        const list = Array.isArray(uris) && uris.length ? uris : uri && uri.fsPath ? [uri] : null;
        if (list) rels = list.map((u) => toRel(ctx, u));
        else {
          const files = (await pm2.knowledge.getFiles()).filter((f) => f.isSource);
          if (!files.length) {
            v.window.showWarningMessage("Scan the project first (AI Project: Scan Project).");
            return;
          }
          const picked = await v.window.showQuickPick(files.map((f) => ({ label: f.path, description: `${f.lines} lines \xB7 ${f.status}` })), { canPickMany: true, placeHolder: "Select files to analyze", matchOnDescription: true });
          if (!picked || !picked.length) return;
          rels = picked.map((p) => p.label);
        }
        ctx.selection.add("files", rels);
        v.window.showInformationMessage(`AI Project: selected ${rels.length} file(s). Selection: ${ctx.selection.summary()}.`);
        ctx.refresh();
      }
    });
  }
});

// src/commands/selectFolder.js
var require_selectFolder = __commonJS({
  "src/commands/selectFolder.js"(exports2, module2) {
    var { requireProject, toRel } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.selectFolder": async (uri, uris) => {
        const v = ctx.vscode;
        const pm2 = requireProject(ctx);
        let rels;
        const list = Array.isArray(uris) && uris.length ? uris : uri && uri.fsPath ? [uri] : null;
        if (list) rels = list.map((u) => toRel(ctx, u));
        else {
          const folders = (await pm2.store.readJson("index/files.json", { files: [] })).files.reduce((set, f) => {
            const d = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : null;
            if (d) {
              let p = d;
              while (p) {
                set.add(p);
                p = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
              }
            }
            return set;
          }, /* @__PURE__ */ new Set());
          if (!folders.size) {
            v.window.showWarningMessage("Scan the project first (AI Project: Scan Project).");
            return;
          }
          const picked = await v.window.showQuickPick([...folders].sort().map((f) => ({ label: f })), { canPickMany: true, placeHolder: "Select folders to analyze" });
          if (!picked || !picked.length) return;
          rels = picked.map((p) => p.label);
        }
        ctx.selection.add("folders", rels);
        v.window.showInformationMessage(`AI Project: selected ${rels.length} folder(s). Selection: ${ctx.selection.summary()}.`);
        ctx.refresh();
      }
    });
  }
});

// src/commands/configureExclusions.js
var require_configureExclusions = __commonJS({
  "src/commands/configureExclusions.js"(exports2, module2) {
    var { PRESETS } = require_configManager();
    var { requirePm } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.configureExclusions": async () => {
        const v = ctx.vscode;
        const pm2 = requirePm(ctx);
        const current = pm2.config.get("excludePatterns");
        const mode = await v.window.showQuickPick([
          { label: "Add preset\u2026", id: "preset", description: Object.keys(PRESETS).join(", ") },
          { label: "Add pattern\u2026", id: "pattern", description: "file, folder, extension or glob" },
          { label: "Remove patterns\u2026", id: "remove", description: `${current.length} active` }
        ], { placeHolder: "Configure exclusions (excluded files are never scanned or sent)" });
        if (!mode) return;
        let next = current;
        if (mode.id === "preset") {
          const picked = await v.window.showQuickPick(Object.entries(PRESETS).map(([k, p]) => ({ label: k, description: p.join(", ") })), { canPickMany: true });
          if (!picked) return;
          next = [.../* @__PURE__ */ new Set([...current, ...picked.flatMap((p) => PRESETS[p.label])])];
        } else if (mode.id === "pattern") {
          const p = await v.window.showInputBox({ prompt: "Pattern (e.g. legacy/, *.generated.js, src/vendor)", ignoreFocusOut: true });
          if (!p) return;
          next = [.../* @__PURE__ */ new Set([...current, p.trim()])];
        } else {
          const picked = await v.window.showQuickPick(current.map((c) => ({ label: c })), { canPickMany: true, placeHolder: "Select patterns to remove" });
          if (!picked) return;
          next = current.filter((c) => !picked.some((p) => p.label === c));
        }
        await pm2.config.set("excludePatterns", next);
        v.window.showInformationMessage(`AI Project: ${next.length} exclusion pattern(s) active. Re-scan to apply.`);
        ctx.refresh();
      }
    });
  }
});

// src/commands/analyzeProject.js
var require_analyzeProject = __commonJS({
  "src/commands/analyzeProject.js"(exports2, module2) {
    var { requireProject, ensureScanned, runAnalysis: runAnalysis2, askPurpose } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.analyzeSelection": async (uri) => {
        const v = ctx.vscode;
        const pm2 = requireProject(ctx);
        if (uri && uri.fsPath && ctx.selection.isEmpty()) {
          const { toRel } = require_common();
          const rel = toRel(ctx, uri);
          const isDir = (await v.workspace.fs.stat(uri)).type === v.FileType.Directory;
          ctx.selection.add(isDir ? "folders" : "files", [rel]);
        }
        if (ctx.selection.isEmpty()) {
          const ed = v.window.activeTextEditor;
          if (ed && ed.document.uri.scheme === "file") {
            const { toRel } = require_common();
            ctx.selection.add("files", [toRel(ctx, ed.document.uri)]);
          }
        }
        if (ctx.selection.isEmpty()) {
          const choice = await v.window.showInformationMessage("Nothing is selected. Analyze the entire project? Large projects are split into batches.", { modal: true }, "Analyze entire project");
          if (!choice) return;
          ctx.selection.add("project");
        }
        const purpose = await askPurpose(ctx, "e.g. Understand the authentication flow");
        if (purpose === void 0) return;
        const snap = await runAnalysis2(ctx, { mode: ctx.selection.mode(), selection: ctx.selection.get(), purpose: purpose || void 0 });
        ctx.refresh();
        return snap;
      },
      "aiProject.analyzeDependencies": async (uri) => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        let rel;
        if (uri && uri.fsPath) {
          const { toRel } = require_common();
          rel = toRel(ctx, uri);
        } else {
          const files = (await pm2.knowledge.getFiles()).filter((f) => f.isSource);
          const pick = await v.window.showQuickPick(files.map((f) => ({ label: f.path })), { placeHolder: "File whose dependencies and dependents should be analyzed" });
          if (!pick) return;
          rel = pick.label;
        }
        return runAnalysis2(ctx, { mode: "FILE", selection: { files: [rel] }, purpose: `Dependencies of ${rel}` });
      }
    });
  }
});

// src/commands/analyzeWorkflow.js
var require_analyzeWorkflow = __commonJS({
  "src/commands/analyzeWorkflow.js"(exports2, module2) {
    var { ensureScanned, runAnalysis: runAnalysis2, askPurpose } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.analyzeWorkflows": async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const wfs = (await pm2.store.readJson("workflows/index.json", { workflows: [] })).workflows;
        if (!wfs.length) {
          v.window.showWarningMessage("AI Project: no workflows were traced from source (no API routes/UI handlers found).");
          return;
        }
        const picked = await v.window.showQuickPick(wfs.map((w) => ({ label: w.name, description: `${w.status} \xB7 ${w.files} files`, id: w.id })), { canPickMany: true, placeHolder: "Select workflows to analyze" });
        if (!picked || !picked.length) return;
        const purpose = await askPurpose(ctx, `Analyze ${picked.map((p) => p.label).join(", ")}`);
        if (purpose === void 0) return;
        return runAnalysis2(ctx, { mode: "WORKFLOW", selection: { workflows: picked.map((p) => p.id) }, purpose: purpose || void 0 });
      },
      "aiProject.showWorkflow": async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const wfs = (await pm2.store.readJson("workflows/index.json", { workflows: [] })).workflows;
        if (!wfs.length) {
          v.window.showWarningMessage("AI Project: no workflows found.");
          return;
        }
        const pick = await v.window.showQuickPick(wfs.map((w) => ({ label: w.name, description: w.status, id: w.id })), { placeHolder: "Show workflow" });
        if (!pick) return;
        await pm2.documentation.updateAll();
        const md = await pm2.documentation.read(`workflows/${pick.id}`);
        const doc = await v.workspace.openTextDocument({ language: "markdown", content: md || "# Workflow not documented yet" });
        await v.commands.executeCommand("markdown.showPreview", doc.uri).then(void 0, () => v.window.showTextDocument(doc));
      }
    });
  }
});

// src/commands/analyzeDatabase.js
var require_analyzeDatabase = __commonJS({
  "src/commands/analyzeDatabase.js"(exports2, module2) {
    var { ensureScanned, runAnalysis: runAnalysis2, askPurpose } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.analyzeDatabase": async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const ents = (await pm2.store.readJson("database/entities.json", { entities: [] })).entities;
        if (!ents.length) {
          v.window.showWarningMessage("AI Project: no database entities were found in source (no SQL schema, ORM models or collections).");
          return;
        }
        const picked = await v.window.showQuickPick([{ label: "$(database) All entities", id: "*" }, ...ents.map((e) => ({ label: e.name, description: `${e.kind} \xB7 ${e.source}` }))], { canPickMany: true, placeHolder: "Select database entities to analyze" });
        if (!picked || !picked.length) return;
        const all = picked.some((p) => p.id === "*");
        const purpose = await askPurpose(ctx, "Relationships, queries and data flow");
        if (purpose === void 0) return;
        return runAnalysis2(ctx, { mode: "DATABASE", selection: { entities: all ? ents.map((e) => e.name) : picked.map((p) => p.label) }, purpose: purpose || void 0 });
      },
      "aiProject.showDatabaseFlow": async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        await pm2.documentation.updateAll();
        const md = await pm2.documentation.read("database/overview") || await pm2.store.readText("architecture/data-flow.md", null);
        if (!md) {
          v.window.showInformationMessage("AI Project: no database information found in source.");
          return;
        }
        const doc = await v.workspace.openTextDocument({ language: "markdown", content: md });
        await v.commands.executeCommand("markdown.showPreview", doc.uri).then(void 0, () => v.window.showTextDocument(doc));
      }
    });
  }
});

// src/commands/analyzeFeature.js
var require_analyzeFeature = __commonJS({
  "src/commands/analyzeFeature.js"(exports2, module2) {
    var { ensureScanned, runAnalysis: runAnalysis2, askPurpose } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.analyzeFeature": async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const feats = (await pm2.store.readJson("features/index.json", { features: [] })).features;
        if (!feats.length) {
          v.window.showWarningMessage("AI Project: no features detected. Select files or a folder instead.");
          return;
        }
        const picked = await v.window.showQuickPick(feats.map((f) => ({ label: f.name, description: `${f.files} files \xB7 ${f.apis} APIs`, id: f.id })), { canPickMany: true, placeHolder: "Select features to analyze" });
        if (!picked || !picked.length) return;
        const purpose = await askPurpose(ctx, `Analyze ${picked.map((p) => p.label).join(", ")}`);
        if (purpose === void 0) return;
        return runAnalysis2(ctx, { mode: "FEATURE", selection: { features: picked.map((p) => p.id) }, purpose: purpose || void 0 });
      }
    });
  }
});

// src/commands/generateDocumentation.js
var require_generateDocumentation = __commonJS({
  "src/commands/generateDocumentation.js"(exports2, module2) {
    var { requireProject, ensureScanned, progress } = require_common();
    async function open(ctx, md, title) {
      const v = ctx.vscode;
      const doc = await v.workspace.openTextDocument({ language: "markdown", content: md });
      await v.commands.executeCommand("markdown.showPreview", doc.uri).then(void 0, () => v.window.showTextDocument(doc));
    }
    module2.exports = (ctx) => {
      const generate = (force, label) => async () => {
        const pm2 = await ensureScanned(ctx);
        const r = await progress(ctx, `AI Project: ${label} documentation\u2026`, () => pm2.documentation.updateAll({ force }));
        ctx.vscode.window.showInformationMessage(`AI Project: documentation ${r.wrote.length ? `updated (${r.wrote.length} document(s))` : "is already up to date"}. Coverage: ${r.coverage.coverageStatus}.`);
        ctx.refresh();
        return r;
      };
      return {
        "aiProject.generateDocumentation": generate(false, "generating"),
        "aiProject.updateDocumentation": generate(false, "updating"),
        "aiProject.rebuildDocumentation": generate(true, "rebuilding"),
        "aiProject.showArchitecture": async () => {
          const pm2 = await ensureScanned(ctx);
          await pm2.documentation.updateAll();
          const md = await pm2.documentation.read("documentation/architecture");
          if (!md) {
            ctx.vscode.window.showWarningMessage("AI Project: no architecture information yet.");
            return;
          }
          await open(ctx, md);
        },
        "aiProject.showDependencyGraph": async (uri) => {
          requireProject(ctx);
          if (uri && uri.fsPath) {
            const { toRel } = require_common();
            ctx.host.broadcastFocus = toRel(ctx, uri);
            ctx.host.openPanel("dependencies");
            ctx.host.broadcast("focus-file", { path: ctx.host.broadcastFocus });
            return;
          }
          ctx.host.openPanel("dependencies");
        }
      };
    };
  }
});

// src/commands/compareProjects.js
var require_compareProjects = __commonJS({
  "src/commands/compareProjects.js"(exports2, module2) {
    var path = require("path");
    var { requireProject, ensureScanned } = require_common();
    var { loadProjectSummary } = require_projectComparator();
    var { loadProjectDocuments } = require_documentationComparator();
    var { listScopeChoices, loadScopedSummary } = require_scopedComparator();
    var { buildComparisonRequest } = require_comparisonManager();
    var { MessageType } = require_bridgeProtocol();
    async function pickOtherProjects(ctx, pm2, min, load = loadProjectSummary) {
      const v = ctx.vscode;
      const folders = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: "Select project folder(s) containing .ai-project (the project root, not .ai-project itself)", title: "Projects to compare with the open project" });
      if (!folders || folders.length < min) {
        if (folders) v.window.showWarningMessage(`Select at least ${min} other project.`);
        return null;
      }
      const out = [];
      for (const f of folders) {
        try {
          out.push(await load(f.fsPath, pm2.config.get("aiProjectFolder")));
        } catch (e) {
          v.window.showWarningMessage(`${path.basename(f.fsPath)}: ${e.message}`);
          return null;
        }
      }
      return out;
    }
    function send(ctx, pm2, request) {
      const v = ctx.vscode;
      if (!pm2.bridge.activeConnection()) {
        v.window.showWarningMessage('Chrome is not connected. Run "AI Project: Pair Chrome" first.');
        return false;
      }
      pm2.bridge.send(MessageType.COMPARISON_REQUEST, request);
      v.window.showInformationMessage("AI Project: comparison sent to Chrome. The result will be stored in .ai-project/comparisons/. Source code is never modified by comparisons.");
      return true;
    }
    async function pickFolders(ctx, title) {
      const v = ctx.vscode;
      const folders = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: "Select project folder(s) (the project root, not .ai-project itself)", title });
      return folders && folders.length ? folders.map((f) => f.fsPath) : null;
    }
    async function pickScope(ctx, projectName, choices, { which = "any", hint = "" } = {}) {
      const v = ctx.vscode;
      const items = [];
      const byHint = (a, b) => (hint && b.name === hint) - (hint && a.name === hint);
      if (which !== "workflow") items.push(...[...choices.features].sort(byHint).map((f) => ({ label: `Feature: ${f.name}`, description: hint && f.name === hint ? "same name" : `${f.files} file(s)`, scope: { features: [f.id] } })));
      if (which !== "feature") items.push(...[...choices.workflows].sort(byHint).map((w) => ({ label: `Workflow: ${w.name}`, description: hint && w.name === hint ? "same name" : "", scope: { workflows: [w.id] } })));
      items.push({ label: "$(files) Choose files\u2026", description: "pick the specific files that make up the part to compare", files: true });
      const pick = await v.window.showQuickPick(items, { title: `Which part of "${projectName}" do you want to compare?`, placeHolder: "Only this part is compared, not the whole project" });
      if (!pick) return null;
      if (!pick.files) return pick.scope;
      const files = await v.window.showQuickPick(choices.files.map((f) => ({ label: f })), { canPickMany: true, matchOnDescription: true, title: `Files of "${projectName}" to compare`, placeHolder: "Tick the files for this feature" });
      if (!files || !files.length) return null;
      return { files: files.map((x) => x.label) };
    }
    function scopeFromSelection(sel) {
      const scope = { files: sel.files, folders: sel.folders, features: sel.features, workflows: sel.workflows };
      return Object.values(scope).some((a) => a.length) ? scope : null;
    }
    module2.exports = (ctx) => {
      const scoped = (which, useSelection) => async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const folder = pm2.config.get("aiProjectFolder");
        const sel = ctx.selection ? ctx.selection.get() : null;
        let mineScope = null;
        if (useSelection && sel) {
          if (sel.project) {
            v.window.showWarningMessage("AI Project: the entire project is selected. Select the files or feature to compare (or use Compare Projects for whole projects).");
            return;
          }
          mineScope = scopeFromSelection(sel);
          if (!mineScope) {
            v.window.showWarningMessage("AI Project: nothing is selected. Select the files or feature in the sidebar (Files), then run this again.");
            return;
          }
        }
        const myChoices = await listScopeChoices(pm2.root, folder);
        if (!mineScope) mineScope = await pickScope(ctx, pm2.project.name, myChoices, { which });
        if (!mineScope) return;
        let mine;
        try {
          mine = await loadScopedSummary(pm2.root, folder, mineScope);
        } catch (e) {
          v.window.showWarningMessage(`AI Project: ${e.message}`);
          return;
        }
        const hint = mineScope.features && myChoices.features.find((f) => f.id === mineScope.features[0]) || mineScope.workflows && myChoices.workflows.find((w) => w.id === mineScope.workflows[0]);
        const dirs = await pickFolders(ctx, `Other project(s) to compare "${mine.scope.label}" with`);
        if (!dirs) return;
        const summaries = [mine];
        for (const d of dirs) {
          try {
            const choices = await listScopeChoices(d, folder);
            const scope = await pickScope(ctx, path.basename(d), choices, { which, hint: hint ? hint.name : "" });
            if (!scope) return;
            summaries.push(await loadScopedSummary(d, folder, scope));
          } catch (e) {
            v.window.showWarningMessage(`${path.basename(d)}: ${e.message}`);
            return;
          }
        }
        const missing = summaries.filter((x) => x.undocumentedFiles.length);
        if (missing.length) v.window.showInformationMessage(`AI Project: ${missing.map((x) => `${x.project.name}: ${x.undocumentedFiles.length} selected file(s) have no generated documentation`).join("; ")}. Analyze them and run "Update Documentation" for a richer comparison; the structure is compared anyway.`);
        return send(ctx, pm2, buildComparisonRequest({ kind: which === "workflow" ? "WORKFLOW" : "FEATURE", summaries }));
      };
      const build = (kind, needIds) => async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const mine = await loadProjectSummary(pm2.root, pm2.config.get("aiProjectFolder"));
        const others = await pickOtherProjects(ctx, pm2, 1);
        if (!others) return;
        let ids = [];
        if (needIds) {
          const key = needIds === "feature" ? "features" : "workflows";
          const pick = await v.window.showQuickPick(mine[key].map((x) => ({ label: x.name || x.id, id: x.id })), { placeHolder: `Which ${needIds} of the open project should be compared?` });
          if (!pick) return;
          ids = [pick.id];
        }
        const request = buildComparisonRequest({ kind, summaries: [mine, ...others], ids });
        return send(ctx, pm2, request);
      };
      const buildDocs = async () => {
        const pm2 = await ensureScanned(ctx);
        let mine;
        try {
          mine = await loadProjectDocuments(pm2.root, pm2.config.get("aiProjectFolder"));
        } catch (e) {
          ctx.vscode.window.showWarningMessage(`AI Project: ${e.message}`);
          return;
        }
        const others = await pickOtherProjects(ctx, pm2, 1, loadProjectDocuments);
        if (!others) return;
        return send(ctx, pm2, buildComparisonRequest({ kind: "DOCUMENTATION", summaries: [mine, ...others] }));
      };
      return {
        "aiProject.compareDocumentation": buildDocs,
        "aiProject.compareProjects": build("PROJECT"),
        "aiProject.compareSelection": scoped("any", true),
        "aiProject.compareFeatures": scoped("feature", false),
        "aiProject.compareWorkflows": scoped("workflow", false),
        "aiProject.compareDatabases": build("DATABASE")
      };
    };
  }
});

// src/generation/projectGenerator.js
var require_projectGenerator = __commonJS({
  "src/generation/projectGenerator.js"(exports2, module2) {
    var fs = require("fs");
    var path = require("path");
    function flatten(tree, base = "") {
      const out = [];
      if (Array.isArray(tree)) {
        for (const t of tree) out.push(...flatten(t, base));
        return out;
      }
      if (typeof tree === "string") {
        out.push({ path: path.posix.join(base, tree), type: tree.endsWith("/") ? "dir" : "file" });
        return out;
      }
      if (tree && typeof tree === "object") {
        for (const [k, v] of Object.entries(tree)) {
          const p = path.posix.join(base, k);
          if (v && typeof v === "object") {
            out.push({ path: p, type: "dir" });
            out.push(...flatten(v, p));
          } else out.push({ path: p, type: k.endsWith("/") ? "dir" : "file" });
        }
      }
      return out;
    }
    function planFromBlueprint(record) {
      const entries = flatten(record.blueprint.folderStructure || []);
      const bad = entries.filter((e) => path.isAbsolute(e.path) || e.path.split("/").includes(".."));
      if (bad.length) throw new Error(`Blueprint contains unsafe paths: ${bad.slice(0, 3).map((b) => b.path).join(", ")}`);
      return { entries, note: "Only folders and empty placeholder files are created. Implementation is left to you." };
    }
    async function createFromBlueprint(plan, targetDir, record) {
      const existing = await fs.promises.readdir(targetDir);
      if (existing.length) throw new Error("Target folder is not empty. Choose an empty folder.");
      for (const e of plan.entries) {
        const abs = path.join(targetDir, e.path);
        if (path.relative(targetDir, abs).startsWith("..")) throw new Error(`Unsafe path ${e.path}`);
        if (e.type === "dir") await fs.promises.mkdir(abs, { recursive: true });
        else {
          await fs.promises.mkdir(path.dirname(abs), { recursive: true });
          await fs.promises.writeFile(abs, "", { flag: "wx" });
        }
      }
      await fs.promises.writeFile(path.join(targetDir, "BLUEPRINT.md"), `# Project Blueprint

Generated ${(/* @__PURE__ */ new Date()).toISOString()}.

\`\`\`json
${JSON.stringify(record.blueprint, null, 2)}
\`\`\`
`, { flag: "wx" });
      return { created: plan.entries.length };
    }
    module2.exports = { planFromBlueprint, createFromBlueprint, flatten };
  }
});

// src/commands/generateBlueprint.js
var require_generateBlueprint = __commonJS({
  "src/commands/generateBlueprint.js"(exports2, module2) {
    var path = require("path");
    var fs = require("fs");
    var { requireProject, ensureScanned } = require_common();
    var { loadProjectSummary } = require_projectComparator();
    var { buildBlueprintRequest } = require_blueprintGenerator();
    var { planFromBlueprint, createFromBlueprint } = require_projectGenerator();
    var { MessageType } = require_bridgeProtocol();
    var { buildSpec } = require_specBuilder();
    var { renderSpec } = require_specRenderer();
    module2.exports = (ctx) => ({
      "aiProject.generateBlueprint": async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        if (!pm2.bridge.activeConnection()) {
          v.window.showWarningMessage('Chrome is not connected. Run "AI Project: Pair Chrome" first.');
          return;
        }
        const summaries = [await loadProjectSummary(pm2.root, pm2.config.get("aiProjectFolder"))];
        const more = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: "Add reference project(s)", title: "Optional: other projects (with .ai-project) to draw from" });
        for (const f of more || []) {
          try {
            summaries.push(await loadProjectSummary(f.fsPath, pm2.config.get("aiProjectFolder")));
          } catch (e) {
            v.window.showWarningMessage(`${path.basename(f.fsPath)}: ${e.message}`);
            return;
          }
        }
        const src = await v.window.showQuickPick([{ label: "Type requirements", id: "type" }, { label: "Use a Markdown/text file", id: "file" }], { placeHolder: "Requirements for the new project" });
        if (!src) return;
        let requirements;
        if (src.id === "type") requirements = await v.window.showInputBox({ prompt: "Describe the project you want to plan", ignoreFocusOut: true });
        else {
          const f = await v.window.showOpenDialog({ canSelectMany: false, filters: { Text: ["md", "txt"] } });
          if (f && f[0]) requirements = (await fs.promises.readFile(f[0].fsPath, "utf8")).slice(0, 2e4);
        }
        if (!requirements) return;
        const specs = [];
        const dirs = [pm2.root, ...(more || []).map((f) => f.fsPath)];
        for (const d of dirs) {
          try {
            const sp = await buildSpec(d, pm2.config.get("aiProjectFolder"));
            const t = renderSpec(sp).text;
            specs.push({ project: sp.project.name, specText: t.length > 24e3 ? `${t.slice(0, 24e3)}
[\u2026 truncated for the AI]` : t });
          } catch {
          }
        }
        let gaps = [];
        for (const n of (await pm2.store.listDir("comparisons")).filter((x) => x.endsWith(".json")).sort().reverse()) {
          const c = await pm2.store.readJson(`comparisons/${n}`, null);
          if (c && c.kind === "SPEC" && c.matrices) {
            gaps = c.matrices.flatMap((m) => m.suggestions.map((s) => ({ direction: s.direction, area: s.area, title: s.title, items: s.items })));
            break;
          }
        }
        const req = buildBlueprintRequest({ summaries, requirements, specs, gaps });
        pm2.bridge.send(MessageType.BLUEPRINT_REQUEST, req);
        v.window.showInformationMessage("AI Project: blueprint requested. It will be saved to .ai-project/generation/project-blueprint.json. Blueprints are plans; they never modify source code.");
      },
      "aiProject.createFromBlueprint": async () => {
        const v = ctx.vscode;
        const pm2 = requireProject(ctx);
        const record = await pm2.store.readJson("generation/project-blueprint.json", null);
        if (!record) {
          v.window.showWarningMessage('AI Project: no blueprint yet. Run "Generate Project Blueprint".');
          return;
        }
        let plan;
        try {
          plan = planFromBlueprint(record);
        } catch (e) {
          v.window.showErrorMessage(e.message);
          return;
        }
        if (!plan.entries.length) {
          v.window.showWarningMessage("The blueprint has no folder structure to create.");
          return;
        }
        const target = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "Create project here (must be empty)" });
        if (!target || !target[0]) return;
        const ok = await v.window.showWarningMessage(`Create ${plan.entries.length} folder(s)/file(s) in ${path.basename(target[0].fsPath)}?`, { modal: true, detail: `${plan.note}
No existing project is modified.` }, "Create");
        if (ok !== "Create") return;
        try {
          const r = await createFromBlueprint(plan, target[0].fsPath, record);
          v.window.showInformationMessage(`AI Project: created ${r.created} entries.`);
        } catch (e) {
          v.window.showErrorMessage(e.message);
        }
      }
    });
  }
});

// src/commands/analyzeChange.js
var require_analyzeChange = __commonJS({
  "src/commands/analyzeChange.js"(exports2, module2) {
    var { ensureScanned, runAnalysis: runAnalysis2 } = require_common();
    module2.exports = (ctx) => {
      const flow = (intent, prompt) => async (uri) => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        if (uri && uri.fsPath && ctx.selection.isEmpty()) {
          const { toRel } = require_common();
          ctx.selection.add("files", [toRel(ctx, uri)]);
        }
        if (ctx.selection.isEmpty()) {
          await v.commands.executeCommand("aiProject.selectFiles");
          if (ctx.selection.isEmpty()) return;
        }
        const change = await v.window.showInputBox({ prompt, placeHolder: "e.g. Reject orders with negative quantities", ignoreFocusOut: true });
        if (!change) return;
        return runAnalysis2(ctx, { mode: ctx.selection.mode(), selection: ctx.selection.get(), purpose: `${intent === "CHANGE_PLAN" ? "Change plan" : "Change impact"}: ${change}`, intent });
      };
      return {
        "aiProject.analyzeChange": flow("CHANGE_IMPACT", "Describe the change to analyze (impact only; nothing is modified)"),
        "aiProject.generateChangePlan": flow("CHANGE_PLAN", "Describe the change to plan (the AI may return a proposal; you review the diff before anything is applied)")
      };
    };
  }
});

// src/commands/applyChanges.js
var require_applyChanges = __commonJS({
  "src/commands/applyChanges.js"(exports2, module2) {
    var path = require("path");
    var { requireProject } = require_common();
    var { STALE_MESSAGE } = require_changePlanner();
    var SCHEME = "aiproject-change";
    async function pickProposal(ctx, statuses) {
      const pm2 = requireProject(ctx);
      const all = (await pm2.changes.list()).filter((p) => !statuses || statuses.includes(p.status)).reverse();
      if (!all.length) {
        ctx.vscode.window.showInformationMessage("AI Project: no change proposals to show.");
        return null;
      }
      const pick = await ctx.vscode.window.showQuickPick(all.map((p) => ({ label: `${p.proposalId} \u2014 ${p.title}`, description: `${p.status} \xB7 risk ${p.risk} \xB7 ${p.files} file(s)`, id: p.proposalId })), { placeHolder: "Select a change proposal" });
      return pick ? pick.id : null;
    }
    module2.exports = (ctx) => {
      const v = ctx.vscode;
      const store = /* @__PURE__ */ new Map();
      ctx.context.subscriptions.push(v.workspace.registerTextDocumentContentProvider(SCHEME, { provideTextDocumentContent: (uri) => store.get(uri.toString()) || "" }));
      async function review(id) {
        const pm2 = requireProject(ctx);
        const rec = await pm2.changes.get(id);
        if (!rec) return null;
        const summary = [`# ${rec.title}`, "", `Status: **${rec.status}** \xB7 Risk: **${rec.impact.risk}** ${rec.impact.riskReasons.length ? `(${rec.impact.riskReasons.join("; ")})` : ""}`, "", rec.rationale || "_No rationale supplied._", "", "## Files", ...rec.files.map((f) => `- \`${f.path}\` \u2014 ${f.operation}${f.stale ? ` \u2014 **STALE**: ${f.staleReason}` : ` (+${f.added} \u2212${f.removed})`}`), "", "## Impact", `- Dependents: ${rec.impact.dependents.map((d) => d.path).join(", ") || "none"}`, `- Workflows: ${rec.impact.workflows.map((w) => w.name).join(", ") || "none"}`, `- Features: ${rec.impact.features.map((f) => f.name).join(", ") || "none"}`, `- Database entities: ${rec.impact.entities.map((e) => e.name).join(", ") || "none"}`, "", rec.status === "STALE" ? `> ${STALE_MESSAGE}` : ""].join("\n");
        const sdoc = await v.workspace.openTextDocument({ language: "markdown", content: summary });
        await v.window.showTextDocument(sdoc, { preview: true });
        for (const f of rec.files.filter((x) => !x.stale)) {
          const left = v.Uri.parse(`${SCHEME}:/${id}/original/${f.path}`);
          const right = v.Uri.parse(`${SCHEME}:/${id}/proposed/${f.path}`);
          let original = "";
          try {
            original = Buffer.from(await v.workspace.fs.readFile(v.Uri.file(path.join(pm2.root, f.path)))).toString("utf8");
          } catch {
            original = "";
          }
          store.set(left.toString(), f.operation === "CREATE" ? "" : original);
          store.set(right.toString(), f.operation === "DELETE" ? "" : f.newContent);
          await v.commands.executeCommand("vscode.diff", left, right, `${f.path} (${f.operation}) \u2014 proposed`, { preview: false });
        }
        return rec;
      }
      return {
        "aiProject.reviewChanges": async (id) => {
          const pid = typeof id === "string" ? id : await pickProposal(ctx);
          if (pid) return review(pid);
        },
        "aiProject.applyChanges": async (id) => {
          const pm2 = requireProject(ctx);
          const pid = typeof id === "string" ? id : await pickProposal(ctx, ["PROPOSED", "STALE"]);
          if (!pid) return;
          const rec = await review(pid);
          if (!rec) return;
          const needConfirm = pm2.config.get("requireApprovalForChanges") !== false;
          try {
            const res = await v.window.withProgress({ location: v.ProgressLocation.Notification, title: `AI Project: applying ${pid}\u2026` }, () => pm2.changes.apply(pid, {
              approve: async (r) => {
                if (!needConfirm) return true;
                const pick = await v.window.showWarningMessage(`Apply ${r.title}?`, { modal: true, detail: `${r.files.length} file(s) will change. Risk: ${r.impact.risk}. Originals are backed up under ${pm2.config.get("aiProjectFolder")}/snapshots/changes/${pid}/.` }, "Apply changes");
                return pick === "Apply changes";
              },
              onOutput: (s) => ctx.out.append(s)
            }));
            if (res.status === "REJECTED") {
              v.window.showInformationMessage("AI Project: changes were not applied.");
              return res;
            }
            const ver = res.record.verification;
            if (ver && ver.ok === false) {
              const failed = ver.results[ver.results.length - 1];
              const pick = await v.window.showErrorMessage(`Applied, but verification failed at "${failed.label}". See the AI Project output.`, "Show output", "Roll back");
              ctx.out.appendLine(failed.output);
              if (pick === "Show output") ctx.out.show(true);
              if (pick === "Roll back") {
                await pm2.changes.rollback(pid);
                v.window.showInformationMessage("AI Project: changes rolled back.");
              }
            } else v.window.showInformationMessage(`AI Project: applied ${pid}. ${ver && ver.ran ? `Verification passed (${ver.results.map((r) => r.kind).join(", ")}).` : "No verification commands were detected in this project."} Knowledge was rescanned; affected documentation is marked OUTDATED.`);
            ctx.refresh();
            return res;
          } catch (err) {
            if (err.code === "HASH_MISMATCH") {
              const pick = await v.window.showErrorMessage(`${STALE_MESSAGE}`, { detail: err.message }, "Analyze again");
              if (pick === "Analyze again") v.commands.executeCommand("aiProject.analyzeChange");
              ctx.refresh();
              return;
            }
            throw err;
          }
        }
      };
    };
  }
});

// src/commands/verifyProject.js
var require_verifyProject = __commonJS({
  "src/commands/verifyProject.js"(exports2, module2) {
    var { ensureScanned } = require_common();
    var { detectCommands, runAll } = require_verificationManager();
    module2.exports = (ctx) => ({
      "aiProject.verifyProject": async () => {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const cmds = await detectCommands(pm2.root, pm2.scanResult.packages.commands.scripts);
        if (!cmds.length) {
          v.window.showInformationMessage("AI Project: no test/lint/typecheck/build commands were detected in this project (package.json scripts, composer scripts, Makefile).");
          return;
        }
        const picked = await v.window.showQuickPick(cmds.map((c) => ({ label: c.label, description: `${c.kind} \xB7 ${c.source}`, picked: true, cmd: c })), { canPickMany: true, placeHolder: "Select checks to run" });
        if (!picked || !picked.length) return;
        ctx.out.show(true);
        const res = await v.window.withProgress({ location: v.ProgressLocation.Notification, title: "AI Project: verifying\u2026" }, () => runAll(pm2.root, picked.map((p) => p.cmd), { onOutput: (s) => ctx.out.append(s) }));
        for (const r of res.results) ctx.out.appendLine(`
[${r.ok ? "PASS" : "FAIL"}] ${r.label} (${(r.durationMs / 1e3).toFixed(1)}s)`);
        (res.ok ? v.window.showInformationMessage : v.window.showErrorMessage)(res.ok ? `AI Project: all ${res.ran} check(s) passed.` : `AI Project: verification failed at ${res.results[res.results.length - 1].label}.`);
        return res;
      }
    });
  }
});

// src/commands/connectChrome.js
var require_connectChrome = __commonJS({
  "src/commands/connectChrome.js"(exports2, module2) {
    var { requirePm, requireProject } = require_common();
    module2.exports = (ctx) => {
      async function pair() {
        const v = ctx.vscode;
        const pm2 = requireProject(ctx);
        const p = await pm2.bridge.startPairing();
        const mins = Math.round((new Date(p.expiresAt) - Date.now()) / 6e4);
        ctx.refresh();
        const action = await v.window.showInformationMessage(`Pairing code: ${p.code}   (expires in ~${mins} min)`, { detail: `In the Chrome extension (AI Project Bridge \u2192 Connection tab) paste this whole code, including the number in front. VS Code listens on ${p.host}:${p.port} (this computer only). You will be asked to confirm the pairing here. Working on several projects? Each VS Code window gets its own code; pairing Chrome to one pauses the other.` }, "Copy code");
        if (action === "Copy code") await v.env.clipboard.writeText(p.code);
        return { expiresAt: p.expiresAt, host: p.host, port: p.port, token: p.token, code: p.code };
      }
      return {
        "aiProject.pairChrome": pair,
        "aiProject.connectChrome": async () => {
          const v = ctx.vscode;
          const pm2 = requireProject(ctx);
          const paired = await pm2.bridge.security.listConnections();
          if (!paired.length) {
            const pick = await v.window.showInformationMessage("No Chrome extension has been paired with this machine yet.", "Pair Chrome");
            if (pick) return pair();
            return;
          }
          const st = await pm2.bridge.start();
          v.window.showInformationMessage(`AI Project: listening on ${st.host}:${st.port}. Open the Chrome extension and choose Connect; previously paired browsers reconnect automatically.`);
          ctx.refresh();
        },
        "aiProject.showChromeStatus": async () => {
          const v = ctx.vscode;
          const pm2 = requirePm(ctx);
          const s = pm2.bridge.getStatus();
          const lines = [`State: ${s.state}`, `Provider: ${s.provider || "\u2014"}`, `Session: ${s.sessionId || "\u2014"}`, `Project: ${s.projectId || "\u2014"}`, s.activeAnalysis ? `Analysis: ${s.activeAnalysis.analysisId} \u2014 batch ${s.activeAnalysis.batchNumber}/${s.activeAnalysis.totalBatches} (${s.activeAnalysis.status})` : "Analysis: none"];
          const pick = await v.window.showInformationMessage(`Chrome bridge: ${s.state}`, { detail: lines.join("\n") }, "Open panel");
          if (pick) ctx.host.openPanel("connection");
        }
      };
    };
  }
});

// src/commands/disconnectChrome.js
var require_disconnectChrome = __commonJS({
  "src/commands/disconnectChrome.js"(exports2, module2) {
    var { requirePm } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.disconnectChrome": async () => {
        const v = ctx.vscode;
        const pm2 = requirePm(ctx);
        const pick = await v.window.showQuickPick([{ label: "Disconnect", id: "keep", description: "Chrome can reconnect without pairing again" }, { label: "Disconnect and forget pairing", id: "revoke", description: "Chrome must be paired again" }, { label: "Stop bridge", id: "stop", description: "Stop listening on the local port" }], { placeHolder: "Chrome connection" });
        if (!pick) return;
        if (pick.id === "stop") await pm2.bridge.stop();
        else await pm2.bridge.disconnect({ revoke: pick.id === "revoke" });
        v.window.showInformationMessage("AI Project: Chrome disconnected. Progress of running analyses is saved.");
        ctx.refresh();
      }
    });
  }
});

// src/commands/resumeAnalysis.js
var require_resumeAnalysis = __commonJS({
  "src/commands/resumeAnalysis.js"(exports2, module2) {
    var { requireProject } = require_common();
    module2.exports = (ctx) => ({
      "aiProject.resumeAnalysis": async (id) => {
        const v = ctx.vscode;
        const pm2 = requireProject(ctx);
        let analysisId = typeof id === "string" ? id : null;
        if (!analysisId) {
          const list = await pm2.history.resumable();
          if (!list.length) {
            v.window.showInformationMessage("AI Project: no interrupted analyses to resume.");
            return;
          }
          const pick = await v.window.showQuickPick(list.map((r) => ({ label: r.analysisId, description: `${r.mode} \xB7 ${r.status} \xB7 ${r.checkpoints.filter((c) => c.status === "completed").length}/${r.batches.length} batches done`, detail: r.purpose || "" })), { placeHolder: "Resume analysis" });
          if (!pick) return;
          analysisId = pick.label;
        }
        const snap = await pm2.resumeAnalysis(analysisId);
        v.window.showInformationMessage(`AI Project: resuming ${analysisId} from its last checkpoint (${snap.completedBatches.length}/${snap.totalBatches} batches already complete).`);
        ctx.refresh();
        return snap;
      }
    });
  }
});

// src/spec/specComparator.js
var require_specComparator = __commonJS({
  "src/spec/specComparator.js"(exports2, module2) {
    var norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    var singular = (s) => s.length > 3 && s.endsWith("ies") ? `${s.slice(0, -3)}y` : s.length > 3 && s.endsWith("s") && !s.endsWith("ss") ? s.slice(0, -1) : s;
    var nkey = (s) => singular(norm(s));
    var normPath = (p) => String(p || "").toLowerCase().replace(/:[a-z_][\w]*|\{[^}]+\}|\[[^\]]+\]|<[^>]+>|\*\w*/g, ":p").replace(/\/+$/, "") || "/";
    var FAMILIES = {
      string: ["string", "str", "char", "varchar", "nvarchar", "text", "longtext", "mediumtext", "tinytext", "email", "slug", "url", "charfield", "textfield", "emailfield", "enum", "citext", "symbol"],
      number: ["number", "int", "integer", "bigint", "smallint", "tinyint", "mediumint", "uint", "serial", "bigserial", "numeric", "decimal", "float", "double", "real", "money", "integerfield", "floatfield", "decimalfield", "autofield", "bigautofield", "biginteger", "positiveinteger", "int32", "int64", "float32", "float64", "long", "short"],
      bool: ["bool", "boolean", "bit", "booleanfield"],
      datetime: ["date", "datetime", "timestamp", "timestamptz", "time", "datefield", "datetimefield", "timestamps", "instant", "localdatetime"],
      uuid: ["uuid", "guid", "uuidfield"],
      json: ["json", "jsonb", "object", "dict", "map", "mixed", "jsonfield", "hstore"],
      bytes: ["blob", "bytea", "bytes", "binary", "byte", "varbinary", "buffer"]
    };
    var FAMILY_OF = Object.fromEntries(Object.entries(FAMILIES).flatMap(([f, names]) => names.map((n) => [n, f])));
    var normType = (t) => {
      const base = String(t || "unknown").toLowerCase().replace(/\(.*$/, "").replace(/[\s[\]<>*]/g, "").replace(/unsigned$/, "");
      return FAMILY_OF[base] || base;
    };
    var major = (v) => {
      const m = /(\d+)/.exec(String(v || ""));
      return m ? m[1] : String(v || "");
    };
    var RULE_ALIAS = { notnull: "required", notempty: "required", isnotempty: "required", notblank: "required", nonempty: "required", gte: "min", ge: "min", minvalue: "min", minvaluevalidator: "min", lte: "max", le: "max", maxvalue: "max", maxvaluevalidator: "max", minlength: "minlength", minlen: "minlength", length: "length", uniqueindex: "unique", isemail: "email", emailvalidator: "email", isurl: "url", isuuid: "uuid", gt: "greater", lt: "less", maxlength: "maxlength", maxlen: "maxlength" };
    var ruleKey = (r) => {
      const m = /^type\(([^)]*)\)$/.exec(String(r));
      const k = norm(m ? m[1] : String(r).replace(/\(.*$/, ""));
      return RULE_ALIAS[k] || k;
    };
    function items(spec) {
      const m = {};
      const put = (cat, key, label, detail) => {
        if (!key) return;
        m[cat] ||= /* @__PURE__ */ new Map();
        if (!m[cat].has(key)) m[cat].set(key, { key, label, detail: detail || "" });
      };
      for (const f of spec.features) put("features", nkey(f.name), f.name, `${f.apis.length} API(s), ${f.entities.length} entit${f.entities.length === 1 ? "y" : "ies"}`);
      for (const a of spec.apis) put("apis", `${a.method} ${normPath(a.endpoint)}`, a.key, a.protected ? "protected" : "");
      for (const e of spec.database.entities) {
        put("tables", nkey(e.name), e.name, `${e.fields.length} field(s)`);
        for (const f of e.fields) put("fields", `${nkey(e.name)}.${norm(f.name)}`, `${e.name}.${f.name}`, `${f.type}${f.required ? ", required" : ""}${f.unique ? ", unique" : ""}`);
      }
      for (const r of spec.database.relationships) put("relationships", `${nkey(r.from)}>${nkey(r.to)}`, `${r.from} \u2192 ${r.to}`, r.type);
      for (const v of spec.validation) {
        if (v.kind === "guard") put("validation", `guard:${norm(v.rules[0]).replace(/http\d+/, "")}`, v.rules[0], "guard");
        else for (const r of v.rules) put("validation", `${norm(v.field)}:${ruleKey(r)}`, `${v.field}: ${r}`, v.kind);
      }
      for (const b of spec.businessRules) put("businessRules", `${b.kind}:${norm(b.symbol)}`, `${b.kind}: ${b.symbol}`, "inferred");
      for (const w of spec.workflows) put("workflows", w.api ? `${w.api.split(" ")[0]} ${normPath(w.api.split(" ").slice(1).join(" "))}` : nkey(w.name), w.name, `${w.steps.length} step(s)`);
      for (const p of [...spec.stack.runtimeModules, ...spec.stack.devModules]) {
        const eco = p.ecosystem || "npm";
        put("modules", `${eco}:${norm(p.name)}`, eco === "npm" ? p.name : `${p.name} [${eco}]`, p.version);
      }
      const CODE = /* @__PURE__ */ new Set(["javascript", "typescript", "python", "go", "java", "kotlin", "csharp", "php", "ruby", "rust", "swift", "dart", "vue", "svelte"]);
      for (const l of Object.keys(spec.stack.languages || {})) if (CODE.has(l)) put("stack", `lang:${l}`, l, `${spec.stack.languages[l]} files`);
      for (const t of spec.stack.technologies || []) if (!CODE.has(norm(t.name)) && !["nodejs", "csharp", "java"].includes(norm(t.name))) put("stack", `tech:${norm(t.name)}`, t.name, "");
      for (const v of spec.environment.variables) put("environment", norm(v.name), v.name, "");
      for (const s of spec.externalServices) put("services", norm(s.name), s.name, "");
      for (const a of spec.auth) put("auth", `${a.type}:${a.kind}`, `${a.type}: ${a.kind}`, "");
      for (const l of Object.keys(spec.architecture.layers || {})) put("layers", norm(l), l, `${spec.architecture.layers[l].length} file(s)`);
      for (const s of spec.state) put("state", norm(s.library), s.library, "");
      return m;
    }
    var CATEGORIES = [
      ["stack", "Languages and frameworks"],
      ["features", "Features"],
      ["tables", "Database tables"],
      ["fields", "Database fields"],
      ["relationships", "Table relationships"],
      ["apis", "API endpoints"],
      ["validation", "Validation rules"],
      ["businessRules", "Business rules"],
      ["workflows", "Workflows"],
      ["modules", "Required modules"],
      ["auth", "Authentication / authorization"],
      ["services", "External services"],
      ["environment", "Environment variables"],
      ["layers", "Architecture layers"],
      ["state", "State management"]
    ];
    function compareSpecs(a, b) {
      const A = items(a);
      const B = items(b);
      const categories = CATEGORIES.map(([id, title]) => {
        const ma = A[id] || /* @__PURE__ */ new Map();
        const mb = B[id] || /* @__PURE__ */ new Map();
        const common = [];
        const onlyA = [];
        const onlyB = [];
        const different = [];
        for (const [k, x] of ma) {
          const y = mb.get(k);
          if (!y) {
            onlyA.push(x);
            continue;
          }
          common.push({ key: k, label: x.label, a: x.detail, b: y.detail });
          if (id === "fields" && normType(x.detail.split(",")[0]) !== normType(y.detail.split(",")[0])) different.push({ key: k, label: x.label, a: x.detail, b: y.detail, why: "field type differs" });
          if (id === "fields" && /required/.test(x.detail) !== /required/.test(y.detail)) different.push({ key: `${k}#req`, label: x.label, a: x.detail, b: y.detail, why: "required differs" });
          if (id === "modules" && major(x.detail) !== major(y.detail)) different.push({ key: k, label: x.label, a: x.detail, b: y.detail, why: "major version differs" });
          if (id === "apis" && x.detail !== y.detail) different.push({ key: k, label: x.label, a: x.detail || "not protected", b: y.detail || "not protected", why: "protection differs" });
        }
        for (const [k, y] of mb) if (!ma.has(k)) onlyB.push(y);
        return { id, title, common, onlyA, onlyB, different, counts: { common: common.length, onlyA: onlyA.length, onlyB: onlyB.length, different: different.length } };
      });
      const totals = categories.reduce((t, c) => ({ common: t.common + c.counts.common, onlyA: t.onlyA + c.counts.onlyA, onlyB: t.onlyB + c.counts.onlyB, different: t.different + c.counts.different }), { common: 0, onlyA: 0, onlyB: 0, different: 0 });
      return { a: { projectId: a.project.projectId, name: a.project.name, coverage: a.coverage }, b: { projectId: b.project.projectId, name: b.project.name, coverage: b.coverage }, totals, categories, suggestions: suggest(a.project.name, b.project.name, categories) };
    }
    var ADOPT_ORDER = ["stack", "features", "tables", "fields", "apis", "validation", "workflows", "modules", "auth", "services", "environment", "layers", "businessRules", "relationships", "state"];
    var SHOW = 12;
    function suggest(nameA, nameB, categories) {
      const by = Object.fromEntries(categories.map((c) => [c.id, c]));
      const out = [];
      for (const id of ADOPT_ORDER) {
        const c = by[id];
        if (c.onlyB.length) out.push({ id: `adopt-${id}`, direction: "adopt", area: c.title, title: `${c.title}: ${nameB} has ${c.onlyB.length} that ${nameA} does not`, reason: `Consider whether ${nameA} needs these.`, items: c.onlyB.slice(0, SHOW).map((x) => x.label), more: Math.max(0, c.onlyB.length - SHOW) });
      }
      for (const id of ADOPT_ORDER) {
        const c = by[id];
        if (c.onlyA.length) out.push({ id: `keep-${id}`, direction: "keep", area: c.title, title: `${c.title}: ${nameA} has ${c.onlyA.length} that ${nameB} does not`, reason: `Keep these in a combined blueprint if they are still required, or note that ${nameB} works without them.`, items: c.onlyA.slice(0, SHOW).map((x) => x.label), more: Math.max(0, c.onlyA.length - SHOW) });
      }
      for (const c of categories) if (c.different.length) out.push({ id: `review-${c.id}`, direction: "review", area: c.title, title: `${c.title}: ${c.different.length} in both projects but different`, reason: "Decide which behaviour the new project should follow; the blueprint should record the choice.", items: c.different.slice(0, SHOW).map((x) => `${x.label}: ${nameA} = ${x.a || "\u2013"}, ${nameB} = ${x.b || "\u2013"} (${x.why})`), more: Math.max(0, c.different.length - SHOW) });
      return out;
    }
    function matrixText(m, limit = 40) {
      const lines = [`COMPARISON: ${m.a.name} (A)  vs  ${m.b.name} (B)`, `Totals: ${m.totals.common} common, ${m.totals.onlyA} only in A, ${m.totals.onlyB} only in B, ${m.totals.different} differ`, ""];
      for (const c of m.categories) {
        if (!c.counts.common && !c.counts.onlyA && !c.counts.onlyB) continue;
        lines.push(`## ${c.title}  (common ${c.counts.common}, only A ${c.counts.onlyA}, only B ${c.counts.onlyB}, differ ${c.counts.different})`);
        const row = (tag, xs) => {
          if (xs.length) lines.push(`  ${tag}: ${xs.slice(0, limit).map((x) => x.label).join("; ")}${xs.length > limit ? `; \u2026 +${xs.length - limit} more` : ""}`);
        };
        row("Common", c.common);
        row("Only in A", c.onlyA);
        row("Only in B", c.onlyB);
        if (c.different.length) lines.push(`  Differ: ${c.different.slice(0, limit).map((x) => `${x.label} (A: ${x.a || "\u2013"}; B: ${x.b || "\u2013"}; ${x.why})`).join("; ")}`);
        lines.push("");
      }
      return lines.join("\n");
    }
    module2.exports = { compareSpecs, matrixText, items, CATEGORIES };
  }
});

// src/commands/spec.js
var require_spec = __commonJS({
  "src/commands/spec.js"(exports2, module2) {
    var path = require("path");
    var { ensureScanned } = require_common();
    var { exportSpec } = require_specStore();
    var { buildSpec } = require_specBuilder();
    var { renderSpec } = require_specRenderer();
    var { compareSpecs, matrixText } = require_specComparator();
    var { storeSpecComparison } = require_comparisonManager();
    var { MessageType } = require_bridgeProtocol();
    var SPEC_CHARS = 24e3;
    module2.exports = (ctx) => {
      const folderOf = (pm2) => pm2.config.get("aiProjectFolder");
      async function exportCmd() {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const r = await exportSpec(pm2.store, pm2.root, folderOf(pm2));
        const abs = path.join(pm2.store.dir, r.textPath);
        ctx.refresh();
        const note = r.spec.coverage.status === "COMPLETE" ? "" : ` Only ${r.spec.coverage.filesAnalyzed} of ${r.spec.coverage.filesTotal} files are AI-analysed so far; unknown parts are marked.`;
        const pick = await v.window.showInformationMessage(`AI Project: project specification written to ${folderOf(pm2)}/${r.textPath}.${note}`, "Open", "Copy to clipboard", "Show in folder");
        if (pick === "Open") await v.window.showTextDocument(await v.workspace.openTextDocument(v.Uri.file(abs)));
        if (pick === "Copy to clipboard") {
          await v.env.clipboard.writeText(r.text);
          v.window.showInformationMessage("AI Project: specification copied. Paste it into ChatGPT, Claude or Gemini.");
        }
        if (pick === "Show in folder") await v.commands.executeCommand("revealFileInOS", v.Uri.file(abs));
        return r;
      }
      async function pickProjects() {
        const v = ctx.vscode;
        const folders = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: "Compare with this project", title: "Project(s) to compare with the open project (the project folder, not .ai-project)" });
        return folders && folders.length ? folders.map((f) => f.fsPath) : null;
      }
      async function compare(withAi) {
        const v = ctx.vscode;
        const pm2 = await ensureScanned(ctx);
        const dirs = await pickProjects();
        if (!dirs) return;
        let mine;
        const others = [];
        try {
          mine = await exportSpec(pm2.store, pm2.root, folderOf(pm2));
          for (const d of dirs) others.push({ dir: d, spec: await buildSpec(d, folderOf(pm2)) });
        } catch (e) {
          v.window.showWarningMessage(`AI Project: ${e.message}`);
          return;
        }
        const matrices = others.map((o) => compareSpecs(mine.spec, o.spec));
        const rec = await storeSpecComparison(pm2.store, { matrices });
        ctx.refresh();
        await ctx.host.openPanel("compare");
        if (!withAi) {
          v.window.showInformationMessage(`AI Project: compared ${mine.spec.project.name} with ${others.map((o) => o.spec.project.name).join(", ")}. Use "Ask AI to analyze" for an explanation and blueprint advice.`);
          return rec;
        }
        if (!pm2.bridge.activeConnection()) {
          v.window.showWarningMessage('AI Project: the instant comparison is saved, but Chrome is not connected, so the AI analysis was not requested. Run "AI Project: Pair Chrome" and try again.');
          return rec;
        }
        const clip = (t) => t.length > SPEC_CHARS ? `${t.slice(0, SPEC_CHARS)}
[\u2026 truncated for the AI; the full specification is in the project folder]` : t;
        const projects = [{ project: { projectId: mine.spec.project.projectId, name: mine.spec.project.name }, coverage: mine.spec.coverage, specText: clip(mine.text) }, ...others.map((o) => ({ project: { projectId: o.spec.project.projectId, name: o.spec.project.name }, coverage: o.spec.coverage, specText: clip(renderSpec(o.spec).text) }))];
        pm2.bridge.send(MessageType.COMPARISON_REQUEST, {
          kind: "SPEC",
          projects,
          ref: rec.comparisonId,
          selection: [],
          structural: { comparisonText: matrices.map((m) => matrixText(m, 25)).join("\n\n"), totals: matrices.map((m) => ({ a: m.a.name, b: m.b.name, ...m.totals })) },
          instructions: { noScoring: true, noRanking: true, recordConflicts: true, useEvidenceLabels: true }
        });
        v.window.showInformationMessage("AI Project: comparison saved and sent to Chrome. Approve it on the Compare tab in the Chrome side panel; the AI analysis will appear next to the instant comparison.");
        return rec;
      }
      return {
        "aiProject.exportSpec": exportCmd,
        "aiProject.compareSpec": () => compare(false),
        "aiProject.compareSpecWithAi": () => compare(true)
      };
    };
  }
});

// src/commands/index.js
var require_commands = __commonJS({
  "src/commands/index.js"(exports2, module2) {
    var MODULES = [
      require_startHere(),
      require_initializeProject(),
      require_scanProject(),
      require_selectFiles(),
      require_selectFolder(),
      require_configureExclusions(),
      require_analyzeProject(),
      require_analyzeWorkflow(),
      require_analyzeDatabase(),
      require_analyzeFeature(),
      require_generateDocumentation(),
      require_compareProjects(),
      require_generateBlueprint(),
      require_analyzeChange(),
      require_applyChanges(),
      require_verifyProject(),
      require_connectChrome(),
      require_disconnectChrome(),
      require_resumeAnalysis(),
      require_spec()
    ];
    function collect2(ctx) {
      const all = {};
      for (const m of MODULES) Object.assign(all, m(ctx));
      all["aiProject.openDashboard"] = async () => ctx.host.openPanel("dashboard");
      return all;
    }
    module2.exports = { collect: collect2, MODULES };
  }
});

// src/ui/rpc.js
var require_rpc = __commonJS({
  "src/ui/rpc.js"(exports2, module2) {
    var { DEFAULTS } = require_configManager();
    var { traverse } = require_reverseDependencyAnalyzer();
    var { toUserMessage: toUserMessage2 } = require_errors();
    var { resolveInside } = require_paths();
    var { detectCommands } = require_verificationManager();
    var sv = require_scopeView();
    var COMMAND_WHITELIST = /^aiProject\.[A-Za-z]+$/;
    function createRpc2({ getPm, selection, actions }) {
      const pm2 = () => {
        const p = getPm();
        if (!p) {
          const e = new Error("Open a folder to use AI Project Intelligence.");
          e.code = "NO_WORKSPACE";
          throw e;
        }
        return p;
      };
      const store = () => pm2().store;
      const scopeOf = async (scoped) => scoped ? sv.selectionScope(store(), selection.get(), pm2().config.get("aiProjectFolder")) : null;
      const methods = {
        async getState() {
          const p = getPm();
          if (!p) return { noWorkspace: true };
          return { ...await p.state(), selection: selection.get(), selectionMode: selection.mode(), selectionSummary: selection.summary() };
        },
        async getFiles({ status, query, limit = 5e3 } = {}) {
          const files = await pm2().knowledge.getFiles();
          const q = query ? String(query).toLowerCase() : null;
          return files.filter((f) => (!status || f.status === status) && (!q || f.path.toLowerCase().includes(q))).slice(0, limit).map((f) => ({ path: f.path, language: f.language, lines: f.lines, tokens: f.tokens, status: f.status, isSource: f.isSource, isTest: f.isTest, binary: f.binary }));
        },
        async getFile({ path }) {
          const s = store();
          const files = await pm2().knowledge.getFiles();
          const record = files.find((f) => f.path === path);
          if (!record) throw new Error(`Unknown file ${path}`);
          const symbols = (await s.readJson("index/symbols.json", { symbols: [] })).symbols.filter((x) => x.file === path);
          const deps = (await s.readJson("index/dependencies.json", { dependencies: {} })).dependencies[path] || { internal: [], external: [] };
          const dependents = (await s.readJson("index/dependents.json", { dependents: {} })).dependents[path] || [];
          const routes = (await s.readJson("index/routes.json", { routes: [] })).routes.filter((r) => r.file === path);
          const fileEntities = (await s.readJson("index/database.json", { fileEntities: {} })).fileEntities[path] || { reads: [], writes: [] };
          const wf = (await s.readJson("workflows/index.json", { workflows: [] })).workflows.filter((w) => (w.sourceFiles || []).includes(path)).map((w) => ({ id: w.id, name: w.name }));
          return { record, symbols, dependencies: deps, dependents, routes, entities: fileEntities, workflows: wf, knowledge: await pm2().knowledge.getFileKnowledge(path) };
        },
        async getScope() {
          const sc = await sv.selectionScope(store(), selection.get(), pm2().config.get("aiProjectFolder"));
          return sc ? { active: true, label: sc.label, files: sc.files.size } : { active: false, label: "entire project", files: 0 };
        },
        async getWorkflows({ scoped } = {}) {
          const list = (await store().readJson("workflows/index.json", { workflows: [] })).workflows;
          const sc = await scopeOf(scoped);
          return sc ? sv.filterWorkflows(store(), list, sc.files) : list;
        },
        async getWorkflow({ id }) {
          const w = await pm2().workflowStore.get(String(id));
          if (!w) throw new Error(`Unknown workflow ${id}`);
          return w;
        },
        async getFeatures({ scoped } = {}) {
          const list = (await store().readJson("features/index.json", { features: [] })).features;
          const sc = await scopeOf(scoped);
          return sc ? sv.filterFeatures(store(), list, sc.files) : list;
        },
        async getFeature({ id }) {
          if (!/^[^\\/]+$/.test(String(id)) || String(id) === ".." || String(id) === ".") throw new Error(`Unknown feature ${id}`);
          const f = await store().readJson(`features/${String(id)}.json`, null);
          if (!f) throw new Error(`Unknown feature ${id}`);
          return f;
        },
        async getDatabase({ scoped } = {}) {
          const s = store();
          const [ents, rels, qs, flows, idx] = await Promise.all([s.readJson("database/entities.json", { entities: [] }), s.readJson("database/relationships.json", { relationships: [] }), s.readJson("database/queries.json", { queries: [] }), s.readJson("database/data-flows.json", { dataFlows: [] }), s.readJson("index/database.json", { technologies: [] })]);
          const db = { technologies: idx.technologies.map((t) => t.name), entities: ents.entities, relationships: rels.relationships, queries: qs.queries, dataFlows: flows.dataFlows };
          const sc = await scopeOf(scoped);
          return sc ? sv.filterDatabase(db, sc.files) : db;
        },
        async getApis({ scoped } = {}) {
          const a = await store().readJson("index/apis.json", { apis: [] });
          const all = { apis: a.apis, clientCalls: a.clientCalls || [], auth: a.auth || [], externalServices: a.externalServices || {} };
          const sc = await scopeOf(scoped);
          return sc ? sv.filterApis(all, sc.files) : all;
        },
        async getDependencies({ file, depth = 2, direction = "dependencies", scoped }) {
          const s = store();
          const dependencies = (await s.readJson("index/dependencies.json", { dependencies: {} })).dependencies;
          const dependents = (await s.readJson("index/dependents.json", { dependents: {} })).dependents;
          const sc = await scopeOf(scoped);
          if (sc && !file) {
            const sd = sv.scopeDependencies(dependencies, dependents, sc.files);
            return { scoped: true, label: sc.label, ...sd, summary: sd.files.map((f) => ({ file: f, dependencies: dependencies[f] ? dependencies[f].internal.length : 0, dependents: (dependents[f] || []).length })) };
          }
          if (!file) {
            const summary = Object.entries(dependencies).map(([f, d2]) => ({ file: f, dependencies: d2.internal.length, dependents: (dependents[f] || []).length })).filter((x) => x.dependencies || x.dependents).sort((a, b) => b.dependents - a.dependents).slice(0, 200);
            return { summary };
          }
          const d = Math.max(1, Math.min(6, Number(depth) || 2));
          const nodes = traverse({ dependencies, dependents }, file, direction === "dependents" ? "dependents" : "dependencies", d);
          const edges = [];
          for (const n of [{ path: file, depth: 0 }, ...nodes]) {
            const next = direction === "dependents" ? (dependents[n.path] || []).map((x) => x.path) : dependencies[n.path] ? dependencies[n.path].internal.map((x) => x.path) : [];
            for (const t of next) if (t === file || nodes.some((m) => m.path === t)) edges.push(direction === "dependents" ? { from: t, to: n.path } : { from: n.path, to: t });
          }
          return { root: file, direction, depth: d, nodes: [{ path: file, depth: 0 }, ...nodes], edges, external: dependencies[file] ? dependencies[file].external : [] };
        },
        async getArchitecture({ scoped } = {}) {
          const s = store();
          const sc = await scopeOf(scoped);
          const arch = await s.readJson("architecture/architecture.json", null);
          if (!sc) return { architecture: arch, knowledge: await s.readJson("architecture/knowledge.json", null), conflicts: (await s.readJson("index/conflicts.json", { conflicts: [] })).conflicts };
          const imports = (await s.readJson("index/dependencies.json", { dependencies: {} })).dependencies;
          const files = (await s.readJson("index/files.json", { files: [] })).files.filter((f) => sc.files.has(f.path));
          const a = sv.filterArchitecture(arch, sc.files);
          for (const f of files) a.languages[f.language] = (a.languages[f.language] || 0) + 1;
          a.packages = [...new Set([...sc.files].flatMap((f) => imports[f] ? imports[f].external : []))].sort();
          return { architecture: a, knowledge: null, conflicts: [] };
        },
        // Generated documents of the selected files (and of a selected feature/workflow), instead of the whole-project architecture document.
        async getScopedDocuments() {
          const sc = await sv.selectionScope(store(), selection.get(), pm2().config.get("aiProjectFolder"));
          if (!sc) return [];
          const sel = selection.get();
          const keys = [...[...sc.files].map((f) => `files/${f}`), ...(sel.features || []).map((f) => `features/${f}`), ...(sel.workflows || []).map((w) => `workflows/${w}`)];
          const out = [];
          for (const k of keys) {
            const md = await pm2().documentation.read(k);
            if (md !== null) out.push({ key: k, markdown: md });
          }
          return out;
        },
        async getDocuments() {
          return pm2().documentation.list();
        },
        async getDocument({ key }) {
          const md = await pm2().documentation.read(String(key));
          if (md === null) throw new Error(`No documentation for ${key} yet. Run "Generate Documentation".`);
          return { key, markdown: md, versions: await pm2().documentation.versions(String(key)) };
        },
        async generateDocumentation({ force } = {}) {
          const r = await pm2().documentation.updateAll({ force: !!force });
          return { wrote: r.wrote.length };
        },
        async getAnalyses() {
          return (await pm2().history.list()).reverse();
        },
        async getAnalysis({ id }) {
          const r = await pm2().history.get(String(id));
          if (!r) throw new Error(`Unknown analysis ${id}`);
          return r;
        },
        async getRunner() {
          return pm2().bridge.runner.list();
        },
        async getChanges() {
          return pm2().changes.list();
        },
        async getChange({ id }) {
          const r = await pm2().changes.get(String(id));
          if (!r) throw new Error(`Unknown proposal ${id}`);
          return r;
        },
        async getComparisons() {
          const names = (await store().listDir("comparisons")).filter((n) => n.endsWith(".json")).sort().reverse();
          const out = [];
          for (const n of names) out.push(await store().readJson(`comparisons/${n}`));
          return out;
        },
        async getSpec() {
          const spec = await store().readJson("exports/project-spec.json", null);
          if (!spec) return { exists: false };
          const text = await store().readText("exports/project-spec.txt", "");
          const { renderSpec } = require_specRenderer();
          return { exists: true, generatedAt: spec.generatedAt, coverage: spec.coverage, project: spec.project, text, sections: renderSpec(spec).sections, path: `${pm2().config.get("aiProjectFolder")}/exports/project-spec.txt`, bytes: Buffer.byteLength(text) };
        },
        // Comparisons are only reports: deleting them never touches source, knowledge or specifications.
        async deleteComparison({ id }) {
          if (!/^comparison-\d{3,}$/.test(String(id))) throw new Error("Invalid comparison id.");
          await store().remove(`comparisons/${id}.json`);
          await store().remove(`comparisons/${id}.md`);
          return { deleted: 1 };
        },
        async clearComparisons() {
          const names = (await store().listDir("comparisons")).filter((n) => /^comparison-\d{3,}\.(json|md)$/.test(n));
          for (const n of names) await store().remove(`comparisons/${n}`);
          return { deleted: names.filter((n) => n.endsWith(".json")).length };
        },
        // A blueprint is only a plan. Deleting it never touches source or the specification; earlier versions are kept unless asked.
        async deleteBlueprint({ history } = {}) {
          await store().remove("generation/project-blueprint.json");
          let versions = 0;
          for (const n of (await store().listDir("snapshots")).filter((x) => /^blueprint-.*\.json$/.test(x))) {
            if (history) {
              await store().remove(`snapshots/${n}`);
            } else versions++;
          }
          return { deleted: true, previousVersionsKept: history ? 0 : versions };
        },
        async getBlueprintVersions() {
          return (await store().listDir("snapshots")).filter((x) => /^blueprint-.*\.json$/.test(x)).length;
        },
        async getBlueprint() {
          return store().readJson("generation/project-blueprint.json", null);
        },
        async getCommands() {
          const scan = await pm2().ensureScan();
          return detectCommands(pm2().root, scan.packages.commands.scripts);
        },
        getSelection() {
          return { selection: selection.get(), mode: selection.mode(), summary: selection.summary() };
        },
        setSelection({ selection: sel }) {
          selection.set(sel || {});
          return methods.getSelection();
        },
        addSelection({ kind, items }) {
          selection.add(kind, items);
          return methods.getSelection();
        },
        removeSelection({ kind, item }) {
          selection.remove(kind, item);
          return methods.getSelection();
        },
        clearSelection() {
          selection.clear();
          return methods.getSelection();
        },
        async initialize({ name } = {}) {
          const r = await pm2().initialize(name);
          return { created: r.created, projectId: r.project.projectId };
        },
        async scan() {
          const r = await pm2().scan();
          return { files: r.scan.totals.files, changed: r.saved.changed.length, outdated: r.saved.outdated.length, impact: r.saved.impact };
        },
        async prepareAnalysis({ purpose } = {}) {
          const sel = selection.get();
          const built = await pm2().prepareAnalysis({ mode: selection.mode(), selection: sel, purpose });
          return { mode: selection.mode(), stats: built.stats, batches: built.batches.map((b) => ({ batchId: b.batchId, files: b.context.files.map((f) => f.path), tokens: b.estimatedTokens })) };
        },
        async startAnalysis({ purpose, intent } = {}) {
          return actions.startAnalysis({ purpose, intent });
        },
        async runnerControl({ action, analysisId, batchId }) {
          const r = pm2().bridge.runner;
          if (!["pause", "resume", "cancel", "retry", "skip"].includes(action)) throw new Error(`Unknown action ${action}`);
          r[action](analysisId, batchId);
          return r.list();
        },
        async resumeAnalysis({ analysisId }) {
          return pm2().resumeAnalysis(String(analysisId));
        },
        async pairChrome() {
          return actions.pairChrome();
        },
        async connectChrome() {
          return actions.connectChrome();
        },
        async disconnectChrome({ revoke } = {}) {
          await pm2().bridge.disconnect({ revoke: !!revoke });
          return pm2().bridge.getStatus();
        },
        async getChromeStatus() {
          return pm2().bridge.getStatus();
        },
        async listPairings() {
          return pm2().bridge.security.listConnections();
        },
        async updateSetting({ key, value }) {
          await pm2().config.set(key, value);
          return pm2().config.all();
        },
        async getSettingsSchema() {
          return Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { default: v, type: Array.isArray(v) ? "array" : typeof v }]));
        },
        async openFile({ path, line }) {
          resolveInside(pm2().root, String(path));
          return actions.openFile(String(path), Number(line) || 1);
        },
        async exec({ command, args = [] }) {
          if (!COMMAND_WHITELIST.test(command)) throw new Error("Command not allowed.");
          return actions.exec(command, ...args);
        }
      };
      async function call(method, params) {
        const fn = methods[method];
        if (!fn) throw new Error(`Unknown method ${String(method).slice(0, 40)}`);
        try {
          return await fn(params || {});
        } catch (err) {
          const e = new Error(toUserMessage2(err));
          e.code = err.code;
          throw e;
        }
      }
      return { call, methods };
    }
    module2.exports = { createRpc: createRpc2 };
  }
});

// src/ui/webviewProvider.js
var require_webviewProvider = __commonJS({
  "src/ui/webviewProvider.js"(exports2, module2) {
    var crypto = require("crypto");
    function nonce() {
      return crypto.randomBytes(16).toString("base64");
    }
    var WebviewHost2 = class {
      constructor({ vscode: vscode2, extensionUri, rpc, getPm }) {
        this.vscode = vscode2;
        this.extensionUri = extensionUri;
        this.rpc = rpc;
        this.getPm = getPm;
        this.views = /* @__PURE__ */ new Set();
        this.panel = null;
        this.timer = null;
        this.initialPage = null;
      }
      html(webview, compact) {
        const v = this.vscode;
        const n = nonce();
        const script = webview.asWebviewUri(v.Uri.joinPath(this.extensionUri, "dist", "webview.js"));
        const css = webview.asWebviewUri(v.Uri.joinPath(this.extensionUri, "media", "styles.css"));
        const appCss = webview.asWebviewUri(v.Uri.joinPath(this.extensionUri, "dist", "webview.css"));
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="${css}" rel="stylesheet"><link href="${appCss}" rel="stylesheet"><title>AI Project Intelligence</title></head>
<body data-compact="${compact ? "true" : "false"}"><div id="root"></div><script nonce="${n}" src="${script}"></script></body></html>`;
      }
      attach(webview, compact) {
        const v = this.vscode;
        webview.options = { enableScripts: true, localResourceRoots: [v.Uri.joinPath(this.extensionUri, "dist"), v.Uri.joinPath(this.extensionUri, "media")] };
        webview.html = this.html(webview, compact);
        const sub = webview.onDidReceiveMessage(async (msg) => {
          if (!msg || typeof msg !== "object") return;
          if (msg.type === "ready") {
            if (this.initialPage) webview.postMessage({ type: "event", name: "navigate", data: { page: this.initialPage } });
            return;
          }
          if (msg.type !== "request" || typeof msg.id !== "number") return;
          try {
            webview.postMessage({ type: "response", id: msg.id, result: await this.rpc.call(msg.method, msg.params) });
          } catch (err) {
            webview.postMessage({ type: "response", id: msg.id, error: { message: err.message, code: err.code } });
          }
        });
        const entry = { webview, sub };
        this.views.add(entry);
        return entry;
      }
      resolveWebviewView(view) {
        const entry = this.attach(view.webview, true);
        view.onDidDispose(() => {
          entry.sub.dispose();
          this.views.delete(entry);
        });
      }
      openPanel(page) {
        const v = this.vscode;
        this.initialPage = page || null;
        if (this.panel) {
          this.panel.reveal();
          if (page) this.broadcast("navigate", { page });
          return;
        }
        this.panel = v.window.createWebviewPanel("aiProject.dashboard", "AI Project Intelligence", v.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
        const entry = this.attach(this.panel.webview, false);
        this.panel.onDidDispose(() => {
          entry.sub.dispose();
          this.views.delete(entry);
          this.panel = null;
        });
      }
      broadcast(name, data) {
        for (const { webview } of this.views) webview.postMessage({ type: "event", name, data });
      }
      // Coalesces bursts of events into one refresh.
      notifyChanged() {
        if (this.timer) return;
        this.timer = setTimeout(() => {
          this.timer = null;
          this.broadcast("state-changed", {});
        }, 150);
      }
    };
    module2.exports = { WebviewHost: WebviewHost2 };
  }
});

// src/extension.js
var vscode = require("vscode");
var { ConfigManager } = require_configManager();
var { ProjectManager } = require_projectManager();
var { SelectionState } = require_selectionState();
var { collect } = require_commands();
var { runAnalysis } = require_common();
var { createRpc } = require_rpc();
var { WebviewHost } = require_webviewProvider();
var { toUserMessage } = require_errors();
var logger = require_logger();
var pm = null;
async function activate(context) {
  const out = vscode.window.createOutputChannel("AI Project Intelligence");
  logger.setSink((line) => out.appendLine(line));
  context.subscriptions.push(out);
  const config = new ConfigManager(vscode);
  const selection = new SelectionState(context.workspaceState.get("aiProject.selection"));
  selection.on("changed", () => {
    context.workspaceState.update("aiProject.selection", selection.get());
    host.notifyChanged();
  });
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  const host = new WebviewHost({ vscode, extensionUri: context.extensionUri, rpc: null, getPm: () => pm });
  const ctx = { vscode, context, config, out, selection, host, pm: () => pm, refresh: () => host.notifyChanged() };
  const actions = {
    startAnalysis: ({ purpose, intent } = {}) => runAnalysis(ctx, { mode: selection.mode(), selection: selection.get(), purpose, intent }),
    pairChrome: () => vscode.commands.executeCommand("aiProject.pairChrome"),
    connectChrome: () => vscode.commands.executeCommand("aiProject.connectChrome"),
    openFile: async (rel, line) => {
      const uri = vscode.Uri.joinPath(vscode.Uri.file(pm.root), rel);
      const doc = await vscode.workspace.openTextDocument(uri);
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos) });
    },
    exec: (command, ...args) => vscode.commands.executeCommand(command, ...args)
  };
  const rpc = createRpc({ getPm: () => pm, selection, actions });
  host.rpc = rpc;
  if (folder) {
    try {
      pm = new ProjectManager({
        root: folder.uri.fsPath,
        config,
        secretStore: context.secrets,
        confirmPairing: async (info) => {
          const pick = await vscode.window.showWarningMessage(`Allow "${info.clientName}" to connect to project "${info.projectName}"?`, { modal: true, detail: `Chrome extension id: ${info.extensionId || "unknown"}
Only approve pairing you started with "AI Project: Pair Chrome".` }, "Allow");
          return pick === "Allow";
        }
      });
      await pm.load();
    } catch (err) {
      logger.error("AI-PROJECT", "failed to load project", { error: err.message });
      vscode.window.showErrorMessage(`AI Project: ${toUserMessage(err)}`);
    }
  }
  const startItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 51);
  startItem.text = "$(rocket) AI Project";
  startItem.tooltip = "AI Project Intelligence: guided steps (set up, scan, choose files, connect Chrome, analyze)";
  startItem.command = "aiProject.start";
  context.subscriptions.push(startItem);
  if (folder) startItem.show();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = "aiProject.showChromeStatus";
  context.subscriptions.push(status);
  const renderStatus = () => {
    if (!pm || !pm.isInitialized()) {
      status.hide();
      return;
    }
    const s = pm.bridge.getStatus();
    const icon = { CONNECTED: "$(plug)", PAIRING: "$(sync~spin)", LISTENING: "$(broadcast)", STOPPED: "$(circle-slash)" }[s.state] || "$(circle-slash)";
    status.text = `${icon} AI Project: ${s.state === "CONNECTED" ? `Chrome${s.provider ? ` \xB7 ${s.provider}` : ""}${s.activeAnalysis ? ` \xB7 batch ${s.activeAnalysis.batchNumber}/${s.activeAnalysis.totalBatches}` : ""}` : s.state.toLowerCase()}`;
    status.tooltip = "AI Project Intelligence \u2014 Chrome bridge status";
    status.show();
  };
  if (pm) for (const ev of ["changed", "chrome", "analysis"]) pm.on(ev, () => {
    host.notifyChanged();
    renderStatus();
  });
  if (pm) pm.on("changed", (what) => {
    if (what === "changes") vscode.window.showInformationMessage("AI Project: Chrome sent a change proposal. Review it before anything is applied.", "Review").then((p) => p && vscode.commands.executeCommand("aiProject.reviewChanges"));
  });
  renderStatus();
  context.subscriptions.push(vscode.window.registerWebviewViewProvider("aiProject.sidebar", host, { webviewOptions: { retainContextWhenHidden: true } }));
  const handlers = collect(ctx);
  for (const [id, fn] of Object.entries(handlers)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        logger.error("AI-PROJECT", `command ${id} failed`, { error: err.message, code: err.code });
        vscode.window.showErrorMessage(`AI Project: ${toUserMessage(err)}`);
      }
    }));
  }
  if (pm && pm.isInitialized()) {
    pm.bridge.security.listConnections().then((c) => {
      if (c.length) return pm.bridge.start().then(renderStatus);
      return null;
    }).catch((e) => logger.warn("BRIDGE", "auto-start failed", { error: e.message }));
    if (config.get("autoScan")) pm.scan().catch((e) => logger.warn("ANALYSIS", "auto scan failed", { error: e.message }));
  }
  if (folder) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "**/*"));
    let t = null;
    const onFs = (uri) => {
      const p = uri.fsPath;
      if (p.includes("/node_modules/") || p.includes("/.git/") || p.includes(`/${config.get("aiProjectFolder")}/`)) return;
      clearTimeout(t);
      t = setTimeout(() => {
        if (pm && pm.isInitialized() && config.get("autoScan")) pm.scan().catch(() => {
        });
        else host.broadcast("files-changed", {});
      }, 3e3);
    };
    watcher.onDidChange(onFs);
    watcher.onDidCreate(onFs);
    watcher.onDidDelete(onFs);
    context.subscriptions.push(watcher);
  }
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("aiProject")) host.notifyChanged();
  }));
  logger.info("AI-PROJECT", "activated", { workspace: !!folder, initialized: !!(pm && pm.isInitialized()) });
  return { pm: () => pm };
}
async function deactivate() {
  if (pm) await pm.bridge.stop();
}
module.exports = { activate, deactivate };
//# sourceMappingURL=extension.js.map
