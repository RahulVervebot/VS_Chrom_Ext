const { PRESETS } = require('../config/configManager');
const { requirePm } = require('./common');

module.exports = (ctx) => ({
  'aiProject.configureExclusions': async () => {
    const v = ctx.vscode;
    const pm = requirePm(ctx);
    const current = pm.config.get('excludePatterns');
    const mode = await v.window.showQuickPick([
      { label: 'Add preset…', id: 'preset', description: Object.keys(PRESETS).join(', ') },
      { label: 'Add pattern…', id: 'pattern', description: 'file, folder, extension or glob' },
      { label: 'Remove patterns…', id: 'remove', description: `${current.length} active` },
    ], { placeHolder: 'Configure exclusions (excluded files are never scanned or sent)' });
    if (!mode) return;
    let next = current;
    if (mode.id === 'preset') {
      const picked = await v.window.showQuickPick(Object.entries(PRESETS).map(([k, p]) => ({ label: k, description: p.join(', ') })), { canPickMany: true });
      if (!picked) return;
      next = [...new Set([...current, ...picked.flatMap((p) => PRESETS[p.label])])];
    } else if (mode.id === 'pattern') {
      const p = await v.window.showInputBox({ prompt: 'Pattern (e.g. legacy/, *.generated.js, src/vendor)', ignoreFocusOut: true });
      if (!p) return;
      next = [...new Set([...current, p.trim()])];
    } else {
      const picked = await v.window.showQuickPick(current.map((c) => ({ label: c })), { canPickMany: true, placeHolder: 'Select patterns to remove' });
      if (!picked) return;
      next = current.filter((c) => !picked.some((p) => p.label === c));
    }
    await pm.config.set('excludePatterns', next);
    v.window.showInformationMessage(`AI Project: ${next.length} exclusion pattern(s) active. Re-scan to apply.`);
    ctx.refresh();
  },
});
