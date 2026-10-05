const { requirePm } = require('./common');

module.exports = (ctx) => ({
  'aiProject.disconnectChrome': async () => {
    const v = ctx.vscode;
    const pm = requirePm(ctx);
    const pick = await v.window.showQuickPick([{ label: 'Disconnect', id: 'keep', description: 'Chrome can reconnect without pairing again' }, { label: 'Disconnect and forget pairing', id: 'revoke', description: 'Chrome must be paired again' }, { label: 'Stop bridge', id: 'stop', description: 'Stop listening on the local port' }], { placeHolder: 'Chrome connection' });
    if (!pick) return;
    if (pick.id === 'stop') await pm.bridge.stop(); else await pm.bridge.disconnect({ revoke: pick.id === 'revoke' });
    v.window.showInformationMessage('AI Project: Chrome disconnected. Progress of running analyses is saved.');
    ctx.refresh();
  },
});
