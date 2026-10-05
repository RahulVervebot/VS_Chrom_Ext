// Workflows that touch the included files. Static traces only; AI knowledge is attached in existing knowledge.
function workflowContext(filePaths, analysis) {
  const set = new Set(filePaths);
  return analysis.workflows
    .filter((w) => w.summary.files.some((f) => set.has(f)))
    .map((w) => ({ id: w.id, name: w.name, status: w.status, trigger: w.trigger, api: w.api, steps: w.steps.map((s) => ({ kind: s.kind, file: s.file, symbol: s.symbol, line: s.line, entity: s.entity, status: s.status })), summary: w.summary }));
}

module.exports = { workflowContext };
