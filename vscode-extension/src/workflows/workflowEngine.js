// Discovers and traces workflows for a project analysis result.
const { WorkflowGraph } = require('./workflowGraph');
const { WorkflowTracer, slug } = require('./workflowTracer');
const { buildDataFlows } = require('../database/dataFlowAnalyzer');

function uniqueId(base, used) {
  let id = base || 'workflow';
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function summarize(w) {
  const entities = (kind) => [...new Set(w.steps.filter((s) => s.kind === kind).map((s) => s.entity))];
  return {
    files: [...new Set(w.steps.filter((s) => s.file).map((s) => s.file))],
    apiCalls: w.steps.filter((s) => s.kind === 'api-call').map((s) => `${s.method} ${s.endpoint}`),
    databaseReads: entities('db-read'),
    databaseWrites: entities('db-write'),
    externalServices: [...new Set(w.steps.filter((s) => s.kind === 'external-service').map((s) => s.service))],
  };
}

function discoverWorkflows({ fileAnalyses, apis, apiLinks, queries, maxDepth = 8 }) {
  const graph = new WorkflowGraph(fileAnalyses);
  const tracer = new WorkflowTracer({ graph, project: { fileAnalyses, queries, apiLinks, apis }, maxDepth });
  const used = new Set();
  const workflows = [];
  const tracedRoutes = new Set();

  // 1) Full-stack workflows: client call -> matched route. One workflow per (client call site, route).
  for (const link of apiLinks) {
    const traced = tracer.traceApiLink(link);
    const key = `${link.route.file}:${link.route.line}`;
    tracedRoutes.add(key);
    const id = uniqueId(slug(`${traced.trigger.type === 'UI_EVENT' ? (traced.trigger.component || '') + ' ' : ''}${link.method} ${link.path}`), used);
    workflows.push({ id, name: `${link.method} ${link.path}`, purpose: null, trigger: traced.trigger, api: traced.api, steps: traced.steps, status: traced.status, unknowns: ['Purpose and business intent are not derivable from static analysis alone.'] });
  }

  // 2) Backend-only workflows for routes with no client caller found.
  for (const r of apis) {
    if (tracedRoutes.has(`${r.file}:${r.line}`)) continue;
    const traced = tracer.traceRoute(r);
    const id = uniqueId(slug(`${r.method} ${r.endpoint}`), used);
    workflows.push({ id, name: `${r.method} ${r.endpoint}`, purpose: null, trigger: traced.trigger, api: traced.api, steps: traced.steps, status: traced.status, unknowns: ['No frontend caller was found for this endpoint.'] });
  }

  // TODO(phase-8+): workflows started by jobs, queues, webhooks and event listeners.
  for (const w of workflows) {
    w.summary = summarize(w);
    w.analyzedFrom = 'STATIC_ANALYSIS';
  }
  return { workflows, dataFlows: buildDataFlows(workflows), graph };
}

module.exports = { discoverWorkflows };
