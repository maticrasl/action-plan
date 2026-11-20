/** Tips, class A: coming back, and things that are slipping (see docs/guidance/03-tips.md). */
import type { Db, ISODate } from '../model';
import { goalProgress, hasPercent, ownMetric } from '../progress';
import { addDays, isDueDay, isFlexible, periodOf, routineStart, runsOn, type Routine } from '../routines/schedule';
import { consistency, keptDay, periodProgress } from '../routines/keeping';
import { checkedOn, isList } from '../routines/checkins';
import { stateSeries } from '../series';
import { isCumulative } from '../cumulative';
import { relsTo } from '../relations';
import { isNum } from '../util';
import * as L from './tip-limits';
import {
  activeGoals,
  daysFrom,
  lastActivity,
  measures,
  runningRoutines,
  statusSince,
  steps,
  type Tip,
  type TipHit,
} from './tip-facts';

const named = (x: { id: string; title: string }, vars: TipHit['vars'] = {}): TipHit => ({
  id: x.id,
  vars: { name: x.title, ...vars },
});
const pct = (n: number) => Math.round(n);

// Due days (fixed) or periods (flexible) missed in a row, counting back from before today.
export function missedInARow(a: Routine, today: ISODate): number {
  const start = routineStart(a);
  let n = 0;
  if (!isFlexible(a)) {
    const kept = keptDay(a);
    for (let d = addDays(today, -1), i = 0; d >= start && i < 400; d = addDays(d, -1), i++) {
      if (!runsOn(a, d) || !isDueDay(a, d)) continue;
      if (kept(d)) break;
      n++;
    }
    return n;
  }
  for (let p = periodOf(a, addDays(periodOf(a, today).from, -1)), i = 0; p.to >= start && i < 100; i++) {
    if (periodProgress(a, p.from).met) break;
    n++;
    p = periodOf(a, addDays(p.from, -1));
  }
  return n;
}

const overdueSteps = (db: Db, today: ISODate) =>
  steps(db).filter(a => a.status !== 'done' && a.dueDate && a.dueDate < today);

export const TIPS_A: Tip[] = [
  {
    id: 'back',
    cls: 'A',
    view: 'dashboard',
    cooldown: L.COOLDOWN_A,
    guide: 'fell-off',
    action: 'replan',
    hits: ({ db, today }) => {
      const last = lastActivity(db, today);
      return activeGoals(db).length && last && daysFrom(last, today) >= L.BACK_DAYS ? [{}] : [];
    },
  },
  {
    id: 'overdue-pile',
    cls: 'A',
    view: 'activities',
    cooldown: L.COOLDOWN_A,
    guide: 'behind',
    action: 'replan',
    hits: ({ db, today }) => {
      const n = overdueSteps(db, today).length;
      return n >= L.OVERDUE_PILE ? [{ vars: { n } }] : [];
    },
  },
  {
    id: 'routine-missed',
    cls: 'A',
    view: 'activities',
    cooldown: L.COOLDOWN_A,
    guide: 'routine-slips',
    action: 'editItem',
    hits: ({ db, today }) =>
      runningRoutines(db, today)
        .filter(a => !checkedOn(a, today))
        .map(a => ({ a, n: missedInARow(a, today) }))
        .filter(x => x.n >= L.ROUTINE_MISSED)
        .sort((x, y) => y.n - x.n)
        .map(x => named(x.a)),
  },
  {
    id: 'routine-low',
    cls: 'A',
    view: 'activities',
    cooldown: L.COOLDOWN_A,
    guide: 'routine-slips',
    action: 'editItem',
    hits: ({ db, today }) =>
      runningRoutines(db, today)
        .filter(a => daysFrom(routineStart(a), today) >= L.ROUTINE_LOW_DAYS)
        .map(a => ({ a, c: consistency(a) }))
        .filter((x): x is { a: Routine; c: number } => x.c !== null && x.c < L.ROUTINE_LOW_SHARE)
        .sort((x, y) => x.c - y.c)
        .map(x => named(x.a, { pct: pct(x.c * 100) })),
  },
  {
    id: 'goal-behind',
    cls: 'A',
    view: 'goals',
    cooldown: L.COOLDOWN_A,
    guide: 'behind',
    action: 'editItem',
    hits: ({ db, today }) =>
      activeGoals(db)
        .filter(g => g.deadline && hasPercent(g))
        .map(g => {
          const left = daysFrom(today, g.deadline!);
          const start = g.startDate || g.createdAt;
          if (left < 0 || left > L.BEHIND_DAYS || !start || start >= g.deadline!) return null;
          const passed = Math.min(1, Math.max(0, daysFrom(start, today) / daysFrom(start, g.deadline!)));
          const p = goalProgress(g);
          return p < passed * 100 - L.BEHIND_POINTS ? { g, left, p } : null;
        })
        .filter(x => x !== null)
        .sort((x, y) => x.left - y.left)
        .map(x => named(x.g, { pct: pct(x.p), days: x.left })),
  },
  {
    id: 'goal-past',
    cls: 'A',
    view: 'goals',
    cooldown: L.COOLDOWN_A,
    guide: 'behind',
    action: 'editItem',
    hits: ({ db, today }) =>
      activeGoals(db)
        .filter(g => g.deadline && g.deadline < today && hasPercent(g))
        .sort((x, y) => x.deadline!.localeCompare(y.deadline!))
        .map(g => named(g, { pct: pct(goalProgress(g)) })),
  },
  {
    id: 'stuck-step',
    cls: 'A',
    view: 'activities',
    cooldown: L.COOLDOWN_A,
    guide: 'not-starting',
    action: 'editItem',
    hits: ({ db, today }) =>
      steps(db)
        .filter(a => a.status === 'doing' && !isList(a) && !relsTo(a.id, 'subactivity').length)
        .map(a => ({ a, days: daysFrom(statusSince(a) || today, today) }))
        .filter(x => x.days >= L.STUCK_DAYS)
        .sort((x, y) => y.days - x.days)
        .map(x => named(x.a, { n: Math.floor(x.days / 7) })),
  },
  {
    id: 'wrong-way',
    cls: 'A',
    view: 'graphs',
    cooldown: L.COOLDOWN_A,
    guide: 'no-progress',
    action: 'graphs',
    hits: ({ db }) => {
      const seen = new Set<string>();
      return activeGoals(db)
        .filter(g => ownMetric(g) && isNum(g.target))
        .flatMap(g =>
          measures(db, g)
            .filter(s => !isCumulative(s) && !seen.has(s.id))
            .filter(s => {
              seen.add(s.id);
              const far = stateSeries(s)
                .slice(-(L.WRONG_WAY_MOVES + 1))
                .map(m => Math.abs(Number(g.target) - m.value));
              return far.length === L.WRONG_WAY_MOVES + 1 && far.every((x, i) => i === 0 || x > far[i - 1]);
            }),
        )
        .map(s => named(s));
    },
  },
  {
    id: 'too-many-goals',
    cls: 'A',
    view: 'goals',
    cooldown: L.COOLDOWN_A,
    guide: 'too-many',
    action: 'goals',
    hits: ({ db, today }) => {
      const goals = activeGoals(db);
      if (goals.length < L.TOO_MANY_GOALS) return [];
      const late = goals.some(g => g.deadline && g.deadline < today);
      const avg = goals.reduce((s, g) => s + goalProgress(g), 0) / goals.length;
      return late || avg < L.TOO_MANY_GOALS_PROGRESS ? [{ vars: { n: goals.length } }] : [];
    },
  },
  {
    id: 'too-many-routines',
    cls: 'A',
    view: 'activities',
    cooldown: L.COOLDOWN_A,
    guide: 'routine-slips',
    action: 'activities',
    hits: ({ db, today }) => {
      const running = runningRoutines(db, today);
      if (running.length < L.TOO_MANY_ROUTINES) return [];
      const kept = running.map(a => consistency(a)).filter((c): c is number => c !== null);
      const avg = kept.length ? kept.reduce((s, c) => s + c, 0) / kept.length : 1;
      return avg < L.TOO_MANY_ROUTINES_SHARE ? [{ vars: { n: running.length } }] : [];
    },
  },
];
