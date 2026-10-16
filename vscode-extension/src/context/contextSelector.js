// Resolves a user selection + analysis mode into a primary set of project files.
const { normalizeRelative } = require('../utils/paths');

const MODES = ['FILE', 'FOLDER', 'FEATURE', 'WORKFLOW', 'DATABASE', 'PROJECT', 'DOCUMENTATION', 'COMPARISON', 'BLUEPRINT', 'MODULES'];

const under = (p, folder) => p === folder || p.startsWith(folder.replace(/\/$/, '') + '/');

// analysis: static analysis result (in memory); files: index file records
// Broad selections (entire project, whole folders) continue where the last run stopped: files that are analyzed and unchanged are skipped
// and the rest come in the order NOT_ANALYZED, OUTDATED, PARTIAL. Explicit picks (files, features, workflows…) are always analyzed as asked.
const RANK = { NOT_ANALYZED: 0, OUTDATED: 1, PARTIAL: 2 };

// The user's reading order: files under `first` entries come first (in that order), files under `last` entries last (in that order),
// everything else in between. Inside a group a sub-project's manifest (__manifest__.py, package.json, go.mod…) comes before its files,
// so the AI reads what an add-on/package is and depends on before its code.
const MANIFEST = /(^|\/)(__manifest__\.py|__openerp__\.py|package\.json|go\.mod|Cargo\.toml|pyproject\.toml|setup\.py|composer\.json|pom\.xml|build\.gradle(\.kts)?|[^/]+\.csproj|Gemfile|mix\.exs|pubspec\.yaml)$/;
function readingOrder({ first = [], last = [] } = {}) {
  const clean = (l) => (Array.isArray(l) ? l : []).map((x) => normalizeRelative(String(x || '').trim()).replace(/\/$/, '')).filter((x) => x && x !== '.');
  const f = clean(first);
  const l = clean(last);
  const active = f.length > 0 || l.length > 0;
  // the longest matching entry wins, so `addons` last + `addons/base` first works as expected
  const best = (p, list) => { let i = -1; let len = -1; list.forEach((x, k) => { if (under(p, x) && x.length > len) { i = k; len = x.length; } }); return { i, len }; };
  const group = (p) => {
    const a = best(p, f);
    const b = best(p, l);
    if (a.i < 0 && b.i < 0) return [f.length, 0];
    return a.len >= b.len ? [a.i, 0] : [f.length + 1 + b.i, 0];
  };
  const compare = (a, b) => group(a)[0] - group(b)[0];
  // path order where a manifest sorts before every other file of its folder (and its sub-folders)
  const key = (p) => (MANIFEST.test(p) ? `${p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : ''}\u0000${p}` : p);
  const byPath = (a, b) => { const x = key(a); const y = key(b); return x < y ? -1 : x > y ? 1 : 0; };
  return { active, compare, byPath, group: (p) => group(p)[0] };
}

// MODULES: one manifest per sub-project (add-on, package, app…) in scope, dependencies before the modules that depend on them.
// The manifest is what the AI reads first; the static facts of each module travel with it (see contextBuilder).
function moduleManifest(mod, known) {
  const own = [...known].filter((p) => p.startsWith(`${mod.path}/`) && !p.slice(mod.path.length + 1).includes('/'));
  return own.find((p) => MANIFEST.test(p)) || own.find((p) => /(^|\/)readme(\.[a-z]+)?$/i.test(p)) || null;
}
function modulesInScope(selection, analysis, mode) {
  const mods = analysis.moduleInsights || [];
  const names = new Set(selection.modules || []);
  const folders = (selection.folders || []).map((f) => normalizeRelative(f).replace(/\/$/, ''));
  if (names.size) return mods.filter((m) => names.has(m.name) || names.has(m.path));
  if (folders.length) return mods.filter((m) => folders.some((f) => under(m.path, f) || under(f, m.path)));
  return mode === 'MODULES' || mode === 'PROJECT' || selection.project ? mods : [];
}
function selectModules({ selection, analysis, files, order }) {
  const known = new Set(files.map((f) => f.path));
  const ord = readingOrder(order);
  const scope = modulesInScope(selection, analysis, 'MODULES');
  const notes = [];
  const byName = new Map(scope.map((m) => [m.name, m]));
  const byPath = new Map(scope.map((m) => [m.path, m]));
  const deps = (m) => [...new Set([...(m.manifestDepends || []).map((n) => byName.get(n)), ...(m.uses || []).map((u) => byPath.get(u.module))].filter((x) => x && x !== m))];
  // depth-first topological order; the starting order is the user's reading order, so ties keep it
  const start = [...scope].sort((a, b) => ord.compare(a.path, b.path) || ord.byPath(a.path, b.path));
  const seen = new Set();
  const out = [];
  const visit = (m, stack = new Set()) => { if (seen.has(m) || stack.has(m)) return; stack.add(m); for (const d of deps(m)) visit(d, stack); seen.add(m); out.push(m); };
  start.forEach((m) => visit(m));
  const paths = [];
  for (const m of out) { const p = moduleManifest(m, known); if (p) paths.push(p); else notes.push(`${m.name}: no manifest or README to send; its static facts are still in the module index`); }
  if (!scope.length) notes.push('no sub-projects (add-ons, packages, apps…) were detected in this selection');
  return { files: paths, notes, skipped: 0, ranked: true };
}

function selectFiles({ mode, selection = {}, analysis, files, reanalyze = false, order }) {
  if (mode === 'MODULES' && selection.pinnedFiles) return { files: [...new Set(selection.pinnedFiles.map(normalizeRelative))].filter((p) => files.some((f) => f.path === p)), notes: [], skipped: 0, ranked: true };
  if (mode === 'MODULES') return selectModules({ selection, analysis, files, order });
  const ord = readingOrder(order);
  const all = files.filter((f) => !f.binary && f.isSource);
  const set = new Set();
  const notes = [];
  const known = new Set(files.map((f) => f.path));

  for (const raw of selection.files || []) {
    const p = normalizeRelative(raw);
    if (known.has(p)) set.add(p); else notes.push(`file not in project index: ${raw}`);
  }
  for (const raw of selection.folders || []) {
    const folder = normalizeRelative(raw).replace(/\/$/, '');
    const hits = all.filter((f) => under(f.path, folder));
    if (!hits.length) notes.push(`no source files under folder: ${raw}`);
    hits.forEach((f) => set.add(f.path));
  }
  for (const id of selection.features || []) {
    const f = analysis.features.find((x) => x.id === id);
    if (!f) { notes.push(`unknown feature: ${id}`); continue; }
    f.files.forEach((p) => known.has(p) && set.add(p));
  }
  for (const id of selection.workflows || []) {
    const w = analysis.workflows.find((x) => x.id === id);
    if (!w) { notes.push(`unknown workflow: ${id}`); continue; }
    w.summary.files.forEach((p) => known.has(p) && set.add(p));
  }
  for (const name of selection.entities || []) {
    const e = analysis.database.entities.find((x) => x.name === name);
    if (!e) { notes.push(`unknown database entity: ${name}`); continue; }
    if (e.file) set.add(e.file);
    for (const q of analysis.database.queries) if (q.entity === name) set.add(q.file);
  }
  for (const key of selection.apis || []) {
    const a = analysis.apis.find((x) => `${x.method} ${x.endpoint}` === key);
    if (!a) { notes.push(`unknown API: ${key}`); continue; }
    set.add(a.file);
  }
  if (mode === 'PROJECT' || selection.project) all.forEach((f) => set.add(f.path));
  if (mode === 'DATABASE' && !(selection.entities || []).length && !set.size) {
    for (const e of analysis.database.entities) if (e.file) set.add(e.file);
    for (const q of analysis.database.queries) set.add(q.file);
  }
  const broad = !reanalyze && !selection.pinnedFiles && (mode === 'PROJECT' || mode === 'FOLDER' || !!selection.project);
  let out = [...set].sort();
  let skipped = 0;
  let ranked = broad;
  if (selection.pinnedFiles) { // a run being resumed: exactly the files it started with, so its batches are rebuilt identically
    out = [...new Set(selection.pinnedFiles.map(normalizeRelative))].filter((p) => known.has(p));
    // runs recorded with their order keep it (the reading order may have been edited since); older records were alphabetical
    if (selection.pinnedOrder) ranked = true; else out.sort();
  } else if (broad) {
    const status = new Map(files.map((f) => [f.path, f.status]));
    const userSkipped = new Set(files.filter((f) => f.skipped).map((f) => f.path)); // files the user chose to skip
    const keep = out.filter((p) => status.get(p) !== 'ANALYZED' && !userSkipped.has(p));
    skipped = out.length - keep.length;
    // the reading order decides first; inside a group, never analyzed files before outdated and partial ones
    out = keep.sort((a, b) => ord.compare(a, b) || (RANK[status.get(a)] ?? 0) - (RANK[status.get(b)] ?? 0) || ord.byPath(a, b));
  } else if (ord.active) {
    out.sort((a, b) => ord.compare(a, b) || ord.byPath(a, b));
    ranked = true;
  }
  return { files: out, notes, skipped, ranked };
}

module.exports = { selectFiles, readingOrder, modulesInScope, moduleManifest, MANIFEST, MODES };
