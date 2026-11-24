import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Goal, type State } from './model';
import { inRange, keepMarks, keepNow, keepShare, validKeep } from './keep';
import { addRelation } from './relations';
import { setDb } from './state';

// Monday 2026-11-16; the last complete week ended Sunday 2026-11-15.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 16, 12));
  setDb(emptyDb());
});
afterEach(() => vi.useRealTimers());

const goal = (keep: Goal['keep'], more: Partial<Goal> = {}): Goal => ({
  id: 'g',
  title: 'Keep weight',
  status: 'active',
  metric: 'weight',
  keep,
  startDate: '2026-10-26', // Monday: three complete weeks to 2026-11-15
  ...more,
});
const plain = (history: [string, number][]): State => ({
  id: 's',
  title: 'Weight',
  description: '',
  value: history.length ? String(history.at(-1)![1]) : '',
  date: history.at(-1)?.[0],
  history: history.map(([date, v]) => ({ date, value: String(v) })),
});
const addsUp = (entries: [string, number][]): State => ({
  id: 's',
  title: 'Spend',
  description: '',
  value: '',
  history: [],
  cumulative: true,
  entries: entries.map(([date, a], i) => ({ id: 'e' + i, date, amount: String(a) })),
});
// The goal measured by the state, in a db of their own.
function setUp(g: Goal, s: State) {
  setDb({ ...emptyDb(), goals: [g], states: [s] });
  addRelation(s.id, g.id, 'measures');
}

describe('inRange', () => {
  test('both limits, one limit, on the limits', () => {
    expect(inRange({ min: 70, max: 75 }, 72)).toBe(true);
    expect(inRange({ min: 70, max: 75 }, 76)).toBe(false);
    expect(inRange({ min: 70, max: 75 }, 69)).toBe(false);
    expect(inRange({ max: 75 }, 10)).toBe(true);
    expect(inRange({ min: 70 }, 1000)).toBe(true);
    expect(inRange({ min: 70, max: 75 }, 70)).toBe(true);
    expect(inRange({ min: 70, max: 75 }, 75)).toBe(true);
  });
});

describe('validKeep', () => {
  test('keeps numbers, drops what is not a range', () => {
    expect(validKeep({ max: 75 })).toEqual({ max: 75 });
    expect(validKeep({ min: '3', max: 5 })).toEqual({ min: 3, max: 5 });
    expect(validKeep({})).toBeUndefined();
    expect(validKeep('75')).toBeUndefined();
    expect(validKeep({ min: 'x' })).toBeUndefined();
    expect(validKeep({ min: 5, max: 5 })).toBeUndefined();
    expect(validKeep({ min: 6, max: 5 })).toBeUndefined();
  });
});

describe('plain state, by week', () => {
  test('the latest value at each Sunday; before the first measurement unknown', () => {
    const g = goal({ max: 75 });
    setUp(
      g,
      plain([
        ['2026-11-04', 76],
        ['2026-11-10', 74],
      ]),
    );
    // Weeks ending 11-01 (nothing yet), 11-08 (76), 11-15 (74).
    expect(keepMarks(g)!.marks).toEqual(['unknown', 'out', 'in']);
    expect(keepMarks(g)!.unit).toBe('week');
    expect(keepShare(g)).toEqual({ n: 1, total: 2 });
  });
  test('a value 29 days old at a Sunday is unknown, 28 is not', () => {
    const g = goal({ max: 75 }, { startDate: '2026-11-09' }); // one week, ending 11-15
    setUp(g, plain([['2026-10-18', 70]])); // 28 days before 11-15
    expect(keepMarks(g)!.marks).toEqual(['in']);
    setUp(g, plain([['2026-10-17', 70]])); // 29 days
    expect(keepMarks(g)!.marks).toEqual(['unknown']);
    expect(keepShare(g)).toBeNull();
  });
  test('no complete week yet: no share', () => {
    const g = goal({ max: 75 }, { startDate: '2026-11-16' });
    setUp(g, plain([['2026-11-16', 70]]));
    expect(keepShare(g)).toBeNull();
  });
});

describe('state that adds up, per period', () => {
  test('per week: an empty week after the first entry is 0', () => {
    const g = goal({ min: 10 }, { period: 'week' });
    setUp(g, addsUp([['2026-11-03', 12]]));
    // Week to 11-01: before the first entry; to 11-08: 12; to 11-15: nothing, 0.
    expect(keepMarks(g)!.marks).toEqual(['unknown', 'in', 'out']);
  });
  test('per month', () => {
    const g = goal({ max: 400 }, { period: 'month', startDate: '2026-09-01' });
    setUp(
      g,
      addsUp([
        ['2026-09-10', 300],
        ['2026-10-05', 300],
        ['2026-10-20', 200],
      ]),
    );
    expect(keepMarks(g)!.marks).toEqual(['in', 'out']);
    expect(keepMarks(g)!.unit).toBe('month');
  });
  test('"at most" passed during the week is out at once', () => {
    const g = goal({ max: 100 }, { period: 'week' });
    setUp(
      g,
      addsUp([
        ['2026-11-10', 50],
        ['2026-11-16', 120],
      ]),
    );
    expect(keepNow(g)).toMatchObject({ kind: 'out', value: 120, dist: 20 });
  });
  test('"at least" not met during the week is not out: the last week decides', () => {
    const g = goal({ min: 10 }, { period: 'week' });
    setUp(
      g,
      addsUp([
        ['2026-11-10', 12],
        ['2026-11-16', 1],
      ]),
    );
    expect(keepNow(g)).toMatchObject({ kind: 'in', value: 12 });
  });
  test('"at least" already met this week is in', () => {
    const g = goal({ min: 10 }, { period: 'week' });
    setUp(g, addsUp([['2026-11-16', 11]]));
    expect(keepNow(g)).toMatchObject({ kind: 'in', value: 11 });
  });
});

describe('keepNow, plain state', () => {
  test('in, out with the distance to the nearer limit, stale, none', () => {
    const g = goal({ min: 70, max: 75 });
    setUp(g, plain([['2026-11-10', 74]]));
    expect(keepNow(g)).toMatchObject({ kind: 'in', value: 74 });
    setUp(g, plain([['2026-11-10', 76.5]]));
    expect(keepNow(g)).toMatchObject({ kind: 'out', value: 76.5, dist: 1.5 });
    setUp(g, plain([['2026-11-10', 68]]));
    expect(keepNow(g)).toMatchObject({ kind: 'out', dist: -2 });
    setUp(g, plain([['2026-10-19', 74]]));
    expect(keepNow(g)).toMatchObject({ kind: 'in' }); // 28 days: still fresh
    setUp(g, plain([['2026-10-18', 74]]));
    expect(keepNow(g)).toMatchObject({ kind: 'stale', date: '2026-10-18' });
    setUp(g, plain([]));
    expect(keepNow(g)).toMatchObject({ kind: 'none' });
  });
  test('no measuring state: none', () => {
    setDb({ ...emptyDb(), goals: [goal({ max: 1 })] });
    expect(keepNow(goal({ max: 1 }))).toMatchObject({ kind: 'none' });
    expect(keepMarks(goal({ max: 1 }))).toBeNull();
  });
});
