import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { isoOf } from '../days';
import type { Repeat } from '../model';
import {
  daysBetween,
  isDueDay,
  lastInMonth,
  monthDay,
  nextDueDay,
  periodOf,
  sched,
  weekday,
  type Routine,
} from './schedule';

// Ported from tests/more.js: "routines: periods, streaks…" (the period part) and the "monthly routines" steps.

const routine = (repeat: Repeat, p: Partial<Routine> = {}): Routine => ({
  id: 'r',
  title: 'r',
  status: 'todo',
  repeat,
  checkins: {},
  ...p,
});
const dueIn = (repeat: Repeat, from: string, to: string, startDate = from) =>
  daysBetween(from, to).filter(d => isDueDay(routine(repeat, { startDate }), d));
const lastOfMonth = (iso: string) => isoOf(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0);
const md = (list: string[]) => list.map(d => d.slice(5));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 16, 12));
});
afterEach(() => vi.useRealTimers());

describe('weeks and periods', () => {
  test('weeks start on Monday (0)', () => {
    expect([weekday('2026-10-26'), weekday('2026-11-01')]).toEqual([0, 6]);
    expect(periodOf(routine({ times: 2, per: 'week' }), '2026-10-29')).toEqual({
      from: '2026-10-26',
      to: '2026-11-01',
    });
  });
  test('a month period, leap February included', () => {
    expect(periodOf(routine({ times: 2, per: 'month' }), '2028-02-10')).toEqual({
      from: '2028-02-01',
      to: '2028-02-29',
    });
  });
});

describe('monthly routines', () => {
  test('a day of the month, clamped to shorter months', () => {
    expect(md(dueIn({ every: 1, unit: 'month', on: 'day', day: 15 }, '2027-01-01', '2027-12-31'))).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => `${m}-15`),
    );
    expect(md(dueIn({ every: 1, unit: 'month', on: 'day', day: 31 }, '2027-01-01', '2027-12-31'))).toEqual([
      '01-31',
      '02-28',
      '03-31',
      '04-30',
      '05-31',
      '06-30',
      '07-31',
      '08-31',
      '09-30',
      '10-31',
      '11-30',
      '12-31',
    ]);
    expect(md(dueIn({ every: 1, unit: 'month', on: 'day', day: 30 }, '2028-02-01', '2028-03-31'))).toEqual([
      '02-29',
      '03-30',
    ]);
    expect(md(dueIn({ every: 1, unit: 'month', on: 'day', day: 29 }, '2027-02-01', '2027-03-31'))).toEqual([
      '02-28',
      '03-29',
    ]);
    expect(md(dueIn({ every: 3, unit: 'month', on: 'day', day: 10 }, '2027-01-20', '2027-12-31'))).toEqual([
      '04-10',
      '07-10',
      '10-10',
    ]);
  });

  test("stored without a day (older routines): the start's day of the month", () => {
    expect(md(dueIn({ every: 1, unit: 'month', on: 'day' }, '2027-01-12', '2027-03-31'))).toEqual([
      '01-12',
      '02-12',
      '03-12',
    ]);
    expect(md(dueIn({ every: 1, unit: 'month' }, '2027-01-12', '2027-02-28'))).toEqual(['01-12', '02-12']);
  });

  test('the last day of the month', () => {
    const got = dueIn({ every: 1, unit: 'month', on: 'lastDay' }, '2027-01-01', '2028-12-31');
    expect(got).toHaveLength(24);
    expect(got.every(d => d === lastOfMonth(d))).toBe(true);
    expect(['2027-02-28', '2028-02-29', '2027-04-30'].every(d => got.includes(d))).toBe(true);
    expect(md(dueIn({ every: 2, unit: 'month', on: 'lastDay' }, '2027-01-15', '2027-07-31'))).toEqual([
      '01-31',
      '03-31',
      '05-31',
      '07-31',
    ]);
  });

  test('the n-th or last weekday, for every weekday', () => {
    const from = '2027-01-01',
      to = '2027-12-31';
    for (let wd = 0; wd < 7; wd++) {
      const byMonth = new Map<string, string[]>();
      for (const d of daysBetween(from, to).filter(d => weekday(d) === wd))
        byMonth.set(d.slice(0, 7), [...(byMonth.get(d.slice(0, 7)) ?? []), d]);
      const months = [...byMonth.values()];
      for (const nth of [1, 2, 3, 4])
        expect(dueIn({ every: 1, unit: 'month', on: 'nth', nth, weekday: wd }, from, to)).toEqual(
          months.map(m => m[nth - 1]),
        );
      expect(dueIn({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: wd }, from, to)).toEqual(
        months.map(m => m.at(-1)),
      );
    }
    expect(dueIn({ every: 1, unit: 'month', on: 'nth', nth: 2, weekday: 4 }, '2027-01-01', '2027-04-30')).toEqual([
      '2027-01-08',
      '2027-02-12',
      '2027-03-12',
      '2027-04-09',
    ]);
    expect(dueIn({ every: 1, unit: 'month', on: 'nth', nth: 5, weekday: 4 }, '2027-01-01', '2027-06-30')).toEqual([
      '2027-01-29',
      '2027-04-30',
    ]);
    expect(dueIn({ every: 2, unit: 'month', on: 'nth', nth: 1, weekday: 0 }, '2027-01-01', '2027-06-30')).toEqual([
      '2027-01-04',
      '2027-03-01',
      '2027-05-03',
    ]);
  });

  test("older 'weekday' and 'last' routines keep their days, read as the n-th weekday", () => {
    for (const start of ['2027-01-28', '2027-03-15', '2027-05-31', '2027-07-01', '2027-09-29']) {
      const nth = Math.ceil(monthDay(start) / 7),
        wd = weekday(start);
      expect(dueIn({ every: 1, unit: 'month', on: 'weekday' }, start, '2028-06-30')).toEqual(
        dueIn({ every: 1, unit: 'month', on: 'nth', nth, weekday: wd }, start, '2028-06-30'),
      );
      if (lastInMonth(start))
        expect(dueIn({ every: 1, unit: 'month', on: 'last' }, start, '2028-06-30')).toEqual(
          dueIn({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: wd }, start, '2028-06-30'),
        );
      expect(sched(routine({ every: 1, unit: 'month', on: 'weekday' }, { startDate: start }))).toEqual({
        every: 1,
        unit: 'month',
        on: 'nth',
        nth,
        weekday: wd,
      });
    }
    const old = routine({ every: 1, unit: 'month', on: 'last' }, { startDate: '2027-01-27' });
    expect(dueIn(old.repeat, '2027-01-01', '2027-04-30', old.startDate)).toEqual([
      '2027-01-27',
      '2027-02-24',
      '2027-03-31',
      '2027-04-28',
    ]);
    sched(old);
    expect(JSON.stringify(old.repeat)).toBe('{"every":1,"unit":"month","on":"last"}');
  });

  test("the next due day is this month's last day", () => {
    const r = routine({ every: 1, unit: 'month', on: 'lastDay' }, { startDate: '2026-07-19' });
    expect(nextDueDay(r)).toBe('2026-11-30');
  });
});
