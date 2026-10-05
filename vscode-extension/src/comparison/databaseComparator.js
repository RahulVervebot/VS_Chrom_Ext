const { setDiff } = require('./projectComparator');

function compareDatabases(summaries) {
  const diffs = [];
  for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) {
    const a = summaries[i].database; const b = summaries[j].database;
    const shared = a.entities.filter((e) => b.entities.some((x) => x.name.toLowerCase() === e.name.toLowerCase()));
    diffs.push({
      a: summaries[i].project.name, b: summaries[j].project.name,
      technologies: setDiff(a.technologies, b.technologies),
      entities: setDiff(a.entities.map((e) => e.name), b.entities.map((e) => e.name)),
      fieldDifferences: shared.map((e) => { const o = b.entities.find((x) => x.name.toLowerCase() === e.name.toLowerCase()); return { entity: e.name, ...setDiff(e.fields.map((f) => f.name), o.fields.map((f) => f.name)) }; }),
      relationships: setDiff(a.relationships.map((r) => `${r.from}->${r.to}`), b.relationships.map((r) => `${r.from}->${r.to}`)),
    });
  }
  return { diffs };
}

module.exports = { compareDatabases };
