/** Change tracking and the per-item merge of plans and visions. */
import { isCumulative, refreshTotal } from './cumulative';
import { followList } from './routines/checkins';
import { mergeTrash, type Trash } from './trash';
import { mergeMapFold, type MapFold } from './map-fold';
import {
  ACYCLIC,
  PARENT_REL,
  SYNC_COLLS,
  type Coll,
  emptyDb,
  type Activity,
  type Db,
  type Goal,
  type ISODate,
  type ISOTime,
  type IdSet,
  type Plan,
  type PlanList,
  type RelType,
  type Relation,
  type State,
  type VisionList,
} from './model';
import { dropRoutineDeps } from './normalize';
import { mergeVisions } from './visions';
import { mergeJournal, type Journal } from './journal';
import { mergeNotes } from './notes';
import { today } from './dates';
import { mergeTips, type Tips } from './guidance/tip-history';
import type { WithList } from './routines/checkins';

export type SyncItem = Goal | State | Activity | Relation;
// Anything with an id that sync stamps.
export interface Stamped {
  id: string;
  updatedAt?: ISOTime;
}
// The plan list and every plan, as in the Drive sync file (and full backups).
export interface Store {
  plans: { list: Plan[]; deleted?: IdSet<ISOTime> };
  data: Record<string, Db>;
  visions?: VisionList;
  tips?: Tips; // tip history; absent from files that never had any
  trash?: Trash; // Recently deleted; absent from files that never had any
  mapFold?: MapFold; // folded Map bands; absent from files that never had any
  journal?: Journal; // reviews, sessions, focus (core/journal.ts); absent until one is saved
}
// A store with every part read (the tips stay optional, so files without them keep their shape).
export type FullStore = Required<Omit<Store, 'tips' | 'trash' | 'mapFold' | 'journal'>> &
  Pick<Store, 'tips' | 'trash' | 'mapFold' | 'journal'>;
// Method syntax keeps the parameters bivariant, so mergeState (states only) fits.
type MergeItem = { merge(x: SyncItem, y: SyncItem): SyncItem }['merge'];

/* =========================================================
   Sync groundwork: change tracking and per-item merge
   ---------------------------------------------------------
   Two copies of a plan (say, on two devices) are merged item by item:
   - save() stamps `updatedAt` on every goal, state, activity and relationship that
     changed since the last save, and records deleted ids in `db.deleted` (tombstones);
   - mergePlans(a, b) keeps the newer version of each item, drops items deleted after
     their last edit, merges measurement histories by date (and amounts that add up by
     entry), and repairs relationships the merge would break.
   Loaded before app.js; uses its helpers (emptyDb, PARENT_REL, ACYCLIC) only when called.
   ========================================================= */

export const TOMBSTONE_DAYS = 365; // deletions older than this are forgotten

/* ---------- Change tracking ---------- */

export let syncSnapshot = new Map<string, string>(); // item id → its content (without updatedAt) as last saved
let statusSnapshot = new Map<string, string>(); // goal or activity id → its status as last saved

export const itemContent = (item: { updatedAt?: ISOTime }): string => {
  const { updatedAt, ...rest } = item;
  return JSON.stringify(rest);
};

// Call whenever `db` is replaced by stored data, so only later edits count as changes.
export function takeSnapshot(data: Db): void {
  syncSnapshot = snapshotOf(
    SYNC_COLLS.flatMap((c): SyncItem[] => data[c]),
    data.deleted,
  );
  statusSnapshot = new Map([...data.goals, ...data.activities].map((x): [string, string] => [x.id, statusKey(x)]));
  // List items ticked, as '<activity>/<item>', so a tick is told apart from an item ticked before.
  data.activities.forEach(a => a.list?.forEach(i => i.done && statusSnapshot.set(`${a.id}/${i.id}`, 'done')));
}
// The open plan's tracking, kept aside while another plan is stamped (store/plans.ts editPlan).
export const keepSnapshot = () => ({ sync: syncSnapshot, status: statusSnapshot });
export function restoreSnapshot(kept: ReturnType<typeof keepSnapshot>): void {
  syncSnapshot = kept.sync;
  statusSnapshot = kept.status;
}
const statusKey = (x: Goal | Activity) => `${x.status}|${('autoStarted' in x && x.autoStarted) || ''}`;

// A goal or activity whose status changed, or that is new, has had it since today. An activity the
// app started on its start date has `autoStarted` for that, so `statusSince` is left out.
function stampStatus(data: Db): void {
  const day = today();
  [...data.goals, ...data.activities].forEach(x => {
    const before = statusSnapshot.get(x.id);
    if (before?.split('|')[0] === x.status) return;
    const autoStart =
      'autoStarted' in x &&
      x.status === 'doing' &&
      !!x.autoStarted &&
      !!before &&
      !before.endsWith(`|${x.autoStarted}`);
    if (autoStart) delete x.statusSince;
    else x.statusSince = day;
  });
  stampCompletion(data, day);
}

// The day a step, list item or goal was finished (feature 13): set when it becomes done or is new and
// done, unless the form gave one; removed when it is no longer done. Items done before are left alone.
function stampCompletion(data: Db, day: ISODate): void {
  const mark = (x: { doneAt?: ISODate }, done: boolean, was: boolean) => {
    if (!done) delete x.doneAt;
    else if (!was && !x.doneAt) x.doneAt = day;
  };
  const wasStatus = (id: string) => statusSnapshot.get(id)?.split('|')[0];
  data.goals.forEach(g => {
    if (g.status !== 'achieved') delete g.achievedAt;
    else if (wasStatus(g.id) !== 'achieved' && !g.achievedAt) g.achievedAt = day;
  });
  data.activities.forEach(a => {
    if (a.repeat) return; // routines are dated by their check-ins
    mark(a, a.status === 'done', wasStatus(a.id) === 'done');
    a.list?.forEach(i => mark(i, !!i.done, statusSnapshot.has(`${a.id}/${i.id}`)));
  });
}

/* ---------- The stamp clock ----------
   Stamps come from the device clock and the newer one wins a merge, so a device whose clock runs
   fast would beat later edits made elsewhere. A new stamp is therefore never earlier than the newest
   one seen in this user's data as it was loaded (each list's snapshot, its deletions too); a clock more
   than a day ahead is not followed (docs/decisions.md). Merging alone does not move it, so a sync
   still under way for a user who has left cannot reach the next one. */
const AHEAD_MAX = 86400000;
let seen = 0; // ms since 1970: the newest stamp seen
export const resetClock = () => {
  seen = 0;
};
export function seeStamp(at: ISOTime | undefined): void {
  const ms = at ? Date.parse(at) : NaN;
  if (ms > seen && ms <= Date.now() + AHEAD_MAX) seen = ms;
}
// A list's change-tracking snapshot (id → content without its stamp); its stamps and `deleted`'s are seen.
export function snapshotOf(list: Stamped[], deleted: IdSet<ISOTime> = {}): Map<string, string> {
  list.forEach(x => seeStamp(x.updatedAt));
  Object.values(deleted).forEach(seeStamp);
  return new Map(list.map(x => [x.id, itemContent(x)]));
}
export function stampNow(): ISOTime {
  const now = Date.now();
  return new Date(seen > now ? seen + 1 : now).toISOString(); // own stamps (seen = now) are not lifted
}

// One list's change tracking: stamps items whose content differs from `snapshot` (or that are new),
// records ids that are gone in `deleted` (an id that is back, e.g. after undo, is no longer deleted),
// and forgets deletions older than TOMBSTONE_DAYS. Plans, visions and the journal use it.
export function stampList(
  list: { id: string; updatedAt?: ISOTime }[],
  snapshot: Map<string, string>,
  deleted: IdSet<ISOTime>,
  now: ISOTime,
): void {
  const present = new Set<string>();
  list.forEach(x => {
    present.add(x.id);
    if (snapshot.get(x.id) !== itemContent(x)) x.updatedAt = now;
    delete deleted[x.id];
  });
  snapshot.forEach((_, id) => {
    if (!present.has(id)) deleted[id] = now;
  });
  const cutoff = new Date(Date.parse(now) - TOMBSTONE_DAYS * 86400000).toISOString();
  Object.keys(deleted).forEach(id => {
    if (deleted[id] < cutoff) delete deleted[id];
  });
}

export function stampChanges(data: Db): void {
  data.deleted ||= {};
  stampStatus(data);
  stampList(
    SYNC_COLLS.flatMap((c): SyncItem[] => data[c]),
    syncSnapshot,
    data.deleted,
    stampNow(),
  );
  takeSnapshot(data);
}

/* ---------- Plan list: names and deleted plans are tracked the same way ---------- */

export let planSnapshot = new Map<string, string>(); // plan id → name and emoji as last saved
const planLook = (p: Plan) => `${p.name}|${p.emoji ?? ''}`;

export function takePlanSnapshot(index: { list: Plan[]; deleted?: IdSet<ISOTime> }): void {
  snapshotOf(index.list, index.deleted); // only to see the stamps: plans compare their look
  planSnapshot = new Map(index.list.map(p => [p.id, planLook(p)]));
}

export function stampPlanChanges(index: PlanList): void {
  const now = stampNow();
  index.deleted ||= {};
  index.list.forEach(p => {
    if (planSnapshot.get(p.id) !== planLook(p)) p.updatedAt = now;
    delete index.deleted![p.id];
  });
  const present = new Set(index.list.map(p => p.id));
  planSnapshot.forEach((_, id) => {
    if (!present.has(id)) index.deleted![id] = now;
  });
  takePlanSnapshot(index);
}

/* ---------- Merge ---------- */

// Items without a timestamp (saved before change tracking existed) count as oldest.
export const stamp = (x: { updatedAt?: ISOTime }): ISOTime => x.updatedAt || '';

// Newer version wins; ties are broken by content so both devices pick the same one.
export function newerOf<T extends { updatedAt?: ISOTime }>(x: T, y: T): T {
  if (stamp(x) !== stamp(y)) return stamp(x) > stamp(y) ? x : y;
  return itemContent(x) >= itemContent(y) ? x : y;
}

// Newest first; ties are broken by id so every device keeps the same one.
export function newestFirst(p: Stamped, q: Stamped): number {
  if (stamp(p) !== stamp(q)) return stamp(q) > stamp(p) ? 1 : -1;
  return q.id.localeCompare(p.id);
}

// Tombstones from both sides: the later deletion of an id wins.
export function mergeDeleted(a: IdSet<ISOTime>, b: IdSet<ISOTime>): IdSet<ISOTime> {
  const deleted = { ...a };
  Object.entries(b).forEach(([id, at]) => {
    if (!deleted[id] || at > deleted[id]) deleted[id] = at;
  });
  return deleted;
}

// Current states: measurements from both versions are kept (one per date, the newer version's
// value wins on a clash, so deleting a measurement carries over too), and the state's value
// follows its latest measurement – or, for a state that adds up, its merged entries' total.
export function mergeState(x: State, y: State): State {
  const newer = newerOf(x, y),
    older = newer === x ? y : x;
  const byDate = new Map((older.history || []).map(h => [h.date, h] as const));
  Object.keys(newer.dropped || {}).forEach(d => byDate.delete(d));
  (newer.history || []).forEach(h => byDate.set(h.date, h));
  const history = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const merged: State = { ...newer, history };
  const dropped = Object.keys({ ...older.dropped, ...newer.dropped }).filter(d => !byDate.has(d));
  if (dropped.length) merged.dropped = Object.fromEntries(dropped.map(d => [d, 1]));
  else delete merged.dropped;
  if (newer.entries || older.entries) mergeEntries(merged, newer, older);
  mergeNotes(merged, newer, older);
  if (isCumulative(merged)) refreshTotal(merged);
  else {
    const last = history[history.length - 1];
    if (last && (!merged.date || last.date >= merged.date))
      Object.assign(merged, { value: last.value, date: last.date });
  }
  return merged;
}

// Amounts that add up: entries from both versions are kept by id (the newer version's copy wins on
// a clash), except those deleted on either side.
export function mergeEntries(merged: State, newer: State, older: State): void {
  const dropped = { ...older.droppedEntries, ...newer.droppedEntries };
  const byId = new Map((older.entries || []).map(e => [e.id, e] as const));
  (newer.entries || []).forEach(e => byId.set(e.id, e));
  merged.entries = [...byId.values()]
    .filter(e => !dropped[e.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (Object.keys(dropped).length) merged.droppedEntries = dropped;
  else delete merged.droppedEntries;
}

// Routines: check-ins from both versions are kept per date (the newer version wins on a clash,
// so un-ticking a day carries over too), and so are a list routine's item ticks per date and item.
// Lists: items are merged by id (see mergeList).
export function mergeActivity(x: Activity, y: Activity): Activity {
  const newer = newerOf(x, y),
    older = newer === x ? y : x;
  let merged =
    newer.checkins || older.checkins ? { ...newer, checkins: { ...older.checkins, ...newer.checkins } } : newer;
  if (newer.listDays || older.listDays) {
    const days = { ...older.listDays };
    Object.entries(newer.listDays || {}).forEach(([d, ticks]) => (days[d] = { ...days[d], ...ticks }));
    merged = { ...merged, listDays: days };
  }
  merged = { ...merged };
  mergeNotes(merged, newer, older);
  return Array.isArray(newer.list) && Array.isArray(older.list)
    ? mergeList(merged, newer as WithList, older as WithList)
    : merged;
}

// A list keeps the items of both copies: on a clash the one ticked or renamed later wins, an item
// removed on either side stays removed, and the newer copy's order comes first. Its status then
// follows the merged ticks.
export function mergeList(merged: Activity, newer: WithList, older: WithList): Activity {
  const dropped = { ...older.droppedItems, ...newer.droppedItems };
  const theirs = new Map(older.list.map(i => [i.id, i] as const));
  const list = newer.list.map(i => ((theirs.get(i.id)?.at || '') > (i.at || '') ? theirs.get(i.id)! : i));
  const mine = new Set(list.map(i => i.id));
  merged.list = [...list, ...older.list.filter(i => !mine.has(i.id))].filter(i => !dropped[i.id]);
  if (Object.keys(dropped).length) merged.droppedItems = dropped;
  else delete merged.droppedItems;
  followList(merged as WithList);
  return merged;
}

// Goals merge whole (the newer copy wins), apart from their notes.
export function mergeGoal(x: Goal, y: Goal): Goal {
  const newer = newerOf(x, y),
    merged = { ...newer };
  mergeNotes(merged, newer, newer === x ? y : x);
  return merged;
}

export const MERGE_ITEM: Partial<Record<Coll, MergeItem>> = {
  goals: mergeGoal,
  states: mergeState,
  activities: mergeActivity,
};

export function mergePlans(a: Db, b: Db): Db {
  const out = emptyDb();
  const deleted = mergeDeleted(a.deleted || {}, b.deleted || {});

  for (const c of SYNC_COLLS) {
    const byId = new Map<string, SyncItem>();
    for (const x of [...a[c], ...b[c]]) {
      const cur = byId.get(x.id);
      if (!cur) byId.set(x.id, x);
      else byId.set(x.id, (MERGE_ITEM[c] || newerOf)(cur, x));
    }
    // An item survives a deletion only if it was edited after it.
    (out[c] as SyncItem[]) = [...byId.values()].filter(x => !(deleted[x.id] && deleted[x.id] >= stamp(x)));
  }
  out.relations = repairRelations(out);
  const present = new Set(SYNC_COLLS.flatMap(c => out[c].map(x => x.id)));
  out.deleted = Object.fromEntries(Object.entries(deleted).filter(([id]) => !present.has(id)));
  return out;
}

// Relationships can break when two edits meet: an end was deleted, the same link was made
// twice, an item got two parents, two new dependencies form a loop, or an activity something
// depends on became a routine on another device. Newer links win.
export function repairRelations(data: Db): Relation[] {
  const ids = new Set((['goals', 'states', 'activities'] as const).flatMap(c => data[c].map(x => x.id)));
  const key = (r: Relation) => `${r.from}|${r.type}|${r.to}`;
  const rels = dropRoutineDeps(data.relations, data.activities)
    .filter(r => ids.has(r.from) && ids.has(r.to))
    .sort(newestFirst);
  const kept: Relation[] = [],
    seen = new Set<string>(),
    hasParent = new Set<string>();
  const parentTypes = new Set<RelType>(Object.values(PARENT_REL));
  // Does `start` already reach `target` through kept links of this type?
  const reaches = (start: string, target: string, type: RelType) => {
    const stack = [start],
      visited = new Set<string>();
    while (stack.length) {
      const n = stack.pop()!;
      if (n === target) return true;
      if (visited.has(n)) continue;
      visited.add(n);
      kept.forEach(r => {
        if (r.type === type && r.from === n) stack.push(r.to);
      });
    }
    return false;
  };
  for (const r of rels) {
    if (seen.has(key(r))) continue;
    if (parentTypes.has(r.type) && hasParent.has(`${r.type}|${r.from}`)) continue;
    if (ACYCLIC.has(r.type) && reaches(r.to, r.from, r.type)) continue;
    seen.add(key(r));
    if (parentTypes.has(r.type)) hasParent.add(`${r.type}|${r.from}`);
    kept.push(r);
  }
  // Keep the original order for a stable file.
  const keep = new Set(kept);
  return data.relations.filter(r => keep.has(r));
}

/* ---------- Whole store: the plan list plus every plan ----------
   A store is { plans: { list: [{ id, name, updatedAt }], deleted: { id: time } }, data: { planId: plan } }.
   Plans merge like items: the newer name wins, and a deleted plan stays deleted unless it was
   renamed or edited after the deletion. */

// When a plan was last touched: renamed, or any item in it edited or deleted.
export function lastTouched(entry: Plan, data: Db | undefined): ISOTime {
  const times = [
    stamp(entry),
    ...SYNC_COLLS.flatMap(c => (data?.[c] || []).map(stamp)),
    ...Object.values(data?.deleted || {}),
  ];
  return times.reduce((a, b) => (b > a ? b : a), '');
}

export function mergeStores(a: Store, b: Store): FullStore {
  const deleted = mergeDeleted(a.plans.deleted || {}, b.plans.deleted || {});
  const entries = new Map<string, Plan>();
  [...a.plans.list, ...b.plans.list].forEach(p => {
    const cur = entries.get(p.id);
    entries.set(p.id, cur ? newerOf(cur, p) : p);
  });
  const list: Plan[] = [],
    data: Record<string, Db> = {};
  entries.forEach((p, id) => {
    const dataA = a.data[id],
      dataB = b.data[id];
    const plan = dataA && dataB ? mergePlans(dataA, dataB) : dataA || dataB || emptyDb();
    if (deleted[id] && deleted[id] >= lastTouched(p, plan)) return;
    list.push(p);
    data[id] = plan;
  });
  const kept = new Set(list.map(p => p.id));
  return {
    plans: { list, deleted: Object.fromEntries(Object.entries(deleted).filter(([id]) => !kept.has(id))) },
    data,
    visions: mergeVisions(a.visions, b.visions),
    ...((a.tips || b.tips) && { tips: mergeTips(a.tips, b.tips) }),
    ...((a.trash || b.trash) && { trash: mergeTrash(a.trash, b.trash) }),
    ...((a.mapFold || b.mapFold) && { mapFold: mergeMapFold(a.mapFold, b.mapFold) }),
    ...((a.journal || b.journal) && { journal: mergeJournal(a.journal, b.journal) }),
  };
}
