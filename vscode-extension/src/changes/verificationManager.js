// Detects project verification commands from manifests (never assumes `npm test`) and runs them.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const WANTED = [
  { kind: 'test', re: /^(test|tests|test:unit|unit|test:ci)$/ },
  { kind: 'lint', re: /^(lint|lint:ci|eslint)$/ },
  { kind: 'typecheck', re: /^(typecheck|type-check|tsc|check-types|types)$/ },
  { kind: 'build', re: /^(build|compile|build:prod)$/ },
];
const PLACEHOLDER = /no test specified|echo\s+["']?error/i;

async function exists(p) { try { await fs.promises.access(p); return true; } catch { return false; } }

async function packageManager(dir) {
  if (await exists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await exists(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (await exists(path.join(dir, 'bun.lockb'))) return 'bun';
  return 'npm';
}

// scripts: { 'package.json': {test:'jest'}, 'web/package.json': {...} } from the project scan
async function detectCommands(root, scripts = {}) {
  const out = [];
  for (const [manifest, s] of Object.entries(scripts)) {
    const dir = path.join(root, path.posix.dirname(manifest) === '.' ? '' : path.posix.dirname(manifest));
    const pm = await packageManager(dir);
    for (const [name, body] of Object.entries(s)) {
      const w = WANTED.find((x) => x.re.test(name));
      if (!w || PLACEHOLDER.test(String(body))) continue;
      out.push({ kind: w.kind, label: `${pm} run ${name}`, command: pm, args: pm === 'npm' && name === 'test' ? ['test'] : ['run', name], cwd: path.posix.dirname(manifest) === '.' ? '' : path.posix.dirname(manifest), source: `${manifest} scripts.${name}` });
    }
  }
  const composer = path.join(root, 'composer.json');
  if (await exists(composer)) {
    try {
      const c = JSON.parse(await fs.promises.readFile(composer, 'utf8'));
      for (const [name] of Object.entries(c.scripts || {})) { const w = WANTED.find((x) => x.re.test(name)); if (w) out.push({ kind: w.kind, label: `composer run ${name}`, command: 'composer', args: ['run', name], cwd: '', source: `composer.json scripts.${name}` }); }
    } catch { /* invalid composer.json: nothing detected */ }
  }
  const make = path.join(root, 'Makefile');
  if (await exists(make)) {
    const t = await fs.promises.readFile(make, 'utf8');
    for (const w of WANTED) { const m = new RegExp(`^(${w.kind}):`, 'm').exec(t); if (m) out.push({ kind: w.kind, label: `make ${w.kind}`, command: 'make', args: [w.kind], cwd: '', source: `Makefile target ${w.kind}` }); }
  }
  const order = { test: 0, lint: 1, typecheck: 2, build: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

const SAFE_ARG = /^[\w:.@/-]+$/;

// On Windows npm/pnpm/yarn are .cmd shims that Node refuses to spawn without a shell, so a shell is used there.
// Arguments come from manifest script names (untrusted text), so anything outside a conservative charset is refused.
function spawnOptions(cmd, cwd, platform = process.platform) {
  const win = platform === 'win32';
  if (win && ![cmd.command, ...cmd.args].every((a) => SAFE_ARG.test(a))) return null;
  return { cwd, env: { ...process.env, CI: '1' }, shell: win, windowsHide: true };
}

function run(root, cmd, { timeoutMs = 10 * 60_000, onOutput } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const cwd = path.join(root, cmd.cwd || '');
    let output = '';
    const opts = spawnOptions(cmd, cwd);
    if (!opts) { resolve({ ...cmd, exitCode: -1, ok: false, output: `Refusing to run ${cmd.label}: script name contains unsupported characters.`, durationMs: 0 }); return; }
    const child = spawn(cmd.command, cmd.args, opts);
    const append = (d) => { const s = d.toString(); output = (output + s).slice(-20000); if (onOutput) onOutput(s); };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => { output += '\n[timed out]'; child.kill('SIGKILL'); }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); resolve({ ...cmd, exitCode: -1, ok: false, output: `Could not start ${cmd.command}: ${err.message}`, durationMs: Date.now() - started }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ ...cmd, exitCode: code, ok: code === 0, output, durationMs: Date.now() - started }); });
  });
}

// Runs detected checks in order; stops at the first failure.
async function runAll(root, commands, opts) {
  const results = [];
  for (const c of commands) {
    const r = await run(root, c, opts);
    results.push(r);
    if (!r.ok) break;
  }
  return { results, ok: results.length > 0 && results.every((r) => r.ok), ran: results.length, detected: commands.length };
}

module.exports = { detectCommands, run, runAll, spawnOptions };
