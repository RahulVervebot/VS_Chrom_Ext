// Pairing tokens, origin checks, connection secrets and rate limiting. Never logs token or secret values.
const crypto = require('crypto');
const { randomToken, randomId } = require('../utils/ids');

const PAIRING_TTL_MS = 2 * 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

class SecurityManager {
  // secretStore: { get(key)->Promise<string|undefined>, store(key,value), delete(key) } (VS Code SecretStorage shape)
  constructor({ secretStore, ttlMs = PAIRING_TTL_MS, allowNoOrigin = false, now = () => Date.now() } = {}) {
    this.secretStore = secretStore;
    this.ttlMs = ttlMs;
    this.allowNoOrigin = allowNoOrigin;
    this.now = now;
    this.pending = new Map(); // tokenHash -> { expiresAt, projectId }
    this.expired = new Map(); // tokenHash -> expiredAt (kept briefly so clients get a clear TOKEN_EXPIRED)
    this.failures = new Map(); // remote -> { count, until }
  }

  // ---- pairing ----
  createPairingToken(projectId) {
    const token = randomToken(9).replace(/[-_]/g, 'x').slice(0, 12).toUpperCase(); // short, user-typable code
    const expiresAt = this.now() + this.ttlMs;
    this._sweep();
    this.pending.set(sha256(token), { expiresAt, projectId });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  // Single use. Returns { ok, reason?, projectId? }.
  consumePairingToken(token) {
    if (typeof token !== 'string') return { ok: false, reason: 'missing' };
    const h = sha256(token.trim().toUpperCase());
    const rec = this.pending.get(h);
    if (!rec) return { ok: false, reason: this.expired.has(h) ? 'expired' : 'unknown' };
    this.pending.delete(h);
    if (rec.expiresAt < this.now()) return { ok: false, reason: 'expired' };
    return { ok: true, projectId: rec.projectId };
  }

  _sweep() {
    for (const [h, v] of this.pending) if (v.expiresAt < this.now()) { this.pending.delete(h); this.expired.set(h, v.expiresAt); }
    for (const [h, at] of this.expired) if (this.now() - at > 10 * 60_000) this.expired.delete(h);
  }

  hasPendingToken() {
    this._sweep();
    return this.pending.size > 0;
  }

  cancelPairing() { this.pending.clear(); }

  // ---- origin ----
  checkOrigin(origin, pinnedExtensionId) {
    if (!origin) return this.allowNoOrigin;
    const m = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
    if (!m) return false; // web pages (any http/https origin) can never talk to the bridge
    return !pinnedExtensionId || pinnedExtensionId === m[1];
  }

  extensionIdFromOrigin(origin) {
    const m = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin || '');
    return m ? m[1] : null;
  }

  // ---- paired connections (persisted via SecretStorage; only a hash of the key is stored) ----
  async registerConnection({ projectId, extensionId, label }) {
    const connectionId = randomId('conn');
    const sessionKey = randomToken(32);
    const rec = { connectionId, keyHash: sha256(sessionKey), projectId, extensionId: extensionId || null, label: label || null, createdAt: new Date(this.now()).toISOString() };
    const all = await this._loadAll();
    all[connectionId] = rec;
    await this._saveAll(all);
    return { connectionId, sessionKey };
  }

  async verifyConnection(connectionId, sessionKey) {
    const all = await this._loadAll();
    const rec = all[connectionId];
    if (!rec || typeof sessionKey !== 'string') return null;
    return safeEqual(rec.keyHash, sha256(sessionKey)) ? rec : null;
  }

  async revokeConnection(connectionId) {
    const all = await this._loadAll();
    const had = !!all[connectionId];
    delete all[connectionId];
    await this._saveAll(all);
    return had;
  }

  async revokeAll() { await this._saveAll({}); }
  async listConnections() { return Object.values(await this._loadAll()).map(({ keyHash, ...rest }) => rest); }

  async _loadAll() {
    if (!this.secretStore) return this._mem || (this._mem = {});
    try { return JSON.parse((await this.secretStore.get('aiProject.bridge.connections')) || '{}'); } catch { return {}; }
  }
  async _saveAll(all) {
    if (!this.secretStore) { this._mem = all; return; }
    await this.secretStore.store('aiProject.bridge.connections', JSON.stringify(all));
  }

  // ---- brute-force protection on the pairing/resume handshake ----
  recordFailure(remote) {
    const f = this.failures.get(remote) || { count: 0, until: 0 };
    f.count++;
    if (f.count >= 5) f.until = this.now() + 60_000;
    this.failures.set(remote, f);
  }
  isBlocked(remote) {
    const f = this.failures.get(remote);
    if (!f) return false;
    if (f.until && f.until < this.now()) { this.failures.delete(remote); return false; }
    return f.until > this.now();
  }
  clearFailures(remote) { this.failures.delete(remote); }
}

// Token bucket per connection.
class RateLimiter {
  constructor({ perSecond = 200, burst = 400 } = {}) { this.perSecond = perSecond; this.burst = burst; this.tokens = burst; this.last = Date.now(); }
  allow() {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

module.exports = { SecurityManager, RateLimiter, sha256, safeEqual, PAIRING_TTL_MS };
