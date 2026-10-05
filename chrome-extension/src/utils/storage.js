// chrome.storage.local wrapper with an in-memory fallback so pure modules can be tested in Node.
const mem = new Map();
const hasChrome = () => typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

export const storage = {
  async get(key, fallback) {
    if (hasChrome()) { const r = await chrome.storage.local.get(key); return r[key] === undefined ? fallback : r[key]; }
    return mem.has(key) ? JSON.parse(mem.get(key)) : fallback;
  },
  async set(key, value) {
    if (hasChrome()) return chrome.storage.local.set({ [key]: value });
    mem.set(key, JSON.stringify(value));
    return undefined;
  },
  async remove(key) { if (hasChrome()) return chrome.storage.local.remove(key); mem.delete(key); return undefined; },
  _reset() { mem.clear(); },
};

// Serialized read-modify-write per key (the service worker handles many events concurrently).
const tails = new Map();
export function update(key, fn, fallback) {
  const prev = tails.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => { const v = fn(await storage.get(key, fallback)); await storage.set(key, v); return v; });
  tails.set(key, next.catch(() => {}));
  return next;
}
