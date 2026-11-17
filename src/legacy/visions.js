/** Visions: the global list above goals, stored apart from plans. */
import { userStorage } from './users.js';
import { scheduleSync } from './drive.js';
import { currentPlan, plans, readPlan, toast } from './app.js';
import { t } from '../i18n/index';
import { db, setVisions, visions } from '../core/state';
import { normalizeVisions, ownVisions, purposeOf, visionAncestors } from '../core/visions';
import { TOMBSTONE_DAYS, itemContent } from '../core/merge';

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

export const VISIONS_KEY = 'actionplan.visions';
export let visionsVersion = 0; // bumped on every change to the list, so cached answers know to start over
export let plansVersion = 0;   // bumped whenever plans are saved or synced (other plans' goals are cached)
export function setPlansVersion(v) { plansVersion = v; }
export let visionSnapshot = new Map();

export const takeVisionSnapshot = () => { visionSnapshot = new Map(visions.list.map(v => [v.id, itemContent(v)])); };

export function loadVisions() {
  try { setVisions(normalizeVisions(JSON.parse(userStorage.getItem(VISIONS_KEY)))); } catch (e) { setVisions(normalizeVisions(null)); }
  takeVisionSnapshot();
  visionsVersion++;
}

// Stamps what changed since the last save, remembers deleted ids (as plans do), stores the list and syncs.
export function saveVisions() {
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
  try { userStorage.setItem(VISIONS_KEY, JSON.stringify(visions)); } catch (e) { toast(t('err.storage')); }
  if (typeof scheduleSync === 'function') scheduleSync();
}

/* ---------- The vision tree ---------- */

export function deleteVision(id) {
  visions.list = visions.list.filter(v => v.id !== id);
  visions.list.forEach(v => { if (v.parents.includes(id)) v.parents = v.parents.filter(p => p !== id); });
  saveVisions();
}

/* ---------- Goals serving visions ---------- */

// Every plan's data: the open one as it is now, the others as stored (read once per change).
export let otherPlansCache = { key: '', list: [] };
export function setOtherPlansCache(v) { otherPlansCache = v; }
export function allPlansData() {
  const key = `${plansVersion}|${plans.current}|${plans.list.map(p => p.id).join(',')}`;
  if (otherPlansCache.key !== key) otherPlansCache = { key, list: plans.list.filter(p => p.id !== plans.current).map(p => ({ plan: p, data: readPlan(p.id) })) };
  return [{ plan: currentPlan() || { id: plans.current, name: '' }, data: db }, ...otherPlansCache.list];
}

// Visions some goal (in any plan) serves, and every vision above them.
export function reachedVisions() {
  const out = new Set();
  allPlansData().forEach(({ data }) => data.goals.forEach(g => ownVisions(g).forEach(id => {
    out.add(id);
    visionAncestors(id).forEach(a => out.add(a));
  })));
  return out;
}

// How many goals (in every plan) serve a vision, directly or through a narrower one.
export function goalsReaching(id) {
  let n = 0;
  allPlansData().forEach(({ data }) => data.goals.forEach(g => { if (ownVisions(g).some(x => x === id || visionAncestors(x).has(id))) n++; }));
  return n;
}

// The goals (from every plan) that serve a vision directly, as { plan, goal }.
export const servingGoals = id => allPlansData().flatMap(({ plan, data }) => data.goals.filter(g => ownVisions(g).includes(id)).map(goal => ({ plan, goal })));

export const purposeState = () => purposeOf(allPlansData());

/* ---------- Sync ---------- */

// Makes a merged list this device's.
export function applyVisions(merged) {
  setVisions(normalizeVisions(merged));
  try { userStorage.setItem(VISIONS_KEY, JSON.stringify(visions)); } catch (e) { /* the plans' write reports it */ }
  takeVisionSnapshot();
  visionsVersion++;
}
