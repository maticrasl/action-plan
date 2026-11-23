/** Visions without the page: the tree, loops, goals serving them, Purpose, and merging two lists. */
import { db, visions } from './state';
import { safeId } from './normalize';
import { mergeDeleted, newerOf, newestFirst, stamp } from './merge';
import { isSmart } from './progress';
import type { Db, Goal, IdSet, ISOTime, Plan, Vision, VisionList, VisionRel } from './model';
import type { TextKey } from '../i18n/index';

// One plan's data, with its entry in the plan list.
export interface PlanData {
  plan: Plan;
  data: Db;
}
// See purposeOf.
export interface Purpose {
  on: boolean;
  root: Vision | null;
  roots: Vision[];
  unlinked: { plan: Plan; goal: Goal }[];
  vague: { plan: Plan; goal: Goal }[];
  golden: boolean;
  active: number;
}
// A vision list as storage, Drive or a file may hold it, before it is checked.
export type RawVisions = { list?: unknown; deleted?: unknown; purposeFound?: unknown } | null | undefined;

export const findVision = (id: string | null | undefined): Vision | undefined => visions.list.find(v => v.id === id);

export function normalizeVisions(input: unknown): VisionList {
  const raw = input as RawVisions;
  const out: VisionList = { list: [], deleted: {} };
  if (Array.isArray(raw?.list))
    out.list = raw.list
      .filter(v => v && typeof v === 'object' && safeId(v.id) && typeof v.title === 'string')
      .map(v => {
        const out = { ...v, parents: Array.isArray(v.parents) ? v.parents.filter(safeId) : [] };
        if (typeof out.avoid !== 'string') delete out.avoid;
        return out;
      });
  if (raw?.deleted && typeof raw.deleted === 'object' && !Array.isArray(raw.deleted))
    out.deleted = raw.deleted as IdSet<ISOTime>;
  if (typeof raw?.purposeFound === 'string') out.purposeFound = raw.purposeFound;
  return out;
}

export const visionParents = (v: Vision): string[] => (v.parents || []).filter(p => p !== v.id && findVision(p));
export const visionRoots = (): Vision[] => visions.list.filter(v => !visionParents(v).length);
export const visionChildren = (id: string): Vision[] => visions.list.filter(v => visionParents(v).includes(id));

// Every vision above `id`, however far.
export function visionAncestors(id: string): Set<string> {
  const out = new Set<string>(),
    stack = [id];
  while (stack.length) {
    const v = findVision(stack.pop());
    if (v)
      visionParents(v).forEach(p => {
        if (!out.has(p)) {
          out.add(p);
          stack.push(p);
        }
      });
  }
  return out;
}

// Why `parentId` cannot become a parent of `childId` (an i18n key), or null if it can.
export function canParent(childId: string | null | undefined, parentId: string): TextKey | null {
  if (!findVision(parentId)) return 'err.unknown';
  if (childId === parentId) return 'err.self';
  if (childId && visionAncestors(parentId).has(childId)) return 'err.visionLoop';
  if (findVision(childId)?.parents.includes(parentId)) return 'err.relExists';
  return null;
}

export const ownVisions = (g: Goal | null | undefined): string[] =>
  Array.isArray(g?.visions) ? g.visions.filter(findVision) : [];

// The visions a goal serves: its own, and those of the goals it is part of.
export function goalVisionIds(g: Goal, data: Db = db): string[] {
  const out = new Set<string>(),
    seen = new Set<string>();
  for (let cur: Goal | undefined = g; cur && !seen.has(cur.id);) {
    seen.add(cur.id);
    ownVisions(cur).forEach(id => out.add(id));
    const up = data.relations.find(r => r.from === cur!.id && r.type === 'subgoal');
    cur = up && data.goals.find(x => x.id === up.to);
  }
  return [...out];
}

export const isActiveGoal = (g: Goal): boolean => !g.status || g.status === 'active';

// Ids of the items in a plan that work toward a vision: goals serving one (sub-goals through their
// parent), the activities contributing to them with their sub-activities, the states measuring them
// and the activities improving those states. Waiting for something (depends) does not carry it.
export function contributingIds(data: Db = db): Set<string> {
  const out = new Set<string>(),
    rels = data.relations;
  if (!visions.list.length) return out;
  data.goals.forEach(g => {
    if (goalVisionIds(g, data).length) out.add(g.id);
  });
  const withSubs = (ids: string[]) => {
    const queue = [...ids];
    while (queue.length) {
      const id = queue.shift()!;
      if (out.has(id)) continue;
      out.add(id);
      rels.forEach(r => {
        if (r.type === 'subactivity' && r.to === id) queue.push(r.from);
      });
    }
  };
  const goals = new Set(out);
  withSubs(rels.filter(r => r.type === 'contributes' && goals.has(r.to)).map(r => r.from));
  const states = new Set(rels.filter(r => r.type === 'measures' && goals.has(r.to)).map(r => r.from));
  states.forEach(id => out.add(id));
  withSubs(rels.filter(r => r.type === 'improves' && states.has(r.to)).map(r => r.from));
  return out;
}

// Purpose: one vision at the top, at least one active goal, and every active goal (in every plan,
// `all` as allPlansData gives them) serving a vision. `unlinked` lists the active goals that serve
// none, as { plan, goal }, and `vague` those that are not SMART. The glow is golden only with a
// Purpose and no vague goal.
export function purposeOf(all: PlanData[]): Purpose {
  const roots = visionRoots(),
    unlinked: Purpose['unlinked'] = [],
    vague: Purpose['vague'] = [];
  let active = 0;
  all.forEach(({ plan, data }) =>
    data.goals.forEach(g => {
      if (!isActiveGoal(g)) return;
      active++;
      if (!goalVisionIds(g, data).length) unlinked.push({ plan, goal: g });
      if (!isSmart(g)) vague.push({ plan, goal: g });
    }),
  );
  const on = visions.list.length > 0 && roots.length === 1 && active > 0 && !unlinked.length;
  return { on, root: on ? roots[0] : null, roots, unlinked, vague, golden: on && !vague.length, active };
}

// Two copies of the list: the newer version of each vision wins, deletions as for plans, and the
// Purpose found first stays found. Then links that two edits made into a loop, or that point at a
// vision that is gone, are dropped: the newer vision's links are kept first.
export function mergeVisions(rawA: RawVisions, rawB: RawVisions): VisionList {
  const a = normalizeVisions(rawA),
    b = normalizeVisions(rawB);
  const deleted = mergeDeleted(a.deleted, b.deleted),
    byId = new Map<string, Vision>();
  [...a.list, ...b.list].forEach(v => {
    const cur = byId.get(v.id);
    byId.set(v.id, cur ? newerOf(cur, v) : v);
  });
  const list = [...byId.values()].filter(v => !(deleted[v.id] && deleted[v.id] >= stamp(v)));
  const ids = new Set(list.map(v => v.id)),
    kept = new Map<string, string[]>();
  const reachesUp = (from: string, target: string) => {
    const stack = [from],
      seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (id === target) return true;
      if (!seen.has(id)) {
        seen.add(id);
        stack.push(...(kept.get(id) || []));
      }
    }
    return false;
  };
  [...list].sort(newestFirst).forEach(v => {
    const ps: string[] = [];
    kept.set(v.id, ps);
    v.parents.forEach(p => {
      if (ids.has(p) && p !== v.id && !ps.includes(p) && !reachesUp(p, v.id)) ps.push(p);
    });
  });
  const out: VisionList = {
    list: list.map(v => (kept.get(v.id)!.length === v.parents.length ? v : { ...v, parents: kept.get(v.id)! })),
    deleted: Object.fromEntries(Object.entries(deleted).filter(([id]) => !ids.has(id))),
  };
  const found = [a.purposeFound, b.purposeFound].filter(Boolean).sort()[0];
  if (found) out.purposeFound = found;
  return out;
}

// A goal's own links to visions, without those that are gone; none is no field at all.
export function setGoalVisions(g: Goal, ids: string[]) {
  const keep = ids.filter(findVision);
  if (keep.length) g.visions = [...new Set(keep)];
  else delete g.visions;
}

// A link to a vision is no stored relation; its line on the map has an id of its own, vl~<from>~<to>.
export const visionRelId = (from: string, to: string) => `vl~${from}~${to}`;
export function visionRel(
  id: string | null | undefined,
): { id: string; from: string; to: string; type: VisionRel } | null {
  const [pre, from, to] = String(id || '').split('~');
  if (pre !== 'vl') return null;
  const child = findVision(from);
  if (child) return visionParents(child).includes(to) ? { id: id!, from, to, type: 'subvision' } : null;
  const goal = db.goals.find(g => g.id === from);
  return goal && ownVisions(goal).includes(to) ? { id: id!, from, to, type: 'serves' } : null;
}
