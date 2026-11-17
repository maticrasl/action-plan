/** Routines' check-ins and lists: ticked days, list items, and a list routine's items per day. */
import { isRoutine, runsOn } from './schedule';
import { today } from '../dates';

/* A list is a one-off activity with `list`: items ({ id, text, done, at }) to tick off. It is done once
   every item is ticked; unticking one puts a done list back in progress. `at` is when the item was
   last ticked or renamed, and `droppedItems` keeps the ids of removed items, so sync can merge two
   copies item by item. */
export const isList = a => !isRoutine(a) && Array.isArray(a?.list);
export const listDone = a => a.list.filter(i => i.done).length;
export function followList(a) {
  const n = listDone(a);
  if (a.list.length && n === a.list.length) a.status = 'done';
  else if (a.status === 'done' || (n && a.status === 'todo')) a.status = 'doing';
}

/* A list routine is a routine with a `list`: each day it is done, its items are ticked off anew.
   `listDays` maps a date to { itemId: 1 | 0 } (0 kept so sync can merge an untick). Ticking the last
   item ticks the day off; unticking one unticks it again. Ticking the day itself ticks every item. */
export const isListRoutine = a => isRoutine(a) && Array.isArray(a?.list);
export const itemOn = (a, iso, itemId) => a.listDays?.[iso]?.[itemId] === 1;
export const dayItemsDone = (a, iso) => a.list.filter(i => itemOn(a, iso, i.id)).length;
export const setDayItems = (a, iso, ticks) => { a.listDays = { ...a.listDays, [iso]: { ...a.listDays?.[iso], ...ticks } }; };

export const checkedOn = (a, iso) => a.checkins?.[iso] === 1;

export const tickable = (a, iso) => runsOn(a, iso) && iso <= today();
export const setCheckin = (a, iso, on) => { a.checkins = { ...a.checkins, [iso]: on ? 1 : 0 }; };
