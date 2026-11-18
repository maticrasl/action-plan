import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { today } from './dates';
import { emptyDb, type Entry, type Goal, type State } from './model';
import {
  calPeriod,
  convertState,
  goalPeriod,
  lastPeriodTotal,
  periodTotals,
  recordMeasurement,
  refreshTotal,
  stateDate,
  stateScale,
  stateTotal,
  stateValue,
} from './cumulative';
import { mergePlans, mergeState } from './merge';
import { parsePlanFile } from './normalize';
import { goalCurrent, goalReached } from './progress';
import { setDb } from './state';
import { addDays } from './routines/schedule';

// Ported from tests/more.js: "cumulative: calendar periods, totals at their edges…", "the value is the running
// total…", the defaults in "old states migrate…", "an old export imports in the new form…", "the graph
// scale and a goal's period sync…" and "switching to plain and back…".

let n = 0;
const entry = (date: string, amount: number | string): Entry => ({ id: `e${++n}`, date, amount: String(amount) });
const adds = (entries: Entry[], p: Partial<State> = {}): State => ({
  id: 's',
  title: 's',
  description: '',
  value: '',
  history: [],
  cumulative: true,
  entries,
  ...p,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 16, 12));
});
afterEach(() => vi.useRealTimers());

test('calendar periods: weeks Monday to Sunday, a leap February, a year, a day', () => {
  expect(calPeriod('week', '2026-10-28')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  expect(calPeriod('week', '2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  expect(calPeriod('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  expect(calPeriod('year', '2026-12-31')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  expect(calPeriod('day', '2026-03-29')).toEqual({ from: '2026-03-29', to: '2026-03-29' });
});

test('totals at the edges of weeks, months and years; several entries a day add up', () => {
  const wk = adds([entry('2026-10-25', 5), entry('2026-10-26', 3), entry('2026-10-26', 2.5), entry('2026-11-01', 1)]);
  expect(stateTotal(wk, 'week', '2026-10-25')).toBe(5);
  expect(stateTotal(wk, 'week', '2026-10-28')).toBe(6.5);
  expect(lastPeriodTotal(wk, 'week', '2026-10-28')).toBe(5);
  const mo = adds([entry('2026-01-31', 1), entry('2026-02-01', 2), entry('2026-12-31', 4), entry('2027-01-01', 8)]);
  expect([
    stateTotal(mo, 'month', '2026-01-15'),
    stateTotal(mo, 'month', '2026-02-28'),
    stateTotal(mo, 'month', '2026-12-01'),
    stateTotal(mo, 'month', '2027-01-31'),
  ]).toEqual([1, 2, 4, 8]);
  expect([stateTotal(mo, 'year', '2026-06-01'), stateTotal(mo, 'year', '2027-06-01')]).toEqual([7, 8]);
  expect(
    stateTotal(adds([entry('2026-05-05', 0.1), entry('2026-05-05', 0.2), entry('2026-05-06', 1)]), 'day', '2026-05-05'),
  ).toBe(0.3);
  const all = adds([entry('2026-01-01', 100), entry('2026-06-01', 50.5), entry('2099-01-01', 7)]);
  expect([stateTotal(all, 'total', '2026-12-31'), stateTotal(all, undefined, '2026-12-31')]).toEqual([150.5, 150.5]);
  expect(stateTotal(adds([entry('', 5), { id: 'x', date: '2026-01-01', amount: 'abc' }]))).toBe(0);
});

test('the value is the running total, fresh when a period ends without an edit', () => {
  const now = today(),
    y = addDays(now, -1);
  const s = adds([entry(y, 4)], { scale: 'day' });
  expect([stateTotal(s, 'day'), lastPeriodTotal(s, 'day'), stateValue(s)]).toEqual([0, 4, 4]);
  s.entries!.push(entry(now, 2.5));
  expect([stateTotal(s, 'day'), stateDate(s), stateValue(s)]).toEqual([2.5, now, 6.5]);
  expect([stateValue(adds([])), stateDate(adds([]))]).toEqual(['', '']);
  refreshTotal(s);
  expect([s.value, s.date]).toEqual(['6.5', now]);
  const periods = periodTotals(adds([entry(addDays(now, -15), 1), entry(now, 2)]), 'week');
  expect(periodTotals(adds([entry(now, 2)]), 'total' as 'week')).toEqual([]);
  expect(periods.length).toBeGreaterThanOrEqual(3);
  expect(periods.some(p => p.total === 0)).toBe(true);
  expect(periods.at(-1)!.total).toBe(2);
});

test('defaults: an unknown scale and a goal without a period count in total', () => {
  expect([
    stateScale({ scale: 'bogus' as 'week' }),
    goalPeriod({ id: 'g', title: 'g', status: 'active', period: 'total' }),
    goalPeriod({ id: 'g', title: 'g', status: 'active' }),
  ]).toEqual(['total', 'total', 'total']);
});

test('plain states keep one value a date: a new one that day replaces it', () => {
  const p: State = { id: 'p', title: 'p', description: '', value: '', history: [] };
  recordMeasurement(p, today(), '5');
  recordMeasurement(p, today(), '7');
  expect([p.history.length, stateValue(p)]).toEqual([1, '7']);
});

test('an old export imports in the new form, and its goal counts the last full week', () => {
  const lastWeek = addDays(calPeriod('week', today()).from, -1);
  const raw = {
    name: 'Old export',
    goals: [{ id: 'g', title: 'Run 30 a week', status: 'active', baseline: '0', target: '30', metric: 'Km' }],
    states: [
      {
        id: 's',
        title: 'Km',
        unit: 'km',
        cumulative: 'week',
        entries: [{ id: 'e', date: lastWeek, amount: '30' }],
        value: '0',
        date: lastWeek,
      },
    ],
    relations: [{ id: 'r', from: 's', to: 'g', type: 'measures' }],
  };
  const { data } = parsePlanFile(JSON.stringify(raw), 'old.json');
  expect([data.states[0].cumulative, data.states[0].scale, data.states[0].value, data.goals[0].period]).toEqual([
    true,
    'week',
    '30',
    'week',
  ]);
  setDb(data);
  expect([goalCurrent(data.goals[0]), goalReached(data.goals[0])]).toEqual([30, true]);
  setDb(emptyDb());
});

test("the graph scale and a goal's period sync like any other change", () => {
  const e = (id: string, amount: number): Entry => ({ id, date: today(), amount: String(amount) });
  // Device A switched the graph to months later; device B added an amount earlier.
  const a = adds([e('x', 1)], { scale: 'month', updatedAt: '2099-02-01', value: '1', date: today() });
  const b = adds([e('x', 1), e('y', 2)], { scale: 'week', updatedAt: '2099-01-01', value: '3', date: today() });
  const m = mergeState(a, b);
  expect([m.scale, m.entries!.map(x => x.id), m.value]).toEqual(['month', ['x', 'y'], '3']);
  const goal = (period: Goal['period'], updatedAt: string): Goal => ({
    id: 'g',
    title: 'G',
    status: 'active',
    period,
    updatedAt,
  });
  const merged = mergePlans(
    { ...emptyDb(), goals: [goal('month', '2099-01-01')], states: [b] },
    { ...emptyDb(), goals: [goal('week', '2099-03-01')], states: [a] },
  );
  expect([merged.goals[0].period, merged.states[0].scale]).toEqual(['week', 'month']);
});

test("switching to plain and back keeps the graph's scale", () => {
  const s = adds([{ id: 'a', date: today(), amount: '4' }], { scale: 'month' });
  convertState(s, false);
  expect([!s.cumulative, s.scale, s.history.length]).toEqual([true, 'month', 1]);
  convertState(s, true);
  expect([s.cumulative, stateScale(s), stateValue(s)]).toEqual([true, 'month', 4]);
});
