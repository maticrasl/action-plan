/** A measured state's values as a dated series, and which states and routines have enough data for a graph. */
import type { Activity, State } from './model';
import { isNum } from './util';
import { dayNum } from './days';
import { isRoutine } from './routines/schedule';
import { entriesOf, isCumulative } from './cumulative';

export function stateSeries(s: State) {
  return (s.history || [])
    .filter(h => h.date && isNum(h.value))
    .map(h => ({ day: dayNum(h.date), date: h.date, value: Number(h.value) }))
    .sort((a, b) => a.day - b.day);
}

// States with measurements or amounts, and routines with check-ins, have a graph.
export const hasGraph = (item: State | Activity) =>
  isRoutine(item)
    ? Object.values(item.checkins || {}).includes(1)
    : isCumulative(item as State)
      ? entriesOf(item as State).length > 0
      : stateSeries(item as State).length > 0;
