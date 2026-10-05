const path = require('path');
const { requirePm, progress } = require('./common');

module.exports = (ctx) => ({
  'aiProject.initializeProject': async () => {
    const v = ctx.vscode;
    const pm = requirePm(ctx);
    if (pm.isInitialized()) {
      v.window.showInformationMessage(`AI Project: loaded existing project intelligence "${pm.project.name}" (${pm.project.projectId}). Nothing was changed.`);
      return pm.project;
    }
    const name = await v.window.showInputBox({ prompt: 'Project name', value: path.basename(pm.root), ignoreFocusOut: true });
    if (!name) return null;
    const { project } = await pm.initialize(name);
    v.window.showInformationMessage(`AI Project: created ${pm.config.get('aiProjectFolder')}/ for "${project.name}".`);
    if (pm.config.get('autoScan')) await progress(ctx, 'AI Project: scanning…', () => pm.scan());
    ctx.refresh();
    return project;
  },
});
