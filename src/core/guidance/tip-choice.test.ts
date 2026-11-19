import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { emptyDb, type Db } from '../model';
import { setDb } from '../state';
import { I18N } from '../../i18n/index';
import { emptyTips, type Tips } from './tip-history';
import type { Tip, TipHit, TipInput } from './tip-facts';
import { GUIDE } from '../../i18n/guide';
import { CATALOGUE, allowed, askTip, choose, closeTip, keepSince, showsHint, snooze, tipOfDay, type TipBlocks } from './tip-choice';

const TODAY = '2026-11-19';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
});
afterEach(() => vi.useRealTimers());

// A plan old enough for tips: one goal created ten days ago.
const plan = (): Db => ({ ...emptyDb(), goals: [{ id: 'g', title: 'G', status: 'active', createdAt: '2026-11-09' }] });
const inp = (more: Partial<TipInput> = {}): TipInput => {
  const db = more.db || plan();
  setDb(db);
  return { db, visions: [], today: TODAY, ...more };
};
const free: TipBlocks = { demo: false, walkOpen: false };
const tips = (p: Partial<Tips> = {}): Tips => ({ ...emptyTips(), ...p });
// A tip that is true for the given hits.
const fake = (id: string, cls: Tip['cls'], cooldown = 14, hits: TipHit[] = [{}]): Tip => ({
  id,
  cls,
  view: 'dashboard',
  cooldown,
  hits: () => hits,
});

describe('choice', () => {
  test('lowest class first, whatever the catalogue order', () => {
    expect(choose([fake('b', 'B'), fake('a', 'A')], inp(), tips())?.key).toBe('a');
  });
  test('never shown before shown longest ago before shown lately; then the catalogue order', () => {
    const cat = [fake('x', 'A'), fake('y', 'A'), fake('z', 'A')];
    const h = tips({ shown: { x: { n: 1, last: '2026-10-01' }, y: { n: 1, last: '2026-09-01' } } });
    expect(choose(cat, inp(), h)?.key).toBe('z');
    expect(choose(cat.slice(0, 2), inp(), h)?.key).toBe('y');
    expect(choose([fake('p', 'B'), fake('q', 'B')], inp(), tips())?.key).toBe('p');
  });
  test('same input, same tip', () => {
    const cat = [fake('x', 'B'), fake('y', 'A')];
    expect(choose(cat, inp(), tips())?.key).toBe(choose(cat, inp(), tips())?.key);
  });
  test('a tip about several items is keyed to the first one the history allows', () => {
    const cat = [fake('r', 'A', 14, [{ id: 'one' }, { id: 'two' }])];
    expect(choose(cat, inp(), tips())?.key).toBe('r:one');
    expect(choose(cat, inp(), tips({ shown: { 'r:one': { n: 1, last: TODAY, closed: true } } }))?.key).toBe('r:two');
  });
  test('nothing true: nothing chosen', () => {
    expect(choose([fake('x', 'A', 14, [])], inp(), tips())).toBeNull();
  });
});

describe('history', () => {
  const t14 = fake('k', 'A', 14);
  test('cooldown blocks until its last day and allows on the next', () => {
    expect(allowed(t14, 'k', tips({ shown: { k: { n: 1, last: '2026-11-06' } } }), TODAY)).toBe(false); // 13 days
    expect(allowed(t14, 'k', tips({ shown: { k: { n: 1, last: '2026-11-05' } } }), TODAY)).toBe(true); // 14 days
  });
  test('the third showing is the last', () => {
    expect(allowed(t14, 'k', tips({ shown: { k: { n: 2, last: '2026-01-01' } } }), TODAY)).toBe(true);
    expect(allowed(t14, 'k', tips({ shown: { k: { n: 3, last: '2026-01-01' } } }), TODAY)).toBe(false);
  });
  test('× blocks for good; Not now for 7 days', () => {
    const closed = closeTip(tips(), 'k', TODAY);
    expect(allowed(t14, 'k', { ...closed, shown: { k: { ...closed.shown.k, last: '2020-01-01' } } }, '2030-01-01')).toBe(false);
    const later = snooze(tips({ shown: { k: { n: 1, last: '2026-01-01' } } }), 'k', TODAY);
    expect(later.shown.k.snoozed).toBe('2026-11-26');
    expect(allowed(t14, 'k', later, '2026-11-25')).toBe(false);
    expect(allowed(t14, 'k', later, '2026-11-26')).toBe(true);
  });
  test('once-only tips (cooldown 0) show once per key', () => {
    const once = fake('w', 'B', 0);
    expect(allowed(once, 'w:1', tips(), TODAY)).toBe(true);
    expect(allowed(once, 'w:1', tips({ shown: { 'w:1': { n: 1, last: '2020-01-01' } } }), TODAY)).toBe(false);
  });
  test('the settings hint shows on the first three showings only', () => {
    expect(showsHint(tips({ shown: { a: { n: 2, last: TODAY }, b: { n: 1, last: TODAY } } }))).toBe(true);
    expect(showsHint(tips({ shown: { a: { n: 3, last: TODAY }, b: { n: 1, last: TODAY } } }))).toBe(false);
  });
});

describe('one a day', () => {
  test('the first render chooses and records; a later one shows the same while it holds', () => {
    let on = true;
    const cat = [{ ...fake('x', 'A'), hits: () => (on ? [{}] : []) }];
    const first = tipOfDay(cat, inp(), tips(), free);
    expect(first.show?.key).toBe('x');
    expect(first.tips).toMatchObject({ day: TODAY, current: 'x', shown: { x: { n: 1, last: TODAY } } });
    const again = tipOfDay(cat, inp(), first.tips, free);
    expect(again.show?.key).toBe('x');
    expect(again.tips).toBe(first.tips); // nothing new recorded
    on = false; // the user did it
    expect(tipOfDay([...cat, fake('y', 'A')], inp(), first.tips, free).show).toBeNull(); // no other tip takes its place
  });
  test('a day with nothing to say records that, and stays quiet', () => {
    const r = tipOfDay([fake('x', 'A', 14, [])], inp(), tips(), free);
    expect(r.tips).toMatchObject({ day: TODAY, current: null });
    expect(tipOfDay([fake('y', 'A')], inp(), r.tips, free).show).toBeNull();
  });
  test('the next day chooses again', () => {
    const r = tipOfDay([fake('x', 'A'), fake('y', 'A')], inp(), tips({ day: '2026-11-18', current: 'x', shown: { x: { n: 1, last: '2026-11-18' } } }), free);
    expect(r.show?.key).toBe('y');
  });
  test('clock set back: no second tip, no error', () => {
    const r = tipOfDay([fake('x', 'A')], inp(), tips({ day: '2026-11-20', current: 'x' }), free);
    expect(r.show).toBeNull();
  });
  test('closed or put off today: the card goes', () => {
    const t = tips({ day: TODAY, current: 'x', shown: { x: { n: 1, last: TODAY } } });
    expect(tipOfDay([fake('x', 'A')], inp(), closeTip(t, 'x', TODAY), free).show).toBeNull();
    expect(tipOfDay([fake('x', 'A')], inp(), snooze(t, 'x', TODAY), free).show).toBeNull();
  });
  test('the current tip whose item is gone shows nothing', () => {
    const t = tips({ day: TODAY, current: 'r:gone', shown: { 'r:gone': { n: 1, last: TODAY } } });
    expect(tipOfDay([fake('r', 'A', 14, [{ id: 'other' }])], inp(), t, free).show).toBeNull();
  });
});

describe('blocks', () => {
  const cat = [fake('x', 'A')];
  test('tips off: nothing chosen, nothing recorded', () => {
    const t = tips({ off: true });
    expect(tipOfDay(cat, inp(), t, free)).toEqual({ tips: t, show: null });
  });
  test('a sample plan, Getting started open, an empty plan', () => {
    expect(tipOfDay(cat, inp(), tips(), { demo: true, walkOpen: false }).show).toBeNull();
    expect(tipOfDay(cat, inp(), tips(), { demo: false, walkOpen: true }).show).toBeNull();
    expect(tipOfDay(cat, inp({ db: emptyDb() }), tips(), free).show).toBeNull();
  });
  test('the first two days after the first item are quiet', () => {
    const db = (createdAt: string): Db => ({ ...emptyDb(), goals: [{ id: 'g', title: 'G', status: 'active', createdAt }] });
    expect(tipOfDay(cat, inp({ db: db('2026-11-18') }), tips(), free).show).toBeNull();
    expect(tipOfDay(cat, inp({ db: db('2026-11-17') }), tips(), free).show?.key).toBe('x');
  });
});

describe('catalogue', () => {
  test('ids are unique, and every tip has a Guide article or none on purpose', () => {
    const ids = CATALOGUE.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test('every tip has its text, and its button when it has an action, in both languages', () => {
    for (const l of ['en', 'sl'] as const) {
      const s = I18N[l].strings as unknown as Record<string, unknown>;
      const missing = CATALOGUE.flatMap(t => [`tip.${t.id}.text`, ...(t.action ? [`tip.${t.id}.btn`] : [])]).filter(k => !s[k]);
      expect(missing, l).toEqual([]);
    }
  });
  test('classes C and D follow A and B', () => {
    expect(CATALOGUE.map(t => t.cls).join('')).toMatch(/^A+B+C+D+$/);
  });
  test('every "Why this helps" opens an article that exists', () => {
    const known = new Set(GUIDE.en.map(a => a.id as string));
    expect(CATALOGUE.filter(t => t.guide && !known.has(t.guide)).map(t => t.id)).toEqual([]);
  });
});

describe('since', () => {
  const goalAt = (id: string, current: string, status: 'active' | 'paused' = 'active') => ({
    id,
    title: id,
    status,
    createdAt: '2026-11-01',
    metric: 'x',
    baseline: '0',
    target: '100',
    current,
  });
  const dbOf = (...goals: ReturnType<typeof goalAt>[]): Db => ({ ...emptyDb(), goals });
  test('an active goal under 40 % is noted the first day it is seen so', () => {
    expect(keepSince(inp({ db: dbOf(goalAt('a', '30'), goalAt('b', '45')) }), tips()).since).toEqual({ 'under40:a': TODAY });
  });
  test('an earlier day is kept; nothing new: the same history', () => {
    const t = tips({ since: { 'under40:a': '2026-11-02' } });
    expect(keepSince(inp({ db: dbOf(goalAt('a', '30')) }), t)).toBe(t);
  });
  test('dropped when the goal is gone or no longer active; other facts are kept', () => {
    const t = tips({ since: { 'under40:a': '2026-11-02', 'under40:gone': '2026-11-02', other: '2026-11-01' } });
    expect(keepSince(inp({ db: dbOf(goalAt('a', '30', 'paused')) }), t).since).toEqual({ other: '2026-11-01' });
  });
  test('the tip of the day notes it when it chooses, and its conditions read it', () => {
    let seen: TipInput['since'];
    const spy = { ...fake('x', 'A'), hits: (i: TipInput) => ((seen = i.since), [{}]) };
    const r = tipOfDay([spy], inp({ db: dbOf(goalAt('a', '10')) }), tips(), free);
    expect(r.tips.since).toEqual({ 'under40:a': TODAY });
    expect(seen).toEqual({ 'under40:a': TODAY });
  });
});

describe('asking for a tip', () => {
  const cat = [fake('a', 'A'), fake('b', 'B'), fake('c', 'C', 0)];
  test('the next true tip in the usual order, skipping those named', () => {
    expect(askTip(cat, inp(), tips(), ['a'])?.key).toBe('b');
    expect(askTip(cat, inp(), tips(), ['a', 'b'])?.key).toBe('c');
    expect(askTip(cat, inp(), tips(), ['a', 'b', 'c'])).toBeNull();
  });
  test('cooldowns, the showings, Not now and once-only do not apply; Don’t show again does', () => {
    const t = tips({
      shown: {
        a: { n: 3, last: TODAY },
        b: { n: 1, last: TODAY, snoozed: '2026-11-26' },
        c: { n: 1, last: '2026-01-01', closed: true },
      },
    });
    expect(askTip(cat, inp(), t, [])?.key).toBe('a');
    expect(askTip(cat, inp(), t, ['a'])?.key).toBe('b');
    expect(askTip(cat, inp(), t, ['a', 'b'])).toBeNull();
  });
  test('tips off and the first days: asking still answers', () => {
    const db: Db = { ...emptyDb(), goals: [{ id: 'g', title: 'G', status: 'active', createdAt: TODAY }] };
    expect(askTip(cat, inp({ db }), tips({ off: true }), [])?.key).toBe('a');
  });
  test('a tip about several items offers its next item before the next tip', () => {
    const many = [fake('r', 'A', 14, [{ id: '1' }, { id: '2' }]), fake('z', 'B')];
    expect(askTip(many, inp(), tips(), ['r:1'])?.key).toBe('r:2');
  });
  test('conditions read the noted facts', () => {
    const half = [{ ...fake('h', 'C', 0), hits: (i: TipInput) => (i.since?.k ? [{}] : []) }];
    expect(askTip(half, inp(), tips({ since: { k: TODAY } }), [])?.key).toBe('h');
  });
});
