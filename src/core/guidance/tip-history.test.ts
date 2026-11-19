import { describe, expect, test } from 'vitest';
import { emptyTips, mergeTips, readTips, type Tips } from './tip-history';

const tips = (p: Partial<Tips>): Tips => ({ ...emptyTips(), ...p });

describe('readTips', () => {
  test('missing or broken reads as the defaults', () => {
    expect(readTips(undefined)).toEqual(emptyTips());
    expect(readTips('x')).toEqual(emptyTips());
    expect(readTips([])).toEqual(emptyTips());
    expect(readTips({ off: 'yes', shown: 5, since: [] })).toEqual(emptyTips());
  });

  test('keeps good entries, drops broken ones', () => {
    const v = readTips({
      off: true,
      offAt: '2026-11-01T10:00:00.000Z',
      day: '2026-11-19',
      current: 'no-steps:g1',
      shown: { a: { n: 2, last: '2026-11-01', closed: true }, b: { n: 'x' }, c: null },
      since: { 'under40:g1': '2026-10-01', bad: 3 },
      later: 'kept',
    });
    expect(v.off).toBe(true);
    expect(v.current).toBe('no-steps:g1');
    expect(v.shown).toEqual({ a: { n: 2, last: '2026-11-01', closed: true } });
    expect(v.since).toEqual({ 'under40:g1': '2026-10-01' });
    expect(v.later).toBe('kept');
  });
});

describe('mergeTips', () => {
  test('per key: larger n, later last and snooze, closed if either', () => {
    const a = tips({ shown: { k: { n: 1, last: '2026-11-10', snoozed: '2026-11-20' }, x: { n: 1, last: '2026-11-01' } } });
    const b = tips({ shown: { k: { n: 2, last: '2026-11-05', closed: true }, y: { n: 3, last: '2026-10-01' } } });
    expect(mergeTips(a, b).shown).toEqual({
      k: { n: 2, last: '2026-11-10', snoozed: '2026-11-20', closed: true },
      x: { n: 1, last: '2026-11-01' },
      y: { n: 3, last: '2026-10-01' },
    });
  });

  test('the switch follows the later change', () => {
    const on = tips({ off: false, offAt: '2026-11-02T00:00:00.000Z' });
    const off = tips({ off: true, offAt: '2026-11-01T00:00:00.000Z' });
    expect(mergeTips(on, off).off).toBe(false);
    expect(mergeTips(off, on).off).toBe(false);
    expect(mergeTips(off, emptyTips()).off).toBe(true);
  });

  test('the tip of the day: the later day wins; on the same day a chosen tip beats none, then the smaller key', () => {
    const old = tips({ day: '2026-11-18', current: 'a' });
    const now = tips({ day: '2026-11-19', current: null });
    expect(mergeTips(old, now)).toMatchObject({ day: '2026-11-19', current: null });
    const x = tips({ day: '2026-11-19', current: 'week:2026-W47' });
    expect(mergeTips(now, x).current).toBe('week:2026-W47');
    const y = tips({ day: '2026-11-19', current: 'back' });
    expect(mergeTips(x, y).current).toBe('back');
    expect(mergeTips(y, x).current).toBe('back');
  });

  test('since keeps the earlier date of each fact', () => {
    const a = tips({ since: { f: '2026-11-02', g: '2026-11-01' } });
    const b = tips({ since: { f: '2026-11-01' } });
    expect(mergeTips(a, b).since).toEqual({ f: '2026-11-01', g: '2026-11-01' });
  });

  test('a missing side merges to the other', () => {
    const a = tips({ day: '2026-11-19', current: 'back' });
    expect(mergeTips(a, undefined)).toEqual(a);
    expect(mergeTips(undefined, a)).toEqual(a);
  });
});
