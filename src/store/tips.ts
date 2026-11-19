/** The tip history (preference `tips`, per user, synced): read, and saved merged with what is stored. */
import { emptyTips, mergeTips, readTips, type Tips } from '../core/guidance/tip-history';
import { prefs } from './prefs';

export const getTips = (): Tips => readTips(prefs.get<unknown>('tips'));
// Whether this user has any tip history yet (sync leaves the section out until then).
export const hasTips = (): boolean => prefs.get<unknown>('tips') !== undefined;

// Merges with what is stored, so another tab's × or a synced copy is never undone.
export function saveTips(t: Tips): Tips {
  const merged = mergeTips(t, hasTips() ? getTips() : emptyTips());
  prefs.set('tips', merged);
  return merged;
}

// Settings › Display › Tips.
export const setTipsOff = (off: boolean) => saveTips({ ...getTips(), off, offAt: new Date().toISOString() });
