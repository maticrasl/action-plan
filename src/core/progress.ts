/** Goals and activities: SMART checks, progress, reached targets, blockers and each item's state. */
import { t } from '../i18n/index';
import { clamp, isNum } from './util';
import { ancestors, descendants, findEntity, relsFrom, relsTo } from './relations';
import { db } from './state';
import {
  calPeriod,
  entriesOf,
  goalPeriod,
  isCumulative,
  lastPeriodTotal,
  stateDate,
  stateTotal,
  stateValue,
} from './cumulative';
import { daysUntil, today } from './dates';
import { isKeep, keepNow, keepShare } from './keep';
import { consistency, routineState } from './routines/keeping';
import { isRoutine, type Routine } from './routines/schedule';
import { PARENT_REL, type Activity, type Goal, type Keep, type NodeState, type Period, type State } from './model';
import type { Entity, ParentKind } from './relations';

// The goal form's fields that can be unfinished, and the SMART letters they make up.
export type SmartField = 'title' | 'specific' | 'metric' | 'target' | 'obstacle' | 'relevant' | 'deadline';
export interface SmartCheck {
  S: boolean;
  M: boolean;
  A: boolean;
  R: boolean;
  T: boolean;
  errs: Partial<Record<SmartField, string>>;
}
// What goalScope finds: the ids of the goals, activities and states that belong to a goal.
export interface Scope {
  goal: Set<string>;
  activity: Set<string>;
  state: Set<string>;
}

/* ---------- SMART & progress ---------- */

// Which letters are lit, and for each unlit one the hint the form shows under its field. A goal
// saves without them (goalErrors says what stops a save); they decide the golden glow.
export function smartCheck(g: Goal): SmartCheck {
  const errs: SmartCheck['errs'] = {};
  if (!g.title || g.title.trim().length < 4) errs.title = t('err.title');
  if (!g.specific || g.specific.trim().length < 15) errs.specific = t('err.specific');
  // A goal measured by its activities or routines needs no metric or target of its own.
  if (isKeep(g)) {
    if (!g.metric || !g.metric.trim()) errs.metric = t('err.metric');
    if (g.keep.min === undefined && g.keep.max === undefined) errs.target = t('err.keepLimit');
    else if (keepOrderBad(g)) errs.target = t('err.keepOrder');
  } else if (ownMetric(g)) {
    if (!g.metric || !g.metric.trim()) errs.metric = t('err.metric');
    if (!isNum(g.target)) errs.target = t('err.target');
    else if (isNum(g.baseline) && Number(g.baseline) === Number(g.target)) errs.target = t('err.targetSame');
  }
  // The obstacle and what to do then, or the answer a goal saved before them has to "Why is this realistic?".
  const long = (s: string | undefined) => !!s && s.trim().length >= 10;
  if (!(long(g.obstacle) && long(g.ifThen)) && !long(g.achievable)) errs.obstacle = t('hint.obstacle');
  if (!long(g.relevant)) errs.relevant = t('err.relevant');
  // A keep goal's Until is optional: its start date makes the T.
  if (isKeep(g) && !g.startDate) errs.deadline = t('err.startRequired');
  else if (!g.deadline && !isKeep(g)) errs.deadline = t('err.deadline');
  else if (g.deadline && g.startDate && g.deadline <= g.startDate) errs.deadline = t('err.deadlineOrder');
  return {
    S: !errs.title && !errs.specific,
    M: !errs.metric && !errs.target,
    A: !errs.obstacle,
    R: !errs.relevant,
    T: !errs.deadline,
    errs,
  };
}
export const isSmart = (g: Goal): boolean => {
  const c = smartCheck(g);
  return c.S && c.M && c.A && c.R && c.T;
};
// What stops a goal from saving: only answers that contradict each other.
export function goalErrors(g: Goal): SmartCheck['errs'] {
  const errs: SmartCheck['errs'] = {};
  if (g.deadline && g.startDate && g.deadline <= g.startDate) errs.deadline = t('err.deadlineOrder');
  // A keep goal without a range would be stored as no keep goal at all.
  if (isKeep(g)) {
    if (g.keep.min === undefined && g.keep.max === undefined) errs.target = t('err.keepLimit');
    else if (keepOrderBad(g)) errs.target = t('err.keepOrder');
  } else if (ownMetric(g) && isNum(g.target) && isNum(g.baseline) && Number(g.baseline) === Number(g.target))
    errs.target = t('err.targetSame');
  return errs;
}
const keepOrderBad = (g: Goal & { keep: Keep }) =>
  g.keep.min !== undefined && g.keep.max !== undefined && g.keep.min >= g.keep.max;
// Whether a goal has a percentage: one measured by a measurement needs a numeric target.
export const hasPercent = (g: Goal): boolean => isKeep(g) || !ownMetric(g) || isNum(g.target);

// Latest numeric current-state linked via "measures" wins; otherwise the goal's own value.
export function measuringState(g: Goal): State | null {
  return (
    relsTo(g.id, 'measures')
      .map(r => db.states.find(s => s.id === r.from))
      .filter((s): s is State => !!s && isNum(stateValue(s)))
      .sort((a, b) => (stateDate(b) || '').localeCompare(stateDate(a) || ''))[0] || null
  );
}
// What a state says about a goal: its value, or for a state that adds up and a goal counting it per
// period the higher of this period's total and the last complete one's – so progress does not drop
// when a period starts, and a period still under way counts once it is past the last one (for
// better or worse). When lower is better (spend less), nothing counts before entries reach back into a
// complete period: the first period under way, or an empty one before it, would look well under target.
export const lowerBetter = (g: Goal): boolean =>
  !isKeep(g) && Number(g.target) < (isNum(g.baseline) ? Number(g.baseline) : 0);
export const lastPeriodLogged = (s: State, period: Period): boolean =>
  entriesOf(s).some(e => e.date < calPeriod(period, today()).from);
export function goalMeasure(s: State, g: Goal): number | null {
  const period = goalPeriod(g);
  if (!isCumulative(s) || period === 'total') return Number(stateValue(s));
  if (lowerBetter(g) && !lastPeriodLogged(s, period)) return null;
  return Math.max(stateTotal(s, period), lastPeriodTotal(s, period));
}
export function goalCurrent(g: Goal): number {
  if (isKeep(g)) {
    const now = keepNow(g);
    return now.kind === 'none' ? 0 : now.value;
  }
  if (byRoutines(g)) return Math.round(goalProgress(g));
  if (byActivities(g)) return countedActivities(g).filter(a => a.status === 'done').length;
  const st = measuringState(g),
    v = st && goalMeasure(st, g);
  if (st && v !== null) return v;
  if (isNum(g.current)) return Number(g.current);
  return isNum(g.baseline) ? Number(g.baseline) : 0;
}
export function goalProgress(g: Goal): number {
  if (g.status === 'achieved') return 100;
  if (isKeep(g)) {
    const share = keepShare(g);
    return share ? (share.n / share.total) * 100 : 0;
  }
  if (byRoutines(g)) {
    const kept = goalRoutines(g)
      .map(a => consistency(a, g.startDate))
      .filter((v): v is number => v !== null);
    return kept.length ? (kept.reduce((sum, v) => sum + v, 0) / kept.length) * 100 : 0;
  }
  if (byActivities(g)) {
    const total = countedActivities(g).length;
    return total ? (goalCurrent(g) / total) * 100 : 0;
  }
  return metricProgress(g, goalCurrent(g));
}
export function metricProgress(g: Goal, current: number): number {
  const b = isNum(g.baseline) ? Number(g.baseline) : 0;
  const target = Number(g.target);
  if (!isNum(g.target) || target === b) return 0;
  return clamp(((current - b) / (target - b)) * 100, 0, 100);
}

// Whether a goal has reached its target. For a goal counting a state that adds up per period,
// only a complete period counts: one strong Wednesday does not reach "30 km a week". Consistency
// has no target to reach (it is 100 % after the first tick).
export function goalReached(g: Goal): boolean {
  if (g.status !== 'active' || byRoutines(g) || isKeep(g)) return false;
  const st = ownMetric(g) ? measuringState(g) : null;
  if (isCumulative(st) && goalPeriod(g) !== 'total')
    return (
      (!lowerBetter(g) || lastPeriodLogged(st, goalPeriod(g) as Period)) &&
      metricProgress(g, lastPeriodTotal(st, goalPeriod(g) as Period)) >= 100
    );
  return goalProgress(g) >= 100;
}

// Activities working toward a goal: direct contributors plus all their sub-activities.
export function goalActivities(g: Goal): Activity[] {
  const ids = new Set<string>();
  relsTo(g.id, 'contributes').forEach(r => [r.from, ...descendants(r.from, 'subactivity')].forEach(id => ids.add(id)));
  return db.activities.filter(a => ids.has(a.id));
}

// Goals can measure progress by their activities instead of a metric (`progress: 'activities'`).
export const byActivities = (g: Goal): boolean => g.progress === 'activities';
// The activities such a goal counts: the actual pieces of work (activities without sub-activities
// of their own) under the goal and its sub-goals.
export function countedActivities(g: Goal): Activity[] {
  return treeActivities(g).filter(a => !isRoutine(a) && !relsTo(a.id, 'subactivity').length);
}

// The activities working toward a goal and its sub-goals.
export function treeActivities(g: Goal): Activity[] {
  const goals = [
    g,
    ...(descendants(g.id, 'subgoal')
      .map(id => db.goals.find(x => x.id === id))
      .filter(Boolean) as Goal[]),
  ];
  const ids = new Set(goals.flatMap(x => goalActivities(x).map(a => a.id)));
  return db.activities.filter(a => ids.has(a.id));
}

// Goals can also measure progress by how consistently their routines are kept (`progress: 'routines'`):
// the routines working toward the goal and its sub-goals.
export const byRoutines = (g: Goal): boolean => g.progress === 'routines';
// Measured by its own metric and target (form values say 'measure', stored goals leave it out).
export const ownMetric = (g: Goal): boolean => !g.progress || g.progress === 'measure';
export const goalRoutines = (g: Goal): Routine[] => treeActivities(g).filter(isRoutine);

// A routine is complete once it has ended.
export const isComplete = (kind: ParentKind, item: Goal | Activity): boolean =>
  kind === 'goal'
    ? item.status === 'achieved'
    : isRoutine(item)
      ? !!item.dueDate && item.dueDate < today()
      : item.status === 'done';

// Unfinished items this one waits for – its own dependencies and those inherited from its parents.
export function blockers(item: Goal | Activity, kind: ParentKind = 'activity'): (Goal | Activity)[] {
  return [item.id, ...ancestors(item.id, PARENT_REL[kind])]
    .flatMap(id => relsFrom(id, 'depends'))
    .map(r => findEntity(r.to))
    .filter(
      (e): e is Extract<Entity, { kind: ParentKind }> =>
        !!e && e.kind === kind && !isComplete(kind, e.item as Goal | Activity),
    )
    .map(e => e.item);
}

export function activityState(a: Activity): NodeState {
  if (isRoutine(a)) return routineState(a);
  if (a.status === 'done') return 'done';
  if (blockers(a).length) return 'blocked';
  if (a.dueDate && daysUntil(a.dueDate)! < 0) return 'late';
  return a.status === 'doing' ? 'doing' : 'todo';
}
// When its start date comes, an activity still to do is in progress. This happens once per start date
// (`autoStarted` remembers which), so setting it back to "To do" sticks until the start date changes.
export function startDueActivities(): number {
  const now = today();
  const due = db.activities.filter(
    a => !isRoutine(a) && a.status === 'todo' && a.startDate && a.startDate <= now && a.autoStarted !== a.startDate,
  );
  due.forEach(a => Object.assign(a, { status: 'doing', autoStarted: a.startDate }));
  return due.length;
}
export function goalState(g: Goal): NodeState {
  if (g.status === 'achieved') return 'done';
  if (blockers(g, 'goal').length) return 'blocked';
  // A keep goal is late while out of range; its Until passing does not make it late.
  if (isKeep(g) ? keepNow(g).kind === 'out' : g.deadline && daysUntil(g.deadline)! < 0) return 'late';
  if (g.status === 'paused') return 'todo';
  return (g.startDate && g.startDate <= today()) || goalProgress(g) > 0 ? 'doing' : 'todo';
}

// Everything relevant to one goal: its sub-goals and prerequisite goals, the activity trees
// working toward them (with their prerequisite chains), the activities waiting for those,
// and the related current states.
export function goalScope(goalId: string): Scope {
  const goal = new Set([goalId, ...descendants(goalId, 'subgoal')]);
  [...goal].forEach(id => relsFrom(id, 'depends').forEach(r => goal.add(r.to)));

  const activity = new Set<string>();
  const addActivity = (id: string) => {
    if (activity.has(id)) return;
    activity.add(id);
    [...ancestors(id, 'subactivity'), ...descendants(id, 'subactivity')].forEach(addActivity);
    relsFrom(id, 'depends').forEach(r => addActivity(r.to));
  };
  db.relations.filter(r => r.type === 'contributes' && goal.has(r.to)).forEach(r => addActivity(r.from));
  // Activities that wait for this work belong here too (with their sub-activities), e.g. a former
  // sub-activity turned into a dependency – but without pulling in the rest of their own trees.
  const addWaiting = (id: string) => {
    if (activity.has(id)) return;
    [id, ...descendants(id, 'subactivity')].forEach(x => activity.add(x));
    relsTo(id, 'depends').forEach(r => addWaiting(r.from));
  };
  [...activity].forEach(id => relsTo(id, 'depends').forEach(r => addWaiting(r.from)));

  const state = new Set<string>();
  db.relations.forEach(r => {
    if (r.type === 'measures' && goal.has(r.to)) state.add(r.from);
    if (r.type === 'improves' && activity.has(r.from)) state.add(r.to);
  });
  return { goal, activity, state };
}
