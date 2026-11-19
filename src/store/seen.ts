/** Small facts about using the app on this device, not plan data: the last weekly review, a full export made. */
import type { ISODate } from '../core/model';
import { prefs } from './prefs';

// Per user, on this device; never synced. The walkthrough and the tips add their own facts here.
export interface Seen {
  lastReview?: ISODate; // the day "Review done" was last pressed
  exported?: boolean; // a full copy of a plan, or a backup of everything, was saved
  [other: string]: unknown; // facts a newer version wrote, kept as they are
}

export function getSeen(): Seen {
  const v = prefs.get<unknown>('seen', {});
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const seen = { ...(v as Seen) };
  if (typeof seen.lastReview !== 'string') delete seen.lastReview;
  if (typeof seen.exported !== 'boolean') delete seen.exported;
  return seen;
}

export const markSeen = (facts: Partial<Seen>) => prefs.set('seen', { ...getSeen(), ...facts });
