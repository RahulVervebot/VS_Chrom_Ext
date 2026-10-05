// Loads the documentation a project has generated under .ai-project/documentation/ so two projects' written documents can be compared.
// Only a bounded, secret-redacted excerpt of each document leaves VS Code; deterministic facts (which documents exist where) are computed here.
const path = require('path');
const { ProjectStore } = require('../knowledge/projectStore');
const { redact } = require('../security/secretDetector');

const PER_DOC_CHARS = 6000;
const PER_PROJECT_CHARS = 60000;
const ORDER = [/^project-overview$/, /^architecture$/, /^features\//, /^workflows\//, /^database\//, /^files\//];
const rank = (key) => { const i = ORDER.findIndex((r) => r.test(key)); return i < 0 ? ORDER.length : i; };

async function listMarkdown(store, rel) {
  const out = [];
  for (const name of await store.listDir(rel)) {
    const child = `${rel}/${name}`;
    if (name.endsWith('.md')) out.push(child);
    else if (!name.includes('.')) out.push(...(await listMarkdown(store, child)));
  }
  return out;
}

// dir: a workspace root containing .ai-project (any project, not necessarily the open one).
async function loadProjectDocuments(dir, folderName = '.ai-project') {
  const store = new ProjectStore(dir, folderName);
  if (!(await store.isInitialized())) throw new Error(`No ${folderName}/project.json found in ${path.basename(dir)}.`);
  const project = await store.readJson('project.json');
  const paths = await listMarkdown(store, 'documentation');
  if (!paths.length) throw new Error(`${project.name || path.basename(dir)} has no generated documentation yet. Run "AI Project: Update Documentation" in that project first.`);
  const docs = paths.map((p) => ({ path: p, key: p.replace(/^documentation\//, '').replace(/\.md$/, '') })).sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key));
  const documents = [];
  const omitted = [];
  let budget = PER_PROJECT_CHARS;
  for (const d of docs) {
    const raw = await store.readText(d.path, '');
    if (budget <= 0) { omitted.push(d.key); continue; }
    const text = redact(raw, d.path).text;
    const slice = text.slice(0, Math.min(PER_DOC_CHARS, budget));
    budget -= slice.length;
    documents.push({ key: d.key, text: slice, truncated: slice.length < text.length, chars: raw.length });
  }
  return { project: { projectId: project.projectId, name: project.name }, documents, omitted, totalDocuments: docs.length };
}

const setDiff = (a, b) => ({ common: a.filter((x) => b.includes(x)), onlyA: a.filter((x) => !b.includes(x)), onlyB: b.filter((x) => !a.includes(x)) });

function compareDocumentation(summaries) {
  const names = summaries.map((s) => s.project.name);
  const keys = summaries.map((s) => [...s.documents.map((d) => d.key), ...s.omitted]);
  const pairs = [];
  for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) pairs.push({ a: names[i], b: names[j], documents: setDiff(keys[i], keys[j]) });
  return {
    projects: summaries.map((s) => s.project),
    pairs,
    coverage: summaries.map((s, i) => ({ project: names[i], documents: s.totalDocuments, sentToAi: s.documents.length, truncated: s.documents.filter((d) => d.truncated).map((d) => d.key), notSent: s.omitted })),
  };
}

module.exports = { loadProjectDocuments, compareDocumentation, PER_DOC_CHARS, PER_PROJECT_CHARS };
