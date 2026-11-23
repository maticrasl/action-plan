import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Activity, type Db, type Goal, type Relation, type State } from '../model';
import { setDb } from '../state';
import { TIPS_CD } from './tips-cd';
import type { TipDevice, TipHit, TipInput } from './tip-facts';

const TODAY = '2026-11-19'; // a Thursday; its week began on Monday 16 November
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
});
afterEach(() => vi.useRealTimers());

const plan = (p: Partial<Db>): Db => ({ ...emptyDb(), ...p });
const goal = (id: string, more: Partial<Goal> = {}): Goal => ({
  id,
  title: id,
  status: 'active',
  createdAt: '2026-11-01',
  ...more,
});
const metric = (id: string, current: string, more: Partial<Goal> = {}) =>
  goal(id, { metric: 'x', baseline: '0', target: '100', current, ...more });
const act = (id: string, more: Partial<Activity> = {}): Activity => ({
  id,
  title: id,
  status: 'todo',
  createdAt: '2026-11-01',
  ...more,
});
const daily = (id: string, more: Partial<Activity> = {}) =>
  act(id, { repeat: { every: 1, unit: 'day' }, startDate: '2026-11-01', ...more });
const rel = (from: string, type: Relation['type'], to: string): Relation => ({ id: `${from}-${to}`, from, type, to });
const state = (id: string, values: string[], more: Partial<State> = {}): State => ({
  id,
  title: id,
  description: '',
  value: values.at(-1) || '',
  date: '2026-11-10',
  history: values.map((value, i) => ({ date: `2026-11-0${i + 1}`, value })),
  ...more,
});
// n goals, the first one made `first` (a day); enough to count items.
const items = (n: number, first = '2026-11-01') =>
  Array.from({ length: n }, (_, i) => goal(`g${i}`, { createdAt: i ? '2026-11-15' : first }));
const device = (d: Partial<TipDevice> = {}): TipDevice => ({
  synced: false,
  canInstall: false,
  installed: false,
  fine: false,
  ...d,
});

function hits(id: string, db: Db, more: Partial<TipInput> = {}): TipHit[] {
  setDb(db);
  return TIPS_CD.find(t => t.id === id)!.hits({ db, visions: [], today: TODAY, ...more });
}
const ids = (id: string, db: Db, more: Partial<TipInput> = {}) => hits(id, db, more).map(h => h.id ?? '·');

describe('class C', () => {
  describe('routine-holds', () => {
    const weekly = (ticks: string[]) =>
      plan({
        activities: [
          act('r', {
            repeat: { times: 2, per: 'week' },
            startDate: '2026-10-01',
            checkins: Object.fromEntries(ticks.map(d => [d, 1 as const])),
          }),
        ],
      });
    const weeks = (mondays: string[]) => mondays.flatMap(m => [m, m.replace(/\d\d$/, d => String(+d + 1).padStart(2, '0'))]);
    test('four weeks met in a row: yes; three: no', () => {
      expect(ids('routine-holds', weekly(weeks(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])))).toEqual(['r']);
      expect(ids('routine-holds', weekly(weeks(['2026-10-26', '2026-11-02', '2026-11-09'])))).toEqual([]);
    });
    test('this week counts once it is met', () => {
      expect(ids('routine-holds', weekly(weeks(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'])))).toEqual(['r']);
    });
    test('a gap breaks the row', () => {
      expect(ids('routine-holds', weekly(weeks(['2026-10-12', '2026-10-19', '2026-11-02', '2026-11-09'])))).toEqual([]);
    });
  });

  describe('halfway', () => {
    const under = { under40: { 'under40:g': '2026-11-02' } };
    test('past 50 % after being seen under 40 %: yes', () => {
      expect(ids('halfway', plan({ goals: [metric('g', '55')] }), { since: under.under40 })).toEqual(['g']);
    });
    test('under 50 %, or never seen under 40 %: no', () => {
      expect(ids('halfway', plan({ goals: [metric('g', '45')] }), { since: under.under40 })).toEqual([]);
      expect(ids('halfway', plan({ goals: [metric('g', '55')] }), { since: {} })).toEqual([]);
    });
  });

  describe('achieved', () => {
    test('marked Achieved 7 days ago: yes; 8 days: no; no stamp: no', () => {
      expect(ids('achieved', plan({ goals: [goal('g', { status: 'achieved', statusSince: '2026-11-12' })] }))).toEqual(['g']);
      expect(ids('achieved', plan({ goals: [goal('g', { status: 'achieved', statusSince: '2026-11-11' })] }))).toEqual([]);
      expect(ids('achieved', plan({ goals: [goal('g', { status: 'achieved', updatedAt: '2026-11-18T10:00:00Z' })] }))).toEqual([]);
    });
  });

  describe('first-month', () => {
    const days = (n: number) => Array.from({ length: n }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    test('30 days since the first item and opened on 8 days: yes', () => {
      expect(ids('first-month', plan({ goals: items(1, '2026-10-20') }), { seen: { days: days(8) } })).toEqual(['·']);
    });
    test('7 days opened, or 29 days since the first item: no', () => {
      expect(ids('first-month', plan({ goals: items(1, '2026-10-20') }), { seen: { days: days(7) } })).toEqual([]);
      expect(ids('first-month', plan({ goals: items(1, '2026-10-21') }), { seen: { days: days(8) } })).toEqual([]);
    });
    test('days older than 30 do not count', () => {
      const old = ['2026-10-10', ...days(7)];
      expect(ids('first-month', plan({ goals: items(1, '2026-10-01') }), { seen: { days: old } })).toEqual([]);
    });
  });
});

describe('class D', () => {
  test('none in the first 5 days after the first item', () => {
    expect(ids('try-map', plan({ goals: items(6, '2026-11-14') }))).toEqual(['·']);
    expect(ids('try-map', plan({ goals: items(6, '2026-11-15') }))).toEqual([]);
  });

  test('try-map: 6 items and the Map never opened', () => {
    expect(ids('try-map', plan({ goals: items(6) }))).toEqual(['·']);
    expect(ids('try-map', plan({ goals: items(5) }))).toEqual([]);
    expect(ids('try-map', plan({ goals: items(6) }), { seen: { views: { map: true } } })).toEqual([]);
  });

  test('try-today: two or more plans with an active goal, and Today never opened', () => {
    const p = plan({ goals: items(1) });
    expect(ids('try-today', p, { activePlans: 2 })).toEqual(['·']);
    expect(ids('try-today', p, { activePlans: 1 })).toEqual([]);
    expect(ids('try-today', p)).toEqual([]);
    expect(ids('try-today', p, { activePlans: 3, seen: { views: { today: true } } })).toEqual([]);
  });

  test('try-areas: visions in two areas and Areas never opened', () => {
    const v = (area?: string) => ({ id: 'v' + Math.random(), title: 'v', parents: [], ...(area ? { area } : {}) });
    expect(hits('try-areas', plan({ goals: items(1) }), { visions: [v('Health'), v(' health')] })).toEqual([]);
    expect(hits('try-areas', plan({ goals: items(1) }), { visions: [v('Health'), v('Home'), v()] })).toEqual([{ vars: { n: 2 } }]);
    expect(hits('try-areas', plan({ goals: items(1) }), { visions: [v('Health'), v()] })).toEqual([]);
    expect(hits('try-areas', plan({ goals: items(1) }), { visions: [v('Health'), v('Home')], seen: { views: { areas: true } } })).toEqual([]);
  });

  test('try-timeline: 4 items with dates and the Timeline never opened', () => {
    const dated = (n: number) => items(4).map((g, i) => (i < n ? { ...g, deadline: '2027-01-01' } : g));
    expect(ids('try-timeline', plan({ goals: dated(4) }))).toEqual(['·']);
    expect(ids('try-timeline', plan({ goals: dated(3), activities: [act('a', { dueDate: '2026-12-01' })] }))).toEqual(['·']);
    expect(ids('try-timeline', plan({ goals: dated(3) }))).toEqual([]);
    expect(ids('try-timeline', plan({ goals: dated(4) }), { seen: { views: { timeline: true } } })).toEqual([]);
  });

  describe('make-up', () => {
    // Monday, Wednesday and Friday since 2 November.
    const mwf = (more: Partial<Activity> = {}) =>
      act('r', { repeat: { every: 1, unit: 'week', days: [0, 2, 4] }, startDate: '2026-11-02', ...more });
    const kept = Object.fromEntries(
      ['02', '04', '06', '09', '11', '13', '16', '18'].map(d => [`2026-11-${d}`, 1 as const]),
    );
    test('a missed set day in the last 14 days, make-up off: yes, about that routine', () => {
      expect(hits('make-up', plan({ activities: [mwf()] }))).toEqual([{ vars: { name: 'r' }, target: 'r' }]);
    });
    test('make-up on, every day kept, or a daily routine: no', () => {
      expect(hits('make-up', plan({ activities: [mwf({ repeat: { every: 1, unit: 'week', days: [0, 2, 4], makeUp: true } })] }))).toEqual([]);
      expect(hits('make-up', plan({ activities: [mwf({ checkins: kept })] }))).toEqual([]);
      expect(hits('make-up', plan({ activities: [daily('d')] }))).toEqual([]);
    });
  });

  describe('adds-up', () => {
    const p = (values: string[], more: Partial<State> = {}, rels = true) =>
      plan({
        goals: items(1),
        activities: [daily('r')],
        states: [state('s', values, more)],
        relations: rels ? [rel('r', 'improves', 's')] : [],
      });
    test('a routine improves a state whose values only grow: yes, named', () => {
      expect(hits('adds-up', p(['1', '2', '4']))).toEqual([{ vars: { name: 's' }, target: 's' }]);
    });
    test('a value that fell, two values, adding up already, or no routine: no', () => {
      expect(hits('adds-up', p(['1', '3', '2']))).toEqual([]);
      expect(hits('adds-up', p(['1', '2']))).toEqual([]);
      expect(hits('adds-up', p(['1', '2', '4'], { cumulative: true }))).toEqual([]);
      expect(hits('adds-up', p(['1', '2', '4'], {}, false))).toEqual([]);
    });
  });

  test('use-list: 3 commas or 3 lines in the details, not a list', () => {
    const p = (description: string, more: Partial<Activity> = {}) =>
      plan({ goals: items(1), activities: [act('a', { description, ...more })] });
    expect(hits('use-list', p('milk, eggs, bread, tea'))).toEqual([{ vars: { name: 'a' }, target: 'a' }]);
    expect(hits('use-list', p('milk\neggs\nbread'))).toHaveLength(1);
    expect(hits('use-list', p('milk, eggs, bread'))).toEqual([]);
    expect(hits('use-list', p('milk\neggs'))).toEqual([]);
    expect(hits('use-list', p('milk, eggs, bread, tea', { list: [] }))).toEqual([]);
    expect(hits('use-list', p('milk, eggs, bread, tea', { status: 'done' }))).toEqual([]);
  });

  test('routine-list: 3 daily routines; 2: no', () => {
    expect(ids('routine-list', plan({ goals: items(1), activities: [daily('a'), daily('b'), daily('c')] }))).toEqual(['·']);
    expect(ids('routine-list', plan({ goals: items(1), activities: [daily('a'), daily('b')] }))).toEqual([]);
  });

  test('templates: one goal and no activities, templates never opened', () => {
    expect(ids('templates', plan({ goals: items(1) }))).toEqual(['·']);
    expect(ids('templates', plan({ goals: items(1) }), { seen: { templates: true } })).toEqual([]);
    expect(ids('templates', plan({ goals: items(2) }))).toEqual([]);
    expect(ids('templates', plan({ goals: items(1), activities: [act('a')] }))).toEqual([]);
  });

  test('backup: 10 items, 7 days, no sync and no export', () => {
    const p = (n: number, first = '2026-11-12') => plan({ goals: items(n, first) });
    expect(ids('backup', p(10), { device: device() })).toEqual(['·']);
    expect(ids('backup', p(9), { device: device() })).toEqual([]);
    expect(ids('backup', p(10, '2026-11-13'), { device: device() })).toEqual([]);
    expect(ids('backup', p(10), { device: device({ synced: true }) })).toEqual([]);
    expect(ids('backup', p(10), { device: device(), seen: { exported: true } })).toEqual([]);
    expect(ids('backup', p(10))).toEqual([]); // nothing known about the device
  });

  test('install: opened on 5 days, can be installed, not installed', () => {
    const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'];
    const p = plan({ goals: items(1) });
    expect(ids('install', p, { device: device({ canInstall: true }), seen: { days } })).toEqual(['·']);
    expect(ids('install', p, { device: device({ canInstall: true }), seen: { days: days.slice(1) } })).toEqual([]);
    expect(ids('install', p, { device: device(), seen: { days } })).toEqual([]);
    expect(ids('install', p, { device: device({ canInstall: true, installed: true }), seen: { days } })).toEqual([]);
  });

  test('menu: 10 items and the menu never used', () => {
    expect(ids('menu', plan({ goals: items(10) }))).toEqual(['·']);
    expect(ids('menu', plan({ goals: items(9) }))).toEqual([]);
    expect(ids('menu', plan({ goals: items(10) }), { seen: { menu: true } })).toEqual([]);
  });

  test('ctrl-enter: a fine pointer and 10 items', () => {
    expect(ids('ctrl-enter', plan({ goals: items(10) }), { device: device({ fine: true }) })).toEqual(['·']);
    expect(ids('ctrl-enter', plan({ goals: items(10) }), { device: device() })).toEqual([]);
    expect(ids('ctrl-enter', plan({ goals: items(9) }), { device: device({ fine: true }) })).toEqual([]);
  });

  test('share: a goal achieved and 30 days since the first item', () => {
    const p = (first: string) => plan({ goals: [...items(1, first), goal('a', { status: 'achieved' })] });
    expect(ids('share', p('2026-10-20'))).toEqual(['·']);
    expect(ids('share', p('2026-10-21'))).toEqual([]);
    expect(ids('share', plan({ goals: items(1, '2026-10-01') }))).toEqual([]);
  });
});
