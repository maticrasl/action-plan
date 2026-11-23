import { describe, expect, test } from 'vitest';
import { emptyDb, type Activity, type Db } from './model';
import { doneDay, doneLog, weekCounts } from './done-log';

const plan = (over: Partial<Db>): Db => ({ ...emptyDb(), ...over });
const act = (p: Partial<Activity>): Activity => ({ id: 'a', title: 'Step', status: 'todo', ...p });

describe('doneDay', () => {
  test('its date; else the day of its last change when done; else none', () => {
    expect(doneDay(act({ status: 'done', doneAt: '2026-11-10' }))).toBe('2026-11-10');
    expect(doneDay(act({ status: 'done', updatedAt: '2026-11-12T10:00:00.000Z' }))).toBe('2026-11-12');
    expect(doneDay(act({ status: 'done' }))).toBeUndefined();
    expect(doneDay(act({ status: 'doing', updatedAt: '2026-11-12T10:00:00.000Z' }))).toBeUndefined();
  });
});

describe('doneLog and weekCounts', () => {
  const data = plan({
    goals: [
      { id: 'g', title: 'Run 5 km', status: 'achieved', achievedAt: '2026-11-18' },
      { id: 'g2', title: 'Sleep well', status: 'active' },
    ],
    relations: [
      { id: 'r1', from: 's1', to: 'g', type: 'contributes' },
      { id: 'r2', from: 's1', to: 'g2', type: 'contributes' },
      { id: 'r3', from: 'r', to: 'w', type: 'improves' },
      { id: 'r4', from: 'l', to: 's1', type: 'depends' },
    ],
    activities: [
      act({ id: 's1', title: 'Buy shoes', status: 'done', doneAt: '2026-11-17' }),
      act({ id: 's-old', title: 'Old', status: 'done', doneAt: '2026-11-09' }),
      act({
        id: 'l',
        title: 'Paperwork',
        status: 'done',
        doneAt: '2026-11-19',
        list: [
          { id: 'i1', text: 'Tax', done: true, doneAt: '2026-11-18' },
          { id: 'i2', text: 'Bank', done: true, doneAt: '2026-11-19' },
          { id: 'i3', text: 'Later', done: false },
        ],
      }),
      act({
        id: 'r',
        title: 'Run',
        status: 'doing',
        repeat: { every: 1, unit: 'day' },
        checkins: { '2026-11-16': 1, '2026-11-17': 0, '2026-11-18': 1, '2026-11-01': 1 },
      }),
    ],
    states: [
      {
        id: 'w',
        title: 'Weight',
        description: '',
        value: '80',
        history: [
          { date: '2026-11-17', value: '81' },
          { date: '2026-11-02', value: '83' },
        ],
      },
      {
        id: 'km',
        title: 'Distance',
        description: '',
        value: '8',
        history: [],
        cumulative: true,
        entries: [
          { id: 'e1', date: '2026-11-18', amount: '5' },
          { id: 'e2', date: '2026-11-18', amount: '3', routine: 'r' }, // added by the tick: counted there
        ],
      },
    ],
  });
  const log = doneLog([{ plan: 'p', data }], '2026-11-16', '2026-11-22');

  test('entries in the range, newest day first; a list shows its items, not itself', () => {
    expect(log.map(e => [e.day, e.kind, e.id])).toEqual([
      ['2026-11-19', 'item', 'l'],
      ['2026-11-18', 'goal', 'g'],
      ['2026-11-18', 'item', 'l'],
      ['2026-11-18', 'routine', 'r'],
      ['2026-11-18', 'amount', 'km'],
      ['2026-11-17', 'step', 's1'],
      ['2026-11-17', 'value', 'w'],
      ['2026-11-16', 'routine', 'r'],
    ]);
    expect(log.find(e => e.kind === 'item')).toMatchObject({ plan: 'p', title: 'Bank', detail: 'Paperwork' });
    expect(log.find(e => e.kind === 'value')?.detail).toBe('81');
  });

  test('the goals a step, item or routine contributes to', () => {
    expect(log.find(e => e.kind === 'step')?.goals).toEqual(['g', 'g2']);
    expect(log.find(e => e.kind === 'routine')?.goals).toEqual([]);
    expect(log.find(e => e.kind === 'item')?.goals).toEqual([]);
    expect(log.find(e => e.kind === 'value')?.goals).toBeUndefined();
  });

  test('range borders are inclusive; a range across New Year', () => {
    const p = plan({
      activities: [
        act({ id: 'x', status: 'done', doneAt: '2026-12-28' }),
        act({ id: 'y', status: 'done', doneAt: '2027-01-03' }),
        act({ id: 'z', status: 'done', doneAt: '2027-01-04' }),
      ],
    });
    expect(doneLog([{ plan: 'p', data: p }], '2026-12-28', '2027-01-03').map(e => e.id)).toEqual(['y', 'x']);
  });

  test('notes: on their day, the first 80 characters, last in the day', () => {
    const long = 'x'.repeat(90);
    const p = plan({
      goals: [{ id: 'g', title: 'Run', status: 'active', notes: [{ id: 'n', date: '2026-11-17', text: long, at: '' }] }],
      activities: [act({ id: 's', status: 'done', doneAt: '2026-11-17' })],
    });
    const log = doneLog([{ plan: 'p', data: p }], '2026-11-16', '2026-11-22');
    expect(log.map(e => e.kind)).toEqual(['step', 'note']);
    expect(log[1]).toMatchObject({ id: 'g', title: 'Run', detail: 'x'.repeat(80) + '…' });
    expect(weekCounts(log).steps).toBe(1);
  });

  test('two plans: both, by day', () => {
    const a = plan({ activities: [act({ id: 'a1', status: 'done', doneAt: '2026-11-17' })] });
    const b = plan({ activities: [act({ id: 'b1', status: 'done', doneAt: '2026-11-18' })] });
    expect(doneLog([{ plan: 'A', data: a }, { plan: 'B', data: b }], '2026-11-16', '2026-11-22').map(e => e.plan)).toEqual(['B', 'A']);
  });

  test('counts: steps and items, routine days, values and amounts, goals', () => {
    expect(weekCounts(log)).toEqual({ steps: 3, routineDays: 2, values: 2, goals: 1 });
    expect(weekCounts([])).toEqual({ steps: 0, routineDays: 0, values: 0, goals: 0 });
  });
});
