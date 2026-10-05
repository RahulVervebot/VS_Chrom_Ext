const { requirePm, requireProject } = require('./common');

module.exports = (ctx) => {
  async function pair() {
    const v = ctx.vscode;
    const pm = requireProject(ctx);
    const p = await pm.bridge.startPairing();
    const mins = Math.round((new Date(p.expiresAt) - Date.now()) / 60000);
    ctx.refresh();
    const action = await v.window.showInformationMessage(`Pairing code: ${p.code}   (expires in ~${mins} min)`, { detail: `In the Chrome extension (AI Project Bridge → Connection tab) paste this whole code, including the number in front. VS Code listens on ${p.host}:${p.port} (this computer only). You will be asked to confirm the pairing here. Working on several projects? Each VS Code window gets its own code; pairing Chrome to one pauses the other.` }, 'Copy code');
    if (action === 'Copy code') await v.env.clipboard.writeText(p.code);
    return { expiresAt: p.expiresAt, host: p.host, port: p.port, token: p.token, code: p.code };
  }
  return {
    'aiProject.pairChrome': pair,
    'aiProject.connectChrome': async () => {
      const v = ctx.vscode;
      const pm = requireProject(ctx);
      const paired = await pm.bridge.security.listConnections();
      if (!paired.length) { const pick = await v.window.showInformationMessage('No Chrome extension has been paired with this machine yet.', 'Pair Chrome'); if (pick) return pair(); return; }
      const st = await pm.bridge.start();
      v.window.showInformationMessage(`AI Project: listening on ${st.host}:${st.port}. Open the Chrome extension and choose Connect; previously paired browsers reconnect automatically.`);
      ctx.refresh();
    },
    'aiProject.showChromeStatus': async () => {
      const v = ctx.vscode;
      const pm = requirePm(ctx);
      const s = pm.bridge.getStatus();
      const lines = [`State: ${s.state}`, `Provider: ${s.provider || '—'}`, `Session: ${s.sessionId || '—'}`, `Project: ${s.projectId || '—'}`, s.activeAnalysis ? `Analysis: ${s.activeAnalysis.analysisId} — batch ${s.activeAnalysis.batchNumber}/${s.activeAnalysis.totalBatches} (${s.activeAnalysis.status})` : 'Analysis: none'];
      const pick = await v.window.showInformationMessage(`Chrome bridge: ${s.state}`, { detail: lines.join('\n') }, 'Open panel');
      if (pick) ctx.host.openPanel('connection');
    },
  };
};
