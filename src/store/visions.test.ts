import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Goal, Vision } from '../core/model';
import { db, setVisions, visions } from '../core/state';
import { findVision } from '../core/visions';
import { createPlan, openPlan, save } from './plans';
import { plans, setPlans } from './state';
import { VISIONS_KEY, deleteVision, loadVisions, purposeState, reachedVisions, saveVisions } from './visions';
import { memoryStorage } from './memory-storage';

// Ported from tests/more.js: the store half of "visions: stored, stamped, deleted with tombstones…",
// "visions: loops refused…" (what is reached, read from every plan) and "visions: Purpose needs one top
// vision…" (another plan's goals, read from storage).

let n = 0;
const mkV = (title: string, parents: Vision[] = []): Vision => {
  const v: Vision = { id: `v${++n}`, title, parents: parents.map(p => p.id) };
  visions.list.push(v);
  return v;
};
const goal = (p: Partial<Goal> = {}): Goal => {
  const x: Goal = { id: `g${++n}`, title: 'goal', status: 'active', ...p };
  db.goals.push(x);
  return x;
};
const ids = (list: Iterable<string | { id: string }>) => [...list].map(x => (typeof x === 'string' ? x : x.id)).sort();

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
  setPlans({ current: null, list: [] });
  setVisions({ list: [], deleted: {} });
  loadVisions(); // nothing stored: an empty list, and nothing to compare saves with
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('storing', () => {
  test('stamped on save, not again when unchanged, and in storage', () => {
    const A = mkV('Top'),
      B = mkV('Under', [A]);
    saveVisions();
    expect([A.updatedAt, B.updatedAt]).toEqual(['2026-11-18T10:00:00.000Z', '2026-11-18T10:00:00.000Z']);
    vi.setSystemTime(new Date('2026-11-18T11:00:00Z'));
    saveVisions();
    expect(A.updatedAt).toBe('2026-11-18T10:00:00.000Z');
    expect(JSON.parse(storage.getItem(VISIONS_KEY)!).list.map((v: Vision) => v.title)).toEqual(['Top', 'Under']);
  });

  test('deleting leaves a tombstone, the narrower vision lets go of it, and both load back', () => {
    const A = mkV('Top'),
      B = mkV('Under', [A]);
    saveVisions();
    deleteVision(A.id);
    expect([!!visions.deleted[A.id], findVision(A.id)]).toEqual([true, undefined]);
    expect(findVision(B.id)!.parents).toEqual([]);
    loadVisions();
    expect([!!findVision(B.id), findVision(A.id), !!visions.deleted[A.id]]).toEqual([true, undefined, true]);
  });

  test('bad stored data is cleaned; unreadable storage is an empty list', () => {
    storage.setItem(
      VISIONS_KEY,
      JSON.stringify({
        list: [{ id: 'ok', title: 'Fine', parents: ['x', '<b>'] }, { id: '<i>', title: 'Bad id' }, { id: 'nt' }, null],
        deleted: [],
      }),
    );
    loadVisions();
    expect(visions.list.map(v => [v.id, v.parents])).toEqual([['ok', ['x']]]);
    expect(visions.deleted).toEqual({});
    storage.setItem(VISIONS_KEY, '{oops');
    loadVisions();
    expect(visions.list).toEqual([]);
  });
});

describe('read from every plan', () => {
  test('reached: what goals serve and everything above it; an unrelated vision is not', () => {
    createPlan('Vision rules');
    const A = mkV('A life of health'),
      B = mkV('Be fit', [A]),
      C = mkV('Run well', [B]),
      D = mkV('Be a good parent');
    C.parents.push(D.id);
    goal({ title: 'Run 10 km', visions: [C.id] });
    expect(ids(reachedVisions())).toEqual(ids([A, B, C, D]));
    C.parents = [B.id];
    expect(ids(reachedVisions())).toEqual(ids([A, B, C]));
  });

  test("Purpose counts another plan's goals, read from storage, from either plan", () => {
    createPlan('Purpose A');
    const A = mkV('A meaningful life');
    goal({ title: 'Marathon', visions: [A.id] });
    save();
    expect(purposeState().on).toBe(true);
    const first = plans.current!;
    createPlan('Purpose B');
    const other = goal({ title: 'Other plan goal' });
    save();
    const ps = purposeState();
    expect([ps.on, ps.unlinked.map(u => [u.goal.id, u.plan.id])]).toEqual([false, [[other.id, plans.current]]]);
    const second = plans.current!;
    openPlan(first);
    expect([purposeState().on, purposeState().unlinked[0]?.goal.id]).toEqual([false, other.id]);
    openPlan(second);
    db.goals[0].visions = [A.id];
    save();
    openPlan(first);
    expect(purposeState().on).toBe(true);
  });
});
