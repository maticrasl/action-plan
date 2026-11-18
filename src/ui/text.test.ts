import { afterEach, expect, test } from 'vitest';
import { setLang } from '../i18n/index';
import type { Repeat } from '../core/model';
import type { Routine } from '../core/routines/schedule';
import { scheduleText } from './text';

// Ported from tests/more.js "monthly routines: summaries in English and Slovenian" and the summary in
// "monthly routines: older weekday routines keep their days".

const at = (repeat: Repeat, startDate = '2027-01-07'): Routine => ({
  id: 'r',
  title: 'r',
  status: 'todo',
  repeat,
  checkins: {},
  startDate,
});

afterEach(() => setLang('en'));

test('monthly summaries in English', () => {
  expect(
    [
      at({ every: 1, unit: 'month', on: 'day', day: 15 }),
      at({ every: 1, unit: 'month', on: 'lastDay' }),
      at({ every: 2, unit: 'month', on: 'nth', nth: 2, weekday: 4 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: 1 }),
      at({ every: 3, unit: 'month', on: 'day', day: 31 }),
    ].map(scheduleText),
  ).toEqual([
    'every month on day 15',
    'every month on the last day',
    'every 2 months on the second Friday',
    'every month on the last Tuesday',
    'every 3 months on day 31',
  ]);
});

test('monthly summaries in Slovenian, with feminine ordinals', () => {
  setLang('sl');
  expect(
    [
      at({ every: 1, unit: 'month', on: 'day', day: 15 }),
      at({ every: 1, unit: 'month', on: 'lastDay' }),
      at({ every: 2, unit: 'month', on: 'nth', nth: 2, weekday: 4 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: 2, weekday: 2 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: -1, weekday: 5 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: 3, weekday: 6 }),
      at({ every: 1, unit: 'month', on: 'nth', nth: 1, weekday: 0 }),
    ].map(scheduleText),
  ).toEqual([
    'vsak mesec: 15. dan',
    'vsak mesec: zadnji dan v mesecu',
    'vsaka 2 meseca: drugi petek v mesecu',
    'vsak mesec: druga sreda v mesecu',
    'vsak mesec: zadnja sobota v mesecu',
    'vsak mesec: tretja nedelja v mesecu',
    'vsak mesec: prvi ponedeljek v mesecu',
  ]);
});

test("an older 'last' routine reads as before", () => {
  expect(scheduleText(at({ every: 1, unit: 'month', on: 'last' }, '2027-01-27'))).toBe(
    'every month on the last Wednesday',
  );
});
