const { requireProject } = require('./common');

module.exports = (ctx) => ({
  'aiProject.resumeAnalysis': async (id) => {
    const v = ctx.vscode;
    const pm = requireProject(ctx);
    let analysisId = typeof id === 'string' ? id : null;
    if (!analysisId) {
      const list = await pm.history.resumable();
      if (!list.length) { v.window.showInformationMessage('AI Project: no interrupted analyses to resume.'); return; }
      const pick = await v.window.showQuickPick(list.map((r) => ({ label: r.analysisId, description: `${r.mode} · ${r.status} · ${r.checkpoints.filter((c) => c.status === 'completed').length}/${r.batches.length} batches done`, detail: r.purpose || '' })), { placeHolder: 'Resume analysis' });
      if (!pick) return;
      analysisId = pick.label;
    }
    const snap = await pm.resumeAnalysis(analysisId);
    v.window.showInformationMessage(`AI Project: resuming ${analysisId} from its last checkpoint (${snap.completedBatches.length}/${snap.totalBatches} batches already complete).`);
    ctx.refresh();
    return snap;
  },
});
