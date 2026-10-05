const { ensureScanned } = require('./common');
const { detectCommands, runAll } = require('../changes/verificationManager');

module.exports = (ctx) => ({
  'aiProject.verifyProject': async () => {
    const v = ctx.vscode;
    const pm = await ensureScanned(ctx);
    const cmds = await detectCommands(pm.root, pm.scanResult.packages.commands.scripts);
    if (!cmds.length) { v.window.showInformationMessage('AI Project: no test/lint/typecheck/build commands were detected in this project (package.json scripts, composer scripts, Makefile).'); return; }
    const picked = await v.window.showQuickPick(cmds.map((c) => ({ label: c.label, description: `${c.kind} · ${c.source}`, picked: true, cmd: c })), { canPickMany: true, placeHolder: 'Select checks to run' });
    if (!picked || !picked.length) return;
    ctx.out.show(true);
    const res = await v.window.withProgress({ location: v.ProgressLocation.Notification, title: 'AI Project: verifying…' }, () => runAll(pm.root, picked.map((p) => p.cmd), { onOutput: (s) => ctx.out.append(s) }));
    for (const r of res.results) ctx.out.appendLine(`\n[${r.ok ? 'PASS' : 'FAIL'}] ${r.label} (${(r.durationMs / 1000).toFixed(1)}s)`);
    (res.ok ? v.window.showInformationMessage : v.window.showErrorMessage)(res.ok ? `AI Project: all ${res.ran} check(s) passed.` : `AI Project: verification failed at ${res.results[res.results.length - 1].label}.`);
    return res;
  },
});
