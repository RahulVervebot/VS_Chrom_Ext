// Extension entry: wires configuration, project state, bridge, commands and UI. Contains no analysis logic.
const vscode = require('vscode');
const { ConfigManager } = require('./config/configManager');
const { ProjectManager } = require('./core/projectManager');
const { SelectionState } = require('./core/selectionState');
const { collect } = require('./commands');
const { runAnalysis } = require('./commands/common');
const { createRpc } = require('./ui/rpc');
const { WebviewHost } = require('./ui/webviewProvider');
const { toUserMessage } = require('./utils/errors');
const logger = require('./utils/logger');

let pm = null;

async function activate(context) {
  // 1. Configuration + logging
  const out = vscode.window.createOutputChannel('AI Project Intelligence');
  logger.setSink((line) => out.appendLine(line));
  context.subscriptions.push(out);
  const config = new ConfigManager(vscode);
  const selection = new SelectionState(context.workspaceState.get('aiProject.selection'));
  selection.on('changed', () => { context.workspaceState.update('aiProject.selection', selection.get()); host.notifyChanged(); });

  // 2. Workspace detection
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  const host = new WebviewHost({ vscode, extensionUri: context.extensionUri, rpc: null, getPm: () => pm });
  const ctx = { vscode, context, config, out, selection, host, pm: () => pm, refresh: () => host.notifyChanged() };

  const actions = {
    startAnalysis: ({ purpose, intent } = {}) => runAnalysis(ctx, { mode: selection.mode(), selection: selection.get(), purpose, intent }),
    pairChrome: () => vscode.commands.executeCommand('aiProject.pairChrome'),
    connectChrome: () => vscode.commands.executeCommand('aiProject.connectChrome'),
    openFile: async (rel, line) => {
      const uri = vscode.Uri.joinPath(vscode.Uri.file(pm.root), rel);
      const doc = await vscode.workspace.openTextDocument(uri);
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      await vscode.window.showTextDocument(doc, { selection: new vscode.Range(pos, pos) });
    },
    exec: (command, ...args) => vscode.commands.executeCommand(command, ...args),
  };
  const rpc = createRpc({ getPm: () => pm, selection, actions });
  host.rpc = rpc;

  // 3. Load .ai-project if present (never scans unless autoScan is on)
  if (folder) {
    try {
      pm = new ProjectManager({
        root: folder.uri.fsPath,
        config,
        secretStore: context.secrets,
        confirmPairing: async (info) => {
          const pick = await vscode.window.showWarningMessage(`Allow "${info.clientName}" to connect to project "${info.projectName}"?`, { modal: true, detail: `Chrome extension id: ${info.extensionId || 'unknown'}\nOnly approve pairing you started with "AI Project: Pair Chrome".` }, 'Allow');
          return pick === 'Allow';
        },
      });
      await pm.load();
    } catch (err) {
      logger.error('AI-PROJECT', 'failed to load project', { error: err.message });
      vscode.window.showErrorMessage(`AI Project: ${toUserMessage(err)}`);
    }
  }

  // 4. Status bar + live refresh
  const startItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 51);
  startItem.text = '$(rocket) AI Project';
  startItem.tooltip = 'AI Project Intelligence: guided steps (set up, scan, choose files, connect Chrome, analyze)';
  startItem.command = 'aiProject.start';
  context.subscriptions.push(startItem);
  if (folder) startItem.show();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = 'aiProject.showChromeStatus';
  context.subscriptions.push(status);
  const renderStatus = () => {
    if (!pm || !pm.isInitialized()) { status.hide(); return; }
    const s = pm.bridge.getStatus();
    const icon = { CONNECTED: '$(plug)', PAIRING: '$(sync~spin)', LISTENING: '$(broadcast)', STOPPED: '$(circle-slash)' }[s.state] || '$(circle-slash)';
    status.text = `${icon} AI Project: ${s.state === 'CONNECTED' ? `Chrome${s.provider ? ` · ${s.provider}` : ''}${s.activeAnalysis ? ` · batch ${s.activeAnalysis.batchNumber}/${s.activeAnalysis.totalBatches}` : ''}` : s.state.toLowerCase()}`;
    status.tooltip = 'AI Project Intelligence — Chrome bridge status';
    status.show();
  };
  if (pm) for (const ev of ['changed', 'chrome', 'analysis']) pm.on(ev, () => { host.notifyChanged(); renderStatus(); });
  if (pm) pm.on('changed', (what) => { if (what === 'changes') vscode.window.showInformationMessage('AI Project: Chrome sent a change proposal. Review it before anything is applied.', 'Review').then((p) => p && vscode.commands.executeCommand('aiProject.reviewChanges')); });
  renderStatus();

  // 5. UI
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('aiProject.sidebar', host, { webviewOptions: { retainContextWhenHidden: true } }));

  // 6. Commands (always registered; handlers report a clear message when no folder is open)
  const handlers = collect(ctx);
  for (const [id, fn] of Object.entries(handlers)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, async (...args) => {
      try { return await fn(...args); }
      catch (err) { logger.error('AI-PROJECT', `command ${id} failed`, { error: err.message, code: err.code }); vscode.window.showErrorMessage(`AI Project: ${toUserMessage(err)}`); }
    }));
  }

  // 7. Chrome bridge: only listens automatically if this machine already paired a browser (so it can reconnect).
  if (pm && pm.isInitialized()) {
    pm.bridge.security.listConnections().then((c) => { if (c.length) return pm.bridge.start().then(renderStatus); return null; }).catch((e) => logger.warn('BRIDGE', 'auto-start failed', { error: e.message }));
    if (config.get('autoScan')) pm.scan().catch((e) => logger.warn('ANALYSIS', 'auto scan failed', { error: e.message }));
  }

  // 8. Source watcher: flags that the index may be stale; scans only if autoScan is on.
  if (folder) {
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, '**/*'));
    let t = null;
    const onFs = (uri) => {
      const p = uri.fsPath;
      if (p.includes('/node_modules/') || p.includes('/.git/') || p.includes(`/${config.get('aiProjectFolder')}/`)) return;
      clearTimeout(t);
      t = setTimeout(() => { if (pm && pm.isInitialized() && config.get('autoScan')) pm.scan().catch(() => {}); else host.broadcast('files-changed', {}); }, 3000);
    };
    watcher.onDidChange(onFs); watcher.onDidCreate(onFs); watcher.onDidDelete(onFs);
    context.subscriptions.push(watcher);
  }
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration('aiProject')) host.notifyChanged(); }));

  logger.info('AI-PROJECT', 'activated', { workspace: !!folder, initialized: !!(pm && pm.isInitialized()) });
  return { pm: () => pm }; // exposed for integration tests
}

async function deactivate() {
  if (pm) await pm.bridge.stop();
}

module.exports = { activate, deactivate };
