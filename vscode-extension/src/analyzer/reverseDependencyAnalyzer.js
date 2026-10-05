// Reverse dependency (dependents) map + recursive traversal with configurable depth.
function buildDependents(dependencies) {
  const dependents = {};
  for (const p of Object.keys(dependencies)) dependents[p] ||= [];
  for (const [file, d] of Object.entries(dependencies)) {
    for (const i of d.internal) (dependents[i.path] ||= []).push({ path: file, names: i.names });
  }
  for (const k of Object.keys(dependents)) dependents[k].sort((a, b) => a.path.localeCompare(b.path));
  return dependents;
}

// direction: 'dependencies' | 'dependents'. Returns [{path, depth}], excluding the start file, cycle-safe.
function traverse(graph, start, direction, maxDepth) {
  const getNext = (p) => (direction === 'dependents' ? (graph.dependents[p] || []) : ((graph.dependencies[p] || {}).internal || [])).map((x) => x.path);
  const seen = new Map([[start, 0]]);
  let frontier = [start];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next = [];
    for (const f of frontier) for (const n of getNext(f)) if (!seen.has(n)) { seen.set(n, depth); next.push(n); }
    frontier = next;
  }
  seen.delete(start);
  return [...seen.entries()].map(([path, depth]) => ({ path, depth })).sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
}

module.exports = { buildDependents, traverse };
