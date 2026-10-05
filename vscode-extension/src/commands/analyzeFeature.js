const { ensureScanned, runAnalysis, askPurpose } = require('./common');

module.exports = (ctx) => ({
  'aiProject.analyzeFeature': async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const feats = (await pm.store.readJson('features/index.json', { features: [] })).features;
    if (!feats.length) { v.window.showWarningMessage('AI Project: no features detected. Select files or a folder instead.'); return; }
    const picked = await v.window.showQuickPick(feats.map((f) => ({ label: f.name, description: `${f.files} files · ${f.apis} APIs`, id: f.id })), { canPickMany: true, placeHolder: 'Select features to analyze' });
    if (!picked || !picked.length) return;
    const purpose = await askPurpose(ctx, `Analyze ${picked.map((p) => p.label).join(', ')}`);
    if (purpose === undefined) return;
    return runAnalysis(ctx, { mode: 'FEATURE', selection: { features: picked.map((p) => p.id) }, purpose: purpose || undefined });
  },
});
