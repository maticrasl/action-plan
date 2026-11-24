import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Db, type Goal, type State } from './model';
import { weekMonday, weekPeriod } from './reviews';
import { yearFacts } from './reviews-year';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 18, 12));
});
afterEach(() => vi.useRealTimers());

const plan = (p: Partial<Db>): Db => ({ ...emptyDb(), ...p });
const goal = (id: string, more: Partial<Goal>): Goal => ({ id, title: id, status: 'active', ...more });
const state = (id: string, values: [string, number][], more: Partial<State> = {}): State => ({
  id,
  title: id,
  description: '',
  value: '',
  history: values.map(([date, v]) => ({ date, value: String(v) })),
  ...more,
});

describe('year facts', () => {
  test('goals reached in the year by their day, with the closing note', () => {
    const p = plan({
      goals: [
        goal('run', {
          status: 'achieved',
          achievedAt: '2026-06-10',
          notes: [{ id: 'n', date: '2026-06-10', text: 'Sundays with Ana', kind: 'closing', at: '2026-06-10T10:00:00.000Z' }],
        }),
        goal('old', { status: 'achieved', achievedAt: '2025-12-20' }),
        goal('save', { status: 'achieved', achievedAt: '2026-09-02' }),
      ],
    });
    const f = yearFacts([{ plan: 'a', data: p }], '2026');
    expect(f.reached.map(r => [r.title, r.day, r.note])).toEqual([
      ['run', '2026-06-10', 'Sundays with Ana'],
      ['save', '2026-09-02', undefined],
    ]);
    expect(f.stats.goals).toBe(2);
  });
  test('biggest changes: plain states with two values in the year, the largest relative change first', () => {
    const p = plan({
      states: [
        state('run', [
          ['2026-02-01', 1.5],
          ['2026-10-01', 8],
        ]),
        state('weight', [
          ['2026-01-10', 82],
          ['2026-11-01', 76],
        ]),
        state('once', [['2026-05-01', 3]]),
        state('before', [
          ['2025-05-01', 3],
          ['2026-05-01', 4],
        ]),
        state('sum', [], { cumulative: true, entries: [{ id: 'e', date: '2026-03-01', amount: '5' }] }),
      ],
    });
    const f = yearFacts([{ plan: 'a', data: p }], '2026');
    expect(f.changes.map(c => [c.state.id, c.first, c.last])).toEqual([
      ['run', 1.5, 8],
      ['weight', 82, 76],
    ]);
  });
});

describe('ISO weeks back to Mondays', () => {
  test('round trip, across New Year', () => {
    for (const mon of ['2026-11-16', '2026-12-28', '2027-01-04', '2024-12-30'])
      expect(weekMonday(weekPeriod(mon))).toBe(mon);
  });
});
