const { requireProject, toRel } = require('./common');

module.exports = (ctx) => ({
  'aiProject.selectFiles': async (uri, uris) => {
    const v = ctx.vscode;
    const pm = requireProject(ctx);
    let rels;
    const list = Array.isArray(uris) && uris.length ? uris : (uri && uri.fsPath ? [uri] : null);
    if (list) rels = list.map((u) => toRel(ctx, u));
    else {
      const files = (await pm.knowledge.getFiles()).filter((f) => f.isSource);
      if (!files.length) { v.window.showWarningMessage('Scan the project first (AI Project: Scan Project).'); return; }
      const picked = await v.window.showQuickPick(files.map((f) => ({ label: f.path, description: `${f.lines} lines · ${f.status}` })), { canPickMany: true, placeHolder: 'Select files to analyze', matchOnDescription: true });
      if (!picked || !picked.length) return;
      rels = picked.map((p) => p.label);
    }
    ctx.selection.add('files', rels);
    v.window.showInformationMessage(`AI Project: selected ${rels.length} file(s). Selection: ${ctx.selection.summary()}.`);
    ctx.refresh();
  },
});
