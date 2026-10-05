const { traverse } = require('../analyzer/reverseDependencyAnalyzer');

// Priority order (spec §30): selection > direct deps > direct dependents > ...
// Returns [{path, reason, depth, priority}] excluding the primary set.
function dependencyContext(primary, analysis, { depth = 2, includeDependents = true } = {}) {
  const graph = { dependencies: analysis.dependencies, dependents: analysis.dependents };
  const out = new Map();
  const primarySet = new Set(primary);
  for (const p of primary) {
    for (const d of traverse(graph, p, 'dependencies', depth)) {
      if (primarySet.has(d.path)) continue;
      const cur = out.get(d.path);
      if (!cur || d.depth < cur.depth) out.set(d.path, { path: d.path, reason: 'dependency', depth: d.depth, priority: 1 + d.depth });
    }
    if (includeDependents) for (const d of traverse(graph, p, 'dependents', 1)) {
      if (primarySet.has(d.path) || out.has(d.path)) continue;
      out.set(d.path, { path: d.path, reason: 'dependent', depth: 1, priority: 2 });
    }
  }
  return [...out.values()].sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
}

module.exports = { dependencyContext };
