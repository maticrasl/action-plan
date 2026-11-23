import { beforeEach, describe, expect, test } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type Plan, type RelType, type State, type Vision } from './model';
import { addRelation } from './relations';
import { db, setDb, setVisions, visions } from './state';
import {
  canParent,
  contributingIds,
  goalVisionIds,
  mergeVisions,
  normalizeVisions,
  purposeOf,
  visionAncestors,
  visionChildren,
  visionRoots,
  type PlanData,
} from './visions';

// Ported from tests/more.js: "visions: loops refused, several parents allowed…", "visions: Purpose needs one
// top vision…" (through purposeOf, with every plan's data given) and "visions: sync merges them like plans…".
// reachedVisions and the other readers of every stored plan are tested in store/visions.test.ts.

let n = 0;
const mkV = (title: string, parents: Vision[] = []): Vision => {
  const v: Vision = { id: `v${++n}`, title, parents: parents.map(p => p.id) };
  visions.list.push(v);
  return v;
};
const goal = (p: Partial<Goal> = {}, data: Db = db): Goal => {
  const x: Goal = { id: `g${++n}`, title: 'goal', status: 'active', ...p };
  data.goals.push(x);
  return x;
};
const act = (title: string): Activity => {
  const x: Activity = { id: `a${++n}`, title, status: 'todo' };
  db.activities.push(x);
  return x;
};
const state = (title: string): State => {
  const x: State = { id: `s${++n}`, title, description: '', value: '', history: [] };
  db.states.push(x);
  return x;
};
const rel = (a: { id: string }, b: { id: string }, type: RelType) => expect(addRelation(a.id, b.id, type)).toBeNull();
const ids = (list: Iterable<string | { id: string }>) => [...list].map(x => (typeof x === 'string' ? x : x.id)).sort();

beforeEach(() => {
  setDb(emptyDb());
  setVisions({ list: [], deleted: {} });
});

describe('normalizeVisions', () => {
  test('the future to avoid is kept as text, line breaks too, and dropped otherwise', () => {
    const v = normalizeVisions({
      list: [
        { id: 'v1', title: 'Fit', avoid: 'Tired\nevery evening' },
        { id: 'v2', title: 'Calm', avoid: 7 },
        { id: 'v3', title: 'Older' },
      ],
    });
    expect(v.list[0].avoid).toBe('Tired\nevery evening');
    expect(['avoid' in v.list[1], 'avoid' in v.list[2]]).toEqual([false, false]);
  });
});

describe('the vision tree', () => {
  test('loops refused, several parents allowed, roots, everything above, children', () => {
    const A = mkV('A life of health'),
      B = mkV('Be fit', [A]),
      C = mkV('Run well', [B]),
      D = mkV('Be a good parent');
    expect(canParent(A.id, C.id)).toBe('err.visionLoop');
    expect(canParent(A.id, B.id)).toBe('err.visionLoop');
    expect(canParent(A.id, A.id)).toBe('err.self');
    expect(canParent(C.id, B.id)).toBe('err.relExists');
    expect(canParent(C.id, D.id)).toBeNull();
    expect(canParent(C.id, 'ghost')).toBe('err.unknown');
    expect(canParent('', A.id)).toBeNull();
    C.parents.push(D.id);
    expect(ids(visionRoots())).toEqual(ids([A, D]));
    expect(ids(visionAncestors(C.id))).toEqual(ids([A, B, D]));
    expect(ids(visionChildren(B.id))).toEqual(ids([C]));
  });

  test('a sub-goal serves what its parent serves; what works toward a vision; gone visions are ignored', () => {
    const A = mkV('A'),
      B = mkV('B', [A]),
      C = mkV('C', [B]);
    const g1 = goal({ title: 'Run 10 km', visions: [C.id] }),
      g2 = goal({ title: 'Run 5 km' });
    rel(g2, g1, 'subgoal');
    expect(goalVisionIds(g2)).toEqual([C.id]);
    const a1 = act('Train'),
      a1c = act('Buy shoes'),
      s1 = state('Longest run');
    const a2 = act('Stretch'),
      a3 = act('Waits for training');
    const g3 = goal({ title: 'Unrelated goal' }),
      a4 = act('For the unrelated goal');
    rel(a1, g1, 'contributes');
    rel(a1c, a1, 'subactivity');
    rel(s1, g2, 'measures');
    rel(a2, s1, 'improves');
    rel(a3, a1, 'depends');
    rel(a4, g3, 'contributes');
    expect(ids(contributingIds())).toEqual(ids([g1, g2, a1, a1c, s1, a2]));
    g3.visions = ['ghost'];
    expect(goalVisionIds(g3)).toEqual([]);
    expect(contributingIds().has(g3.id)).toBe(false);
  });
});

describe('Purpose', () => {
  const planA: Plan = { id: 'pA', name: 'Purpose A' },
    planB: Plan = { id: 'pB', name: 'Purpose B' };

  test('one vision at the top and every active goal, in every plan, serving one', () => {
    const all: PlanData[] = [{ plan: planA, data: db }];
    expect(purposeOf(all).on).toBe(false);
    const A = mkV('A meaningful life'),
      B = mkV('Be fit', [A]),
      D = mkV('Be kind');
    const g1 = goal({ title: 'Marathon', visions: [B.id] }),
      g2 = goal({ title: 'Sub-goal' }),
      g3 = goal({ title: 'Volunteer' });
    rel(g2, g1, 'subgoal');
    let ps = purposeOf(all);
    expect([ps.on, ps.roots.length]).toEqual([false, 2]);
    D.parents = [A.id];
    ps = purposeOf(all);
    expect([ps.on, ps.unlinked.map(u => u.goal.id)]).toEqual([false, [g3.id]]);
    g3.status = 'paused';
    ps = purposeOf(all);
    expect([ps.on, ps.root?.id]).toEqual([true, A.id]);
    g3.status = 'achieved';
    expect(purposeOf(all).on).toBe(true);
    g3.status = 'active';
    g3.visions = ['ghost'];
    expect(purposeOf(all).on).toBe(false);
    g3.visions = [D.id];
    expect(purposeOf(all).on).toBe(true);
    // A goal in another plan counts too.
    const other = emptyDb();
    const og = goal({ title: 'Other plan goal' }, other);
    const both = [...all, { plan: planB, data: other }];
    ps = purposeOf(both);
    expect([ps.on, ps.unlinked.map(u => [u.goal.id, u.plan.id])]).toEqual([false, [[og.id, planB.id]]]);
    og.visions = [A.id];
    expect(purposeOf(both).on).toBe(true);
    // No active goals at all.
    [...db.goals, ...other.goals].forEach(g => (g.status = 'paused'));
    ps = purposeOf(both);
    expect([ps.on, ps.active]).toEqual([false, 0]);
  });

  test('the golden glow needs every active goal, in every plan, SMART', () => {
    const smart: Partial<Goal> = {
      specific: 'Run a marathon in under four hours',
      metric: 'Marathons',
      baseline: '0',
      target: '1',
      obstacle: 'Bad weather days',
      ifThen: 'Run on the treadmill',
      relevant: 'Fitness matters to me',
      startDate: '2026-01-01',
      deadline: '2026-12-31',
    };
    const A = mkV('A meaningful life');
    const g1 = goal({ ...smart, title: 'Marathon', visions: [A.id] }),
      g2 = goal({ title: 'Cook more', visions: [A.id] });
    const other = emptyDb();
    const og = goal({ title: 'Sleep better', visions: [A.id] }, other);
    const both: PlanData[] = [
      { plan: planA, data: db },
      { plan: planB, data: other },
    ];
    let ps = purposeOf(both);
    expect([ps.on, ps.golden, ps.vague.map(v => [v.goal.id, v.plan.id])]).toEqual([
      true,
      false,
      [
        [g2.id, planA.id],
        [og.id, planB.id],
      ],
    ]);
    expect(ps.vague.some(v => v.goal.id === g1.id)).toBe(false);
    g2.status = 'paused';
    og.status = 'achieved';
    ps = purposeOf(both);
    expect([ps.on, ps.golden, ps.vague]).toEqual([true, true, []]);
    og.status = 'active';
    Object.assign(og, smart);
    expect(purposeOf(both).golden).toBe(true);
    // No Purpose, no gold, whatever the goals.
    mkV('A second root');
    ps = purposeOf(both);
    expect([ps.on, ps.golden, ps.vague]).toEqual([false, false, []]);
    // Vague goals are listed without a Purpose too.
    g1.deadline = undefined;
    expect(purposeOf(both).vague.map(v => v.goal.id)).toEqual([g1.id]);
  });
});

describe('mergeVisions', () => {
  const v = (id: string, title: string, at: string, parents: string[] = []): Vision => ({
    id,
    title,
    parents,
    updatedAt: at,
  });

  test('the newer version wins; deletions as for plans', () => {
    expect(
      mergeVisions(
        { list: [v('a', 'Old', '2026-01-01')], deleted: {} },
        { list: [v('a', 'New', '2026-02-01')], deleted: {} },
      ).list.map(x => x.title),
    ).toEqual(['New']);
    const gone = mergeVisions(
      { list: [], deleted: { a: '2026-03-01' } },
      { list: [v('a', 'Edited', '2026-02-01')], deleted: {} },
    );
    expect([gone.list.length, gone.deleted.a]).toEqual([0, '2026-03-01']);
    const kept = mergeVisions(
      { list: [], deleted: { a: '2026-01-01' } },
      { list: [v('a', 'Edited', '2026-02-01')], deleted: {} },
    );
    expect([kept.list.length, kept.deleted.a]).toEqual([1, undefined]);
  });

  test('loops two edits made are repaired, newer links first; links that are gone, itself or doubled go', () => {
    let m = mergeVisions(
      { list: [v('x', 'X', '2026-05-02', ['y']), v('y', 'Y', '2026-05-01')], deleted: {} },
      { list: [v('x', 'X', '2026-05-01'), v('y', 'Y', '2026-05-01T10:00', ['x'])], deleted: {} },
    );
    expect(m.list.map(x => [x.id, x.parents])).toEqual([
      ['x', ['y']],
      ['y', []],
    ]);
    m = mergeVisions(
      { list: [v('p', 'P', '2026-01-01', ['gone', 'p']), v('q', 'Q', '2026-01-01', ['p', 'p'])], deleted: {} },
      null,
    );
    expect(m.list.map(x => [x.id, x.parents])).toEqual([
      ['p', []],
      ['q', ['p']],
    ]);
    m = mergeVisions(
      { list: [v('a', 'A', '3', ['b']), v('b', 'B', '2', ['c']), v('c', 'C', '1', ['a'])], deleted: {} },
      null,
    );
    expect(m.list.find(x => x.id === 'c')!.parents).toEqual([]);
  });

  test('the Purpose found first stays found; nothing on either side', () => {
    expect(
      mergeVisions(
        { list: [], deleted: {}, purposeFound: '2026-05-01' },
        { list: [], deleted: {}, purposeFound: '2026-04-01' },
      ).purposeFound,
    ).toBe('2026-04-01');
    expect(mergeVisions(undefined, undefined)).toEqual({ list: [], deleted: {} });
  });
});
