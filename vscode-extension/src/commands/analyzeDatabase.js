const { ensureScanned, runAnalysis, askPurpose } = require('./common');

module.exports = (ctx) => ({
  'aiProject.analyzeDatabase': async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const ents = (await pm.store.readJson('database/entities.json', { entities: [] })).entities;
    if (!ents.length) { v.window.showWarningMessage('AI Project: no database entities were found in source (no SQL schema, ORM models or collections).'); return; }
    const picked = await v.window.showQuickPick([{ label: '$(database) All entities', id: '*' }, ...ents.map((e) => ({ label: e.name, description: `${e.kind} · ${e.source}` }))], { canPickMany: true, placeHolder: 'Select database entities to analyze' });
    if (!picked || !picked.length) return;
    const all = picked.some((p) => p.id === '*');
    const purpose = await askPurpose(ctx, 'Relationships, queries and data flow');
    if (purpose === undefined) return;
    return runAnalysis(ctx, { mode: 'DATABASE', selection: { entities: all ? ents.map((e) => e.name) : picked.map((p) => p.label) }, purpose: purpose || undefined });
  },
  'aiProject.showDatabaseFlow': async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    await pm.documentation.updateAll();
    const md = (await pm.documentation.read('database/overview')) || (await pm.store.readText('architecture/data-flow.md', null));
    if (!md) { v.window.showInformationMessage('AI Project: no database information found in source.'); return; }
    const doc = await v.workspace.openTextDocument({ language: 'markdown', content: md });
    await v.commands.executeCommand('markdown.showPreview', doc.uri).then(undefined, () => v.window.showTextDocument(doc));
  },
});
