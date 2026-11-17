import { afterEach, describe, expect, test } from 'vitest';
import { I18N, fill, locale, lookup, setLang, t, tp } from './index';

afterEach(() => setLang('en'));

describe('tp: plural forms', () => {
  test('English: one, else other', () => {
    expect([0, 1, 2, 5, 11, 21, 101].map(n => tp('vis.goals', n))).toEqual([
      '0 goals',
      '1 goal',
      '2 goals',
      '5 goals',
      '11 goals',
      '21 goals',
      '101 goals',
    ]);
  });

  test('Slovenian: one, two (dual), few and other, by the last two digits', () => {
    setLang('sl');
    const forms = [0, 1, 2, 3, 4, 5, 11, 12, 14, 100, 101, 102, 103, 104, 105, 201].map(n => tp('vis.goals', n));
    expect(forms).toEqual([
      '0 ciljev',
      '1 cilj',
      '2 cilja',
      '3 cilji',
      '4 cilji',
      '5 ciljev',
      '11 ciljev',
      '12 ciljev',
      '14 ciljev',
      '100 ciljev',
      '101 cilj',
      '102 cilja',
      '103 cilji',
      '104 cilji',
      '105 ciljev',
      '201 cilj',
    ]);
  });

  test('every plural entry has the forms its language uses', () => {
    const plurals = (strings: object) => Object.entries(strings).filter(([, v]) => typeof v === 'object');
    for (const [key, forms] of plurals(I18N.en.strings))
      expect(Object.keys(forms).sort(), key).toEqual(['one', 'other']);
    // Slovenian: two and few come together; an entry without them reads well with `other` for any count.
    for (const [key, forms] of plurals(I18N.sl.strings))
      expect(
        [
          ['few', 'one', 'other', 'two'],
          ['one', 'other'],
        ],
        key,
      ).toContainEqual(Object.keys(forms).sort());
  });

  test('a form the entry lacks falls back to other', () => {
    setLang('sl');
    expect(tp('dash.headline', 2, { pct: '40 %' })).toBe(
      'Do svojih aktivnih ciljev (2) ste v povprečju prehodili 40 % poti.',
    );
  });

  test('{n} is filled, and other placeholders too', () => {
    expect(tp('vis.manyRoots', 2, { names: 'A, B' })).toBe(
      '2 visions are at the top: A, B. Bring them under one vision to find your Purpose.',
    );
    expect(tp('vis.manyRoots', 1, { names: 'A' })).toBe('1 vision is at the top: A.');
  });
});

describe('t, lookup and fill', () => {
  test('placeholders are filled; unknown ones stay as they are', () => {
    expect(t('confirm.delete', { name: 'Run' })).toBe('Delete “Run” and its relationships?');
    expect(fill('{a} and {b}', { a: 1 })).toBe('1 and {b}');
    expect(fill('{a}')).toBe('{a}');
  });

  test('the language in use, with its locale', () => {
    expect([t('nav.goals'), locale()]).toEqual(['Goals', 'en-GB']);
    setLang('sl');
    expect([t('nav.goals'), locale()]).toEqual(['Cilji', 'sl-SI']);
  });

  test('an unknown key is a compile error, and shows as itself', () => {
    // @ts-expect-error: not a key of en.ts
    expect(t('no.such.key')).toBe('no.such.key');
    // @ts-expect-error: plural entries are read with tp()
    expect(typeof lookup('vis.goals') === 'object' && t('vis.goals')).toBeTruthy();
  });
});
