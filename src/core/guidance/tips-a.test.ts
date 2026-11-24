import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type Relation, type State } from '../model';
import { setDb } from '../state';
import { addDays, daysBetween } from '../routines/schedule';
import { TIPS_A } from './tips-a';
import type { TipHit } from './tip-facts';

const TODAY = '2026-11-19';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
});
afterEach(() => vi.useRealTimers());

const plan = (p: Partial<Db>): Db => ({ ...emptyDb(), ...p });
const goal = (id: string, more: Partial<Goal> = {}): Goal => ({ id, title: id, status: 'active', ...more });
const act = (id: string, more: Partial<Activity> = {}): Activity => ({ id, title: id, status: 'todo', ...more });
const daily = (id: string, start: string, ticked: string[] = [], more: Partial<Activity> = {}) =>
  act(id, {
    repeat: { every: 1, unit: 'day' },
    startDate: start,
    checkins: Object.fromEntries(ticked.map(d => [d, 1 as const])),
    ...more,
  });
const state = (id: string, values: number[]): State => ({
  id,
  title: id,
  description: '',
  value: String(values.at(-1)),
  history: values.map((v, i) => ({ date: addDays('2026-11-01', i), value: String(v) })),
});
const rel = (from: string, type: Relation['type'], to: string): Relation => ({ id: `${from}-${to}`, from, type, to });
const metric = (id: string, current: number, more: Partial<Goal> = {}) =>
  goal(id, { metric: 'x', baseline: '0', target: '100', current: String(current), ...more });

// The hits of one tip on a plan.
function hits(id: string, db: Db): TipHit[] {
  setDb(db);
  return TIPS_A.find(t => t.id === id)!.hits({ db, visions: [], today: TODAY });
}
const ids = (id: string, db: Db) => hits(id, db).map(h => h.id ?? '·');

describe('back', () => {
  const at = (day: string) => plan({ goals: [goal('g', { updatedAt: `${day}T08:00:00.000Z` })] });
  test('10 days since the last activity: yes; 9: no', () => {
    expect(hits('back', at('2026-11-09'))).toHaveLength(1);
    expect(hits('back', at('2026-11-10'))).toHaveLength(0);
  });
  test('a tick counts as activity; without an active goal, no', () => {
    const p = at('2026-11-01');
    p.activities.push(daily('r', '2026-10-01', ['2026-11-15']));
    expect(hits('back', p)).toHaveLength(0);
    expect(
      hits('back', plan({ goals: [goal('g', { status: 'paused', updatedAt: '2026-10-01T00:00:00Z' })] })),
    ).toHaveLength(0);
  });
});

describe('overdue-pile', () => {
  const due = (n: number, date = '2026-11-18') =>
    plan({ activities: Array.from({ length: n }, (_, i) => act(`a${i}`, { dueDate: date })) });
  test('3 overdue: yes, with the count; 2: no; due today is not overdue; done ones do not count', () => {
    expect(hits('overdue-pile', due(3))[0].vars).toEqual({ n: 3 });
    expect(hits('overdue-pile', due(2))).toHaveLength(0);
    expect(hits('overdue-pile', due(3, TODAY))).toHaveLength(0);
    const p = due(3);
    p.activities[0].status = 'done';
    expect(hits('overdue-pile', p)).toHaveLength(0);
  });
});

describe('routine-missed', () => {
  test('the last 2 due days missed: yes; 1: no; ticked today: no', () => {
    expect(ids('routine-missed', plan({ activities: [daily('r', '2026-11-01', ['2026-11-16'])] }))).toEqual(['r']);
    expect(ids('routine-missed', plan({ activities: [daily('r', '2026-11-01', ['2026-11-17'])] }))).toEqual([]);
    expect(ids('routine-missed', plan({ activities: [daily('r', '2026-11-01', ['2026-11-16', TODAY])] }))).toEqual([]);
  });
  test('the most missed first; ended routines left out', () => {
    const p = plan({
      activities: [
        daily('two', '2026-11-01', ['2026-11-16']),
        daily('three', '2026-11-01', ['2026-11-15']),
        daily('ended', '2026-11-01', [], { dueDate: '2026-11-18' }),
      ],
    });
    expect(ids('routine-missed', p)).toEqual(['three', 'two']);
  });
  test('a flexible routine: two weeks in a row not met', () => {
    const r = act('f', { repeat: { every: 1, unit: 'week', times: 3 }, startDate: '2026-10-01' });
    expect(ids('routine-missed', plan({ activities: [r] }))).toEqual(['f']);
    const ok = { ...r, checkins: { '2026-11-03': 1, '2026-11-04': 1, '2026-11-05': 1 } as Activity['checkins'] };
    expect(ids('routine-missed', plan({ activities: [ok] }))).toEqual([]);
  });
});

describe('routine-low', () => {
  const from = '2026-10-29'; // 21 days before today
  const kept = (n: number, start = from) => daily('r', start, daysBetween(start, '2026-11-18').slice(0, n));
  test('running 21 days, kept under half: yes, with the share', () => {
    expect(hits('routine-low', plan({ activities: [kept(10)] }))).toEqual([{ id: 'r', vars: { name: 'r', pct: 48 } }]);
    expect(hits('routine-low', plan({ activities: [kept(11)] }))).toHaveLength(0);
  });
  test('running 20 days: not yet', () => {
    expect(hits('routine-low', plan({ activities: [kept(0, '2026-10-30')] }))).toHaveLength(0);
  });
});

describe('goal-behind and goal-past', () => {
  // Measured by a state, as the goal card's pace tag needs.
  const g = (current: number, deadline: string, more: Partial<Goal> = {}) =>
    plan({
      goals: [metric('g', current, { startDate: '2026-10-20', deadline, ...more })],
      states: [state('s', [current])],
      relations: [rel('s', 'measures', 'g')],
    });
  test('10 days left, 75 % of the time gone: under 45 % is behind', () => {
    expect(hits('goal-behind', g(40, '2026-11-29'))).toEqual([{ id: 'g', vars: { name: 'g', pct: 40, days: 10 } }]);
    expect(hits('goal-behind', g(46, '2026-11-29'))).toHaveLength(0);
  });
  test('it follows the pace tag: a gap of exactly 30 points is not over it', () => {
    expect(hits('goal-behind', g(45, '2026-11-29'))).toHaveLength(0);
    expect(hits('goal-behind', g(44.9, '2026-11-29'))).toHaveLength(1);
  });
  test('no measuring state, or routines kept: no pace, no tip', () => {
    expect(
      hits('goal-behind', plan({ goals: [metric('g', 0, { startDate: '2026-10-20', deadline: '2026-11-29' })] })),
    ).toHaveLength(0);
    expect(hits('goal-behind', g(0, '2026-11-29', { progress: 'routines' }))).toHaveLength(0);
  });
  test('activities done: by the share done', () => {
    const p = plan({
      goals: [goal('g', { progress: 'activities', startDate: '2026-10-20', deadline: '2026-11-29' })],
      activities: [act('a', { status: 'done' }), act('b'), act('c'), act('d'), act('e')],
      relations: ['a', 'b', 'c', 'd', 'e'].map(id => rel(id, 'contributes', 'g')),
    });
    expect(hits('goal-behind', p)).toEqual([{ id: 'g', vars: { name: 'g', pct: 20, days: 10 } }]);
  });
  test('15 days left: not yet', () => {
    expect(hits('goal-behind', g(0, '2026-12-04'))).toHaveLength(0);
  });
  test('the deadline is today: behind, not past', () => {
    expect(hits('goal-behind', g(40, TODAY))[0].vars).toMatchObject({ days: 0 });
    expect(hits('goal-past', g(40, TODAY))).toHaveLength(0);
  });
  test('past its date: yes, with its progress; the most overdue first', () => {
    const p = plan({
      goals: [metric('a', 40, { deadline: '2026-11-18' }), metric('b', 10, { deadline: '2026-11-01' })],
    });
    expect(hits('goal-past', p).map(h => h.vars)).toEqual([
      { name: 'b', pct: 10 },
      { name: 'a', pct: 40 },
    ]);
  });
  test('a goal with no percent is left out', () => {
    expect(hits('goal-past', plan({ goals: [goal('g', { deadline: '2026-11-01' })] }))).toHaveLength(0);
  });
});

describe('stuck-step', () => {
  test('In progress 21 days: yes, in weeks; 20: no', () => {
    expect(
      hits('stuck-step', plan({ activities: [act('a', { status: 'doing', statusSince: '2026-10-29' })] }))[0].vars,
    ).toEqual({ name: 'a', n: 3 });
    expect(
      hits('stuck-step', plan({ activities: [act('a', { status: 'doing', statusSince: '2026-10-30' })] })),
    ).toHaveLength(0);
  });
  test('without statusSince: the last change counts', () => {
    expect(
      hits('stuck-step', plan({ activities: [act('a', { status: 'doing', updatedAt: '2026-10-01T00:00:00Z' })] })),
    ).toHaveLength(1);
  });
  test('a list, or a step with sub-activities: no', () => {
    const old = { status: 'doing' as const, statusSince: '2026-01-01' };
    expect(hits('stuck-step', plan({ activities: [act('a', { ...old, list: [] })] }))).toHaveLength(0);
    expect(
      hits('stuck-step', plan({ activities: [act('a', old), act('c')], relations: [rel('c', 'subactivity', 'a')] })),
    ).toHaveLength(0);
  });
});

describe('wrong-way', () => {
  const p = (values: number[]) =>
    plan({
      goals: [goal('g', { metric: 'kg', baseline: '90', target: '70' })],
      states: [state('s', values)],
      relations: [rel('s', 'measures', 'g')],
    });
  test('three moves away from the target in a row: yes; two: no', () => {
    expect(ids('wrong-way', p([75, 77, 79, 81]))).toEqual(['s']);
    expect(ids('wrong-way', p([75, 77, 76, 81]))).toEqual([]);
    expect(ids('wrong-way', p([77, 79, 81]))).toEqual([]);
  });
});

describe('too-many-goals', () => {
  const goals = (n: number, current: number, more: Partial<Goal> = {}) =>
    plan({ goals: Array.from({ length: n }, (_, i) => metric(`g${i}`, current, more)) });
  test('5 active goals, average under 25 %: yes; 4: no; at 50 %: no; one late: yes', () => {
    expect(hits('too-many-goals', goals(5, 10))[0].vars).toEqual({ n: 5 });
    expect(hits('too-many-goals', goals(4, 10))).toHaveLength(0);
    expect(hits('too-many-goals', goals(5, 50))).toHaveLength(0);
    const late = goals(5, 50);
    late.goals[0].deadline = '2026-11-01';
    expect(hits('too-many-goals', late)).toHaveLength(1);
  });
});

describe('too-many-routines', () => {
  const all = daysBetween('2026-11-01', TODAY);
  const routines = (n: number, ticked: string[]) =>
    plan({ activities: Array.from({ length: n }, (_, i) => daily(`r${i}`, '2026-11-01', ticked)) });
  test('6 routines, kept under 60 %: yes; 5: no; all kept: no', () => {
    expect(hits('too-many-routines', routines(6, []))[0].vars).toEqual({ n: 6 });
    expect(hits('too-many-routines', routines(5, []))).toHaveLength(0);
    expect(hits('too-many-routines', routines(6, all))).toHaveLength(0);
  });
});

describe('keep-out (feature 07)', () => {
  // Weeks end on Sundays; today is Thursday 2026-11-19, so the last complete week ended 11-15.
  const keep = (values: [string, number][]) =>
    plan({
      goals: [goal('g', { metric: 'kg', keep: { max: 75 }, startDate: '2026-10-19', deadline: '2026-11-01' })],
      states: [
        {
          id: 's',
          title: 's',
          description: '',
          value: String(values.at(-1)![1]),
          history: values.map(([date, v]) => ({ date, value: String(v) })),
        },
      ],
      relations: [rel('s', 'measures', 'g')],
    });
  test('two complete weeks out of range in a row: yes, with the count; one: no', () => {
    expect(
      hits(
        'keep-out',
        keep([
          ['2026-10-20', 74],
          ['2026-11-03', 76],
        ]),
      ),
    ).toEqual([{ id: 'g', vars: { name: 'g', n: 2, unit: 'weeks' } }]);
    expect(
      hits(
        'keep-out',
        keep([
          ['2026-10-20', 74],
          ['2026-11-10', 76],
        ]),
      ),
    ).toHaveLength(0);
  });
  test('a keep goal past its Until is not a past goal', () => {
    expect(hits('goal-past', keep([['2026-10-20', 74]]))).toHaveLength(0);
  });
});
