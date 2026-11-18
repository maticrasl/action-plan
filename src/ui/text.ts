/** Words the views and forms share: status names, routine schedules, streaks and totals with units. */
import { t, tp, type PluralKey, type TextKey } from '../i18n/index';
import { fmtDay, fmtRel, today } from '../core/dates';
import { isoOf } from '../core/days';
import { makesUp, periodProgress, type PeriodProgress, type Streak } from '../core/routines/keeping';
import { nextDueDay, periodUnit, routineStart, sched, weekday, type Routine } from '../core/routines/schedule';
import { fmtNum } from '../core/util';
import { stateTotal } from '../core/cumulative';
import type { ISODate, Scale, State } from '../core/model';

export const statusLabels = (list: readonly string[], prefix: string): Record<string, string> =>
  Object.fromEntries(list.map(k => [k, t((prefix + k) as TextKey)]));

// 1 January 2024 was a Monday.
export const weekdayName = (i: number, style: Intl.DateTimeFormatOptions['weekday'] = 'short') =>
  fmtDay(isoOf(2024, 0, 1 + i), { weekday: style });
// "first" … "fifth" or "last" (-1); in Slovenian it follows the weekday's gender (sreda, sobota and
// nedelja are feminine).
export const nthWord = (nth: number, day: number) =>
  t(`rt.nth.${nth < 0 ? 'last' : nth}${[2, 5, 6].includes(day) ? 'F' : ''}` as TextKey);
// "the second Friday" or "the last Wednesday" of a month.
export const nthWeekdayText = (nth: number, day: number) =>
  t('rt.monthNth', { nth: nthWord(nth, day), day: weekdayName(day, 'long') });

// A short summary, like a calendar's: every day, every Mon, Thu, every 2 weeks on Mon, 3× a week;
// days that can be made up add "or another day".
export const scheduleText = (a: Routine) =>
  makesUp(a) ? t('rt.orAnotherDay', { text: baseSchedule(a) }) : baseSchedule(a);
export function baseSchedule(a: Routine): string {
  const s = sched(a),
    start = routineStart(a);
  const every = tp(('rt.every.' + s.unit) as PluralKey, s.every);
  if (s.times)
    return s.every === 1
      ? tp(s.unit === 'month' ? 'rt.perMonth' : 'rt.perWeek', s.times)
      : t('rt.timesEvery', { times: tp('rt.times', s.times), every });
  if (s.unit === 'week') {
    const days = [...(s.days || [weekday(start)])].sort();
    if (s.every === 1)
      return days.length === 7 ? t('rt.daily') : t('rt.onDays', { days: days.map(i => weekdayName(i)).join(', ') });
    return t('rt.on', { every, what: days.map(i => weekdayName(i)).join(', ') });
  }
  if (s.unit === 'month')
    return t('rt.on', {
      every,
      what:
        s.on === 'lastDay'
          ? t('rt.monthLast')
          : s.on === 'nth'
            ? nthWeekdayText(s.nth!, s.weekday!)
            : t('rt.monthDay', { d: s.day }),
    });
  if (s.unit === 'year') return t('rt.on', { every, what: fmtDay(start, { day: 'numeric', month: 'long' }) });
  return every;
}
// The same, compact for a routine card's tag (the full text is its tooltip): Mon–Fri, Mon, Wed, Sat,
// monthly: last day; days that can be made up add a mark.
export const shortSchedule = (a: Routine) => (makesUp(a) ? t('rt.short.makeUp', { text: shortBase(a) }) : shortBase(a));
export function shortBase(a: Routine): string {
  const s = sched(a),
    start = routineStart(a);
  if (s.times || s.unit === 'day') return baseSchedule(a);
  const on = (what: string) =>
    t('rt.short.on', {
      every: s.every === 1 ? t(('rt.short.' + s.unit) as TextKey) : tp(('rt.every.' + s.unit) as PluralKey, s.every),
      what,
    });
  if (s.unit === 'week') {
    const days = [...(s.days || [weekday(start)])].sort();
    if (days.length === 7 && s.every === 1) return t('rt.daily');
    // Three or more days in a row read as a range.
    const runs: number[][] = [];
    for (const d of days) {
      if (runs.at(-1)?.at(-1) === d - 1) runs.at(-1)!.push(d);
      else runs.push([d]);
    }
    const what = runs
      .flatMap(r => (r.length > 2 ? [`${weekdayName(r[0])}–${weekdayName(r.at(-1)!)}`] : r.map(d => weekdayName(d))))
      .join(', ');
    return s.every === 1 ? what : on(what);
  }
  if (s.unit === 'month')
    return on(
      s.on === 'lastDay'
        ? t('rt.short.monthLast')
        : s.on === 'nth'
          ? `${nthWord(s.nth!, s.weekday!)} ${weekdayName(s.weekday!)}`
          : t('rt.monthDay', { d: s.day }),
    );
  return on(fmtDay(start, { day: 'numeric', month: 'short' }));
}

// This period's progress; when nothing is due in it (an off week of every 2 weeks, before the
// start), the next due day instead.
export function periodText(a: Routine, p: PeriodProgress = periodProgress(a)) {
  if (p.target) return t(('rt.' + periodUnit(a)) as TextKey, { done: p.done, target: p.target });
  const next = nextDueDay(a);
  return next
    ? t('rt.next', { date: fmtRel(next, false, d => fmtDay(d!, { weekday: 'short', day: 'numeric', month: 'short' })) })
    : t('rt.ended');
}
export const streakText = ({ n, unit }: Streak) => tp(('rt.streak.' + unit) as PluralKey, n);

// "€2,450 in total".
export const totalText = (s: State) => t('cu.inTotal', { value: withUnit(fmtNum(stateTotal(s)), s.unit || '') });
// "18 km this week": the sum of the period around `iso`.
export const scaleText = (s: State, period: Scale, iso: ISODate = today()) =>
  t(('cu.now.' + period) as TextKey, { value: withUnit(fmtNum(stateTotal(s, period, iso)), s.unit || '') });

export const withUnit = (n: string, unit: string) => (unit ? `${n} ${unit}` : n);
