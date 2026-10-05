const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const common = { bundle: true, sourcemap: true, logLevel: 'info' };

const targets = [
  {
    ...common,
    entryPoints: ['src/extension.js'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
  },
  {
    ...common,
    entryPoints: ['src/ui/index.jsx'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    loader: { '.js': 'jsx', '.jsx': 'jsx' },
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
  },
];

(async () => {
  for (const t of targets) {
    if (watch) {
      const ctx = await esbuild.context(t);
      await ctx.watch();
    } else {
      await esbuild.build(t);
    }
  }
})().catch(() => process.exit(1));
