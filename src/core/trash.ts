/** Recently deleted: entries, merging two devices' lists, expiry, the size cap, and putting an entry back. */
import {
  SYNC_COLLS,
  type Db,
  type IdSet,
  type ISOTime,
  type Item,
  type Kind,
  type Relation,
  type Vision,
} from './model';
import { canRelate, collection, findEntity } from './relations';
import { canParent, findVision } from './visions';
import { db, visions } from './state';
import { uid } from './util';

export const TRASH_DAYS = 30; // an entry is kept this long
export const GONE_DAYS = 40; // ids of entries removed are remembered a little longer, so no device offers them again
export const TRASH_MAX = 1_000_000; // characters of JSON; the list also travels in the sync file

type ItemPayload = { item: Item & { title: string }; relations: Relation[] };
type VisionPayload = { vision: Vision; children: string[] };
type PlanPayload = { data: Db };
export type TrashEntry = {
  id: string; // one per deletion, not the item's id
  title: string;
  plan: string; // the plan it was in ('' for a vision)
  planName: string;
  deletedAt: ISOTime;
} & (
  | { kind: Kind; payload: ItemPayload }
  | { kind: 'vision'; payload: VisionPayload }
  | { kind: 'plan'; payload: PlanPayload }
);
export interface Trash {
  items: TrashEntry[];
  gone: IdSet<ISOTime>; // entries deleted for good, restored or undone
}

const KINDS_OK = new Set(['goal', 'state', 'activity', 'vision', 'plan']);
const isEntry = (e: unknown): e is TrashEntry => {
  const x = e as TrashEntry;
  return (
    !!x &&
    typeof x.id === 'string' &&
    KINDS_OK.has(x.kind) &&
    typeof x.title === 'string' &&
    typeof x.deletedAt === 'string' &&
    !!x.payload &&
    typeof x.payload === 'object'
  );
};

export function normalizeTrash(raw: unknown): Trash {
  const r = raw as Partial<Trash> | null;
  const gone: IdSet<ISOTime> = {};
  if (r?.gone && typeof r.gone === 'object')
    Object.entries(r.gone).forEach(([k, v]) => typeof v === 'string' && (gone[k] = v));
  return { items: Array.isArray(r?.items) ? r.items.filter(isEntry) : [], gone };
}

const ago = (now: number, days: number) => new Date(now - days * 86400000).toISOString();

// Drops expired entries, entries removed elsewhere, and old memories of removed ones.
export function pruneTrash(t: Trash, now = Date.now()): Trash {
  const keepFrom = ago(now, TRASH_DAYS),
    goneFrom = ago(now, GONE_DAYS);
  const gone = Object.fromEntries(Object.entries(t.gone).filter(([, at]) => at >= goneFrom));
  return { items: t.items.filter(e => e.deletedAt >= keepFrom && !gone[e.id]), gone };
}

// Two devices' lists: every entry either has, unless either removed it.
export function mergeTrash(a: Trash | undefined, b: Trash | undefined, now = Date.now()): Trash {
  const A = normalizeTrash(a),
    B = normalizeTrash(b);
  const gone = { ...A.gone };
  Object.entries(B.gone).forEach(([id, at]) => (gone[id] = gone[id] && gone[id] > at ? gone[id] : at));
  const items = new Map<string, TrashEntry>();
  [...A.items, ...B.items].forEach(e => items.has(e.id) || items.set(e.id, e));
  const list = [...items.values()].sort((x, y) => (x.deletedAt < y.deletedAt ? 1 : -1));
  return pruneTrash({ items: list, gone }, now);
}

// Adds an entry (newest first) and drops the oldest past the cap; null when the entry alone is too large.
export function addToTrash(t: Trash, entry: TrashEntry, max = TRASH_MAX): Trash | null {
  if (JSON.stringify(entry).length > max) return null;
  const items = [entry, ...t.items];
  while (JSON.stringify({ items, gone: t.gone }).length > max) items.pop();
  return { items, gone: t.gone };
}

// Removes entries on every device: they are remembered as gone.
export function forgetEntries(t: Trash, ids: string[], now = new Date().toISOString()): Trash {
  const drop = new Set(ids);
  const gone = { ...t.gone };
  ids.forEach(id => (gone[id] = now));
  return { items: t.items.filter(e => !drop.has(e.id)), gone };
}

const base = (title: string, plan: string, planName: string) => ({
  id: uid(),
  title,
  plan,
  planName,
  deletedAt: new Date().toISOString(),
});

// An item of the open plan, with every relation that touches it; taken before it is removed.
export function itemEntry(kind: Kind, id: string, plan: string, planName: string): TrashEntry | null {
  const item = collection(kind).find(x => x.id === id);
  if (!item) return null;
  const relations = db.relations.filter(r => r.from === id || r.to === id);
  return { ...base(item.title, plan, planName), kind, payload: clone({ item, relations }) };
}

export function visionEntry(id: string): TrashEntry | null {
  const vision = findVision(id);
  if (!vision) return null;
  const children = visions.list.filter(v => v.parents.includes(id)).map(v => v.id);
  return { ...base(vision.title, '', ''), kind: 'vision', payload: clone({ vision, children }) };
}

export const planEntry = (plan: string, planName: string, data: Db): TrashEntry => ({
  ...base(planName, plan, planName),
  kind: 'plan',
  payload: clone({ data }),
});

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const takenIds = (d: Db) => new Set([...SYNC_COLLS.flatMap(c => d[c].map(x => x.id))]);

// Puts an item back into the plan the core sees now (`db`). Relations come back only when the other
// end exists and the rules allow the link today; `lost` counts the rest.
export function restoreItem(entry: TrashEntry & { kind: Kind }): { id: string; lost: number } {
  const { item, relations } = clone(entry.payload);
  const old = item.id;
  const id = takenIds(db).has(old) ? uid() : old;
  delete item.updatedAt;
  (collection(entry.kind) as Item[]).push({ ...item, id });
  let lost = 0;
  relations.forEach(r => {
    const from = r.from === old ? id : r.from,
      to = r.to === old ? id : r.to;
    const other = from === id ? to : from;
    if (!findEntity(other) || canRelate(from, to, r.type)) return lost++;
    const relId = takenIds(db).has(r.id) ? uid() : r.id;
    db.relations.push({ id: relId, from, to, type: r.type });
  });
  return { id, lost };
}

// Puts a vision back: with the parents that exist and make no loop, and as a parent of the visions
// that had it, where that makes no loop.
export function restoreVision(entry: TrashEntry & { kind: 'vision' }): { id: string; lost: number } {
  const { vision, children } = clone(entry.payload);
  const id = findVision(vision.id) ? uid() : vision.id;
  const wanted = vision.parents;
  delete vision.updatedAt;
  visions.list.push({ ...vision, id, parents: [] });
  const v = findVision(id)!;
  let lost = 0;
  wanted.forEach(p => (canParent(id, p) ? lost++ : v.parents.push(p)));
  children.forEach(c => {
    const child = findVision(c);
    if (!child || canParent(c, id)) return lost++;
    child.parents.push(id);
  });
  return { id, lost };
}
