const { ensureScanned, runAnalysis } = require('./common');

module.exports = (ctx) => {
  const flow = (intent, prompt) => async (uri) => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    if (uri && uri.fsPath && ctx.selection.isEmpty()) { const { toRel } = require('./common'); ctx.selection.add('files', [toRel(ctx, uri)]); }
    if (ctx.selection.isEmpty()) { await v.commands.executeCommand('aiProject.selectFiles'); if (ctx.selection.isEmpty()) return; }
    const change = await v.window.showInputBox({ prompt, placeHolder: 'e.g. Reject orders with negative quantities', ignoreFocusOut: true });
    if (!change) return;
    return runAnalysis(ctx, { mode: ctx.selection.mode(), selection: ctx.selection.get(), purpose: `${intent === 'CHANGE_PLAN' ? 'Change plan' : 'Change impact'}: ${change}`, intent });
  };
  return {
    'aiProject.analyzeChange': flow('CHANGE_IMPACT', 'Describe the change to analyze (impact only; nothing is modified)'),
    'aiProject.generateChangePlan': flow('CHANGE_PLAN', 'Describe the change to plan (the AI may return a proposal; you review the diff before anything is applied)'),
  };
};
