/** Tips, class B: the method, and the moments of the calendar (see docs/guidance/03-tips.md). */
import type { Activity } from '../model';
import { goalProgress, isSmart, ownMetric, smartCheck, treeActivities } from '../progress';
import { isRoutine } from '../routines/schedule';
import { calPeriod, isCumulative } from '../cumulative';
import { descendants, relsFrom } from '../relations';
import * as L from './tip-limits';
import {
  activeGoals,
  addMonths,
  dayOf,
  daysFrom,
  firstItemDay,
  goalAge,
  lastMeasured,
  measures,
  monthsFrom,
  statusSince,
  steps,
  type Tip,
  type TipHit,
} from './tip-facts';

const named = (x: { id: string; title: string }, vars: TipHit['vars'] = {}): TipHit => ({
  id: x.id,
  vars: { name: x.title, ...vars },
});
const later = (a?: string, b?: string) => ((a || '') > (b || '') ? a : b);
const LETTERS = ['S', 'M', 'A', 'R', 'T'] as const;

export const TIPS_B: Tip[] = [
  {
    id: 'no-steps',
    cls: 'B',
    view: 'goals',
    cooldown: L.COOLDOWN_B,
    guide: 'first-steps',
    action: 'addActivity',
    hits: ({ db, today }) =>
      activeGoals(db)
        .filter(g => goalAge(g, today) > L.NO_STEPS_AGE && !treeActivities(g).length)
        .sort((x, y) => goalAge(y, today) - goalAge(x, today))
        .map(g => named(g)),
  },
  {
    id: 'steps-ran-out',
    cls: 'B',
    view: 'goals',
    cooldown: L.COOLDOWN_B,
    guide: 'first-steps',
    action: 'addActivity',
    hits: ({ db }) =>
      activeGoals(db)
        .filter(g => {
          const tree = treeActivities(g);
          const once = tree.filter(a => !isRoutine(a));
          return (
            once.length > 0 && once.every(a => a.status === 'done') && !tree.some(isRoutine) && goalProgress(g) < 100
          );
        })
        .map(g => named(g)),
  },
  {
    id: 'no-dates',
    cls: 'B',
    view: 'activities',
    cooldown: L.COOLDOWN_B,
    guide: 'not-starting',
    action: 'activities',
    hits: ({ db }) => {
      const n = steps(db).filter(a => a.status === 'todo' && !a.dueDate).length;
      return n >= L.NO_DATES ? [{ vars: { n } }] : [];
    },
  },
  {
    id: 'only-result',
    cls: 'B',
    view: 'goals',
    cooldown: L.COOLDOWN_B,
    guide: 'h-routines',
    action: 'addRoutine',
    hits: ({ db, today }) =>
      activeGoals(db)
        .filter(g => ownMetric(g) && goalAge(g, today) > L.ONLY_RESULT_AGE && !treeActivities(g).some(isRoutine))
        .map(g => named(g)),
  },
  {
    id: 'stale-state',
    cls: 'B',
    view: 'graphs',
    cooldown: L.COOLDOWN_B,
    guide: 'h-states',
    action: 'recordValue',
    hits: ({ db, today }) => {
      const states = new Map(
        activeGoals(db)
          .flatMap(g => measures(db, g))
          .filter(s => !isCumulative(s))
          .map(s => [s.id, s]),
      );
      return [...states.values()]
        .map(s => ({ s, days: daysFrom(lastMeasured(s) || today, today) }))
        .filter(x => x.days >= L.STALE_STATE_DAYS)
        .sort((x, y) => y.days - x.days)
        .map(x => named(x.s, { days: x.days }));
    },
  },
  {
    id: 'no-measure',
    cls: 'B',
    view: 'goals',
    cooldown: L.COOLDOWN_B,
    guide: 'h-states',
    action: 'addState',
    hits: ({ db, today }) =>
      activeGoals(db)
        .filter(g => ownMetric(g) && goalAge(g, today) > L.NO_MEASURE_AGE && !measures(db, g).length)
        .map(g => named(g)),
  },
  {
    id: 'far-goal',
    cls: 'B',
    view: 'goals',
    cooldown: L.COOLDOWN_B,
    guide: 'h-goals',
    action: 'addSubgoal',
    hits: ({ db, today }) =>
      activeGoals(db)
        .filter(
          g => g.deadline && g.deadline > addMonths(today, L.FAR_GOAL_MONTHS) && !descendants(g.id, 'subgoal').length,
        )
        .map(g => named(g, { n: monthsFrom(today, g.deadline!) })),
  },
  {
    id: 'waiting',
    cls: 'B',
    view: 'activities',
    cooldown: L.COOLDOWN_B,
    guide: 'h-activities',
    action: 'editItem',
    hits: ({ db, today }) => {
      const byId = new Map(db.activities.map(a => [a.id, a]));
      return db.activities
        .filter(a => a.status !== 'done')
        .flatMap(a =>
          relsFrom(a.id, 'depends')
            .map(r => byId.get(r.to))
            .filter((b): b is Activity => !!b && !isRoutine(b) && b.status === 'todo')
            .map(b => ({
              a,
              b,
              days: daysFrom(later(a.createdAt || dayOf(a.updatedAt), statusSince(b)) || today, today),
            })),
        )
        .filter(x => x.days >= L.WAITING_DAYS)
        .sort((x, y) => y.days - x.days)
        .map(x => ({ ...named(x.a, { other: x.b.title }), target: x.b.id }));
    },
  },
  {
    id: 'many-doing',
    cls: 'B',
    view: 'activities',
    cooldown: L.COOLDOWN_B,
    guide: 'not-starting',
    action: 'activities',
    hits: ({ db }) => {
      const n = steps(db).filter(a => a.status === 'doing').length;
      return n >= L.MANY_DOING ? [{ vars: { n } }] : [];
    },
  },
  {
    id: 'no-vision',
    cls: 'B',
    view: 'goals',
    cooldown: L.COOLDOWN_B,
    guide: 'vision-how',
    action: 'findVisions',
    hits: ({ db, visions, today }) => {
      const first = firstItemDay(db, visions);
      return activeGoals(db).length >= L.NO_VISION_GOALS &&
        !visions.length &&
        first &&
        daysFrom(first, today) >= L.NO_VISION_DAYS
        ? [{}]
        : [];
    },
  },
  {
    id: 'goal-unfinished',
    cls: 'B',
    view: 'goals',
    cooldown: L.COOLDOWN_B,
    guide: 'smart-fit',
    action: 'editItem',
    hits: ({ db, today }) =>
      activeGoals(db)
        .filter(g => goalAge(g, today) > L.UNFINISHED_AGE && !isSmart(g))
        .map(g => {
          const c = smartCheck(g);
          return named(g, { n: LETTERS.filter(l => c[l]).length, part: LETTERS.find(l => !c[l])! });
        }),
  },
  // The calendar: keyed to their period, once each, on the first opening of the period.
  {
    id: 'week',
    cls: 'B',
    view: 'dashboard',
    cooldown: 0,
    guide: 'review',
    action: 'review',
    hits: ({ db, today, lastReview, prevDay }) => {
      const from = calPeriod('week', today).from;
      const firstOpening = !prevDay || prevDay < from;
      const due = !lastReview || daysFrom(lastReview, today) >= L.WEEK_REVIEW_DAYS;
      return activeGoals(db).length && firstOpening && due ? [{ id: from }] : [];
    },
  },
  {
    id: 'month',
    cls: 'B',
    view: 'graphs',
    cooldown: 0,
    guide: 'h-review',
    action: 'reviewMonth',
    hits: ({ db, today, prevDay }) => {
      const from = calPeriod('month', today).from;
      if (prevDay && prevDay >= from) return [];
      const stale = activeGoals(db)
        .flatMap(g => measures(db, g))
        .some(s => (lastMeasured(s) || '') < from);
      return stale ? [{ id: today.slice(0, 7) }] : [];
    },
  },
  {
    id: 'new-year',
    cls: 'B',
    view: 'dashboard',
    cooldown: 0,
    guide: 'what-goal',
    action: 'reviewYear',
    hits: ({ db, today }) =>
      today.slice(5, 7) === '01' && Number(today.slice(8)) <= L.NEW_YEAR_LAST_DAY && activeGoals(db).length
        ? [{ id: today.slice(0, 4) }]
        : [],
  },
];
