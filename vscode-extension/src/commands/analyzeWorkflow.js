const { ensureScanned, runAnalysis, askPurpose } = require('./common');

module.exports = (ctx) => ({
  'aiProject.analyzeWorkflows': async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const wfs = (await pm.store.readJson('workflows/index.json', { workflows: [] })).workflows;
    if (!wfs.length) { v.window.showWarningMessage('AI Project: no workflows were traced from source (no API routes/UI handlers found).'); return; }
    const picked = await v.window.showQuickPick(wfs.map((w) => ({ label: w.name, description: `${w.status} · ${w.files} files`, id: w.id })), { canPickMany: true, placeHolder: 'Select workflows to analyze' });
    if (!picked || !picked.length) return;
    const purpose = await askPurpose(ctx, `Analyze ${picked.map((p) => p.label).join(', ')}`);
    if (purpose === undefined) return;
    return runAnalysis(ctx, { mode: 'WORKFLOW', selection: { workflows: picked.map((p) => p.id) }, purpose: purpose || undefined });
  },
  'aiProject.showWorkflow': async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const wfs = (await pm.store.readJson('workflows/index.json', { workflows: [] })).workflows;
    if (!wfs.length) { v.window.showWarningMessage('AI Project: no workflows found.'); return; }
    const pick = await v.window.showQuickPick(wfs.map((w) => ({ label: w.name, description: w.status, id: w.id })), { placeHolder: 'Show workflow' });
    if (!pick) return;
    await pm.documentation.updateAll();
    const md = await pm.documentation.read(`workflows/${pick.id}`);
    const doc = await v.workspace.openTextDocument({ language: 'markdown', content: md || '# Workflow not documented yet' });
    await v.commands.executeCommand('markdown.showPreview', doc.uri).then(undefined, () => v.window.showTextDocument(doc));
  },
});
