// Turns any name the analysis produces (feature ids from URL parts, entity names, AI-supplied ids…) into a file name that is valid on
// Windows, macOS and Linux, so a .ai-project folder works on every machine and can be moved between them.
// Names that are already portable are returned unchanged; changed names get a short hash so two different names never share a file.
const crypto = require('crypto');

const ILLEGAL = /[<>:"|?*\u0000-\u001f]/g; // illegal in Windows file names (":" is also awkward on macOS)
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i; // reserved device names on Windows, with or without an extension
const MAX_SEGMENT = 120;

function portableSegment(seg) {
  if (seg === '' || seg === '.' || seg === '..') return seg;
  let s = String(seg).replace(ILLEGAL, '-');
  s = s.replace(/^\s+/, (m) => '_'.repeat(m.length)).replace(/[\s.]+$/, (m) => '_'.repeat(m.length)); // Windows drops trailing dots/spaces
  if (RESERVED.test(s.split('.')[0].trim())) s = `_${s}`;
  const m0 = /^(.*?)(\.[A-Za-z0-9]{1,8})?$/.exec(s);
  let base = m0[1]; const ext = m0[2] || '';
  if (s.length > MAX_SEGMENT) base = base.slice(0, MAX_SEGMENT - 10 - ext.length);
  const out = base + ext;
  if (out === seg) return seg;
  const hash = crypto.createHash('sha1').update(String(seg)).digest('hex').slice(0, 6);
  return `${base}~${hash}${ext}`;
}

// 'features/<string:param>.json' -> ['features', 'string-param~ab12cd.json']
const portableParts = (...segments) => segments.flatMap((x) => String(x).split(/[\\/]+/)).map(portableSegment);

module.exports = { portableSegment, portableParts };
