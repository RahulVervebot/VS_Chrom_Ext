const { setDiff } = require('./projectComparator');

function compareWorkflows(summaries, ids) {
  const picked = summaries.map((s, i) => ({ project: s.project, workflow: s.workflows.find((w) => w.id === (ids[i] || ids[0])) || null }));
  const diffs = [];
  for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) {
    const a = picked[i].workflow; const b = picked[j].workflow;
    if (a && b) diffs.push({ a: picked[i].project.name, b: picked[j].project.name, stepKinds: setDiff([...new Set(a.steps.map((s) => s.kind))], [...new Set(b.steps.map((s) => s.kind))]), reads: setDiff(a.reads, b.reads), writes: setDiff(a.writes, b.writes), externalServices: setDiff(a.externalServices, b.externalServices) });
  }
  return { workflows: picked, diffs, unknowns: picked.filter((p) => !p.workflow).map((p) => `Workflow not found in ${p.project.name}.`) };
}

module.exports = { compareWorkflows };
