// Writes the specification into the project's .ai-project/exports/ (plain text for AI hand-off + JSON for comparison).
const { buildSpec } = require('./specBuilder');
const { renderSpec } = require('./specRenderer');

async function exportSpec(store, root, folderName = '.ai-project') {
  const spec = await buildSpec(root, folderName);
  const { text, sections } = renderSpec(spec);
  await store.writeText('exports/project-spec.txt', text);
  await store.writeJson('exports/project-spec.json', spec);
  return { spec, text, sections, textPath: 'exports/project-spec.txt', jsonPath: 'exports/project-spec.json' };
}

module.exports = { exportSpec };
