import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  mergeActivity,
  mergeGoal,
  mergePlans,
  mergeState,
  mergeStores,
  repairRelations,
  resetClock,
  snapshotOf,
  stampNow,
  stampChanges,
  stampPlanChanges,
  takePlanSnapshot,
  takeSnapshot,
  type Store,
} from './merge';
import { SYNC_COLLS, type Plan } from './model';
import { normalize } from './normalize';
import { addDays } from './routines/schedule';
import { today } from './dates';
import {
  emptyDb,
  type Activity,
  type Db,
  type Entry,
  type Goal,
  type ListItem,
  type Relation,
  type State,
} from './model';

// Ported from the in-page suite (tests/test.js "change tracking + merge"; tests/more.js "change tracking",
// "repairRelations", "nothing depends on a routine", "merge: state histories…", "lists: sync merges items",
// "cumulative: sync merges entries"), with explicit data instead of the sample plan.

// Items with the fields their types require; tests add what they are about.
const goal = (p: Partial<Goal> & { id: string }): Goal => ({ title: p.id, status: 'active', ...p });
const state = (p: Partial<State> & { id: string }): State => ({
  title: p.id,
  description: '',
  value: '',
  history: [],
  ...p,
});
const act = (p: Partial<Activity> & { id: string }): Activity => ({ title: p.id, status: 'todo', ...p });
const rel = (id: string, from: string, type: Relation['type'], to: string, updatedAt?: string): Relation => ({
  id,
  from,
  type,
  to,
  ...(updatedAt && { updatedAt }),
});
const plan = (p: Partial<Db>): Db => ({ ...emptyDb(), ...p });
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-16T11:00:00Z'));
  resetClock();
});
afterEach(() => vi.useRealTimers());

describe('change tracking', () => {
  test('stamps only what changed, leaves tombstones, undo removes them, old ones expire', () => {
    const data = plan({ goals: [goal({ id: 'x', title: 'X' }), goal({ id: 'y', title: 'Y' })] });
    takeSnapshot(data);
    stampChanges(data);
    expect(data.goals.some(g => g.updatedAt)).toBe(false);
    data.goals[0].title = 'X2';
    stampChanges(data);
    expect([!!data.goals[0].updatedAt, !!data.goals[1].updatedAt]).toEqual([true, false]);
    const y = data.goals.pop()!;
    stampChanges(data);
    expect(data.deleted.y).toBe('2026-11-16T11:00:00.000Z');
    data.goals.push(y);
    stampChanges(data);
    expect(data.deleted.y).toBeUndefined();
    data.deleted.old = '2000-01-01T00:00:00.000Z';
    stampChanges(data);
    expect(data.deleted.old).toBeUndefined();
  });

  test('statusSince: set on a status change and on new items, kept otherwise', () => {
    const data = plan({
      goals: [goal({ id: 'g' })],
      activities: [act({ id: 'a', statusSince: '2026-01-01' }), act({ id: 'old' })],
    });
    takeSnapshot(data);
    data.activities[0].title = 'renamed';
    stampChanges(data);
    expect(data.activities[0].statusSince).toBe('2026-01-01'); // an edit is not a status change
    expect(data.activities[1].statusSince).toBeUndefined(); // old item, untouched: stays unknown
    data.activities[0].status = 'doing';
    data.goals[0].status = 'achieved';
    data.activities.push(act({ id: 'new' }));
    stampChanges(data);
    expect(data.activities[0].statusSince).toBe(today());
    expect(data.goals[0].statusSince).toBe(today());
    expect(data.activities[2].statusSince).toBe(today());
    expect(data.activities[0].updatedAt).toBeTruthy();
    vi.setSystemTime(new Date('2026-11-20T11:00:00Z'));
    stampChanges(data); // nothing changed: no new stamps
    expect(data.activities[0].statusSince).toBe('2026-11-16');
  });

  test('doneAt and achievedAt: set when done or achieved, kept when set by hand, removed when undone', () => {
    const data = plan({
      goals: [goal({ id: 'g' })],
      activities: [
        act({ id: 'a' }),
        act({ id: 'was-done', status: 'done' }),
        act({ id: 'r', repeat: { every: 1, unit: 'day' } }),
        act({
          id: 'l',
          list: [
            { id: 'i1', text: 'one' },
            { id: 'i2', text: 'two', done: true },
          ],
        }),
      ],
    });
    takeSnapshot(data);
    const [a, wasDone, r, l] = data.activities;
    a.status = 'done';
    data.goals[0].status = 'achieved';
    r.status = 'done';
    l.list![0].done = true;
    stampChanges(data);
    expect([a.doneAt, data.goals[0].achievedAt, l.list![0].doneAt]).toEqual([today(), today(), today()]);
    expect(wasDone.doneAt).toBeUndefined(); // done before this feature: stays without a date
    expect(l.list![1].doneAt).toBeUndefined();
    expect(r.doneAt).toBeUndefined(); // routines never get one
    a.doneAt = '2026-11-10'; // changed in the form
    stampChanges(data);
    expect(a.doneAt).toBe('2026-11-10');
    a.status = 'doing';
    data.goals[0].status = 'active';
    l.list![0].done = false;
    stampChanges(data);
    expect([a.doneAt, data.goals[0].achievedAt, l.list![0].doneAt]).toEqual([undefined, undefined, undefined]);
    data.activities.push(act({ id: 'new', status: 'done', doneAt: '2026-11-01' }));
    stampChanges(data);
    expect(data.activities[4].doneAt).toBe('2026-11-01'); // a new item done on a day given by hand
  });

  test('statusSince: an auto-start leaves it out (autoStarted says since when); a later manual start stamps it', () => {
    const data = plan({ activities: [act({ id: 'a', startDate: '2026-11-10', statusSince: '2026-11-01' })] });
    takeSnapshot(data);
    Object.assign(data.activities[0], { status: 'doing', autoStarted: '2026-11-10' });
    stampChanges(data);
    expect(data.activities[0].statusSince).toBeUndefined();
    data.activities[0].status = 'todo';
    stampChanges(data);
    data.activities[0].status = 'doing'; // by hand: autoStarted is unchanged
    stampChanges(data);
    expect(data.activities[0].statusSince).toBe(today());
  });

  test('a plan rename is stamped and a deleted plan recorded', () => {
    const idx = {
      current: 'p1',
      list: [
        { id: 'p1', name: 'One' },
        { id: 'p2', name: 'Two' },
      ],
    };
    takePlanSnapshot(idx);
    idx.list[0].name = 'Uno';
    idx.list.pop();
    stampPlanChanges(idx);
    expect(idx.list[0]).toHaveProperty('updatedAt');
    expect(idx).toHaveProperty('deleted.p2');
  });
  test('a new emoji is stamped too; an untouched plan is not', () => {
    const idx = {
      current: 'p1',
      list: [{ id: 'p1', name: 'One' } as Plan, { id: 'p2', name: 'Two', emoji: '🏃' }],
    };
    takePlanSnapshot(idx);
    idx.list[0].emoji = '🎯';
    stampPlanChanges(idx);
    expect(idx.list[0]).toHaveProperty('updatedAt');
    expect(idx.list[1]).not.toHaveProperty('updatedAt');
  });
});

describe('repairRelations', () => {
  test('dangling, duplicate, two parents, loops: newer links win', () => {
    const goals = ['n0', 'n1', 'n2', 'n3'].map(id => goal({ id }));
    const data = plan({
      goals,
      activities: [act({ id: 'a1' }), act({ id: 'a2' })],
      relations: [
        rel('dupOld', 'a1', 'contributes', 'n0', '2099-01-01'),
        rel('dupNew', 'a1', 'contributes', 'n0', '2099-02-01'),
        rel('ghost', 'a1', 'contributes', 'missing', '2099-09-01'),
        rel('parentOld', 'n3', 'subgoal', 'n1', '2099-01-01'),
        rel('parentNew', 'n3', 'subgoal', 'n2', '2099-03-01'),
        rel('loopOld', 'a1', 'depends', 'a2', '2099-01-01'),
        rel('loopNew', 'a2', 'depends', 'a1', '2099-05-01'),
      ],
    });
    expect(repairRelations(data).map(x => x.id)).toEqual(['dupNew', 'parentNew', 'loopNew']);
  });

  test('nothing depends on a routine; a routine depending on an activity stays', () => {
    const old = plan({
      activities: [act({ id: 'a1' }), act({ id: 'r1', repeat: { every: 1, unit: 'day' } })],
      relations: [
        rel('bad', 'a1', 'depends', 'r1'),
        rel('ok', 'r1', 'depends', 'a1'),
        rel('sub', 'a1', 'subactivity', 'r1'),
      ],
    });
    expect(repairRelations(old).map(x => x.id)).toEqual(['ok', 'sub']);
  });

  test('one device links a1 → r1 while the other makes r1 a routine: the merge drops the link', () => {
    const mine = plan({
      activities: [act({ id: 'a1', updatedAt: '2099-01-01' }), act({ id: 'r1', updatedAt: '2099-01-01' })],
      relations: [rel('bad', 'a1', 'depends', 'r1', '2099-01-02')],
    });
    const theirs = plan({
      activities: [mine.activities[0], act({ id: 'r1', repeat: { every: 1, unit: 'day' }, updatedAt: '2099-01-03' })],
    });
    const store = (data: Db): Store => ({
      plans: { list: [{ id: 'p', name: 'Routine deps' }], deleted: {} },
      data: { p: data },
    });
    const merged = mergeStores(store(mine), store(theirs)).data.p;
    expect(merged.activities.find(x => x.id === 'r1')!.repeat).toBeTruthy();
    expect(merged.relations).toEqual([]);
  });
});

describe('mergeState', () => {
  const x = state({
    id: 's',
    value: '3',
    date: '2099-01-03',
    updatedAt: '2099-01-01',
    history: [
      { date: '2099-01-01', value: '1' },
      { date: '2099-01-03', value: '3' },
    ],
  });
  const y = state({
    id: 's',
    value: '30',
    date: '2099-01-03',
    updatedAt: '2099-02-01',
    history: [
      { date: '2099-01-03', value: '30' },
      { date: '2099-01-02', value: '2' },
    ],
  });

  test('histories merge by date, the newer value wins a clash, the value follows the latest', () => {
    const m = mergeState(x, y);
    expect(m.history.map(h => `${h.date.slice(-2)}=${h.value}`)).toEqual(['01=1', '02=2', '03=30']);
    expect([m.value, m.date]).toEqual(['30', '2099-01-03']);
    expect(mergeState(y, x)).toEqual(m);
  });

  test('a deleted measurement stays deleted; recorded again later, it wins', () => {
    const deletedDay = {
      ...y,
      updatedAt: '2099-03-01',
      history: [{ date: '2099-01-03', value: '30' }],
      dropped: { '2099-01-02': 1 as const },
    };
    const md = mergeState(x, deletedDay);
    expect(md.history.map(h => h.date.slice(-2))).toEqual(['01', '03']);
    expect(md.dropped).toEqual({ '2099-01-02': 1 });
    const again = { ...x, updatedAt: '2099-04-01', history: [...x.history, { date: '2099-01-02', value: '9' }] };
    expect(mergeState(again, deletedDay).dropped).toBeUndefined();
  });

  test('amounts that add up merge by id, keep deletions, recompute the total', () => {
    const now = today();
    const e = (id: string, amount: number, date = now): Entry => ({ id, date, amount: String(amount) });
    const cx = state({
      id: 's',
      cumulative: true,
      scale: 'week',
      updatedAt: '2099-01-01',
      entries: [e('a', 1), e('b', 2)],
      value: '3',
      date: now,
    });
    const cy = state({
      id: 's',
      cumulative: true,
      scale: 'week',
      updatedAt: '2099-02-01',
      entries: [e('a', 10), e('c', 4)],
      droppedEntries: { b: 1 },
      value: '14',
      date: now,
    });
    const m = mergeState(cx, cy);
    expect(m.entries!.map(x => `${x.id}=${x.amount}`)).toEqual(['a=10', 'c=4']);
    expect(m.droppedEntries).toEqual({ b: 1 });
    expect(m.value).toBe('14');
    expect(mergeState(cy, cx)).toEqual(m);
    const old = { ...cx, updatedAt: '2099-03-01', entries: [e('a', 1), e('b', 2), e('d', 8)] };
    expect(mergeState(old, cy).entries!.map(x => x.id)).toEqual(['a', 'c', 'd']);
    expect(mergePlans(plan({ states: [cx] }), plan({ states: [cy] })).states[0].entries).toHaveLength(2);
    // A copy from a device still on the old form (cumulative: 'week') is read the new way.
    const oldForm = { ...cx, cumulative: 'week', scale: undefined, updatedAt: '2099-04-01' } as unknown as State;
    const older = normalize({ states: [mergeState(oldForm, cy)] }).states[0];
    expect([older.cumulative, older.scale]).toEqual([true, 'week']);
  });
});

describe('mergeActivity: lists', () => {
  const it = (id: string, text: string, done: boolean, at: string): ListItem => ({ id, text, done, at });
  const base = { id: 'L', title: 'Pack', status: 'doing' as const, startDate: today(), dueDate: addDays(today(), 3) };
  // Phone (older save) ticked shoes and added a towel; laptop (newer save) ticked gels and removed the hat.
  const phone: Activity = {
    ...base,
    updatedAt: '2099-01-02',
    list: [
      it('s', 'Shoes', true, '2099-01-02'),
      it('g', 'Gels', false, '2099-01-01'),
      it('h', 'Hat', false, '2099-01-01'),
      it('t', 'Towel', false, '2099-01-02'),
    ],
  };
  const laptop: Activity = {
    ...base,
    updatedAt: '2099-01-03',
    list: [it('g', 'Energy gels', true, '2099-01-03'), it('s', 'Shoes', false, '2099-01-01')],
    droppedItems: { h: 1 },
  };

  test('items merge one by one: both ticks kept, newer order, added kept, removed gone', () => {
    const m = mergeActivity(phone, laptop);
    expect(m.list!.map(i => `${i.id}:${i.text}:${i.done ? 'x' : '-'}`)).toEqual([
      'g:Energy gels:x',
      's:Shoes:x',
      't:Towel:-',
    ]);
    expect(m.droppedItems).toEqual({ h: 1 });
    expect(m.status).toBe('doing');
    expect(mergeActivity(laptop, phone)).toEqual(m);
    expect([phone.list!.length, laptop.list!.length, phone.droppedItems]).toEqual([4, 2, undefined]);
  });

  test('a removal on one side wins over the other side ticking the item', () => {
    const ticked = {
      ...phone,
      updatedAt: '2099-01-05',
      list: phone.list!.map(i => (i.id === 'h' ? it('h', 'Hat', true, '2099-01-05') : i)),
    };
    expect(mergeActivity(ticked, laptop).list!.some(i => i.id === 'h')).toBe(false);
  });

  test('merged ticks complete a list; an item added elsewhere reopens a done one', () => {
    const a1: Activity = {
      ...base,
      updatedAt: '2099-01-02',
      list: [it('a', 'A', true, '2099-01-02'), it('b', 'B', false, '2099-01-01')],
    };
    const a2: Activity = {
      ...base,
      updatedAt: '2099-01-03',
      list: [it('a', 'A', false, '2099-01-01'), it('b', 'B', true, '2099-01-03')],
    };
    expect(mergeActivity(a1, a2).status).toBe('done');
    const done: Activity = {
      ...base,
      status: 'done',
      updatedAt: '2099-01-04',
      list: [it('a', 'A', true, '2099-01-04')],
    };
    const more: Activity = {
      ...base,
      updatedAt: '2099-01-02',
      list: [it('a', 'A', true, '2099-01-02'), it('n', 'New', false, '2099-01-02')],
    };
    expect(mergeActivity(done, more).status).toBe('doing');
    // Items from before item times existed count as oldest.
    const legacy: Activity = { ...base, updatedAt: '2099-01-09', list: [{ id: 'a', text: 'A', done: false }] };
    expect(mergeActivity(legacy, a1).list!.find(i => i.id === 'a')!.done).toBe(true);
  });

  test('plain activities: the newer copy; turned plain on the newer side: no list', () => {
    const plain = { ...base, updatedAt: '2099-01-02' },
      plain2 = { ...base, title: 'Later', updatedAt: '2099-01-03' };
    expect(mergeActivity(plain, plain2)).toEqual(plain2);
    expect('list' in mergeActivity({ ...plain, updatedAt: '2099-01-05' }, phone)).toBe(false);
    expect(mergePlans(plan({ activities: [phone] }), plan({ activities: [laptop] })).activities[0].list).toHaveLength(
      3,
    );
  });
});

describe('mergePlans', () => {
  const z = (at: string) => goal({ id: 'z', title: 'Z', updatedAt: at });

  test('an edit after a deletion survives; a deletion after the last edit wins', () => {
    expect(mergePlans(plan({ goals: [z('2099-06-01')] }), plan({ deleted: { z: '2099-05-01' } })).goals).toHaveLength(
      1,
    );
    const gone = mergePlans(plan({ goals: [z('2099-06-01')] }), plan({ deleted: { z: '2099-07-01' } }));
    expect(gone.goals).toEqual([]);
    expect(gone.deleted.z).toBe('2099-07-01');
  });

  // A plan as both devices had it before their edits.
  const base = () =>
    plan({
      goals: [goal({ id: 'g0', title: 'Run' }), goal({ id: 'g1', title: 'Read' })],
      states: [state({ id: 's0', value: '5', date: '2026-11-01', history: [{ date: '2026-11-01', value: '5' }] })],
      activities: [act({ id: 'a0' }), act({ id: 'a1' }), act({ id: 'a2' })],
      relations: [rel('r0', 'a0', 'contributes', 'g0')],
    });

  test('the newer edit wins, a deletion carries over, histories merge, a doubled link goes', () => {
    const a = base(),
      b = base();
    a.goals[0].title = 'Edited on A';
    a.goals[0].updatedAt = '2099-01-01T00:00:00.000Z';
    b.deleted.g1 = '2099-01-01T00:00:00.000Z';
    b.goals.splice(1, 1);
    b.states[0].history.push({ date: '2099-05-05', value: '99' });
    b.states[0].updatedAt = '2098-01-01T00:00:00.000Z';
    a.relations.push(rel('dup', 'a0', 'contributes', 'g0', '2099-01-01T00:00:00.000Z'));
    const m = mergePlans(a, b);
    expect(m.goals.map(g => g.title)).toEqual(['Edited on A']);
    expect(m.states[0].value).toBe('99');
    expect(m.relations.map(r => r.id)).toEqual(['dup']);
    expect(Object.keys(m.deleted)).toEqual(['g1']);
  });

  test('both devices end up with the same plan, even for edits stamped at the same time', () => {
    const a = base(),
      b = base();
    a.goals[0].title = 'Same time A';
    b.goals[0].title = 'Same time B';
    a.goals[0].updatedAt = b.goals[0].updatedAt = '2099-01-01T00:00:00.000Z';
    b.activities[2].status = 'done';
    b.activities[2].updatedAt = '2099-01-02T00:00:00.000Z';
    const sorted = (p: Db) => JSON.stringify(SYNC_COLLS.map(c => [...p[c]].sort((u, v) => u.id.localeCompare(v.id))));
    const ab = mergePlans(a, b),
      ba = mergePlans(b, a);
    expect(sorted(ab)).toBe(sorted(ba));
    expect(ab.activities[2].status).toBe('done');
  });
});

describe('notes merge', () => {
  const N = (id: string, at: string) => ({ id, date: '2026-11-01', text: id, at });
  test('mergeGoal: the newer goal wins and notes from both are kept', () => {
    const a = goal({ id: 'g', title: 'A', updatedAt: '2099-01-02T00:00:00.000Z', notes: [N('n1', 'x')] });
    const b = goal({ id: 'g', title: 'B', updatedAt: '2099-01-01T00:00:00.000Z', notes: [N('n2', 'y')] });
    for (const m of [mergeGoal(a, b), mergeGoal(b, a)]) {
      expect(m.title).toBe('A');
      expect(m.notes!.map(n => n.id)).toEqual(['n1', 'n2']);
    }
    expect('notes' in mergeGoal(goal({ id: 'g' }), goal({ id: 'g' }))).toBe(false);
  });
  test('states and activities keep notes from both; a deleted one stays deleted', () => {
    const s1 = state({
      id: 's',
      updatedAt: '2099-01-02T00:00:00.000Z',
      notes: [N('n1', 'x')],
      droppedNotes: { n3: 1 },
    });
    const s2 = state({ id: 's', notes: [N('n2', 'y'), N('n3', 'z')] });
    expect(mergeState(s1, s2).notes!.map(n => n.id)).toEqual(['n1', 'n2']);
    const a1 = act({ id: 'a', updatedAt: '2099-01-02T00:00:00.000Z' });
    const a2 = act({ id: 'a', notes: [N('n2', 'y')] });
    expect(mergeActivity(a1, a2).notes!.map(n => n.id)).toEqual(['n2']);
  });
  test('mergePlans merges goals through mergeGoal', () => {
    const a = plan({ goals: [goal({ id: 'g', updatedAt: '2099-01-02T00:00:00.000Z', notes: [N('n1', 'x')] })] });
    const b = plan({ goals: [goal({ id: 'g', notes: [N('n2', 'y')] })] });
    expect(mergePlans(a, b).goals[0].notes!.length).toBe(2);
  });
});

describe('a device whose clock runs ahead', () => {
  const NOW = '2026-11-16T11:00:00.000Z',
    AHEAD = '2026-11-16T13:00:00.000Z'; // the phone's clock: two hours fast
  // This device receives `g`, last edited on the phone, through a merge (sync or another tab).
  const received = (): Db => {
    const local = plan({ goals: [goal({ id: 'g', title: 'old', updatedAt: '2026-11-01T00:00:00.000Z' })] });
    const phone = plan({ goals: [goal({ id: 'g', title: 'phone', updatedAt: AHEAD })] });
    const store = (d: Db): Store => ({ plans: { list: [{ id: 'p', name: 'P' }] }, data: { p: d } });
    const data = mergeStores(store(local), store(phone)).data.p;
    takeSnapshot(data);
    return data;
  };

  test('a later edit here still wins over it', () => {
    const data = received();
    const phoneCopy = copy(data);
    data.goals[0].title = 'laptop';
    stampChanges(data);
    expect(data.goals[0].updatedAt! > AHEAD).toBe(true);
    expect(mergePlans(phoneCopy, data).goals[0].title).toBe('laptop');
  });

  test('a later deletion here still wins over it', () => {
    const data = received();
    const phoneCopy = copy(data);
    data.goals = [];
    stampChanges(data);
    expect(mergePlans(phoneCopy, data).goals).toEqual([]);
  });

  test('a clock more than a day ahead is not followed', () => {
    const store = (at: string): Store => ({
      plans: { list: [{ id: 'p', name: 'P' }] },
      data: { p: plan({ goals: [goal({ id: 'g', updatedAt: at })] }) },
    });
    const data = mergeStores(store('2099-01-01T00:00:00.000Z'), store(NOW)).data.p;
    takeSnapshot(data);
    data.goals.push(goal({ id: 'new' }));
    stampChanges(data);
    expect(data.goals[1].updatedAt).toBe(NOW);
  });

  test('another user starts from this device clock again', () => {
    received();
    resetClock();
    const data = plan({ goals: [goal({ id: 'x' })] });
    takeSnapshot(data);
    data.goals[0].title = 'changed';
    stampChanges(data);
    expect(data.goals[0].updatedAt).toBe(NOW);
  });

  test('stored lists and their deletions are seen when loaded (visions, journal, plan list)', () => {
    snapshotOf([{ id: 'v', updatedAt: AHEAD }]);
    expect(stampNow() > AHEAD).toBe(true);
    resetClock();
    const later = '2026-11-16T14:00:00.000Z';
    snapshotOf([], { gone: later }); // restoring `gone` here must beat its deletion
    expect(stampNow() > later).toBe(true);
    resetClock();
    takePlanSnapshot({ list: [{ id: 'p', name: 'P' }], deleted: { q: AHEAD } });
    expect(stampNow() > AHEAD).toBe(true);
  });

  test('merging alone does not move the clock (a sync of a user who has just left)', () => {
    const store = (at: string): Store => ({
      plans: { list: [{ id: 'p', name: 'P' }] },
      data: { p: plan({ goals: [goal({ id: 'g', updatedAt: at })] }) },
    });
    mergeStores(store(AHEAD), store(NOW));
    expect(stampNow()).toBe(NOW);
  });
});

describe('mergeStores', () => {
  test('tips: merged when either side has them, left out when neither has', () => {
    const s = (tips?: Store['tips']): Store => ({ plans: { list: [] }, data: {}, ...(tips && { tips }) });
    expect(mergeStores(s(), s())).not.toHaveProperty('tips');
    const t = { off: true, shown: { k: { n: 1, last: '2026-11-19' } }, since: {} };
    expect(mergeStores(s(), s(t)).tips).toEqual(t);
    expect(
      mergeStores(s(t), s({ off: false, shown: { k: { n: 2, last: '2026-11-01' } }, since: {} })).tips!.shown.k.n,
    ).toBe(2);
  });

  test('the newer plan name wins; a plan deleted on one side and untouched on the other stays deleted', () => {
    const a = plan({ goals: [goal({ id: 'g' })] }),
      b = copy(a);
    const sA: Store = {
      plans: { list: [{ id: 'p1', name: 'One', updatedAt: '2099-01-01' }], deleted: { p2: '2099-01-01' } },
      data: { p1: a },
    };
    const sB: Store = {
      plans: {
        list: [
          { id: 'p1', name: 'Uno' },
          { id: 'p2', name: 'Two' },
        ],
        deleted: {},
      },
      data: { p1: b, p2: emptyDb() },
    };
    const ms = mergeStores(sA, sB);
    expect(ms.plans.list.map(p => p.name)).toEqual(['One']);
    expect(Object.keys(ms.plans.deleted!)).toEqual(['p2']);
    expect(ms.visions).toEqual({ list: [], deleted: {} });
  });

  test('a plan edited after its deletion is kept; deleted after its last edit, it stays deleted', () => {
    const store = (goalAt: string): Store => ({
      plans: { list: [{ id: 'p', name: 'P' }], deleted: {} },
      data: { p: plan({ goals: [goal({ id: 'z', updatedAt: goalAt })] }) },
    });
    const del: Store = { plans: { list: [], deleted: { p: '2099-01-01' } }, data: {} };
    const kept = mergeStores(del, store('2099-02-01'));
    const dropped = mergeStores(del, store('2098-01-01'));
    expect([kept.plans.list.length, kept.plans.deleted!.p]).toEqual([1, undefined]);
    expect([dropped.plans.list.length, dropped.plans.deleted!.p]).toEqual([0, '2099-01-01']);
  });
});
