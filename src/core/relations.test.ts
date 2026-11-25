import { beforeEach, describe, expect, test } from 'vitest';
import { t } from '../i18n/index';
import { emptyDb, type Activity, type Goal, type RelType, type State } from './model';
import {
  addRelation,
  ancestors,
  canRelate,
  chainOf,
  deletesWith,
  descendants,
  findEntity,
  kindList,
  possibleTypes,
  relLabel,
  relsFrom,
} from './relations';
import { db, setDb, setVisions } from './state';

// Ported from tests/test.js "canRelate rules" and tests/more.js "relation rules: cycles, one parent…",
// "relation rules: no dependency up or down a parent line…" and the rule part of "nothing depends on a routine".

let n = 0;
const goal = (p: Partial<Goal> = {}): Goal => {
  const x: Goal = { id: `g${++n}`, title: 'goal', status: 'active', ...p };
  db.goals.push(x);
  return x;
};
const act = (p: Partial<Activity> = {}): Activity => {
  const x: Activity = { id: `a${++n}`, title: 'activity', status: 'todo', ...p };
  db.activities.push(x);
  return x;
};
const state = (p: Partial<State> = {}): State => {
  const x: State = { id: `s${++n}`, title: 'state', description: '', value: '', history: [], ...p };
  db.states.push(x);
  return x;
};
const rel = (a: { id: string }, b: { id: string }, type: RelType) => expect(addRelation(a.id, b.id, type)).toBeNull();

beforeEach(() => {
  setDb(emptyDb());
  setVisions({ list: [], deleted: {} });
});

test('findEntity finds goals, states, activities and visions, with their kind', () => {
  const g = goal(),
    s = state(),
    a = act();
  setVisions({ list: [{ id: 'v', title: 'V', parents: [] }], deleted: {} });
  expect([g.id, s.id, a.id, 'v', 'nothing'].map(id => findEntity(id)?.kind ?? null)).toEqual([
    'goal',
    'state',
    'activity',
    'vision',
    null,
  ]);
});

describe('allowed pairs and directions', () => {
  test('unknown ends or types, itself, and the kinds each type links', () => {
    const g1 = goal(),
      a1 = act(),
      s1 = state();
    expect(canRelate(g1.id, g1.id, 'subgoal')).toBe(t('err.self'));
    expect(canRelate(s1.id, g1.id, 'contributes')).toBe(
      t('err.relFrom', { rel: relLabel('contributes'), kind: kindList(['activity']) }),
    );
    expect(canRelate(a1.id, s1.id, 'depends')).toBe(
      t('err.relTo', { rel: relLabel('depends'), kind: kindList(['activity']) }),
    );
    expect(canRelate(a1.id, g1.id, 'nope' as RelType)).toBe(t('err.unknown'));
    expect(canRelate(a1.id, 'ghost', 'contributes')).toBe(t('err.unknown'));
  });

  test('depends stays within a kind; improves and measures have one direction', () => {
    const g1 = goal(),
      a1 = act(),
      s1 = state();
    expect(canRelate(g1.id, a1.id, 'depends')).toBe(
      t('err.relTo', { rel: relLabel('depends'), kind: kindList(['goal']) }),
    );
    rel(a1, s1, 'improves');
    rel(s1, g1, 'measures');
    expect(canRelate(s1.id, a1.id, 'improves')).toBe(
      t('err.relFrom', { rel: relLabel('improves'), kind: kindList(['activity']) }),
    );
    expect(canRelate(g1.id, s1.id, 'measures')).not.toBeNull();
  });
});

describe('loops, one parent, duplicates', () => {
  test('a long depends loop, a duplicate, one parent, parent and sub-goal loops', () => {
    const [g1, g2, g3] = [goal(), goal(), goal()];
    const [a1, a2, a3] = [act(), act(), act()];
    rel(a1, a2, 'depends');
    rel(a2, a3, 'depends');
    expect(canRelate(a3.id, a1.id, 'depends')).toBe(t('err.cycle'));
    expect(canRelate(a1.id, a2.id, 'depends')).toBe(t('err.relExists'));
    rel(a1, a3, 'subactivity');
    expect(canRelate(a1.id, a2.id, 'subactivity')).toBe(t('err.oneParent'));
    expect(canRelate(a3.id, a1.id, 'subactivity')).toBe(t('err.cycle'));
    rel(g2, g1, 'subgoal');
    rel(g3, g2, 'subgoal');
    expect(canRelate(g1.id, g3.id, 'subgoal')).toBe(t('err.cycle'));
    expect(ancestors(g3.id, 'subgoal')).toEqual([g2.id, g1.id]);
    expect(descendants(g1.id, 'subgoal')).toEqual([g2.id, g3.id]);
  });
});

describe('no dependency up or down a parent line, and no item waits for itself', () => {
  test('parent and sub-items, either way, at any depth; siblings and others are fine', () => {
    const [p, c, gc, x] = [act(), act(), act(), act()];
    rel(c, p, 'subactivity');
    rel(gc, c, 'subactivity');
    const line = t('err.lineDep');
    expect([
      canRelate(p.id, c.id, 'depends'),
      canRelate(p.id, gc.id, 'depends'),
      canRelate(c.id, p.id, 'depends'),
      canRelate(gc.id, p.id, 'depends'),
    ]).toEqual([line, line, line, line]);
    const sib = act();
    rel(sib, p, 'subactivity');
    expect([
      canRelate(c.id, sib.id, 'depends'),
      canRelate(gc.id, sib.id, 'depends'),
      canRelate(c.id, x.id, 'depends'),
    ]).toEqual([null, null, null]);
    expect(possibleTypes(p.id, c.id)).not.toContain('depends');
    expect(possibleTypes(c.id, p.id)).not.toContain('depends');
  });

  test('a new parent line over a dependency that already links its two ends', () => {
    const [u, v, w] = [act(), act(), act()];
    rel(w, v, 'subactivity');
    rel(w, u, 'depends');
    expect(canRelate(v.id, u.id, 'subactivity')).toBe(t('err.lineDep'));
    const z = act();
    rel(v, z, 'depends');
    expect(canRelate(z.id, w.id, 'subactivity')).toBe(t('err.lineDep'));
  });

  test('waiting for itself through a chain, or as a sub-activity of what waits for it', () => {
    const [p, c, gc, x, y] = [act(), act(), act(), act(), act()];
    rel(c, p, 'subactivity');
    rel(gc, c, 'subactivity');
    rel(x, gc, 'depends');
    expect(canRelate(p.id, x.id, 'depends')).toBe(t('err.selfBlock'));
    const q = act();
    rel(y, q, 'depends');
    rel(q, x, 'depends');
    expect(canRelate(x.id, y.id, 'subactivity')).toBe(t('err.selfBlock'));
    expect(db.relations.some(r => r.id === '')).toBe(false); // the trial link is taken out again
  });

  test('goals follow the same rule', () => {
    const g1 = goal(),
      g2 = goal();
    rel(g2, g1, 'subgoal');
    expect([canRelate(g1.id, g2.id, 'depends'), canRelate(g2.id, g1.id, 'depends')]).toEqual([
      t('err.lineDep'),
      t('err.lineDep'),
    ]);
  });
});

describe('nothing depends on a routine', () => {
  test('an activity or a routine waiting for a routine is refused; everything else stays', () => {
    const routine = (p: Partial<Activity> = {}) =>
      act({ repeat: { every: 1, unit: 'week', times: 2 }, checkins: {}, startDate: '2026-11-09', ...p });
    const a = act(),
      b = act(),
      r = routine(),
      r2 = routine();
    const g = goal(),
      g2 = goal();
    const err = t('err.dependsRoutine');
    expect([canRelate(a.id, r.id, 'depends'), canRelate(r2.id, r.id, 'depends')]).toEqual([err, err]);
    expect([
      canRelate(r.id, a.id, 'depends'),
      canRelate(a.id, b.id, 'depends'),
      canRelate(g.id, g2.id, 'depends'),
    ]).toEqual([null, null, null]);
    expect([canRelate(a.id, r.id, 'subactivity'), canRelate(r.id, a.id, 'subactivity')]).toEqual([null, null]);
    expect(addRelation(a.id, r.id, 'depends')).toBe(err);
    expect(relsFrom(a.id)).toEqual([]);
  });
});

describe('chainOf', () => {
  const l = (id: string, from: string, to: string, type = 'contributes') => ({ id, from, to, type });
  test('everything that leads to the item and everything it leads to, with the lines between', () => {
    // a → g → v, b → a, x → g2 (unrelated), c → v (shares v but not a chain through g)
    const rels = [l('1', 'a', 'g'), l('2', 'g', 'v'), l('3', 'b', 'a'), l('4', 'x', 'g2'), l('5', 'c', 'v')];
    const { nodes, links } = chainOf('a', rels);
    expect([...nodes].sort()).toEqual(['a', 'b', 'g', 'v']);
    expect([...links].sort()).toEqual(['1', '2', '3']);
  });
  test('a dependency counts the other way: what an item waits for leads to it', () => {
    // g depends on p (p must come first), p contributes nothing else
    const { nodes } = chainOf('p', [l('1', 'g', 'p', 'depends'), l('2', 'g', 'v')]);
    expect([...nodes].sort()).toEqual(['g', 'p', 'v']);
  });
  test('nothing selected, or a loop, ends cleanly', () => {
    expect(chainOf(null, [l('1', 'a', 'b')]).nodes.size).toBe(0);
    const { nodes, links } = chainOf('a', [l('1', 'a', 'b'), l('2', 'b', 'a')]);
    expect([nodes.size, links.size]).toEqual([2, 2]);
  });
});

describe('deletesWith: what goes with a deleted goal or activity', () => {
  test('a goal takes its activities and their sub-activities, all the way down', () => {
    const g = goal(),
      a = act(),
      b = act(),
      a1 = act(),
      a11 = act();
    rel(a, g, 'contributes');
    rel(b, g, 'contributes');
    rel(a1, a, 'subactivity');
    rel(a11, a1, 'subactivity');
    expect(deletesWith(g.id)).toEqual({ gone: [a.id, b.id, a1.id, a11.id], shared: 0 });
  });

  test('an activity takes its sub-activities; nothing for one without any', () => {
    const a = act(),
      a1 = act(),
      other = act();
    rel(a1, a, 'subactivity');
    expect(deletesWith(a.id)).toEqual({ gone: [a1.id], shared: 0 });
    expect(deletesWith(other.id)).toEqual({ gone: [], shared: 0 });
    expect(deletesWith('missing')).toEqual({ gone: [], shared: 0 });
  });

  test('an activity that also serves another goal stays, and so do the ones under it', () => {
    const g = goal(),
      g2 = goal(),
      solo = act(),
      both = act(),
      under = act();
    rel(solo, g, 'contributes');
    rel(both, g, 'contributes');
    rel(both, g2, 'contributes');
    rel(under, both, 'subactivity');
    // Both stay: the shared one, and the one under it, which hangs off it.
    expect(deletesWith(g.id)).toEqual({ gone: [solo.id], shared: 2 });
  });

  test('a sub-activity that also serves a goal of its own stays', () => {
    const g = goal(),
      a = act(),
      a1 = act();
    rel(a1, a, 'subactivity');
    rel(a1, g, 'contributes');
    expect(deletesWith(a.id)).toEqual({ gone: [], shared: 1 });
  });
});
