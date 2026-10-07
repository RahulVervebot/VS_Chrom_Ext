// Shared helpers for command modules. `ctx` is built in extension.js.
const path = require('path');
const { AiProjectError, ErrorCodes } = require('../utils/errors');

function requirePm(ctx) {
  const pm = ctx.pm();
  if (!pm) throw new AiProjectError(ErrorCodes.NO_WORKSPACE, 'Open a folder or workspace first.');
  return pm;
}

function requireProject(ctx) {
  const pm = requirePm(ctx);
  pm.requireProject();
  return pm;
}

function progress(ctx, title, fn, { cancellable = false } = {}) {
  const v = ctx.vscode;
  return v.window.withProgress({ location: v.ProgressLocation.Notification, title, cancellable }, fn);
}

async function ensureScanned(ctx) {
  const pm = requireProject(ctx);
  if (!pm.analysis) await progress(ctx, 'AI Project: scanning project…', () => pm.scan());
  return pm;
}

// Uri -> project-relative POSIX path, rejecting anything outside the workspace.
function toRel(ctx, uri) {
  const root = requirePm(ctx).root;
  const rel = path.relative(root, uri.fsPath).split(path.sep).join('/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, 'That path is outside the open project.');
  return rel;
}

const fmt = (n) => Number(n).toLocaleString('en-US');

// Privacy summary shown before anything leaves VS Code. Returns true if the user confirms.
async function confirmSend(ctx, prepared, { provider, purpose } = {}) {
  const s = prepared.stats;
  const types = {};
  for (const x of s.secrets) types[x.type] = (types[x.type] || 0) + (x.count || 1);
  const secretLine = s.secretsRedacted ? `Secrets redacted before sending: ${s.secretsRedacted} (${Object.entries(types).map(([t, n]) => `${t} ×${n}`).join(', ')}). Secret values are never sent.` : 'No secrets detected.';
  const lines = [
    `Files: ${fmt(s.includedFiles)} (${fmt(s.selectedFiles)} selected, ${fmt(s.includedFiles - s.selectedFiles)} dependencies/dependents)`,
    s.alreadyAnalyzed ? `Skipped: ${fmt(s.alreadyAnalyzed)} file(s) already analyzed and unchanged.` : null,
    s.waitingForNextRun ? `Waiting for the next run: ${fmt(s.waitingForNextRun)} more file(s) did not fit in this run. Run the analysis again afterwards to continue.` : null,
    `Batches: ${s.batches} · Estimated tokens: ${fmt(s.totalTokens)} (an estimate; provider limits vary)`,
    `AI provider: ${provider && provider !== 'auto' ? provider : 'chosen in Chrome'}`,
    secretLine,
    s.omitted.length ? `Omitted because of configured limits: ${s.omitted.length} file(s).` : null,
    purpose ? `Purpose: ${purpose}` : null,
  ].filter(Boolean);
  const choice = await ctx.vscode.window.showInformationMessage('Send this analysis context to the Chrome extension?', { modal: true, detail: lines.join('\n') }, 'Send');
  return choice === 'Send';
}

// Full flow used by every "Analyze …" command.
// Whole project / folders that do not fit in one run: analysed in as many runs as needed, started automatically one after the other.
async function runCampaign(ctx, { mode, selection, purpose, intent, reanalyze }) {
  const v = ctx.vscode;
  const pm = await ensureScanned(ctx);
  const plan = await pm.campaign.plan({ mode, selection, reanalyze });
  const perRun = Math.max(1, pm.config.get('maxFilesPerAnalysis') || 200);
  if (plan.queue.length <= perRun) return null; // one run is enough: the normal flow
  const runs = Math.ceil(plan.queue.length / perRun);
  const detail = [`${fmt(plan.queue.length)} file(s) are not analyzed yet${plan.skipped ? ` (${fmt(plan.skipped)} already analyzed and unchanged are skipped)` : ''}.`, `They are analyzed in about ${runs} runs of up to ${fmt(perRun)} files.`, 'You confirm only the first run in Chrome. The next runs start by themselves as soon as the previous one is complete, and a run that stops or fails continues from where it stopped (Retry / Resume).', 'You can stop at any time: Stop in either extension.', purpose ? `Purpose: ${purpose}` : null].filter(Boolean).join('\n');
  const pick = await v.window.showInformationMessage('Analyze everything automatically, run after run?', { modal: true, detail }, 'Start automatic analysis', 'Only the first run');
  if (!pick) return undefined;
  if (pick === 'Only the first run') return null;
  if (!pm.bridge.activeConnection()) {
    const p = await v.window.showWarningMessage('Chrome is not connected.', 'Pair Chrome', 'Cancel');
    if (p === 'Pair Chrome') { await v.commands.executeCommand('aiProject.pairChrome'); v.window.showInformationMessage('Finish pairing in Chrome, then start the analysis again.'); }
    return undefined;
  }
  const snap = await pm.campaign.start({ mode, selection, purpose, intent, reanalyze });
  v.window.showInformationMessage(`Automatic analysis started: run 1 of about ${runs} sent to Chrome. Confirm it there once; the next runs follow by themselves.`);
  ctx.host.openPanel('active');
  return snap;
}

async function runAnalysis(ctx, { mode, selection, purpose, intent, reanalyze = false, continueUntilDone }) {
  const v = ctx.vscode;
  const pm = await ensureScanned(ctx);
  const broad = mode === 'PROJECT' || mode === 'FOLDER' || (selection && selection.project);
  if ((continueUntilDone === undefined ? pm.config.get('autoContinue') : continueUntilDone) && broad && !(selection && selection.pinnedFiles)) {
    try { const r = await runCampaign(ctx, { mode, selection, purpose, intent, reanalyze }); if (r !== null) return r || null; } catch (e) { if (e.code === 'NOTHING_TO_DO') { /* handled by the normal flow below */ } else throw e; }
  }
  const prepared = await progress(ctx, 'AI Project: preparing context…', () => pm.prepareAnalysis({ mode, selection, purpose, intent, reanalyze }));
  if (!prepared.stats.includedFiles) {
    if (prepared.stats.alreadyAnalyzed) { // a broad selection where every file is already analyzed and unchanged
      const pick = await v.window.showInformationMessage(`All ${fmt(prepared.stats.alreadyAnalyzed)} file(s) in this selection are already analyzed and unchanged, so there is nothing new to send.`, 'Re-analyze them anyway', 'OK');
      if (pick === 'Re-analyze them anyway') return runAnalysis(ctx, { mode, selection, purpose, intent, reanalyze: true });
      return null;
    }
    v.window.showWarningMessage(`Nothing to analyze. ${prepared.stats.notes.join(' ')}`.trim());
    return null;
  }
  if (!(await confirmSend(ctx, prepared, { provider: pm.config.get('provider'), purpose }))) return null;
  if (!pm.bridge.activeConnection()) {
    const pick = await v.window.showWarningMessage('Chrome is not connected.', 'Pair Chrome', 'Cancel');
    if (pick !== 'Pair Chrome') return null;
    await v.commands.executeCommand('aiProject.pairChrome');
    v.window.showInformationMessage('Finish pairing in Chrome, then run the analysis command again.');
    return null;
  }
  const snap = await pm.startAnalysis({ mode, selection, purpose, intent, reanalyze });
  v.window.showInformationMessage(`${snap.analysisId} sent to Chrome (${snap.totalBatches} batch${snap.totalBatches === 1 ? '' : 'es'}). Confirm it in the Chrome extension.`);
  ctx.host.openPanel('active');
  return snap;
}

async function askPurpose(ctx, placeHolder, value) {
  return ctx.vscode.window.showInputBox({ prompt: 'What should the AI focus on? (optional)', placeHolder, value, ignoreFocusOut: true });
}

module.exports = { runCampaign, requirePm, requireProject, progress, ensureScanned, toRel, confirmSend, runAnalysis, askPurpose, fmt };
