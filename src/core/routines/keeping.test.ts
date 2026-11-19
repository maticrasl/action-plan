import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Repeat } from '../model';
import { isComplete } from '../progress';
import { setDb } from '../state';
import { addDays, daysBetween, isDueDay, type Routine } from './schedule';
import {
  byUrgency,
  consistency,
  madeUpDays,
  missedDays,
  periodProgress,
  routineState,
  routineStreak,
  routineToday,
} from './keeping';

// Ported from tests/more.js: "routines: set days can be made up on another day", "routines: periods, streaks,
// consistency and states", "routines: late only until ticked again…" and "monthly routines: check-ins,
// streaks…" (their rule assertions; the badge, strip and timeline are checked in the page).

const routine = (repeat: Repeat, p: Partial<Routine> = {}): Routine => ({
  id: 'r',
  title: 'r',
  status: 'todo',
  repeat,
  checkins: {},
  ...p,
});
const ticks = (...days: string[]) => Object.fromEntries(days.map(d => [d, 1 as const]));
// The week of 2 November 2026, Monday to Sunday.
const [MON, TUE, WED, THU, FRI, SAT, SUN] = daysBetween('2026-11-02', '2026-11-08');
// Today, at noon local time.
const onDay = (iso: string) => vi.setSystemTime(new Date(`${iso}T12:00`));

beforeEach(() => {
  vi.useFakeTimers();
  setDb(emptyDb()); // routineState asks for blockers in the open plan
});
afterEach(() => vi.useRealTimers());

describe('make-up days', () => {
  const twoDays = (makeUp: boolean, checkins: Record<string, 1>) =>
    routine(
      { every: 1, unit: 'week', days: [0, 3], ...(makeUp && { makeUp: true }) },
      { startDate: '2026-10-01', checkins },
    );

  test('set days are strict; with makeUp a tick on another day makes up a missed one', () => {
    const strict = twoDays(false, ticks(TUE)),
      loose = twoDays(true, ticks(TUE));
    onDay(WED);
    expect([periodProgress(strict).done, periodProgress(loose).done]).toEqual([0, 1]);
    expect([...madeUpDays(loose, WED)]).toEqual([MON]);
    expect(madeUpDays(strict, WED).size).toBe(0);
    expect([missedDays(strict, MON, TUE), missedDays(loose, MON, TUE)]).toEqual([[MON], []]);
    expect(routineToday(loose)).toBe('rest');
  });

  test('one tick per missed day, the earliest first; the period is met with the last one', () => {
    const loose = twoDays(true, ticks(FRI));
    onDay(SUN);
    expect([...madeUpDays(loose, SUN)]).toEqual([MON]);
    expect(missedDays(loose, MON, SAT)).toEqual([THU]);
    expect(periodProgress(loose)).toMatchObject({ done: 1, target: 2, met: false });
    expect(routineState(loose)).toBe('doing');
    expect(routineToday(loose)).toBe('makeUp');
    loose.checkins![SUN] = 1;
    expect(periodProgress(loose).met).toBe(true);
    expect(routineState(loose)).toBe('done');
    expect(missedDays(loose, MON, SAT)).toEqual([]);
  });

  test('ticks ahead of a due day count toward it', () => {
    const loose = twoDays(true, ticks(MON, TUE));
    onDay(THU);
    expect(periodProgress(loose).met).toBe(true);
    expect(routineToday(loose)).toBe('met');
    onDay(FRI);
    expect(missedDays(loose, MON, THU)).toEqual([]);
    expect(madeUpDays(loose, FRI).has(THU)).toBe(true);
  });

  test('streak and consistency count made-up days as kept; extra ticks are capped at the target', () => {
    const ls = twoDays(true, ticks('2026-10-26', '2026-10-30', MON)),
      ss = twoDays(false, ticks('2026-10-26', '2026-10-30', MON));
    onDay(WED);
    expect([routineStreak(ls).n, routineStreak(ss).n]).toEqual([3, 1]);
    expect(consistency(ls)!).toBeGreaterThan(consistency(ss)!);
    expect(periodProgress(twoDays(true, ticks(MON, TUE, WED))).done).toBe(2);
  });

  test('monthly: made up within the month', () => {
    const monthly = routine(
      { every: 1, unit: 'month', on: 'day', day: 1, makeUp: true },
      { startDate: '2026-09-01', checkins: ticks('2026-11-03') },
    );
    onDay('2026-11-10');
    expect(missedDays(monthly, '2026-11-01', '2026-11-09')).toEqual([]);
    expect(routineState(monthly)).toBe('done');
  });
});

describe('the late rule: late only until ticked again', () => {
  test('set days: however many were missed, a tick puts it back on track', () => {
    const daily = routine({ every: 1, unit: 'week', days: [0, 1, 2, 3, 4, 5, 6] }, { startDate: '2026-10-01' });
    const state = (...days: string[]) => routineState({ ...daily, checkins: ticks(...days) });
    onDay(THU);
    expect(state(MON, TUE, WED)).toBe('doing');
    expect(routineToday({ ...daily, checkins: ticks(MON, TUE, WED) })).toBe('due');
    expect(state(MON)).toBe('late');
    expect(state(MON, THU)).toBe('doing');
    expect(state(THU)).toBe('doing');
    expect(state(TUE)).toBe('late');
    expect(state(WED)).toBe('doing');
  });

  test('a miss in last week does not count; a tick on a day it is not due still clears it', () => {
    const monThu = routine(
      { every: 1, unit: 'week', days: [0, 3] },
      { startDate: '2026-10-01', checkins: ticks('2026-10-26') },
    );
    onDay(THU);
    expect(routineState(monThu)).toBe('late');
    monThu.checkins![TUE] = 1;
    expect(routineState(monThu)).toBe('todo');
  });

  test('flexible: behind once the days left cannot reach the target; a tick after that clears it', () => {
    const flex = (...days: string[]) =>
      routine({ every: 1, unit: 'week', times: 3 }, { startDate: '2026-10-01', checkins: ticks(...days) });
    onDay(SUN);
    expect(routineState(flex())).toBe('late');
    expect(routineState(flex(SUN))).toBe('doing');
    expect(routineState(flex(FRI))).toBe('late');
    expect(routineState(flex(MON))).toBe('late');
    expect(routineState(flex(MON, SAT))).toBe('doing');
    onDay(WED);
    expect(routineToday(flex())).toBe('any');
    onDay(FRI);
    expect(routineToday(flex())).toBe('due');
    expect(routineToday(flex(MON, TUE, WED))).toBe('met');
    expect(routineToday(flex(MON, TUE, WED, FRI))).toBe('done');
  });

  test('not running today: nothing asked', () => {
    onDay(THU);
    expect(routineToday(routine({ every: 1, unit: 'week', times: 2 }, { startDate: '2026-12-01' }))).toBeNull();
  });
});

describe('periods, streaks, consistency and states', () => {
  // Thursday: the step's checks for later in the week all apply.
  const now = THU,
    monday = MON;
  const w = (n: number) => addDays(monday, -7 * n);

  test('three times a week: met, missed, met; this week counts once met', () => {
    onDay(now);
    const run = routine({ times: 3, per: 'week' }, { startDate: w(3) });
    const tick = (...isos: string[]) => isos.forEach(d => (run.checkins![d] = 1));
    tick(w(3), addDays(w(3), 2), addDays(w(3), 4), w(2), addDays(w(2), 1), w(1), addDays(w(1), 3), addDays(w(1), 6));
    expect(periodProgress(run)).toEqual({ from: monday, to: addDays(monday, 6), done: 0, target: 3, met: false });
    expect(routineStreak(run)).toEqual({ n: 1, unit: 'week' });
    expect(consistency(run)).toBe(2 / 3);
    expect(consistency(run, w(1))).toBe(1);
    tick(now);
    expect([periodProgress(run).done, routineState(run)]).toEqual([1, 'doing']);
    tick(addDays(now, -1), addDays(now, -2));
    expect(periodProgress(run).met).toBe(true);
    expect(routineStreak(run)).toEqual({ n: 2, unit: 'week' });
    expect(consistency(run)).toBe(3 / 4);
    expect(routineState(run)).toBe('done');
  });

  test('seven times a week with nothing ticked is late after Monday', () => {
    onDay(now);
    expect(routineState(routine({ times: 7, per: 'week' }, { startDate: w(1) }))).toBe('late');
  });

  test('every day: a streak today does not break yet, consistency, late until ticked again', () => {
    onDay(now);
    const daily = routine({ days: [0, 1, 2, 3, 4, 5, 6] }, { startDate: addDays(now, -10) });
    for (let n = 1; n <= 10; n++) if (n !== 3) daily.checkins![addDays(now, -n)] = 1;
    expect(routineStreak(daily)).toEqual({ n: 2, unit: 'day' });
    expect(consistency(daily)).toBe(9 / 10);
    expect(routineState(daily)).toBe('doing');
    const since = [1, 2].map(n => addDays(now, -n));
    since.forEach(d => delete daily.checkins![d]);
    expect(routineState(daily)).toBe('late');
    since.forEach(d => (daily.checkins![d] = 1));
    daily.checkins![now] = 1;
    expect(routineStreak(daily).n).toBe(3);
  });

  test('set days: ticks on other days do not count', () => {
    onDay(now);
    const monThu = routine({ days: [0, 3] }, { startDate: w(2), checkins: ticks(addDays(w(1), 1), addDays(w(1), 2)) });
    expect(consistency(monThu, '')).toBe(0);
  });

  test('not started, and ended (an ended routine is complete)', () => {
    onDay(now);
    expect(routineState(routine({ times: 1, per: 'week' }, { startDate: addDays(now, 3) }))).toBe('todo');
    const ended = routine({ times: 1, per: 'week' }, { startDate: addDays(now, -30), dueDate: addDays(now, -1) });
    const going = routine({ times: 1, per: 'week' }, { startDate: addDays(now, -30) });
    expect([routineState(ended), isComplete('activity', ended), isComplete('activity', going)]).toEqual([
      'done',
      true,
      false,
    ]);
  });

  test('monthly on the last day: a streak of month ends, one due this month', () => {
    onDay('2026-11-16');
    const r = routine({ every: 1, unit: 'month', on: 'lastDay' }, { startDate: '2026-07-19' });
    const done = daysBetween(r.startDate!, '2026-11-15').filter(d => isDueDay(r, d));
    expect(done).toEqual(['2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31']);
    r.checkins = ticks(...done);
    expect(routineStreak(r).n).toBe(4);
    expect(periodProgress(r).target).toBe(1);
  });
});

describe('routines in order of urgency', () => {
  test('late, then due today, then by next due day; met, then inactive, last', () => {
    onDay(WED);
    const start = { startDate: '2026-10-01' };
    const rs = [
      routine({ days: [4] }, { ...start, id: 'fri' }),
      routine({ times: 1, per: 'week' }, { ...start, id: 'met', checkins: ticks(MON) }),
      routine({ days: [0] }, { startDate: '2027-01-04', id: 'notStarted' }),
      routine({ days: [3] }, { ...start, id: 'thu' }),
      routine({ days: [2] }, { ...start, id: 'today' }),
      routine({ days: [0, 1, 2, 3, 4, 5, 6] }, { ...start, id: 'ended', dueDate: '2026-10-20' }),
      routine({ days: [0, 1, 2, 3, 4, 5, 6] }, { ...start, id: 'late' }),
    ];
    expect([...rs].sort(byUrgency).map(r => r.id)).toEqual(['late', 'today', 'thu', 'fri', 'met', 'notStarted', 'ended']);
  });
});
