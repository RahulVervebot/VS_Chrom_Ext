const { requireProject, progress, fmt } = require('./common');

module.exports = (ctx) => ({
  'aiProject.scanProject': async () => {
    const pm = requireProject(ctx);
    const r = await progress(ctx, 'AI Project: scanning project…', () => pm.scan());
    const { saved, scan } = r;
    const parts = [`${fmt(scan.totals.files)} files`, `${fmt(scan.totals.lines)} lines`, `${saved.changed.length} changed`];
    if (saved.outdated.length) parts.push(`${saved.outdated.length} analyzed file(s) now OUTDATED`);
    ctx.vscode.window.showInformationMessage(`AI Project: scan complete — ${parts.join(', ')}.`);
    if (saved.impact.documentation.length) ctx.out.appendLine(`[AI-PROJECT] Documentation outdated: ${saved.impact.documentation.join(', ')}`);
    ctx.refresh();
    return { files: scan.totals.files, changed: saved.changed.length, outdated: saved.outdated.length };
  },
  'aiProject.detectFeatures': async () => {
    const v = ctx.vscode;
    const pm = requireProject(ctx);
    await progress(ctx, 'AI Project: detecting features…', () => pm.scan());
    ctx.refresh();
    const feats = (await pm.store.readJson('features/index.json', { features: [] })).features;
    if (!feats.length) { v.window.showInformationMessage('AI Project: no features were detected from routes, folders or naming.'); return []; }
    ctx.host.openPanel('features');
    return feats;
  },
});
