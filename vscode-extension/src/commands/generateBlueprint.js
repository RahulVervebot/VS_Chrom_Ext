const path = require('path');
const fs = require('fs');
const { requireProject, ensureScanned } = require('./common');
const { loadProjectSummary } = require('../comparison/projectComparator');
const { buildBlueprintRequest } = require('../generation/blueprintGenerator');
const { planFromBlueprint, createFromBlueprint } = require('../generation/projectGenerator');
const { MessageType } = require('../bridge/bridgeProtocol');
const { buildSpec } = require('../spec/specBuilder');
const { renderSpec } = require('../spec/specRenderer');

module.exports = (ctx) => ({
  'aiProject.generateBlueprint': async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    if (!pm.bridge.activeConnection()) { v.window.showWarningMessage('Chrome is not connected. Run "AI Project: Pair Chrome" first.'); return; }
    const summaries = [await loadProjectSummary(pm.root, pm.config.get('aiProjectFolder'))];
    const more = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: 'Add reference project(s)', title: 'Optional: other projects (with .ai-project) to draw from' });
    for (const f of more || []) { try { summaries.push(await loadProjectSummary(f.fsPath, pm.config.get('aiProjectFolder'))); } catch (e) { v.window.showWarningMessage(`${path.basename(f.fsPath)}: ${e.message}`); return; } }
    const src = await v.window.showQuickPick([{ label: 'Type requirements', id: 'type' }, { label: 'Use a Markdown/text file', id: 'file' }], { placeHolder: 'Requirements for the new project' });
    if (!src) return;
    let requirements;
    if (src.id === 'type') requirements = await v.window.showInputBox({ prompt: 'Describe the project you want to plan', ignoreFocusOut: true });
    else { const f = await v.window.showOpenDialog({ canSelectMany: false, filters: { Text: ['md', 'txt'] } }); if (f && f[0]) requirements = (await fs.promises.readFile(f[0].fsPath, 'utf8')).slice(0, 20000); }
    if (!requirements) return;
    // The full specification of every reference project goes with the request, plus the gaps from the latest comparison that involved them.
    const specs = [];
    const dirs = [pm.root, ...(more || []).map((f) => f.fsPath)];
    for (const d of dirs) { try { const sp = await buildSpec(d, pm.config.get('aiProjectFolder')); const t = renderSpec(sp).text; specs.push({ project: sp.project.name, specText: t.length > 24000 ? `${t.slice(0, 24000)}\n[… truncated for the AI]` : t }); } catch { /* summaries are still sent */ } }
    let gaps = [];
    for (const n of (await pm.store.listDir('comparisons')).filter((x) => x.endsWith('.json')).sort().reverse()) {
      const c = await pm.store.readJson(`comparisons/${n}`, null);
      if (c && c.kind === 'SPEC' && c.matrices) { gaps = c.matrices.flatMap((m) => m.suggestions.map((s) => ({ direction: s.direction, area: s.area, title: s.title, items: s.items }))); break; }
    }
    const req = buildBlueprintRequest({ summaries, requirements, specs, gaps });
    pm.bridge.send(MessageType.BLUEPRINT_REQUEST, req);
    v.window.showInformationMessage('AI Project: blueprint requested. It will be saved to .ai-project/generation/project-blueprint.json. Blueprints are plans; they never modify source code.');
  },
  'aiProject.createFromBlueprint': async () => {
    const v = ctx.vscode;
    const pm = requireProject(ctx);
    const record = await pm.store.readJson('generation/project-blueprint.json', null);
    if (!record) { v.window.showWarningMessage('AI Project: no blueprint yet. Run "Generate Project Blueprint".'); return; }
    let plan;
    try { plan = planFromBlueprint(record); } catch (e) { v.window.showErrorMessage(e.message); return; }
    if (!plan.entries.length) { v.window.showWarningMessage('The blueprint has no folder structure to create.'); return; }
    const target = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Create project here (must be empty)' });
    if (!target || !target[0]) return;
    const ok = await v.window.showWarningMessage(`Create ${plan.entries.length} folder(s)/file(s) in ${path.basename(target[0].fsPath)}?`, { modal: true, detail: `${plan.note}\nNo existing project is modified.` }, 'Create');
    if (ok !== 'Create') return;
    try { const r = await createFromBlueprint(plan, target[0].fsPath, record); v.window.showInformationMessage(`AI Project: created ${r.created} entries.`); } catch (e) { v.window.showErrorMessage(e.message); }
  },
});
