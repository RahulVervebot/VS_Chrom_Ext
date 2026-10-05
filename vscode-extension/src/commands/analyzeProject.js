const { requireProject, ensureScanned, runAnalysis, askPurpose } = require('./common');

module.exports = (ctx) => ({
  'aiProject.analyzeSelection': async (uri) => {
    const v = ctx.vscode;
    const pm = requireProject(ctx);
    // Invoked from the Explorer/editor context menu with no prior selection: use that resource.
    if (uri && uri.fsPath && ctx.selection.isEmpty()) {
      const { toRel } = require('./common');
      const rel = toRel(ctx, uri);
      const isDir = (await v.workspace.fs.stat(uri)).type === v.FileType.Directory;
      ctx.selection.add(isDir ? 'folders' : 'files', [rel]);
    }
    if (ctx.selection.isEmpty()) {
      const ed = v.window.activeTextEditor;
      if (ed && ed.document.uri.scheme === 'file') { const { toRel } = require('./common'); ctx.selection.add('files', [toRel(ctx, ed.document.uri)]); }
    }
    if (ctx.selection.isEmpty()) {
      const choice = await v.window.showInformationMessage('Nothing is selected. Analyze the entire project? Large projects are split into batches.', { modal: true }, 'Analyze entire project');
      if (!choice) return;
      ctx.selection.add('project');
    }
    const purpose = await askPurpose(ctx, 'e.g. Understand the authentication flow');
    if (purpose === undefined) return;
    const snap = await runAnalysis(ctx, { mode: ctx.selection.mode(), selection: ctx.selection.get(), purpose: purpose || undefined });
    ctx.refresh();
    return snap;
  },
  'aiProject.analyzeDependencies': async (uri) => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    let rel;
    if (uri && uri.fsPath) { const { toRel } = require('./common'); rel = toRel(ctx, uri); }
    else {
      const files = (await pm.knowledge.getFiles()).filter((f) => f.isSource);
      const pick = await v.window.showQuickPick(files.map((f) => ({ label: f.path })), { placeHolder: 'File whose dependencies and dependents should be analyzed' });
      if (!pick) return;
      rel = pick.label;
    }
    return runAnalysis(ctx, { mode: 'FILE', selection: { files: [rel] }, purpose: `Dependencies of ${rel}` });
  },
});
