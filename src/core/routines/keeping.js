/** Keeping a routine: progress per period, make-up days, the late rule, streaks and consistency. */
import { addDays, daysBetween, isDueDay, isFlexible, periodOf, periodUnit, routineStart, runsOn, sched } from './schedule';
import { today } from '../dates';
import { checkedOn } from './checkins';
import { blockers } from '../progress';

/* Set days are strict: only a tick on a due day counts. With `repeat.makeUp` a tick on another day of
   the period counts too – it makes up for a missed due day (the earliest first) or counts ahead. */
export const makesUp = a => !isFlexible(a) && !!a.repeat?.makeUp;
// The due days, up to yesterday, in the period around `iso` that ticks on other days made up for.
export function madeUpDays(a, iso) {
  if (!makesUp(a)) return new Set();
  const { from, to } = periodOf(a, iso), now = today();
  const days = daysBetween(from, to < now ? to : now).filter(d => runsOn(a, d));
  const extra = days.filter(d => !isDueDay(a, d) && checkedOn(a, d)).length;
  return new Set(days.filter(d => d < now && isDueDay(a, d) && !checkedOn(a, d)).slice(0, extra));
}
// Whether a due day was kept: ticked, or made up for; the made-up days are worked out once per period.
export function keptDay(a) {
  const byPeriod = new Map();
  return d => {
    if (checkedOn(a, d)) return true;
    if (!makesUp(a)) return false;
    const k = periodOf(a, d).from;
    if (!byPeriod.has(k)) byPeriod.set(k, madeUpDays(a, d));
    return byPeriod.get(k).has(d);
  };
}

// Check-ins in the period around `iso` against what the period asks for. Specific days count only
// when they are due (unless they can be made up); days before the start or after the end do not count.
export function periodProgress(a, iso = today()) {
  const { from, to } = periodOf(a, iso);
  const days = daysBetween(from, to).filter(d => runsOn(a, d));
  if (!isFlexible(a)) {
    const due = days.filter(d => isDueDay(a, d));
    const done = makesUp(a) ? Math.min(due.length, days.filter(d => checkedOn(a, d)).length) : due.filter(d => checkedOn(a, d)).length;
    return { from, to, done, target: due.length, met: due.length > 0 && done >= due.length };
  }
  const done = days.filter(d => checkedOn(a, d)).length;
  const { times } = sched(a);
  return { from, to, done, target: times, met: done >= times };
}

export function routineState(a) {
  const now = today();
  if (a.dueDate && a.dueDate < now) return 'done';
  if (routineStart(a) > now) return 'todo';
  if (blockers(a).length) return 'blocked';
  const p = periodProgress(a, now);
  if (p.met) return 'done';
  // Late from the day it fell behind until it is ticked again: a tick after missed days puts it
  // back on track, however many were missed.
  const behind = behindSince(a, p, now);
  if (behind && !daysBetween(behind, now).some(d => checkedOn(a, d))) return 'late';
  return p.done ? 'doing' : 'todo';
}

// The day in this period from which a routine is behind, or '': a fixed routine's last missed due
// day before today (ticks after it count), a flexible one's first day on which the days left could
// no longer reach the target.
export function behindSince(a, p, now) {
  if (!isFlexible(a)) return missedDays(a, p.from, addDays(now, -1)).at(-1) || '';
  return daysBetween(p.from, now).find(d => {
    const before = daysBetween(p.from, addDays(d, -1)).filter(x => checkedOn(a, x)).length;
    return p.target - before > daysBetween(d, p.to).filter(x => runsOn(a, x)).length;
  }) || '';
}
// Due days of a fixed routine between two dates that were not ticked (nor made up for).
export function missedDays(a, from, to) {
  if (isFlexible(a)) return [];
  const kept = keptDay(a);
  return daysBetween(from, to).filter(d => runsOn(a, d) && isDueDay(a, d) && !kept(d));
}

// What today asks of a running routine: 'done' (ticked), 'due' (a set day, or a flexible routine that
// needs every day left), 'any' (a flexible one that can wait), 'met' (the period is done) or 'rest'
// (not one of its days); null when it does not run today.
export function routineToday(a) {
  const now = today();
  if (!runsOn(a, now)) return null;
  if (checkedOn(a, now)) return 'done';
  const p = periodProgress(a, now);
  if (!isFlexible(a)) {
    // A routine whose days can be made up is done once the period is met, and says when one is missing.
    if (isDueDay(a, now)) return makesUp(a) && p.met ? 'met' : 'due';
    return makesUp(a) && !p.met && missedDays(a, p.from, addDays(now, -1)).length ? 'makeUp' : 'rest';
  }
  if (p.met) return 'met';
  const left = daysBetween(now, p.to).filter(d => runsOn(a, d) && !checkedOn(a, d)).length;
  return p.target - p.done >= left ? 'due' : 'any';
}

// Periods met in a row (flexible) or due days ticked in a row (fixed); the current period or today
// counts once done, and does not break the streak before that.
export function routineStreak(a) {
  const now = today(), start = routineStart(a);
  let n = 0;
  if (!isFlexible(a)) {
    const kept = keptDay(a);
    for (let d = now; d >= start && n < 3660; d = addDays(d, -1)) {
      if (!isDueDay(a, d) || (a.dueDate && d > a.dueDate)) continue;
      if (kept(d)) n++;
      else if (d !== now) break;
    }
    return { n, unit: 'day' };
  }
  let p = periodOf(a, now);
  if (!periodProgress(a, now).met) p = periodOf(a, addDays(p.from, -1));
  while (p.to >= start && periodProgress(a, p.from).met && n < 600) {
    n++;
    p = periodOf(a, addDays(p.from, -1));
  }
  // Periods of several weeks or months are counted as times.
  return { n, unit: sched(a).every > 1 ? 'day' : periodUnit(a) };
}

// Share (0–1) of periods met (flexible) or due days ticked (fixed) since `from`, or null when there is
// nothing to judge yet. The running period – and a first period cut short by the start – count
// only once met; today counts only once ticked.
export function consistency(a, from = '') {
  const now = today();
  const start = from > routineStart(a) ? from : routineStart(a);
  const end = a.dueDate && a.dueDate < now ? a.dueDate : now;
  if (start > end) return null;
  let kept = 0, total = 0;
  if (!isFlexible(a)) {
    const keptOn = keptDay(a);
    daysBetween(start, end).filter(d => isDueDay(a, d)).forEach(d => {
      if (d === now && !checkedOn(a, d)) return;
      total++;
      if (keptOn(d)) kept++;
    });
  } else {
    for (let p = periodOf(a, start); p.from <= end; p = periodOf(a, addDays(p.to, 1))) {
      const { met } = periodProgress(a, p.from);
      if (!met && (p.to >= now || p.from < start)) continue;
      total++;
      if (met) kept++;
    }
  }
  return total ? kept / total : null;
}
