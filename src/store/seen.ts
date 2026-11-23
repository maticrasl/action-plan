/** Small facts about using the app on this device, not plan data: the last weekly review, a full export made, days opened, views seen. */
import type { ISODate } from '../core/model';
import { prefs } from './prefs';

// Per user, on this device; never synced (tip history syncs, so a once-only tip still shows once).
// The walkthrough and the tips read them.
export interface Seen {
  lastReview?: ISODate; // the day "Review done" was last pressed
  exported?: boolean; // a full copy of a plan, or a backup of everything, was saved
  days?: ISODate[]; // days the app was open while Getting started or tips were on (the last 30)
  views?: Record<string, true>; // views opened then, in a plan that is not a sample
  menu?: true; // a card's menu was opened
  templates?: true; // the templates were opened
  discovery?: true; // Find your visions was opened (feature 01); nothing reads it yet
  [other: string]: unknown; // facts a newer version wrote, kept as they are
}

export function getSeen(): Seen {
  const v = prefs.get<unknown>('seen', {});
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const seen = { ...(v as Seen) };
  if (typeof seen.lastReview !== 'string') delete seen.lastReview;
  if (typeof seen.exported !== 'boolean') delete seen.exported;
  if (seen.menu !== true) delete seen.menu;
  if (seen.templates !== true) delete seen.templates;
  if (seen.discovery !== true) delete seen.discovery;
  if (Array.isArray(seen.days)) seen.days = seen.days.filter(d => typeof d === 'string');
  else delete seen.days;
  if (!seen.views || typeof seen.views !== 'object' || Array.isArray(seen.views)) delete seen.views;
  return seen;
}

export const markSeen = (facts: Partial<Seen>) => prefs.set('seen', { ...getSeen(), ...facts });

// Writes only when the day or view is new.
export function markDay(day: ISODate) {
  const days = getSeen().days || [];
  if (!days.includes(day)) markSeen({ days: [...days, day].sort().slice(-30) });
}
export function markView(view: string) {
  const views = getSeen().views || {};
  if (!views[view]) markSeen({ views: { ...views, [view]: true } });
}
