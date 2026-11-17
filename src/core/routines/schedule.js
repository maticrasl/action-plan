/** Routines' schedules: which days a routine is due on, its periods and its last occurrence. */
import { today } from '../dates';
import { dayNum, dayStr, isoOf } from '../days';

/* ---------- Routines: activities that repeat ----------
   `repeat` is { every, unit: 'day' | 'week' | 'month' | 'year', ... }, like a calendar's custom
   recurrence: every `every` days, weeks, months or years, counted from the start date.
   - week: `days` (Monday = 0) it falls on, or `times`: any that many days per period;
   - month: `on` 'day' (`day` of the month, or the start's; 29–31 fall on the last day of shorter
     months), 'lastDay', 'nth' (the `nth` – 1 to 5, or -1 for the last – `weekday` of the month),
     or `times`: any that many days per period. Older routines store 'weekday' or 'last', which
     meant the start's n-th or last weekday; `sched` reads them as 'nth';
   - year: on the start's day and month;
   - `count`: it ends after that many occurrences (the due date is set to the last one).
   Older plans store { times, per: 'week' | 'month' } or { days }; `sched` reads both.
   `checkins` maps a date to 1 (done) or 0 (unticked, kept so sync can merge it). A routine runs
   from its start date to its due date, if any. Weeks start on Monday. */

export const isRoutine = a => !!a?.repeat;

// Monday = 0 (day 0 of the epoch, 1 January 1970, was a Thursday).
export const weekday = iso => (dayNum(iso) + 3) % 7;
export const addDays = (iso, n) => dayStr(dayNum(iso) + n);
export const daysBetween = (from, to) => Array.from({ length: Math.max(0, dayNum(to) - dayNum(from) + 1) }, (_, i) => addDays(from, i));
export const routineStart = a => a.startDate || a.createdAt || today();

export const runsOn = (a, iso) => iso >= routineStart(a) && !(a.dueDate && iso > a.dueDate);
export const monthDay = iso => Number(iso.slice(8));
export const monthLength = iso => monthDay(isoOf(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0));
export const nthInMonth = iso => Math.ceil(monthDay(iso) / 7);
export const lastInMonth = iso => monthDay(iso) + 7 > monthLength(iso);

export function sched(a) {
  const r = a.repeat;
  if (r.unit) return r.unit === 'month' && !r.times ? monthRule({ every: 1, ...r }, routineStart(a)) : { every: 1, ...r };
  return r.days ? { every: 1, unit: 'week', days: r.days } : { every: 1, unit: r.per === 'month' ? 'month' : 'week', times: r.times };
}
// A monthly rule with everything it falls on spelled out (older ones took it from the start date).
export function monthRule(s, start) {
  if (s.on === 'lastDay') return s;
  if (s.on === 'weekday' || s.on === 'last') return { ...s, on: 'nth', nth: s.on === 'last' ? -1 : nthInMonth(start), weekday: weekday(start) };
  if (s.on === 'nth') return { ...s, nth: s.nth ?? nthInMonth(start), weekday: s.weekday ?? weekday(start) };
  return { ...s, on: 'day', day: s.day || monthDay(start) };
}

// Flexible routines ask for a number of days per period; fixed ones fall on set days.
export const isFlexible = a => !!sched(a).times;

// Number of the day, week, month or year a date falls in, and the first day of one.
export function unitIndex(iso, unit) {
  const [y, m] = iso.split('-').map(Number);
  return { day: dayNum(iso), week: Math.floor((dayNum(iso) + 3) / 7), month: y * 12 + m - 1, year: y }[unit];
}
export function unitFrom(i, unit) {
  return { day: () => dayStr(i), week: () => dayStr(i * 7 - 3), month: () => isoOf(Math.floor(i / 12), i % 12, 1), year: () => isoOf(i, 0, 1) }[unit]();
}

// Whether a fixed routine falls on a date (a flexible one may be done on any day).
export function isDueDay(a, iso) {
  const s = sched(a);
  if (s.times) return true;
  const start = routineStart(a);
  if ((unitIndex(iso, s.unit) - unitIndex(start, s.unit)) % s.every) return false;
  if (s.unit === 'week') return (s.days || [weekday(start)]).includes(weekday(iso));
  if (s.unit === 'month') {
    if (s.on === 'lastDay') return monthDay(iso) === monthLength(iso);
    if (s.on === 'nth') return weekday(iso) === s.weekday && (s.nth < 0 ? lastInMonth(iso) : nthInMonth(iso) === s.nth);
    return monthDay(iso) === Math.min(s.day, monthLength(iso));
  }
  if (s.unit === 'year') return iso.slice(5) === start.slice(5);
  return true;
}

// The period progress is shown for: a flexible routine's own (every 2 weeks: two weeks from the
// start's week), or a fixed routine's calendar week (daily and weekly), month or year.
export const periodUnit = a => { const s = sched(a); return s.times ? s.unit : s.unit === 'day' ? 'week' : s.unit; };

export function periodOf(a, iso) {
  const s = sched(a), unit = periodUnit(a);
  const span = s.times ? s.every : 1;
  const first = unitIndex(routineStart(a), unit);
  const i = first + Math.floor((unitIndex(iso, unit) - first) / span) * span;
  return { from: unitFrom(i, unit), to: addDays(unitFrom(i + span, unit), -1) };
}

// The date of the `count`-th occurrence: the last due day, or the end of the last period needed.
export function lastOccurrence(a, count) {
  const s = sched(a);
  if (s.times) {
    let p = periodOf(a, routineStart(a));
    for (let k = 1; k < Math.ceil(count / s.times); k++) p = periodOf(a, addDays(p.to, 1));
    return p.to;
  }
  let n = 0;
  for (let d = routineStart(a), i = 0; i < 36600; d = addDays(d, 1), i++) if (isDueDay(a, d) && ++n >= count) return d;
  return '';
}

// The first day from `from` on which a fixed routine is due, or '' when it is not due again.
export function nextDueDay(a, from = today()) {
  const start = routineStart(a) > from ? routineStart(a) : from;
  for (let d = start, i = 0; i < 36600 && runsOn(a, d); d = addDays(d, 1), i++) if (isDueDay(a, d)) return d;
  return '';
}
