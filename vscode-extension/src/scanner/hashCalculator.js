const crypto = require('crypto');
const fs = require('fs');

function hashBuffer(buf) {
  return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex');
}

function hashString(s) {
  return hashBuffer(Buffer.from(s, 'utf8'));
}

// Streams the file so large files are never fully loaded just to be hashed.
function hashFile(absPath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(absPath);
    s.on('error', reject);
    s.on('data', (c) => h.update(c));
    s.on('end', () => resolve('sha256:' + h.digest('hex')));
  });
}

module.exports = { hashBuffer, hashString, hashFile };
