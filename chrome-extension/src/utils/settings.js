import { storage } from './storage.js';

export const DEFAULT_SETTINGS = {
  provider: 'auto', // auto | chatgpt | claude | gemini | generic
  maxTokensPerRequest: 24000,
  maxFilesPerRequest: 20,
  maxLinesPerFile: 1500,
  maxTotalLines: 12000,
  maxTotalTokens: 200000,
  responseTimeoutSec: 240,
  stableSec: 3,
  genericSite: '',
  bridgePort: 47821,
};

export async function getSettings() { return { ...DEFAULT_SETTINGS, ...(await storage.get('settings', {})) }; }

export async function saveSettings(patch) {
  const next = { ...(await getSettings()) };
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) throw new Error(`Unknown setting ${k}`);
    if (typeof v !== typeof DEFAULT_SETTINGS[k]) throw new Error(`Setting ${k} expects ${typeof DEFAULT_SETTINGS[k]}`);
    if (typeof v === 'number' && !(v > 0)) throw new Error(`Setting ${k} must be positive`);
    next[k] = v;
  }
  await storage.set('settings', next);
  return next;
}
