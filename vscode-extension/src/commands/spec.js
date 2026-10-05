const path = require('path');
const { ensureScanned } = require('./common');
const { exportSpec } = require('../spec/specStore');
const { buildSpec } = require('../spec/specBuilder');
const { renderSpec } = require('../spec/specRenderer');
const { compareSpecs, matrixText } = require('../spec/specComparator');
const { storeSpecComparison } = require('../comparison/comparisonManager');
const { MessageType } = require('../bridge/bridgeProtocol');

const SPEC_CHARS = 24000; // per project sent to the AI; the full file is always on disk

module.exports = (ctx) => {
  const folderOf = (pm) => pm.config.get('aiProjectFolder');

  async function exportCmd() {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const r = await exportSpec(pm.store, pm.root, folderOf(pm));
    const abs = path.join(pm.store.dir, r.textPath);
    ctx.refresh();
    const note = r.spec.coverage.status === 'COMPLETE' ? '' : ` Only ${r.spec.coverage.filesAnalyzed} of ${r.spec.coverage.filesTotal} files are AI-analysed so far; unknown parts are marked.`;
    const pick = await v.window.showInformationMessage(`AI Project: project specification written to ${folderOf(pm)}/${r.textPath}.${note}`, 'Open', 'Copy to clipboard', 'Show in folder');
    if (pick === 'Open') await v.window.showTextDocument(await v.workspace.openTextDocument(v.Uri.file(abs)));
    if (pick === 'Copy to clipboard') { await v.env.clipboard.writeText(r.text); v.window.showInformationMessage('AI Project: specification copied. Paste it into ChatGPT, Claude or Gemini.'); }
    if (pick === 'Show in folder') await v.commands.executeCommand('revealFileInOS', v.Uri.file(abs));
    return r;
  }

  async function pickProjects() {
    const v = ctx.vscode;
    const folders = await v.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: true, openLabel: 'Compare with this project', title: 'Project(s) to compare with the open project (the project folder, not .ai-project)' });
    return folders && folders.length ? folders.map((f) => f.fsPath) : null;
  }

  async function compare(withAi) {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const dirs = await pickProjects();
    if (!dirs) return;
    let mine; const others = [];
    try {
      mine = await exportSpec(pm.store, pm.root, folderOf(pm)); // refresh own spec first so the comparison is current
      for (const d of dirs) others.push({ dir: d, spec: await buildSpec(d, folderOf(pm)) });
    } catch (e) { v.window.showWarningMessage(`AI Project: ${e.message}`); return; }
    const matrices = others.map((o) => compareSpecs(mine.spec, o.spec));
    const rec = await storeSpecComparison(pm.store, { matrices });
    ctx.refresh();
    await ctx.host.openPanel('compare');
    if (!withAi) { v.window.showInformationMessage(`AI Project: compared ${mine.spec.project.name} with ${others.map((o) => o.spec.project.name).join(', ')}. Use "Ask AI to analyze" for an explanation and blueprint advice.`); return rec; }
    if (!pm.bridge.activeConnection()) { v.window.showWarningMessage('AI Project: the instant comparison is saved, but Chrome is not connected, so the AI analysis was not requested. Run "AI Project: Pair Chrome" and try again.'); return rec; }
    const clip = (t) => (t.length > SPEC_CHARS ? `${t.slice(0, SPEC_CHARS)}\n[… truncated for the AI; the full specification is in the project folder]` : t);
    const projects = [{ project: { projectId: mine.spec.project.projectId, name: mine.spec.project.name }, coverage: mine.spec.coverage, specText: clip(mine.text) }, ...others.map((o) => ({ project: { projectId: o.spec.project.projectId, name: o.spec.project.name }, coverage: o.spec.coverage, specText: clip(renderSpec(o.spec).text) }))];
    pm.bridge.send(MessageType.COMPARISON_REQUEST, {
      kind: 'SPEC', projects, ref: rec.comparisonId, selection: [],
      structural: { comparisonText: matrices.map((m) => matrixText(m, 25)).join('\n\n'), totals: matrices.map((m) => ({ a: m.a.name, b: m.b.name, ...m.totals })) },
      instructions: { noScoring: true, noRanking: true, recordConflicts: true, useEvidenceLabels: true },
    });
    v.window.showInformationMessage('AI Project: comparison saved and sent to Chrome. Approve it on the Compare tab in the Chrome side panel; the AI analysis will appear next to the instant comparison.');
    return rec;
  }

  return {
    'aiProject.exportSpec': exportCmd,
    'aiProject.compareSpec': () => compare(false),
    'aiProject.compareSpecWithAi': () => compare(true),
  };
};
