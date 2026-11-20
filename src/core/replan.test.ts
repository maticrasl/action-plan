import { describe, expect, test } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type Relation } from './model';
import { applyMove, lateSteps, planMove } from './replan';

const TODAY = '2026-11-16';
const plan = (p: Partial<Db>): Db => ({ ...emptyDb(), ...p });
const act = (id: string, due?: string, more: Partial<Activity> = {}): Activity => ({
  id,
  title: id,
  status: 'todo',
  ...(due ? { dueDate: due } : {}),
  ...more,
});
const goal = (id: string, deadline: string, more: Partial<Goal> = {}): Goal => ({
  id,
  title: id,
  status: 'active',
  deadline,
  ...more,
});
const rel = (from: string, type: Relation['type'], to: string): Relation => ({ id: `${from}-${to}`, from, type, to });
const three = () => plan({ activities: [act('c', '2026-11-14'), act('a', '2026-11-10'), act('b', '2026-11-12')] });
const move = (data: Db, ids: string[], to: string, withLater = false) =>
  planMove(data, { ids, to, withLater, today: TODAY });

describe('lateSteps', () => {
  test('due yesterday is late, today is not; earliest first', () => {
    const p = plan({ activities: [act('y', '2026-11-15'), act('t', TODAY), act('old', '2026-11-01')] });
    expect(lateSteps(p, TODAY).map(a => a.id)).toEqual(['old', 'y']);
  });
  test('done, routines and steps without a due date are left out; lists are in', () => {
    const p = plan({
      activities: [
        act('done', '2026-11-01', { status: 'done' }),
        act('routine', '2026-11-01', { repeat: { every: 1, unit: 'day' } }),
        act('nodate'),
        act('list', '2026-11-02', { list: [{ id: 'i', text: 'x' }] }),
        act('doing', '2026-11-03', { status: 'doing' }),
      ],
    });
    expect(lateSteps(p, TODAY).map(a => a.id)).toEqual(['list', 'doing']);
  });
});

describe('planMove', () => {
  test('10, 12, 14 Nov moved to 17 Nov land on 17, 19, 21', () => {
    const m = move(three(), ['a', 'b', 'c'], '2026-11-17')!;
    expect(m.days).toBe(7);
    expect(m.moves).toEqual([
      { id: 'a', due: '2026-11-17' },
      { id: 'b', due: '2026-11-19' },
      { id: 'c', due: '2026-11-21' },
    ]);
    expect(m.later).toEqual([]);
  });
  test('unticking the earliest makes the next one the anchor', () => {
    const m = move(three(), ['b', 'c'], '2026-11-17')!;
    expect(m.days).toBe(5);
    expect(m.moves.map(x => x.due)).toEqual(['2026-11-17', '2026-11-19']);
  });
  test('to = today puts the earliest on today', () => {
    expect(move(three(), ['a'], TODAY)!.moves).toEqual([{ id: 'a', due: TODAY }]);
  });
  test('to before today is refused; so is nothing chosen', () => {
    expect(move(three(), ['a'], '2026-11-15')).toBeNull();
    expect(move(three(), [], '2026-11-17')).toBeNull();
    expect(move(three(), ['nope'], '2026-11-17')).toBeNull();
  });
  test('days are at least 1, also when the chosen step is not late', () => {
    const p = plan({ activities: [act('f', '2026-11-20')] });
    expect(move(p, ['f'], '2026-11-18')!.days).toBe(1);
    expect(move(p, ['f'], '2026-11-20')!.moves).toEqual([{ id: 'f', due: '2026-11-21' }]);
  });
  test('To do moves its start too; In progress keeps its start', () => {
    const p = plan({
      activities: [
        act('todo', '2026-11-10', { startDate: '2026-11-05' }),
        act('doing', '2026-11-12', { startDate: '2026-11-01', status: 'doing' }),
      ],
    });
    expect(move(p, ['todo', 'doing'], '2026-11-17')!.moves).toEqual([
      { id: 'todo', start: '2026-11-12', due: '2026-11-17' },
      { id: 'doing', due: '2026-11-19' },
    ]);
  });
  test('a parent and its late sub-activity each move once', () => {
    const p = plan({
      activities: [act('parent', '2026-11-12'), act('child', '2026-11-10')],
      relations: [rel('child', 'subactivity', 'parent')],
    });
    const m = move(p, ['parent', 'child', 'child'], '2026-11-17', true)!;
    expect(m.moves.map(x => x.id)).toEqual(['child', 'parent']);
    expect(m.later).toEqual([]);
  });
  test('routines and done steps never move, also when asked', () => {
    const p = plan({
      activities: [
        act('a', '2026-11-10'),
        act('r', '2026-11-08', { repeat: { every: 1, unit: 'day' } }),
        act('d', '2026-11-09', { status: 'done' }),
      ],
    });
    expect(move(p, ['a', 'r', 'd'], '2026-11-17')!.moves.map(x => x.id)).toEqual(['a']);
  });
});

describe('withLater', () => {
  const p = () =>
    plan({
      activities: [
        act('late', '2026-11-10'),
        act('soon', '2026-11-20', { startDate: '2026-11-18' }),
        act('same', '2026-11-10'),
        act('before', '2026-11-09', { status: 'doing' }),
        act('done', '2026-11-25', { status: 'done' }),
        act('routine', '2026-11-30', { repeat: { every: 1, unit: 'week' } }),
        act('nodate'),
      ],
    });
  test('moves the not-done steps due on or after the anchor, by the same days', () => {
    const m = move(p(), ['late'], '2026-11-17', true)!;
    expect(m.later).toEqual([{ id: 'soon', start: '2026-11-25', due: '2026-11-27' }]);
  });
  test('an unticked late step stays where it is', () => {
    const m = move(p(), ['late'], '2026-11-17', true)!;
    expect(m.later.map(x => x.id)).not.toContain('same');
    expect(m.moves.map(x => x.id)).toEqual(['late']);
  });
  test('off: nothing later moves', () => {
    expect(move(p(), ['late'], '2026-11-17')!.later).toEqual([]);
  });
});

describe('goal deadlines', () => {
  const p = () =>
    plan({
      goals: [
        goal('g1', '2026-11-18'),
        goal('g2', '2026-11-30'),
        goal('won', '2026-11-11', { status: 'achieved' }),
        goal('g3', '2026-11-12'),
      ],
      activities: [act('a', '2026-11-10'), act('b', '2026-11-12'), act('soon', '2026-11-20')],
      relations: [
        rel('a', 'contributes', 'g1'),
        rel('a', 'contributes', 'g2'),
        rel('a', 'contributes', 'won'),
        rel('b', 'contributes', 'g1'),
        rel('soon', 'contributes', 'g3'),
      ],
    });
  test('a step contributing to two goals is tested against both; achieved goals are left out', () => {
    const m = move(p(), ['a', 'b'], '2026-11-17')!;
    // a lands on 17 (before g1's 18), b on 19 (after): only g1, through b. g2 (30) holds both.
    expect(m.goals).toEqual([{ id: 'g1', was: '2026-11-18', deadline: '2026-11-25', by: ['b'] }]);
  });
  test('later steps count too', () => {
    const m = move(p(), ['a'], '2026-11-25', true)!;
    expect(m.goals.map(g => [g.id, g.by])).toEqual([
      ['g1', ['a']],
      ['g3', ['soon']],
    ]);
  });
});

describe('applyMove', () => {
  test('changes exactly what planMove listed', () => {
    const data = plan({
      goals: [goal('g', '2026-11-18'), goal('h', '2026-12-31')],
      activities: [
        act('a', '2026-11-10', { startDate: '2026-11-01', autoStarted: '2026-11-01' }),
        act('b', '2026-11-12'),
        act('x', '2026-11-11'),
        act('soon', '2026-11-20'),
      ],
      relations: [rel('b', 'contributes', 'g')],
    });
    const before = JSON.parse(JSON.stringify(data)) as Db;
    const m = move(data, ['a', 'b'], '2026-11-17', true)!;
    expect(data).toEqual(before); // planMove changes nothing
    applyMove(data, m, false);
    expect(data.activities.map(a => [a.id, a.startDate, a.dueDate, a.autoStarted])).toEqual([
      ['a', '2026-11-08', '2026-11-17', '2026-11-01'],
      ['b', undefined, '2026-11-19', undefined],
      ['x', undefined, '2026-11-11', undefined],
      ['soon', undefined, '2026-11-27', undefined],
    ]);
    expect(data.goals.map(g => g.deadline)).toEqual(['2026-11-18', '2026-12-31']);
    applyMove(data, { ...m, moves: [], later: [] }, true);
    expect(data.goals.map(g => g.deadline)).toEqual(['2026-11-25', '2026-12-31']);
  });
});
