// Creates a disposable copy of the sample project at .sample/shop (only if missing) so trying the extension never modifies test fixtures.
// Reset it with: npm run sample:reset
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../test/fixtures/shop');
const dest = path.join(__dirname, '../.sample/shop');
const reset = process.argv.includes('--reset');

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name === '.ai-project') continue;
    const a = path.join(from, e.name); const b = path.join(to, e.name);
    if (e.isDirectory()) copy(a, b); else fs.copyFileSync(a, b);
  }
}

if (reset) fs.rmSync(dest, { recursive: true, force: true });
if (!fs.existsSync(dest)) { copy(src, dest); console.log(`Sample project created at ${dest}`); } else console.log(`Sample project already at ${dest}`);
