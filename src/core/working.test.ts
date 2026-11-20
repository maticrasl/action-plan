import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Activity, type Entry, type Goal, type Repeat, type State } from './model';
import { setDb } from './state';
import { addDays, daysBetween, type Routine } from './routines/schedule';
import { compare, goodWay, valueAt, verdict, weekKept } from './working';

const TODAY = '2026-11-18'; // a Wednesday; the last complete week is 9–15 November
const LAST_MON = '2026-11-09';
const routine = (repeat: Repeat, p: Partial<Routine> = {}): Routine => ({
  id: 'r',
  title: 'r',
  status: 'doing',
  repeat,
  checkins: {},
  ...p,
});
const ticks = (...days: string[]) => Object.fromEntries(days.map(d => [d, 1 as const]));
const week = (mon: string) => daysBetween(mon, addDays(mon, 6));
const [MON, TUE, WED, THU, FRI] = week('2026-11-02');
const plain = (history: { date: string; value: string }[]): State => ({
  id: 's',
  title: 'Run',
  description: '',
  unit: 'km',
  value: '',
  history,
});
const goal = (p: Partial<Goal>): Goal => ({ id: 'g', title: 'g', status: 'active', ...p }) as Goal;

// `n` complete weeks up to the last one: their Mondays, oldest first.
const mondays = (n: number) => Array.from({ length: n }, (_, i) => addDays(LAST_MON, -7 * (n - 1 - i)));
/* A Monday routine kept in the weeks marked 1, and a state measured every Sunday whose change in
   each week is `changes[i]` (the Sunday before the first week starts at 0). */
function pair(kept: number[], changes: number[]) {
  const mons = mondays(kept.length);
  const r = routine(
    { every: 1, unit: 'week', days: [0] },
    {
      startDate: mons[0],
      checkins: ticks(...mons.filter((_, i) => kept[i])),
    },
  );
  let v = 0;
  const history = [{ date: addDays(mons[0], -1), value: '0' }];
  mons.forEach((m, i) => history.push({ date: addDays(m, 6), value: String((v += changes[i])) }));
  return { r, s: plain(history) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00`));
  setDb(emptyDb());
});
afterEach(() => vi.useRealTimers());

describe('kept or not kept, by week', () => {
  test('flexible: the week’s target met or not', () => {
    const r = routine({ every: 1, unit: 'week', times: 3 }, { startDate: '2026-01-05' });
    r.checkins = ticks(MON, WED, FRI);
    expect(weekKept(r, MON)).toBe(true);
    r.checkins = ticks(MON, WED);
    expect(weekKept(r, MON)).toBe(false);
  });
  test('set days: 75 % kept, just under left out, 50 % left out, under 50 % not kept', () => {
    const four = routine({ every: 1, unit: 'week', days: [0, 1, 2, 3] }, { startDate: '2026-01-05' });
    four.checkins = ticks(MON, TUE, WED);
    expect(weekKept(four, MON)).toBe(true);
    four.checkins = ticks(MON, TUE);
    expect(weekKept(four, MON)).toBe(null);
    const daily = routine({ every: 1, unit: 'day' }, { startDate: '2026-01-05' });
    daily.checkins = ticks(...week(MON).slice(0, 5)); // 5 of 7: just under 75 %
    expect(weekKept(daily, MON)).toBe(null);
    daily.checkins = ticks(...week(MON).slice(0, 3)); // 3 of 7: under 50 %
    expect(weekKept(daily, MON)).toBe(false);
  });
  test('made-up days count as kept', () => {
    const r = routine({ every: 1, unit: 'week', days: [0], makeUp: true }, { startDate: '2026-01-05' });
    r.checkins = ticks(THU);
    expect(weekKept(r, MON)).toBe(true);
  });
  test('a week without a due day is left out', () => {
    const r = routine({ every: 2, unit: 'week', days: [0] }, { startDate: '2026-10-26', checkins: ticks(MON) });
    expect(weekKept(r, MON)).toBe(null);
  });
});

describe('a plain state’s value on a Sunday', () => {
  const s = (pts: [string, number][]) => plain(pts.map(([date, v]) => ({ date, value: String(v) })));
  test('the measurement on that day, or on the line between the two around it', () => {
    expect(
      valueAt(
        s([
          ['2026-11-01', 10],
          ['2026-11-08', 12],
        ]),
        '2026-11-08',
      ),
    ).toBe(12);
    expect(
      valueAt(
        s([
          ['2026-11-01', 10],
          ['2026-11-11', 20],
        ]),
        '2026-11-08',
      ),
    ).toBe(17);
  });
  test('outside the first-to-last measurement: none', () => {
    expect(
      valueAt(
        s([
          ['2026-11-02', 10],
          ['2026-11-07', 12],
        ]),
        '2026-11-08',
      ),
    ).toBe(null);
    expect(
      valueAt(
        s([
          ['2026-11-09', 10],
          ['2026-11-12', 12],
        ]),
        '2026-11-08',
      ),
    ).toBe(null);
  });
  test('a gap of 22 days leaves the days inside it out, 21 does not', () => {
    expect(
      valueAt(
        s([
          ['2026-10-25', 0],
          ['2026-11-15', 21],
        ]),
        '2026-11-08',
      ),
    ).toBe(14);
    expect(
      valueAt(
        s([
          ['2026-10-24', 0],
          ['2026-11-15', 22],
        ]),
        '2026-11-08',
      ),
    ).toBe(null);
  });
});

describe('the verdict', () => {
  const mean = [4, 0, 0, 0]; // mean 1, squares 12; with the one below the spread is exactly 2
  const base = [3, -1, -1, -1]; // mean 0, squares 12
  test('3 weeks on a side is too few, 4 is enough', () => {
    expect(verdict(mean.slice(1), base, 1)).toBe('few');
    expect(verdict(mean, base.slice(1), 1)).toBe('few');
    expect(verdict(mean, base, 1)).toBe('better');
  });
  test('exactly 0.5 spreads is better, just under is none, the other way worse', () => {
    expect(verdict(mean, base, 1)).toBe('better');
    expect(
      verdict(
        mean.map(x => x - 0.02),
        base,
        1,
      ),
    ).toBe('none');
    expect(verdict(mean, base, -1)).toBe('worse');
    expect(verdict(base, mean, 1)).toBe('worse');
  });
  test('no good direction: it only describes', () => {
    expect(verdict(mean, base, 0)).toBe('more');
    expect(verdict(base, mean, 0)).toBe('less');
  });
  test('zero spread: none when equal, else by the sign', () => {
    expect(verdict([1, 1, 1, 1], [1, 1, 1, 1], 1)).toBe('none');
    expect(verdict([2, 2, 2, 2], [1, 1, 1, 1], 1)).toBe('better');
    expect(verdict([1, 1, 1, 1], [2, 2, 2, 2], 1)).toBe('worse');
  });
});

describe('the good direction', () => {
  const s = plain([{ date: '2026-11-01', value: '80' }]);
  test('toward the target of the first active goal by deadline', () => {
    expect(goodWay([goal({ target: '90', baseline: '80' })], s)).toBe(1);
    expect(goodWay([goal({ target: '70' })], s)).toBe(-1);
    const later = goal({ target: '90', deadline: '2027-06-01' }),
      sooner = goal({ target: '70', deadline: '2027-01-01' });
    expect(goodWay([later, sooner], s)).toBe(-1);
    expect(goodWay([goal({ target: '70', status: 'paused' })], s)).toBe(0);
  });
  test('no goal: none', () => {
    expect(goodWay([], s)).toBe(0);
    expect(goodWay([goal({ target: '' })], s)).toBe(0);
  });
});

describe('compare', () => {
  // Kept in 7 of 12 weeks; kept weeks rose 0.4, the others 0.1 (with a little noise).
  const KEPT = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0];
  const CHANGES = KEPT.map((k, i) => (k ? 0.4 : 0.1) + (i % 2 ? 0.05 : -0.05));
  const up = [goal({ target: '50', baseline: '0' })];

  test('a clear effect toward the target is better', () => {
    const { r, s } = pair(KEPT, CHANGES);
    const w = compare(r, s, up, TODAY)!;
    expect(w.kind).toBe('better');
    expect(w.kept.n).toBe(7);
    expect(w.missed.n).toBe(5);
    expect(w.kept.mean).toBeCloseTo(0.4, 1);
    expect(w.unit).toBe('km');
    expect(compare(r, s, [goal({ target: '-50', baseline: '0' })], TODAY)!.kind).toBe('worse');
    expect(compare(r, s, [], TODAY)!.kind).toBe('more');
  });
  test('same input, same output', () => {
    const { r, s } = pair(KEPT, CHANGES);
    expect(compare(r, s, up, TODAY)).toEqual(compare(r, s, up, TODAY));
  });
  test('kept every week: few, with the counts', () => {
    const { r, s } = pair(
      KEPT.map(() => 1),
      CHANGES,
    );
    expect(compare(r, s, up, TODAY)).toMatchObject({ kind: 'few', kept: { n: 12 }, missed: { n: 0 } });
  });
  test('a week in which the routine started on Wednesday is left out', () => {
    const { r, s } = pair(KEPT, CHANGES);
    r.startDate = addDays(r.startDate!, 2);
    expect(compare(r, s, up, TODAY)!.kept.n).toBe(6);
  });
  test('not more than the last 52 weeks', () => {
    const kept = Array.from({ length: 60 }, (_, i) => i % 2);
    const { r, s } = pair(
      kept,
      kept.map(k => k * 2),
    );
    const w = compare(r, s, up, TODAY)!;
    expect(w.kept.n + w.missed.n).toBe(52);
  });
  test('a monthly routine repeats too seldom', () => {
    const { s } = pair(KEPT, CHANGES);
    const r = routine({ every: 1, unit: 'month', on: 'day', day: 1 }, { startDate: '2025-01-01' });
    expect(compare(r, s, up, TODAY)!.kind).toBe('seldom');
  });
  test('nothing for a one-time activity or a state without measurements', () => {
    const { r, s } = pair(KEPT, CHANGES);
    const once = { id: 'a', title: 'a', status: 'todo' } as Activity;
    expect(compare(once, s, up, TODAY)).toBe(null);
    expect(compare(r, plain([]), up, TODAY)).toBe(null);
  });

  describe('a state that adds up', () => {
    function adding(from?: string) {
      const { r } = pair(KEPT, CHANGES);
      const entries: Entry[] = mondays(12).map((m, i) => ({
        id: m,
        date: addDays(m, 2),
        amount: String(KEPT[i] ? 10 + i : 2 + i),
        routine: from,
      }));
      const s: State = { ...plain([]), cumulative: true, entries };
      return { r, s };
    }
    test('the change is the week’s total', () => {
      const { r, s } = adding();
      const w = compare(r, s, up, TODAY)!;
      expect(w.kind).toBe('better');
      expect(w.missed.mean).toBeCloseTo(2 + (1 + 4 + 6 + 9 + 11) / 5, 6);
    });
    test('amounts from this routine leave the pair out; from another routine they do not', () => {
      expect(compare(adding('r').r, adding('r').s, up, TODAY)).toBe(null);
      expect(compare(adding('other').r, adding('other').s, up, TODAY)!.kind).toBe('better');
    });
  });
});
