// Thin analyzer-layer entry; detailed logic lives in src/database/.
const { analyzeDatabaseFile } = require('../database/databaseDetector');
const { isSourceLanguage } = require('../scanner/languageDetector');

function analyzeDatabase(content, language, file) {
  const relevant = isSourceLanguage(language) || ['sql', 'prisma'].includes(language);
  if (!relevant) return { technologies: [], entities: [], relationships: [], indexes: [], queries: [], ormCalls: [] };
  return analyzeDatabaseFile(content, language, file);
}

module.exports = { analyzeDatabase };
