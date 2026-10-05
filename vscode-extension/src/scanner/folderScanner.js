// Aggregates per-folder stats from scanned file records.
function scanFolders(folderPaths, fileRecords) {
  const map = new Map(folderPaths.map((p) => [p, { path: p, files: 0, lines: 0, tokens: 0, languages: {} }]));
  for (const f of fileRecords) {
    let dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    // Roll each file up through every ancestor folder.
    while (dir) {
      const rec = map.get(dir);
      if (rec) {
        rec.files += 1;
        rec.lines += f.lines || 0;
        rec.tokens += f.tokens || 0;
        rec.languages[f.language] = (rec.languages[f.language] || 0) + 1;
      }
      dir = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';
    }
  }
  return [...map.values()];
}

module.exports = { scanFolders };
