import { afterEach, describe, expect, test } from 'vitest';
import { setLang } from '../i18n/index';
import { clamp, fmtNum, formatter, isNum, numInput, parseNum, uid } from './util';

afterEach(() => setLang('en'));

describe('numbers typed in either language', () => {
  test('a decimal dot or comma, with or without thousands', () => {
    const typed = [
      '78.5',
      '78,5',
      '1 234,5',
      '1,234.5',
      '1.234,5',
      '1 234',
      '12 345,6',
      "1'000",
      ' 12 ',
      '-3',
      '−3',
      '+2',
      '.5',
    ];
    expect(typed.map(parseNum)).toEqual([78.5, 78.5, 1234.5, 1234.5, 1234.5, 1234, 12345.6, 1000, 12, -3, -3, 2, 0.5]);
  });

  test('anything else is NaN', () => {
    expect(['', 'abc', '1.2.3x', '--1', null, undefined].map(parseNum)).toEqual([NaN, NaN, NaN, NaN, NaN, NaN]);
  });

  test('isNum: a number or a numeric string, not empty', () => {
    expect([0, '0', '1.5', 2, '', null, undefined, 'x'].map(isNum)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('numbers shown in the app’s language', () => {
  test('stored numbers as typed: a comma in Slovenian', () => {
    expect([numInput('78.5'), numInput(3), numInput(''), numInput(null), numInput('abc')]).toEqual([
      '78.5',
      '3',
      '',
      '',
      'abc',
    ]);
    setLang('sl');
    expect(numInput('78.5')).toBe('78,5');
  });

  test('fmtNum: at most two decimals, grouped as the language groups', () => {
    expect([fmtNum(12345.678), fmtNum('2')]).toEqual(['12,345.68', '2']);
    setLang('sl');
    expect(fmtNum(12345.678)).toBe('12.345,68');
  });

  test('a formatter is made once per kind, language and options', () => {
    const a = formatter(Intl.NumberFormat, { maximumFractionDigits: 1 });
    expect(formatter(Intl.NumberFormat, { maximumFractionDigits: 1 })).toBe(a);
    setLang('sl');
    expect(formatter(Intl.NumberFormat, { maximumFractionDigits: 1 })).not.toBe(a);
  });
});

test('clamp keeps a number within bounds', () => {
  expect([clamp(5, 0, 3), clamp(-1, 0, 3), clamp(2, 0, 3)]).toEqual([3, 0, 2]);
});

test('uid: a new plain id each time (ids go into the page unescaped)', () => {
  const ids = Array.from({ length: 50 }, uid);
  expect(new Set(ids).size).toBe(50);
  for (const id of ids) expect(id).toMatch(/^[\w-]{1,64}$/);
});
