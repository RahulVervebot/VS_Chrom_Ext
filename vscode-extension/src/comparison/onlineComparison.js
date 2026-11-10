// Compare this project (or a part of it) with published software, e.g. "Odoo 15 Community, point of sale module".
// VS Code sends this project's specification (cut to the chosen scope) and the user's prompt; the AI researches the other software on
// the web and answers with common features, what only one side has, structure differences, likely bugs, recommended changes, sources
// and a summary. Nothing about the other software can be checked here, so it is shown as the AI's research (with its sources); every
// place in THIS project the AI points to is checked against the project and flagged when it does not exist.
const { buildSpec } = require('../spec/specBuilder');
const { renderSpec } = require('../spec/specRenderer');
const { nextSequentialId } = require('../utils/ids');

const SPEC_CHARS = 40000;
const under = (p, dir) => p === dir || p.startsWith(`${dir}/`);
const any = (list, f) => (list || []).some(f);

// The specification restricted to the files in scope (and the modules that contain them).
function scopeSpec(spec, files) {
  const inF = (p) => !!p && files.has(p);
  const features = spec.features.filter((f) => any(f.files, inF));
  const entities = spec.database.entities.filter((e) => inF(e.file));
  const names = new Set(entities.map((e) => e.name));
  const modules = (spec.modules || []).filter((m) => [...files].some((p) => under(p, m.path)));
  return {
    ...spec,
    features,
    database: { ...spec.database, entities, relationships: spec.database.relationships.filter((r) => names.has(r.from) || names.has(r.to)) },
    modules,
    architecture: {
      ...spec.architecture,
      layers: Object.fromEntries(Object.entries(spec.architecture.layers || {}).map(([k, v]) => [k, (Array.isArray(v) ? v : []).filter((x) => inF(typeof x === 'string' ? x : x && (x.file || x.path)))]).filter(([, v]) => v.length)),
      entryPoints: (spec.architecture.entryPoints || []).filter((x) => inF(typeof x === 'string' ? x : x && (x.file || x.path))),
      config: (spec.architecture.config || []).filter((x) => inF(typeof x === 'string' ? x : x && (x.file || x.path))),
      modules: (spec.architecture.modules || []).filter((m) => [...files].some((p) => under(p, m.path))),
    },
    apis: spec.apis.filter((a) => inF(a.file)),
    clientCalls: spec.clientCalls.filter((c) => inF(c.from)),
    validation: spec.validation.filter((v) => inF(v.file)),
    businessRules: spec.businessRules.filter((b) => inF(b.file)),
    workflows: spec.workflows.filter((w) => any(w.steps, (s) => inF(s.file)) || (w.trigger && inF(w.trigger.file))),
    auth: spec.auth.filter((a) => any(a.files, inF)),
    externalServices: spec.externalServices.filter((s) => any(s.files, inF)),
    environment: { ...spec.environment, variables: spec.environment.variables.filter((v) => any(v.usedIn, inF)) },
    state: spec.state.filter((s) => any(s.files, inF)),
    tests: spec.tests.filter(inF),
  };
}

// scope: { kind: 'project' } | { kind: 'selection', files:Set, label } | { kind: 'modules', modules: [paths] }
async function buildOnlineRequest(pm, { target, prompt, scope = { kind: 'project' } }) {
  const t = String(target || '').trim();
  if (!t) throw new Error('Say which software to compare with, for example "Odoo 15 Community, point of sale".');
  const full = await buildSpec(pm.root, pm.config.get('aiProjectFolder') || '.ai-project');
  let spec = full;
  let label = 'the entire project';
  let files = null;
  if (scope.kind === 'selection' && scope.files && scope.files.size) { files = scope.files; label = scope.label || `${files.size} selected file(s)`; }
  if (scope.kind === 'modules' && (scope.modules || []).length) {
    const idx = await pm.knowledge.getFiles();
    files = new Set(idx.filter((f) => scope.modules.some((m) => under(f.path, m))).map((f) => f.path));
    const names = (full.modules || []).filter((m) => scope.modules.includes(m.path)).map((m) => m.name);
    label = `module${names.length === 1 ? '' : 's'} ${names.join(', ') || scope.modules.join(', ')}`;
  }
  if (files) spec = scopeSpec(full, files);
  const text = renderSpec(spec).text;
  const specText = text.length > SPEC_CHARS ? `${text.slice(0, SPEC_CHARS)}\n[… cut for the AI; the full specification is in the project folder]` : text;
  return {
    target: t.slice(0, 300),
    prompt: String(prompt || '').trim().slice(0, 6000),
    scopeLabel: label,
    project: { projectId: full.project.projectId, name: full.project.name },
    payload: {
      kind: 'ONLINE', target: t.slice(0, 300), userPrompt: String(prompt || '').trim().slice(0, 6000), scopeLabel: label,
      projects: [{ project: { projectId: full.project.projectId, name: full.project.name }, coverage: spec.coverage, specText }],
      structural: { stack: { languages: Object.keys(spec.stack.languages || {}), technologies: (spec.stack.technologies || []).map((x) => x.name), databases: spec.database.technologies }, counts: { features: spec.features.length, modules: (spec.modules || []).length, entities: spec.database.entities.length, apis: spec.apis.length, workflows: spec.workflows.length } },
      selection: [],
    },
  };
}

async function createOnlineRecord(store, req) {
  const existing = (await store.listDir('comparisons')).map((n) => n.replace(/\.(json|md)$/, ''));
  const id = nextSequentialId('comparison', existing);
  const rec = { comparisonId: id, kind: 'ONLINE', createdAt: new Date().toISOString(), status: 'WAITING_AI', target: req.target, prompt: req.prompt, scopeLabel: req.scopeLabel, projects: [req.project], result: null, conflicts: [] };
  await store.writeJson(`comparisons/${id}.json`, rec);
  return rec;
}

// every "where" the AI names in this project must exist: a file, a folder, or a module name
function checkPlaces(result, { files, modules }) {
  const fileSet = new Set(files);
  const dirs = new Set(); for (const p of files) { const s = p.split('/'); for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join('/')); }
  const modNames = new Set(modules.flatMap((m) => [m.name, m.path]));
  const check = (where) => {
    const w = String(where || '').trim();
    if (!w) return null;
    const parts = w.split(/[,;]\s*|\s+and\s+/).map((x) => x.replace(/[`'"]/g, '').replace(/:\d+(-\d+)?$/, '').replace(/\s*\(.*\)$/, '').trim()).filter(Boolean);
    const found = parts.filter((x) => fileSet.has(x) || dirs.has(x.replace(/\/$/, '')) || modNames.has(x) || files.some((p) => p.endsWith(`/${x}`)));
    return found.length ? 'FOUND' : 'NOT_FOUND';
  };
  for (const list of [result.possibleBugs, result.recommendedChanges]) for (const x of list || []) { const s = check(x.where); if (s) x.whereCheck = s; }
  return result;
}

async function storeOnlineResult(pm, payload) {
  const store = pm.store;
  const ref = String(payload.ref || '');
  let rec = /^comparison-\d{3,}$/.test(ref) ? await store.readJson(`comparisons/${ref}.json`, null) : null;
  if (!rec || rec.kind !== 'ONLINE') rec = await createOnlineRecord(store, { target: payload.target || 'online software', prompt: payload.userPrompt || '', scopeLabel: payload.scopeLabel || '', project: (payload.projects || [])[0] || {} });
  const files = (await pm.knowledge.getFiles()).map((f) => f.path);
  const modules = (await store.readJson('index/modules.json', { modules: [] })).modules || [];
  rec.result = checkPlaces(JSON.parse(JSON.stringify(payload.result || {})), { files, modules });
  rec.status = 'COMPLETED'; rec.provider = payload.provider || null; rec.receivedAt = new Date().toISOString();
  await store.writeJson(`comparisons/${rec.comparisonId}.json`, rec);
  await store.writeText(`comparisons/${rec.comparisonId}.md`, onlineMarkdown(rec));
  return rec;
}

function onlineMarkdown(rec) {
  const r = rec.result || {};
  const fc = r.featureComparison || {};
  const li = (x) => `- ${x}`;
  const where = (x) => (x.where ? ` — where: ${x.where}${x.whereCheck === 'NOT_FOUND' ? ' (NOT FOUND in this project)' : ''}` : '');
  return [
    `# ${rec.projects[0] ? rec.projects[0].name : 'This project'} compared with ${rec.target}`, '',
    `Scope: ${rec.scopeLabel} · ${rec.comparisonId} · ${rec.receivedAt || rec.createdAt} · AI: ${rec.provider || '?'}`, '',
    rec.prompt ? `Prompt: ${rec.prompt}\n` : '',
    '## Summary', r.summary || '_none_', '',
    ...(r.researchNote ? ['> ' + r.researchNote, ''] : []),
    '## Features in both', ...(fc.common || []).map((x) => li(`${x.feature}: ours ${x.ours || '–'} · theirs ${x.theirs || '–'}${x.notes ? ` (${x.notes})` : ''}`)), '',
    '## Only in this project', ...(fc.onlyOurs || []).map((x) => li(`${x.feature}${x.notes ? ` — ${x.notes}` : ''}`)), '',
    `## Only in ${rec.target}`, ...(fc.onlyTheirs || []).map((x) => li(`${x.feature} — worth adding: ${x.worthAdding || '?'}${x.why ? ` (${x.why})` : ''}`)), '',
    '## Structure differences', ...(r.structureDifferences || []).map((x) => li(`${x.area}: ours ${x.ours || '–'} · theirs ${x.theirs || '–'}${x.implication ? ` → ${x.implication}` : ''}`)), '',
    '## Possible bugs', ...(r.possibleBugs || []).map((x) => li(`[${x.severity || '?'}] ${x.title}${where(x)}. ${x.why || ''}${x.fix ? ` Fix: ${x.fix}` : ''}`)), '',
    '## Recommended changes', ...(r.recommendedChanges || []).map((x) => li(`[${x.priority || '?'} priority, ${x.effort || '?'} effort] ${x.title}${where(x)}. ${x.what || ''}${x.why ? ` Why: ${x.why}` : ''}`)), '',
    '## Sources', ...((r.target && r.target.sources) || []).map((s) => li(`${s.title || s.url}: ${s.url || ''}`)), '',
    '## Not established', ...(r.unknowns || []).map(li), '',
  ].join('\n');
}

module.exports = { buildOnlineRequest, createOnlineRecord, storeOnlineResult, scopeSpec, checkPlaces };
