// Outbound requests that expect a correlated reply (matched by inReplyTo or payload.requestId).
class RequestManager {
  constructor({ defaultTimeoutMs = 60_000 } = {}) {
    this.pending = new Map(); // key -> { resolve, reject, timer, type }
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  // key: the messageId of the request. Resolves with the reply message.
  expect(key, { type, timeoutMs } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        const e = new Error(`Timed out waiting for reply to ${type || key}`);
        e.code = 'TIMEOUT';
        reject(e);
      }, timeoutMs || this.defaultTimeoutMs);
      if (timer.unref) timer.unref();
      this.pending.set(key, { resolve, reject, timer, type });
    });
  }

  // Returns true when the message satisfied a pending request.
  fulfil(message) {
    const key = message.inReplyTo || (message.payload && message.payload.requestId);
    const p = key && this.pending.get(key);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(key);
    p.resolve(message);
    return true;
  }

  rejectAll(reason) {
    for (const [key, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error(reason)); this.pending.delete(key); }
  }

  get size() { return this.pending.size; }
}

module.exports = { RequestManager };
