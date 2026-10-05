// Turns a stored blueprint into a creation plan and, only on explicit user action, creates the folder skeleton.
const fs = require('fs');
const path = require('path');

function flatten(tree, base = '') {
  const out = [];
  if (Array.isArray(tree)) { for (const t of tree) out.push(...flatten(t, base)); return out; }
  if (typeof tree === 'string') { out.push({ path: path.posix.join(base, tree), type: tree.endsWith('/') ? 'dir' : 'file' }); return out; }
  if (tree && typeof tree === 'object') {
    for (const [k, v] of Object.entries(tree)) {
      const p = path.posix.join(base, k);
      if (v && typeof v === 'object') { out.push({ path: p, type: 'dir' }); out.push(...flatten(v, p)); } else out.push({ path: p, type: k.endsWith('/') ? 'dir' : 'file' });
    }
  }
  return out;
}

function planFromBlueprint(record) {
  const entries = flatten(record.blueprint.folderStructure || []);
  const bad = entries.filter((e) => path.isAbsolute(e.path) || e.path.split('/').includes('..'));
  if (bad.length) throw new Error(`Blueprint contains unsafe paths: ${bad.slice(0, 3).map((b) => b.path).join(', ')}`);
  return { entries, note: 'Only folders and empty placeholder files are created. Implementation is left to you.' };
}

// Must be called only after the user picks an empty target folder and confirms.
async function createFromBlueprint(plan, targetDir, record) {
  const existing = await fs.promises.readdir(targetDir);
  if (existing.length) throw new Error('Target folder is not empty. Choose an empty folder.');
  for (const e of plan.entries) {
    const abs = path.join(targetDir, e.path);
    if (path.relative(targetDir, abs).startsWith('..')) throw new Error(`Unsafe path ${e.path}`);
    if (e.type === 'dir') await fs.promises.mkdir(abs, { recursive: true });
    else { await fs.promises.mkdir(path.dirname(abs), { recursive: true }); await fs.promises.writeFile(abs, '', { flag: 'wx' }); }
  }
  await fs.promises.writeFile(path.join(targetDir, 'BLUEPRINT.md'), `# Project Blueprint\n\nGenerated ${new Date().toISOString()}.\n\n\`\`\`json\n${JSON.stringify(record.blueprint, null, 2)}\n\`\`\`\n`, { flag: 'wx' });
  return { created: plan.entries.length };
}

module.exports = { planFromBlueprint, createFromBlueprint, flatten };
