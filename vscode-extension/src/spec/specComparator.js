// Deterministic comparison of two project specifications: what both have, what only one has, what differs.
// Facts only: no scores, rankings or winners. Suggestions are phrased as things to consider, each backed by the listed items.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const singular = (s) => (s.length > 3 && s.endsWith('ies') ? `${s.slice(0, -3)}y` : s.length > 3 && s.endsWith('s') && !s.endsWith('ss') ? s.slice(0, -1) : s);
const nkey = (s) => singular(norm(s));
const normPath = (p) => String(p || '').toLowerCase().replace(/:[a-z_][\w]*|\{[^}]+\}|\[[^\]]+\]|<[^>]+>/g, ':p').replace(/\/+$/, '') || '/';
const normType = (t) => String(t || 'unknown').toLowerCase().replace(/\(.*\)/, '').replace(/varchar|char|text|string/, 'string').replace(/int|integer|bigint|number|decimal|float|double/, 'number');
const major = (v) => { const m = /(\d+)/.exec(String(v || '')); return m ? m[1] : String(v || ''); };

// category -> Map(key -> { key, label, detail })
function items(spec) {
  const m = {};
  const put = (cat, key, label, detail) => { if (!key) return; (m[cat] ||= new Map()); if (!m[cat].has(key)) m[cat].set(key, { key, label, detail: detail || '' }); };
  for (const f of spec.features) put('features', nkey(f.name), f.name, `${f.apis.length} API(s), ${f.entities.length} entit${f.entities.length === 1 ? 'y' : 'ies'}`);
  for (const a of spec.apis) put('apis', `${a.method} ${normPath(a.endpoint)}`, a.key, a.protected ? 'protected' : '');
  for (const e of spec.database.entities) {
    put('tables', nkey(e.name), e.name, `${e.fields.length} field(s)`);
    for (const f of e.fields) put('fields', `${nkey(e.name)}.${norm(f.name)}`, `${e.name}.${f.name}`, `${f.type}${f.required ? ', required' : ''}${f.unique ? ', unique' : ''}`);
  }
  for (const r of spec.database.relationships) put('relationships', `${nkey(r.from)}>${nkey(r.to)}`, `${r.from} → ${r.to}`, r.type);
  for (const v of spec.validation) {
    if (v.kind === 'guard') put('validation', `guard:${norm(v.rules[0]).replace(/http\d+/, '')}`, v.rules[0], 'guard');
    else for (const r of v.rules) put('validation', `${norm(v.field)}:${norm(r.replace(/\(.*$/, ''))}`, `${v.field}: ${r}`, v.kind);
  }
  for (const b of spec.businessRules) put('businessRules', `${b.kind}:${norm(b.symbol)}`, `${b.kind}: ${b.symbol}`, 'inferred');
  for (const w of spec.workflows) put('workflows', w.api ? `${w.api.split(' ')[0]} ${normPath(w.api.split(' ').slice(1).join(' '))}` : nkey(w.name), w.name, `${w.steps.length} step(s)`);
  for (const p of [...spec.stack.runtimeModules, ...spec.stack.devModules]) put('modules', norm(p.name), p.name, p.version);
  for (const v of spec.environment.variables) put('environment', norm(v.name), v.name, '');
  for (const s of spec.externalServices) put('services', norm(s.name), s.name, '');
  for (const a of spec.auth) put('auth', `${a.type}:${a.kind}`, `${a.type}: ${a.kind}`, '');
  for (const l of Object.keys(spec.architecture.layers || {})) put('layers', norm(l), l, `${spec.architecture.layers[l].length} file(s)`);
  for (const s of spec.state) put('state', norm(s.library), s.library, '');
  return m;
}

const CATEGORIES = [
  ['features', 'Features'], ['tables', 'Database tables'], ['fields', 'Database fields'], ['relationships', 'Table relationships'], ['apis', 'API endpoints'],
  ['validation', 'Validation rules'], ['businessRules', 'Business rules'], ['workflows', 'Workflows'], ['modules', 'Required modules'], ['auth', 'Authentication / authorization'],
  ['services', 'External services'], ['environment', 'Environment variables'], ['layers', 'Architecture layers'], ['state', 'State management'],
];

function compareSpecs(a, b) {
  const A = items(a); const B = items(b);
  const categories = CATEGORIES.map(([id, title]) => {
    const ma = A[id] || new Map(); const mb = B[id] || new Map();
    const common = []; const onlyA = []; const onlyB = []; const different = [];
    for (const [k, x] of ma) {
      const y = mb.get(k);
      if (!y) { onlyA.push(x); continue; }
      common.push({ key: k, label: x.label, a: x.detail, b: y.detail });
      if (id === 'fields' && normType(x.detail.split(',')[0]) !== normType(y.detail.split(',')[0])) different.push({ key: k, label: x.label, a: x.detail, b: y.detail, why: 'field type differs' });
      if (id === 'fields' && /required/.test(x.detail) !== /required/.test(y.detail)) different.push({ key: `${k}#req`, label: x.label, a: x.detail, b: y.detail, why: 'required differs' });
      if (id === 'modules' && major(x.detail) !== major(y.detail)) different.push({ key: k, label: x.label, a: x.detail, b: y.detail, why: 'major version differs' });
      if (id === 'apis' && x.detail !== y.detail) different.push({ key: k, label: x.label, a: x.detail || 'not protected', b: y.detail || 'not protected', why: 'protection differs' });
    }
    for (const [k, y] of mb) if (!ma.has(k)) onlyB.push(y);
    return { id, title, common, onlyA, onlyB, different, counts: { common: common.length, onlyA: onlyA.length, onlyB: onlyB.length, different: different.length } };
  });
  const totals = categories.reduce((t, c) => ({ common: t.common + c.counts.common, onlyA: t.onlyA + c.counts.onlyA, onlyB: t.onlyB + c.counts.onlyB, different: t.different + c.counts.different }), { common: 0, onlyA: 0, onlyB: 0, different: 0 });
  return { a: { projectId: a.project.projectId, name: a.project.name, coverage: a.coverage }, b: { projectId: b.project.projectId, name: b.project.name, coverage: b.coverage }, totals, categories, suggestions: suggest(a.project.name, b.project.name, categories) };
}

const ADOPT_ORDER = ['features', 'tables', 'fields', 'apis', 'validation', 'workflows', 'modules', 'auth', 'services', 'environment', 'layers', 'businessRules', 'relationships', 'state'];
const SHOW = 12;

// Suggestions are for planning a blueprint. They say what to consider and why; they never rank projects.
function suggest(nameA, nameB, categories) {
  const by = Object.fromEntries(categories.map((c) => [c.id, c]));
  const out = [];
  for (const id of ADOPT_ORDER) {
    const c = by[id];
    if (c.onlyB.length) out.push({ id: `adopt-${id}`, direction: 'adopt', area: c.title, title: `${c.title}: ${nameB} has ${c.onlyB.length} that ${nameA} does not`, reason: `Consider whether ${nameA} needs these.`, items: c.onlyB.slice(0, SHOW).map((x) => x.label), more: Math.max(0, c.onlyB.length - SHOW) });
  }
  for (const id of ADOPT_ORDER) {
    const c = by[id];
    if (c.onlyA.length) out.push({ id: `keep-${id}`, direction: 'keep', area: c.title, title: `${c.title}: ${nameA} has ${c.onlyA.length} that ${nameB} does not`, reason: `Keep these in a combined blueprint if they are still required, or note that ${nameB} works without them.`, items: c.onlyA.slice(0, SHOW).map((x) => x.label), more: Math.max(0, c.onlyA.length - SHOW) });
  }
  for (const c of categories) if (c.different.length) out.push({ id: `review-${c.id}`, direction: 'review', area: c.title, title: `${c.title}: ${c.different.length} in both projects but different`, reason: 'Decide which behaviour the new project should follow; the blueprint should record the choice.', items: c.different.slice(0, SHOW).map((x) => `${x.label}: ${nameA} = ${x.a || '–'}, ${nameB} = ${x.b || '–'} (${x.why})`), more: Math.max(0, c.different.length - SHOW) });
  return out;
}

// Compact text of the comparison for the AI (and for the saved markdown).
function matrixText(m, limit = 40) {
  const lines = [`COMPARISON: ${m.a.name} (A)  vs  ${m.b.name} (B)`, `Totals: ${m.totals.common} common, ${m.totals.onlyA} only in A, ${m.totals.onlyB} only in B, ${m.totals.different} differ`, ''];
  for (const c of m.categories) {
    if (!c.counts.common && !c.counts.onlyA && !c.counts.onlyB) continue;
    lines.push(`## ${c.title}  (common ${c.counts.common}, only A ${c.counts.onlyA}, only B ${c.counts.onlyB}, differ ${c.counts.different})`);
    const row = (tag, xs) => { if (xs.length) lines.push(`  ${tag}: ${xs.slice(0, limit).map((x) => x.label).join('; ')}${xs.length > limit ? `; … +${xs.length - limit} more` : ''}`); };
    row('Common', c.common); row('Only in A', c.onlyA); row('Only in B', c.onlyB);
    if (c.different.length) lines.push(`  Differ: ${c.different.slice(0, limit).map((x) => `${x.label} (A: ${x.a || '–'}; B: ${x.b || '–'}; ${x.why})`).join('; ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { compareSpecs, matrixText, items, CATEGORIES };
