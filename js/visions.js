'use strict';

/* =========================================================
   Visions: desired states above goals ("to be fit and live healthily")
   ---------------------------------------------------------
   One list for all plans, stored apart from them and synced with them. A vision can serve any
   number of broader visions (its parents), never in a loop. Goals serve visions: a goal keeps the
   ids of the visions it serves in `goal.visions`, inside its own plan. Ids of visions that are gone
   (deleted, or not synced here yet) are ignored wherever they are read.
   When every vision meets in one at the top and every active goal, in every plan, serves a vision,
   that top vision is the user's Purpose.
   Loaded after sync.js and before app.js; uses their helpers only when called.
   ========================================================= */

const VISIONS_KEY = 'actionplan.visions';
let visions = { list: [], deleted: {} };
let visionsVersion = 0; // bumped on every change to the list, so cached answers know to start over
let plansVersion = 0;   // bumped whenever plans are saved or synced (other plans' goals are cached)
let visionSnapshot = new Map();

function normalizeVisions(raw) {
  const out = { list: [], deleted: {} };
  if (Array.isArray(raw?.list)) out.list = raw.list
    .filter(v => v && typeof v === 'object' && safeId(v.id) && typeof v.title === 'string')
    .map(v => ({ ...v, parents: Array.isArray(v.parents) ? v.parents.filter(safeId) : [] }));
  if (raw?.deleted && typeof raw.deleted === 'object' && !Array.isArray(raw.deleted)) out.deleted = raw.deleted;
  if (typeof raw?.purposeFound === 'string') out.purposeFound = raw.purposeFound;
  return out;
}

const takeVisionSnapshot = () => { visionSnapshot = new Map(visions.list.map(v => [v.id, itemContent(v)])); };

function loadVisions() {
  try { visions = normalizeVisions(JSON.parse(localStorage.getItem(VISIONS_KEY))); } catch (e) { visions = normalizeVisions(null); }
  takeVisionSnapshot();
  visionsVersion++;
}

// Stamps what changed since the last save, remembers deleted ids (as plans do), stores the list and syncs.
function saveVisions() {
  const now = new Date().toISOString(), present = new Set();
  visions.list.forEach(v => {
    present.add(v.id);
    if (visionSnapshot.get(v.id) !== itemContent(v)) v.updatedAt = now;
    delete visions.deleted[v.id];
  });
  visionSnapshot.forEach((_, id) => { if (!present.has(id)) visions.deleted[id] = now; });
  const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
  Object.keys(visions.deleted).forEach(id => { if (visions.deleted[id] < cutoff) delete visions.deleted[id]; });
  takeVisionSnapshot();
  visionsVersion++;
  try { localStorage.setItem(VISIONS_KEY, JSON.stringify(visions)); } catch (e) { toast(t('err.storage')); }
  if (typeof scheduleSync === 'function') scheduleSync();
}

/* ---------- The vision tree ---------- */

const findVision = id => visions.list.find(v => v.id === id);
const visionParents = v => (v.parents || []).filter(p => p !== v.id && findVision(p));
const visionRoots = () => visions.list.filter(v => !visionParents(v).length);
const visionChildren = id => visions.list.filter(v => visionParents(v).includes(id));

// Every vision above `id`, however far.
function visionAncestors(id) {
  const out = new Set(), stack = [id];
  while (stack.length) {
    const v = findVision(stack.pop());
    if (v) visionParents(v).forEach(p => { if (!out.has(p)) { out.add(p); stack.push(p); } });
  }
  return out;
}

// Why `parentId` cannot become a parent of `childId` (an i18n key), or null if it can.
function canParent(childId, parentId) {
  if (!findVision(parentId)) return 'err.unknown';
  if (childId === parentId) return 'err.self';
  if (childId && visionAncestors(parentId).has(childId)) return 'err.visionLoop';
  if (findVision(childId)?.parents.includes(parentId)) return 'err.relExists';
  return null;
}

function deleteVision(id) {
  visions.list = visions.list.filter(v => v.id !== id);
  visions.list.forEach(v => { if (v.parents.includes(id)) v.parents = v.parents.filter(p => p !== id); });
  saveVisions();
}

/* ---------- Goals serving visions ---------- */

const ownVisions = g => (Array.isArray(g?.visions) ? g.visions.filter(findVision) : []);

// The visions a goal serves: its own, and those of the goals it is part of.
function goalVisionIds(g, data = db) {
  const out = new Set(), seen = new Set();
  for (let cur = g; cur && !seen.has(cur.id);) {
    seen.add(cur.id);
    ownVisions(cur).forEach(id => out.add(id));
    const up = data.relations.find(r => r.from === cur.id && r.type === 'subgoal');
    cur = up && data.goals.find(x => x.id === up.to);
  }
  return [...out];
}

const isActiveGoal = g => !g.status || g.status === 'active';

// Every plan's data: the open one as it is now, the others as stored (read once per change).
let otherPlansCache = { key: '', list: [] };
function allPlansData() {
  const key = `${plansVersion}|${plans.current}|${plans.list.map(p => p.id).join(',')}`;
  if (otherPlansCache.key !== key) otherPlansCache = { key, list: plans.list.filter(p => p.id !== plans.current).map(p => ({ plan: p, data: readPlan(p.id) })) };
  return [{ plan: currentPlan() || { id: plans.current, name: '' }, data: db }, ...otherPlansCache.list];
}

// Visions some goal (in any plan) serves, and every vision above them.
function reachedVisions() {
  const out = new Set();
  allPlansData().forEach(({ data }) => data.goals.forEach(g => ownVisions(g).forEach(id => {
    out.add(id);
    visionAncestors(id).forEach(a => out.add(a));
  })));
  return out;
}

// How many goals (in every plan) serve a vision, directly or through a narrower one.
function goalsReaching(id) {
  let n = 0;
  allPlansData().forEach(({ data }) => data.goals.forEach(g => { if (ownVisions(g).some(x => x === id || visionAncestors(x).has(id))) n++; }));
  return n;
}

// The goals (from every plan) that serve a vision directly, as { plan, goal }.
const servingGoals = id => allPlansData().flatMap(({ plan, data }) => data.goals.filter(g => ownVisions(g).includes(id)).map(goal => ({ plan, goal })));

// Ids of the items in a plan that work toward a vision: goals serving one (sub-goals through their
// parent), the activities contributing to them with their sub-activities, the states measuring them
// and the activities improving those states. Waiting for something (depends) does not carry it.
function contributingIds(data = db) {
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

// Purpose: one vision at the top, at least one active goal, and every active goal (in every plan)
// serving a vision. `unlinked` lists the active goals that serve none, as { plan, goal }.
function purposeState() {
  const roots = visionRoots(), unlinked = [];
  let active = 0;
  allPlansData().forEach(({ plan, data }) => data.goals.forEach(g => {
    if (!isActiveGoal(g)) return;
    active++;
    if (!goalVisionIds(g, data).length) unlinked.push({ plan, goal: g });
  }));
  const on = visions.list.length > 0 && roots.length === 1 && active > 0 && !unlinked.length;
  return { on, root: on ? roots[0] : null, roots, unlinked, active };
}

/* ---------- Sync ---------- */

// Two copies of the list: the newer version of each vision wins, deletions as for plans, and the
// Purpose found first stays found. Then links that two edits made into a loop, or that point at a
// vision that is gone, are dropped: the newer vision's links are kept first.
function mergeVisions(a, b) {
  a = normalizeVisions(a); b = normalizeVisions(b);
  const deleted = mergeDeleted(a.deleted, b.deleted), byId = new Map();
  [...a.list, ...b.list].forEach(v => { const cur = byId.get(v.id); byId.set(v.id, cur ? newerOf(cur, v) : v); });
  const list = [...byId.values()].filter(v => !(deleted[v.id] && deleted[v.id] >= stamp(v)));
  const ids = new Set(list.map(v => v.id)), kept = new Map();
  const reachesUp = (from, target) => {
    const stack = [from], seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (id === target) return true;
      if (!seen.has(id)) { seen.add(id); stack.push(...(kept.get(id) || [])); }
    }
    return false;
  };
  [...list].sort(newestFirst).forEach(v => {
    const ps = [];
    kept.set(v.id, ps);
    v.parents.forEach(p => { if (ids.has(p) && p !== v.id && !ps.includes(p) && !reachesUp(p, v.id)) ps.push(p); });
  });
  const out = {
    list: list.map(v => (kept.get(v.id).length === v.parents.length ? v : { ...v, parents: kept.get(v.id) })),
    deleted: Object.fromEntries(Object.entries(deleted).filter(([id]) => !ids.has(id))),
  };
  const found = [a.purposeFound, b.purposeFound].filter(Boolean).sort()[0];
  if (found) out.purposeFound = found;
  return out;
}

// Makes a merged list this device's.
function applyVisions(merged) {
  visions = normalizeVisions(merged);
  try { localStorage.setItem(VISIONS_KEY, JSON.stringify(visions)); } catch (e) { /* the plans' write reports it */ }
  takeVisionSnapshot();
  visionsVersion++;
}
