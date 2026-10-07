const { requireProject } = require('./common');

module.exports = (ctx) => ({
  'aiProject.continueAnalysis': async () => {
    const v = ctx.vscode;
    const pm = requireProject(ctx);
    const c = await pm.campaign.progress();
    if (!c) { v.window.showInformationMessage('AI Project: nothing to continue. Start an analysis of the whole project or a folder first.'); return null; }
    if (c.status === 'DONE') { v.window.showInformationMessage(`AI Project: the last automatic analysis is complete (${c.total} files).${c.notAnalyzed ? ` ${c.notAnalyzed} file(s) could not be analyzed; run the analysis again to retry them.` : ''}`); return null; }
    if (!pm.bridge.activeConnection()) { v.window.showWarningMessage('AI Project: Chrome is not connected. Pair or reconnect Chrome; an active automatic analysis then continues by itself.'); return null; }
    const snap = await pm.campaign.resume();
    ctx.refresh(); ctx.host.openPanel('active');
    v.window.showInformationMessage(`AI Project: continuing from where it stopped (${c.cursor} of ${c.total} files done).`);
    return snap;
  },
  'aiProject.stopCampaign': async () => {
    const pm = requireProject(ctx);
    const c = await pm.campaign.stop();
    ctx.refresh();
    if (c) ctx.vscode.window.showInformationMessage(`AI Project: automatic analysis stopped at ${c.cursor} of ${c.queue.length} files. "AI Project: Continue Analysis" picks it up from there.`);
    return c;
  },
});
