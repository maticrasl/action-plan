import { beforeEach, describe, expect, test } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type RelType, type State, type Vision } from './model';
import { addRelation } from './relations';
import { db, setDb, setVisions, visions } from './state';
import { shownVision, stepVisions, unservedVisions } from './line-of-sight';
import type { PlanData } from './visions';

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
const act = (title = 'step'): Activity => {
  const x: Activity = { id: `a${++n}`, title, status: 'todo' };
  db.activities.push(x);
  return x;
};
const state = (): State => {
  const x: State = { id: `s${++n}`, title: 'weight', description: '', value: '', history: [] };
  db.states.push(x);
  return x;
};
const rel = (a: { id: string }, b: { id: string }, type: RelType) => expect(addRelation(a.id, b.id, type)).toBeNull();
const plan = (data: Db, id = 'p1'): PlanData => ({ plan: { id, name: id }, data });

beforeEach(() => {
  setDb(emptyDb());
  setVisions({ list: [], deleted: {} });
});

describe('stepVisions', () => {
  test('through one goal', () => {
    const v = mkV('Fit'),
      a = act();
    rel(a, goal({ visions: [v.id] }), 'contributes');
    expect(stepVisions(db, a.id)).toEqual([v.id]);
  });
  test("through a sub-goal's parent goal", () => {
    const v = mkV('Fit'),
      top = goal({ visions: [v.id] }),
      sub = goal(),
      a = act();
    rel(sub, top, 'subgoal');
    rel(a, sub, 'contributes');
    expect(stepVisions(db, a.id)).toEqual([v.id]);
  });
  test('a sub-activity without a goal inherits from its parent activity', () => {
    const v = mkV('Fit'),
      parent = act(),
      child = act();
    rel(parent, goal({ visions: [v.id] }), 'contributes');
    rel(child, parent, 'subactivity');
    expect(stepVisions(db, child.id)).toEqual([v.id]);
  });
  test('a routine reaches visions through the state it improves', () => {
    const v = mkV('Fit'),
      s = state(),
      a = act();
    rel(s, goal({ visions: [v.id] }), 'measures');
    rel(a, s, 'improves');
    expect(stepVisions(db, a.id)).toEqual([v.id]);
  });
  test('a step with no goal gives none; a vision that no longer exists is ignored', () => {
    expect(stepVisions(db, act().id)).toEqual([]);
    const a = act();
    rel(a, goal({ visions: ['gone'] }), 'contributes');
    expect(stepVisions(db, a.id)).toEqual([]);
    expect(stepVisions(db, 'no-such-id')).toEqual([]);
  });
});

describe('shownVision', () => {
  test('the first by title, and how many more', () => {
    const b = mkV('Calm'),
      a = mkV('Able'),
      c = mkV('Fit');
    expect(shownVision([b.id, c.id, a.id])).toEqual({ vision: a, more: 2 });
    expect(shownVision([b.id])).toEqual({ vision: b, more: 0 });
  });
  test('the Purpose is left out; nothing when none remain', () => {
    const p = mkV('Purpose'),
      a = mkV('Able', [p]);
    expect(shownVision([p.id, a.id], p.id)).toEqual({ vision: a, more: 0 });
    expect(shownVision([p.id], p.id)).toBeNull();
    expect(shownVision([])).toBeNull();
  });
});

describe('unservedVisions', () => {
  const NOW = '2026-11-23';
  test('a vision with only paused or achieved goals is unserved', () => {
    const v = mkV('Fit');
    goal({ visions: [v.id], status: 'paused' });
    goal({ visions: [v.id], status: 'achieved' });
    expect(unservedVisions([plan(db)], NOW).map(u => u.vision.id)).toEqual([v.id]);
  });
  test('one served through a narrower vision is not; goals in another plan count', () => {
    const top = mkV('Life'),
      narrow = mkV('Fit', [top]),
      other = mkV('Calm');
    const second = emptyDb();
    goal({ visions: [narrow.id] }, second);
    expect(unservedVisions([plan(db), plan(second, 'p2')], NOW).map(u => u.vision.id)).toEqual([other.id]);
  });
  test('the reached goal is named for 30 days, not on day 31', () => {
    const v = mkV('Fit');
    goal({ title: 'Older', visions: [v.id], status: 'achieved', achievedAt: '2026-10-01' });
    const g = goal({ title: 'Run 5 km', visions: [v.id], status: 'achieved', achievedAt: '2026-10-24' });
    expect(unservedVisions([plan(db)], NOW)[0].reached).toEqual({ goal: g, date: '2026-10-24' });
    expect(unservedVisions([plan(db)], '2026-11-24')[0].reached).toBeUndefined();
  });
  test('nothing at all without goals', () => {
    mkV('Fit');
    expect(unservedVisions([plan(db)], NOW)).toEqual([]);
  });
});
