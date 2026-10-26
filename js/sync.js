'use strict';

/* =========================================================
   Sync groundwork: change tracking and per-item merge
   ---------------------------------------------------------
   Two copies of a plan (say, on two devices) are merged item by item:
   - save() stamps `updatedAt` on every goal, state, activity and relationship that
     changed since the last save, and records deleted ids in `db.deleted` (tombstones);
   - mergePlans(a, b) keeps the newer version of each item, drops items deleted after
     their last edit, merges measurement histories by date, and repairs relationships
     the merge would break.
   Loaded before app.js; uses its helpers (emptyDb, PARENT_REL, ACYCLIC) only when called.
   ========================================================= */

const SYNC_COLLS = ['goals', 'states', 'activities', 'relations'];
const TOMBSTONE_DAYS = 365; // deletions older than this are forgotten

/* ---------- Change tracking ---------- */

let syncSnapshot = new Map(); // item id → its content (without updatedAt) as last saved

const itemContent = item => {
  const { updatedAt, ...rest } = item;
  return JSON.stringify(rest);
};

// Call whenever `db` is replaced by stored data, so only later edits count as changes.
function takeSnapshot(data) {
  syncSnapshot = new Map(SYNC_COLLS.flatMap(c => data[c].map(x => [x.id, itemContent(x)])));
}

function stampChanges(data) {
  const now = new Date().toISOString();
  const present = new Set();
  data.deleted ||= {};
  SYNC_COLLS.forEach(c => data[c].forEach(x => {
    present.add(x.id);
    if (syncSnapshot.get(x.id) !== itemContent(x)) x.updatedAt = now;
    delete data.deleted[x.id]; // an id that is back (e.g. undo) is no longer deleted
  }));
  syncSnapshot.forEach((_, id) => { if (!present.has(id)) data.deleted[id] = now; });
  const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
  Object.keys(data.deleted).forEach(id => { if (data.deleted[id] < cutoff) delete data.deleted[id]; });
  takeSnapshot(data);
}

/* ---------- Plan list: names and deleted plans are tracked the same way ---------- */

let planSnapshot = new Map(); // plan id → name as last saved

function takePlanSnapshot(index) {
  planSnapshot = new Map(index.list.map(p => [p.id, p.name]));
}

function stampPlanChanges(index) {
  const now = new Date().toISOString();
  index.deleted ||= {};
  index.list.forEach(p => {
    if (planSnapshot.get(p.id) !== p.name) p.updatedAt = now;
    delete index.deleted[p.id];
  });
  const present = new Set(index.list.map(p => p.id));
  planSnapshot.forEach((_, id) => { if (!present.has(id)) index.deleted[id] = now; });
  takePlanSnapshot(index);
}

/* ---------- Merge ---------- */

// Items without a timestamp (saved before change tracking existed) count as oldest.
const stamp = x => x.updatedAt || '';

// Newer version wins; ties are broken by content so both devices pick the same one.
function newerOf(x, y) {
  if (stamp(x) !== stamp(y)) return stamp(x) > stamp(y) ? x : y;
  return itemContent(x) >= itemContent(y) ? x : y;
}

// Newest first; ties are broken by id so every device keeps the same one.
function newestFirst(p, q) {
  if (stamp(p) !== stamp(q)) return stamp(q) > stamp(p) ? 1 : -1;
  return q.id.localeCompare(p.id);
}

// Tombstones from both sides: the later deletion of an id wins.
function mergeDeleted(a, b) {
  const deleted = { ...a };
  Object.entries(b).forEach(([id, at]) => { if (!deleted[id] || at > deleted[id]) deleted[id] = at; });
  return deleted;
}

// Current states: measurements from both versions are kept (one per date, the newer version's
// value wins on a clash), and the state's value follows its latest measurement.
function mergeState(x, y) {
  const newer = newerOf(x, y), older = newer === x ? y : x;
  const byDate = new Map((older.history || []).map(h => [h.date, h]));
  (newer.history || []).forEach(h => byDate.set(h.date, h));
  const history = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const merged = { ...newer, history };
  const last = history[history.length - 1];
  if (last && (!merged.date || last.date >= merged.date)) Object.assign(merged, { value: last.value, date: last.date });
  return merged;
}

// Routines: check-ins from both versions are kept per date (the newer version wins on a clash,
// so un-ticking a day carries over too).
function mergeActivity(x, y) {
  const newer = newerOf(x, y), older = newer === x ? y : x;
  if (!newer.checkins && !older.checkins) return newer;
  return { ...newer, checkins: { ...older.checkins, ...newer.checkins } };
}

const MERGE_ITEM = { states: mergeState, activities: mergeActivity };

function mergePlans(a, b) {
  const out = emptyDb();
  const deleted = mergeDeleted(a.deleted || {}, b.deleted || {});

  for (const c of SYNC_COLLS) {
    const byId = new Map();
    for (const x of [...a[c], ...b[c]]) {
      const cur = byId.get(x.id);
      if (!cur) byId.set(x.id, x);
      else byId.set(x.id, (MERGE_ITEM[c] || newerOf)(cur, x));
    }
    // An item survives a deletion only if it was edited after it.
    out[c] = [...byId.values()].filter(x => !(deleted[x.id] && deleted[x.id] >= stamp(x)));
  }
  out.relations = repairRelations(out);
  const present = new Set(SYNC_COLLS.flatMap(c => out[c].map(x => x.id)));
  out.deleted = Object.fromEntries(Object.entries(deleted).filter(([id]) => !present.has(id)));
  return out;
}

// Relationships can break when two edits meet: an end was deleted, the same link was made
// twice, an item got two parents, or two new dependencies form a loop. Newer links win.
function repairRelations(data) {
  const ids = new Set(['goals', 'states', 'activities'].flatMap(c => data[c].map(x => x.id)));
  const key = r => `${r.from}|${r.type}|${r.to}`;
  const rels = data.relations
    .filter(r => ids.has(r.from) && ids.has(r.to))
    .sort(newestFirst);
  const kept = [], seen = new Set(), hasParent = new Set();
  const parentTypes = new Set(Object.values(PARENT_REL));
  // Does `start` already reach `target` through kept links of this type?
  const reaches = (start, target, type) => {
    const stack = [start], visited = new Set();
    while (stack.length) {
      const n = stack.pop();
      if (n === target) return true;
      if (visited.has(n)) continue;
      visited.add(n);
      kept.forEach(r => { if (r.type === type && r.from === n) stack.push(r.to); });
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
function lastTouched(entry, data) {
  const times = [stamp(entry), ...SYNC_COLLS.flatMap(c => (data?.[c] || []).map(stamp)), ...Object.values(data?.deleted || {})];
  return times.reduce((a, b) => (b > a ? b : a), '');
}

function mergeStores(a, b) {
  const deleted = mergeDeleted(a.plans.deleted || {}, b.plans.deleted || {});
  const entries = new Map();
  [...a.plans.list, ...b.plans.list].forEach(p => {
    const cur = entries.get(p.id);
    entries.set(p.id, cur ? newerOf(cur, p) : p);
  });
  const list = [], data = {};
  entries.forEach((p, id) => {
    const dataA = a.data[id], dataB = b.data[id];
    const plan = dataA && dataB ? mergePlans(dataA, dataB) : dataA || dataB || emptyDb();
    if (deleted[id] && deleted[id] >= lastTouched(p, plan)) return;
    list.push(p);
    data[id] = plan;
  });
  const kept = new Set(list.map(p => p.id));
  return { plans: { list, deleted: Object.fromEntries(Object.entries(deleted).filter(([id]) => !kept.has(id))) }, data };
}
