/** Keep goals (feature 07): whether a measurement stays within a range, period by period. */
import { calPeriod, entriesOf, goalPeriod, isCumulative, stateTotal } from './cumulative';
import { dayNum } from './days';
import { today } from './dates';
import type { Goal, ISODate, Keep, Period, State } from './model';
import { measuringState } from './progress';
import { addDays } from './routines/schedule';
import { isNum } from './util';

export type Mark = 'in' | 'out' | 'unknown';
export type KeepNow =
  | { kind: 'in' | 'out'; value: number; dist: number; date?: ISODate } // dist: + above, - below, 0 in range
  | { kind: 'stale'; value: number; date: ISODate }
  | { kind: 'none' };

export const STALE_DAYS = 28; // a plain state's value older than this says nothing about the range

export const isKeep = (g: Goal | null | undefined): g is Goal & { keep: Keep } => !!g?.keep;
export const inRange = (k: Keep, v: number): boolean =>
  (k.min === undefined || v >= k.min) && (k.max === undefined || v <= k.max);
// How far a value is outside: positive above At most, negative below At least, 0 inside.
const distance = (k: Keep, v: number): number =>
  k.max !== undefined && v > k.max
    ? Number((v - k.max).toFixed(9))
    : k.min !== undefined && v < k.min
      ? Number((v - k.min).toFixed(9))
      : 0;

// A stored `keep` as normalize keeps it: numbers only, at least one, min below max.
export function validKeep(k: unknown): Keep | undefined {
  if (!k || typeof k !== 'object') return undefined;
  const { min, max } = k as Record<string, unknown>;
  const out: Keep = {};
  if (isNum(min)) out.min = Number(min);
  if (isNum(max)) out.max = Number(max);
  if (out.min === undefined && out.max === undefined) return undefined;
  if (out.min !== undefined && out.max !== undefined && out.min >= out.max) return undefined;
  return out;
}

const older = (date: ISODate, at: ISODate) => dayNum(at) - dayNum(date) > STALE_DAYS;
// A plain state's latest measurement on or before a day.
function valueAt(s: State, at: ISODate): { value: number; date: ISODate } | null {
  let best: { value: number; date: ISODate } | null = null;
  for (const h of s.history || [])
    if (h.date <= at && isNum(h.value) && (!best || h.date > best.date))
      best = { value: Number(h.value), date: h.date };
  return best;
}
// The unit a keep goal is judged in: weeks for a plain state, the goal's period for one that adds up.
const unitOf = (g: Goal, s: State): Period =>
  isCumulative(s) && goalPeriod(g) !== 'total' ? (goalPeriod(g) as Period) : 'week';

// One mark for each complete period since the goal's start, oldest first.
export function keepMarks(g: Goal): { unit: Period; marks: Mark[] } | null {
  const s = measuringState(g);
  if (!isKeep(g) || !s) return null;
  const unit = unitOf(g, s);
  const first = isCumulative(s) ? entriesOf(s).reduce((d, e) => (!d || e.date < d ? e.date : d), '') : '';
  const marks: Mark[] = [];
  const now = today();
  for (
    let p = calPeriod(unit, g.startDate || now);
    p.to < now && marks.length < 5000;
    p = calPeriod(unit, addDays(p.to, 1))
  ) {
    if (isCumulative(s))
      marks.push(!first || p.to < first ? 'unknown' : inRange(g.keep, stateTotal(s, unit, p.from)) ? 'in' : 'out');
    else {
      const v = valueAt(s, p.to);
      marks.push(!v || older(v.date, p.to) ? 'unknown' : inRange(g.keep, v.value) ? 'in' : 'out');
    }
  }
  return { unit, marks };
}

// Periods in range out of those that can be judged; null when none can.
export function keepShare(g: Goal): { n: number; total: number } | null {
  const marks = keepMarks(g)?.marks.filter(m => m !== 'unknown') || [];
  return marks.length ? { n: marks.filter(m => m === 'in').length, total: marks.length } : null;
}

// Where the goal stands now.
export function keepNow(g: Goal): KeepNow {
  const s = measuringState(g);
  if (!isKeep(g) || !s) return { kind: 'none' };
  const judge = (value: number, date?: ISODate): KeepNow => ({
    kind: inRange(g.keep, value) ? 'in' : 'out',
    value,
    dist: distance(g.keep, value),
    date,
  });
  if (!isCumulative(s)) {
    const v = valueAt(s, '9999-12-31');
    if (!v) return { kind: 'none' };
    return older(v.date, today()) ? { kind: 'stale', ...v } : judge(v.value, v.date);
  }
  if (!entriesOf(s).length) return { kind: 'none' };
  const unit = unitOf(g, s);
  // The running period decides only when the rest of it cannot change the answer.
  const running = stateTotal(s, unit);
  if (g.keep.max !== undefined && running > g.keep.max) return judge(running);
  if (g.keep.max === undefined && running >= g.keep.min!) return judge(running);
  const last = calPeriod(unit, addDays(calPeriod(unit, today()).from, -1));
  const first = entriesOf(s).reduce((d, e) => (!d || e.date < d ? e.date : d), '');
  // Nothing complete yet: what is in range so far shows, "at least" not yet met waits.
  if (last.to < first) return inRange(g.keep, running) ? judge(running) : { kind: 'none' };
  return judge(stateTotal(s, unit, last.from));
}
