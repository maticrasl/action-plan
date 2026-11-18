/** Words the views and forms share: status names, routine schedules, streaks and totals with units. */
import { t, tp } from '../i18n/index';
import { fmtDay, fmtRel, today } from '../core/dates';
import { isoOf } from '../core/days';
import { makesUp, periodProgress } from '../core/routines/keeping';
import { nextDueDay, periodUnit, routineStart, sched, weekday } from '../core/routines/schedule';
import { fmtNum } from '../core/util';
import { stateTotal } from '../core/cumulative';

export const statusLabels = (list, prefix) => Object.fromEntries(list.map(k => [k, t(prefix + k)]));

// 1 January 2024 was a Monday.
export const weekdayName = (i, style = 'short') => fmtDay(isoOf(2024, 0, 1 + i), { weekday: style });
// "first" … "fifth" or "last" (-1); in Slovenian it follows the weekday's gender (sreda, sobota and
// nedelja are feminine).
export const nthWord = (nth, day) => t(`rt.nth.${nth < 0 ? 'last' : nth}${[2, 5, 6].includes(day) ? 'F' : ''}`);
// "the second Friday" or "the last Wednesday" of a month.
export const nthWeekdayText = (nth, day) => t('rt.monthNth', { nth: nthWord(nth, day), day: weekdayName(day, 'long') });

// A short summary, like a calendar's: every day, every Mon, Thu, every 2 weeks on Mon, 3× a week;
// days that can be made up add "or another day".
export const scheduleText = a => (makesUp(a) ? t('rt.orAnotherDay', { text: baseSchedule(a) }) : baseSchedule(a));
export function baseSchedule(a) {
  const s = sched(a), start = routineStart(a);
  const every = tp('rt.every.' + s.unit, s.every);
  if (s.times) return s.every === 1 ? tp(s.unit === 'month' ? 'rt.perMonth' : 'rt.perWeek', s.times) : t('rt.timesEvery', { times: tp('rt.times', s.times), every });
  if (s.unit === 'week') {
    const days = [...(s.days || [weekday(start)])].sort();
    if (s.every === 1) return days.length === 7 ? t('rt.daily') : t('rt.onDays', { days: days.map(i => weekdayName(i)).join(', ') });
    return t('rt.on', { every, what: days.map(i => weekdayName(i)).join(', ') });
  }
  if (s.unit === 'month') return t('rt.on', { every, what: s.on === 'lastDay' ? t('rt.monthLast') : s.on === 'nth' ? nthWeekdayText(s.nth, s.weekday) : t('rt.monthDay', { d: s.day }) });
  if (s.unit === 'year') return t('rt.on', { every, what: fmtDay(start, { day: 'numeric', month: 'long' }) });
  return every;
}
// The same, compact for a routine card's tag (the full text is its tooltip): Mon–Fri, Mon, Wed, Sat,
// monthly: last day; days that can be made up add a mark.
export const shortSchedule = a => (makesUp(a) ? t('rt.short.makeUp', { text: shortBase(a) }) : shortBase(a));
export function shortBase(a) {
  const s = sched(a), start = routineStart(a);
  if (s.times || s.unit === 'day') return baseSchedule(a);
  const on = what => t('rt.short.on', { every: s.every === 1 ? t('rt.short.' + s.unit) : tp('rt.every.' + s.unit, s.every), what });
  if (s.unit === 'week') {
    const days = [...(s.days || [weekday(start)])].sort();
    if (days.length === 7 && s.every === 1) return t('rt.daily');
    // Three or more days in a row read as a range.
    const runs = [];
    for (const d of days) {
      if (runs.at(-1)?.at(-1) === d - 1) runs.at(-1).push(d);
      else runs.push([d]);
    }
    const what = runs.flatMap(r => (r.length > 2 ? [`${weekdayName(r[0])}–${weekdayName(r.at(-1))}`] : r.map(d => weekdayName(d)))).join(', ');
    return s.every === 1 ? what : on(what);
  }
  if (s.unit === 'month') return on(s.on === 'lastDay' ? t('rt.short.monthLast') : s.on === 'nth' ? `${nthWord(s.nth, s.weekday)} ${weekdayName(s.weekday)}` : t('rt.monthDay', { d: s.day }));
  return on(fmtDay(start, { day: 'numeric', month: 'short' }));
}

// This period's progress; when nothing is due in it (an off week of every 2 weeks, before the
// start), the next due day instead.
export function periodText(a, p = periodProgress(a)) {
  if (p.target) return t('rt.' + periodUnit(a), { done: p.done, target: p.target });
  const next = nextDueDay(a);
  return next ? t('rt.next', { date: fmtRel(next, false, d => fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' })) }) : t('rt.ended');
}
export const streakText = ({ n, unit }) => tp('rt.streak.' + unit, n);

// "€2,450 in total".
export const totalText = s => t('cu.inTotal', { value: withUnit(fmtNum(stateTotal(s)), s.unit || '') });
// "18 km this week": the sum of the period around `iso`.
export const scaleText = (s, period, iso = today()) => t('cu.now.' + period, { value: withUnit(fmtNum(stateTotal(s, period, iso)), s.unit || '') });

export const withUnit = (n, unit) => (unit ? `${n} ${unit}` : n);
