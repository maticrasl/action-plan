/** States whose amounts add up: entries, totals per calendar period, and routines that feed them. */
import { addDays, isRoutine, periodUnit, unitFrom, unitIndex } from './routines/schedule';
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

export const PERIODS = ['day', 'week', 'month', 'year'];
export const SCALES = [...PERIODS, 'total'];
export const isCumulative = s => !!s?.cumulative;
export const stateScale = s => (SCALES.includes(s?.scale) ? s.scale : 'total');
// A routine's graph shows its own periods (with what each asks for) until another scale is picked.
export const graphScale = item => (!isRoutine(item) ? stateScale(item) : SCALES.includes(item.scale) ? item.scale : periodUnit(item));
export const goalPeriod = g => (PERIODS.includes(g?.period) ? g.period : 'total');

// Before, a state added up per period itself (`cumulative: 'week'`, or 'none' for in total): the
// period becomes its graph's scale and the period of the goals it measures that have none yet.
export function migrateCumulative(d) {
  for (const s of d.states) {
    if (typeof s.cumulative !== 'string') continue;
    const was = s.cumulative === 'none' ? 'total' : s.cumulative;
    Object.assign(s, { cumulative: true, scale: SCALES.includes(was) ? was : 'total' });
    refreshTotal(s); // the stored copy was the period's total
    d.relations.filter(r => r.type === 'measures' && r.from === s.id).forEach(r => {
      const g = d.goals.find(x => x.id === r.to);
      if (g && !g.period) g.period = s.scale;
    });
  }
}

// The calendar day, week, month or year around a date.
export function calPeriod(unit, iso) {
  const i = unitIndex(iso, unit);
  return { from: unitFrom(i, unit), to: addDays(unitFrom(i + 1, unit), -1) };
}

export const entriesOf = s => (s.entries || []).filter(e => e.date && isNum(e.amount));
// Rounded, so 0.1 + 0.2 adds up to 0.3.
export const sumOf = list => Number(list.reduce((n, e) => n + Number(e.amount), 0).toFixed(9));

// The total of the `period` around `iso`, or in total of everything up to it.
export function stateTotal(s, period = 'total', iso = today()) {
  if (period === 'total') return sumOf(entriesOf(s).filter(e => e.date <= iso));
  const { from, to } = calPeriod(period, iso);
  return sumOf(entriesOf(s).filter(e => e.date >= from && e.date <= to));
}
// The previous period's total.
export const lastPeriodTotal = (s, period, iso = today()) => stateTotal(s, period, addDays(calPeriod(period, iso).from, -1));

// A state's value and date: the latest measurement, or a cumulative state's total ('' with no entries yet).
export function stateValue(s) {
  if (!isCumulative(s)) return s.value;
  return entriesOf(s).length ? stateTotal(s) : '';
}
export function stateDate(s) {
  if (!isCumulative(s)) return s.date;
  return entriesOf(s).reduce((d, e) => (e.date > d ? e.date : d), '');
}
export function refreshTotal(s) {
  const v = stateValue(s);
  Object.assign(s, { value: v === '' ? '' : String(v), date: stateDate(s) });
}

// What a graph adds up: a state's amounts, or a routine's check-ins, one each.
export const graphEntries = item => (!isRoutine(item) ? entriesOf(item)
  : Object.keys(item.checkins || {}).filter(d => item.checkins[d] === 1).sort().map(date => ({ id: date, date, amount: '1' })));

// Each `period` from the first entry's to today's (or the latest entry's), empty ones included.
export function periodTotals(s, period) {
  const list = graphEntries(s);
  if (!list.length || !PERIODS.includes(period)) return [];
  const dates = list.map(e => e.date).sort();
  const end = dates.at(-1) > today() ? dates.at(-1) : today();
  // Entries sorted into their periods in one pass: years of daily periods would each scan them all.
  const byPeriod = new Map();
  list.forEach(e => {
    const i = unitIndex(e.date, period);
    byPeriod.has(i) ? byPeriod.get(i).push(e) : byPeriod.set(i, [e]);
  });
  const out = [];
  for (let p = calPeriod(period, dates[0]); p.from <= end && out.length < 5000; p = calPeriod(period, addDays(p.to, 1))) {
    const entries = byPeriod.get(unitIndex(p.from, period)) || [];
    out.push({ ...p, total: sumOf(entries), entries });
  }
  return out;
}

export const improvedStates = a => relsFrom(a.id, 'improves').map(r => db.states.find(s => s.id === r.to)).filter(isCumulative);
export const feedingRoutines = s => relsTo(s.id, 'improves').map(r => db.activities.find(a => a.id === r.from)).filter(isRoutine);

// Adds an amount. From a routine's tick it is tagged with the routine; added on the state, it ticks
// the routines that feed the state that day, tagged when there is just one.
export function addEntry(s, date, amount, routine = null) {
  const e = { id: uid(), date, amount: String(amount) };
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

export function dropEntry(s, id) {
  s.entries = (s.entries || []).filter(e => e.id !== id);
  s.droppedEntries = { ...s.droppedEntries, [id]: 1 };
  refreshTotal(s);
}

// Deleting a routine's last amount on a day unticks the routine that day.
export function deleteEntry(s, id) {
  const e = (s.entries || []).find(x => x.id === id);
  if (!e) return;
  dropEntry(s, id);
  const a = e.routine && db.activities.find(x => x.id === e.routine);
  if (a && isRoutine(a) && !db.states.some(st => (st.entries || []).some(x => x.routine === a.id && x.date === e.date))) setCheckin(a, e.date, false);
}

// Unticking a routine's day removes the amounts its tick added that day.
export function dropRoutineEntries(a, iso) {
  db.states.forEach(s => (s.entries || []).filter(e => e.routine === a.id && e.date === iso).forEach(e => dropEntry(s, e.id)));
}

// Plain → cumulative: each measurement becomes an entry. Cumulative → plain: each day's entries add
// up to that day's measurement. The graph's scale is kept either way.
export function convertState(s, addsUp) {
  if (!addsUp) {
    if (!isCumulative(s)) return;
    const days = {};
    entriesOf(s).forEach(e => (days[e.date] = (days[e.date] || 0) + Number(e.amount)));
    s.history = Object.entries(days).sort().map(([date, v]) => ({ date, value: String(Number(v.toFixed(9))) }));
    s.history.forEach(h => delete s.dropped?.[h.date]);
    if (s.dropped && !Object.keys(s.dropped).length) delete s.dropped;
    delete s.cumulative;
    followLatest(s);
    return;
  }
  if (!isCumulative(s)) {
    (s.entries || []).forEach(e => (s.droppedEntries = { ...s.droppedEntries, [e.id]: 1 }));
    s.entries = (s.history || []).filter(h => h.date && isNum(h.value)).map(h => ({ id: uid(), date: h.date, amount: String(h.value) }));
  }
  s.cumulative = true;
  refreshTotal(s);
}

export function followLatest(s) {
  const last = s.history.reduce((a, h) => (!a || h.date > a.date ? h : a), null);
  Object.assign(s, last ? { value: last.value, date: last.date } : { value: '' });
}
