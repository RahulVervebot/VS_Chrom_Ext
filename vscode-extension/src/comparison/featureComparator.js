const { setDiff } = require('./projectComparator');

function extractFeature(summary, id) {
  const f = summary.features.find((x) => x.id === id);
  if (!f) return null;
  return { project: summary.project, feature: f, workflows: summary.workflows.filter((w) => (f.apis || []).includes(w.api && `${w.api.method} ${w.api.endpoint}`)), entities: summary.database.entities.filter((e) => f.entities.includes(e.name)) };
}

function compareFeatures(summaries, ids) {
  const parts = summaries.map((s, i) => extractFeature(s, ids[i] || ids[0]));
  const out = { features: parts.map((p, i) => p || { project: summaries[i].project, feature: null }), diffs: [], unknowns: [] };
  parts.forEach((p, i) => { if (!p) out.unknowns.push(`Feature ${ids[i] || ids[0]} was not found in ${summaries[i].project.name}.`); });
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (parts[i] && parts[j]) out.diffs.push({ a: parts[i].project.name, b: parts[j].project.name, apis: setDiff(parts[i].feature.apis, parts[j].feature.apis), entities: setDiff(parts[i].feature.entities, parts[j].feature.entities) });
  return out;
}

module.exports = { compareFeatures, extractFeature };
