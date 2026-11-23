import { beforeEach, describe, expect, test } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type RelType, type Vision } from './model';
import { setDb, setVisions, visions } from './state';
import { areaKey, areaReport, areaSentences, emptyAreas, goalAreas, renameGoals, renameVisions } from './areas';
import type { PlanSource } from './today';

const NOW = '2026-11-23';
let n = 0;
const mkV = (title: string, area?: string): Vision => {
  const v: Vision = { id: `v${++n}`, title, parents: [], ...(area !== undefined ? { area } : {}) };
  visions.list.push(v);
  return v;
};
const goal = (data: Db, p: Partial<Goal> = {}, vs: Vision[] = []): Goal => {
  const g: Goal = {
    id: `g${++n}`,
    title: 'goal',
    status: 'active',
    ...(vs.length ? { visions: vs.map(v => v.id) } : {}),
    ...p,
  };
  data.goals.push(g);
  return g;
};
const rel = (data: Db, a: { id: string }, b: { id: string }, type: RelType) =>
  data.relations.push({ id: `r${++n}`, from: a.id, to: b.id, type });
const step = (data: Db, goals: Goal[], doneAt?: string, p: Partial<Activity> = {}): Activity => {
  const a: Activity = {
    id: `a${++n}`,
    title: 'step',
    status: doneAt ? 'done' : 'todo',
    ...(doneAt ? { doneAt } : {}),
    ...p,
  };
  data.activities.push(a);
  goals.forEach(g => rel(data, a, g, 'contributes'));
  return a;
};
const src = (data: Db, plan = 'p1'): PlanSource => ({ plan, data });
const block = (r: ReturnType<typeof areaReport>, name: string) => r.blocks.find(b => b.name === name);

let A: Db;
beforeEach(() => {
  A = emptyDb();
  setDb(A);
  setVisions({ list: [], deleted: {} });
});

describe('goalAreas', () => {
  test('from its visions, its parent goal, its category, or none', () => {
    const fit = mkV('Fit', 'Health'),
      rich = mkV('Rich', ' Finance ');
    const g = goal(A, { category: 'Career' }, [fit, rich]);
    const sub = goal(A);
    rel(A, sub, g, 'subgoal');
    expect(goalAreas(g, A)).toEqual(['Health', 'Finance']);
    expect(goalAreas(sub, A)).toEqual(['Health', 'Finance']);
    expect(goalAreas(goal(A, { category: ' Career ' }), A)).toEqual(['Career']);
    expect(goalAreas(goal(A, {}, [mkV('Vague')]), A)).toEqual([]);
  });
  test('names compare ignoring case and spaces; the first spelling is shown', () => {
    expect(areaKey(' HEALTH ')).toBe('health');
    mkV('One', 'health');
    mkV('Two', ' Health ');
    mkV('Three', 'HEALTH');
    const r = areaReport([src(A)], NOW);
    expect(r.blocks.map(b => b.name)).toEqual(['health']);
    expect(r.blocks[0].visions).toHaveLength(3);
  });
});

describe('effort', () => {
  test('a step done 29 days ago counts, 30 does not; undone steps do not', () => {
    const g = goal(A, {}, [mkV('Fit', 'Health')]);
    step(A, [g], '2026-10-25');
    step(A, [g], '2026-10-24');
    step(A, [g]);
    expect(block(areaReport([src(A)], NOW), 'Health')!.effort).toBe(1);
  });
  test('list items count one each; routine days count per ticked day', () => {
    const g = goal(A, {}, [mkV('Fit', 'Health')]);
    step(A, [g], undefined, {
      list: [
        { id: 'i1', text: 'a', done: true, doneAt: '2026-11-20' },
        { id: 'i2', text: 'b', done: true, doneAt: '2026-11-21' },
        { id: 'i3', text: 'c', done: false },
      ],
    });
    step(A, [g], undefined, {
      repeat: { every: 1, unit: 'day' },
      checkins: { '2026-11-20': 1, '2026-11-21': 0, '2026-11-22': 1, '2026-09-01': 1 },
    });
    expect(block(areaReport([src(A)], NOW), 'Health')!.effort).toBe(4);
  });
  test('a step for two goals counts for both; a goal and its sub-goal in one area count once', () => {
    const h = goal(A, {}, [mkV('Fit', 'Health')]),
      f = goal(A, {}, [mkV('Rich', 'Finance')]),
      sub = goal(A);
    rel(A, sub, h, 'subgoal');
    step(A, [h, f], NOW);
    step(A, [sub], NOW);
    const r = areaReport([src(A)], NOW);
    expect(block(r, 'Health')!.effort).toBe(2);
    expect(block(r, 'Finance')!.effort).toBe(1);
  });
  test('a goal in two areas gives half to each; shares sum to 100', () => {
    const both = goal(A, {}, [mkV('Fit', 'Health'), mkV('Rich', 'Finance')]),
      h = goal(A, {}, [mkV('Run', 'Health')]);
    step(A, [both], NOW);
    step(A, [h], NOW);
    const r = areaReport([src(A)], NOW);
    expect(block(r, 'Health')!.share).toBeCloseTo(75);
    expect(block(r, 'Finance')!.share).toBeCloseTo(25);
    expect(r.blocks.reduce((s, b) => s + b.share, 0) + (r.none?.share ?? 0)).toBeCloseTo(100);
  });
  test('paused goals do not count; achieved ones count until the day they were achieved', () => {
    const v = mkV('Fit', 'Health');
    step(A, [goal(A, { status: 'paused' }, [v])], NOW);
    const done = goal(A, { status: 'achieved', achievedAt: '2026-11-10' }, [v]);
    step(A, [done], '2026-11-10');
    step(A, [done], '2026-11-11');
    const b = block(areaReport([src(A)], NOW), 'Health')!;
    expect(b.effort).toBe(1);
    expect(b.goals).toBe(0);
  });
  test('goals of all plans count; goals without an area go to No area', () => {
    const B = emptyDb(),
      v = mkV('Fit', 'Health');
    step(B, [goal(B, {}, [v])], NOW);
    step(A, [goal(A)], NOW);
    const r = areaReport([src(A), src(B, 'p2')], NOW);
    expect(block(r, 'Health')).toMatchObject({ effort: 1, goals: 1 });
    expect(r.none).toMatchObject({ effort: 1, goals: 1, visions: [] });
  });
  test('order: by effort, then by name; No area apart', () => {
    mkV('a', 'Travel');
    mkV('b', 'Home');
    step(A, [goal(A, {}, [mkV('c', 'Learning')])], NOW);
    mkV('d');
    const r = areaReport([src(A)], NOW);
    expect(r.blocks.map(b => b.name)).toEqual(['Learning', 'Home', 'Travel']);
    expect(r.none!.visions).toHaveLength(1);
  });
  test('nothing at all: no blocks and no No area', () => {
    expect(areaReport([src(A)], NOW)).toMatchObject({ blocks: [], none: null, total: 0 });
  });
});

describe('areaSentences', () => {
  test('most effort only with two areas with visions and more than half', () => {
    const h = goal(A, {}, [mkV('Fit', 'Health')]);
    step(A, [h], NOW);
    expect(areaSentences(areaReport([src(A)], NOW))).toEqual([]);
    const f = goal(A, {}, [mkV('Rich', 'Finance')]);
    step(A, [f], NOW);
    expect(areaSentences(areaReport([src(A)], NOW))).toEqual([]); // 50 % is not more than half
    step(A, [h], NOW);
    expect(areaSentences(areaReport([src(A)], NOW))).toEqual([{ key: 'most', area: 'Health' }]);
  });
  test('a vision with no active goal, the first by name and how many more; at most two, in order', () => {
    const h = goal(A, {}, [mkV('Fit', 'Health')]);
    step(A, [h], NOW);
    step(A, [h], NOW);
    mkV('Kids', 'Relationships');
    mkV('Trips', 'Travel');
    mkV('Bare');
    expect(areaSentences(areaReport([src(A)], NOW))).toEqual([
      { key: 'most', area: 'Health' },
      { key: 'unserved', area: 'Relationships', more: 1 },
    ]);
  });
  test('quiet: active goals and nothing ticked', () => {
    goal(A, {}, [mkV('Fit', 'Health')]);
    expect(areaSentences(areaReport([src(A)], NOW))).toEqual([{ key: 'quiet' }]);
    A.goals[0].status = 'paused';
    expect(areaSentences(areaReport([src(A)], NOW))).toEqual([{ key: 'unserved', area: 'Health', more: 0 }]);
  });
});

describe('emptyAreas', () => {
  test('suggestions no vision or goal uses, leaving out hidden ones', () => {
    mkV('Fit', 'health');
    goal(A, { category: 'Career' });
    const r = areaReport([src(A)], NOW);
    expect(emptyAreas(['Health', 'Finance', 'Career', 'Home'], r, [' HOME'])).toEqual(['Finance']);
  });
});

describe('rename', () => {
  test('every vision and every matching goal category in two plans; others stay', () => {
    const B = emptyDb();
    const v1 = mkV('Fit', 'health '),
      v2 = mkV('Rich', 'Finance');
    const g1 = goal(A, { category: 'Health' }),
      g2 = goal(B, { category: 'HEALTH' }),
      g3 = goal(B, { category: 'Healthy' });
    expect(renameVisions(visions.list, 'Health', 'Wellbeing')).toBe(1);
    expect(renameGoals(A, 'Health', 'Wellbeing') + renameGoals(B, 'Health', 'Wellbeing')).toBe(2);
    expect([v1.area, v2.area, g1.category, g2.category, g3.category]).toEqual([
      'Wellbeing',
      'Finance',
      'Wellbeing',
      'Wellbeing',
      'Healthy',
    ]);
  });
});
