import { expect, test } from 'vitest';
import { mergeStores } from '../core/merge';
import { emptyDb } from '../core/model';
import { SYNC_FORMAT, SYNC_VERSION, SyncError, parseStore, toFile } from './drive';

// Ported from tests/more.js "sync file: parsing and starter plans" (its parsing; the starter plans and
// applying a store are checked in the page, as sync.ts runs only there).

test('files that are not a sync file are refused', () => {
  const code = (text: string) => {
    try {
      parseStore(text);
      return 'parsed';
    } catch (e) {
      return e instanceof SyncError ? e.code : 'other:' + e;
    }
  };
  expect(
    [
      'nope',
      JSON.stringify({ format: 'other', plans: { list: [] } }),
      JSON.stringify({ format: SYNC_FORMAT, plans: {} }),
    ].map(code),
  ).toEqual(['error', 'error', 'error']);
});

test('invalid plan entries are dropped, plan data and deletions normalized', () => {
  const st = parseStore(
    JSON.stringify({
      format: SYNC_FORMAT,
      plans: { list: [{ id: 'a', name: 'A' }, { id: 5 }, null, { id: 'b' }], deleted: 'x' },
      data: { a: { goals: 'bad' } },
    }),
  );
  expect(st.plans.list.map(p => p.id)).toEqual(['a']);
  expect(st.data.a).toEqual(emptyDb());
  expect(st.plans.deleted).toEqual({});
});

test('tips: read from the file when present, left out of the file when there are none', () => {
  const base = { format: SYNC_FORMAT, plans: { list: [] } };
  expect(parseStore(JSON.stringify(base)).tips).toBeUndefined();
  const st = parseStore(JSON.stringify({ ...base, tips: { off: true, shown: { k: { n: 1, last: '2026-11-19' } } } }));
  expect(st.tips).toMatchObject({ off: true, shown: { k: { n: 1, last: '2026-11-19' } } });
  expect(toFile(st)).toHaveProperty('tips.off', true);
  expect(toFile({ ...st, tips: undefined })).not.toHaveProperty('tips');
});

test('a sync file from a newer version is refused with update; this version writes its own', () => {
  const file = (version: number) => JSON.stringify({ format: SYNC_FORMAT, version, plans: { list: [] } });
  expect(() => parseStore(file(SYNC_VERSION + 1))).toThrow(expect.objectContaining({ code: 'update' }));
  expect(parseStore(file(SYNC_VERSION)).plans.list).toEqual([]);
  expect(parseStore(file(1)).plans.list).toEqual([]);
  expect(toFile(parseStore(file(1))).version).toBe(SYNC_VERSION);
  expect(SYNC_VERSION).toBe(3);
});

test('trash: read from the file when present, merged, left out when there is none', () => {
  const base = { format: SYNC_FORMAT, plans: { list: [] } };
  expect(parseStore(JSON.stringify(base)).trash).toBeUndefined();
  const at = new Date().toISOString();
  const e = { id: 'e1', kind: 'plan', title: 'P', plan: 'p', planName: 'P', deletedAt: at, payload: { data: {} } };
  const st = parseStore(JSON.stringify({ ...base, trash: { items: [e, { bad: 1 }], gone: { e0: at } } }));
  expect(st.trash).toEqual({ items: [e], gone: { e0: at } });
  expect(toFile(st)).toHaveProperty('trash.items.0.id', 'e1');
  expect(toFile({ ...st, trash: undefined })).not.toHaveProperty('trash');
  const other = parseStore(JSON.stringify({ ...base, trash: { items: [], gone: { e1: at } } }));
  expect(mergeStores(st, other).trash).toEqual({ items: [], gone: { e0: at, e1: at } });
  expect(mergeStores(st, parseStore(JSON.stringify(base))).trash!.items).toHaveLength(1);
  expect(mergeStores(parseStore(JSON.stringify(base)), parseStore(JSON.stringify(base)))).not.toHaveProperty('trash');
});

test('mapFold: read from the file when present, later change wins, left out when there is none', () => {
  const base = { format: SYNC_FORMAT, plans: { list: [] } };
  expect(parseStore(JSON.stringify(base)).mapFold).toBeUndefined();
  const st = parseStore(JSON.stringify({ ...base, mapFold: { kinds: ['goal', 'bad'], at: '2026-11-20T10:00:00Z' } }));
  expect(st.mapFold).toEqual({ kinds: ['goal'], at: '2026-11-20T10:00:00Z' });
  expect(toFile(st)).toHaveProperty('mapFold.kinds', ['goal']);
  expect(toFile({ ...st, mapFold: undefined })).not.toHaveProperty('mapFold');
  const other = parseStore(JSON.stringify({ ...base, mapFold: { kinds: [], at: '2026-11-20T11:00:00Z' } }));
  expect(mergeStores(st, other).mapFold!.kinds).toEqual([]);
  expect(mergeStores(st, parseStore(JSON.stringify(base))).mapFold!.kinds).toEqual(['goal']);
  expect(mergeStores(parseStore(JSON.stringify(base)), parseStore(JSON.stringify(base)))).not.toHaveProperty('mapFold');
});

test('journal: version 3 carries it; read when present, left out when there is none', () => {
  expect(SYNC_VERSION).toBe(3);
  const journal = {
    reviews: [{ id: 'r1', kind: 'week', period: '2026-W47', answers: { a: 1 }, updatedAt: '2026-11-20T10:00:00.000Z' }],
    sessions: [],
    deleted: { old: '2026-11-01T10:00:00.000Z' },
  };
  const st = parseStore(JSON.stringify({ format: SYNC_FORMAT, version: 3, plans: { list: [] }, journal }));
  expect(st.journal).toEqual(journal);
  expect(toFile(st).journal).toEqual(journal);
  const none = parseStore(JSON.stringify({ format: SYNC_FORMAT, version: 2, plans: { list: [] } }));
  expect('journal' in none).toBe(false);
  expect('journal' in toFile(none)).toBe(false);
  expect(mergeStores(none, st).journal).toEqual(journal);
});
