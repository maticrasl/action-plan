import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setLang } from '../i18n/index';
import {
  dateInput,
  daysUntil,
  fmtDate,
  fmtDay,
  fmtRel,
  fmtSpan,
  isoDate,
  parseDateInput,
  setToday,
  today,
} from './dates';

// The clock as a local time (vitest.config.ts sets Europe/Ljubljana: CET, CEST from 29 Mar to 25 Oct 2026).
const at = (y: number, m: number, d: number, h = 12, min = 0) => vi.setSystemTime(new Date(y, m - 1, d, h, min));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  setLang('en');
});

test('the tests run in a time zone with summer time', () => {
  expect([new Date(2026, 2, 28, 12).getTimezoneOffset(), new Date(2026, 2, 29, 12).getTimezoneOffset()]).toEqual([
    -60, -120,
  ]);
});

describe('today: the local calendar day', () => {
  test('changes at local midnight, not at UTC midnight', () => {
    at(2026, 1, 31, 23, 59);
    expect(today()).toBe('2026-01-31');
    at(2026, 2, 1, 0, 30); // still 31 January in UTC
    expect(today()).toBe('2026-02-01');
  });

  test('over the year end', () => {
    at(2026, 12, 31, 23, 59);
    expect(today()).toBe('2026-12-31');
    at(2027, 1, 1, 0, 1);
    expect(today()).toBe('2027-01-01');
  });

  test('on both clock-change days', () => {
    at(2026, 3, 29, 3, 30); // an hour after 02:00 became 03:00
    expect(today()).toBe('2026-03-29');
    at(2026, 10, 25, 2, 30); // the hour that happens twice
    expect(today()).toBe('2026-10-25');
    at(2026, 10, 25, 23, 59);
    expect(today()).toBe('2026-10-25');
  });

  test('isoDate pads month and day', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('setToday replaces it for every caller, and puts it back', () => {
    const real = today;
    setToday(() => '2026-05-01');
    expect([today(), daysUntil('2026-05-03')]).toEqual(['2026-05-01', 2]);
    setToday(real);
    at(2026, 6, 1);
    expect(today()).toBe('2026-06-01');
  });
});

describe('daysUntil: whole days between calendar dates', () => {
  test('over month ends, a short February and a leap day', () => {
    at(2026, 1, 31);
    expect(['2026-02-01', '2026-02-28', '2026-03-01', '2025-12-31'].map(daysUntil)).toEqual([1, 28, 29, -31]);
    at(2028, 2, 28);
    expect(['2028-02-29', '2028-03-01'].map(daysUntil)).toEqual([1, 2]);
  });

  test('over the year end', () => {
    at(2026, 12, 31);
    expect(['2027-01-01', '2026-01-01', '2027-12-31'].map(daysUntil)).toEqual([1, -364, 365]);
  });

  test('over the 23-hour day in March and the 25-hour day in October', () => {
    at(2026, 3, 28, 23, 0);
    expect(['2026-03-29', '2026-03-30', '2026-04-28'].map(daysUntil)).toEqual([1, 2, 31]);
    at(2026, 3, 29, 3, 30);
    expect(['2026-03-28', '2026-03-29', '2026-03-30'].map(daysUntil)).toEqual([-1, 0, 1]);
    at(2026, 10, 24, 0, 30);
    expect(['2026-10-25', '2026-10-26', '2026-09-24'].map(daysUntil)).toEqual([1, 2, -30]);
    at(2026, 10, 25, 23, 30);
    expect(['2026-10-24', '2026-10-25', '2026-10-26'].map(daysUntil)).toEqual([-1, 0, 1]);
  });

  test('no date, no number', () => {
    expect([daysUntil(''), daysUntil(null), daysUntil(undefined)]).toEqual([null, null, null]);
  });
});

describe('typed dates', () => {
  test('dd/mm/yyyy with any separator, or yyyy-mm-dd, stored as yyyy-mm-dd', () => {
    const typed = ['31/12/2026', '1.2.2026', ' 5 - 3 - 2026 ', '05 03 2026', '2026-03-05', '29/02/2028'];
    expect(typed.map(parseDateInput)).toEqual([
      '2026-12-31',
      '2026-02-01',
      '2026-03-05',
      '2026-03-05',
      '2026-03-05',
      '2028-02-29',
    ]);
  });

  test('days that do not exist, and other text, are refused', () => {
    const typed = [
      '29/02/2026',
      '31/04/2026',
      '0/1/2026',
      '1/13/2026',
      '2026-1-5',
      '2026-02-30',
      '12/2026',
      'tomorrow',
      '',
      null,
    ];
    expect(typed.map(parseDateInput)).toEqual(typed.map(() => null));
  });

  test('a stored date shows as dd/mm/yyyy and reads back the same', () => {
    expect([dateInput('2026-03-05'), dateInput(''), dateInput(null)]).toEqual(['05/03/2026', '', '']);
    expect(parseDateInput(dateInput('2026-10-25'))).toBe('2026-10-25');
  });
});

describe('dates shown in the app’s language', () => {
  test('a calendar day, the same on a clock-change day', () => {
    expect([fmtDate('2026-12-31'), fmtDate('2026-03-29'), fmtDate('')]).toEqual(['31 Dec 2026', '29 Mar 2026', '']);
    expect(fmtDay('2026-10-25', { day: 'numeric', month: 'long' })).toBe('25 October');
    setLang('sl');
    expect(fmtDate('2026-12-31')).toBe('31. dec. 2026');
  });

  test('today, tomorrow and yesterday by name, in both languages', () => {
    at(2026, 12, 31);
    expect(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'].map(d => fmtRel(d))).toEqual([
      'yesterday',
      'today',
      'tomorrow',
      '2 Jan 2027',
    ]);
    expect([
      fmtRel('2026-12-31', true),
      fmtSpan('2026-12-29', '2027-01-01'),
      fmtSpan(null, '2026-12-31', true),
    ]).toEqual(['Today', '29 Dec 2026 – tomorrow', 'Today']);
    setLang('sl');
    expect([fmtRel('2026-12-30'), fmtRel('2027-01-01', true)]).toEqual(['včeraj', 'Jutri']);
  });
});
