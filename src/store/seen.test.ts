import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from './memory-storage';
import { getSeen, markSeen } from './seen';

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('seen', () => {
  test('nothing seen yet', () => {
    expect(getSeen()).toEqual({});
  });
  test('marks merge with what was seen before', () => {
    markSeen({ exported: true });
    markSeen({ lastReview: '2026-11-18' });
    expect(getSeen()).toEqual({ exported: true, lastReview: '2026-11-18' });
    expect(JSON.parse(storage.getItem('actionplan.v1.seen')!)).toEqual(getSeen());
  });
  test('a stored value that is not an object reads as nothing seen', () => {
    for (const bad of ['[1]', '"x"', 'null', '{broken']) {
      storage.setItem('actionplan.v1.seen', bad);
      expect(getSeen(), bad).toEqual({});
    }
  });
  test('fields of the wrong type are left out', () => {
    storage.setItem('actionplan.v1.seen', JSON.stringify({ exported: 'yes', lastReview: 5, other: 1 }));
    expect(getSeen()).toEqual({ other: 1 });
  });
});
