/** Stored data made safe to use (plans from storage, Drive and files), and reading and resetting plan files. */
import { addDays, isRoutine } from './routines/schedule';
import {
  SYNC_COLLS,
  emptyDb,
  type Activity,
  type Coll,
  type Db,
  type ISODate,
  type ISOTime,
  type IdSet,
  type Relation,
} from './model';
import type { SyncItem } from './merge';
import { migrateCumulative } from './cumulative';
import { dayNum } from './days';
import { today } from './dates';
import { isNum } from './util';

// A plan as storage, Drive or a file may hold it, before normalize checks it.
type RawDb = Partial<Record<Coll | 'deleted', unknown>> | null | undefined;
// The dates a goal or an activity can have; a template moves them all.
type DateKey = 'startDate' | 'deadline' | 'dueDate';
type Dated = { [K in DateKey | 'createdAt']?: ISODate } & { updatedAt?: ISOTime };
// How much progress plan data holds (see progressCounts).
export interface ProgressCounts {
  checkins: number;
  measurements: number;
  done: number;
  started: number;
}
// A plan file as read: its name, whether it is a full copy or a template, and the plan.
export interface PlanFileRead {
  name: string;
  kind: 'full' | 'template';
  data: Db;
}

// Ids go into the page's HTML unescaped, so only items with a plain id are kept (a shared file could
// hide markup in one); relationships need plain ids at both ends too.
export const safeId = (id: unknown): boolean => typeof id === 'string' && /^[\w-]{1,64}$/.test(id);

// Nothing may depend on a routine; older plans, and edits meeting in sync, can hold such links.
export const dropRoutineDeps = (rels: Relation[], activities: Activity[]): Relation[] => {
  const routines = new Set(activities.filter(isRoutine).map(a => a.id));
  return rels.filter(r => !(r.type === 'depends' && routines.has(r.to)));
};

export function normalize(input: unknown): Db {
  const data = input as RawDb;
  const d = emptyDb();
  for (const k of SYNC_COLLS)
    if (Array.isArray(data?.[k]))
      (d[k] as SyncItem[]) = data[k].filter(x => x && typeof x === 'object' && safeId(x.id));
  // "Is related to" links were dropped from the app; old plans and synced copies lose theirs here.
  d.relations = d.relations.filter(r => safeId(r.from) && safeId(r.to) && (r.type as string) !== 'related');
  d.relations = dropRoutineDeps(d.relations, d.activities);
  if (data?.deleted && typeof data.deleted === 'object' && !Array.isArray(data.deleted))
    d.deleted = data.deleted as IdSet<ISOTime>;
  d.activities.forEach(a => {
    if (Array.isArray(a.list)) a.list = a.list.filter(i => i && safeId(i.id) && typeof i.text === 'string');
    else delete a.list;
    if (!a.list || !a.droppedItems || typeof a.droppedItems !== 'object' || Array.isArray(a.droppedItems))
      delete a.droppedItems;
    if (!a.list || !a.listDays || typeof a.listDays !== 'object' || Array.isArray(a.listDays)) delete a.listDays;
  });
  migrateCumulative(d);
  return d;
}

/* A plan file is { format, version, kind, name, exportedAt, goals, states, activities, relations }.
   kind 'full' is an exact copy (a backup); 'template' is the same plan without progress, its dates
   moved to start now, for sharing. Files exported before the header are read as full copies. */
export const PLAN_FORMAT = 'actionplan-plan';
export const PLAN_VERSION = 1;
export const PLAN_DATES: DateKey[] = ['startDate', 'deadline', 'dueDate'];

// A copy of plan data with the progress taken out: goals active again with no current value, no
// measurements, activities to do, no check-ins, no sync bookkeeping. With `shift`, every date moves
// by the same whole number of weeks (so weekly routines keep their days) to put the earliest one this week.
export function resetProgress(data: Db, { shift = false }: { shift?: boolean } = {}): Db {
  const d = normalize(JSON.parse(JSON.stringify(data)));
  d.deleted = {};
  const dated: Dated[] = [...d.goals, ...d.activities];
  const first = dated
    .flatMap(x => PLAN_DATES.map(k => x[k]))
    .filter(Boolean)
    .sort()[0];
  const by = shift && first ? Math.ceil((dayNum(today()) - dayNum(first)) / 7) * 7 : 0;
  for (const x of [...dated, ...d.states, ...d.relations]) delete x.updatedAt;
  for (const x of dated)
    for (const k of [...PLAN_DATES, 'createdAt' as const]) if (by && x[k]) x[k] = addDays(x[k], by);
  d.goals.forEach(g => {
    g.current = '';
    if (g.status === 'achieved') g.status = 'active';
    delete g.offeredAt;
  });
  d.states.forEach(s => {
    Object.assign(s, { value: '', date: '', history: [] });
    delete s.dropped;
    if (s.entries) s.entries = [];
    delete s.droppedEntries;
  });
  d.activities.forEach(a => {
    a.status = 'todo';
    delete a.checkins;
    delete a.autoStarted;
    a.list?.forEach(i => {
      i.done = false;
      delete i.at;
    });
    delete a.droppedItems;
    delete a.listDays;
  });
  return d;
}

// How much progress plan data holds, as the import question lists it.
export function progressCounts(data: Db): ProgressCounts {
  const ticks = (a: Activity) => Object.values(a.checkins || {}).filter(v => v === 1).length;
  return {
    checkins: data.activities.reduce((n, a) => n + ticks(a), 0),
    measurements:
      data.states.reduce(
        (n, s) => n + (s.cumulative ? (s.entries || []).length : (s.history || []).length || (isNum(s.value) ? 1 : 0)),
        0,
      ) + data.goals.filter(g => isNum(g.current)).length,
    done:
      data.activities.filter(a => a.status === 'done').length + data.goals.filter(g => g.status === 'achieved').length,
    // Those started by their start date alone (see startDueActivities) are not progress.
    started: data.activities.filter(a => a.status === 'doing' && !(a.autoStarted && a.autoStarted === a.startDate))
      .length,
  };
}
export const hasProgress = (data: Db): boolean => Object.values(progressCounts(data)).some(Boolean);

// Reads a plan file; throws an error with code 'invalid' (not a plan) or 'version' (from a newer app).
export function parsePlanFile(text: string, fileName: string): PlanFileRead {
  const fail = (code: 'invalid' | 'version') => Object.assign(new Error(code), { code });
  let raw: Record<string, unknown> | null;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw fail('invalid');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail('invalid');
  if (raw.format !== undefined && raw.format !== PLAN_FORMAT) throw fail('invalid');
  if (raw.format && (raw.version as number) > PLAN_VERSION) throw fail('version');
  if (!SYNC_COLLS.some(k => Array.isArray(raw[k]))) throw fail('invalid');
  const name = (typeof raw.name === 'string' && raw.name.trim()) || fileName.replace(/\.json$/i, '');
  return { name, kind: raw.kind === 'template' ? 'template' : 'full', data: normalize(raw) };
}
