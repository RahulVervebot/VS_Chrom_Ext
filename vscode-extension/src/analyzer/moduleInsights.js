// One summary per sub-project (Odoo add-on, Django app, monorepo package, Maven/Go module…): what it is, the models it defines and the ones
// it extends, its routes, features, workflows, validation, its dependencies on other sub-projects and, for Odoo, its views, menus,
// actions and access rules. Built from the static analysis plus the add-on's own data files; every item names the file it came from.
const fs = require('fs');
const path = require('path');
const { classifyRole } = require('./architectureAnalyzer');

const MAX_DATA_FILES = 300;
const MAX_DATA_BYTES = 512 * 1024;

const under = (p, dir) => p === dir || p.startsWith(`${dir}/`);
const attr = (s, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`).exec(s); return m ? (m[1] ?? m[2]) : null; };
const field = (body, name) => { const m = new RegExp(`<field\\s+name=["']${name}["'][^>]*?(?:ref=["']([^"']+)["'][^>]*)?(?:/>|>([\\s\\S]*?)</field>)`).exec(body); return m ? (m[1] || (m[2] || '').replace(/<[^>]+>/g, '').trim()) || null : null; };

async function readSmall(root, rel) {
  try { const abs = path.join(root, rel); const st = await fs.promises.stat(abs); if (st.size > MAX_DATA_BYTES) return null; return await fs.promises.readFile(abs, 'utf8'); } catch { return null; }
}

// Odoo XML data files: views, menus, window actions, security groups and record rules.
function parseOdooXml(text, file, out) {
  const code = text.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of code.matchAll(/<record\b([^>]*)>([\s\S]*?)<\/record>/g)) {
    const id = attr(m[1], 'id'); const model = attr(m[1], 'model'); const body = m[2];
    if (model === 'ir.ui.view') {
      const arch = /<field\s+name=["']arch["'][^>]*>\s*<([a-z]+)/.exec(body);
      const inherit = field(body, 'inherit_id');
      out.views.push({ id, model: field(body, 'model'), type: inherit ? `inherits ${inherit}` : arch ? (arch[1] === 'tree' ? 'list' : arch[1]) : 'unknown', file });
    } else if (model === 'ir.actions.act_window') out.actions.push({ id, name: field(body, 'name'), model: field(body, 'res_model'), file });
    else if (model === 'res.groups') out.groups.push({ id, name: field(body, 'name'), file });
    else if (model === 'ir.rule') out.recordRules.push({ id, name: field(body, 'name'), model: field(body, 'model_id'), file });
    else if (model === 'ir.cron') out.crons.push({ id, name: field(body, 'name'), file });
    else if (model === 'mail.template') out.mailTemplates.push({ id, name: field(body, 'name'), file });
    else if (model === 'ir.actions.report') out.reports.push({ id, name: field(body, 'name'), model: field(body, 'model'), file });
  }
  for (const m of code.matchAll(/<menuitem\b([^>]*?)\/?>/g)) out.menus.push({ id: attr(m[1], 'id'), name: attr(m[1], 'name'), parent: attr(m[1], 'parent'), action: attr(m[1], 'action'), file });
  for (const m of code.matchAll(/<template\b([^>]*?)>/g)) out.templates.push({ id: attr(m[1], 'id'), inherits: attr(m[1], 'inherit_id'), file });
}

// security/ir.model.access.csv
function parseAccessCsv(text, file, out) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return;
  const head = lines[0].split(',').map((h) => h.trim());
  const col = (n) => head.indexOf(n);
  for (const l of lines.slice(1)) {
    const c = l.split(',').map((x) => x.trim());
    const perm = ['perm_read', 'perm_write', 'perm_create', 'perm_unlink'].map((p, i) => (c[col(p)] === '1' ? 'rwcd'[i] : '-')).join('');
    out.accessRules.push({ id: c[col('id')], model: c[col('model_id:id')] || c[col('model_id')], group: c[col('group_id:id')] || c[col('group_id')] || null, permissions: perm, file });
  }
}

const modelOfAccess = (ref) => (ref ? String(ref).replace(/^.*\./, '').replace(/^model_/, '').replace(/_/g, '.') : null);

async function buildModuleInsights(root, modules, { analyses, apis, entities, relationships, features, workflows, dependencies, scanFiles }) {
  if (!modules.length) return [];
  const byLen = [...modules].sort((a, b) => b.path.length - a.path.length);
  const moduleOf = (p) => { const m = byLen.find((x) => under(p, x.path)); return m ? m.path : null; };
  const byName = new Map(modules.map((m) => [m.name, m.path]));
  // which module defines each model (so an extension can say whose model it extends)
  const definedIn = new Map();
  for (const e of entities) { if (!e.file || e.extension) continue; const m = moduleOf(e.file); if (m && !definedIn.has(e.name)) definedIn.set(e.name, m); }

  const out = [];
  for (const mod of modules) {
    const files = scanFiles.filter((f) => under(f.path, mod.path));
    const fa = analyses.filter((a) => under(a.path, mod.path));
    const languages = {}; const layers = {};
    for (const a of fa) if (a.isSource) { languages[a.language] = (languages[a.language] || 0) + 1; const r = classifyRole(a.path); layers[r] = (layers[r] || 0) + 1; }
    const own = (x) => x.file && under(x.file, mod.path);
    const ents = entities.filter(own);
    const defines = ents.filter((e) => !e.extension).map((e) => ({ name: e.name, ...(e.table ? { table: e.table } : {}), source: e.source || null, fields: (e.fields || []).map((f) => f.name), ...(e.inherits && e.inherits.length ? { inherits: e.inherits } : {}), ...(e.transient ? { transient: true } : {}), ...(e.abstract ? { abstract: true } : {}), file: e.file, line: e.line }));
    const extendsList = ents.filter((e) => e.extension).map((e) => ({ name: e.name, fieldsAdded: (e.fields || []).map((f) => f.name), definedIn: definedIn.get(e.name) || null, file: e.file, line: e.line }));
    const modelNames = new Set(ents.map((e) => e.name));
    // dependencies on other sub-projects: file imports, Odoo `odoo.addons.<name>` imports and models extended from them
    const uses = new Map();
    const addUse = (target, why) => { if (!target || target === mod.path) return; const u = uses.get(target) || { module: target, imports: 0, extendsModels: [] }; if (why === 'import') u.imports++; else u.extendsModels.push(why); uses.set(target, u); };
    const external = new Set();
    for (const a of fa) {
      for (const d of ((dependencies[a.path] || {}).internal || [])) addUse(moduleOf(d.path), 'import');
      for (const d of ((dependencies[a.path] || {}).external || [])) {
        const odoo = /^odoo\.addons\.(\w+)/.exec(d);
        if (odoo && byName.has(odoo[1])) addUse(byName.get(odoo[1]), 'import');
        else if (!/^(odoo|\.)/.test(d)) external.add(String(d).split(/[./]/)[0]);
      }
    }
    for (const x of extendsList) if (x.definedIn) addUse(x.definedIn, x.name);
    const insight = {
      path: mod.path, kind: mod.kind, name: mod.name, title: mod.title || null, manifestDepends: mod.depends || [], ...(mod.manifest ? { manifest: mod.manifest } : {}),
      files: { total: files.length, source: fa.filter((a) => a.isSource).length, tests: fa.filter((a) => a.isTest).length, languages }, layers,
      models: { defines, extends: extendsList },
      relationships: relationships.filter((r) => modelNames.has(r.from) && own(r)).map((r) => ({ from: r.from, to: r.to, type: r.type, file: r.file })),
      routes: apis.filter(own).map((a) => ({ method: a.method, endpoint: a.endpoint, handler: a.handler || null, protected: (a.middleware || []).some((m) => /auth|login|protect|secur|guard|jwt|token|user/i.test(String(m))), file: a.file, line: a.line })),
      features: features.filter((f) => (f.files || []).some((p) => under(p, mod.path))).map((f) => f.id),
      workflows: workflows.filter((w) => (w.summary && w.summary.files ? w.summary.files : []).some((p) => under(p, mod.path))).map((w) => w.id),
      validation: { rules: fa.reduce((n, a) => n + (a.validation || []).filter((v) => v.kind !== 'guard').length, 0), guards: fa.reduce((n, a) => n + (a.validation || []).filter((v) => v.kind === 'guard').length, 0) },
      uses: [...uses.values()].sort((a, b) => a.module.localeCompare(b.module)),
      usedBy: [],
      externalPackages: [...external].sort().slice(0, 60),
    };
    if (mod.kind === 'odoo-addon') {
      const odoo = { views: [], menus: [], actions: [], groups: [], recordRules: [], accessRules: [], crons: [], mailTemplates: [], reports: [], templates: [], missingDataFiles: [] };
      const listed = new Set(((mod.manifest && mod.manifest.data) || []).map((d) => d.replace(/ \(demo\)$/, '')));
      for (const rel of listed) if (!files.some((f) => f.path === `${mod.path}/${rel}`)) odoo.missingDataFiles.push(rel);
      const dataFiles = files.filter((f) => /\.(xml|csv)$/i.test(f.path)).slice(0, MAX_DATA_FILES);
      for (const f of dataFiles) {
        const text = await readSmall(root, f.path);
        if (text === null) continue;
        if (/\.csv$/i.test(f.path)) { if (/ir\.model\.access\.csv$/i.test(f.path) || /^id,.*model_id/.test(text)) parseAccessCsv(text, f.path, odoo); } else parseOdooXml(text, f.path, odoo);
      }
      for (const r of odoo.accessRules) r.modelGuess = modelOfAccess(r.model);
      for (const r of odoo.recordRules) if (r.model && /^(.*\.)?model_/.test(r.model)) r.model = modelOfAccess(r.model);
      insight.odoo = odoo;
    }
    out.push(insight);
  }
  for (const m of out) for (const u of m.uses) { const t = out.find((x) => x.path === u.module); if (t) t.usedBy.push({ module: m.path, imports: u.imports, extendsModels: u.extendsModels }); }
  return out;
}

module.exports = { buildModuleInsights, parseOdooXml, parseAccessCsv };
