// Aggregates command modules. Each module: (ctx) => ({ 'aiProject.x': handler }).
// Static requires (not require(variable)) so the bundler can include every module.
const MODULES = [
  require('./startHere'), require('./initializeProject'), require('./scanProject'), require('./selectFiles'), require('./selectFolder'), require('./configureExclusions'),
  require('./analyzeProject'), require('./analyzeWorkflow'), require('./analyzeDatabase'), require('./analyzeFeature'), require('./generateDocumentation'),
  require('./compareProjects'), require('./generateBlueprint'), require('./analyzeChange'), require('./applyChanges'), require('./verifyProject'),
  require('./connectChrome'), require('./disconnectChrome'), require('./resumeAnalysis'),
];

function collect(ctx) {
  const all = {};
  for (const m of MODULES) Object.assign(all, m(ctx));
  all['aiProject.openDashboard'] = async () => ctx.host.openPanel('dashboard');
  return all;
}

module.exports = { collect, MODULES };
