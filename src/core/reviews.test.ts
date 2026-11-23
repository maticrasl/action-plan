import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type State } from './model';
import { addDays } from './routines/schedule';
import { fixLines, focusWeek, forgotten, latestReview, reviewDot, reviewWeek, unmeasured, weekPeriod } from './reviews';
import type { Review } from './journal';

// Wednesday 2026-11-18; the week under way began Monday 2026-11-16.
const TODAY = '2026-11-18';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 18, 12));
});
afterEach(() => vi.useRealTimers());

const plan = (p: Partial<Db>): Db => ({ ...emptyDb(), ...p });
const goal = (id: string, more: Partial<Goal> = {}): Goal => ({ id, title: id, status: 'active', ...more });
const act = (id: string, more: Partial<Activity> = {}): Activity => ({ id, title: id, status: 'todo', ...more });
const state = (id: string, dates: string[], more: Partial<State> = {}): State => ({
  id,
  title: id,
  description: '',
  value: dates.length ? '1' : '',
  history: dates.map(date => ({ date, value: '1' })),
  ...more,
});
const measures = (s: string, g: string) => ({ id: `${s}-${g}`, from: s, to: g, type: 'measures' as const });

describe('which week', () => {
  test('Monday to Thursday: last week; Friday to Sunday: this week', () => {
    expect(reviewWeek('2026-11-16')).toBe('2026-11-09'); // Monday
    expect(reviewWeek('2026-11-19')).toBe('2026-11-09'); // Thursday
    expect(reviewWeek('2026-11-20')).toBe('2026-11-16'); // Friday
    expect(reviewWeek('2026-11-22')).toBe('2026-11-16'); // Sunday
  });
  test('the focus goes to the coming week from Friday, to this week before', () => {
    expect(focusWeek('2026-11-21')).toBe('2026-11-23'); // Saturday
    expect(focusWeek('2026-11-17')).toBe('2026-11-16'); // Tuesday
  });
  test('ISO week names, across New Year', () => {
    expect(weekPeriod('2026-11-16')).toBe('2026-W47');
    expect(weekPeriod('2026-12-28')).toBe('2026-W53'); // 2026 has 53 weeks
    expect(weekPeriod('2027-01-04')).toBe('2027-W01');
    expect(weekPeriod('2024-12-30')).toBe('2025-W01'); // its Thursday is in 2025
    expect(weekPeriod('2027-12-27')).toBe('2027-W52');
  });
});

describe('measure: states with no value from the week', () => {
  const from = '2026-11-09',
    to = '2026-11-15';
  test('measuring an active goal, none in the week; longest unmeasured first; a paused goal’s state is left out', () => {
    const p = plan({
      goals: [goal('g'), goal('p', { status: 'paused' })],
      states: [
        state('fresh', ['2026-11-10']),
        state('old', ['2026-10-01']),
        state('older', ['2026-09-01']),
        state('none', []),
        state('paused', ['2026-10-01']),
      ],
      relations: [
        measures('fresh', 'g'),
        measures('old', 'g'),
        measures('older', 'g'),
        measures('none', 'g'),
        measures('paused', 'p'),
      ],
    });
    const out = unmeasured([{ plan: 'a', data: p }], from, to);
    expect(out.list.map(x => x.state.id)).toEqual(['none', 'older', 'old']);
    expect(out.list[1].last).toEqual({ date: '2026-09-01', value: '1' });
    expect(out.more).toBe(0);
  });
  test('a state that adds up: no amount in the week', () => {
    const add = (id: string, date: string): State => ({
      ...state(id, []),
      cumulative: true,
      entries: [{ id: 'e' + id, date, amount: '5' }],
    });
    const p = plan({
      goals: [goal('g')],
      states: [add('in', '2026-11-12'), add('out', '2026-11-02')],
      relations: [measures('in', 'g'), measures('out', 'g')],
    });
    const out = unmeasured([{ plan: 'a', data: p }], from, to);
    expect(out.list.map(x => x.state.id)).toEqual(['out']);
    expect(out.list[0].last).toEqual({ date: '2026-11-02', value: '5' });
  });
  test('at most eight, then how many more', () => {
    const states = Array.from({ length: 10 }, (_, i) => state('s' + i, [addDays('2026-10-01', i)]));
    const p = plan({ goals: [goal('g')], states, relations: states.map(s => measures(s.id, 'g')) });
    const out = unmeasured([{ plan: 'a', data: p }], from, to);
    expect([out.list.length, out.more, out.list[0].state.id]).toEqual([8, 2, 's0']);
  });
});

describe('forgot to tick', () => {
  const from = '2026-11-09',
    to = '2026-11-15';
  const daily = (id: string, start: string, ticked: string[], more: Partial<Activity> = {}) =>
    act(id, {
      repeat: { every: 1, unit: 'day' },
      startDate: start,
      checkins: Object.fromEntries(ticked.map(d => [d, 1 as const])),
      ...more,
    });
  test('a routine with an unticked due day in the week; one ticked every day and one not running are left out', () => {
    const all = ['09', '10', '11', '12', '13', '14', '15'].map(d => `2026-11-${d}`);
    const p = plan({
      activities: [
        daily('missed', '2026-11-01', all.slice(0, 5)),
        daily('kept', '2026-11-01', all),
        daily('later', '2026-11-20', []),
        daily('ended', '2026-10-01', [], { dueDate: '2026-11-01' }),
      ],
    });
    expect(forgotten([{ plan: 'a', data: p }], from, to).routines.map(r => r.activity.id)).toEqual(['missed']);
  });
  test('steps due in the week and not done', () => {
    const p = plan({
      activities: [
        act('due', { dueDate: '2026-11-12' }),
        act('done', { dueDate: '2026-11-12', status: 'done' }),
        act('before', { dueDate: '2026-11-08' }),
        act('after', { dueDate: '2026-11-16' }),
      ],
    });
    expect(forgotten([{ plan: 'a', data: p }], from, to).steps.map(r => r.activity.id)).toEqual(['due']);
  });
});

describe('fix the plan', () => {
  test('late steps, a stuck step and a past goal, from the tips’ own rules, per plan', () => {
    const p = plan({
      goals: [goal('past', { metric: 'x', baseline: '0', target: '10', current: '4', deadline: '2026-11-01' })],
      activities: [
        act('late', { dueDate: '2026-11-10' }),
        act('stuck', { status: 'doing', statusSince: '2026-10-01' }),
      ],
    });
    const lines = fixLines([{ plan: 'a', data: p }], [], TODAY);
    expect(lines.map(l => [l.plan, l.tip, l.id])).toEqual([
      ['a', 'late', undefined],
      ['a', 'stuck-step', 'stuck'],
      ['a', 'goal-past', 'past'],
    ]);
    expect(lines[0].vars).toEqual({ n: 1 });
  });
  test('nothing to fix', () => {
    expect(fixLines([{ plan: 'a', data: plan({ goals: [goal('g')] }) }], [], TODAY)).toEqual([]);
  });
});

describe('reviews in the journal', () => {
  const r = (period: string, doneAt?: string, id = period + doneAt): Review => ({
    id,
    kind: 'week',
    period,
    doneAt,
    answers: {},
  });
  test('the latest finished review of a period', () => {
    const list = [
      r('2026-W46', '2026-11-15T10:00:00Z', 'a'),
      r('2026-W46', '2026-11-16T10:00:00Z', 'b'),
      r('2026-W46'),
      r('2026-W45', '2026-11-08T10:00:00Z'),
    ];
    expect(latestReview(list, 'week', '2026-W46')?.id).toBe('b');
    expect(latestReview(list, 'week', '2026-W44')).toBeUndefined();
  });
  test('the dot: last week has no finished review and there is an active goal', () => {
    const src = [{ plan: 'a', data: plan({ goals: [goal('g')] }) }];
    expect(reviewDot([], src, TODAY)).toBe(true);
    expect(reviewDot([r('2026-W46', '2026-11-16T10:00:00Z')], src, TODAY)).toBe(false);
    expect(reviewDot([r('2026-W46')], src, TODAY)).toBe(true); // not finished
    expect(reviewDot([], [{ plan: 'a', data: plan({ goals: [goal('g', { status: 'paused' })] }) }], TODAY)).toBe(false);
  });
});
