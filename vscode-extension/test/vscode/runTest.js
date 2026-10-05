// Launches the locally installed VS Code with this extension loaded and runs suite.js inside the real extension host.
const path = require('path');
const { runTests } = require('@vscode/test-electron');
const { tempProject } = require('../helpers');

// If launched from inside another VS Code (integrated terminal), inherited variables would attach the test instance to it.
for (const k of Object.keys(process.env)) if (k.startsWith('VSCODE_') || k === 'ELECTRON_RUN_AS_NODE' || k.startsWith('ELECTRON_')) delete process.env[k];

(async () => {
  const workspace = tempProject();
  try {
    await runTests({
      vscodeExecutablePath: process.env.AIPI_VSCODE_PATH || ({ darwin: '/Applications/Visual Studio Code.app/Contents/MacOS/Code', win32: path.join(process.env.LOCALAPPDATA || '', 'Programs/Microsoft VS Code/Code.exe'), linux: '/usr/share/code/code' })[process.platform],
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, 'suite.js'),
      launchArgs: [workspace, '--disable-extensions', '--disable-workspace-trust', '--user-data-dir', path.join(require('os').tmpdir(), 'aipi-vscode-user'), '--extensions-dir', path.join(require('os').tmpdir(), 'aipi-vscode-ext')],
      extensionTestsEnv: { AIPI_WORKSPACE: workspace },
    });
  } catch (err) {
    console.error('Extension host tests failed:', err.message);
    process.exit(1);
  }
})();
