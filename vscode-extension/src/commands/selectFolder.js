const { requireProject, toRel } = require('./common');

module.exports = (ctx) => ({
  'aiProject.selectFolder': async (uri, uris) => {
    const v = ctx.vscode;
    const pm = requireProject(ctx);
    let rels;
    const list = Array.isArray(uris) && uris.length ? uris : (uri && uri.fsPath ? [uri] : null);
    if (list) rels = list.map((u) => toRel(ctx, u));
    else {
      const folders = (await pm.store.readJson('index/files.json', { files: [] })).files.reduce((set, f) => { const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : null; if (d) { let p = d; while (p) { set.add(p); p = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; } } return set; }, new Set());
      if (!folders.size) { v.window.showWarningMessage('Scan the project first (AI Project: Scan Project).'); return; }
      const picked = await v.window.showQuickPick([...folders].sort().map((f) => ({ label: f })), { canPickMany: true, placeHolder: 'Select folders to analyze' });
      if (!picked || !picked.length) return;
      rels = picked.map((p) => p.label);
    }
    ctx.selection.add('folders', rels);
    v.window.showInformationMessage(`AI Project: selected ${rels.length} folder(s). Selection: ${ctx.selection.summary()}.`);
    ctx.refresh();
  },
});
