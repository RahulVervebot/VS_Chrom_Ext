// The user's current selection (files, folders, features, workflows, entities, APIs). Always project-relative.
const EventEmitter = require('events');
const { normalizeRelative } = require('../utils/paths');

const KINDS = ['files', 'folders', 'features', 'workflows', 'entities', 'apis'];
const empty = () => ({ files: [], folders: [], features: [], workflows: [], entities: [], apis: [], project: false });

class SelectionState extends EventEmitter {
  constructor(initial) { super(); this.sel = { ...empty(), ...(initial || {}) }; }

  get() { return JSON.parse(JSON.stringify(this.sel)); }

  add(kind, items) {
    if (kind === 'project') { this.sel.project = true; this.emit('changed'); return; }
    if (!KINDS.includes(kind)) throw new Error(`Unknown selection kind ${kind}`);
    const list = (Array.isArray(items) ? items : [items]).map((x) => (kind === 'files' || kind === 'folders' ? normalizeRelative(String(x)).replace(/\/$/, '') : String(x)));
    this.sel[kind] = [...new Set([...this.sel[kind], ...list])];
    this.emit('changed');
  }

  remove(kind, item) {
    if (kind === 'project') this.sel.project = false;
    else if (KINDS.includes(kind)) this.sel[kind] = this.sel[kind].filter((x) => x !== item);
    this.emit('changed');
  }

  set(sel) {
    const next = empty();
    for (const k of KINDS) if (Array.isArray(sel[k])) next[k] = sel[k].map(String);
    next.project = !!sel.project;
    this.sel = next;
    this.emit('changed');
  }

  clear() { this.sel = empty(); this.emit('changed'); }
  isEmpty() { return !this.sel.project && KINDS.every((k) => this.sel[k].length === 0); }

  mode() {
    const s = this.sel;
    if (s.project) return 'PROJECT';
    if (s.workflows.length) return 'WORKFLOW';
    if (s.features.length) return 'FEATURE';
    if (s.entities.length) return 'DATABASE';
    if (s.folders.length) return 'FOLDER';
    return 'FILE';
  }

  summary() {
    const s = this.sel;
    return KINDS.map((k) => (s[k].length ? `${s[k].length} ${k}` : null)).filter(Boolean).concat(s.project ? ['entire project'] : []).join(', ') || 'nothing selected';
  }
}

module.exports = { SelectionState, KINDS };
