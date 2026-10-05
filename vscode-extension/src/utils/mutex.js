// Serializes async critical sections per key (e.g. read-modify-write of one JSON file).
class KeyedMutex {
  constructor() { this.tails = new Map(); }

  run(key, fn) {
    const prev = this.tails.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    const tail = next.catch(() => {});
    this.tails.set(key, tail);
    tail.then(() => { if (this.tails.get(key) === tail) this.tails.delete(key); });
    return next;
  }
}

module.exports = { KeyedMutex };
