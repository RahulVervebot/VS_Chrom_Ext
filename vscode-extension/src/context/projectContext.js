// Compact project overview sent with every analysis so the AI knows the system it is looking at.
function projectContext(project, analysis, scan) {
  return {
    projectId: project.projectId,
    name: project.name,
    technologies: analysis.architecture.technologies.map((t) => t.name),
    languages: analysis.architecture.languages,
    tiers: analysis.architecture.tiers,
    layers: Object.fromEntries(Object.entries(analysis.architecture.layers).map(([k, v]) => [k, v.length])),
    entryPoints: analysis.architecture.entryPoints.map((e) => e.path),
    totals: { files: scan ? scan.totals.files : undefined, apis: analysis.apis.length, workflows: analysis.workflows.length, features: analysis.features.length, entities: analysis.database.entities.length },
  };
}

module.exports = { projectContext };
