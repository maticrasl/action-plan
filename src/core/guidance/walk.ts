/** Getting started: its stages and tasks, when each task is done, and what the card shows. */
import type { Db, ISODate, Vision } from '../model';
import { isRoutine } from '../routines/schedule';
import { ownMetric } from '../progress';

export const STAGES = [
  { id: 'first', tasks: ['goal', 'state', 'steps', 'firstDone'] },
  { id: 'rhythm', tasks: ['routine', 'tick', 'measure', 'days'] },
  { id: 'safe', tasks: ['backup', 'install'] },
  { id: 'picture', tasks: ['views', 'vision', 'review'] },
] as const;
export type StageId = (typeof STAGES)[number]['id'];
export type TaskId = (typeof STAGES)[number]['tasks'][number];
export const TASKS: TaskId[] = STAGES.flatMap(s => [...s.tasks]);
export const OPTIONAL: TaskId[] = ['install', 'vision'];
export const WALK_VIEWS = ['map', 'timeline', 'graphs'] as const;
export const DAYS_NEEDED = 3;

// What is stored (preference `walk`, per user and device). Unset reads as off: only a first visit turns it on.
export interface Walk {
  state: 'on' | 'off' | 'finished';
  started?: ISODate;
  done: Partial<Record<TaskId, ISODate>>;
  skipped: TaskId[];
  folded?: boolean;
}
export const walkOff = (): Walk => ({ state: 'off', done: {}, skipped: [] });

// What the checks read besides the plan: usage facts (`seen`) and the device.
export interface WalkSeen {
  days?: ISODate[];
  views?: Partial<Record<string, boolean>>;
  exported?: boolean;
  lastReview?: ISODate;
}
export interface WalkEnv {
  syncOn: boolean; // sync is set up for this copy of the app
  synced: boolean; // this user's plans synced once
  installed: boolean;
  canInstall: boolean; // the browser's prompt, or a hint for installing by hand
}
export interface WalkInput {
  db: Db;
  visions: Vision[];
  seen: WalkSeen;
  env: WalkEnv;
  started?: ISODate;
}

const goalIds = (db: Db) => new Set(db.goals.map(g => g.id));
const hasValue = (s: Db['states'][number]) =>
  s.cumulative ? !!s.entries?.length : !!(String(s.value ?? '').trim() || s.history?.length);
const valueDays = (s: Db['states'][number]) =>
  s.cumulative
    ? (s.entries || []).length
    : new Set([...(s.history || []).map(m => m.date), ...(String(s.value ?? '').trim() && s.date ? [s.date] : [])]).size;
const ticked = (db: Db) =>
  db.activities.some(
    a =>
      Object.values(a.checkins || {}).includes(1) ||
      Object.values(a.listDays || {}).some(d => Object.values(d).includes(1)),
  );
export const daysSince = (seen: WalkSeen, started?: ISODate) =>
  new Set((seen.days || []).filter(d => !started || d >= started)).size;

// "Not needed" tasks show as done with a note; they are not latched, so they reopen when the plan changes.
// Only once there are goals and none of them is measured: before the first goal everything is needed.
export function notNeeded(id: TaskId, { db }: WalkInput): boolean {
  const unmeasured = db.goals.length > 0 && !db.goals.some(ownMetric);
  if (id === 'state') return unmeasured;
  if (id === 'measure') return unmeasured && !db.states.length;
  return false;
}

// Whether the plan (and the usage facts) show the task done now.
export function checkTask(id: TaskId, inp: WalkInput): boolean {
  const { db, visions, seen, env } = inp;
  const goals = goalIds(db);
  switch (id) {
    case 'goal':
      return db.goals.length > 0;
    case 'state': {
      const valued = new Set(db.states.filter(hasValue).map(s => s.id));
      return db.relations.some(r => r.type === 'measures' && valued.has(r.from) && goals.has(r.to));
    }
    case 'steps':
      return (
        new Set(db.relations.filter(r => r.type === 'contributes' && goals.has(r.to)).map(r => r.from)).size >= 2
      );
    case 'firstDone':
      return (
        db.activities.some(a => a.status === 'done' || a.list?.some(i => i.done)) ||
        ticked(db)
      );
    case 'routine':
      return db.activities.some(isRoutine);
    case 'tick':
      return ticked({ ...db, activities: db.activities.filter(isRoutine) });
    case 'measure':
      return db.states.some(s => valueDays(s) >= 2);
    case 'days':
      return daysSince(seen, inp.started) >= DAYS_NEEDED;
    case 'backup':
      return env.synced || !!seen.exported;
    case 'install':
      return env.installed;
    case 'views':
      return WALK_VIEWS.every(v => seen.views?.[v]);
    case 'vision':
      return visions.some(v => db.goals.some(g => g.visions?.includes(v.id)));
    case 'review':
      return !!seen.lastReview && (!inp.started || seen.lastReview >= inp.started);
  }
}

// Tasks that do not count: installing where the browser cannot and there is nothing to say.
export const leftOut = (id: TaskId, env: WalkEnv) => id === 'install' && !env.installed && !env.canInstall;

// Ticks what is true now; a tick stays, and a skipped task that becomes true turns into a tick.
export function latch(walk: Walk, inp: WalkInput, today: ISODate): Walk {
  const done = { ...walk.done };
  let changed = false;
  TASKS.forEach(id => {
    if (!done[id] && !notNeeded(id, inp) && checkTask(id, inp)) {
      done[id] = today;
      changed = true;
    }
  });
  if (!changed) return walk;
  return { ...walk, done, skipped: walk.skipped.filter(id => !done[id]) };
}

export type TaskStatus = 'done' | 'skipped' | 'notNeeded' | 'open';
export interface TaskView {
  id: TaskId;
  status: TaskStatus;
  optional: boolean;
}
export interface StageView {
  id: StageId;
  tasks: TaskView[];
  done: number;
  total: number;
}
export interface WalkView {
  stages: StageView[];
  done: number;
  total: number;
  next: TaskId | null; // the first open task; null when all are done
  days: number;
}

export function taskStatus(id: TaskId, walk: Walk, inp: WalkInput): TaskStatus {
  if (walk.done[id]) return 'done';
  if (notNeeded(id, inp)) return 'notNeeded';
  if (walk.skipped.includes(id)) return 'skipped';
  return 'open';
}

// What the card shows: the stored ticks and what the plan shows now (call `latch` first to keep them).
export function walkView(walk: Walk, inp: WalkInput): WalkView {
  const stages = STAGES.map(s => {
    const tasks = s.tasks
      .filter(id => !leftOut(id, inp.env))
      .map(id => ({ id, status: taskStatus(id, walk, inp), optional: OPTIONAL.includes(id) }));
    return { id: s.id, tasks, done: tasks.filter(x => x.status !== 'open').length, total: tasks.length };
  });
  const all = stages.flatMap(s => s.tasks);
  return {
    stages,
    done: all.filter(x => x.status !== 'open').length,
    total: all.length,
    next: all.find(x => x.status === 'open')?.id ?? null,
    days: Math.min(daysSince(inp.seen, inp.started), DAYS_NEEDED),
  };
}

// Two tabs saving: neither loses the other's ticks (the earlier date of a tick is kept).
export function mergeWalk(mine: Walk, stored: Walk | null): Walk {
  if (!stored) return mine;
  const done = { ...stored.done };
  (Object.entries(mine.done) as [TaskId, ISODate][]).forEach(([id, d]) => {
    if (!done[id] || d < done[id]!) done[id] = d;
  });
  const skipped = [...new Set([...stored.skipped, ...mine.skipped])].filter(id => !done[id]);
  return { ...mine, done, skipped };
}

// A stored value made safe; anything unreadable is "not set".
export function readWalk(v: unknown): Walk | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const w = v as Partial<Walk>;
  if (w.state !== 'on' && w.state !== 'off' && w.state !== 'finished') return null;
  const done: Walk['done'] = {};
  if (w.done && typeof w.done === 'object')
    Object.entries(w.done).forEach(([id, d]) => {
      if (TASKS.includes(id as TaskId) && typeof d === 'string') done[id as TaskId] = d;
    });
  const skipped = Array.isArray(w.skipped) ? w.skipped.filter(id => TASKS.includes(id)) : [];
  return {
    state: w.state,
    ...(typeof w.started === 'string' ? { started: w.started } : {}),
    done,
    skipped,
    ...(w.folded === true ? { folded: true } : {}),
  };
}

// On a first visit (no stored plans) the welcome card, then on; otherwise what is stored, or off.
// Someone who saw the old tour (`tourSeen`) is not new: off, found in the Guide.
export const offerWalk = (firstVisit: boolean, stored: Walk | null, tourSeen: boolean): 'welcome' | 'keep' =>
  firstVisit && !stored && !tourSeen ? 'welcome' : 'keep';
