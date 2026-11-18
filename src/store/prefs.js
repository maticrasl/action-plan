/** Small per-user preferences, each under its own storage key. */
import { userStorage } from './users';

export const STORAGE_KEY = 'actionplan.v1';

// Small per-device preferences (view, hidden relation types, hide-done, theme).
export const prefs = {
  get(key, fallback) {
    try { const v = userStorage.getItem(`${STORAGE_KEY}.${key}`); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(key, value) {
    try { userStorage.setItem(`${STORAGE_KEY}.${key}`, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },
};
