// Resolves a user selection + analysis mode into a primary set of project files.
const { normalizeRelative } = require('../utils/paths');

const MODES = ['FILE', 'FOLDER', 'FEATURE', 'WORKFLOW', 'DATABASE', 'PROJECT', 'DOCUMENTATION', 'COMPARISON', 'BLUEPRINT'];

const under = (p, folder) => p === folder || p.startsWith(folder.replace(/\/$/, '') + '/');

// analysis: static analysis result (in memory); files: index file records
// Broad selections (entire project, whole folders) continue where the last run stopped: files that are analyzed and unchanged are skipped
// and the rest come in the order NOT_ANALYZED, OUTDATED, PARTIAL. Explicit picks (files, features, workflows…) are always analyzed as asked.
const RANK = { NOT_ANALYZED: 0, OUTDATED: 1, PARTIAL: 2 };

function selectFiles({ mode, selection = {}, analysis, files, reanalyze = false }) {
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
  if (selection.pinnedFiles) { // a run being resumed: exactly the files it started with, so its batches are rebuilt identically
    out = [...new Set(selection.pinnedFiles.map(normalizeRelative))].filter((p) => known.has(p)).sort();
  } else if (broad) {
    const status = new Map(files.map((f) => [f.path, f.status]));
    const keep = out.filter((p) => status.get(p) !== 'ANALYZED');
    skipped = out.length - keep.length;
    out = keep.sort((a, b) => (RANK[status.get(a)] ?? 0) - (RANK[status.get(b)] ?? 0) || a.localeCompare(b));
  }
  return { files: out, notes, skipped, ranked: broad };
}

module.exports = { selectFiles, MODES };
