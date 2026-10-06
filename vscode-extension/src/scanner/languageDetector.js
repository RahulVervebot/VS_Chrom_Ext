const path = require('path');

const EXT = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.vue': 'vue', '.svelte': 'svelte',
  '.py': 'python', '.php': 'php', '.rb': 'ruby', '.go': 'go', '.java': 'java', '.kt': 'kotlin',
  '.cs': 'csharp', '.rs': 'rust', '.swift': 'swift', '.dart': 'dart',
  '.sql': 'sql', '.prisma': 'prisma', '.proto': 'protobuf', '.kts': 'kotlin', '.graphql': 'graphql', '.gql': 'graphql',
  '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'toml', '.xml': 'xml', '.ini': 'ini',
  '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.md': 'markdown', '.sh': 'shell', '.env': 'env', '.properties': 'properties',
};

const SPECIAL = {
  Dockerfile: 'dockerfile', Makefile: 'makefile', '.env': 'env', '.env.example': 'env',
};

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg', '.pdf', '.zip', '.gz', '.tar', '.tgz', '.rar', '.7z',
  '.woff', '.woff2', '.ttf', '.eot', '.otf', '.mp3', '.mp4', '.mov', '.avi', '.wav', '.exe', '.dll', '.so', '.dylib', '.class', '.jar',
  '.pyc', '.lock', '.map', '.psd', '.sqlite', '.db',
]);

const SOURCE_LANGS = new Set([
  'javascript', 'typescript', 'vue', 'svelte', 'python', 'php', 'ruby', 'go', 'java', 'kotlin', 'csharp', 'rust', 'swift', 'dart',
]);

function detectLanguage(relPath) {
  const base = path.posix.basename(relPath);
  if (SPECIAL[base]) return SPECIAL[base];
  if (base.startsWith('.env')) return 'env';
  const ext = path.posix.extname(base).toLowerCase();
  return EXT[ext] || 'unknown';
}

const isBinaryPath = (relPath) => BINARY_EXT.has(path.posix.extname(relPath).toLowerCase());
const isSourceLanguage = (lang) => SOURCE_LANGS.has(lang);

module.exports = { detectLanguage, isBinaryPath, isSourceLanguage };
