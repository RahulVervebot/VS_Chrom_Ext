// Serves the built webview against the REAL rpc + ProjectManager (fixture project), so the React UI can be exercised in Chrome.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ProjectManager } = require('../../src/core/projectManager');
const { ConfigManager } = require('../../src/config/configManager');
const { SelectionState } = require('../../src/core/selectionState');
const { createRpc } = require('../../src/ui/rpc');
const { tempProject } = require('../helpers');
const logger = require('../../src/utils/logger');

const DIST = path.join(__dirname, '../../dist');
const MEDIA = path.join(__dirname, '../../media');

async function start({ fresh = false } = {}) {
  logger.setSink(() => {});
  const root = tempProject();
  const config = new ConfigManager();
  await config.set('chromeBridgePort', 0);
  const pm = new ProjectManager({ root, config, confirmPairing: async () => true });
  await pm.load();
  if (!fresh) { await pm.initialize('Shop'); await pm.scan(); await pm.documentation.updateAll(); }
  const selection = new SelectionState();
  const calls = [];
  const actions = {
    startAnalysis: async (a) => { calls.push(['startAnalysis', a]); return {}; },
    pairChrome: async () => { const p = await pm.bridge.startPairing(); return { token: p.token, code: p.code, port: p.port, expiresAt: p.expiresAt }; },
    connectChrome: async () => pm.bridge.start(),
    openFile: async (p, l) => { calls.push(['openFile', p, l]); },
    exec: async (c, ...a) => { calls.push(['exec', c, ...a]); },
  };
  const rpc = createRpc({ getPm: () => pm, selection, actions });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/rpc') {
      let body = ''; for await (const c of req) body += c;
      const { method, params } = JSON.parse(body);
      try { res.end(JSON.stringify({ result: await rpc.call(method, params) })); } catch (e) { res.end(JSON.stringify({ error: { message: e.message, code: e.code } })); }
      return;
    }
    const file = { '/webview.js': path.join(DIST, 'webview.js'), '/webview.css': path.join(DIST, 'webview.css'), '/styles.css': path.join(MEDIA, 'styles.css') }[url.pathname];
    if (file) { res.setHeader('content-type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(fs.readFileSync(file)); return; }
    const compact = url.searchParams.get('compact') === '1';
    // Minimal VS Code theme variables (dark) so the UI renders like it would in the editor.
    const theme = ':root{--vscode-foreground:#ccc;--vscode-editor-background:#1e1e1e;--vscode-sideBar-background:#252526;--vscode-panel-border:#3c3c3c;--vscode-font-family:-apple-system,Segoe UI,sans-serif;--vscode-font-size:13px;--vscode-editor-font-family:Menlo,monospace;--vscode-button-background:#0e639c;--vscode-button-foreground:#fff;--vscode-button-secondaryBackground:#3a3d41;--vscode-button-secondaryForeground:#fff;--vscode-input-background:#3c3c3c;--vscode-input-foreground:#ccc;--vscode-list-hoverBackground:#2a2d2e;--vscode-list-activeSelectionBackground:#094771;--vscode-list-activeSelectionForeground:#fff;--vscode-textLink-foreground:#3794ff;--vscode-badge-background:#4d4d4d;--vscode-badge-foreground:#fff;--vscode-textCodeBlock-background:#0a0a0a80;--vscode-editorWidget-background:#252526;--vscode-testing-iconPassed:#73c991;--vscode-errorForeground:#f48771;--vscode-editorWarning-foreground:#cca700;--vscode-descriptionForeground:#9d9d9d}';
    res.setHeader('content-type', 'text/html');
    res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>${theme}</style><link href="/styles.css" rel="stylesheet"><link href="/webview.css" rel="stylesheet"></head><body data-compact="${compact}"><div id="root"></div>
<script>
window.acquireVsCodeApi = () => ({ postMessage: async (m) => { if (m.type !== 'request') return; const r = await fetch('/rpc', { method: 'POST', body: JSON.stringify(m) }).then((x) => x.json()); window.postMessage(r.error ? { type: 'response', id: m.id, error: r.error } : { type: 'response', id: m.id, result: r.result }, '*'); } });
</script><script src="/webview.js"></script></body></html>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { pm, root, selection, calls, url: `http://127.0.0.1:${server.address().port}/`, close: async () => { await pm.bridge.stop(); server.close(); } };
}

module.exports = { start };
