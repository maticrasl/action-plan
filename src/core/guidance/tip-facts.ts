/** Facts the tips share: ages, last activity, what measures a goal, routines that run, and the tip types. */
import type { Activity, Db, Goal, ISODate, State, Vision } from '../model';
import { dayNum } from '../days';
import { isRoutine, routineStart, type Routine } from '../routines/schedule';
import { isCumulative } from '../cumulative';
import { relsTo } from '../relations';

// What every condition reads. The progress helpers read the open plan (core/state), which is `db`.
export interface TipInput {
  db: Db;
  visions: Vision[];
  today: ISODate;
  lastReview?: ISODate; // the last weekly review (seen)
  prevDay?: ISODate; // the last day a tip of the day was chosen before today
  since?: Record<string, ISODate>; // facts the tips saw first on a day (tips.since)
  seen?: TipSeen;
  device?: TipDevice; // unknown in tests of rules that do not need it; tips that need it stay quiet
}
// What this device remembers of using the app (store/seen).
export interface TipSeen {
  days?: ISODate[]; // days opened (the last 30)
  views?: Record<string, boolean | undefined>;
  menu?: boolean; // a card's menu was opened
  templates?: boolean; // the templates were opened
  exported?: boolean; // a full copy was saved
}
export interface TipDevice {
  synced: boolean; // signed in with Google, so the plans are in Drive
  canInstall: boolean; // the browser offers a way to install the app
  installed: boolean;
  fine: boolean; // a mouse or trackpad (Ctrl + Enter makes sense)
}
// One thing a tip can say: the item or period it is keyed to, the numbers in its text, and the
// item its button acts on (the keyed item when not given).
export interface TipHit {
  id?: string;
  vars?: Record<string, string | number>;
  target?: string;
}
export type TipClass = 'A' | 'B' | 'C' | 'D';
export type TipView = 'dashboard' | 'goals' | 'activities' | 'graphs';
export type TipAction =
  | 'timeline'
  | 'replan'
  | 'goals'
  | 'activities'
  | 'graphs'
  | 'editItem'
  | 'closingNote'
  | 'addActivity'
  | 'addRoutine'
  | 'addState'
  | 'addSubgoal'
  | 'addVision'
  | 'recordValue'
  | 'review'
  | 'map'
  | 'addRoutineList'
  | 'templates'
  | 'backup'
  | 'install'
  | 'share'
  | 'working';
export interface Tip {
  id: string;
  cls: TipClass;
  view: TipView; // the view it also shows on (the Overview shows every tip)
  cooldown: number; // days before it may come back; 0: once per key
  guide?: string; // the Guide article "Why this helps" opens
  action?: TipAction;
  action2?: TipAction; // a second button, its text in tip.<id>.btn2
  // Every item it is true for, the best fit first; empty when it is not true.
  hits(inp: TipInput): TipHit[];
}

export const daysFrom = (from: ISODate, to: ISODate) => dayNum(to) - dayNum(from);
// The same day `n` months later (the month's last day when it is shorter).
export function addMonths(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.toISOString().slice(0, 8)}${String(Math.min(d, last)).padStart(2, '0')}`;
}
// Whole months from one day to a later one.
export function monthsFrom(from: ISODate, to: ISODate): number {
  let n = 0;
  while (addMonths(from, n + 1) <= to && n < 1200) n++;
  return n;
}
export const dayOf = (t?: string) => (t ? t.slice(0, 10) : undefined);

export const activeGoals = (db: Db) => db.goals.filter(g => g.status === 'active');
export const steps = (db: Db) => db.activities.filter(a => !isRoutine(a));
// Routines that have started and not ended.
export const runningRoutines = (db: Db, today: ISODate) =>
  db.activities.filter(
    (a): a is Routine => isRoutine(a) && routineStart(a) <= today && !(a.dueDate && a.dueDate < today),
  );

// A goal's age in days; a goal from before `createdAt` existed counts as old.
export const goalAge = (g: Goal, today: ISODate) => (g.createdAt ? daysFrom(g.createdAt, today) : Infinity);

// Since when an item has had its status: `statusSince`, an auto-start's day, then the last change, then creation.
export function statusSince(x: Goal | Activity): ISODate | undefined {
  if (x.statusSince) return x.statusSince;
  if ('autoStarted' in x && x.status === 'doing' && x.autoStarted && x.autoStarted === x.startDate)
    return x.autoStarted;
  return dayOf(x.updatedAt) || x.createdAt;
}

// The day of the user's first item in this plan (or among their visions).
export function firstItemDay(db: Db, visions: Vision[]): ISODate | undefined {
  const days = [
    ...[...db.goals, ...db.activities, ...visions].map(x => x.createdAt || dayOf(x.updatedAt)),
    ...db.states.map(s => dayOf(s.updatedAt)),
    ...db.states.flatMap(s => (s.history || []).map(h => h.date)),
  ].filter((d): d is string => !!d);
  return days.length ? days.reduce((a, b) => (a < b ? a : b)) : undefined;
}

// The newest day before `today` on which the plan shows something done: an edit, a tick, a measurement.
export function lastActivity(db: Db, today: ISODate): ISODate | undefined {
  let last: ISODate | undefined;
  const see = (d?: string) => {
    if (d && d < today && (!last || d > last)) last = d;
  };
  [...db.goals, ...db.activities, ...db.states, ...db.relations].forEach(x => see(dayOf(x.updatedAt)));
  db.activities.forEach(a => {
    Object.entries(a.checkins || {}).forEach(([d, v]) => v === 1 && see(d));
    Object.keys(a.listDays || {}).forEach(see);
  });
  db.states.forEach(s => {
    (s.history || []).forEach(h => see(h.date));
    (s.entries || []).forEach(e => see(e.date));
  });
  return last;
}

// The states that measure a goal.
export const measures = (db: Db, g: Goal): State[] =>
  relsTo(g.id, 'measures')
    .map(r => db.states.find(s => s.id === r.from))
    .filter((s): s is State => !!s);
// The day a state was last measured (a state that adds up: its last entry).
export function lastMeasured(s: State): ISODate | undefined {
  const days = isCumulative(s) ? (s.entries || []).map(e => e.date) : [s.date, ...(s.history || []).map(h => h.date)];
  return days
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
}
