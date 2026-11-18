/** Unit tests only: a plan with progress of every kind, as the plan-file and merge tests use it. */
import { addDays } from './routines/schedule';
import { today } from './dates';
import type { Db } from './model';

export const d = (n: number) => addDays(today(), n);

// A plan with progress of every kind: achieved and measured goals, measurements, done and started
// activities, routine check-ins (ticked and unticked), sync bookkeeping and a relation.
export const progressPlan = () => ({
  name: 'Running',
  data: {
    goals: [
      {
        id: 'g1',
        title: 'Run 10 km',
        unit: 'km',
        baseline: '5',
        current: '7',
        target: '10',
        startDate: d(-30),
        deadline: d(40),
        status: 'active',
        category: 'Health',
        createdAt: d(-31),
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'g2',
        title: 'Read a book',
        baseline: '0',
        current: '1',
        target: '1',
        startDate: d(-20),
        deadline: d(-2),
        status: 'achieved',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      { id: 'g3', title: 'On hold', progress: 'activities', startDate: d(-10), status: 'paused' },
    ],
    states: [
      {
        id: 's1',
        title: 'Longest run',
        unit: 'km',
        value: '7',
        date: d(-1),
        history: [
          { date: d(-30), value: '5' },
          { date: d(-1), value: '7' },
        ],
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      { id: 's2', title: 'Weight', unit: 'kg', history: [] },
    ],
    activities: [
      { id: 'a1', title: 'Buy shoes', status: 'done', startDate: d(-28), dueDate: d(-25) },
      {
        id: 'a2',
        title: 'Training plan',
        status: 'doing',
        startDate: d(-21),
        dueDate: d(50),
        notes: 'Three runs a week',
      },
      { id: 'a3', title: 'Someday', status: 'todo' },
      {
        id: 'r1',
        title: 'Run',
        status: 'todo',
        startDate: d(-14),
        repeat: { every: 1, unit: 'week', days: [0, 3] },
        checkins: { [d(-7)]: 1, [d(-4)]: 1, [d(-3)]: 0 },
      },
    ],
    relations: [{ id: 'rel1', from: 'a2', to: 'g1', type: 'contributes' }],
    deleted: { gone: '2026-01-01T00:00:00.000Z' },
  } as unknown as Db,
});
