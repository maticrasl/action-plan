import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { t } from '../i18n/index';
import { today } from './dates';
import { emptyDb, type Activity, type Entry, type Goal, type RelType, type State } from './model';
import {
  activityState,
  blockers,
  countedActivities,
  goalActivities,
  goalCurrent,
  goalProgress,
  goalReached,
  goalScope,
  goalErrors,
  goalState,
  hasPercent,
  isSmart,
  smartCheck,
} from './progress';
import { addRelation } from './relations';
import { calPeriod } from './cumulative';
import { addDays } from './routines/schedule';
import { db, setDb } from './state';

// Ported from tests/more.js: "blockers, inherited waits and item states", "goal progress: measuring states,
// clamping…", "goals measured by their activities", "SMART check edge cases" and "cumulative: goals use the
// higher of this and the last period…" (their rule assertions; forms, cards and toasts are the page's).

let n = 0;
const goal = (p: Partial<Goal> = {}): Goal => {
  const x: Goal = { id: `g${++n}`, title: 'goal', status: 'active', ...p };
  db.goals.push(x);
  return x;
};
const act = (p: Partial<Activity> = {}): Activity => {
  const x: Activity = { id: `a${++n}`, title: 'activity', status: 'todo', ...p };
  db.activities.push(x);
  return x;
};
const state = (p: Partial<State> = {}): State => {
  const x: State = { id: `s${++n}`, title: 'state', description: '', value: '', history: [], ...p };
  db.states.push(x);
  return x;
};
const rel = (a: { id: string }, b: { id: string }, type: RelType) => expect(addRelation(a.id, b.id, type)).toBeNull();
const d = (days: number) => addDays(today(), days);
const entry = (date: string, amount: number): Entry => ({ id: `e${++n}`, date, amount: String(amount) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 16, 12));
  setDb(emptyDb());
});
afterEach(() => vi.useRealTimers());

test('blockers are inherited from parents; the states an activity and a goal go through', () => {
  const parent = act(),
    child = act(),
    q = act({ title: 'Prerequisite' });
  rel(child, parent, 'subactivity');
  rel(parent, q, 'depends');
  expect(blockers(child).map(x => x.id)).toEqual([q.id]);
  const seq = [activityState(child)];
  q.status = 'done';
  seq.push(activityState(child));
  child.dueDate = d(-1);
  seq.push(activityState(child));
  child.dueDate = d(5);
  child.status = 'doing';
  seq.push(activityState(child));
  child.status = 'done';
  seq.push(activityState(child));
  expect(seq).toEqual(['blocked', 'todo', 'late', 'doing', 'done']);

  const g = goal({ target: '10', baseline: '0' }),
    h = goal();
  rel(g, h, 'depends');
  const gs = [goalState(g)];
  h.status = 'achieved';
  gs.push(goalState(g));
  g.deadline = d(-2);
  gs.push(goalState(g));
  g.deadline = d(30);
  g.status = 'paused';
  gs.push(goalState(g));
  g.status = 'active';
  g.startDate = d(-3);
  gs.push(goalState(g));
  g.startDate = d(3);
  g.current = '4';
  gs.push(goalState(g));
  g.status = 'achieved';
  gs.push(goalState(g));
  expect(gs).toEqual(['blocked', 'todo', 'late', 'todo', 'doing', 'doing', 'done']);
});

describe('goal progress', () => {
  test('measuring states (the latest numeric one), clamping, falling targets, achieved', () => {
    const g = goal({ baseline: '10', target: '20', current: '15' });
    const out = [goalProgress(g)];
    const s1 = state({ value: '12', date: '2099-01-01' }),
      s2 = state({ value: '18', date: '2099-02-01' }),
      junk = state({ value: 'n/a', date: '2099-03-01' });
    [s1, s2, junk].forEach(s => rel(s, g, 'measures'));
    out.push(goalProgress(g));
    s2.value = '25';
    out.push(goalProgress(g));
    s2.value = '5';
    out.push(goalProgress(g));
    const falling = goal({ baseline: '80', target: '70', current: '75' });
    const flat = goal({ baseline: '5', target: '5' });
    const noBase = goal({ target: '4', current: '1' });
    out.push(goalProgress(falling), goalProgress(flat), goalProgress(noBase));
    g.status = 'achieved';
    out.push(goalProgress(g));
    expect(out).toEqual([50, 80, 100, 0, 50, 0, 25, 100]);
  });

  test("a goal's activities and its scope", () => {
    const g = goal(),
      other = act();
    const a = act(),
      sub = act();
    rel(a, g, 'contributes');
    rel(sub, a, 'subactivity');
    expect(
      goalActivities(g)
        .map(x => x.id)
        .sort(),
    ).toEqual([a.id, sub.id].sort());
    const s1 = state({ value: '1' }),
      sg = goal(),
      pre = goal(),
      st = state(),
      far = goal();
    rel(s1, g, 'measures');
    rel(sg, g, 'subgoal');
    rel(g, pre, 'depends');
    rel(sub, st, 'improves');
    const sc = goalScope(g.id);
    expect([g, sg, pre].every(x => sc.goal.has(x.id)) && !sc.goal.has(far.id)).toBe(true);
    expect(sc.activity.has(a.id) && sc.activity.has(sub.id) && !sc.activity.has(other.id)).toBe(true);
    expect(sc.state.has(st.id) && sc.state.has(s1.id)).toBe(true);
  });

  test('measured by its activities: only the actual work, sub-goals included', () => {
    const g = goal({
      title: 'Counted goal',
      specific: 'Finish all the work for this goal',
      achievable: 'Small steps each week',
      relevant: 'It matters to me',
      deadline: '2099-01-01',
      progress: 'activities',
      target: '10',
      metric: 'Old metric',
    });
    const sub = goal(),
      elsewhere = goal();
    const parent = act(),
      k1 = act(),
      k2 = act(),
      viaSub = act(),
      other = act();
    rel(sub, g, 'subgoal');
    rel(parent, g, 'contributes');
    rel(k1, parent, 'subactivity');
    rel(k2, parent, 'subactivity');
    rel(viaSub, sub, 'contributes');
    rel(other, elsewhere, 'contributes');
    expect(
      countedActivities(g)
        .map(a => a.id)
        .sort(),
    ).toEqual([k1.id, k2.id, viaSub.id].sort());
    const pcts = [goalProgress(g)];
    k1.status = 'done';
    pcts.push(goalProgress(g));
    parent.status = 'done';
    pcts.push(goalProgress(g));
    k2.status = viaSub.status = 'done';
    pcts.push(goalProgress(g));
    expect(pcts.map(Math.round)).toEqual([0, 33, 33, 100]);
    expect(goalProgress({ id: 'none', title: '', status: 'active', progress: 'activities' })).toBe(0);
    const c = smartCheck({ ...g, metric: '', target: '' });
    expect([c.M, c.errs.metric, c.errs.target]).toEqual([true, undefined, undefined]);
  });
});

test('SMART check edge cases', () => {
  const good: Goal = {
    id: 'g',
    status: 'active',
    title: 'Read books',
    specific: 'Read twelve books this year',
    metric: 'Books',
    baseline: '0',
    target: '12',
    achievable: 'One a month',
    relevant: 'I want to learn',
    deadline: '2099-12-31',
  };
  const c = smartCheck(good);
  expect([c.S, c.M, c.A, c.R, c.T, Object.keys(c.errs).length]).toEqual([true, true, true, true, true, 0]);
  expect(smartCheck({ ...good, target: '0' }).errs.target).toBe(t('err.targetSame'));
  expect(smartCheck({ ...good, startDate: '2099-12-31' }).errs.deadline).toBe(t('err.deadlineOrder'));
  expect(smartCheck({ ...good, target: 'many' }).errs.target).toBe(t('err.target'));
});

describe('a goal saves unfinished; the letters still need real answers', () => {
  const smart: Goal = {
    id: 'g',
    status: 'active',
    title: 'Read books',
    specific: 'Read twelve books this year',
    metric: 'Books',
    baseline: '0',
    target: '12',
    obstacle: 'Too tired at night',
    ifThen: 'Read on the bus',
    relevant: 'I want to learn',
    startDate: '2026-01-01',
    deadline: '2099-12-31',
  };

  test('each letter on both sides of its threshold', () => {
    const lit = (g: Partial<Goal>) => {
      const c = smartCheck({ ...smart, ...g });
      return 'SMART'
        .split('')
        .filter(l => c[l as 'S'])
        .join('');
    };
    expect(lit({})).toBe('SMART');
    expect(lit({ title: 'Run' })).toBe('MART');
    expect(lit({ title: 'Runs' })).toBe('SMART');
    expect(lit({ specific: 'x'.repeat(14) })).toBe('MART');
    expect(lit({ specific: 'x'.repeat(15) })).toBe('SMART');
    expect(lit({ metric: ' ' })).toBe('SART');
    expect(lit({ target: '' })).toBe('SART');
    expect(lit({ target: '0' })).toBe('SART');
    expect(lit({ progress: 'activities', metric: '', target: '' })).toBe('SMART');
    expect(lit({ relevant: 'x'.repeat(9) })).toBe('SMAT');
    expect(lit({ relevant: 'x'.repeat(10) })).toBe('SMART');
    expect(lit({ deadline: '' })).toBe('SMAR');
    expect(lit({ deadline: '2026-01-01' })).toBe('SMAR');
    expect(lit({ deadline: '2026-01-02' })).toBe('SMART');
  });

  test('A: both new answers, or the old one', () => {
    const A = (g: Partial<Goal>) => smartCheck({ ...smart, obstacle: '', ifThen: '', achievable: '', ...g }).A;
    const ten = 'x'.repeat(10),
      nine = 'x'.repeat(9);
    expect(A({ obstacle: ten, ifThen: ten })).toBe(true);
    expect(A({ obstacle: ten, ifThen: nine })).toBe(false);
    expect(A({ obstacle: ten })).toBe(false);
    expect(A({ ifThen: ten })).toBe(false);
    expect(A({ achievable: ten })).toBe(true);
    expect(A({ achievable: nine })).toBe(false);
    expect(A({})).toBe(false);
    expect(smartCheck({ ...smart, obstacle: '' }).errs.obstacle).toBe(t('hint.obstacle'));
  });

  test('isSmart: all five lit', () => {
    expect(isSmart(smart)).toBe(true);
    expect(isSmart({ id: 'x', title: 'Only a title', status: 'active' })).toBe(false);
    expect(isSmart({ ...smart, deadline: undefined })).toBe(false);
  });

  test('goalErrors: only contradictions stop a save', () => {
    expect(goalErrors({ id: 'x', title: 'Only a title', status: 'active' })).toEqual({});
    expect(goalErrors(smart)).toEqual({});
    expect(goalErrors({ ...smart, deadline: '2026-01-01' })).toEqual({ deadline: t('err.deadlineOrder') });
    expect(goalErrors({ ...smart, deadline: '2025-12-31' })).toEqual({ deadline: t('err.deadlineOrder') });
    expect(goalErrors({ ...smart, deadline: '2026-01-02' })).toEqual({});
    expect(goalErrors({ ...smart, deadline: '' })).toEqual({});
    expect(goalErrors({ ...smart, startDate: '' })).toEqual({});
    expect(goalErrors({ ...smart, target: '0' })).toEqual({ target: t('err.targetSame') });
    expect(goalErrors({ ...smart, target: '' })).toEqual({});
    expect(goalErrors({ ...smart, baseline: '', target: '0' })).toEqual({});
    // Measured by its activities, the metric fields are only kept for switching back.
    expect(goalErrors({ ...smart, target: '0', progress: 'activities' })).toEqual({});
  });

  test('hasPercent: a measurement needs a numeric target', () => {
    expect(hasPercent(smart)).toBe(true);
    expect(hasPercent({ ...smart, target: '' })).toBe(false);
    expect(hasPercent({ ...smart, target: undefined, metric: '' })).toBe(false);
    expect(hasPercent({ ...smart, metric: '' })).toBe(true);
    expect(hasPercent({ ...smart, target: '', progress: 'activities' })).toBe(true);
    expect(hasPercent({ ...smart, target: '', progress: 'routines' })).toBe(true);
    expect(goalProgress({ ...smart, target: '' })).toBe(0);
  });
});

test('a goal counting a state that adds up per period: the higher of this and the last; reached only by a complete one', () => {
  const now = today(),
    lastWeek = addDays(now, -7);
  const s = state({ cumulative: true, scale: 'month', entries: [entry(lastWeek, 20)] });
  const g = goal({
    title: 'Run 30 km a week',
    unit: 'km',
    baseline: '10',
    target: '30',
    metric: 'Weekly km',
    period: 'week',
  });
  rel(s, g, 'measures');
  expect([goalCurrent(g), Math.round(goalProgress(g))]).toEqual([20, 50]);
  s.entries!.push(entry(now, 25));
  expect([goalCurrent(g), goalReached(g)]).toEqual([25, false]);
  s.entries!.push(entry(now, 10));
  expect([goalProgress(g), goalReached(g)]).toEqual([100, false]);
  s.entries!.push(entry(lastWeek, 11));
  expect(goalReached(g)).toBe(true);
  // A goal that goes down: a month under way only counts once it is worse than the last full one.
  const monthStart = calPeriod('month', now).from;
  const sp = state({ cumulative: true, entries: [entry(addDays(monthStart, -1), 350), entry(now, 50)] });
  const h = goal({
    title: 'Spend less',
    unit: '€',
    baseline: '400',
    target: '300',
    metric: 'Spending',
    period: 'month',
  });
  rel(sp, h, 'measures');
  expect([goalCurrent(h), Math.round(goalProgress(h))]).toEqual([350, 50]);
  sp.entries!.push(entry(now, 330));
  expect(goalCurrent(h)).toBe(380);
  // Before entries reach back into a complete month, nothing counts.
  const sq = state({ cumulative: true, entries: [entry(now, 50)] });
  const q = goal({
    title: 'Spend less, just begun',
    unit: '€',
    baseline: '400',
    target: '300',
    metric: 'Spending',
    period: 'month',
  });
  rel(sq, q, 'measures');
  expect([goalCurrent(q), goalProgress(q), goalReached(q)]).toEqual([400, 0, false]);
  sq.entries!.push(entry(addDays(monthStart, -1), 280));
  expect([goalCurrent(q), goalReached(q)]).toEqual([280, true]);
  // The same state counted in total by another goal.
  const k = goal({ title: 'Spend under 1000 in all', unit: '€', baseline: '0', target: '1000', metric: 'Spending' });
  rel(sp, k, 'measures');
  expect([goalCurrent(k), goalReached(k)]).toEqual([730, false]);
});
