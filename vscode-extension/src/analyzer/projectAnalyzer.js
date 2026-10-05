// Orchestrates static analysis over a scan result. Hash-aware: unchanged files reuse cached per-file analyses.
const fs = require('fs');
const path = require('path');
const { analyzeFile } = require('./fileAnalyzer');
const { buildDependencies } = require('./dependencyAnalyzer');
const { buildDependents } = require('./reverseDependencyAnalyzer');
const { resolveRoutes, matchCallsToRoutes } = require('./apiAnalyzer');
const { analyzeArchitecture } = require('./architectureAnalyzer');
const { detectFeatures } = require('./featureAnalyzer');
const { resolveQueries, mapFilesToEntities } = require('../database/dataFlowAnalyzer');
const { discoverWorkflows } = require('../workflows/workflowEngine');
const { mapLimit } = require('../scanner/fileScanner');
const { isSourceLanguage } = require('../scanner/languageDetector');
const logger = require('../utils/logger');

const MAX_ANALYZE_BYTES = 1024 * 1024;

function shouldAnalyze(f) {
  return !f.binary && f.size <= MAX_ANALYZE_BYTES && (isSourceLanguage(f.language) || ['sql', 'prisma'].includes(f.language));
}

// cache: Map(path -> { hash, analysis }) from a previous run.
async function analyzeProject(root, scan, options = {}) {
  const { cache = new Map(), maxWorkflowDepth = 8, concurrency = 16 } = options;
  const started = Date.now();
  let reused = 0;
  const analyses = (await mapLimit(scan.files.filter(shouldAnalyze), concurrency, async (f) => {
    const hit = cache.get(f.path);
    if (hit && hit.hash === f.hash && hit.analysis.validation !== undefined) { reused++; return hit.analysis; }
    try {
      const content = await fs.promises.readFile(path.join(root, f.path), 'utf8');
      return analyzeFile({ path: f.path, language: f.language, hash: f.hash, content });
    } catch (err) {
      logger.warn('ANALYSIS', 'file analysis failed', { path: f.path, error: err.code || err.message });
      return null;
    }
  })).filter(Boolean);

  const fileSet = new Set(scan.files.map((f) => f.path));
  const dependencies = buildDependencies(analyses, fileSet);
  const dependents = buildDependents(dependencies);
  const apis = resolveRoutes(analyses, dependencies);
  const apiLinks = matchCallsToRoutes(analyses, apis);

  const entities = [];
  const relationships = [];
  const indexes = [];
  const technologies = new Map();
  for (const a of analyses) {
    entities.push(...a.database.entities);
    relationships.push(...a.database.relationships);
    indexes.push(...a.database.indexes);
    for (const t of a.database.technologies) (technologies.get(t.name) || technologies.set(t.name, []).get(t.name)).push({ file: t.file, line: t.line });
  }
  const queries = resolveQueries(analyses, entities);
  const fileEntities = mapFilesToEntities(queries);

  // Relationships must reference known entities to be shown as verified.
  const entityNames = new Set(entities.map((e) => e.name.toLowerCase()));
  const verifiedRelationships = relationships.map((r) => ({ ...r, status: entityNames.has(String(r.to).toLowerCase()) && entityNames.has(String(r.from).toLowerCase()) ? 'VERIFIED' : 'INFERRED' }));

  const { workflows, dataFlows, graph } = discoverWorkflows({ fileAnalyses: analyses, apis, apiLinks, queries, maxDepth: maxWorkflowDepth });
  const features = detectFeatures({ fileAnalyses: analyses, apis, queries, dependencies });
  const architecture = analyzeArchitecture({ fileAnalyses: analyses, scan, dependencies, dependents });

  const auth = analyses.filter((a) => a.auth.length).map((a) => ({ file: a.path, items: a.auth }));
  const externalServices = {};
  for (const a of analyses) for (const s of a.externalServices.services) (externalServices[s.name] ||= []).push({ file: a.path, line: s.line });
  const stateManagement = analyses.filter((a) => a.state.libraries.length).map((a) => ({ file: a.path, libraries: a.state.libraries.map((l) => l.library) }));
  const businessLogic = analyses.filter((a) => a.businessLogic.length).map((a) => ({ file: a.path, rules: a.businessLogic }));
  const validation = analyses.filter((a) => a.validation && a.validation.length).map((a) => ({ file: a.path, items: a.validation }));
  const events = analyses.filter((a) => a.events.events && (a.events.events.length || a.events.queues.length || a.events.jobs.length || a.events.webhooks.length))
    .map((a) => ({ file: a.path, ...a.events }));

  logger.info('ANALYSIS', 'project analysis complete', { files: analyses.length, reused, workflows: workflows.length, apis: apis.length });

  return {
    analyzedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    reusedFromCache: reused,
    files: analyses,
    dependencies,
    dependents,
    apis,
    apiLinks,
    database: {
      technologies: [...technologies.entries()].map(([name, evidence]) => ({ name, evidence: evidence.slice(0, 5) })),
      entities,
      relationships: verifiedRelationships,
      indexes,
      queries,
      fileEntities,
      dataFlows,
    },
    workflows,
    features,
    architecture,
    auth,
    externalServices,
    stateManagement,
    businessLogic,
    validation,
    events,
    graph,
  };
}

module.exports = { analyzeProject };
