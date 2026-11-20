/** Recently deleted as stored (preference `trash`, per user, synced): read, add, remove for good. */
import { addEntry, forget, normalizeTrash, pruneTrash, type Trash, type TrashEntry } from '../core/trash';
import { STORAGE_KEY } from './prefs';
import { userStorage } from './users';

const KEY = `${STORAGE_KEY}.trash`;

export const hasTrash = (): boolean => {
  try {
    return userStorage.getItem(KEY) !== null;
  } catch (e) {
    return false;
  }
};
export function getTrash(): Trash {
  try {
    return pruneTrash(normalizeTrash(JSON.parse(userStorage.getItem(KEY) as string)));
  } catch (e) {
    return normalizeTrash(null);
  }
}
// False when it did not fit.
export function saveTrash(t: Trash): boolean {
  try {
    userStorage.setItem(KEY, JSON.stringify(t));
    return true;
  } catch (e) {
    return false;
  }
}

// 'large': the entry alone is over the cap; 'full': storage refused it. The deletion goes ahead either way.
export function trashAdd(entry: TrashEntry | null): 'ok' | 'large' | 'full' {
  if (!entry) return 'ok';
  const next = addEntry(getTrash(), entry);
  if (!next) return 'large';
  return saveTrash(next) ? 'ok' : 'full';
}

export const trashForget = (ids: string[]) => ids.length && saveTrash(forget(getTrash(), ids));
