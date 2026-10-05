// Exclusion matching. Patterns: "name" (any path segment), "dir/sub" (path prefix), "*.ext", "glob*".
function globToRegex(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
  return new RegExp(`^${esc}$`, 'i'); // macOS and Windows filesystems are case-insensitive by default
}

function compileExclusions(patterns) {
  const rules = (patterns || []).map((p) => String(p).trim().replace(/^\.?\//, '').replace(/\/$/, '')).filter(Boolean).map((p) => {
    const hasSlash = p.includes('/');
    const hasGlob = p.includes('*');
    return { p, hasSlash, re: hasGlob ? globToRegex(p) : null };
  });

  // relPath is POSIX and project-relative.
  return function isExcluded(relPath) {
    const segments = relPath.split('/');
    const base = segments[segments.length - 1];
    for (const r of rules) {
      if (r.hasSlash) {
        if (r.re ? r.re.test(relPath) : relPath.toLowerCase() === r.p.toLowerCase() || relPath.toLowerCase().startsWith(r.p.toLowerCase() + '/')) return true;
      } else if (r.re) {
        if (segments.some((s) => r.re.test(s))) return true;
      } else if (segments.some((x) => x.toLowerCase() === r.p.toLowerCase())) {
        return true;
      }
    }
    return false;
  };
}

module.exports = { compileExclusions };
