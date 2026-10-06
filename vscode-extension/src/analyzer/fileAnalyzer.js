// Runs every per-file analyzer against a single file's content. Pure: no filesystem access.
const { stripComments } = require('../utils/text');
const { analyzeSymbols } = require('./symbolAnalyzer');
const { analyzeImportsExports } = require('./dependencyAnalyzer');
const { analyzeRoutes } = require('./routeAnalyzer');
const { analyzeApiCalls, analyzeRealtimeAndGraphQL } = require('./apiAnalyzer');
const { analyzeDatabase } = require('./databaseAnalyzer');
const { analyzeAuth } = require('./authAnalyzer');
const { analyzeExternalServices } = require('./externalServiceAnalyzer');
const { analyzeEvents, isTestFile } = require('./eventAnalyzer');
const { analyzeState } = require('./stateAnalyzer');
const { analyzeBusinessLogic } = require('./businessLogicAnalyzer');
const { analyzeValidation } = require('./validationAnalyzer');
const { isApiSpecFile, analyzeApiSpec } = require('./apiSpecSupport');
const { extractCalls, extractUiHandlers, routeBodyCalls } = require('./callAnalyzer');
const { extractEnvRefs } = require('../scanner/environmentScanner');
const { isSourceLanguage } = require('../scanner/languageDetector');

const EMPTY_DB = { technologies: [], entities: [], relationships: [], indexes: [], queries: [], ormCalls: [] };

function analyzeFile({ path, language, hash, content }) {
  const isSource = isSourceLanguage(language);
  const base = { path, language, hash, isSource, lines: content.split('\n').length, isTest: isTestFile(path) };
  if (isApiSpecFile(path, language)) { // OpenAPI / protobuf / GraphQL description of an API
    const spec = analyzeApiSpec(path, language, content);
    return { ...base, symbols: [], imports: [], exports: [], routes: spec.routes, mounts: [], apiCalls: [], realtime: {}, database: EMPTY_DB, auth: [], externalServices: { services: [], hosts: [] }, events: {}, state: { libraries: [], localState: [] }, businessLogic: [], validation: spec.validation, envRefs: [], uiHandlers: [] };
  }
  if (!isSource && !['sql', 'prisma'].includes(language)) {
    return { ...base, symbols: [], imports: [], exports: [], routes: [], mounts: [], apiCalls: [], realtime: {}, database: EMPTY_DB, auth: [], externalServices: { services: [], hosts: [] }, events: {}, state: { libraries: [], localState: [] }, businessLogic: [], validation: [], envRefs: [], uiHandlers: [] };
  }
  // Comments are blanked so commented-out code is never reported as real behaviour. Line numbers are preserved.
  const code = stripComments(content, language);
  const symbols = analyzeSymbols(code, language);
  const { imports, exports } = analyzeImportsExports(code, language);
  const { routes, mounts } = analyzeRoutes(path, language === 'ruby' ? content : code, language); // Rails handlers like 'orders#index' contain a #
  const isTest = base.isTest;
  const codeLines = code.split('\n');
  extractCalls(codeLines, symbols);
  for (const r of routes) if (r.bodyRange) r.calls = routeBodyCalls(codeLines, r.bodyRange, symbols);
  return {
    ...base,
    symbols,
    imports,
    exports,
    routes: isTest ? [] : routes,
    mounts,
    apiCalls: isTest ? [] : analyzeApiCalls(code, language),
    realtime: analyzeRealtimeAndGraphQL(code),
    database: analyzeDatabase(code, language, path),
    auth: analyzeAuth(code),
    externalServices: analyzeExternalServices(code),
    events: analyzeEvents(code),
    state: analyzeState(code),
    businessLogic: analyzeBusinessLogic(symbols, isTest),
    validation: analyzeValidation(code, language, isTest),
    envRefs: extractEnvRefs(code),
    uiHandlers: extractUiHandlers(code, symbols),
  };
}

module.exports = { analyzeFile };
