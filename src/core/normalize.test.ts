import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { dayNum } from './days';
import { today } from './dates';
import { emptyDb, type Db } from './model';
import { normalize, parsePlanFile, progressCounts, resetProgress } from './normalize';
import { addDays, weekday } from './routines/schedule';
import { smartCheck } from './progress';
import { d, progressPlan } from './test-plans';

// Ported from tests/more.js: the plan-file steps ("resetting progress…", "a template moves its dates…",
// "progress is counted…", "reading checks the format"), the normalize part of "'is related to' links are
// gone", "nothing depends on a routine" and "cumulative: old states migrate…".

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const datesOf = (data: Db) =>
  [...data.goals, ...data.activities]
    .flatMap(x => [x.startDate, 'deadline' in x ? x.deadline : undefined, 'dueDate' in x ? x.dueDate : undefined])
    .filter(Boolean) as string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 16, 12));
});
afterEach(() => vi.useRealTimers());

describe('normalize', () => {
  test("a goal's obstacle and plan are kept as text and dropped otherwise; older goals load unchanged", () => {
    const old = {
      id: 'g0',
      title: 'Read books',
      status: 'active',
      specific: 'Read twelve books this year',
      metric: 'Books',
      baseline: '0',
      target: '12',
      achievable: 'One a month is easy',
      relevant: 'I want to learn',
      startDate: '2026-01-01',
      deadline: '2026-12-31',
    };
    const goals = [
      old,
      { id: 'g1', title: 'A', obstacle: 'Too tired', ifThen: 'Walk instead' },
      { id: 'g2', title: 'B', obstacle: 5, ifThen: { x: 1 } },
      { id: 'g3', title: 'C', obstacle: null, ifThen: ['a'] },
    ];
    const d = normalize({ goals, states: [], activities: [], relations: [] });
    expect(d.goals[0]).toEqual(old);
    expect(smartCheck(d.goals[0])).toMatchObject({ S: true, M: true, A: true, R: true, T: true });
    expect([d.goals[1].obstacle, d.goals[1].ifThen]).toEqual(['Too tired', 'Walk instead']);
    expect([
      'obstacle' in d.goals[2],
      'ifThen' in d.goals[2],
      'obstacle' in d.goals[3],
      'ifThen' in d.goals[3],
    ]).toEqual([false, false, false, false]);
    // A template keeps them, and the old answer.
    const tpl = resetProgress(d, { shift: true });
    expect([tpl.goals[0].achievable, tpl.goals[1].obstacle, tpl.goals[1].ifThen]).toEqual([
      'One a month is easy',
      'Too tired',
      'Walk instead',
    ]);
  });

  test('"is related to" links are dropped; the rest stays', () => {
    const old = {
      goals: [
        { id: 'g1', title: 'G' },
        { id: 'g2', title: 'H' },
      ],
      states: [],
      activities: [{ id: 'a1', title: 'A' }],
      relations: [
        { id: 'r1', from: 'a1', to: 'g1', type: 'contributes' },
        { id: 'r2', from: 'g1', to: 'g2', type: 'related' },
        { id: 'r3', from: 'a1', to: 'g2', type: 'related' },
      ],
    };
    expect(normalize(old).relations.map(r => r.id)).toEqual(['r1']);
  });

  test('links that make something depend on a routine are dropped', () => {
    const old = {
      goals: [],
      states: [],
      activities: [
        { id: 'a1', title: 'A' },
        { id: 'r1', title: 'R', repeat: { every: 1, unit: 'day' } },
      ],
      relations: [
        { id: 'bad', from: 'a1', to: 'r1', type: 'depends' },
        { id: 'ok', from: 'r1', to: 'a1', type: 'depends' },
        { id: 'sub', from: 'a1', to: 'r1', type: 'subactivity' },
      ],
    };
    expect(normalize(old).relations.map(x => x.id)).toEqual(['ok', 'sub']);
    expect(parsePlanFile(JSON.stringify({ name: 'F', ...old }), 'f.json').data.relations.map(x => x.id)).toEqual([
      'ok',
      'sub',
    ]);
  });

  test('old states that added up per period become adds up + scale; their goals keep the period', () => {
    const old = {
      states: [
        {
          id: 'w',
          cumulative: 'week',
          entries: [
            { id: 'e1', date: '2020-01-06', amount: '18' },
            { id: 'e2', date: '2020-02-03', amount: '5' },
          ],
          value: '5',
          date: '2020-02-03',
        },
        { id: 'n', cumulative: 'none', entries: [] },
        { id: 'x', cumulative: 'fortnight', entries: [] },
        { id: 'p', value: '3' },
      ],
      goals: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3', period: 'month' }, { id: 'g4' }],
      relations: [
        { id: 'r1', from: 'w', to: 'g1', type: 'measures' },
        { id: 'r2', from: 'n', to: 'g2', type: 'measures' },
        { id: 'r3', from: 'w', to: 'g3', type: 'measures' },
      ],
    };
    const n = normalize(old);
    expect(n.states.map(s => [s.cumulative, s.scale])).toEqual([
      [true, 'week'],
      [true, 'total'],
      [true, 'total'],
      [undefined, undefined],
    ]);
    expect(n.goals.map(g => g.period)).toEqual(['week', 'total', 'month', undefined]);
    expect([n.states[0].value, n.states[0].date]).toEqual(['23', '2020-02-03']);
    expect(normalize(clone(n))).toEqual(n);
  });
});

describe('resetProgress', () => {
  test('strips progress and keeps the structure', () => {
    const { data } = progressPlan();
    const before = clone(data);
    const r = resetProgress(data);
    expect(data).toEqual(before);
    const [g1, g2, g3] = r.goals,
      [s1, s2] = r.states,
      [a1, a2, a3, r1] = r.activities;
    expect([g1.current, g2.current, g1.status, g2.status, g3.status]).toEqual(['', '', 'active', 'active', 'paused']);
    expect([g1.baseline, g1.target, g1.unit, g1.category, g1.title, g3.progress, g2.target]).toEqual([
      '5',
      '10',
      'km',
      'Health',
      'Run 10 km',
      'activities',
      '1',
    ]);
    expect([s1.value, s1.date, s1.history, s1.title, s1.unit, s2.unit]).toEqual([
      '',
      '',
      [],
      'Longest run',
      'km',
      'kg',
    ]);
    expect(r.activities.map(a => a.status)).toEqual(['todo', 'todo', 'todo', 'todo']);
    expect('checkins' in r1).toBe(false);
    expect(r1.repeat).toEqual(before.activities[3].repeat);
    expect((a2 as unknown as { notes: string }).notes).toBe('Three runs a week');
    expect(r.relations).toEqual(before.relations);
    expect([...r.goals, ...r.states, ...r.activities].map(x => x.id)).toEqual(
      [...before.goals, ...before.states, ...before.activities].map(x => x.id),
    );
    expect([...r.goals, ...r.states, ...r.activities, ...r.relations].some(x => 'updatedAt' in x)).toBe(false);
    expect(r.deleted).toEqual({});
    expect([g1.startDate, g1.deadline, a1.dueDate, r1.startDate, g1.createdAt]).toEqual([
      before.goals[0].startDate,
      before.goals[0].deadline,
      before.activities[0].dueDate,
      before.activities[3].startDate,
      before.goals[0].createdAt,
    ]);
    expect([a3.startDate, a3.dueDate]).toEqual([undefined, undefined]);
    expect(progressCounts(r)).toEqual({ checkins: 0, measurements: 0, done: 0, started: 0 });
  });

  test('completion dates go with the progress', () => {
    const { data } = progressPlan();
    data.goals[0].achievedAt = '2026-11-01';
    data.activities[0].doneAt = '2026-11-02';
    data.activities[0].list = [{ id: 'i', text: 'x', done: true, doneAt: '2026-11-03' }];
    const r = resetProgress(data);
    expect([r.goals[0].achievedAt, r.activities[0].doneAt, r.activities[0].list![0].doneAt]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  test('a template moves its dates by whole weeks so the earliest falls this week', () => {
    for (const offset of [-30, -400, 0, 3, 20, 365]) {
      const { data } = progressPlan();
      for (const x of [...data.goals, ...data.activities] as unknown as Record<string, string>[])
        for (const k of ['startDate', 'deadline', 'dueDate', 'createdAt']) if (x[k]) x[k] = addDays(x[k], offset);
      const r = resetProgress(data, { shift: true });
      const was = datesOf(data),
        now = datesOf(r);
      const first = [...now].sort()[0];
      expect(first >= today() && first <= addDays(today(), 6)).toBe(true);
      const by = dayNum(now[0]) - dayNum(was[0]);
      expect(by % 7 === 0).toBe(true); // -0 for a shift back
      expect(now.every((x, i) => dayNum(x) - dayNum(was[i]) === by)).toBe(true);
      expect(now.every((x, i) => weekday(x) === weekday(was[i]))).toBe(true);
      expect(r.goals[0].createdAt).toBe(addDays(data.goals[0].createdAt!, by));
      expect([r.activities[2].startDate, r.activities[2].dueDate]).toEqual([undefined, undefined]);
    }
    const none = resetProgress(
      { ...emptyDb(), goals: [{ id: 'g', title: 'No dates', status: 'active' }] },
      { shift: true },
    );
    expect([none.goals[0].startDate, none.goals[0].deadline]).toEqual([undefined, undefined]);
    const only = resetProgress(
      { ...emptyDb(), activities: [{ id: 'a', title: 'Due', status: 'todo', dueDate: d(-50) }] },
      { shift: true },
    );
    expect(only.activities[0].dueDate! >= today() && only.activities[0].dueDate! <= addDays(today(), 6)).toBe(true);
  });
});

test('progress is counted for the import question', () => {
  // 2 ticked check-ins (the unticked one does not count), 2 history entries + 2 goal current values,
  // 1 done activity + 1 achieved goal, 1 activity in progress.
  expect(progressCounts(progressPlan().data)).toEqual({ checkins: 2, measurements: 4, done: 2, started: 1 });
  expect(progressCounts(emptyDb())).toEqual({ checkins: 0, measurements: 0, done: 0, started: 0 });
  const one = (s: object) => progressCounts({ ...emptyDb(), states: [s] } as Db).measurements;
  expect(one({ id: 's', title: 'x', value: '3', date: d(-1) })).toBe(1);
  expect(one({ id: 's', title: 'x', value: '', history: [] })).toBe(0);
});

describe('parsePlanFile', () => {
  test('the new format, older files without a header, names and kinds', () => {
    const { name, data } = progressPlan();
    const ok = parsePlanFile(
      JSON.stringify({ format: 'actionplan-plan', version: 1, kind: 'template', name, ...data }),
      'x.json',
    );
    expect([ok.name, ok.kind, ok.data.goals.length, ok.data.relations.length]).toEqual([name, 'template', 3, 1]);
    const old = parsePlanFile(JSON.stringify({ name: 'Old export', ...data }), 'old.json');
    expect([old.name, old.kind, old.data.activities.length]).toEqual(['Old export', 'full', 4]);
    expect(parsePlanFile(JSON.stringify({ goals: [] }), 'My backup.JSON').name).toBe('My backup');
    expect(parsePlanFile(JSON.stringify({ name: '   ', goals: [] }), 'blank.json').name).toBe('blank');
    expect(
      parsePlanFile(
        JSON.stringify({ format: 'actionplan-plan', version: 1, kind: 'weird', name: 'k', goals: [] }),
        'k.json',
      ).kind,
    ).toBe('full');
  });

  test('refuses what is not a plan, and files from a newer version', () => {
    const reason = (text: string) => {
      try {
        parsePlanFile(text, 'f.json');
      } catch (e) {
        return (e as { code: string }).code;
      }
      return 'accepted';
    };
    for (const text of [
      'not json',
      '[1,2]',
      'null',
      '{}',
      '{"foo":1,"name":"x"}',
      '{"goals":"many"}',
      JSON.stringify({ format: 'something-else', goals: [] }),
      JSON.stringify({ format: 'actionplan-sync', version: 1, plans: { list: [] }, data: {} }),
    ])
      expect(reason(text), text).toBe('invalid');
    expect(reason(JSON.stringify({ format: 'actionplan-plan', version: 2, name: 'n', goals: [] }))).toBe('version');
  });

  test('unknown fields go, bad collections are emptied, unsafe ids and their links are dropped', () => {
    const junk = parsePlanFile(
      JSON.stringify({ name: 'J', goals: [{ id: 'g', title: 'ok', status: 'active' }], extra: 'x', states: 7 }),
      'j.json',
    );
    expect('extra' in junk.data).toBe(false);
    expect(junk.data.states).toEqual([]);
    const evil = 'x"><img src=x onerror="window.__pwned=1">';
    const bad = parsePlanFile(
      JSON.stringify({
        name: 'Bad',
        goals: [{ id: 'g1', title: 'Fine' }, { id: evil, title: 'Evil' }, null, 7, { title: 'No id' }],
        activities: [{ id: 'a1', title: 'Act' }],
        relations: [
          { id: 'r1', from: 'a1', to: 'g1', type: 'contributes' },
          { id: 'r2', from: 'a1', to: evil, type: 'contributes' },
          { id: evil, from: 'a1', to: 'g1', type: 'contributes' },
          null,
        ],
      }),
      'b.json',
    );
    expect([bad.data.goals.map(g => g.id), bad.data.relations.map(r => r.id)]).toEqual([['g1'], ['r1']]);
  });
});
