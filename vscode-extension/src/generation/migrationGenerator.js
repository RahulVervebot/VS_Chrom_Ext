// Extracts migration considerations from stored comparisons. Purely a view over recorded results.
async function migrationNotes(store) {
  const names = (await store.listDir('comparisons')).filter((n) => n.endsWith('.json')).sort();
  const out = [];
  for (const n of names) {
    const c = await store.readJson(`comparisons/${n}`);
    for (const m of c.result.migrationConsiderations || []) out.push({ comparisonId: c.comparisonId, note: m });
  }
  return out;
}

module.exports = { migrationNotes };
