import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from './memory-storage';
import { on } from './events';
import {
  JOURNAL_KEY,
  addReview,
  addSession,
  applyJournal,
  clearFocus,
  deleteReview,
  deleteSession,
  hasJournal,
  journal,
  loadJournal,
  setFocus,
  updateReview,
  updateSession,
} from './journal';
import { resetClock } from '../core/merge';

let storage: ReturnType<typeof memoryStorage>;
const stored = () => JSON.parse(storage.getItem(JOURNAL_KEY) as string);
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
  resetClock(); // stamps an earlier test saw are later than this test's clock
  loadJournal();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('journal store', () => {
  test('nothing stored: empty, and no journal to sync', () => {
    expect(journal).toEqual({ reviews: [], sessions: [], deleted: {} });
    expect(hasJournal()).toBe(false);
  });

  test('reviews: add stamps and stores; update stamps again; delete leaves a tombstone', () => {
    const saved = vi.fn();
    on('saved', saved);
    const r = addReview({ kind: 'week', period: '2026-W47', answers: { a: 1 } });
    expect(stored().reviews).toEqual([{ ...r, updatedAt: '2026-11-21T10:00:00.000Z' }]);
    expect(hasJournal()).toBe(true);
    vi.setSystemTime(new Date('2026-11-21T11:00:00Z'));
    updateReview(r.id, { answers: { a: 2 } });
    expect(stored().reviews[0]).toMatchObject({ answers: { a: 2 }, updatedAt: '2026-11-21T11:00:00.000Z' });
    deleteReview(r.id);
    expect(stored()).toMatchObject({ reviews: [], deleted: { [r.id]: '2026-11-21T11:00:00.000Z' } });
    expect(saved).toHaveBeenCalledTimes(3);
  });

  test('sessions: the same three; a review is not stamped when only a session changes', () => {
    const r = addReview({ kind: 'month', period: '2026-11', answers: {} });
    vi.setSystemTime(new Date('2026-11-22T10:00:00Z'));
    const s = addSession({ exercise: 'values', date: '2026-11-22', done: false, answers: {}, made: [] });
    updateSession(s.id, { done: true });
    expect(stored().reviews[0].updatedAt).toBe('2026-11-21T10:00:00.000Z');
    expect(stored().sessions[0]).toMatchObject({ done: true, updatedAt: '2026-11-22T10:00:00.000Z' });
    deleteSession(s.id);
    expect(stored().deleted).toEqual({ [s.id]: '2026-11-22T10:00:00.000Z' });
    expect(stored().reviews.map((x: { id: string }) => x.id)).toEqual([r.id]);
  });

  test('focus: set with the Monday of this week, cleared with a mark', () => {
    setFocus('p1', 'a1');
    expect(stored().focus).toEqual({ week: '2026-11-16', plan: 'p1', item: 'a1', at: '2026-11-21T10:00:00.000Z' });
    clearFocus();
    // A mark with its time, so another device's older choice does not come back on sync.
    expect(stored().focus).toEqual({ week: '2026-11-16', plan: '', item: '', at: '2026-11-21T10:00:00.000Z' });
  });

  test('a merged journal from sync is stored as it is, without new stamps', () => {
    const j = {
      reviews: [
        { id: 'r9', kind: 'year' as const, period: '2025', answers: {}, updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      sessions: [],
      deleted: {},
    };
    applyJournal(j);
    expect(stored()).toEqual(j);
    updateSession('none', {}); // an unknown id changes nothing, and stamps nothing
    expect(stored().reviews[0].updatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test('storage full: storageError, and the journal stays in memory', () => {
    const full = vi.fn();
    on('storageError', full);
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    addReview({ kind: 'week', period: '2026-W47', answers: {} });
    expect(full).toHaveBeenCalled();
    expect(journal.reviews).toHaveLength(1);
  });
});
