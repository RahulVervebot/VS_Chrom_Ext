// Call graph built from per-file analyses. Every edge records how it was resolved:
//   VERIFIED = resolved through an actual import binding or same-file symbol
//   INFERRED = matched by a project-unique symbol name only
const { resolveImport } = require('../analyzer/dependencyAnalyzer');
const { isCallable, innermost } = require('../analyzer/callAnalyzer');

const nodeId = (file, name, className) => `${file}#${className ? className + '.' : ''}${name}`;

class WorkflowGraph {
  constructor(fileAnalyses) {
    this.files = new Map(fileAnalyses.map((f) => [f.path, f]));
    this.fileSet = new Set(this.files.keys());
    this.nodes = new Map(); // id -> {id,file,name,symbol}
    this.edges = new Map(); // id -> [{to, via, line, status}]
    this.reverse = new Map();
    this.byName = new Map(); // name -> [id]
    this._build();
  }

  _build() {
    for (const fa of this.files.values()) {
      for (const s of fa.symbols) {
        if (!isCallable(s)) continue;
        const id = nodeId(fa.path, s.name, s.className);
        this.nodes.set(id, { id, file: fa.path, name: s.name, className: s.className || null, symbol: s });
        (this.byName.get(s.name) || this.byName.set(s.name, []).get(s.name)).push(id);
      }
    }
    for (const node of this.nodes.values()) {
      const fa = this.files.get(node.file);
      const out = [];
      for (const call of node.symbol.calls || []) {
        const r = this.resolveCall(fa, call.name, node);
        if (r && r.id !== node.id) out.push({ to: r.id, via: call.name, line: call.line, status: r.status });
      }
      this.edges.set(node.id, out);
      for (const e of out) (this.reverse.get(e.to) || this.reverse.set(e.to, []).get(e.to)).push({ from: node.id, line: e.line, status: e.status });
    }
  }

  findInFile(file, name, className) {
    const id = nodeId(file, name, className);
    if (this.nodes.has(id)) return id;
    // exported default function / class with a different local name, or any same-named symbol
    const fa = this.files.get(file);
    if (!fa) return null;
    const s = fa.symbols.find((x) => isCallable(x) && x.name === name);
    return s ? nodeId(file, s.name, s.className) : null;
  }

  importFor(fa, ident) {
    return fa.imports.find((i) => i.default === ident || i.namespace === ident || i.names.some((n) => n.local === ident));
  }

  resolveCall(fa, rawName, fromNode) {
    let name = rawName;
    const isThis = name.endsWith('@this');
    if (isThis) name = name.slice(0, -5);
    const parts = name.split('.');

    if (isThis) {
      const id = this.findInFile(fa.path, parts[0], fromNode.className);
      return id ? { id, status: 'VERIFIED' } : null;
    }

    if (parts.length === 1) {
      const local = this.findInFile(fa.path, name);
      if (local) return { id: local, status: 'VERIFIED' };
      const imp = this.importFor(fa, name);
      if (imp) {
        const target = resolveImport(fa.path, imp, fa.language, this.fileSet);
        if (target) {
          const binding = imp.names.find((n) => n.local === name);
          const importedName = binding ? binding.imported : name;
          const id = this.findInFile(target, importedName) || (imp.default === name ? this._defaultExport(target) : null);
          if (id) return { id, status: 'VERIFIED' };
        }
        return null; // imported but from an external package or unresolved
      }
    } else {
      const [recv, member] = parts;
      const imp = this.importFor(fa, recv);
      if (imp) {
        const target = resolveImport(fa.path, imp, fa.language, this.fileSet);
        if (target) {
          const id = this.findInFile(target, member) || this._methodInFile(target, member, recv);
          if (id) return { id, status: 'VERIFIED' };
        }
        return null;
      }
      // Class.method within the same file
      const localMethod = this.findInFile(fa.path, member, recv);
      if (localMethod && this.nodes.has(nodeId(fa.path, member, recv))) return { id: localMethod, status: 'VERIFIED' };
      return null; // receiver is a local/unknown object: not resolvable without types
    }

    // Unique-name fallback (INFERRED). Only if exactly one candidate exists in the project.
    const cands = this.byName.get(name) || [];
    if (cands.length === 1) return { id: cands[0], status: 'INFERRED' };
    return null;
  }

  _defaultExport(file) {
    const fa = this.files.get(file);
    const d = fa && fa.exports.find((e) => e.kind === 'default' || e.kind === 'cjs-default');
    return d ? this.findInFile(file, d.name) : null;
  }

  _methodInFile(file, member) {
    const fa = this.files.get(file);
    const s = fa && fa.symbols.find((x) => x.type === 'method' && x.name === member);
    return s ? nodeId(file, s.name, s.className) : null;
  }

  // Resolve a route handler reference (e.g. "orderController.createOrder") from the route file.
  resolveHandler(routeFile, handlerName) {
    const fa = this.files.get(routeFile);
    if (!fa || !handlerName) return null;
    const fake = { id: null, className: null };
    return this.resolveCall(fa, handlerName, fake);
  }

  enclosing(file, line) {
    const fa = this.files.get(file);
    if (!fa) return null;
    const s = innermost(fa.symbols, line);
    return s ? nodeId(file, s.name, s.className) : null;
  }

  callers(id) { return this.reverse.get(id) || []; }
  callees(id) { return this.edges.get(id) || []; }
}

module.exports = { WorkflowGraph, nodeId };
