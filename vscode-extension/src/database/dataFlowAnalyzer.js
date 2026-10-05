// Project-level database resolution: entity names, ORM call resolution, file/API -> entity mappings.
function entityKey(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

function singular(s) { return s.replace(/ies$/, 'y').replace(/s$/, ''); }

function buildEntityIndex(entities) {
  const byKey = new Map();
  for (const e of entities) {
    for (const k of [entityKey(e.name), entityKey(e.table), singular(entityKey(e.name)), singular(entityKey(e.table))]) {
      if (k) if (!byKey.has(k)) byKey.set(k, e);
    }
  }
  return byKey;
}

// Exact (case-sensitive) name/table match wins; the normalized index is only a fallback.
function matchEntity(index, name, entities) {
  if (entities) {
    const exact = entities.find((e) => e.name === name || e.table === name);
    if (exact) return exact;
  }
  const k = entityKey(name);
  return index.get(k) || index.get(singular(k)) || null;
}

// Turns ORM call candidates into queries when the receiver is a known entity. Anything else stays UNKNOWN and is dropped.
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
      queries.push({ entity: e.name, entityKnown: true, operation: c.operation, kind: c.kind, line: c.line, orm: c.orm || (c.prisma ? 'prisma' : 'orm'), file: fa.path, status: 'VERIFIED' });
    }
  }
  return queries;
}

// File -> entities read/written (direct evidence only).
function mapFilesToEntities(queries) {
  const map = {};
  for (const q of queries) {
    if (!q.entity) continue;
    const m = (map[q.file] ||= { reads: new Set(), writes: new Set() });
    (q.kind === 'write' ? m.writes : m.reads).add(q.entity);
  }
  return Object.fromEntries(Object.entries(map).map(([f, v]) => [f, { reads: [...v.reads].sort(), writes: [...v.writes].sort() }]));
}

// Given workflows (already traced), produce API -> entity data flows. Only relationships present in traces.
function buildDataFlows(workflows) {
  return workflows.map((w) => ({
    workflowId: w.id,
    entry: w.trigger,
    api: w.api || null,
    reads: [...new Set(w.steps.filter((s) => s.kind === 'db-read').map((s) => s.entity))],
    writes: [...new Set(w.steps.filter((s) => s.kind === 'db-write').map((s) => s.entity))],
    status: w.status,
  })).filter((f) => f.reads.length || f.writes.length);
}

module.exports = { buildEntityIndex, matchEntity, resolveQueries, mapFilesToEntities, buildDataFlows };
