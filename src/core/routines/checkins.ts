/** Routines' check-ins and lists: ticked days, list items, and a list routine's items per day. */
import { isRoutine, runsOn, type Routine } from './schedule';
import { today } from '../dates';
import type { Activity, IdSet, ISODate, ListItem } from '../model';

// A list, or a list routine.
export type WithList = Activity & { list: ListItem[] };

/* A list is a one-off activity with `list`: items ({ id, text, done, at }) to tick off. It is done once
   every item is ticked; unticking one puts a done list back in progress. `at` is when the item was
   last ticked or renamed, and `droppedItems` keeps the ids of removed items, so sync can merge two
   copies item by item. */
export const isList = (a: Activity | null | undefined): a is WithList => !isRoutine(a) && Array.isArray(a?.list);
export const listDone = (a: WithList): number => a.list.filter(i => i.done).length;
export function followList(a: WithList): void {
  const n = listDone(a);
  if (a.list.length && n === a.list.length) a.status = 'done';
  else if (a.status === 'done' || (n && a.status === 'todo')) a.status = 'doing';
}

/* A list routine is a routine with a `list`: each day it is done, its items are ticked off anew.
   `listDays` maps a date to { itemId: 1 | 0 } (0 kept so sync can merge an untick). Ticking the last
   item ticks the day off; unticking one unticks it again. Ticking the day itself ticks every item. */
export const isListRoutine = (a: Activity | null | undefined): a is Routine & WithList =>
  isRoutine(a) && Array.isArray(a?.list);
export const itemOn = (a: Activity, iso: ISODate, itemId: string): boolean => a.listDays?.[iso]?.[itemId] === 1;
export const dayItemsDone = (a: WithList, iso: ISODate): number => a.list.filter(i => itemOn(a, iso, i.id)).length;
export const setDayItems = (a: Activity, iso: ISODate, ticks: IdSet<0 | 1>): void => {
  a.listDays = { ...a.listDays, [iso]: { ...a.listDays?.[iso], ...ticks } };
};

export const checkedOn = (a: Activity, iso: ISODate): boolean => a.checkins?.[iso] === 1;

export const tickable = (a: Activity, iso: ISODate): boolean => runsOn(a, iso) && iso <= today();
export const setCheckin = (a: Activity, iso: ISODate, on: boolean): void => {
  a.checkins = { ...a.checkins, [iso]: on ? 1 : 0 };
};
