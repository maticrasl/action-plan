import { describe, expect, test } from 'vitest';
import {
  answersOf,
  hasAnswers,
  latestRatings,
  lowAreas,
  nextStep,
  prevStep,
  rateList,
  stepsOf,
  TEXT_MAX,
  toMake,
  LADDER_MAX,
  type DiscAnswers,
} from './discovery';
import { normalizeJournal } from './journal';
import type { Vision } from './model';

const vis = (id: string, title: string): Vision => ({ id, title, parents: [] });

describe('steps', () => {
  test('good-day runs 1 to 5, then ends; back stops at the first', () => {
    expect(stepsOf('good-day', {})).toEqual(['s1', 's2', 's3', 's4', 's5']);
    let at = 's1';
    const seen = [at];
    while (at !== 'end') seen.push((at = nextStep('good-day', {}, at).to));
    expect(seen).toEqual(['s1', 's2', 's3', 's4', 's5', 'end']);
    expect(prevStep('good-day', {}, 's3')).toBe('s2');
    expect(prevStep('good-day', {}, 's1')).toBeNull();
  });

  test('what-for: goal, what is it for, then the ladder until That is it', () => {
    const a: DiscAnswers = { ladder: ['health', 'energy'] };
    expect(nextStep('what-for', a, 'goal').to).toBe('l0');
    expect(nextStep('what-for', a, 'l0').to).toBe('l1');
    expect(nextStep('what-for', a, 'l1').to).toBe('end'); // Next is That's it from step 3 on
    const again = nextStep('what-for', a, 'l1', true);
    expect(again.to).toBe('l2');
    expect(stepsOf('what-for', a, 'l2')).toEqual(['goal', 'l0', 'l1', 'l2']);
  });

  test('what-for: That is it after going back drops the answers above it', () => {
    const r = nextStep('what-for', { ladder: ['a', 'b', 'c'] }, 'l1');
    expect(r).toEqual({ to: 'end', answers: { ladder: ['a', 'b'] } });
  });

  test('what-for: at most five answers', () => {
    const last = `l${LADDER_MAX - 1}`;
    expect(nextStep('what-for', {}, last, true).to).toBe('end');
    expect(stepsOf('what-for', {}, last)).toHaveLength(LADDER_MAX + 1);
  });

  test('areas: step 2 lists the lowest three rated 5 or lower, lowest first', () => {
    const a: DiscAnswers = { ratings: { Health: 5, Work: 8, Money: 2, Home: 4, Faith: 3 } };
    expect(lowAreas(a)).toEqual(['Money', 'Faith', 'Home']);
    expect(stepsOf('areas', a)).toEqual(['rate', 'better', 'pick']);
    expect(nextStep('areas', a, 'rate').to).toBe('better');
  });

  test('areas: step 2 skipped when none is that low; nothing rated ends at once', () => {
    const a: DiscAnswers = { ratings: { Health: 6 } };
    expect(lowAreas(a)).toEqual([]);
    expect(nextStep('areas', a, 'rate').to).toBe('pick');
    expect(prevStep('areas', a, 'pick')).toBe('rate');
    expect(nextStep('areas', {}, 'rate').to).toBe('end');
  });
});

describe('answers', () => {
  test('only empty answers are not worth storing; one character is', () => {
    expect(hasAnswers({})).toBe(false);
    expect(hasAnswers({ step: 's3', s1: '  ', s5: [{ text: '', area: '' }], ratings: {} })).toBe(false);
    expect(hasAnswers({ s1: 'x' })).toBe(true);
    expect(hasAnswers({ ratings: { Health: 3 } })).toBe(true);
    expect(hasAnswers({ goal: { plan: 'p', id: 'g', title: 'Run' } })).toBe(true);
  });

  test('answersOf keeps what fits the shape, cuts texts, drops the rest', () => {
    const long = 'x'.repeat(TEXT_MAX + 10);
    const a = answersOf({
      s1: long,
      s2: 5,
      s5: [{ text: 'To be calm', area: 'Health' }, 'bad', { text: 3 }],
      ratings: { Health: 3, Work: 11, Home: 'x' },
      ladder: ['a', 2],
      goal: { plan: 'p', id: 'g' },
    });
    expect(a.s1).toHaveLength(TEXT_MAX);
    expect(a.s2).toBeUndefined();
    expect(a.s5).toEqual([{ text: 'To be calm', area: 'Health' }]);
    expect(a.ratings).toEqual({ Health: 3 });
    expect(a.ladder).toEqual(['a']);
    expect(a.goal).toBeUndefined();
  });

  test('an unknown exercise is kept by the journal', () => {
    const s = { id: 's1', exercise: 'values', date: '2026-11-16', done: true, answers: { x: 1 }, made: [] };
    expect(normalizeJournal({ sessions: [s] }).sessions).toEqual([s]);
  });
});

describe('toMake', () => {
  const gd = (s5: { text: string; area: string }[]): DiscAnswers => ({
    s1: 'Wake by the sea.',
    s2: 'Walk, write, cook.',
    s4: 'Tired on the sofa.',
    s5,
  });

  test('good-day with one sentence: description from 1 and 2, avoid from 4', () => {
    expect(toMake('good-day', gd([{ text: ' To be calm ', area: 'Health' }]), [])).toEqual([
      {
        title: 'To be calm',
        area: 'Health',
        description: 'Wake by the sea.\n\nWalk, write, cook.',
        avoid: 'Tired on the sofa.',
      },
    ]);
  });

  test('good-day with several: no descriptions; empty sentences left out', () => {
    const out = toMake(
      'good-day',
      gd([
        { text: 'A', area: '' },
        { text: ' ', area: 'X' },
        { text: 'B', area: 'Work' },
      ]),
      [],
    );
    expect(out).toEqual([{ title: 'A' }, { title: 'B', area: 'Work' }]);
  });

  test('what-for: the edited title; an existing title (any case) links instead', () => {
    const a: DiscAnswers = { ladder: ['x'], vision: { text: 'to be free', area: '' } };
    expect(toMake('what-for', a, [])).toEqual([{ title: 'to be free' }]);
    const old = vis('v1', 'To Be Free');
    expect(toMake('what-for', a, [old])).toEqual([{ title: 'to be free', existing: old }]);
    expect(toMake('what-for', { ladder: ['x'] }, [])).toEqual([{ title: 'x' }]); // the last answer by default
    expect(toMake('areas', { pick: 'Health' }, [])).toEqual([]);
  });
});

describe('areas', () => {
  test('rateList: in use, then suggestions and this run, once each ignoring case, without hidden', () => {
    expect(rateList(['Health', 'Garden'], ['health ', 'Work', 'Faith'], ['faith'], ['Music'])).toEqual([
      'Health',
      'Garden',
      'Work',
      'Music',
    ]);
  });

  test('latestRatings: the newest run that rated an area', () => {
    const s = (id: string, date: string, ratings: Record<string, number>, exercise = 'areas') => ({
      id,
      exercise,
      date,
      done: true,
      answers: { ratings },
      made: [],
    });
    const r = latestRatings([
      s('a', '2026-10-01', { Health: 3, Work: 6 }),
      s('b', '2026-11-02', { health: 7 }),
      s('c', '2026-11-03', { Work: 1 }, 'good-day'),
    ]);
    expect(r.get('health')).toEqual({ value: 7, date: '2026-11-02' });
    expect(r.get('work')).toEqual({ value: 6, date: '2026-10-01' });
  });
});
