/** What was finished when (feature 13): the day a step or goal was done, the done log's entries for a range, and their counts. */
import { isoDate } from './dates';
import type { Activity, Db, Goal, ISODate, ISOTime } from './model';

export type DoneKind = 'step' | 'item' | 'routine' | 'value' | 'amount' | 'goal' | 'note';
export interface DoneEntry {
  day: ISODate;
  kind: DoneKind;
  plan: string;
  id: string; // a list item's is its list's, so tapping it opens the list
  title: string;
  detail?: string; // an item's list title, a value, an amount or the start of a note
  goals?: string[]; // a step's, item's or routine's: the goals it contributes to
}
export interface DoneCounts {
  steps: number;
  routineDays: number;
  values: number;
  goals: number;
}

const dayOf = (t: ISOTime | undefined) => (t ? isoDate(new Date(t)) : undefined);

// Its stored day; before feature 13 the day of its last change stands in (an estimate, never stored).
export const doneDay = (a: Activity): ISODate | undefined =>
  a.status === 'done' ? a.doneAt || dayOf(a.updatedAt) : undefined;
export const achievedDay = (g: Goal): ISODate | undefined =>
  g.status === 'achieved' ? g.achievedAt || dayOf(g.updatedAt) : undefined;

// Newest day first; within a day goals, then items and steps, routines, values, notes.
const ORDER: DoneKind[] = ['goal', 'item', 'step', 'routine', 'amount', 'value', 'note'];
const cut = (s: string) => (s.length > 80 ? s.slice(0, 80) + '…' : s);

export function doneLog(plans: { plan: string; data: Db }[], from: ISODate, to: ISODate): DoneEntry[] {
  const out: DoneEntry[] = [];
  const add = (day: ISODate | undefined, e: Omit<DoneEntry, 'day'>) => {
    if (day && day >= from && day <= to) out.push({ day, ...e });
  };
  for (const { plan, data } of plans) {
    const feeds = new Map<string, string[]>();
    data.relations.forEach(r => r.type === 'contributes' && feeds.set(r.from, [...(feeds.get(r.from) || []), r.to]));
    data.goals.forEach(g => add(achievedDay(g), { kind: 'goal', plan, id: g.id, title: g.title }));
    data.activities.forEach(a => {
      const goals = feeds.get(a.id) || [];
      if (a.repeat) {
        Object.entries(a.checkins || {}).forEach(([day, v]) => {
          if (v === 1) add(day, { kind: 'routine', plan, id: a.id, title: a.title, goals });
        });
      } else if (a.list?.length) {
        a.list.forEach(i => {
          if (i.done)
            add(i.doneAt || dayOf(i.at), { kind: 'item', plan, id: a.id, title: i.text, detail: a.title, goals });
        });
      } else add(doneDay(a), { kind: 'step', plan, id: a.id, title: a.title, goals });
    });
    data.states.forEach(s => {
      if (s.cumulative)
        (s.entries || []).forEach(e => {
          // Added by ticking a routine: the tick already stands for it.
          if (!e.routine) add(e.date, { kind: 'amount', plan, id: s.id, title: s.title, detail: e.amount });
        });
      else s.history.forEach(h => add(h.date, { kind: 'value', plan, id: s.id, title: s.title, detail: h.value }));
    });
    [...data.goals, ...data.activities, ...data.states].forEach(x =>
      x.notes?.forEach(n => add(n.date, { kind: 'note', plan, id: x.id, title: x.title, detail: cut(n.text) })),
    );
  }
  return out.sort((x, y) => y.day.localeCompare(x.day) || ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind));
}

export function weekCounts(entries: DoneEntry[]): DoneCounts {
  const n = (...kinds: DoneKind[]) => entries.filter(e => kinds.includes(e.kind)).length;
  return { steps: n('step', 'item'), routineDays: n('routine'), values: n('value', 'amount'), goals: n('goal') };
}
