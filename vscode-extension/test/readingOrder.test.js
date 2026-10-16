const test = require('node:test');
const assert = require('node:assert');
const { selectFiles } = require('../src/context/contextSelector');

const paths = ['a/x.py', 'odoo/core.py', 'tulsi_pos/addons/pos/__manifest__.py', 'tulsi_pos/addons/pos/models/order.py', 'tulsi_pos/addons/pos/__init__.py', 'tulsi_pos/addons/sale/__manifest__.py', 'tulsi_pos/addons/sale/a.py', 'tulsi_pos/main.py', 'z/y.py'];
const files = paths.map((p) => ({ path: p, isSource: true, status: 'NOT_ANALYZED' }));
const analysis = { features: [], workflows: [], database: { entities: [], queries: [] }, apis: [] };

test('reading order: first, middle, last; manifest first inside an add-on', () => {
  const { files: out, ranked } = selectFiles({ mode: 'PROJECT', selection: { project: true }, analysis, files, order: { first: ['odoo'], last: ['tulsi_pos/addons'] } });
  assert.ok(ranked);
  assert.deepStrictEqual(out, ['odoo/core.py', 'a/x.py', 'tulsi_pos/main.py', 'z/y.py', 'tulsi_pos/addons/pos/__manifest__.py', 'tulsi_pos/addons/pos/__init__.py', 'tulsi_pos/addons/pos/models/order.py', 'tulsi_pos/addons/sale/__manifest__.py', 'tulsi_pos/addons/sale/a.py']);
});

test('reading order: the longest matching entry wins', () => {
  const { files: out } = selectFiles({ mode: 'PROJECT', selection: { project: true }, analysis, files, order: { first: ['tulsi_pos/addons/sale'], last: ['tulsi_pos'] } });
  assert.deepStrictEqual(out.slice(0, 2), ['tulsi_pos/addons/sale/__manifest__.py', 'tulsi_pos/addons/sale/a.py']);
  assert.ok(out.indexOf('z/y.py') < out.indexOf('tulsi_pos/main.py'));
});

test('a resumed run keeps its recorded order even if the reading order changed', () => {
  const pinned = ['z/y.py', 'a/x.py'];
  const { files: out } = selectFiles({ mode: 'PROJECT', selection: { project: true, pinnedFiles: pinned, pinnedOrder: true }, analysis, files, order: { first: ['a'] } });
  assert.deepStrictEqual(out, pinned);
  const legacy = selectFiles({ mode: 'PROJECT', selection: { project: true, pinnedFiles: pinned }, analysis, files });
  assert.deepStrictEqual(legacy.files, ['a/x.py', 'z/y.py']);
});

test('without a reading order nothing changes', () => {
  const { files: out } = selectFiles({ mode: 'PROJECT', selection: { project: true }, analysis, files });
  assert.strictEqual(out[0], 'a/x.py');
});
