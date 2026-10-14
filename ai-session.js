import { DEFAULT_AI_BASE_URL } from './ai-api.js';

// Deliberately outside app state, backups, storage, and rendered HTML.
const config = { baseURL: DEFAULT_AI_BASE_URL, apiKey: '', model: '' };
const subscribers = new Set();

export function getAIConfig() { return { ...config }; }

export function setAIConfig(patch = {}) {
  let changed = false;
  for (const name of ['baseURL', 'apiKey', 'model']) {
    if (!Object.hasOwn(patch, name)) continue;
    const value = String(patch[name] ?? '');
    if (config[name] !== value) { config[name] = value; changed = true; }
  }
  if (changed) for (const subscriber of subscribers) {
    // AI UI subscribers must never bring down the journal or one another.
    try { subscriber(getAIConfig()); } catch {}
  }
  return getAIConfig();
}

export function subscribeAIConfig(callback) {
  if (typeof callback !== 'function') return () => {};
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export function clearAIKey() { setAIConfig({ apiKey: '' }); }

// Clear before the browser can retain the page in its back/forward cache.
if (typeof window !== 'undefined') window.addEventListener('pagehide', clearAIKey);
