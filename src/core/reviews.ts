/** Reviews (feature 14), the weekly part: which week, what was not measured or ticked, what needs fixing, and the nav dot. */
import type { ISODate, State, Vision } from './model';
import type { Review } from './journal';
import { asOpen, type PlanSource, type TodayRow } from './today';
import {
  addDays,
  daysBetween,
  isDueDay,
  isFlexible,
  isRoutine,
  runsOn,
  weekday,
  type Routine,
} from './routines/schedule';
import { checkedOn } from './routines/checkins';
import { keptDay } from './routines/keeping';
import { lateSteps } from './replan';
import { TIPS_A } from './guidance/tips-a';
import { TIPS_B } from './guidance/tips-b';
import { entriesOf, isCumulative } from './cumulative';

export const MEASURE_MAX = 8; // states listed in "Measure"; the rest are counted

const mondayOf = (iso: ISODate) => addDays(iso, -weekday(iso));
// Monday to Thursday it reviews last week; Friday to Sunday the week under way. The Monday of it.
export const reviewWeek = (today: ISODate): ISODate => addDays(mondayOf(today), weekday(today) <= 3 ? -7 : 0);
// The week next week's one thing belongs to: from Friday the coming one, before that this one.
export const focusWeek = (today: ISODate): ISODate => addDays(mondayOf(today), weekday(today) >= 4 ? 7 : 0);

// The ISO week of a Monday, as stored: '2026-W47'. The week belongs to the year of its Thursday.
export function weekPeriod(monday: ISODate): string {
  const thu = addDays(monday, 3),
    year = thu.slice(0, 4);
  const jan4 = `${year}-01-04`,
    week1 = mondayOf(jan4);
  const n = Math.round((Date.parse(monday) - Date.parse(week1)) / (7 * 864e5)) + 1;
  return `${year}-W${String(n).padStart(2, '0')}`;
}

// The Monday of a stored week, '2026-W47'.
export function weekMonday(period: string): ISODate {
  const [y, w] = period.split('-W').map(Number);
  return addDays(mondayOf(`${y}-01-04`), (w - 1) * 7);
}

// The latest value or amount of a state, and whether it has one in [from, to].
function lastOf(s: State): { date: ISODate; value: string } | undefined {
  const list = isCumulative(s)
    ? entriesOf(s).map(e => ({ date: e.date, value: e.amount }))
    : (s.history || []).map(h => ({ date: h.date, value: h.value }));
  return list.reduce<{ date: ISODate; value: string } | undefined>(
    (a, x) => (!a || x.date > a.date ? x : a),
    undefined,
  );
}
const inRangeOf = (s: State, from: ISODate, to: ISODate) =>
  (isCumulative(s) ? entriesOf(s).map(e => e.date) : (s.history || []).map(h => h.date)).some(
    d => d >= from && d <= to,
  );

// "Measure": states that measure an active goal and have no value (or amount) from the week; the
// longest unmeasured first, at most eight, and how many more.
export function unmeasured(sources: PlanSource[], from: ISODate, to: ISODate) {
  const all = sources.flatMap(({ plan, data }) =>
    asOpen(data, () =>
      data.states
        .filter(s =>
          data.relations.some(
            r =>
              r.type === 'measures' && r.from === s.id && data.goals.some(g => g.id === r.to && g.status === 'active'),
          ),
        )
        .filter(s => !inRangeOf(s, from, to))
        .map(state => ({ plan, state, last: lastOf(state) })),
    ),
  );
  all.sort((a, b) => (a.last?.date || '').localeCompare(b.last?.date || ''));
  return { list: all.slice(0, MEASURE_MAX), more: Math.max(0, all.length - MEASURE_MAX) };
}

// "Forgot to tick something?": routines with a due day in the week (up to today) that is neither ticked
// nor made up, and steps due in the week that are not done.
// shortcut: flexible routines (any days a week) have no due day and are left out; list them when asked.
export function forgotten(sources: PlanSource[], from: ISODate, to: ISODate, now: ISODate = to) {
  const out: { routines: TodayRow[]; steps: TodayRow[] } = { routines: [], steps: [] };
  const last = to < now ? to : now;
  for (const { plan, data } of sources)
    asOpen(data, () =>
      data.activities.forEach(a => {
        if (!isRoutine(a)) {
          if (a.status !== 'done' && a.dueDate && a.dueDate >= from && a.dueDate <= to)
            out.steps.push({ plan, activity: a });
          return;
        }
        const r = a as Routine;
        if (isFlexible(r) || last < from) return;
        const kept = keptDay(r);
        if (daysBetween(from, last).some(d => runsOn(r, d) && isDueDay(r, d) && !checkedOn(r, d) && !kept(d)))
          out.routines.push({ plan, activity: a });
      }),
    );
  return out;
}

// "Fix the plan": what needs a decision, by the planned tips' own rules (one line each), and late steps.
export const FIX_TIPS = ['stuck-step', 'routine-low', 'goal-past', 'goal-behind', 'waiting'];
export interface FixLine {
  plan: string;
  tip: string; // 'late' or a tip id
  id?: string;
  target?: string; // the item the button opens instead (waiting: the step not started)
  vars?: Record<string, string | number>;
}
export function fixLines(sources: PlanSource[], visions: Vision[], now: ISODate): FixLine[] {
  const tips = [...TIPS_A, ...TIPS_B].filter(t => FIX_TIPS.includes(t.id));
  return sources.flatMap(({ plan, data }) =>
    asOpen(data, () => {
      const late = lateSteps(data, now).length;
      const lines: FixLine[] = late ? [{ plan, tip: 'late', vars: { n: late } }] : [];
      for (const id of FIX_TIPS)
        tips
          .find(t => t.id === id)!
          .hits({ db: data, visions, today: now })
          .forEach(h => lines.push({ plan, tip: id, id: h.id, target: h.target, vars: h.vars }));
      return lines;
    }),
  );
}

// The finished review of a period that was finished last (two devices may each have finished one).
export const latestReview = (reviews: Review[], kind: Review['kind'], period: string): Review | undefined =>
  reviews
    .filter(r => r.kind === kind && r.period === period && r.doneAt)
    .sort((a, b) => b.doneAt!.localeCompare(a.doneAt!))[0];

// The dot on the Review item: the week that ended last Sunday has no finished review, and a goal is active.
export function reviewDot(reviews: Review[], sources: PlanSource[], now: ISODate): boolean {
  const active = sources.some(s => s.data.goals.some(g => g.status === 'active'));
  return active && !latestReview(reviews, 'week', weekPeriod(addDays(mondayOf(now), -7)));
}
