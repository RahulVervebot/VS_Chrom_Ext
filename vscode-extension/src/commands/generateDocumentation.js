const { requireProject, ensureScanned, progress } = require('./common');

async function open(ctx, md, title) {
  const v = ctx.vscode;
  const doc = await v.workspace.openTextDocument({ language: 'markdown', content: md });
  await v.commands.executeCommand('markdown.showPreview', doc.uri).then(undefined, () => v.window.showTextDocument(doc));
}

module.exports = (ctx) => {
  const generate = (force, label) => async () => {
    const pm = await ensureScanned(ctx);
    const r = await progress(ctx, `AI Project: ${label} documentation…`, () => pm.documentation.updateAll({ force }));
    ctx.vscode.window.showInformationMessage(`AI Project: documentation ${r.wrote.length ? `updated (${r.wrote.length} document(s))` : 'is already up to date'}. Coverage: ${r.coverage.coverageStatus}.`);
    ctx.refresh();
    return r;
  };
  return {
    'aiProject.generateDocumentation': generate(false, 'generating'),
    'aiProject.updateDocumentation': generate(false, 'updating'),
    'aiProject.rebuildDocumentation': generate(true, 'rebuilding'),
    'aiProject.showArchitecture': async () => {
      const pm = await ensureScanned(ctx);
      await pm.documentation.updateAll();
      const md = await pm.documentation.read('documentation/architecture');
      if (!md) { ctx.vscode.window.showWarningMessage('AI Project: no architecture information yet.'); return; }
      await open(ctx, md);
    },
    'aiProject.showDependencyGraph': async (uri) => {
      requireProject(ctx);
      if (uri && uri.fsPath) { const { toRel } = require('./common'); ctx.host.broadcastFocus = toRel(ctx, uri); ctx.host.openPanel('dependencies'); ctx.host.broadcast('focus-file', { path: ctx.host.broadcastFocus }); return; }
      ctx.host.openPanel('dependencies');
    },
  };
};
