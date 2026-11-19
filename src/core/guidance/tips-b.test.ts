import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type Relation, type State, type Vision } from '../model';
import { setDb } from '../state';
import { TIPS_B } from './tips-b';
import type { TipHit, TipInput } from './tip-facts';

const TODAY = '2026-11-19'; // a Thursday
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
});
afterEach(() => vi.useRealTimers());

const plan = (p: Partial<Db>): Db => ({ ...emptyDb(), ...p });
const goal = (id: string, more: Partial<Goal> = {}): Goal => ({ id, title: id, status: 'active', ...more });
const metric = (id: string, more: Partial<Goal> = {}) =>
  goal(id, { metric: 'x', baseline: '0', target: '100', current: '40', ...more });
const act = (id: string, more: Partial<Activity> = {}): Activity => ({ id, title: id, status: 'todo', ...more });
const routine = (id: string) => act(id, { repeat: { every: 1, unit: 'day' }, startDate: '2026-11-01' });
const rel = (from: string, type: Relation['type'], to: string): Relation => ({ id: `${from}-${to}`, from, type, to });
const state = (id: string, date: string): State => ({
  id,
  title: id,
  description: '',
  value: '5',
  date,
  history: [{ date, value: '5' }],
});

function hits(id: string, db: Db, more: Partial<TipInput> = {}): TipHit[] {
  setDb(db);
  return TIPS_B.find(t => t.id === id)!.hits({ db, visions: [], today: TODAY, ...more });
}
const ids = (id: string, db: Db, more: Partial<TipInput> = {}) => hits(id, db, more).map(h => h.id ?? '·');

describe('no-steps', () => {
  test('a goal older than 2 days without steps: yes; 2 days old: no', () => {
    expect(ids('no-steps', plan({ goals: [goal('g', { createdAt: '2026-11-16' })] }))).toEqual(['g']);
    expect(ids('no-steps', plan({ goals: [goal('g', { createdAt: '2026-11-17' })] }))).toEqual([]);
  });
  test('a step, or a sub-goal with steps: no', () => {
    const old = { createdAt: '2026-11-01' };
    expect(ids('no-steps', plan({ goals: [goal('g', old)], activities: [act('a')], relations: [rel('a', 'contributes', 'g')] }))).toEqual([]);
    const sub = plan({
      goals: [goal('g', old), goal('s', old)],
      activities: [act('a')],
      relations: [rel('s', 'subgoal', 'g'), rel('a', 'contributes', 's')],
    });
    expect(ids('no-steps', sub)).toEqual([]);
  });
});

describe('steps-ran-out', () => {
  const p = (statuses: Activity['status'][], more: Partial<Db> = {}, g: Partial<Goal> = {}) =>
    plan({
      goals: [metric('g', g)],
      activities: [...statuses.map((s, i) => act(`a${i}`, { status: s })), ...(more.activities || [])],
      relations: [...statuses.map((_, i) => rel(`a${i}`, 'contributes', 'g')), ...(more.relations || [])],
    });
  test('every step done, goal under 100 %: yes; one left: no', () => {
    expect(ids('steps-ran-out', p(['done', 'done']))).toEqual(['g']);
    expect(ids('steps-ran-out', p(['done', 'todo']))).toEqual([]);
  });
  test('a routine works for it, or it is reached: no', () => {
    expect(ids('steps-ran-out', p(['done'], { activities: [routine('r')], relations: [rel('r', 'contributes', 'g')] }))).toEqual([]);
    expect(ids('steps-ran-out', p(['done'], {}, { current: '100' }))).toEqual([]);
  });
});

describe('no-dates', () => {
  const p = (n: number, status: Activity['status'] = 'todo') =>
    plan({ activities: Array.from({ length: n }, (_, i) => act(`a${i}`, { status })) });
  test('3 To do without a date: yes; 2: no; In progress ones do not count', () => {
    expect(hits('no-dates', p(3))[0].vars).toEqual({ n: 3 });
    expect(hits('no-dates', p(2))).toHaveLength(0);
    expect(hits('no-dates', p(3, 'doing'))).toHaveLength(0);
  });
});

describe('only-result and no-measure', () => {
  test('a measured goal older than 7 days without a routine: yes; 7 days: no', () => {
    expect(ids('only-result', plan({ goals: [metric('g', { createdAt: '2026-11-11' })] }))).toEqual(['g']);
    expect(ids('only-result', plan({ goals: [metric('g', { createdAt: '2026-11-12' })] }))).toEqual([]);
  });
  test('with a routine, or progress from activities: no', () => {
    const old = { createdAt: '2026-11-01' };
    expect(ids('only-result', plan({ goals: [metric('g', old)], activities: [routine('r')], relations: [rel('r', 'contributes', 'g')] }))).toEqual([]);
    expect(ids('only-result', plan({ goals: [goal('g', { ...old, progress: 'activities' })] }))).toEqual([]);
  });
  test('no-measure: no state describes it: yes; one does: no', () => {
    const old = { createdAt: '2026-11-11' };
    expect(ids('no-measure', plan({ goals: [metric('g', old)] }))).toEqual(['g']);
    expect(ids('no-measure', plan({ goals: [metric('g', old)], states: [state('s', TODAY)], relations: [rel('s', 'measures', 'g')] }))).toEqual([]);
    expect(ids('no-measure', plan({ goals: [metric('g', { createdAt: '2026-11-12' })] }))).toEqual([]);
  });
});

describe('stale-state', () => {
  const p = (date: string) => plan({ goals: [metric('g')], states: [state('s', date)], relations: [rel('s', 'measures', 'g')] });
  test('last measured 14 days ago: yes, with the days; 13: no', () => {
    expect(hits('stale-state', p('2026-11-05'))).toEqual([{ id: 's', vars: { name: 's', days: 14 } }]);
    expect(hits('stale-state', p('2026-11-06'))).toHaveLength(0);
  });
  test('a state of a paused goal: no', () => {
    const q = p('2026-10-01');
    q.goals[0].status = 'paused';
    expect(hits('stale-state', q)).toHaveLength(0);
  });
});

describe('far-goal', () => {
  test('more than 6 months away without sub-goals: yes, in months; exactly 6: no', () => {
    expect(hits('far-goal', plan({ goals: [goal('g', { deadline: '2027-05-20' })] }))[0].vars).toEqual({ name: 'g', n: 6 });
    expect(hits('far-goal', plan({ goals: [goal('g', { deadline: '2027-05-19' })] }))).toHaveLength(0);
  });
  test('with a sub-goal: no', () => {
    const p = plan({ goals: [goal('g', { deadline: '2028-01-01' }), goal('s')], relations: [rel('s', 'subgoal', 'g')] });
    expect(ids('far-goal', p)).toEqual([]);
  });
});

describe('waiting', () => {
  const p = (since: string, status: Activity['status'] = 'todo') =>
    plan({
      activities: [act('a', { createdAt: '2026-11-01' }), act('b', { status, statusSince: since })],
      relations: [rel('a', 'depends', 'b')],
    });
  test('waited 14 days for a step still To do: yes, and the button opens that step; 13: no', () => {
    expect(hits('waiting', p('2026-11-05'))).toEqual([{ id: 'a', vars: { name: 'a', other: 'b' }, target: 'b' }]);
    expect(hits('waiting', p('2026-11-06'))).toHaveLength(0);
  });
  test('the other step has started: no', () => {
    expect(hits('waiting', p('2026-10-01', 'doing'))).toHaveLength(0);
  });
});

describe('many-doing', () => {
  const p = (n: number) => plan({ activities: Array.from({ length: n }, (_, i) => act(`a${i}`, { status: 'doing' })) });
  test('6 In progress: yes; 5: no', () => {
    expect(hits('many-doing', p(6))[0].vars).toEqual({ n: 6 });
    expect(hits('many-doing', p(5))).toHaveLength(0);
  });
});

describe('no-vision', () => {
  const p = (createdAt: string) => plan({ goals: [goal('a', { createdAt }), goal('b', { createdAt })] });
  const vision: Vision = { id: 'v', title: 'V' } as Vision;
  test('2 goals, no vision, first item 14 days ago: yes; 13: no; a vision: no', () => {
    expect(hits('no-vision', p('2026-11-05'))).toHaveLength(1);
    expect(hits('no-vision', p('2026-11-06'))).toHaveLength(0);
    expect(hits('no-vision', p('2026-11-05'), { visions: [vision] })).toHaveLength(0);
  });
});

describe('goal-unfinished', () => {
  test('older than 7 days and not SMART: yes, with the letters lit and the first open one', () => {
    const [h] = hits('goal-unfinished', plan({ goals: [goal('Run more', { createdAt: '2026-11-11', deadline: '2027-01-01' })] }));
    expect(h.vars).toEqual({ name: 'Run more', n: 1, part: 'S' });
  });
  test('7 days old: no', () => {
    expect(hits('goal-unfinished', plan({ goals: [goal('g', { createdAt: '2026-11-12' })] }))).toHaveLength(0);
  });
});

describe('week', () => {
  const p = plan({ goals: [goal('g')] });
  test('first opening of the week, no review for 6 days: keyed to the week', () => {
    expect(ids('week', p, { prevDay: '2026-11-15' })).toEqual(['2026-11-16']);
    expect(ids('week', p)).toEqual(['2026-11-16']); // never opened before
    expect(ids('week', p, { prevDay: '2026-11-15', lastReview: '2026-11-13' })).toEqual(['2026-11-16']);
  });
  test('not the first opening, or a review within 6 days: no', () => {
    expect(ids('week', p, { prevDay: '2026-11-16' })).toEqual([]);
    expect(ids('week', p, { prevDay: '2026-11-15', lastReview: '2026-11-14' })).toEqual([]);
  });
  test('a week that starts in one year and ends in the next', () => {
    expect(ids('week', p, { today: '2027-01-01', prevDay: '2026-12-27' })).toEqual(['2026-12-28']);
  });
});

describe('month', () => {
  const p = (measured: string) => plan({ goals: [metric('g')], states: [state('s', measured)], relations: [rel('s', 'measures', 'g')] });
  test('first opening of the month, a state not measured this month: yes', () => {
    expect(ids('month', p('2026-10-20'), { prevDay: '2026-10-31' })).toEqual(['2026-11']);
  });
  test('measured this month, or not the first opening: no', () => {
    expect(ids('month', p('2026-11-02'), { prevDay: '2026-10-31' })).toEqual([]);
    expect(ids('month', p('2026-10-20'), { prevDay: '2026-11-01' })).toEqual([]);
  });
});

describe('new-year', () => {
  const p = plan({ goals: [goal('g')] });
  test('1 to 14 January, keyed to the year', () => {
    expect(ids('new-year', p, { today: '2027-01-01' })).toEqual(['2027']);
    expect(ids('new-year', p, { today: '2027-01-14' })).toEqual(['2027']);
    expect(ids('new-year', p, { today: '2027-01-15' })).toEqual([]);
    expect(ids('new-year', p, { today: '2026-12-31' })).toEqual([]);
  });
});
