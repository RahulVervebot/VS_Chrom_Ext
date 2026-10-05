// Hosts the React app in the sidebar (WebviewView) and in a full editor tab (WebviewPanel).
const crypto = require('crypto');

function nonce() { return crypto.randomBytes(16).toString('base64'); }

class WebviewHost {
  constructor({ vscode, extensionUri, rpc, getPm }) {
    this.vscode = vscode;
    this.extensionUri = extensionUri;
    this.rpc = rpc;
    this.getPm = getPm;
    this.views = new Set();
    this.panel = null;
    this.timer = null;
    this.initialPage = null;
  }

  html(webview, compact) {
    const v = this.vscode;
    const n = nonce();
    const script = webview.asWebviewUri(v.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const css = webview.asWebviewUri(v.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));
    const appCss = webview.asWebviewUri(v.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'));
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${n}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="${css}" rel="stylesheet"><link href="${appCss}" rel="stylesheet"><title>AI Project Intelligence</title></head>
<body data-compact="${compact ? 'true' : 'false'}"><div id="root"></div><script nonce="${n}" src="${script}"></script></body></html>`;
  }

  attach(webview, compact) {
    const v = this.vscode;
    webview.options = { enableScripts: true, localResourceRoots: [v.Uri.joinPath(this.extensionUri, 'dist'), v.Uri.joinPath(this.extensionUri, 'media')] };
    webview.html = this.html(webview, compact);
    const sub = webview.onDidReceiveMessage(async (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'ready') { if (this.initialPage) webview.postMessage({ type: 'event', name: 'navigate', data: { page: this.initialPage } }); return; }
      if (msg.type !== 'request' || typeof msg.id !== 'number') return;
      try { webview.postMessage({ type: 'response', id: msg.id, result: await this.rpc.call(msg.method, msg.params) }); }
      catch (err) { webview.postMessage({ type: 'response', id: msg.id, error: { message: err.message, code: err.code } }); }
    });
    const entry = { webview, sub };
    this.views.add(entry);
    return entry;
  }

  resolveWebviewView(view) {
    const entry = this.attach(view.webview, true);
    view.onDidDispose(() => { entry.sub.dispose(); this.views.delete(entry); });
  }

  openPanel(page) {
    const v = this.vscode;
    this.initialPage = page || null;
    if (this.panel) { this.panel.reveal(); if (page) this.broadcast('navigate', { page }); return; }
    this.panel = v.window.createWebviewPanel('aiProject.dashboard', 'AI Project Intelligence', v.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
    const entry = this.attach(this.panel.webview, false);
    this.panel.onDidDispose(() => { entry.sub.dispose(); this.views.delete(entry); this.panel = null; });
  }

  broadcast(name, data) { for (const { webview } of this.views) webview.postMessage({ type: 'event', name, data }); }

  // Coalesces bursts of events into one refresh.
  notifyChanged() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.broadcast('state-changed', {}); }, 150);
  }
}

module.exports = { WebviewHost };
