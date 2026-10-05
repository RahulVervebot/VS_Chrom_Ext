// Traces a workflow from source evidence. Never invents steps: each step points to file/symbol/line.
const { classifyRole } = require('../analyzer/architectureAnalyzer');
const { resolveImport } = require('../analyzer/dependencyAnalyzer');

// A step weakens the workflow only when its call edge was not resolved through source evidence.
// Steps carrying a `basis` are heuristic annotations (state change, response) and do not affect status.
const unresolved = (s) => (s.status === 'INFERRED' || s.status === 'UNKNOWN') && !s.basis;

function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

class WorkflowTracer {
  constructor({ graph, project, maxDepth = 8 }) {
    this.g = graph;
    this.project = project; // { fileAnalyses, queries, apiLinks, apis }
    this.maxDepth = maxDepth;
    this.queriesByFile = new Map();
    for (const q of project.queries) (this.queriesByFile.get(q.file) || this.queriesByFile.set(q.file, []).get(q.file)).push(q);
  }

  stepKindFor(file) {
    const role = classifyRole(file);
    return ({ service: 'service', controller: 'controller', repository: 'repository', model: 'model', middleware: 'middleware', component: 'frontend', page: 'frontend', hook: 'frontend', state: 'state', 'api-client': 'frontend-service' })[role] || 'logic';
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
      if (q.kind === 'transaction') { steps.push({ kind: 'transaction', file: n.file, symbol: n.name, line: q.line, status: 'VERIFIED' }); continue; }
      steps.push({ kind: q.kind === 'write' ? 'db-write' : 'db-read', entity: q.entity, operation: q.operation, orm: q.orm, file: n.file, symbol: n.name, line: q.line, status: q.entityKnown ? 'VERIFIED' : 'INFERRED' });
    }
    const fa = this.g.files.get(n.file);
    for (const s of fa.externalServices.services) {
      const inRange = (s.lines || [s.line]).filter((l) => l >= n.symbol.line && l <= n.symbol.endLine);
      if (inRange.length && !/Analytics/.test(s.name)) steps.push({ kind: 'external-service', service: s.name, file: n.file, symbol: n.name, line: inRange[0], status: 'VERIFIED' });
    }
    for (const a of fa.auth) {
      if (a.type === 'authorization' && a.line >= n.symbol.line && a.line <= n.symbol.endLine) steps.push({ kind: 'security-check', check: a.kind, file: n.file, symbol: n.name, line: a.line, status: 'VERIFIED' });
    }
    return steps;
  }

  // BFS downward from a handler node. Returns ordered steps (dedup, depth-bounded).
  traceDown(startId, startStatus = 'VERIFIED') {
    const steps = [];
    const seen = new Set([startId]);
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
          next.push({ id: e.to, status: e.status === 'INFERRED' || cur.status === 'INFERRED' ? 'INFERRED' : 'VERIFIED', depth: cur.depth + 1 });
        }
      }
      queue = next;
    }
    return steps;
  }

  // Shortest caller chain from `fromId` up to a node that has a UI binding or no callers.
  traceUp(startId) {
    const chain = [startId];
    const seen = new Set([startId]);
    let cur = startId;
    for (let i = 0; i < this.maxDepth; i++) {
      const bound = this.uiBindingFor(cur);
      if (bound) return { chain, trigger: bound };
      const callers = this.g.callers(cur).filter((c) => !seen.has(c.from));
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
        const parts = h.name.split('.');
        if (parts[parts.length - 1] !== n.name) continue;
        if (fa.path === n.file) return { event: h.event, file: fa.path, line: h.line, inSymbol: h.inSymbol };
        // Binding in another file counts only if that file actually imports the symbol from n.file.
        const imp = this.g.importFor(fa, parts[0]);
        if (imp && resolveImport(fa.path, imp, fa.language, this.g.fileSet) === n.file) return { event: h.event, file: fa.path, line: h.line, inSymbol: h.inSymbol };
      }
    }
    return null;
  }

  // Full-stack workflow for a client->route link.
  traceApiLink(link) {
    const steps = [];
    let status = 'VERIFIED';
    const callerId = this.g.enclosing(link.from.file, link.from.line);
    let trigger = { type: 'API_CALL', file: link.from.file, line: link.from.line };
    if (callerId) {
      const up = this.traceUp(callerId);
      if (up.trigger) {
        trigger = { type: 'UI_EVENT', event: up.trigger.event, file: up.trigger.file, line: up.trigger.line, component: up.trigger.inSymbol };
        steps.push({ kind: 'trigger', event: up.trigger.event, file: up.trigger.file, symbol: up.trigger.inSymbol, line: up.trigger.line, status: 'VERIFIED' });
      }
      up.chain.forEach((id, i) => {
        const step = this.symbolStep(id, 'VERIFIED', { phase: 'frontend' });
        steps.push(step);
        if (this.g.nodes.get(id).symbol.flags?.setsState) steps.push({ kind: 'state-change', file: step.file, symbol: step.symbol, line: step.line, status: 'INFERRED', basis: 'state setter/dispatch call in body' });
        if (i === up.chain.length - 1) return;
      });
    }
    steps.push({ kind: 'api-call', method: link.method, endpoint: link.path, client: link.from.client, file: link.from.file, line: link.from.line, status: 'VERIFIED' });
    steps.push({ kind: 'route', method: link.route.method, endpoint: link.route.endpoint, file: link.route.file, line: link.route.line, status: 'VERIFIED' });
    steps.push(...this.traceRouteHandler(link.route, (s) => { if (s === 'INFERRED') status = 'PARTIAL'; }));
    if (steps.some(unresolved)) status = 'PARTIAL';
    return { steps, trigger, status, api: { method: link.method, endpoint: link.path } };
  }

  traceRouteHandler(route, onStatus = () => {}) {
    const full = this.project.apis.find((a) => a.file === route.file && a.line === route.line && a.endpoint === route.endpoint) || route;
    const steps = [];
    for (const mw of full.middleware || []) {
      const r = this.g.resolveHandler(full.file, mw);
      if (r) steps.push(this.symbolStep(r.id, r.status, { kind: 'middleware', depth: 0 }), ...this.evidenceSteps(r.id));
    }
    if (full.inline && full.calls) {
      steps.push({ kind: 'controller', file: full.file, symbol: '(inline handler)', line: full.bodyRange.startLine, endLine: full.bodyRange.endLine, status: 'VERIFIED' });
      const fa = this.g.files.get(full.file);
      for (const c of full.calls) {
        const r = this.g.resolveCall(fa, c.name, { id: null, className: null });
        if (r) steps.push(...this.traceDown(r.id, r.status));
      }
      for (const q of this.queriesByFile.get(full.file) || []) {
        if (q.line >= full.bodyRange.startLine && q.line <= full.bodyRange.endLine && q.entity) steps.push({ kind: q.kind === 'write' ? 'db-write' : 'db-read', entity: q.entity, operation: q.operation, orm: q.orm, file: full.file, symbol: '(inline handler)', line: q.line, status: q.entityKnown ? 'VERIFIED' : 'INFERRED' });
      }
    } else if (full.handler) {
      const r = this.g.resolveHandler(full.file, full.handler);
      if (r) {
        onStatus(r.status);
        steps.push(...this.traceDown(r.id, r.status).map((s, i) => (i === 0 ? { ...s, kind: 'controller' } : s)));
      } else {
        steps.push({ kind: 'controller', file: full.file, symbol: full.handler, line: full.line, status: 'UNKNOWN', note: 'Handler could not be resolved to a source symbol.' });
        onStatus('INFERRED');
      }
    }
    const responds = (s) => s.file && this.g.nodes.get(`${s.file}#${s.symbol}`)?.symbol.flags?.responds;
    const responder = steps.find((s) => s.kind === 'controller' && responds(s)) || steps.find((s) => s.kind !== 'middleware' && responds(s));
    if (responder) steps.push({ kind: 'response', file: responder.file, symbol: responder.symbol, line: responder.line, status: 'INFERRED', basis: 'response call in handler body' });
    return steps;
  }

  // Backend-only workflow (route with no matched client call).
  traceRoute(route) {
    const steps = [{ kind: 'route', method: route.method, endpoint: route.endpoint, file: route.file, line: route.line, status: 'VERIFIED' }];
    let status = 'VERIFIED';
    steps.push(...this.traceRouteHandler(route, (s) => { if (s === 'INFERRED') status = 'PARTIAL'; }));
    if (steps.some(unresolved)) status = 'PARTIAL';
    return { steps, trigger: { type: 'HTTP_REQUEST', method: route.method, endpoint: route.endpoint, file: route.file, line: route.line }, status, api: { method: route.method, endpoint: route.endpoint } };
  }
}

module.exports = { WorkflowTracer, slug };
