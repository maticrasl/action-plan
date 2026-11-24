import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Activity, type Goal, type State } from './model';
import { monthKept, monthRange, progressAt, reviewMonth, reviewYear } from './reviews-month';
import { addRelation } from './relations';
import { db, setDb } from './state';

// Wednesday 2026-11-18.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 18, 12));
  setDb(emptyDb());
});
afterEach(() => vi.useRealTimers());

const goal = (more: Partial<Goal>): Goal => {
  const g: Goal = { id: 'g' + db.goals.length, title: 'g', status: 'active', ...more };
  db.goals.push(g);
  return g;
};
const state = (more: Partial<State>): State => {
  const s: State = { id: 's' + db.states.length, title: 's', description: '', value: '', history: [], ...more };
  db.states.push(s);
  return s;
};
const act = (more: Partial<Activity>): Activity => {
  const a: Activity = { id: 'a' + db.activities.length, title: 'a', status: 'todo', ...more };
  db.activities.push(a);
  return a;
};

describe('which month and year', () => {
  test('the 1st to the 7th: last month; from the 8th: this month; January gives December before', () => {
    expect(reviewMonth('2026-11-07')).toBe('2026-10');
    expect(reviewMonth('2026-11-08')).toBe('2026-11');
    expect(reviewMonth('2027-01-03')).toBe('2026-12');
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
  test('the year: December the current one, January the one before, else the year under way', () => {
    expect(reviewYear('2026-12-05')).toBe('2026');
    expect(reviewYear('2027-01-31')).toBe('2026');
    expect(reviewYear('2027-02-01')).toBe('2027');
  });
});

describe('progressAt', () => {
  test('a plain state: the latest value on or before the day; before any, the start value', () => {
    const g = goal({ metric: 'km', baseline: '0', target: '10' });
    const s = state({
      history: [
        { date: '2026-10-20', value: '4' },
        { date: '2026-11-10', value: '6' },
      ],
    });
    addRelation(s.id, g.id, 'measures');
    expect(progressAt(g, '2026-11-01')).toBe(40);
    expect(progressAt(g, '2026-10-01')).toBe(0);
  });
  test('adds up, in total and per period (the higher of the last two complete periods)', () => {
    const entries = [
      { id: 'e1', date: '2026-10-05', amount: '3' },
      { id: 'e2', date: '2026-10-14', amount: '5' },
      { id: 'e3', date: '2026-10-21', amount: '1' },
    ];
    const total = goal({ metric: 'km', baseline: '0', target: '20' });
    const s = state({ cumulative: true, entries });
    addRelation(s.id, total.id, 'measures');
    expect(progressAt(total, '2026-10-15')).toBe(40); // 8 of 20
    const weekly = goal({ metric: 'km', baseline: '0', target: '10', period: 'week' });
    addRelation(s.id, weekly.id, 'measures');
    // Before Mon 2026-10-26: the weeks to 10-25 (1) and to 10-18 (5): the higher is 5.
    expect(progressAt(weekly, '2026-10-26')).toBe(50);
  });
  test('activities done by that day, of the steps counted now', () => {
    const g = goal({ progress: 'activities' });
    const a = act({ status: 'done', doneAt: '2026-10-20' });
    const b = act({ status: 'done', doneAt: '2026-11-05' });
    act({});
    db.activities.forEach(x => addRelation(x.id, g.id, 'contributes'));
    expect([a, b].length).toBe(2);
    expect(progressAt(g, '2026-11-01')).toBeCloseTo(33.33, 1);
  });
  test('routines kept: consistency up to that day', () => {
    const g = goal({ progress: 'routines', startDate: '2026-10-26' });
    const r = act({
      repeat: { every: 1, unit: 'day' },
      startDate: '2026-10-26',
      checkins: { '2026-10-26': 1, '2026-10-27': 1 },
    });
    addRelation(r.id, g.id, 'contributes');
    // On 10-29: the due days before it (26–28), two kept; that day itself is not judged yet.
    expect(progressAt(g, '2026-10-29')).toBeCloseTo(66.67, 1);
  });
  test('achieved before the day: 100; a keep goal has none', () => {
    expect(progressAt(goal({ status: 'achieved', achievedAt: '2026-10-01' }), '2026-11-01')).toBe(100);
    expect(progressAt(goal({ keep: { max: 1 } }), '2026-11-01')).toBeNull();
  });
});

describe('monthKept: kept n of m complete weeks of the month', () => {
  test('a month starting on a Sunday: its first partial week is left out; the week under way too', () => {
    const r = act({ repeat: { every: 1, unit: 'week', times: 2 }, startDate: '2026-10-01', checkins: {} });
    // November 2026: Sun 1st (partial week), weeks from Mon 2, 9 complete; Mon 16 is under way.
    ['2026-11-03', '2026-11-05'].forEach(d => (r.checkins![d] = 1));
    expect(monthKept(r as never, '2026-11')).toEqual({ n: 1, m: 2 });
  });
  test('a past month: every week inside it', () => {
    const r = act({
      repeat: { every: 1, unit: 'week', times: 1 },
      startDate: '2026-09-01',
      checkins: { '2026-10-06': 1 },
    });
    // October 2026: Thu 1st partial; weeks from 5, 12, 19, 26 (26 runs into November: left out).
    expect(monthKept(r as never, '2026-10')).toEqual({ n: 1, m: 3 });
  });
});
