import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { memoryStorage } from './memory-storage';
import { forgetWalk, getWalk, setWalk } from './walk';
import { getSeen, markDay, markView } from './seen';
import { prefs } from './prefs';

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  forgetWalk();
});
afterEach(() => vi.unstubAllGlobals());

const on = { state: 'on' as const, started: '2026-11-10', done: {}, skipped: [] };

describe('walk state', () => {
  test('nothing stored reads as off, and nothing is written', () => {
    expect(getWalk().state).toBe('off');
    expect(storage.length).toBe(0);
  });

  test('a tick another tab saved is kept when this tab saves', () => {
    setWalk({ ...on, done: { goal: '2026-11-10' } });
    // The other tab writes its own tick straight to storage.
    prefs.set('walk', { ...on, done: { goal: '2026-11-10', steps: '2026-11-11' } });
    expect(getWalk().done).toEqual({ goal: '2026-11-10', steps: '2026-11-11' });
    setWalk({ ...getWalk(), done: { ...getWalk().done, state: '2026-11-12' } });
    expect(prefs.get<{ done: object }>('walk').done).toEqual({
      goal: '2026-11-10',
      steps: '2026-11-11',
      state: '2026-11-12',
    });
  });

  test('storage full: the card keeps its state for the session', () => {
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    setWalk({ ...on, done: { goal: '2026-11-10' } });
    expect(getWalk()).toMatchObject({ state: 'on', done: { goal: '2026-11-10' } });
  });

  test('another user starts from what they stored', () => {
    setWalk(on);
    forgetWalk();
    storage.removeItem('actionplan.v1.walk');
    expect(getWalk().state).toBe('off');
  });
});

describe('seen', () => {
  test('days: each once, sorted, the last 30', () => {
    markDay('2026-11-12');
    markDay('2026-11-10');
    markDay('2026-11-12');
    expect(getSeen().days).toEqual(['2026-11-10', '2026-11-12']);
    for (let i = 1; i <= 31; i++) markDay(`2026-10-${String(i).padStart(2, '0')}`);
    expect(getSeen().days!.length).toBe(30);
    expect(getSeen().days!.at(-1)).toBe('2026-11-12');
  });

  test('views and broken values', () => {
    markView('map');
    markView('map');
    expect(getSeen().views).toEqual({ map: true });
    prefs.set('seen', { days: 'x', views: [1], lastReview: '2026-11-01', future: 1 });
    expect(getSeen()).toEqual({ lastReview: '2026-11-01', future: 1 });
  });
});
