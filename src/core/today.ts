/** Today across all plans (feature 09): what is due, the routines today asks for, later this week, and this week's one thing. */
import type { Activity, Db, ISODate } from './model';
import type { Focus } from './journal';
import { db, setDb } from './state';
import { addDays, isDueDay, isRoutine, weekday, type Routine } from './routines/schedule';
import { periodProgress, routineToday } from './routines/keeping';
import { checkedOn } from './routines/checkins';

export interface PlanSource {
  plan: string;
  data: Db;
}
export interface TodayRow {
  plan: string;
  activity: Activity;
}
export interface TodayLists {
  due: TodayRow[];
  routines: TodayRow[];
  later: TodayRow[];
}

const ASKED = ['due', 'makeUp', 'any'];
const byDue = (a: TodayRow, b: TodayRow) => (a.activity.dueDate || '9999').localeCompare(b.activity.dueDate || '9999');

// The routine rules read the open plan; each plan is judged as if it were open.
export function asOpen<T>(data: Db, fn: () => T): T {
  const keep = db;
  setDb(data);
  try {
    return fn();
  } finally {
    setDb(keep);
  }
}

// `plans` in the order to show them (the open plan first); `now` is today.
export function todayItems(plans: PlanSource[], now: ISODate): TodayLists {
  const out: TodayLists = { due: [], routines: [], later: [] };
  const week = addDays(now, 7);
  plans.forEach(({ plan, data }) => {
    const due: TodayRow[] = [],
      later: TodayRow[] = [];
    data.activities.forEach(activity => {
      if (isRoutine(activity)) {
        if (ASKED.includes(asOpen(data, () => routineToday(activity)) as string)) out.routines.push({ plan, activity });
        return;
      }
      const d = activity.dueDate;
      if (activity.status === 'done' || !d) return;
      if (d <= now) due.push({ plan, activity });
      else if (d <= week) later.push({ plan, activity });
    });
    out.due.push(...due.sort(byDue));
    out.later.push(...later.sort(byDue));
  });
  return out;
}

const mondayOf = (day: ISODate) => addDays(day, -weekday(day));

// The focus of this week, with its plan's data; nothing when it is cleared, of another week, or gone.
export function currentFocus(focus: Focus | undefined, plans: PlanSource[], now: ISODate) {
  if (!focus?.item || focus.week !== mondayOf(now)) return null;
  const src = plans.find(p => p.plan === focus.plan),
    activity = src?.data.activities.find(a => a.id === focus.item);
  return src && activity ? { plan: src.plan, data: src.data, activity } : null;
}

// Done for the card: a step that is done; a routine whose week is met, or (set days) with no due day of
// the week left unticked.
export function focusDone(data: Db, a: Activity, now: ISODate): boolean {
  if (!isRoutine(a)) return a.status === 'done';
  return asOpen(data, () => {
    if (periodProgress(a as Routine, now).met) return true;
    const days = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(now), i));
    const due = days.filter(d => isDueDay(a as Routine, d));
    return due.length > 0 && due.every(d => checkedOn(a as Routine, d));
  });
}
