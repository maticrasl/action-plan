/** Reviews (feature 14), monthly and yearly rules: which month and year, a goal's progress on a past day, routines kept per week of a month. */
import type { Goal, ISODate, Period } from './model';
import { calPeriod, goalPeriod, isCumulative, lastPeriodTotal, stateTotal } from './cumulative';
import { isKeep } from './keep';
import { byActivities, byRoutines, countedActivities, goalRoutines, metricProgress, ownMetric } from './progress';
import { doneDay, achievedDay } from './done-log';
import { relsTo } from './relations';
import { db } from './state';
import { setToday, today } from './dates';
import { consistency } from './routines/keeping';
import { addDays, type Routine } from './routines/schedule';
import { weekKept } from './working';
import { isNum } from './util';

const prevMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
// The 1st to the 7th review the month just ended; from the 8th the month under way. 'yyyy-mm'.
export const reviewMonth = (now: ISODate): string =>
  Number(now.slice(8)) <= 7 ? prevMonth(now.slice(0, 7)) : now.slice(0, 7);
// December reviews the current year, January the one before, other months the year under way.
export const reviewYear = (now: ISODate): string =>
  now.slice(5, 7) === '01' ? String(Number(now.slice(0, 4)) - 1) : now.slice(0, 4);

export const monthRange = (ym: string) => calPeriod('month', `${ym}-01`);
export const shiftMonth = (ym: string, dir: number) =>
  dir < 0 ? prevMonth(ym) : addDays(monthRange(ym).to, 1).slice(0, 7);

// The goal's progress as it stood on `day` (in the open plan), or null when it has none to compare
// (a keep goal). An estimate where steps were finished before feature 13 kept their day.
export function progressAt(g: Goal, day: ISODate): number | null {
  if (isKeep(g)) return null;
  if (g.status === 'achieved' && (achievedDay(g) || '') <= day) return 100;
  if (byActivities(g)) {
    const counted = countedActivities(g);
    return counted.length ? (counted.filter(a => (doneDay(a) || '9999') <= day).length / counted.length) * 100 : 0;
  }
  if (byRoutines(g)) {
    // The rules read today(); they are asked as if it were that day.
    const was = today;
    setToday(() => day);
    try {
      const kept = goalRoutines(g)
        .map(a => consistency(a, g.startDate))
        .filter((v): v is number => v !== null);
      return kept.length ? (kept.reduce((s, v) => s + v, 0) / kept.length) * 100 : 0;
    } finally {
      setToday(was);
    }
  }
  if (!ownMetric(g)) return 0;
  const base = isNum(g.baseline) ? Number(g.baseline) : 0;
  const s = relsTo(g.id, 'measures')
    .map(r => db.states.find(x => x.id === r.from))
    .find(x => !!x);
  if (!s) return metricProgress(g, isNum(g.current) ? Number(g.current) : base);
  if (isCumulative(s)) {
    const period = goalPeriod(g);
    if (period === 'total') return metricProgress(g, stateTotal(s, 'total', day));
    const p = period as Period,
      before = addDays(calPeriod(p, day).from, -1);
    return metricProgress(g, Math.max(lastPeriodTotal(s, p, day), lastPeriodTotal(s, p, before)));
  }
  const last = (s.history || [])
    .filter(h => h.date <= day && isNum(h.value))
    .reduce<{ date: string; value: string } | null>((a, h) => (!a || h.date > a.date ? h : a), null);
  return metricProgress(g, last ? Number(last.value) : base);
}

// "Kept n of m weeks": the weeks Monday to Sunday that lie wholly in the month and have ended;
// weeks counted as in feature 16, where a week in between counts as not kept.
export function monthKept(a: Routine, ym: string): { n: number; m: number } {
  const { from, to } = monthRange(ym),
    now = today();
  let mon = addDays(from, (7 - ((new Date(from + 'T00:00Z').getUTCDay() + 6) % 7)) % 7);
  let n = 0,
    m = 0;
  for (; addDays(mon, 6) <= to && addDays(mon, 6) < now; mon = addDays(mon, 7)) {
    m++;
    if (weekKept(a, mon) === true) n++;
  }
  return { n, m };
}
