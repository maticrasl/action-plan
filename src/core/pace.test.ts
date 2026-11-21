import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { dayNum, dayStr } from './days';
import { emptyDb, type Activity, type Goal, type RelType, type State } from './model';
import { actsPace, forecast, goalPace, neededRate, paceAt, paceSeries, paceStatus, trend } from './pace';
import { addRelation } from './relations';
import { db, setDb } from './state';

const TODAY = '2026-11-16';
const T = dayNum(TODAY);
// Start 100 days ago, deadline 100 days ahead: halfway today.
const g = (more: Partial<Goal> = {}): Goal => ({
  id: 'g',
  title: 'g',
  status: 'active',
  metric: 'km',
  baseline: '0',
  target: '100',
  startDate: dayStr(T - 100),
  deadline: dayStr(T + 100),
  ...more,
});
const pts = (list: [number, number][]) => list.map(([d, value]) => ({ day: T + d, value }));

describe('paceAt', () => {
  test('baseline at the start, target at the deadline, the middle halfway, held outside', () => {
    expect(paceAt(g(), T - 100)).toBe(0);
    expect(paceAt(g(), T + 100)).toBe(100);
    expect(paceAt(g(), T)).toBe(50);
    expect(paceAt(g(), T - 200)).toBe(0);
    expect(paceAt(g(), T + 300)).toBe(100);
  });
  test('lower is better', () => {
    expect(paceAt(g({ baseline: '90', target: '70' }), T)).toBe(80);
  });
  test('no deadline, no target or dates in the wrong order: none', () => {
    expect(paceAt(g({ deadline: undefined }), T)).toBeNull();
    expect(paceAt(g({ target: '' }), T)).toBeNull();
    expect(paceAt(g({ startDate: dayStr(T + 200) }), T)).toBeNull();
  });
  test('without a start date the day it was made counts', () => {
    expect(paceAt(g({ startDate: undefined, createdAt: dayStr(T - 100) }), T)).toBe(50);
    expect(paceAt(g({ startDate: undefined }), T)).toBeNull();
  });
});

describe('paceStatus', () => {
  test('the borders of ±5 %', () => {
    expect(paceStatus(g(), 55.1, TODAY)?.status).toBe('ahead');
    expect(paceStatus(g(), 55, TODAY)?.status).toBe('on');
    expect(paceStatus(g(), 45, TODAY)?.status).toBe('on');
    expect(paceStatus(g(), 44.9, TODAY)).toEqual({ status: 'behind', gap: expect.closeTo(-0.051, 6) });
  });
  test('lower is better: the gap is signed toward the target', () => {
    const w = g({ baseline: '90', target: '70' }); // pace today 80; 5 % is 1
    expect(paceStatus(w, 78.9, TODAY)?.status).toBe('ahead');
    expect(paceStatus(w, 79, TODAY)?.status).toBe('on');
    expect(paceStatus(w, 81, TODAY)?.status).toBe('on');
    expect(paceStatus(w, 81.1, TODAY)?.status).toBe('behind');
  });
  test('none before the start, after the deadline, or once reached', () => {
    expect(paceStatus(g({ startDate: dayStr(T + 1) }), 0, TODAY)).toBeNull();
    expect(paceStatus(g({ deadline: dayStr(T - 1), startDate: dayStr(T - 50) }), 0, TODAY)).toBeNull();
    expect(paceStatus(g(), 100, TODAY)).toBeNull();
  });
  test('the start today and the deadline today still count', () => {
    expect(paceStatus(g({ startDate: TODAY }), 0, TODAY)?.status).toBe('on');
    expect(paceStatus(g({ deadline: TODAY }), 50, TODAY)?.status).toBe('behind');
  });
});

describe('neededRate', () => {
  test('per week from here', () => {
    expect(neededRate(g(), 50, TODAY)).toEqual({ value: 3.5, per: 'week' });
  });
  test('per day when less than two weeks are left', () => {
    expect(neededRate(g({ deadline: dayStr(T + 13) }), 87, TODAY)).toEqual({ value: 1, per: 'day' });
  });
  test('two significant digits', () => {
    expect(neededRate(g({ deadline: dayStr(T + 70) }), 96, TODAY)?.value).toBe(0.4);
    expect(neededRate(g({ deadline: dayStr(T + 70), target: '220' }), 96, TODAY)?.value).toBe(12);
    expect(neededRate(g({ deadline: dayStr(T + 70), target: '15000' }), 0, TODAY)?.value).toBe(1500);
  });
  test('lower is better: the amount to lose', () => {
    expect(neededRate(g({ baseline: '90', target: '70', deadline: dayStr(T + 70) }), 80, TODAY)?.value).toBe(1);
  });
  test('none when reached, past the deadline, or on the deadline', () => {
    expect(neededRate(g(), 100, TODAY)).toBeNull();
    expect(neededRate(g({ deadline: dayStr(T - 1), startDate: dayStr(T - 50) }), 50, TODAY)).toBeNull();
    expect(neededRate(g({ deadline: TODAY }), 50, TODAY)).toBeNull();
  });
});

describe('trend', () => {
  test('fewer than 3 points, or 3 over 13 days: none; over 14 days: yes', () => {
    expect(
      trend(
        pts([
          [-10, 1],
          [0, 2],
        ]),
        TODAY,
      ),
    ).toBeNull();
    expect(
      trend(
        pts([
          [-13, 0],
          [-6, 1],
          [0, 2],
        ]),
        TODAY,
      ),
    ).toBeNull();
    expect(
      trend(
        pts([
          [-14, 0],
          [-7, 1],
          [0, 2],
        ]),
        TODAY,
      )?.slope,
    ).toBeCloseTo(1 / 7);
  });
  test('recent measurements weigh more', () => {
    // Mirror images: flat then rising, rising then flat. Equal weights would give both the same slope.
    const late = trend(
      pts([
        [-28, 0],
        [-21, 0],
        [-14, 0],
        [-7, 7],
        [0, 14],
      ]),
      TODAY,
    )!.slope;
    const early = trend(
      pts([
        [-28, 0],
        [-21, 7],
        [-14, 14],
        [-7, 14],
        [0, 14],
      ]),
      TODAY,
    )!.slope;
    expect(late).toBeGreaterThan(early + 0.05);
  });
  test('starts from the fitted line, not from a noisy last measurement', () => {
    const r = trend(
      pts([
        [-28, 0],
        [-21, 7],
        [-14, 14],
        [-7, 21],
        [0, 34],
      ]),
      TODAY,
    )!;
    expect(r.day).toBe(T);
    expect(r.value).toBeGreaterThan(28);
    expect(r.value).toBeLessThan(34);
  });
  test('the last 42 days when 3 or more fall inside', () => {
    // Old points far off the line would pull it; inside 42 days it climbs 1 a day.
    expect(
      trend(
        pts([
          [-200, 500],
          [-100, 900],
          [-40, 0],
          [-20, 20],
          [0, 40],
        ]),
        TODAY,
      )?.slope,
    ).toBeCloseTo(1);
  });
  test('else the last 5 measurements', () => {
    const list = pts([
      [-500, 999],
      [-100, 0],
      [-90, 10],
      [-80, 20],
      [-70, 30],
      [-10, 90],
    ]);
    expect(trend(list, TODAY)?.slope).toBeCloseTo(1);
  });
});

describe('forecast', () => {
  const run = (rate: number, more: Partial<Goal> = {}) =>
    forecast(
      g(more),
      pts([
        [-28, 50 - 28 * rate],
        [-14, 50 - 14 * rate],
        [0, 50],
      ]),
      TODAY,
    );
  test('reaches before the deadline', () => {
    expect(run(1)).toEqual({ day: T + 50, late: 0 });
  });
  test('after the deadline, in weeks', () => {
    expect(run(0.25)).toEqual({ day: T + 200, late: 15 });
  });
  test('flat or moving away: not reached', () => {
    expect(run(0)).toBe('never');
    expect(run(-1)).toBe('never');
  });
  test('beyond five years: not reached', () => {
    expect(run(0.02)).toBe('never');
  });
  test('lower is better', () => {
    expect(run(-1, { baseline: '100', target: '0' })).toEqual({ day: T + 50, late: 0 });
  });
  test('the fitted line already past the target: reached by the latest day', () => {
    expect(
      forecast(
        g(),
        pts([
          [-28, 40],
          [-14, 99],
          [0, 99],
        ]),
        TODAY,
      ),
    ).toEqual({ day: T, late: 0 });
  });
  test('too few points or already reached: none', () => {
    expect(forecast(g(), pts([[0, 50]]), TODAY)).toBeNull();
    expect(
      forecast(
        g(),
        pts([
          [-28, 60],
          [-14, 80],
          [0, 100],
        ]),
        TODAY,
      ),
    ).toBeNull();
  });
});

describe('actsPace', () => {
  test('the share done against the share of time', () => {
    expect(actsPace(g(), 4, 8, TODAY)).toEqual({ status: 'on', gap: 0, time: 0.5 });
    expect(actsPace(g(), 3, 8, TODAY)?.status).toBe('behind');
    expect(actsPace(g(), 5, 8, TODAY)?.status).toBe('ahead');
  });
  test('none with nothing counted, all done, or before the start', () => {
    expect(actsPace(g(), 0, 0, TODAY)).toBeNull();
    expect(actsPace(g(), 8, 8, TODAY)).toBeNull();
    expect(actsPace(g({ startDate: dayStr(T + 1) }), 0, 8, TODAY)).toBeNull();
  });
});

describe('goals in a plan', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 16, 12));
    setDb(emptyDb());
  });
  afterEach(() => vi.useRealTimers());
  const rel = (a: string, b: string, type: RelType) => expect(addRelation(a, b, type)).toBeNull();
  const add = (s: State, goal: Goal) => {
    db.states.push(s);
    db.goals.push(goal);
    rel(s.id, goal.id, 'measures');
  };

  test('a plain state: its measurements', () => {
    const s: State = {
      id: 's',
      title: 's',
      description: '',
      value: '40',
      date: TODAY,
      history: [{ date: TODAY, value: '40' }],
    };
    add(s, g());
    expect(paceSeries(s, g())).toEqual([{ day: T, date: TODAY, value: 40 }]);
    // A single measurement: a status, no forecast.
    expect(goalPace(db.goals[0], TODAY)).toMatchObject({ status: 'behind', forecast: null });
  });
  test('a state that adds up in total: its running total; per period: none', () => {
    const s: State = {
      id: 's',
      title: 's',
      description: '',
      history: [],
      value: '',
      cumulative: true,
      entries: [
        { id: 'a', date: dayStr(T - 1), amount: '20' },
        { id: 'b', date: dayStr(T - 1), amount: '5' },
        { id: 'c', date: TODAY, amount: '31' },
      ],
    };
    add(s, g({ period: 'total' }));
    expect(paceSeries(s, db.goals[0])?.map(p => p.value)).toEqual([25, 56]);
    expect(goalPace(db.goals[0], TODAY)).toMatchObject({ status: 'ahead' });
    db.goals[0].period = 'week';
    expect(paceSeries(s, db.goals[0])).toBeNull();
    expect(goalPace(db.goals[0], TODAY)).toBeNull();
  });
  test('no measuring state, routines kept, paused or achieved: none', () => {
    db.goals.push(g({ current: '10' }));
    expect(goalPace(db.goals[0], TODAY)).toBeNull();
    const s: State = {
      id: 's',
      title: 's',
      description: '',
      value: '10',
      date: TODAY,
      history: [{ date: TODAY, value: '10' }],
    };
    add(s, g({ id: 'h' }));
    expect(goalPace(db.goals[1], TODAY)).not.toBeNull();
    for (const more of [{ progress: 'routines' }, { status: 'paused' }, { status: 'achieved' }] as Partial<Goal>[]) {
      Object.assign(db.goals[1], more);
      expect(goalPace(db.goals[1], TODAY)).toBeNull();
      Object.assign(db.goals[1], { progress: undefined, status: 'active' });
    }
  });
  test('activities done: status by shares', () => {
    const goal = g({ progress: 'activities' });
    db.goals.push(goal);
    ['a', 'b', 'c', 'd'].forEach((id, i) => {
      db.activities.push({ id, title: id, status: i ? 'todo' : 'done' } as Activity);
      rel(id, 'g', 'contributes');
    });
    expect(goalPace(goal, TODAY)).toEqual({ kind: 'acts', status: 'behind', gap: -0.25, time: 0.5, done: 1, total: 4 });
  });
});
