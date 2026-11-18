import { describe, expect, test } from 'vitest';
import type { RelType } from '../../core/model';
import { layoutMap, type MapItems, type MapLink } from './layout';

// Ported from tests/more.js "goals by deadline: … the map ignores dates" (its map half), which drew the map
// and read the boxes' places off the page. Here the layout is called as renderMap calls it: the items in the
// order the plan holds them, its relationships, then a line from each goal to each vision it serves.

const rel = (from: string, to: string, type: RelType): MapLink => ({ id: `${from}>${to}`, from, to, type });
const serves = (goal: string, vision: string): MapLink => ({
  id: `vl~${goal}~${vision}`,
  from: goal,
  to: vision,
  type: 'serves',
});
const ids = (...list: string[]) => list.map(id => ({ id }));

// The centre of each box, rounded, by id.
function places(items: MapItems, rels: MapLink[]) {
  const { node } = layoutMap(items, rels);
  return Object.fromEntries(Object.values(node).map(n => [n.id, Math.round(n.x)]));
}
const between = (x: Record<string, number>, mid: string, a: string, b: string) =>
  Math.min(x[a], x[b]) < x[mid] && x[mid] < Math.max(x[a], x[b]);

describe('map layout', () => {
  test("a goal's activities and states stay with it; dates play no part", () => {
    const goals = [
      { id: 'none' },
      { id: 'late', deadline: '2026-03-01' },
      { id: 'soon', deadline: '2026-01-10' },
      { id: 'mid', deadline: '2026-02-01' },
    ];
    const rels = [rel('a', 'mid', 'contributes'), rel('s', 'mid', 'measures')];
    const x = places({ goal: goals, activity: ids('a'), state: ids('s') }, rels);
    const nearest = (b: string) =>
      ['soon', 'mid', 'late', 'none'].reduce((m, g) => (Math.abs(x[g] - x[b]) < Math.abs(x[m] - x[b]) ? g : m));
    expect([nearest('a'), nearest('s')]).toEqual(['mid', 'mid']);
    // Other deadlines leave every box where it was.
    const moved = goals.map(g =>
      g.id === 'soon' ? { ...g, deadline: '2026-11-01' } : g.id === 'none' ? { ...g, deadline: '2026-01-02' } : g,
    );
    expect(places({ goal: moved, activity: ids('a'), state: ids('s') }, rels)).toEqual(x);
    // The places as drawn now, pinned.
    expect(x).toEqual({ none: 106, late: 296, soon: 486, mid: 676, a: 613, s: 722 });
  });

  test('linked boxes start side by side: goals sharing an activity keep a sub-goal from between them', () => {
    const rels = [
      rel('sub', 'top', 'subgoal'),
      rel('shared', 'early', 'contributes'),
      rel('shared', 'later', 'contributes'),
    ];
    const x = places({ goal: ids('top', 'sub', 'early', 'later'), activity: ids('shared') }, rels);
    expect(between(x, 'sub', 'early', 'later')).toBe(false);
    // The places as drawn now, pinned.
    expect(x).toEqual({ top: 106, sub: 106, early: 296, later: 486, shared: 391 });
  });

  test('lines to visions cross least: a goal serving another vision moves out from between two that share one', () => {
    const rels = [serves('soon', 'v1'), serves('mid', 'v2'), serves('late', 'v1')];
    const x = places({ vision: ids('v1', 'v2'), goal: ids('soon', 'mid', 'late', 'free') }, rels);
    const seg = (g: string, v: string) => [x[g], x[v]];
    const cross = (a: number[], b: number[]) => (a[0] - b[0]) * (a[1] - b[1]) < 0;
    const [s, m, l] = [seg('soon', 'v1'), seg('mid', 'v2'), seg('late', 'v1')];
    expect([cross(s, m), cross(m, l), cross(s, l)]).toEqual([false, false, false]);
    expect(between(x, 'mid', 'soon', 'late')).toBe(false);
    // The places as drawn now, pinned.
    expect(x).toEqual({ v1: 201, v2: 486, soon: 106, mid: 486, late: 296, free: 694 });
  });

  test("an unavoidable crossing falls on the activities' lines, not on those to the visions", () => {
    const rels = [
      rel('a12', 'g1', 'contributes'),
      rel('a12', 'g2', 'contributes'),
      rel('a23', 'g2', 'contributes'),
      rel('a23', 'g3', 'contributes'),
      serves('g1', 'v1'),
      serves('g2', 'v2'),
      serves('g3', 'v1'),
    ];
    const x = places({ vision: ids('v1', 'v2'), goal: ids('g1', 'g2', 'g3'), activity: ids('a12', 'a23') }, rels);
    expect(between(x, 'g2', 'g1', 'g3')).toBe(false);
    // The places as drawn now, pinned.
    expect(x).toEqual({ v1: 201, v2: 486, g1: 106, g2: 486, g3: 296, a12: 249, a23: 439 });
  });
});
