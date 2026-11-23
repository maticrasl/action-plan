import { describe, expect, test } from 'vitest';
import { mergeJournal, normalizeJournal, type Journal } from './journal';
import { itemContent, stampList } from './merge';

const T1 = '2026-11-01T10:00:00.000Z',
  T2 = '2026-11-02T10:00:00.000Z',
  T3 = '2026-11-03T10:00:00.000Z';
const review = (id: string, at: string, extra = {}) => ({
  id,
  kind: 'week' as const,
  period: '2026-W45',
  doneAt: at,
  answers: {},
  updatedAt: at,
  ...extra,
});
const journal = (over: Partial<Journal> = {}): Journal => ({ reviews: [], sessions: [], deleted: {}, ...over });

describe('normalizeJournal', () => {
  test('empty, missing or not an object: an empty journal', () => {
    for (const raw of [undefined, null, 'x', 5, [], {}]) expect(normalizeJournal(raw)).toEqual(journal());
  });

  test('wrong types and bad ids are dropped; unknown fields on items kept', () => {
    const j = normalizeJournal({
      reviews: [review('r1', T1, { later: 'kept' }), { id: 'bad id!' }, null, 'x', review('r2', T1, { kind: 'day' })],
      sessions: 'nope',
      focus: { week: 5 },
      deleted: [],
    });
    expect(j.reviews.map(r => r.id)).toEqual(['r1']);
    expect((j.reviews[0] as unknown as { later: string }).later).toBe('kept');
    expect(j).toMatchObject({ sessions: [], deleted: {} });
    expect(j.focus).toBeUndefined();
  });

  test('a valid focus and sessions are kept', () => {
    const focus = { week: '2026-11-16', plan: 'p1', item: 'a1', at: T1 };
    const s = { id: 's1', exercise: 'values', date: '2026-11-16', done: false, answers: {}, made: [] };
    expect(normalizeJournal({ sessions: [s], focus })).toEqual(journal({ sessions: [s], focus }));
    const cleared = { week: '2026-11-16', plan: '', item: '', at: T1 };
    expect(normalizeJournal({ focus: cleared }).focus).toEqual(cleared);
    expect(normalizeJournal({ focus: { ...cleared, plan: 'p1' } }).focus).toBeUndefined();
  });
});

describe('mergeJournal', () => {
  test('newer version wins; the same result both ways', () => {
    const a = journal({ reviews: [review('r1', T1, { answers: { q: 'old' } })] });
    const b = journal({ reviews: [review('r1', T2, { answers: { q: 'new' } })] });
    expect(mergeJournal(a, b).reviews[0].answers).toEqual({ q: 'new' });
    expect(mergeJournal(b, a)).toEqual(mergeJournal(a, b));
  });

  test('a deletion after the last change removes; a change after the deletion survives', () => {
    const kept = journal({ reviews: [review('r1', T1), review('r2', T3)], sessions: [] });
    const gone = journal({ deleted: { r1: T2, r2: T2 } });
    expect(mergeJournal(kept, gone).reviews.map(r => r.id)).toEqual(['r2']);
    expect(mergeJournal(kept, gone).deleted).toEqual({ r1: T2, r2: T2 });
  });

  test('two reviews of one period with different ids are both kept', () => {
    const m = mergeJournal(journal({ reviews: [review('r1', T1)] }), journal({ reviews: [review('r2', T2)] }));
    expect(m.reviews.map(r => r.id).sort()).toEqual(['r1', 'r2']);
  });

  test('focus: the one set later', () => {
    const f1 = { week: '2026-11-09', plan: 'p', item: 'a', at: T1 },
      f2 = { week: '2026-11-16', plan: 'p', item: 'b', at: T2 };
    expect(mergeJournal(journal({ focus: f1 }), journal({ focus: f2 })).focus).toEqual(f2);
    expect(mergeJournal(journal({ focus: f2 }), journal({ focus: f1 })).focus).toEqual(f2);
    expect(mergeJournal(journal({ focus: f1 }), journal()).focus).toEqual(f1);
  });

  test('one side missing or malformed counts as empty', () => {
    const a = journal({ reviews: [review('r1', T1)] });
    expect(mergeJournal(a, undefined)).toEqual(a);
    expect(mergeJournal('bad', a)).toEqual(a);
  });
});

describe('stampList', () => {
  test('stamps changed and new items, records deletions, forgets old tombstones', () => {
    const list = [
      { id: 'same', v: 1, updatedAt: T1 },
      { id: 'changed', v: 2, updatedAt: T1 },
      { id: 'new', v: 3 },
    ];
    const snapshot = new Map([
      ['same', itemContent({ id: 'same', v: 1 } as object)],
      ['changed', itemContent({ id: 'changed', v: 1 } as object)],
      ['gone', itemContent({ id: 'gone', v: 4 } as object)],
    ]);
    const deleted: Record<string, string> = { new: T1, ancient: '2020-01-01T00:00:00.000Z' };
    stampList(list, snapshot, deleted, T3);
    expect(list.map(x => x.updatedAt)).toEqual([T1, T3, T3]);
    expect(deleted).toEqual({ gone: T3 });
  });
});
