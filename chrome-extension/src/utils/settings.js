import { storage } from './storage.js';

export const DEFAULT_SETTINGS = {
  provider: 'auto', // auto | chatgpt | claude | gemini | generic
  maxTokensPerRequest: 24000,
  maxCharsPerMessage: 30000, // larger prompts are sent as several messages (parts); a refused big message is retried in smaller parts
  maxFilesPerRequest: 20,
  maxLinesPerFile: 1500,
  maxTotalLines: 12000,
  maxTotalTokens: 200000,
  responseTimeoutSec: 240,
  stableSec: 3,
  genericSite: '',
  bridgePort: 47821,
  autoRetryNetwork: true, // a batch that failed because the internet or the AI site dropped is retried by itself, from that batch
  maxAutoRetries: 30, // attempts while online (waiting for the connection to come back does not count)
};

// Upper bounds that keep timers valid and requests sane, whatever was typed into Settings.
export const MAX = { maxAutoRetries: 500, responseTimeoutSec: 7200, stableSec: 120, maxCharsPerMessage: 500000, maxTokensPerRequest: 2000000 };
const clamp = (s) => { const out = { ...s }; for (const [k, max] of Object.entries(MAX)) if (typeof out[k] === 'number' && out[k] > max) out[k] = max; return out; };

export async function getSettings() { return clamp({ ...DEFAULT_SETTINGS, ...(await storage.get('settings', {})) }); }

export async function saveSettings(patch) {
  const next = { ...(await getSettings()) };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) throw new Error(`Unknown setting ${k}`);
    if (typeof v !== typeof DEFAULT_SETTINGS[k]) throw new Error(`Setting ${k} expects ${typeof DEFAULT_SETTINGS[k]}`);
    if (typeof v === 'number' && !(v > 0)) throw new Error(`Setting ${k} must be positive`);
    next[k] = typeof v === 'number' && MAX[k] && v > MAX[k] ? MAX[k] : v; // e.g. a reply timeout above 2 hours is stored as 2 hours
  }
  await storage.set('settings', next);
  return next;
}
