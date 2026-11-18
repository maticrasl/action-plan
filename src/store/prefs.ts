/** Small per-user preferences, each under its own storage key. */
import { userStorage } from './users';

export const STORAGE_KEY = 'actionplan.v1';

// Small per-device preferences (view, hidden relation types, hide-done, theme).
export const prefs = {
  // Without a fallback, a missing preference is undefined.
  get<T>(key: string, fallback?: T): T {
    try {
      const v = userStorage.getItem(`${STORAGE_KEY}.${key}`);
      return v === null ? (fallback as T) : JSON.parse(v);
    } catch (e) {
      return fallback as T;
    }
  },
  set(key: string, value: unknown): void {
    try {
      userStorage.setItem(`${STORAGE_KEY}.${key}`, JSON.stringify(value));
    } catch (e) {
      /* ignore */
    }
  },
};
