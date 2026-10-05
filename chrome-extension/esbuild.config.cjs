const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');
const base = { bundle: true, sourcemap: true, logLevel: 'info', platform: 'browser', format: 'iife', target: 'chrome116', loader: { '.js': 'jsx', '.jsx': 'jsx' }, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' } };

const targets = [
  { ...base, entryPoints: { background: 'src/background/serviceWorker.js' }, outdir: 'dist' },
  { ...base, entryPoints: { 'content-chatgpt': 'src/content/chatgpt.js', 'content-claude': 'src/content/claude.js', 'content-gemini': 'src/content/gemini.js', 'content-generic': 'src/content/genericAI.js' }, outdir: 'dist' },
  { ...base, entryPoints: { panel: 'src/ui/index.jsx' }, outdir: 'dist' },
];

(async () => {
  for (const t of targets) {
    if (watch) { const ctx = await esbuild.context(t); await ctx.watch(); } else await esbuild.build(t);
  }
})().catch(() => process.exit(1));
