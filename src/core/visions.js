/** Visions without the page: the tree, loops, goals serving them, Purpose, and merging two lists. */
import { db, visions } from './state';
import { safeId } from './normalize';

export const findVision = id => visions.list.find(v => v.id === id);

export function normalizeVisions(raw) {
  const out = { list: [], deleted: {} };
  if (Array.isArray(raw?.list)) out.list = raw.list
    .filter(v => v && typeof v === 'object' && safeId(v.id) && typeof v.title === 'string')
    .map(v => ({ ...v, parents: Array.isArray(v.parents) ? v.parents.filter(safeId) : [] }));
  if (raw?.deleted && typeof raw.deleted === 'object' && !Array.isArray(raw.deleted)) out.deleted = raw.deleted;
  if (typeof raw?.purposeFound === 'string') out.purposeFound = raw.purposeFound;
  return out;
}

export const visionParents = v => (v.parents || []).filter(p => p !== v.id && findVision(p));
export const visionRoots = () => visions.list.filter(v => !visionParents(v).length);
export const visionChildren = id => visions.list.filter(v => visionParents(v).includes(id));

// Every vision above `id`, however far.
export function visionAncestors(id) {
  const out = new Set(), stack = [id];
  while (stack.length) {
    const v = findVision(stack.pop());
    if (v) visionParents(v).forEach(p => { if (!out.has(p)) { out.add(p); stack.push(p); } });
  }
  return out;
}

// Why `parentId` cannot become a parent of `childId` (an i18n key), or null if it can.
export function canParent(childId, parentId) {
  if (!findVision(parentId)) return 'err.unknown';
  if (childId === parentId) return 'err.self';
  if (childId && visionAncestors(parentId).has(childId)) return 'err.visionLoop';
  if (findVision(childId)?.parents.includes(parentId)) return 'err.relExists';
  return null;
}

export const ownVisions = g => (Array.isArray(g?.visions) ? g.visions.filter(findVision) : []);

// The visions a goal serves: its own, and those of the goals it is part of.
export function goalVisionIds(g, data = db) {
  const out = new Set(), seen = new Set();
  for (let cur = g; cur && !seen.has(cur.id);) {
    seen.add(cur.id);
    ownVisions(cur).forEach(id => out.add(id));
    const up = data.relations.find(r => r.from === cur.id && r.type === 'subgoal');
    cur = up && data.goals.find(x => x.id === up.to);
  }
  return [...out];
}

export const isActiveGoal = g => !g.status || g.status === 'active';

// Ids of the items in a plan that work toward a vision: goals serving one (sub-goals through their
// parent), the activities contributing to them with their sub-activities, the states measuring them
// and the activities improving those states. Waiting for something (depends) does not carry it.
export function contributingIds(data = db) {
  const out = new Set(), rels = data.relations;
  if (!visions.list.length) return out;
  data.goals.forEach(g => { if (goalVisionIds(g, data).length) out.add(g.id); });
  const withSubs = ids => {
    const queue = [...ids];
    while (queue.length) {
      const id = queue.shift();
      if (out.has(id)) continue;
      out.add(id);
      rels.forEach(r => { if (r.type === 'subactivity' && r.to === id) queue.push(r.from); });
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
// none, as { plan, goal }.
export function purposeOf(all) {
  const roots = visionRoots(), unlinked = [];
  let active = 0;
  all.forEach(({ plan, data }) => data.goals.forEach(g => {
    if (!isActiveGoal(g)) return;
    active++;
    if (!goalVisionIds(g, data).length) unlinked.push({ plan, goal: g });
  }));
  const on = visions.list.length > 0 && roots.length === 1 && active > 0 && !unlinked.length;
  return { on, root: on ? roots[0] : null, roots, unlinked, active };
}
