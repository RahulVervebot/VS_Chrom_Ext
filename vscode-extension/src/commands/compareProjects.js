const path = require('path');
const { requireProject, ensureScanned } = require('./common');
const { loadProjectSummary } = require('../comparison/projectComparator');
const { loadProjectDocuments } = require('../comparison/documentationComparator');
const { listScopeChoices, loadScopedSummary } = require('../comparison/scopedComparator');
const { buildComparisonRequest } = require('../comparison/comparisonManager');
const { MessageType } = require('../bridge/bridgeProtocol');

async function pickOtherProjects(ctx, pm, min, load = loadProjectSummary) {
  const v = ctx.vscode;
  const folders = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: 'Select project folder(s) containing .ai-project (the project root, not .ai-project itself)', title: 'Projects to compare with the open project' });
  if (!folders || folders.length < min) { if (folders) v.window.showWarningMessage(`Select at least ${min} other project.`); return null; }
  const out = [];
  for (const f of folders) {
    try { out.push(await load(f.fsPath, pm.config.get('aiProjectFolder'))); }
    catch (e) { v.window.showWarningMessage(`${path.basename(f.fsPath)}: ${e.message}`); return null; }
  }
  return out;
}

function send(ctx, pm, request) {
  const v = ctx.vscode;
  if (!pm.bridge.activeConnection()) { v.window.showWarningMessage('Chrome is not connected. Run "AI Project: Pair Chrome" first.'); return false; }
  pm.bridge.send(MessageType.COMPARISON_REQUEST, request);
  v.window.showInformationMessage('AI Project: comparison sent to Chrome. The result will be stored in .ai-project/comparisons/. Source code is never modified by comparisons.');
  return true;
}

// Scoped comparison: only the part of each project the user picks is compared (never the whole project).
async function pickFolders(ctx, title) {
  const v = ctx.vscode;
  const folders = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: 'Select project folder(s) (the project root, not .ai-project itself)', title });
  return folders && folders.length ? folders.map((f) => f.fsPath) : null;
}

// which: 'feature' | 'workflow' | 'any'. hint: a name to float to the top (same-named feature in the other project).
async function pickScope(ctx, projectName, choices, { which = 'any', hint = '' } = {}) {
  const v = ctx.vscode;
  const items = [];
  const byHint = (a, b) => (hint && b.name === hint) - (hint && a.name === hint);
  if (which !== 'workflow') items.push(...[...choices.features].sort(byHint).map((f) => ({ label: `Feature: ${f.name}`, description: hint && f.name === hint ? 'same name' : `${f.files} file(s)`, scope: { features: [f.id] } })));
  if (which !== 'feature') items.push(...[...choices.workflows].sort(byHint).map((w) => ({ label: `Workflow: ${w.name}`, description: hint && w.name === hint ? 'same name' : '', scope: { workflows: [w.id] } })));
  items.push({ label: '$(files) Choose files…', description: 'pick the specific files that make up the part to compare', files: true });
  const pick = await v.window.showQuickPick(items, { title: `Which part of "${projectName}" do you want to compare?`, placeHolder: 'Only this part is compared, not the whole project' });
  if (!pick) return null;
  if (!pick.files) return pick.scope;
  const files = await v.window.showQuickPick(choices.files.map((f) => ({ label: f })), { canPickMany: true, matchOnDescription: true, title: `Files of "${projectName}" to compare`, placeHolder: 'Tick the files for this feature' });
  if (!files || !files.length) return null;
  return { files: files.map((x) => x.label) };
}

function scopeFromSelection(sel) {
  const scope = { files: sel.files, folders: sel.folders, features: sel.features, workflows: sel.workflows };
  return Object.values(scope).some((a) => a.length) ? scope : null;
}

module.exports = (ctx) => {
  // useSelection: start from what is selected in the sidebar; otherwise ask which feature/workflow/files of the open project.
  const scoped = (which, useSelection) => async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const folder = pm.config.get('aiProjectFolder');
    const sel = ctx.selection ? ctx.selection.get() : null;
    let mineScope = null;
    if (useSelection && sel) {
      if (sel.project) { v.window.showWarningMessage('AI Project: the entire project is selected. Select the files or feature to compare (or use Compare Projects for whole projects).'); return; }
      mineScope = scopeFromSelection(sel);
      if (!mineScope) { v.window.showWarningMessage('AI Project: nothing is selected. Select the files or feature in the sidebar (Files), then run this again.'); return; }
    }
    const myChoices = await listScopeChoices(pm.root, folder);
    if (!mineScope) mineScope = await pickScope(ctx, pm.project.name, myChoices, { which });
    if (!mineScope) return;
    let mine;
    try { mine = await loadScopedSummary(pm.root, folder, mineScope); } catch (e) { v.window.showWarningMessage(`AI Project: ${e.message}`); return; }
    const hint = (mineScope.features && myChoices.features.find((f) => f.id === mineScope.features[0])) || (mineScope.workflows && myChoices.workflows.find((w) => w.id === mineScope.workflows[0]));
    const dirs = await pickFolders(ctx, `Other project(s) to compare "${mine.scope.label}" with`);
    if (!dirs) return;
    const summaries = [mine];
    for (const d of dirs) {
      try {
        const choices = await listScopeChoices(d, folder);
        const scope = await pickScope(ctx, path.basename(d), choices, { which, hint: hint ? hint.name : '' });
        if (!scope) return;
        summaries.push(await loadScopedSummary(d, folder, scope));
      } catch (e) { v.window.showWarningMessage(`${path.basename(d)}: ${e.message}`); return; }
    }
    const missing = summaries.filter((x) => x.undocumentedFiles.length);
    if (missing.length) v.window.showInformationMessage(`AI Project: ${missing.map((x) => `${x.project.name}: ${x.undocumentedFiles.length} selected file(s) have no generated documentation`).join('; ')}. Analyze them and run "Update Documentation" for a richer comparison; the structure is compared anyway.`);
    return send(ctx, pm, buildComparisonRequest({ kind: which === 'workflow' ? 'WORKFLOW' : 'FEATURE', summaries }));
  };
  const build = (kind, needIds) => async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const mine = await loadProjectSummary(pm.root, pm.config.get('aiProjectFolder'));
    const others = await pickOtherProjects(ctx, pm, 1);
    if (!others) return;
    let ids = [];
    if (needIds) {
      const key = needIds === 'feature' ? 'features' : 'workflows';
      const pick = await v.window.showQuickPick(mine[key].map((x) => ({ label: x.name || x.id, id: x.id })), { placeHolder: `Which ${needIds} of the open project should be compared?` });
      if (!pick) return;
      ids = [pick.id];
    }
    const request = buildComparisonRequest({ kind, summaries: [mine, ...others], ids });
    return send(ctx, pm, request);
  };
  const buildDocs = async () => {
    const pm = await ensureScanned(ctx);
    let mine;
    try { mine = await loadProjectDocuments(pm.root, pm.config.get('aiProjectFolder')); } catch (e) { ctx.vscode.window.showWarningMessage(`AI Project: ${e.message}`); return; }
    const others = await pickOtherProjects(ctx, pm, 1, loadProjectDocuments);
    if (!others) return;
    return send(ctx, pm, buildComparisonRequest({ kind: 'DOCUMENTATION', summaries: [mine, ...others] }));
  };
  return {
    'aiProject.compareDocumentation': buildDocs,
    'aiProject.compareProjects': build('PROJECT'),
    'aiProject.compareSelection': scoped('any', true),
    'aiProject.compareFeatures': scoped('feature', false),
    'aiProject.compareWorkflows': scoped('workflow', false),
    'aiProject.compareDatabases': build('DATABASE'),
  };
};
