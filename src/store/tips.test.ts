import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from './memory-storage';
import { getTips, hasTips, saveTips, setTipsOff } from './tips';

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => vi.unstubAllGlobals());

describe('tips preference', () => {
  test('nothing stored: defaults, and no history yet', () => {
    expect(hasTips()).toBe(false);
    expect(getTips()).toEqual({ off: false, shown: {}, since: {} });
  });

  test('a save merges with what another tab stored', () => {
    saveTips({ ...getTips(), shown: { a: { n: 1, last: '2026-11-19', closed: true } } });
    // this tab still holds the copy from before the ×
    saveTips({ off: false, shown: { a: { n: 1, last: '2026-11-19' } }, since: {} });
    expect(getTips().shown.a.closed).toBe(true);
    expect(hasTips()).toBe(true);
  });

  test('the switch turns off and on again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
    setTipsOff(true);
    expect(getTips().off).toBe(true);
    vi.setSystemTime(new Date('2026-11-19T10:00:01Z'));
    setTipsOff(false);
    expect(getTips().off).toBe(false);
    vi.useRealTimers();
  });

  test('a broken stored value reads as the defaults', () => {
    storage.setItem('actionplan.v1.tips', '{broken');
    expect(getTips().off).toBe(false);
  });
});
