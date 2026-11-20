/** "Is it working?": whether a state moved more in the weeks a routine improving it was kept than in the others. */
import { isNum } from './util';
import { dayNum } from './days';
import { stateSeries } from './series';
import { entriesOf, isCumulative, sumOf } from './cumulative';
import { keptDay } from './routines/keeping';
import { checkedOn } from './routines/checkins';
import {
  addDays,
  daysBetween,
  isDueDay,
  isRoutine,
  routineStart,
  sched,
  unitFrom,
  unitIndex,
} from './routines/schedule';
import type { Activity, Entry, Goal, ISODate, State } from './model';
import type { Routine } from './routines/schedule';

// The limits are part of the design (see docs/features/16-is-it-working.md): a result that cannot be shown honestly is not shown.
export const WORK = { MIN_WEEKS: 4, MARGIN: 0.5, KEPT: 0.75, MISSED: 0.5, GAP_DAYS: 21, MAX_WEEKS: 52 } as const;

// better/worse: toward or away from the goal's target; more/less: no goal says which way is good.
export type WorkKind = 'better' | 'worse' | 'more' | 'less' | 'none' | 'few' | 'seldom';
export interface WorkSide {
  n: number;
  mean: number;
}
export interface Work {
  kind: WorkKind;
  kept: WorkSide;
  missed: WorkSide;
  unit: string;
}

// Whether the week from Monday `mon` counts as kept (true), not kept (false), or neither (null).
export function weekKept(a: Routine, mon: ISODate, kept: (d: ISODate) => boolean = keptDay(a)): boolean | null {
  const days = daysBetween(mon, addDays(mon, 6)),
    s = sched(a);
  if (s.times) return days.filter(d => checkedOn(a, d)).length >= Math.ceil(s.times / s.every);
  const due = days.filter(d => isDueDay(a, d));
  if (!due.length) return null;
  const share = due.filter(kept).length / due.length;
  return share >= WORK.KEPT ? true : share < WORK.MISSED ? false : null;
}

// A plain state's value on a day, on the straight line between the measurements around it; none
// outside the first-to-last measurement or inside a gap longer than 21 days.
export function valueAt(s: State, iso: ISODate, series = stateSeries(s)): number | null {
  const d = dayNum(iso),
    i = series.findIndex(p => p.day >= d);
  if (i < 0) return null;
  const n = series[i];
  if (n.day === d) return n.value;
  const p = series[i - 1];
  if (!p || n.day - p.day > WORK.GAP_DAYS) return null;
  return p.value + ((n.value - p.value) * (d - p.day)) / (n.day - p.day);
}

const round = (x: number) => Number(x.toFixed(9));
const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const squares = (xs: number[]) => xs.reduce((n, x) => n + (x - mean(xs)) ** 2, 0);

// The two groups' weekly changes compared: their difference in pooled standard deviations, read
// in the good direction `way` (1 higher, -1 lower, 0 none known).
export function verdict(kept: number[], missed: number[], way: number): WorkKind {
  if (kept.length < WORK.MIN_WEEKS || missed.length < WORK.MIN_WEEKS) return 'few';
  const diff = round(mean(kept) - mean(missed)),
    sd = Math.sqrt((squares(kept) + squares(missed)) / (kept.length + missed.length - 2));
  const d = sd < 1e-9 ? (diff === 0 ? 0 : Math.sign(diff) * Infinity) : round(diff / sd);
  if (Math.abs(d) < WORK.MARGIN) return 'none';
  if (!way) return d > 0 ? 'more' : 'less';
  return d * way > 0 ? 'better' : 'worse';
}

// Which way is good for the state: toward the target of the first active goal by deadline that it
// measures and that has a numeric target; 0 when none says.
export function goodWay(goals: Goal[], s: State): number {
  const g = goals
    .filter(x => x.status === 'active' && isNum(x.target))
    .sort((x, y) => (x.deadline || '9999').localeCompare(y.deadline || '9999'))[0];
  if (!g) return 0;
  const last = stateSeries(s).at(-1)?.value;
  const from = isNum(g.baseline) ? Number(g.baseline) : isCumulative(s) ? 0 : (last ?? Number(g.target));
  return Math.sign(Number(g.target) - from);
}

// The state's change in each week a routine can be compared over, newest first: complete weeks
// (Monday to Sunday) before `today` in which the routine ran throughout, at most 52.
function weekChanges(a: Routine, s: State, today: ISODate) {
  const start = routineStart(a),
    out: { mon: ISODate; change: number }[] = [];
  const series = stateSeries(s),
    entries = entriesOf(s),
    first = isCumulative(s) ? entries.map(e => e.date).sort()[0] : series[0]?.date;
  if (!first) return out;
  const byWeek = new Map<number, Entry[]>();
  entries.forEach(e => {
    const i = unitIndex(e.date, 'week');
    byWeek.set(i, [...(byWeek.get(i) || []), e]);
  });
  for (
    let mon = addDays(unitFrom(unitIndex(today, 'week'), 'week'), -7);
    out.length < WORK.MAX_WEEKS;
    mon = addDays(mon, -7)
  ) {
    const sun = addDays(mon, 6);
    if (mon < start || sun < first) break;
    if (a.dueDate && sun > a.dueDate) continue;
    if (isCumulative(s)) {
      out.push({
        mon,
        change: sumOf(byWeek.get(unitIndex(mon, 'week')) || []),
      });
      continue;
    }
    const v0 = valueAt(s, addDays(mon, -1), series),
      v1 = valueAt(s, sun, series);
    if (v0 !== null && v1 !== null) out.push({ mon, change: round(v1 - v0) });
  }
  return out;
}

// The comparison for one routine and one state it improves; null when there is nothing to compare
// (a one-time activity, no measurements, or amounts that come from this routine's own ticks).
export function compare(a: Activity, s: State, goals: Goal[], today: ISODate): Work | null {
  if (!isRoutine(a)) return null;
  const unit = s.unit || '';
  const side = (xs: number[]) => ({ n: xs.length, mean: mean(xs) });
  if (['month', 'year'].includes(sched(a).unit)) return { kind: 'seldom', kept: side([]), missed: side([]), unit };
  const weeks = weekChanges(a, s, today);
  if (!weeks.length) return null;
  if (isCumulative(s)) {
    const from = weeks.at(-1)!.mon,
      to = addDays(weeks[0].mon, 6);
    if (entriesOf(s).some(e => e.routine === a.id && e.date >= from && e.date <= to)) return null;
  }
  const kept: number[] = [],
    missed: number[] = [],
    isKept = keptDay(a);
  weeks.forEach(w => {
    const k = weekKept(a, w.mon, isKept);
    if (k !== null) (k ? kept : missed).push(w.change);
  });
  return { kind: verdict(kept, missed, goodWay(goals, s)), kept: side(kept), missed: side(missed), unit };
}
