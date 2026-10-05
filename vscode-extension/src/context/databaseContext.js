// Database entities relevant to the included files (defined there or queried there), with relationships and queries.
function databaseContext(filePaths, analysis) {
  const set = new Set(filePaths);
  const db = analysis.database;
  const names = new Set();
  for (const e of db.entities) if (e.file && set.has(e.file)) names.add(e.name);
  for (const q of db.queries) if (set.has(q.file) && q.entity) names.add(q.entity);
  const entities = db.entities.filter((e) => names.has(e.name));
  const lower = new Set([...names].map((n) => n.toLowerCase()));
  return {
    technologies: db.technologies.map((t) => t.name),
    entities: entities.map((e) => ({ name: e.name, kind: e.kind, source: e.source, file: e.file, fields: e.fields })),
    relationships: db.relationships.filter((r) => lower.has(String(r.from).toLowerCase()) || lower.has(String(r.to).toLowerCase())).map((r) => ({ from: r.from, to: r.to, type: r.type, via: r.via, status: r.status, file: r.file })),
    queries: db.queries.filter((q) => set.has(q.file)).map((q) => ({ entity: q.entity, operation: q.operation, kind: q.kind, file: q.file, line: q.line, orm: q.orm })),
  };
}

module.exports = { databaseContext };
