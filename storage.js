import { freshState, normalize } from './model.js';
export const STORAGE_KEY = 'jizhi-meals-v1';
export function load(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { state: freshState(), warnings: [], raw: null, locked: false };
  try { return { ...normalize(JSON.parse(raw)), raw, locked: false }; }
  catch (error) { return { state: freshState(), warnings: [error.message], raw, locked: true }; }
}
export function persist(storage, state) {
  const next = { ...state, updatedAt: new Date().toISOString() };
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
