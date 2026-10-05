// Project-relative, POSIX-style paths only. Absolute paths are never authoritative data.
const path = require('path');
const { AiProjectError, ErrorCodes } = require('./errors');

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function toRelative(root, absolute) {
  return toPosix(path.relative(root, absolute));
}

// Resolve an untrusted project-relative path to an absolute path under root.
// Throws on traversal or absolute input.
function resolveInside(root, rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.includes('\0')) {
    throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, 'Invalid path.');
  }
  if (path.isAbsolute(rel) || /^[A-Za-z]:[\\/]/.test(rel)) {
    throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Absolute paths are not accepted: ${rel}`);
  }
  const abs = path.resolve(root, rel);
  const relBack = path.relative(root, abs);
  if (relBack.startsWith('..') || path.isAbsolute(relBack)) {
    throw new AiProjectError(ErrorCodes.PATH_TRAVERSAL, `Path escapes the project: ${rel}`);
  }
  return abs;
}

function normalizeRelative(rel) {
  return toPosix(path.posix.normalize(rel.replace(/\\/g, '/'))).replace(/^\.\//, '');
}

module.exports = { toPosix, toRelative, resolveInside, normalizeRelative };
