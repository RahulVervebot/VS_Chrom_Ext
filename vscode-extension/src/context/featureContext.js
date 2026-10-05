function featureContext(filePaths, analysis) {
  const set = new Set(filePaths);
  return analysis.features.filter((f) => f.files.some((p) => set.has(p))).map((f) => ({ id: f.id, name: f.name, status: f.status, files: f.files, apis: f.apis, entities: f.entities, tests: f.tests }));
}

module.exports = { featureContext };
