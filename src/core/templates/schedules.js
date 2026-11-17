/** Recurrences the templates use. It imports nothing, so area files may call it while they load. */
export const WEEKDAYS = [0, 1, 2, 3, 4];
export const DAILY = { every: 1, unit: 'day' };
export const perWeek = times => ({ every: 1, unit: 'week', times });
export const onDays = (...days) => ({ every: 1, unit: 'week', days });
export const monthlyOn = day => ({ every: 1, unit: 'month', on: 'day', day });
export const MONTH_END = { every: 1, unit: 'month', on: 'lastDay' };
