/** Recurrences the templates use. It imports only types, so area files may call it while they load. */
import type { Repeat } from '../model';

export const WEEKDAYS = [0, 1, 2, 3, 4];
export const DAILY: Repeat = { every: 1, unit: 'day' };
export const perWeek = (times: number): Repeat => ({ every: 1, unit: 'week', times });
export const onDays = (...days: number[]): Repeat => ({ every: 1, unit: 'week', days });
export const monthlyOn = (day: number): Repeat => ({ every: 1, unit: 'month', on: 'day', day });
export const MONTH_END: Repeat = { every: 1, unit: 'month', on: 'lastDay' };
