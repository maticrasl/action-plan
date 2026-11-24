/** Reviews (feature 14 C), the year's facts: counts, goals reached with their closing notes, the biggest changes in states. */
import type { ISODate, State } from './model';
import type { PlanSource } from './today';
import { achievedDay, doneLog, weekCounts, type DoneCounts } from './done-log';
import { isCumulative } from './cumulative';
import { isNum } from './util';

export interface YearFacts {
  stats: DoneCounts;
  reached: { plan: string; id: string; title: string; day: ISODate; note?: string }[];
  changes: { plan: string; state: State; first: number; last: number }[];
}

export const yearRange = (year: string) => ({ from: `${year}-01-01`, to: `${year}-12-31` });

export function yearFacts(sources: PlanSource[], year: string): YearFacts {
  const { from, to } = yearRange(year);
  const inYear = (d: ISODate | undefined): d is ISODate => !!d && d >= from && d <= to;
  const reached = sources
    .flatMap(({ plan, data }) =>
      data.goals
        .map(g => ({ g, day: achievedDay(g) }))
        .filter((x): x is { g: (typeof x)['g']; day: ISODate } => inYear(x.day))
        .map(({ g, day }) => ({
          plan,
          id: g.id,
          title: g.title,
          day,
          note: g.notes?.filter(n => n.kind === 'closing').at(-1)?.text,
        })),
    )
    .sort((a, b) => a.day.localeCompare(b.day));
  // Plain states with two values or more in the year: first and last. The largest change for its size first.
  // shortcut: "relative to its own range" read as the change over the larger of the two values; tune when asked.
  const changes = sources
    .flatMap(({ plan, data }) =>
      data.states
        .filter(s => !isCumulative(s))
        .map(s => {
          const vs = (s.history || [])
            .filter(h => inYear(h.date) && isNum(h.value))
            .sort((a, b) => a.date.localeCompare(b.date));
          return vs.length < 2 ? null : { plan, state: s, first: Number(vs[0].value), last: Number(vs.at(-1)!.value) };
        })
        .filter((x): x is YearFacts['changes'][number] => !!x && x.first !== x.last),
    )
    .sort((a, b) => rel(b) - rel(a));
  return { stats: weekCounts(doneLog(sources, from, to)), reached, changes };
}
const rel = (c: { first: number; last: number }) =>
  Math.abs(c.last - c.first) / Math.max(Math.abs(c.first), Math.abs(c.last), 1e-9);
