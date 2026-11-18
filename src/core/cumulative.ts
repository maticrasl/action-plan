/** States whose amounts add up: entries, totals per calendar period, and routines that feed them. */
import { addDays, isRoutine, periodUnit, unitFrom, unitIndex, type Routine, type Span } from './routines/schedule';
import type { Activity, Db, Entry, Goal, ISODate, Measurement, Period, Scale, State } from './model';
import { isNum, uid } from './util';
import { today } from './dates';
import { relsFrom, relsTo } from './relations';
import { db } from './state';
import { setCheckin, tickable } from './routines/checkins';

/* ---------- Cumulative states: amounts that add up ----------
   A state with `cumulative: true` keeps `entries` ({ id, date, amount, routine? }) that add up,
   several a day if need be, instead of one value per date. `routine` is the routine whose tick the
   entry belongs to. How the sums are looked at is not the state's: its graph shows them per
   calendar 'day', 'week' (Monday to Sunday), 'month' or 'year', or in total, as last chosen
   (`scale`), and each goal it measures counts them by its own `period`.
   Deleted entry ids stay in `droppedEntries`, so syncing with an older copy does not bring them
   back. `value` and `date` keep a copy of the total for older readers.
   A routine that improves a cumulative state and the state keep in step: ticking a day can add
   an amount, an amount added on the state ticks the routine, unticking removes the routine's
   amounts that day, and deleting its last amount that day unticks it. */

// A period's sum on a graph, with the entries in it.
export interface PeriodTotal extends Span {
  total: number;
  entries: Entry[];
}
export type CumulativeState = State & { cumulative: true };
// A state as older plans stored it, before `cumulative` became true or absent.
type OldState = Omit<State, 'cumulative'> & { cumulative?: boolean | string };

export const PERIODS: Period[] = ['day', 'week', 'month', 'year'];
export const SCALES: Scale[] = [...PERIODS, 'total'];
export const isCumulative = (s: State | null | undefined): s is CumulativeState => !!s?.cumulative;
export const stateScale = (s: { scale?: Scale } | null | undefined): Scale =>
  SCALES.includes(s?.scale as Scale) ? s!.scale! : 'total';
// A routine's graph shows its own periods (with what each asks for) until another scale is picked.
export const graphScale = (item: State | Routine): Scale =>
  !isRoutine(item) ? stateScale(item) : SCALES.includes(item.scale as Scale) ? item.scale! : periodUnit(item);
export const goalPeriod = (g: Goal | null | undefined): Scale =>
  PERIODS.includes(g?.period as Period) ? g!.period! : 'total';

// Before, a state added up per period itself (`cumulative: 'week'`, or 'none' for in total): the
// period becomes its graph's scale and the period of the goals it measures that have none yet.
export function migrateCumulative(d: Db): void {
  for (const s of d.states as OldState[]) {
    if (typeof s.cumulative !== 'string') continue;
    const was = s.cumulative === 'none' ? 'total' : s.cumulative;
    Object.assign(s, { cumulative: true, scale: SCALES.includes(was as Scale) ? was : 'total' });
    refreshTotal(s as State); // the stored copy was the period's total
    d.relations
      .filter(r => r.type === 'measures' && r.from === s.id)
      .forEach(r => {
        const g = d.goals.find(x => x.id === r.to);
        if (g && !g.period) g.period = s.scale;
      });
  }
}

// The calendar day, week, month or year around a date.
export function calPeriod(unit: Period, iso: ISODate): Span {
  const i = unitIndex(iso, unit);
  return { from: unitFrom(i, unit), to: addDays(unitFrom(i + 1, unit), -1) };
}

export const entriesOf = (s: State): Entry[] => (s.entries || []).filter(e => e.date && isNum(e.amount));
// Rounded, so 0.1 + 0.2 adds up to 0.3.
export const sumOf = (list: Entry[]): number => Number(list.reduce((n, e) => n + Number(e.amount), 0).toFixed(9));

// The total of the `period` around `iso`, or in total of everything up to it.
export function stateTotal(s: State, period: Scale = 'total', iso: ISODate = today()): number {
  if (period === 'total') return sumOf(entriesOf(s).filter(e => e.date <= iso));
  const { from, to } = calPeriod(period, iso);
  return sumOf(entriesOf(s).filter(e => e.date >= from && e.date <= to));
}
// The previous period's total.
export const lastPeriodTotal = (s: State, period: Period, iso: ISODate = today()): number =>
  stateTotal(s, period, addDays(calPeriod(period, iso).from, -1));

// A state's value and date: the latest measurement, or a cumulative state's total ('' with no entries yet).
export function stateValue(s: State): string | number {
  if (!isCumulative(s)) return s.value;
  return entriesOf(s).length ? stateTotal(s) : '';
}
export function stateDate(s: State): ISODate | undefined {
  if (!isCumulative(s)) return s.date;
  return entriesOf(s).reduce((d, e) => (e.date > d ? e.date : d), '');
}
export function refreshTotal(s: State): void {
  const v = stateValue(s);
  Object.assign(s, { value: v === '' ? '' : String(v), date: stateDate(s) });
}

// What a graph adds up: a state's amounts, or a routine's check-ins, one each.
export const graphEntries = (item: State | Routine): Entry[] =>
  !isRoutine(item)
    ? entriesOf(item)
    : Object.keys(item.checkins || {})
        .filter(d => item.checkins![d] === 1)
        .sort()
        .map(date => ({ id: date, date, amount: '1' }));

// Each `period` from the first entry's to today's (or the latest entry's), empty ones included.
export function periodTotals(s: State | Routine, period: Period): PeriodTotal[] {
  const list = graphEntries(s);
  if (!list.length || !PERIODS.includes(period)) return [];
  const dates = list.map(e => e.date).sort();
  const end = dates.at(-1)! > today() ? dates.at(-1)! : today();
  // Entries sorted into their periods in one pass: years of daily periods would each scan them all.
  const byPeriod = new Map<number, Entry[]>();
  list.forEach(e => {
    const i = unitIndex(e.date, period);
    byPeriod.has(i) ? byPeriod.get(i)!.push(e) : byPeriod.set(i, [e]);
  });
  const out: PeriodTotal[] = [];
  for (
    let p = calPeriod(period, dates[0]);
    p.from <= end && out.length < 5000;
    p = calPeriod(period, addDays(p.to, 1))
  ) {
    const entries = byPeriod.get(unitIndex(p.from, period)) || [];
    out.push({ ...p, total: sumOf(entries), entries });
  }
  return out;
}

export const improvedStates = (a: Activity): State[] =>
  relsFrom(a.id, 'improves')
    .map(r => db.states.find(s => s.id === r.to))
    .filter(isCumulative);
export const feedingRoutines = (s: State): Routine[] =>
  relsTo(s.id, 'improves')
    .map(r => db.activities.find(a => a.id === r.from))
    .filter(isRoutine);

// Adds an amount. From a routine's tick it is tagged with the routine; added on the state, it ticks
// the routines that feed the state that day, tagged when there is just one.
export function addEntry(s: State, date: ISODate, amount: number | string, routine: Activity | null = null): Entry {
  const e: Entry = { id: uid(), date, amount: String(amount) };
  if (routine) e.routine = routine.id;
  else {
    const feeds = feedingRoutines(s);
    feeds.filter(a => tickable(a, date)).forEach(a => setCheckin(a, date, true));
    if (feeds.length === 1 && tickable(feeds[0], date)) e.routine = feeds[0].id;
  }
  (s.entries ||= []).push(e);
  refreshTotal(s);
  return e;
}

export function dropEntry(s: State, id: string): void {
  s.entries = (s.entries || []).filter(e => e.id !== id);
  s.droppedEntries = { ...s.droppedEntries, [id]: 1 };
  refreshTotal(s);
}

// Deleting a routine's last amount on a day unticks the routine that day.
export function deleteEntry(s: State, id: string): void {
  const e = (s.entries || []).find(x => x.id === id);
  if (!e) return;
  dropEntry(s, id);
  const a = e.routine && db.activities.find(x => x.id === e.routine);
  if (a && isRoutine(a) && !db.states.some(st => (st.entries || []).some(x => x.routine === a.id && x.date === e.date)))
    setCheckin(a, e.date, false);
}

// Unticking a routine's day removes the amounts its tick added that day.
export function dropRoutineEntries(a: Activity, iso: ISODate): void {
  db.states.forEach(s =>
    (s.entries || []).filter(e => e.routine === a.id && e.date === iso).forEach(e => dropEntry(s, e.id)),
  );
}

// Plain → cumulative: each measurement becomes an entry. Cumulative → plain: each day's entries add
// up to that day's measurement. The graph's scale is kept either way.
export function convertState(s: State, addsUp: boolean): void {
  if (!addsUp) {
    if (!isCumulative(s)) return;
    const days: Record<ISODate, number> = {};
    entriesOf(s).forEach(e => (days[e.date] = (days[e.date] || 0) + Number(e.amount)));
    s.history = Object.entries(days)
      .sort()
      .map(([date, v]) => ({ date, value: String(Number(v.toFixed(9))) }));
    s.history.forEach(h => delete s.dropped?.[h.date]);
    if (s.dropped && !Object.keys(s.dropped).length) delete s.dropped;
    delete (s as State).cumulative;
    followLatest(s);
    return;
  }
  if (!isCumulative(s)) {
    (s.entries || []).forEach(e => (s.droppedEntries = { ...s.droppedEntries, [e.id]: 1 }));
    s.entries = (s.history || [])
      .filter(h => h.date && isNum(h.value))
      .map(h => ({ id: uid(), date: h.date, amount: String(h.value) }));
  }
  s.cumulative = true;
  refreshTotal(s);
}

export function followLatest(s: State): void {
  const last = s.history.reduce<Measurement | null>((a, h) => (!a || h.date > a.date ? h : a), null);
  Object.assign(s, last ? { value: last.value, date: last.date } : { value: '' });
}

// One measurement per date: a new value for a date replaces the old one. The state's value is its latest measurement.
export function recordMeasurement(s: State, date: ISODate, value: string) {
  s.history = (s.history || [])
    .filter(h => h.date !== date)
    .concat({ date, value })
    .sort((a, b) => a.date.localeCompare(b.date));
  if (s.dropped) {
    delete s.dropped[date];
    if (!Object.keys(s.dropped).length) delete s.dropped;
  }
  followLatest(s);
}

// A deleted date is remembered, so syncing with an older copy does not bring the measurement back.
export function deleteMeasurement(s: State, date: ISODate) {
  s.history = (s.history || []).filter(h => h.date !== date);
  s.dropped = { ...s.dropped, [date]: 1 };
  followLatest(s);
}
