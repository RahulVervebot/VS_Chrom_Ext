// What the AI gets for each sub-project in a MODULES run, next to its manifest: the static facts VS Code already extracted
// (models it defines and extends, routes, views, menus, security, dependencies, feature candidates). Compact on purpose: the AI's job
// in this stage is to explain what each add-on/package is for and how it works, not to re-read every file.
const path = require('path');

const cap = (list, n) => (list.length > n ? [...list.slice(0, n), `… ${list.length - n} more`] : list);

function moduleFacts(mi, analysis, order) {
  const features = (analysis.features || []).filter((f) => (mi.features || []).includes(f.id));
  const odoo = mi.odoo;
  const viewTypes = {};
  if (odoo) for (const v of odoo.views) viewTypes[v.type] = (viewTypes[v.type] || 0) + 1;
  return {
    name: mi.name,
    path: mi.path,
    kind: mi.kind,
    title: mi.title || undefined,
    readingPosition: order,
    manifest: mi.manifest ? Object.fromEntries(Object.entries(mi.manifest).filter(([k]) => !['data', 'demo', 'assets', 'qweb'].includes(k)).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 1500) : v])) : undefined,
    dependsOn: mi.manifestDepends || [],
    usesModules: (mi.uses || []).map((u) => ({ module: u.module, imports: u.imports, extendsModels: cap(u.extendsModels, 15) })),
    usedBy: (mi.usedBy || []).map((u) => u.module),
    files: mi.files,
    layers: mi.layers,
    modelsDefined: cap((mi.models.defines || []).map((m) => ({ name: m.name, table: m.table, transient: m.transient || undefined, abstract: m.abstract || undefined, fields: cap(m.fields, 40), file: m.file })), 60),
    modelsExtended: cap((mi.models.extends || []).map((m) => ({ name: m.name, fieldsAdded: cap(m.fieldsAdded, 25), definedIn: m.definedIn || 'outside this project', file: m.file })), 60),
    relationships: cap((mi.relationships || []).map((r) => `${r.from} -${r.type}-> ${r.to}`), 60),
    routes: cap((mi.routes || []).map((r) => `${r.method} ${r.endpoint}${r.handler ? ` -> ${r.handler}` : ''}${r.protected ? ' (protected)' : ''}`), 60),
    odoo: odoo ? {
      views: viewTypes,
      viewList: cap(odoo.views.map((v) => `${v.model || '?'} ${v.type}`), 40),
      menus: cap(odoo.menus.map((m) => m.name || m.id).filter(Boolean), 60),
      actions: cap(odoo.actions.map((a) => `${a.name || a.id}${a.model ? ` (${a.model})` : ''}`), 40),
      securityGroups: cap(odoo.groups.map((g) => g.name || g.id), 30),
      recordRules: cap(odoo.recordRules.map((r) => r.name || r.id), 30),
      accessRules: odoo.accessRules.length,
      scheduledJobs: cap(odoo.crons.map((c) => c.name || c.id), 20),
      reports: cap(odoo.reports.map((r) => r.name || r.id), 20),
      mailTemplates: cap(odoo.mailTemplates.map((m) => m.name || m.id), 20),
      missingDataFiles: odoo.missingDataFiles,
    } : undefined,
    featureCandidates: cap(features.map((f) => ({ id: f.id, name: f.name, files: f.files.length, sampleFiles: [...new Set(f.files.map((p) => path.posix.basename(p)).filter((b) => !/^(__init__|__manifest__|__openerp__|index)\.\w+$/.test(b)))].slice(0, 8), entities: f.entities.slice(0, 8) })), 80),
    validation: mi.validation,
    externalPackages: mi.externalPackages,
  };
}

module.exports = { moduleFacts };
