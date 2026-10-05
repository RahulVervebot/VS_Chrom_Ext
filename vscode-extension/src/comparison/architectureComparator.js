const { setDiff } = require('./projectComparator');

function compareArchitectures(summaries) {
  const diffs = [];
  for (let i = 0; i < summaries.length; i++) for (let j = i + 1; j < summaries.length; j++) {
    const a = summaries[i]; const b = summaries[j];
    diffs.push({ a: a.project.name, b: b.project.name, technologies: setDiff(a.technologies, b.technologies), layers: setDiff(Object.keys(a.layers), Object.keys(b.layers)), languages: setDiff(Object.keys(a.languages), Object.keys(b.languages)) });
  }
  return { diffs };
}

module.exports = { compareArchitectures };
