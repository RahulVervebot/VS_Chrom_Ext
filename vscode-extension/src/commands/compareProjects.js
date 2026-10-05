const path = require('path');
const { requireProject, ensureScanned } = require('./common');
const { loadProjectSummary } = require('../comparison/projectComparator');
const { buildComparisonRequest } = require('../comparison/comparisonManager');
const { MessageType } = require('../bridge/bridgeProtocol');

async function pickOtherProjects(ctx, pm, min) {
  const v = ctx.vscode;
  const folders = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: 'Select project folder(s) containing .ai-project', title: 'Projects to compare with the open project' });
  if (!folders || folders.length < min) { if (folders) v.window.showWarningMessage(`Select at least ${min} other project.`); return null; }
  const out = [];
  for (const f of folders) {
    try { out.push(await loadProjectSummary(f.fsPath, pm.config.get('aiProjectFolder'))); }
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

module.exports = (ctx) => {
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
  return {
    'aiProject.compareProjects': build('PROJECT'),
    'aiProject.compareFeatures': build('FEATURE', 'feature'),
    'aiProject.compareWorkflows': build('WORKFLOW', 'workflow'),
    'aiProject.compareDatabases': build('DATABASE'),
  };
};
