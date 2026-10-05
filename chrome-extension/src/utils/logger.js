import { storage, update } from './storage.js';

const MAX = 200;
const scrub = (s) => String(s).replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED_SECRET]').replace(/((?:sessionKey|pairingToken|token|password|secret)["'\s:=]+)["']?[^\s"',;]{6,}/gi, '$1[REDACTED_SECRET]');

// Ring buffer in storage so the side panel can show recent events. Never logs keys or tokens.
export async function log(level, tag, message, data) {
  const entry = { at: new Date().toISOString(), level, tag, message: scrub(message), data: data ? scrub(JSON.stringify(data)).slice(0, 500) : undefined };
  if (typeof console !== 'undefined') console[level === 'error' ? 'error' : 'log'](`[${tag}] ${entry.message}`);
  try { await update('log', (l) => [...l, entry].slice(-MAX), []); } catch { /* logging must never break the flow */ }
}

export const getLog = () => storage.get('log', []);
