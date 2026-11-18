import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  PLANS_KEY,
  createPlan,
  deletePlan,
  mergePlanInto,
  nameTaken,
  openPlan,
  planKey,
  readPlan,
  save,
  uniqueName,
} from './plans';
import { currentPlan, plans, setPlans } from './state';
import { db } from '../core/state';
import { repairRelations } from '../core/merge';
import { SYNC_COLLS, emptyDb, type Db, type Item, type Plan } from '../core/model';
import { normalize, progressCounts } from '../core/normalize';
import { progressPlan } from '../core/test-plans';
import { memoryStorage } from './memory-storage';

beforeEach(() =>
  setPlans({
    current: 'a',
    list: [
      { id: 'a', name: 'Sample plan' },
      { id: 'b', name: 'Renamed plan' },
    ],
  }),
);

describe('plan names', () => {
  test('a name is taken ignoring case and spaces around it', () => {
    expect(nameTaken('renamed plan ')).toBe(true);
    expect(nameTaken('  SAMPLE PLAN')).toBe(true);
    expect(nameTaken('Sample plans')).toBe(false);
  });

  test('a plan keeps its own name, a case change included', () => {
    expect(nameTaken('RENAMED PLAN', 'b')).toBe(false);
    expect(nameTaken('Renamed plan', 'a')).toBe(true);
  });

  test('a free name is kept; a taken one gets the first free number', () => {
    expect(uniqueName('Nothing like it')).toBe('Nothing like it');
    expect(uniqueName('Sample plan')).toBe('Sample plan 2');
    setPlans({
      current: 'a',
      list: [
        { id: 'a', name: 'Sample plan' },
        { id: 'c', name: 'Sample plan 2' },
      ],
    });
    expect(uniqueName('SAMPLE PLAN')).toBe('SAMPLE PLAN 3');
  });
});

// Ported from tests/more.js "change tracking: stamps, tombstones, undo and expiry" (its part through the
// app; the rest is in core/merge.test.ts).
describe('saving', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('save stamps only the items that changed, and stores the plan', () => {
    createPlan('Tracking');
    db.goals.push({ id: 'g1', title: 'One', status: 'active' }, { id: 'g2', title: 'Two', status: 'active' });
    save();
    expect(db.goals.map(g => g.updatedAt)).toEqual(['2026-11-18T10:00:00.000Z', '2026-11-18T10:00:00.000Z']);
    vi.setSystemTime(new Date('2026-11-18T11:00:00Z'));
    db.goals[0].title = 'Changed title';
    save();
    expect(db.goals.map(g => g.updatedAt)).toEqual(['2026-11-18T11:00:00.000Z', '2026-11-18T10:00:00.000Z']);
    expect(JSON.parse(storage.getItem(planKey(plans.current!))!).goals[0].title).toBe('Changed title');
  });
});

// Ported from tests/more.js: "merge: everything moves over…", "merge: clashing ids get new ones…",
// "merge: the open plan can be the source, the target or another plan" and "merge: deleting the source
// afterwards" (the dialogs are checked in the page).
describe('merging one plan into another', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
    setPlans({ current: null, list: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  const addPlan = ({ name, data }: { name: string; data: Db }): Plan => {
    createPlan(uniqueName(name), normalize(clone(data)));
    return currentPlan()!;
  };
  const items = (data: Db) => SYNC_COLLS.flatMap(c => data[c] as Item[]);
  const titles = (data: Db) =>
    SYNC_COLLS.filter(c => c !== 'relations')
      .flatMap(c => (data[c] as { title: string }[]).map(x => `${c}:${x.title}`))
      .sort();
  const allIds = (data: Db) => items(data).map(x => x.id);
  const sum = <T extends object>(a: T, b: T) =>
    Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v + (b as Record<string, number>)[k]]));
  // A target plan with items of its own, a relation and progress.
  const targetPlan = () => ({
    name: 'Money',
    data: {
      ...emptyDb(),
      goals: [
        {
          id: 'tg',
          title: 'Save money',
          status: 'active',
          unit: '€',
          baseline: '0',
          target: '500',
          current: '100',
          category: 'Finance',
          updatedAt: '2026-02-02T00:00:00.000Z',
        },
      ],
      activities: [{ id: 'ta', title: 'Budget', status: 'done', updatedAt: '2026-02-02T00:00:00.000Z' }],
      relations: [{ id: 'tr', from: 'ta', to: 'tg', type: 'contributes', updatedAt: '2026-02-02T00:00:00.000Z' }],
    } as Db,
  });

  test('everything moves over and the target keeps its own', () => {
    const T = addPlan(targetPlan()),
      tBefore = clone(db);
    const S = addPlan(progressPlan()),
      sBefore = clone(db);
    const started = new Date().toISOString();
    mergePlanInto(S.id, T.id);
    expect(plans.current).toBe(T.id);
    expect(titles(db)).toEqual([...titles(tBefore), ...titles(sBefore)].sort());
    expect(db.relations).toHaveLength(2);
    for (const x of items(tBefore)) expect(items(db).find(y => y.id === x.id)).toEqual(x);
    expect(progressCounts(db)).toEqual(sum(progressCounts(tBefore), progressCounts(sBefore)));
    const run = db.activities.find(a => a.title === 'Run')!;
    expect([run.checkins, run.repeat]).toEqual([sBefore.activities[3].checkins, sBefore.activities[3].repeat]);
    expect(db.states.find(s => s.title === 'Longest run')!.history).toEqual(sBefore.states[0].history);
    expect(db.goals.find(g => g.title === 'Run 10 km')!.category).toBe('Health');
    expect(allIds(sBefore).every(id => allIds(db).includes(id))).toBe(true);
    const moved = items(db).filter(x => allIds(sBefore).includes(x.id));
    expect(moved).toHaveLength(10);
    expect(moved.every(x => x.updatedAt! >= started)).toBe(true);
    expect(readPlan(T.id)).toEqual(clone(db));
    expect(readPlan(S.id)).toEqual(sBefore);
    expect(plans.list.some(p => p.id === S.id)).toBe(true);
    expect(repairRelations(clone(db))).toHaveLength(db.relations.length);
  });

  test('clashing ids get new ones and their links follow', () => {
    const src = progressPlan();
    const T = addPlan(src),
      S = addPlan(src); // two plans from the same file share ids
    // The target once deleted an item whose id the source still uses: it must not come back as that id.
    const T0 = readPlan(T.id);
    const ghost = 'ghost-id';
    T0.deleted[ghost] = '2026-03-03T00:00:00.000Z';
    storage.setItem(planKey(T.id), JSON.stringify(T0));
    db.states.push({ id: ghost, title: 'Ghost', description: '', value: '', history: [] });
    // A relation pointing at nothing is left behind.
    db.relations.push({ id: 'dangling', from: db.activities[0].id, to: 'missing', type: 'contributes' });
    save();
    const sBefore = clone(db),
      tIds = new Set(allIds(T0));
    mergePlanInto(S.id, T.id);
    const ids = allIds(db);
    expect(new Set(ids).size).toBe(ids.length);
    expect(db.goals).toHaveLength(6);
    expect(db.relations).toHaveLength(2);
    const copy = db.relations.find(r => !tIds.has(r.id))!;
    expect(copy).toBeTruthy();
    const from = db.activities.find(a => a.id === copy.from),
      to = db.goals.find(g => g.id === copy.to);
    expect([from?.title, to?.title, copy.type]).toEqual(['Training plan', 'Run 10 km', 'contributes']);
    expect([tIds.has(copy.from), tIds.has(copy.to)]).toEqual([false, false]);
    const g2 = db.states.find(s => s.title === 'Ghost');
    expect(g2 && g2.id !== ghost).toBe(true);
    expect(db.deleted[ghost]).toBeTruthy();
    expect(repairRelations(clone(db))).toHaveLength(db.relations.length);
    expect(readPlan(S.id)).toEqual(sBefore);
  });

  test('the open plan can be the source, the target or another plan', () => {
    for (const open of ['source', 'target', 'other'] as const) {
      const O = addPlan({ name: 'Other', data: emptyDb() });
      const T = addPlan(targetPlan()),
        tBefore = clone(db);
      const S = addPlan(progressPlan()),
        sBefore = clone(db);
      openPlan({ source: S, target: T, other: O }[open].id);
      mergePlanInto(S.id, T.id);
      expect(plans.current, open).toBe(T.id);
      expect(titles(readPlan(T.id)), open).toEqual([...titles(tBefore), ...titles(sBefore)].sort());
      expect(readPlan(S.id), open).toEqual(sBefore);
      expect(readPlan(O.id).goals, open).toHaveLength(0);
      [O, T, S].forEach(p => deletePlan(p.id));
    }
  });

  test('deleting the source afterwards; an empty source adds nothing and can still go', () => {
    const T = addPlan(targetPlan());
    const S = addPlan(progressPlan()),
      sBefore = clone(db);
    const n0 = plans.list.length;
    mergePlanInto(S.id, T.id, true);
    expect([plans.current, plans.list.length]).toEqual([T.id, n0 - 1]);
    expect(plans.list.some(p => p.id === S.id)).toBe(false);
    expect(storage.getItem(planKey(S.id))).toBeNull();
    expect(plans.deleted?.[S.id]).toBeTruthy();
    expect(titles(sBefore).every(x => titles(db).includes(x))).toBe(true);
    expect(JSON.parse(storage.getItem(PLANS_KEY)!).list.map((p: Plan) => p.id)).not.toContain(S.id);
    const E = addPlan({ name: 'Empty', data: emptyDb() });
    const before = clone(readPlan(T.id));
    mergePlanInto(E.id, T.id, true);
    expect(titles(db)).toEqual(titles(before));
    expect(plans.list.some(p => p.id === E.id)).toBe(false);
  });
});
