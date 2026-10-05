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
async function runAnalysis(ctx, { mode, selection, purpose, intent }) {
  const v = ctx.vscode;
  const pm = await ensureScanned(ctx);
  const prepared = await progress(ctx, 'AI Project: preparing context…', () => pm.prepareAnalysis({ mode, selection, purpose, intent }));
  if (!prepared.stats.includedFiles) { v.window.showWarningMessage(`Nothing to analyze. ${prepared.stats.notes.join(' ')}`.trim()); return null; }
  if (!(await confirmSend(ctx, prepared, { provider: pm.config.get('provider'), purpose }))) return null;
  if (!pm.bridge.activeConnection()) {
    const pick = await v.window.showWarningMessage('Chrome is not connected.', 'Pair Chrome', 'Cancel');
    if (pick !== 'Pair Chrome') return null;
    await v.commands.executeCommand('aiProject.pairChrome');
    v.window.showInformationMessage('Finish pairing in Chrome, then run the analysis command again.');
    return null;
  }
  const snap = await pm.startAnalysis({ mode, selection, purpose, intent });
  v.window.showInformationMessage(`${snap.analysisId} sent to Chrome (${snap.totalBatches} batch${snap.totalBatches === 1 ? '' : 'es'}). Confirm it in the Chrome extension.`);
  ctx.host.openPanel('active');
  return snap;
}

async function askPurpose(ctx, placeHolder, value) {
  return ctx.vscode.window.showInputBox({ prompt: 'What should the AI focus on? (optional)', placeHolder, value, ignoreFocusOut: true });
}

module.exports = { requirePm, requireProject, progress, ensureScanned, toRel, confirmSend, runAnalysis, askPurpose, fmt };
