/** The plans: loading, saving, opening, creating, deleting and merging them, and their names. */
import { userStorage } from './users';
import { normalize } from '../core/normalize';
import { emptyDb } from '../core/model';
import { loadVisions } from '../legacy/visions.js';
import { currentPlan, plans, plansVersion, setPlans, setPlansVersion, ui } from './state';
import { SYNC_COLLS, stampChanges, stampPlanChanges, takePlanSnapshot, takeSnapshot } from '../core/merge';
import { db, setDb } from '../core/state';
import { STORAGE_KEY } from './prefs';
import { uid } from '../core/util';
import { t } from '../i18n/index';
import { emit } from './events';

/* ---------- Plans ----------
   Each action plan is stored under its own key; an index keeps names and the current plan.
   Data from the single-plan version (STORAGE_KEY) is migrated into the first plan. */

export const PLANS_KEY = 'actionplan.plans';
export const planKey = id => `actionplan.plan.${id}`;

export function readPlan(id) {
  try {
    const raw = userStorage.getItem(planKey(id));
    return raw ? normalize(JSON.parse(raw)) : emptyDb();
  } catch (e) {
    return emptyDb();
  }
}

export function load() {
  loadVisions();
  try {
    const saved = JSON.parse(userStorage.getItem(PLANS_KEY));
    if (Array.isArray(saved?.list) && saved.list.length) setPlans(saved);
  } catch (e) { /* start fresh */ }
  if (plans.list.length) {
    if (!currentPlan()) plans.current = plans.list[0].id;
    takePlanSnapshot(plans);
    setDb(readPlan(plans.current));
    takeSnapshot(db);
    return;
  }
  let legacy = emptyDb();
  try {
    const raw = userStorage.getItem(STORAGE_KEY);
    if (raw) legacy = normalize(JSON.parse(raw));
  } catch (e) { /* ignore */ }
  const id = uid();
  setPlans({ current: id, list: [{ id, name: t('plan.defaultName') }] });
  takePlanSnapshot({ list: [] }); // a brand-new plan list: nothing in it was deleted
  setDb(legacy);
  takeSnapshot(db);
  save();
}

export function save() {
  emit('saving');
  stampChanges(db);
  stampPlanChanges(plans);
  setPlansVersion(plansVersion + 1);
  try {
    userStorage.setItem(planKey(plans.current), JSON.stringify(db));
    userStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch (e) {
    emit('storageError');
  }
  emit('saved');
}

export function openPlan(id) {
  plans.current = id;
  setDb(readPlan(id));
  takeSnapshot(db);
  Object.assign(ui, { category: '', activityGoal: '', mapGoal: '', timelineGoal: '', graphGoal: '', mapSelected: null, mapRel: null, search: '', mapRefocus: true, rtWeek: {} });
  save();
  emit('plansChanged');
}

// Plan names are unique, ignoring case and spaces around them.
export const nameTaken = (name, exceptId) => plans.list.some(p => p.id !== exceptId && p.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
// The name itself if it is free, else with the first free number added: "Sample plan 2".
export function uniqueName(name) {
  let candidate = name, n = 1;
  while (nameTaken(candidate)) candidate = `${name} ${++n}`;
  return candidate;
}

export function createPlan(name, data = emptyDb()) {
  const id = uid();
  plans.list.push({ id, name });
  plans.current = id;
  setDb(data);
  takeSnapshot(db); // what a new plan starts with is not an edit
  save();
  openPlan(id);
}

export function deletePlan(id) {
  try { userStorage.removeItem(planKey(id)); } catch (e) { /* ignore */ }
  plans.list = plans.list.filter(p => p.id !== id);
  if (!plans.list.length) return createPlan(t('plan.defaultName'));
  openPlan(plans.list[0].id);
}

// Moves everything in one plan into another and opens that one. Items keep their ids unless the
// target already has (or once deleted) that id; then they get new ones and their relations follow.
// The moved items are saved as changes, so sync carries them; `remove` deletes the source afterwards.
export function mergePlanInto(fromId, toId, remove = false) {
  if (fromId === toId) return;
  const source = fromId === plans.current ? JSON.parse(JSON.stringify(db)) : readPlan(fromId);
  if (plans.current !== toId) openPlan(toId);
  const taken = new Set([...SYNC_COLLS.flatMap(c => db[c].map(x => x.id)), ...Object.keys(db.deleted || {})]);
  const ids = new Map();
  const place = x => {
    const id = taken.has(x.id) ? uid() : x.id;
    taken.add(id);
    ids.set(x.id, id);
    delete x.updatedAt;
    return Object.assign(x, { id });
  };
  SYNC_COLLS.filter(c => c !== 'relations').forEach(c => db[c].push(...source[c].map(place)));
  db.relations.push(...source.relations.filter(r => ids.has(r.from) && ids.has(r.to))
    .map(r => place({ ...r, from: ids.get(r.from), to: ids.get(r.to) })));
  if (remove) {
    try { userStorage.removeItem(planKey(fromId)); } catch (e) { /* ignore */ }
    plans.list = plans.list.filter(p => p.id !== fromId);
  }
  save();
  emit('plansChanged');
}
