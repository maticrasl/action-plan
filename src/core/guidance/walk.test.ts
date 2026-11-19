import { describe, expect, test } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type Relation, type State, type Vision } from '../model';
import {
  TASKS,
  checkTask,
  latch,
  mergeWalk,
  notNeeded,
  offerWalk,
  readWalk,
  walkOff,
  walkView,
  type TaskId,
  type Walk,
  type WalkInput,
} from './walk';

const env = { syncOn: true, synced: false, installed: false, canInstall: true };
const inp = (db: Db = emptyDb(), more: Partial<WalkInput> = {}): WalkInput => ({
  db,
  visions: [],
  seen: {},
  env,
  ...more,
});
const goal = (id = 'g1', more: Partial<Goal> = {}): Goal => ({ id, title: 'Run 5 km', status: 'active', ...more });
const act = (id: string, more: Partial<Activity> = {}): Activity => ({ id, title: id, status: 'todo', ...more });
const state = (id: string, more: Partial<State> = {}): State => ({
  id,
  title: 'Weight',
  description: '',
  value: '',
  history: [],
  ...more,
});
const rel = (from: string, to: string, type: Relation['type']): Relation => ({ id: `${from}-${to}`, from, to, type });
const plan = (p: Partial<Db>): Db => ({ ...emptyDb(), ...p });
const routine = (id: string, more: Partial<Activity> = {}) => act(id, { repeat: { every: 1, unit: 'day' }, ...more });
const on = (more: Partial<Walk> = {}): Walk => ({ state: 'on', started: '2026-11-10', done: {}, skipped: [], ...more });

// The smallest input that makes each task true.
const SMALLEST: Record<TaskId, WalkInput> = {
  goal: inp(plan({ goals: [goal()] })),
  state: inp(
    plan({ goals: [goal()], states: [state('s1', { value: '80', date: '2026-11-10' })], relations: [rel('s1', 'g1', 'measures')] }),
  ),
  steps: inp(
    plan({
      goals: [goal()],
      activities: [act('a1'), act('a2')],
      relations: [rel('a1', 'g1', 'contributes'), rel('a2', 'g1', 'contributes')],
    }),
  ),
  firstDone: inp(plan({ activities: [act('a1', { status: 'done' })] })),
  routine: inp(plan({ activities: [routine('r1')] })),
  tick: inp(plan({ activities: [routine('r1', { checkins: { '2026-11-11': 1 } })] })),
  measure: inp(
    plan({
      states: [
        state('s1', {
          value: '79',
          date: '2026-11-12',
          history: [
            { date: '2026-11-10', value: '80' },
            { date: '2026-11-12', value: '79' },
          ],
        }),
      ],
    }),
  ),
  days: inp(emptyDb(), { seen: { days: ['2026-11-10', '2026-11-11', '2026-11-12'] } }),
  backup: inp(emptyDb(), { seen: { exported: true } }),
  install: inp(emptyDb(), { env: { ...env, installed: true } }),
  views: inp(emptyDb(), { seen: { views: { map: true, timeline: true, graphs: true } } }),
  vision: inp(plan({ goals: [goal('g1', { visions: ['v1'] })] }), {
    visions: [{ id: 'v1', title: 'Fit', parents: [] } as Vision],
  }),
  review: inp(emptyDb(), { seen: { lastReview: '2026-11-12' }, started: '2026-11-10' }),
};

describe('task checks', () => {
  test.each(TASKS)('%s: false on an empty plan, true on the smallest plan that meets it', id => {
    expect(checkTask(id, inp())).toBe(false);
    expect(checkTask(id, SMALLEST[id])).toBe(true);
  });

  test('steps needs two activities that contribute to a goal, not two unlinked ones', () => {
    const unlinked = plan({ goals: [goal()], activities: [act('a1'), act('a2')] });
    expect(checkTask('steps', inp(unlinked))).toBe(false);
    const one = plan({ ...unlinked, relations: [rel('a1', 'g1', 'contributes')] });
    expect(checkTask('steps', inp(one))).toBe(false);
    // A link to a goal that is gone does not count.
    const gone = plan({ activities: unlinked.activities, relations: SMALLEST.steps.db.relations });
    expect(checkTask('steps', inp(gone))).toBe(false);
  });

  test('state needs a value on the state that describes the goal', () => {
    const empty = plan({ goals: [goal()], states: [state('s1')], relations: [rel('s1', 'g1', 'measures')] });
    expect(checkTask('state', inp(empty))).toBe(false);
    const adding = plan({
      ...empty,
      states: [state('s1', { cumulative: true, entries: [{ id: 'e', date: '2026-11-10', amount: '2' }] })],
    });
    expect(checkTask('state', inp(adding))).toBe(true);
  });

  test('firstDone also ticks on a ticked list item or a ticked routine day', () => {
    const list = plan({ activities: [act('a1', { list: [{ id: 'i', text: 'x', done: true }] })] });
    expect(checkTask('firstDone', inp(list))).toBe(true);
    expect(checkTask('firstDone', SMALLEST.tick)).toBe(true);
    const unticked = plan({ activities: [routine('r1', { checkins: { '2026-11-11': 0 } })] });
    expect(checkTask('firstDone', inp(unticked))).toBe(false);
  });

  test('tick counts a routine list day, not a one-time list', () => {
    const listDay = plan({ activities: [routine('r1', { listDays: { '2026-11-11': { i: 1 } } })] });
    expect(checkTask('tick', inp(listDay))).toBe(true);
    const oneTime = plan({ activities: [act('a1', { listDays: { '2026-11-11': { i: 1 } } })] });
    expect(checkTask('tick', inp(oneTime))).toBe(false);
  });

  test('measure needs two different days; a state that adds up needs two entries', () => {
    const sameDay = plan({
      states: [state('s1', { value: '79', date: '2026-11-10', history: [{ date: '2026-11-10', value: '80' }] })],
    });
    expect(checkTask('measure', inp(sameDay))).toBe(false);
    const entries = (n: number) =>
      plan({
        states: [
          state('s1', {
            cumulative: true,
            entries: Array.from({ length: n }, (_, i) => ({ id: `e${i}`, date: '2026-11-10', amount: '1' })),
          }),
        ],
      });
    expect(checkTask('measure', inp(entries(1)))).toBe(false);
    expect(checkTask('measure', inp(entries(2)))).toBe(true);
  });

  test('backup ticks on a first sync too', () => {
    expect(checkTask('backup', inp(emptyDb(), { env: { ...env, synced: true } }))).toBe(true);
  });

  test('views needs all three', () => {
    expect(checkTask('views', inp(emptyDb(), { seen: { views: { map: true, timeline: true } } }))).toBe(false);
  });

  test('a review before the walkthrough started does not count', () => {
    expect(checkTask('review', inp(emptyDb(), { seen: { lastReview: '2026-11-09' }, started: '2026-11-10' }))).toBe(false);
  });
});

describe('days', () => {
  test('two opens on one day count once; days before the start do not count', () => {
    const seen = (days: string[]) => inp(emptyDb(), { seen: { days }, started: '2026-11-10' });
    expect(checkTask('days', seen(['2026-11-10', '2026-11-10', '2026-11-11']))).toBe(false);
    expect(checkTask('days', seen(['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11']))).toBe(false);
    expect(checkTask('days', seen(['2026-11-10', '2026-11-11', '2026-11-13']))).toBe(true);
    expect(walkView(on(), seen(['2026-11-10', '2026-11-11'])).days).toBe(2);
  });
});

describe('not needed', () => {
  test('state is not needed without a measured goal, and reopens when one appears', () => {
    const byActs = plan({ goals: [goal('g1', { progress: 'activities' })] });
    expect(notNeeded('state', inp(byActs))).toBe(true);
    expect(walkView(on(), inp(byActs)).stages[0].tasks[1].status).toBe('notNeeded');
    const measured = plan({ goals: [...byActs.goals, goal('g2')] });
    expect(notNeeded('state', inp(measured))).toBe(false);
    expect(walkView(on(), inp(measured)).stages[0].tasks[1].status).toBe('open');
  });

  test('measure is not needed when no goal is measured and there are no states', () => {
    expect(notNeeded('measure', inp(plan({ goals: [goal('g1', { progress: 'routines' })] })))).toBe(true);
    expect(notNeeded('measure', SMALLEST.state)).toBe(false);
  });

  test('an empty plan needs everything: nothing counts as done before the first goal', () => {
    expect(notNeeded('state', inp())).toBe(false);
    expect(notNeeded('measure', inp())).toBe(false);
    expect(walkView(on(), inp()).done).toBe(0);
  });

  test('a not-needed task is never latched', () => {
    expect(latch(on(), inp(plan({ goals: [goal('g1', { progress: 'activities' })] })), '2026-11-12').done.state).toBe(
      undefined,
    );
  });
});

describe('latching', () => {
  test('a tick stays after the goal is deleted', () => {
    const w = latch(on(), SMALLEST.goal, '2026-11-12');
    expect(w.done.goal).toBe('2026-11-12');
    const after = latch(w, inp(), '2026-11-13');
    expect(after.done.goal).toBe('2026-11-12');
    expect(walkView(after, inp()).stages[0].tasks[0].status).toBe('done');
  });

  test('skipped, then true, becomes a tick', () => {
    const w = latch(on({ skipped: ['goal'] }), SMALLEST.goal, '2026-11-12');
    expect(w.skipped).toEqual([]);
    expect(w.done.goal).toBe('2026-11-12');
  });

  test('nothing true: the same object back (no save needed)', () => {
    const w = on();
    expect(latch(w, inp(), '2026-11-12')).toBe(w);
  });
});

describe('the card', () => {
  test('next task is the first open one in order; a skipped one counts as done', () => {
    expect(walkView(on(), inp()).next).toBe('goal');
    const v = walkView(on({ done: { goal: '2026-11-10' }, skipped: ['state'] }), SMALLEST.state);
    expect(v.next).toBe('steps');
    expect(v.done).toBe(2);
  });

  test('13 tasks; installing that cannot happen is left out (12)', () => {
    expect(walkView(on(), inp()).total).toBe(13);
    const noInstall = inp(emptyDb(), { env: { ...env, canInstall: false } });
    expect(walkView(on(), noInstall).total).toBe(12);
    expect(walkView(on(), noInstall).stages[2].tasks.map(x => x.id)).toEqual(['backup']);
  });

  test('all done gives no next task', () => {
    const done = Object.fromEntries(TASKS.map(id => [id, '2026-11-12']));
    const v = walkView(on({ done }), inp());
    expect(v.next).toBe(null);
    expect(v.done).toBe(v.total);
  });

  test('optional tasks are marked', () => {
    const tasks = walkView(on(), inp()).stages.flatMap(s => s.tasks);
    expect(tasks.filter(x => x.optional).map(x => x.id)).toEqual(['install', 'vision']);
  });
});

describe('stored state', () => {
  test('two tabs: the union of ticks, the earlier date kept', () => {
    const a = on({ done: { goal: '2026-11-12', steps: '2026-11-12' }, skipped: ['tick'] });
    const b = on({ done: { goal: '2026-11-11', state: '2026-11-12' }, skipped: ['steps', 'days'] });
    const m = mergeWalk(a, b);
    expect(m.done).toEqual({ goal: '2026-11-11', state: '2026-11-12', steps: '2026-11-12' });
    expect(m.skipped.sort()).toEqual(['days', 'tick']);
    expect(mergeWalk(a, null)).toBe(a);
  });

  test('readWalk: broken values are "not set"; unknown tasks are dropped', () => {
    expect(readWalk(null)).toBe(null);
    expect(readWalk('on')).toBe(null);
    expect(readWalk({ state: 'maybe' })).toBe(null);
    expect(readWalk({ state: 'on', done: { goal: '2026-11-10', nope: 'x', steps: 3 }, skipped: ['tick', 'nope'] })).toEqual(
      { state: 'on', done: { goal: '2026-11-10' }, skipped: ['tick'] },
    );
    expect(readWalk({ state: 'off' })).toEqual(walkOff());
  });

  test('offer: first visit gets the welcome; tourSeen or anything stored keeps what is there', () => {
    expect(offerWalk(true, null, false)).toBe('welcome');
    expect(offerWalk(true, null, true)).toBe('keep');
    expect(offerWalk(true, walkOff(), false)).toBe('keep');
    expect(offerWalk(false, null, false)).toBe('keep');
  });
});
