// Reads aiProject.* settings. vscode is injected so this module stays unit-testable.
const DEFAULTS = {
  provider: 'auto',
  model: '',
  maxTokens: 8000,
  maxFiles: 40, // files per batch
  maxFilesPerAnalysis: 200, // files per analysis run; the rest is picked up by the next run
  maxLinesPerFile: 1500,
  maxTotalLines: 20000,
  maxTokensPerFile: 6000,
  maxTotalTokens: 200000,
  maxDependencyDepth: 2,
  maxWorkflowDepth: 8,
  maxDocumentationDepth: 3,
  excludePatterns: ['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.env', '*.log'],
  autoScan: false,
  autoUpdateDocumentation: false,
  detectSecrets: true,
  aiProjectFolder: '.ai-project',
  saveHistory: true,
  requireApprovalForChanges: true,
  chromeBridgePort: 47821,
  chromeBridgeHost: '127.0.0.1',
};

const PRESETS = {
  'Node.js': ['node_modules', 'dist', 'build', 'coverage', '*.log'],
  React: ['node_modules', 'build', 'dist', 'coverage'],
  'Next.js': ['node_modules', '.next', 'out', 'coverage'],
  Vue: ['node_modules', 'dist', 'coverage'],
  Angular: ['node_modules', 'dist', '.angular', 'coverage'],
  Python: ['__pycache__', '.venv', 'venv', '*.pyc', '.pytest_cache'],
  PHP: ['vendor'],
  Laravel: ['vendor', 'storage', 'bootstrap/cache'],
  WordPress: ['wp-admin', 'wp-includes', 'wp-content/uploads'],
  Java: ['target', 'build', '.gradle', '*.class'],
  '.NET': ['bin', 'obj', 'packages'],
};

class ConfigManager {
  constructor(vscodeApi) {
    this.vscode = vscodeApi || null;
    this.overrides = {};
  }

  get(key) {
    if (key in this.overrides) return this.overrides[key];
    if (this.vscode) {
      const v = this.vscode.workspace.getConfiguration('aiProject').get(key);
      if (v !== undefined) return v;
    }
    return DEFAULTS[key];
  }

  all() {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = this.get(k);
    return out;
  }

  async set(key, value) {
    if (!(key in DEFAULTS)) throw new Error(`Unknown setting: ${key}`);
    if (typeof value !== typeof DEFAULTS[key]) throw new Error(`Setting ${key} expects ${typeof DEFAULTS[key]}`);
    if (this.vscode) {
      await this.vscode.workspace.getConfiguration('aiProject').update(key, value, this.vscode.ConfigurationTarget.Workspace);
    } else {
      this.overrides[key] = value;
    }
  }
}

module.exports = { ConfigManager, DEFAULTS, PRESETS };
