/** Pace and forecast: where a goal should be by now, what it needs from here, and when it would arrive. */
import { clamp, isNum } from './util';
import { isKeep } from './keep';
import { dayNum } from './days';
import { entriesOf, goalPeriod, isCumulative } from './cumulative';
import { stateSeries } from './series';
import { byActivities, countedActivities, goalCurrent, measuringState, ownMetric } from './progress';
import type { Goal, ISODate, State } from './model';

export type PaceStatus = 'ahead' | 'on' | 'behind';
export interface PacePoint {
  day: number;
  value: number;
}
export type Forecast = { day: number; late: number } | 'never' | null;

const MARGIN = 0.05; // within ±5 % of the whole way is on pace
const TREND_DAYS = 42;
const TREND_MIN_SPAN = 14;
const TREND_HALF_LIFE = 14; // chosen by simulating noisy weight series; see docs/decisions.md
const FAR_DAYS = 5 * 365;

const base = (g: Goal) => (isNum(g.baseline) ? Number(g.baseline) : 0);
// The goal's time in days, start (or the day it was made) to deadline; null without both, or in the wrong order.
function dates(g: Goal) {
  const start = g.startDate || g.createdAt;
  return start && g.deadline && start < g.deadline ? { a: dayNum(start), b: dayNum(g.deadline) } : null;
}
// The pace line's ends: the goal's time, when it also has a numeric target.
const span = (g: Goal) => (isNum(g.target) ? dates(g) : null);
const timeShare = (s: { a: number; b: number }, day: number) => clamp((day - s.a) / (s.b - s.a), 0, 1);
// Still on its way: the target is not yet reached (in either direction).
const toGo = (g: Goal, current: number) => (Number(g.target) - current) * (Number(g.target) - base(g)) > 0;
const statusOf = (gap: number): PaceStatus => (gap > MARGIN ? 'ahead' : gap < -MARGIN ? 'behind' : 'on');

export function paceAt(g: Goal, day: number): number | null {
  const s = span(g);
  return s && base(g) + (Number(g.target) - base(g)) * timeShare(s, day);
}

// The gap is a share of the whole way, positive toward the target. None before the start, after the
// deadline (the late mark speaks) or once the target is reached.
export function paceStatus(g: Goal, current: number, today: ISODate) {
  const s = span(g),
    d = dayNum(today);
  if (!s || d < s.a || d > s.b || !toGo(g, current)) return null;
  const gap = Number(((current - paceAt(g, d)!) / (Number(g.target) - base(g))).toFixed(9));
  return { status: statusOf(gap), gap };
}

// What is needed from here, per week, or per day when less than two weeks are left; two significant digits.
export function neededRate(g: Goal, current: number, today: ISODate) {
  const s = span(g),
    left = s ? s.b - dayNum(today) : 0;
  if (!s || left <= 0 || !toGo(g, current)) return null;
  const per = left < 14 ? 'day' : 'week';
  const rate = Math.abs(Number(g.target) - current) / (per === 'day' ? left : left / 7);
  return { value: Number(rate.toPrecision(2)), per } as const;
}

// A least-squares line through the last 42 days, or the last 5 measurements when fewer than 3 fall
// inside; at least 3 points over 14 days, or none. A measurement's weight halves every 14 days of age,
// so a change of pace shows sooner. Its slope per day, and its value on the latest measurement's day:
// the line, not that one noisy measurement, is where the trend starts.
export function trend(points: PacePoint[], today: ISODate): (PacePoint & { slope: number }) | null {
  const d = dayNum(today),
    past = points.filter(p => p.day <= d);
  let use = past.filter(p => p.day >= d - TREND_DAYS);
  if (use.length < 3) use = past.slice(-5);
  if (use.length < 3 || use[use.length - 1].day - use[0].day < TREND_MIN_SPAN) return null;
  const w = use.map(p => 0.5 ** ((d - p.day) / TREND_HALF_LIFE)),
    sum = (f: (p: PacePoint, i: number) => number) => use.reduce((n, p, i) => n + w[i] * f(p, i), 0),
    total = sum(() => 1);
  const mx = sum(p => p.day) / total,
    my = sum(p => p.value) / total;
  const slope = sum(p => (p.day - mx) * (p.value - my)) / sum(p => (p.day - mx) ** 2),
    day = use[use.length - 1].day;
  return { slope, day, value: my + slope * (day - mx) };
}

// The day the trend reaches the target, and how many weeks after the deadline.
export function forecast(g: Goal, points: PacePoint[], today: ISODate): Forecast {
  const last = points.filter(p => p.day <= dayNum(today)).at(-1),
    tr = trend(points, today);
  if (!last || !tr || !isNum(g.target) || !toGo(g, last.value)) return null;
  const toward = tr.slope * (Number(g.target) - base(g)) > 0,
    days = Math.max(0, (Number(g.target) - tr.value) / tr.slope); // 0: the line is already past the target
  if (!toward || tr.day + days > dayNum(today) + FAR_DAYS) return 'never';
  const day = Math.ceil(tr.day + days),
    end = g.deadline ? dayNum(g.deadline) : day;
  return { day, late: Math.max(0, Math.ceil((day - end) / 7)) };
}

// A goal measured by its activities: the share done against the share of the time gone.
export function actsPace(g: Goal, done: number, total: number, today: ISODate) {
  const s = dates(g),
    d = dayNum(today);
  if (!s || !total || done >= total || d < s.a || d > s.b) return null;
  const time = timeShare(s, d),
    gap = Number((done / total - time).toFixed(9));
  return { status: statusOf(gap), gap, time };
}

// The values a pace follows: a state's measurements, or the running total of one that adds up in total.
// A state counted per period has none: its target is met or not in each period.
export function paceSeries(s: State, g: Goal): (PacePoint & { date: ISODate })[] | null {
  if (!isCumulative(s)) return stateSeries(s);
  if (goalPeriod(g) !== 'total') return null;
  const byDay: Record<ISODate, number> = {};
  entriesOf(s).forEach(e => (byDay[e.date] = (byDay[e.date] || 0) + Number(e.amount)));
  let sum = 0;
  return Object.keys(byDay)
    .sort()
    .map(date => ({ date, day: dayNum(date), value: (sum = Number((sum + byDay[date]).toFixed(9))) }));
}

// Everything the goal card, the graphs and the tip `goal-behind` say about a goal's pace.
export function goalPace(g: Goal, today: ISODate) {
  if (g.status !== 'active' || isKeep(g)) return null; // a keep goal has no pace (07)
  if (byActivities(g)) {
    const counted = countedActivities(g),
      done = counted.filter(a => a.status === 'done').length;
    const p = actsPace(g, done, counted.length, today);
    return p && { kind: 'acts' as const, ...p, done, total: counted.length };
  }
  const st = ownMetric(g) ? measuringState(g) : null,
    points = st && paceSeries(st, g);
  if (!points?.length) return null;
  const current = goalCurrent(g),
    p = paceStatus(g, current, today);
  return (
    p && {
      kind: 'measure' as const,
      ...p,
      current,
      rate: neededRate(g, current, today),
      forecast: forecast(g, points, today),
    }
  );
}
