/** Tip history: what is stored (preference `tips`, also synced), reading it safely and merging two copies. */
import type { ISODate, ISOTime } from '../model';

export interface TipShown {
  n: number; // times shown (a day as the tip of the day counts once)
  last: ISODate; // the last day it was the tip of the day
  closed?: true; // ×: never again for this key
  snoozed?: ISODate; // Not now: hidden until this day
}
export interface Tips {
  off: boolean; // Settings › Display › Tips switched off
  offAt?: ISOTime; // when the switch last changed, so the later change wins on sync
  day?: ISODate; // the day the tip of the day was chosen
  current?: string | null; // its key, or null when none was chosen that day
  shown: Record<string, TipShown>;
  since: Record<string, ISODate>; // facts the tips saw first on this day (e.g. `under40:<goalId>`)
  [other: string]: unknown; // fields a newer version wrote, kept as they are
}
export const emptyTips = (): Tips => ({ off: false, shown: {}, since: {} });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function readShown(v: unknown): TipShown | null {
  if (!isObj(v) || typeof v.n !== 'number' || !isStr(v.last)) return null;
  const s: TipShown = { n: v.n, last: v.last };
  if (v.closed === true) s.closed = true;
  if (isStr(v.snoozed)) s.snoozed = v.snoozed;
  return s;
}

export function readTips(v: unknown): Tips {
  if (!isObj(v)) return emptyTips();
  const t: Tips = { ...v, off: v.off === true, shown: {}, since: {} };
  if (!isStr(v.offAt)) delete t.offAt;
  if (!isStr(v.day)) delete t.day;
  if (!isStr(v.current) && v.current !== null) delete t.current;
  if (isObj(v.shown))
    Object.entries(v.shown).forEach(([k, s]) => {
      const r = readShown(s);
      if (r) t.shown[k] = r;
    });
  if (isObj(v.since))
    Object.entries(v.since).forEach(([k, d]) => {
      if (isStr(d)) t.since[k] = d;
    });
  return t;
}

const later = (a?: string, b?: string) => ((a || '') >= (b || '') ? a : b);
const earlier = (a?: string, b?: string) => (!a ? b : !b ? a : a <= b ? a : b);

function mergeShown(a: TipShown | undefined, b: TipShown | undefined): TipShown {
  if (!a || !b) return (a || b) as TipShown;
  const s: TipShown = { n: Math.max(a.n, b.n), last: later(a.last, b.last) as ISODate };
  const snoozed = later(a.snoozed, b.snoozed);
  if (snoozed) s.snoozed = snoozed;
  if (a.closed || b.closed) s.closed = true;
  return s;
}

// The tip of the day from the copy with the later day; on the same day a chosen tip beats none,
// then the smaller key, so both devices settle on the same one.
function pickDay(a: Tips, b: Tips): Pick<Tips, 'day' | 'current'> {
  if ((a.day || '') !== (b.day || '')) return (a.day || '') > (b.day || '') ? a : b;
  if (!a.current || !b.current) return a.current ? a : b;
  return a.current <= b.current ? a : b;
}

export function mergeTips(a: Tips | undefined, b: Tips | undefined): Tips {
  if (!a || !b) return (a || b || emptyTips()) as Tips;
  const shown: Record<string, TipShown> = {};
  new Set([...Object.keys(a.shown), ...Object.keys(b.shown)]).forEach(k => (shown[k] = mergeShown(a.shown[k], b.shown[k])));
  const since: Record<string, ISODate> = {};
  new Set([...Object.keys(a.since), ...Object.keys(b.since)]).forEach(k => (since[k] = earlier(a.since[k], b.since[k])!));
  const sw = (b.offAt || '') > (a.offAt || '') ? b : a;
  const day = pickDay(a, b);
  const t: Tips = { ...b, ...a, off: sw.off, shown, since };
  if (sw.offAt) t.offAt = sw.offAt;
  else delete t.offAt;
  if (day.day) t.day = day.day;
  else delete t.day;
  if (day.current !== undefined) t.current = day.current;
  else delete t.current;
  return t;
}
