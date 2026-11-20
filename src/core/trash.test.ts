import { beforeEach, expect, test } from 'vitest';
import { emptyDb, type Activity, type Goal, type Vision } from './model';
import { db, setDb, setVisions, visions } from './state';
import {
  GONE_DAYS,
  TRASH_DAYS,
  addToTrash,
  forgetEntries,
  itemEntry,
  mergeTrash,
  normalizeTrash,
  planEntry,
  pruneTrash,
  restoreItem,
  restoreVision,
  visionEntry,
  type Trash,
  type TrashEntry,
} from './trash';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();
const entry = (id: string, deletedAt = daysAgo(1), title = 'x'): TrashEntry => ({
  id,
  kind: 'plan',
  title,
  plan: 'p',
  planName: 'P',
  deletedAt,
  payload: { data: emptyDb() },
});
const empty = (): Trash => ({ items: [], gone: {} });

beforeEach(() => {
  setDb(emptyDb());
  setVisions({ list: [], deleted: {} });
});
const goal = (id: string): Goal => {
  const g: Goal = { id, title: id, status: 'active' };
  db.goals.push(g);
  return g;
};
const act = (id: string): Activity => {
  const a: Activity = { id, title: id, status: 'todo' };
  db.activities.push(a);
  return a;
};
const vis = (id: string, parents: string[] = []): Vision => {
  const v: Vision = { id, title: id, parents };
  visions.list.push(v);
  return v;
};

test('normalize keeps valid entries and string times only', () => {
  const t = normalizeTrash({
    items: [entry('a'), { id: 5 }, null, { ...entry('b'), kind: 'nope' }],
    gone: { x: 'T', y: 3 },
  });
  expect(t.items.map(e => e.id)).toEqual(['a']);
  expect(t.gone).toEqual({ x: 'T' });
  expect(normalizeTrash(undefined)).toEqual(empty());
  expect(normalizeTrash('bad')).toEqual(empty());
});

test('expiry: 29 days kept, 31 dropped; gone remembered for 40 days', () => {
  const t = pruneTrash(
    {
      items: [entry('new', daysAgo(TRASH_DAYS - 1)), entry('old', daysAgo(TRASH_DAYS + 1))],
      gone: { g1: daysAgo(GONE_DAYS - 1), g2: daysAgo(GONE_DAYS + 1) },
    },
    NOW,
  );
  expect(t.items.map(e => e.id)).toEqual(['new']);
  expect(Object.keys(t.gone)).toEqual(['g1']);
});

test('merge: union of both, newest first; removed on either side stays removed', () => {
  const a = { items: [entry('1', daysAgo(3)), entry('2', daysAgo(2))], gone: {} };
  const b = { items: [entry('2', daysAgo(2)), entry('3', daysAgo(1))], gone: { 1: daysAgo(0) } };
  const m = mergeTrash(a, b, NOW);
  expect(m.items.map(e => e.id)).toEqual(['3', '2']);
  expect(Object.keys(m.gone)).toEqual(['1']);
  expect(mergeTrash(b, a, NOW)).toEqual(m);
  expect(mergeTrash(undefined, a, NOW).items).toHaveLength(2);
});

test('cap: oldest go first; one entry over the cap is refused', () => {
  const big = (id: string, at: string) => ({ ...entry(id, at), title: 'y'.repeat(300) });
  let t: Trash | null = empty();
  for (const [id, at] of [
    ['a', daysAgo(3)],
    ['b', daysAgo(2)],
    ['c', daysAgo(1)],
  ])
    t = addToTrash(t!, big(id, at), 1000);
  expect(t!.items.map(e => e.id)).toEqual(['c', 'b']);
  expect(addToTrash(empty(), { ...entry('z'), title: 'y'.repeat(1100) }, 1000)).toBeNull();
});

test('forgetEntries removes entries and remembers them as gone', () => {
  const t = forgetEntries({ items: [entry('a'), entry('b')], gone: {} }, ['a'], 'T');
  expect(t.items.map(e => e.id)).toEqual(['b']);
  expect(t.gone).toEqual({ a: 'T' });
});

test('an item comes back with its relations; missing ends and forbidden links are counted', () => {
  goal('g');
  act('a');
  act('b');
  act('gone');
  db.relations.push(
    { id: 'r1', from: 'a', to: 'g', type: 'contributes' },
    { id: 'r2', from: 'a', to: 'b', type: 'depends' },
    { id: 'r3', from: 'a', to: 'gone', type: 'depends' },
  );
  const e = itemEntry('activity', 'a', 'p', 'P')!;
  expect(e.payload).toMatchObject({ item: { id: 'a' } });
  expect((e.payload as { relations: unknown[] }).relations).toHaveLength(3);
  db.activities = db.activities.filter(x => x.id !== 'a' && x.id !== 'gone');
  db.relations = [{ id: 'r9', from: 'b', to: 'a2', type: 'depends' }];
  // b now depends on something; a → b is still allowed, a → gone has no end.
  const { id, lost } = restoreItem(e as TrashEntry & { kind: 'activity' });
  expect(id).toBe('a');
  expect(lost).toBe(1);
  expect(db.relations.map(r => r.id).sort()).toEqual(['r1', 'r2', 'r9']);
});

test('a taken id gets a new one and its relations follow; a loop is left out', () => {
  act('a');
  act('b');
  db.relations.push({ id: 'r1', from: 'a', to: 'b', type: 'depends' });
  const e = itemEntry('activity', 'a', 'p', 'P')!;
  db.relations = [{ id: 'r2', from: 'b', to: 'a', type: 'depends' }]; // a is still there: its id is taken
  const { id, lost } = restoreItem(e as TrashEntry & { kind: 'activity' });
  expect(id).not.toBe('a');
  expect(db.activities.filter(x => x.title === 'a')).toHaveLength(2);
  expect(lost).toBe(0);
  expect(db.relations.find(r => r.from === id)).toMatchObject({ to: 'b', type: 'depends' });

});

test('a link that would make a loop now is left out and counted', () => {
  act('a');
  act('b');
  act('c');
  db.relations.push({ id: 'r1', from: 'a', to: 'b', type: 'depends' }, { id: 'r2', from: 'c', to: 'a', type: 'depends' });
  const e = itemEntry('activity', 'a', 'p', 'P')!;
  db.activities = db.activities.filter(x => x.id !== 'a');
  db.relations = [{ id: 'r3', from: 'b', to: 'c', type: 'depends' }]; // with a back: a → b → c → a
  const { lost } = restoreItem(e as TrashEntry & { kind: 'activity' });
  expect(lost).toBe(1);
  expect(db.relations.map(r => r.id).sort()).toEqual(['r1', 'r3']);
});

test('a vision comes back with parents that exist; a child link that would loop is skipped', () => {
  vis('top');
  vis('v', ['top', 'missing']);
  vis('child', ['v']);
  vis('other');
  const e = visionEntry('v')!;
  expect(e.payload).toMatchObject({ children: ['child'] });
  visions.list = visions.list.filter(x => x.id !== 'v');
  visions.list.find(x => x.id === 'child')!.parents = [];
  // top now serves child, so child serving v (which serves top) would loop.
  visions.list.find(x => x.id === 'top')!.parents = ['child'];
  const { id, lost } = restoreVision(e as TrashEntry & { kind: 'vision' });
  expect(id).toBe('v');
  expect(visions.list.find(x => x.id === 'v')!.parents).toEqual(['top']);
  expect(visions.list.find(x => x.id === 'child')!.parents).toEqual([]);
  expect(lost).toBe(2); // the missing parent, and child → v (v → top → child)
});

test('a plan entry holds the whole plan', () => {
  const d = emptyDb();
  d.goals.push({ id: 'g', title: 'G', status: 'active' });
  const e = planEntry('p1', 'House', d);
  expect(e).toMatchObject({ kind: 'plan', title: 'House', plan: 'p1', payload: { data: { goals: [{ id: 'g' }] } } });
  d.goals.length = 0;
  expect((e.payload as { data: typeof d }).data.goals).toHaveLength(1); // a copy
});
