import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Activity, type Db, type Repeat } from './model';
import { setDb, db } from './state';
import { currentFocus, focusDone, todayItems } from './today';

const TODAY = '2026-11-18'; // a Wednesday
const plan = (activities: Activity[]): Db => ({ ...emptyDb(), activities });
const step = (id: string, dueDate?: string, status: Activity['status'] = 'todo'): Activity => ({
  id,
  title: id,
  status,
  ...(dueDate && { dueDate }),
});
const routine = (id: string, repeat: Repeat, checkins: Record<string, 1> = {}): Activity =>
  ({ id, title: id, status: 'todo', repeat, checkins, startDate: '2026-10-01' }) as Activity;
const ids = (rows: { plan: string; activity: Activity }[]) => rows.map(r => `${r.plan}:${r.activity.id}`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00`));
  setDb(emptyDb());
});
afterEach(() => vi.useRealTimers());

describe('todayItems', () => {
  test('due by today in due, up to seven days later in later, done and undated nowhere', () => {
    const p = plan([
      step('tomorrow', '2026-11-19'),
      step('today', TODAY),
      step('late', '2026-11-17'),
      step('week', '2026-11-25'),
      step('eight', '2026-11-26'),
      step('done', '2026-11-17', 'done'),
      step('none'),
    ]);
    const r = todayItems([{ plan: 'p', data: p }], TODAY);
    expect(ids(r.due)).toEqual(['p:late', 'p:today']);
    expect(ids(r.later)).toEqual(['p:tomorrow', 'p:week']);
    expect(r.routines).toEqual([]);
  });

  test('routines by the Overview rule: a set day, a flexible one not met, not a ticked or resting one', () => {
    const p = plan([
      routine('daily', { every: 1, unit: 'day' }),
      routine('ticked', { every: 1, unit: 'day' }, { [TODAY]: 1 }),
      routine('monday', { every: 1, unit: 'week', days: [0] }),
      routine('flex', { times: 2, per: 'week' }),
      routine('flexMet', { times: 1, per: 'week' }, { '2026-11-16': 1 }),
      routine('makeUp', { every: 1, unit: 'week', days: [0], makeUp: true }),
    ]);
    const r = todayItems([{ plan: 'p', data: p }], TODAY);
    expect(ids(r.routines)).toEqual(['p:daily', 'p:flex', 'p:makeUp']);
    expect(r.due).toEqual([]);
  });

  test('plans keep their order and their own answers; the open plan is left as it was', () => {
    const open = emptyDb();
    setDb(open);
    const a = plan([routine('r', { every: 1, unit: 'day' }, { [TODAY]: 1 }), step('s', TODAY)]);
    const b = plan([routine('r', { every: 1, unit: 'day' }), step('s', '2026-11-10')]);
    const r = todayItems(
      [
        { plan: 'a', data: a },
        { plan: 'b', data: b },
      ],
      TODAY,
    );
    expect(ids(r.routines)).toEqual(['b:r']);
    expect(ids(r.due)).toEqual(['a:s', 'b:s']);
    expect(db).toBe(open);
  });
});

describe('currentFocus and focusDone', () => {
  const data = plan([step('s', TODAY), routine('r', { times: 2, per: 'week' }, { '2026-11-16': 1 })]);
  const plans = [{ plan: 'p', data }];
  const focus = (week: string, item = 's', p = 'p') => ({ week, plan: p, item, at: '2026-11-16T08:00:00Z' });

  test('this week only: Sunday 23:59 is still last week, Monday is a new one', () => {
    expect(currentFocus(focus('2026-11-16'), plans, TODAY)?.activity.id).toBe('s');
    expect(currentFocus(focus('2026-11-09'), plans, TODAY)).toBeNull();
    expect(currentFocus(focus('2026-11-16'), plans, '2026-11-22')?.activity.id).toBe('s');
    expect(currentFocus(focus('2026-11-16'), plans, '2026-11-23')).toBeNull();
  });

  test('nothing when cleared, unset, or its plan or item is gone', () => {
    expect(currentFocus(undefined, plans, TODAY)).toBeNull();
    expect(currentFocus(focus('2026-11-16', '', ''), plans, TODAY)).toBeNull();
    expect(currentFocus(focus('2026-11-16', 'gone'), plans, TODAY)).toBeNull();
    expect(currentFocus(focus('2026-11-16', 's', 'gone'), plans, TODAY)).toBeNull();
  });

  test('a step is done when done; a routine when its week is met or every set day is ticked', () => {
    expect(focusDone(data, step('s', TODAY), TODAY)).toBe(false);
    expect(focusDone(data, step('s', TODAY, 'done'), TODAY)).toBe(true);
    expect(focusDone(data, data.activities[1], TODAY)).toBe(false);
    const met = routine('m', { times: 2, per: 'week' }, { '2026-11-16': 1, '2026-11-17': 1 });
    expect(focusDone(data, met, TODAY)).toBe(true);
    const mon = routine('mon', { every: 1, unit: 'week', days: [0] }, { '2026-11-16': 1 });
    expect(focusDone(data, mon, TODAY)).toBe(true);
    expect(focusDone(data, routine('mon2', { every: 1, unit: 'week', days: [0, 4] }, { '2026-11-16': 1 }), TODAY)).toBe(
      false,
    );
  });
});
