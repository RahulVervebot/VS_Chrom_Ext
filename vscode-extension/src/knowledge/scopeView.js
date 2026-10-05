// "Scope" = the part of the project the user selected (files, folders, a feature, a workflow, entities, APIs).
// These helpers narrow the stored project knowledge to that part so the Architecture, Database, Features, Workflows and
// Dependencies views (and comparisons) show only what belongs to it. Nothing here reads source; it only filters the index.
const { resolveScope } = require('../comparison/scopedComparator');

const inSet = (set, p) => !!p && set.has(p);

// Returns null when the whole project is meant (nothing selected, or "entire project" selected).
async function selectionScope(store, sel, folderName = '.ai-project') {
  if (!sel || sel.project) return null;
  const base = { files: sel.files || [], folders: sel.folders || [], features: sel.features || [], workflows: sel.workflows || [] };
  const resolved = await resolveScope(store, base, folderName);
  const files = new Set(resolved.files);
  const labels = resolved.label === 'selection' ? [] : [resolved.label];
  if ((sel.entities || []).length) {
    const ents = (await store.readJson('database/entities.json', { entities: [] })).entities;
    for (const e of ents) if (sel.entities.includes(e.name) && e.file) files.add(e.file);
    for (const q of (await store.readJson('database/queries.json', { queries: [] })).queries) if (sel.entities.includes(q.entity) && q.file) files.add(q.file);
    labels.push(`entit${sel.entities.length === 1 ? 'y' : 'ies'} ${sel.entities.join(', ')}`);
  }
  if ((sel.apis || []).length) {
    for (const a of (await store.readJson('index/apis.json', { apis: [] })).apis) if (sel.apis.includes(`${a.method} ${a.endpoint}`) && a.file) files.add(a.file);
    labels.push(`${sel.apis.length} API(s)`);
  }
  if (!files.size) return null;
  return { files, label: labels.join(' + ') || 'selection' };
}

function filterArchitecture(arch, set) {
  if (!arch) return arch;
  const layers = {};
  for (const [role, list] of Object.entries(arch.layers || {})) { const l = list.filter((p) => set.has(p)); if (l.length) layers[role] = l; }
  const languages = {};
  return { ...arch, layers, languages, technologies: [], config: (arch.config || []).filter((c) => set.has(c.path)), entryPoints: (arch.entryPoints || []).filter((e) => set.has(e.path)), scoped: true };
}

function filterApis(a, set) {
  const externalServices = {};
  for (const [name, ev] of Object.entries(a.externalServices || {})) { const e = ev.filter((x) => set.has(x.file)); if (e.length) externalServices[name] = e; }
  return { apis: a.apis.filter((x) => set.has(x.file)), clientCalls: (a.clientCalls || []).filter((c) => set.has(c.from && c.from.file) || set.has(c.route && c.route.file)), auth: (a.auth || []).filter((x) => set.has(x.file)), externalServices };
}

function filterDatabase(db, set) {
  const queries = db.queries.filter((q) => set.has(q.file));
  const names = new Set(queries.map((q) => q.entity));
  const entities = db.entities.filter((e) => names.has(e.name) || set.has(e.file));
  const keep = new Set(entities.map((e) => e.name.toLowerCase()));
  return { ...db, entities, queries, relationships: db.relationships.filter((r) => keep.has(String(r.from).toLowerCase()) && keep.has(String(r.to).toLowerCase())), dataFlows: (db.dataFlows || []).filter((f) => set.has(f.entry && f.entry.file)), scoped: true };
}

async function filterFeatures(store, list, set) {
  const out = [];
  for (const f of list) {
    const d = await store.readJson(`features/${f.id}.json`, null);
    const own = d ? [...(d.files || []), ...(d.tests || [])] : [];
    const overlap = own.filter((p) => set.has(p)).length;
    if (overlap) out.push({ ...f, filesInScope: overlap, files: (d.files || []).length });
  }
  return out;
}

async function filterWorkflows(store, list, set) {
  const out = [];
  for (const w of list) {
    const d = await store.readJson(`workflows/${w.id}.json`, null);
    if (d && (d.steps || []).some((s) => set.has(s.file))) out.push({ ...w, stepsInScope: d.steps.filter((s) => set.has(s.file)).length, steps: d.steps.length });
  }
  return out;
}

// Dependencies of the scope: edges between scope files, plus the boundary (what the scope needs from / is used by the rest).
function scopeDependencies(dependencies, dependents, set) {
  const internal = []; const dependsOnOutside = {}; const usedByOutside = {}; const packages = new Set();
  for (const f of set) {
    const d = dependencies[f] || { internal: [], external: [] };
    for (const i of d.internal) { if (set.has(i.path)) internal.push({ from: f, to: i.path, names: i.names || [] }); else (dependsOnOutside[i.path] = dependsOnOutside[i.path] || []).push(f); }
    for (const x of d.external) packages.add(x);
    for (const u of dependents[f] || []) if (!set.has(u.path)) (usedByOutside[u.path] = usedByOutside[u.path] || []).push(f);
  }
  const rows = (m) => Object.entries(m).map(([path, via]) => ({ path, via: [...new Set(via)].sort() })).sort((a, b) => a.path.localeCompare(b.path));
  return { files: [...set].sort(), internal, dependsOnOutside: rows(dependsOnOutside), usedByOutside: rows(usedByOutside), packages: [...packages].sort() };
}

module.exports = { selectionScope, filterArchitecture, filterApis, filterDatabase, filterFeatures, filterWorkflows, scopeDependencies, inSet };
