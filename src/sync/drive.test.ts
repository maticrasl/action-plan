import { expect, test } from 'vitest';
import { emptyDb } from '../core/model';
import { SYNC_FORMAT, SyncError, parseStore } from './drive';

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
