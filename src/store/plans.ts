/** The plans: loading, saving, opening, creating, deleting and merging them, and their names. */
import { loadJournal } from './journal';
import { userStorage } from './users';
import { normalize } from '../core/normalize';
import { SYNC_COLLS, emptyDb, type Db, type Item, type ItemKind, type PlanList } from '../core/model';
import { currentPlan, plans, plansVersion, setPlans, setPlansVersion, ui } from './state';
import {
  keepSnapshot,
  restoreSnapshot,
  stampChanges,
  stampPlanChanges,
  takePlanSnapshot,
  takeSnapshot,
} from '../core/merge';
import { db, setDb } from '../core/state';
import { STORAGE_KEY, prefs } from './prefs';
import { uid } from '../core/util';
import { t } from '../i18n/index';
import { emit } from './events';
import { deleteVision, loadVisions } from './visions';
import { collection } from '../core/relations';
import { itemEntry, visionEntry } from '../core/trash';
import { trashAdd } from './trash';

/* ---------- Plans ----------
   Each action plan is stored under its own key; an index keeps names and the current plan.
   Data from the single-plan version (STORAGE_KEY) is migrated into the first plan. */

export const PLANS_KEY = 'actionplan.plans';
export const planKey = (id: string) => `actionplan.plan.${id}`;

export function readPlan(id: string): Db {
  try {
    const raw = userStorage.getItem(planKey(id));
    return raw ? normalize(JSON.parse(raw)) : emptyDb();
  } catch (e) {
    return emptyDb();
  }
}

export function load() {
  loadVisions();
  loadJournal();
  try {
    const saved: PlanList | null = JSON.parse(userStorage.getItem(PLANS_KEY) as string);
    if (Array.isArray(saved?.list) && saved.list.length) setPlans(saved as PlanList);
  } catch (e) {
    /* start fresh */
  }
  if (plans.list.length) {
    if (!currentPlan()) plans.current = plans.list[0].id;
    takePlanSnapshot(plans);
    setDb(readPlan(plans.current as string));
    takeSnapshot(db);
    return;
  }
  let legacy = emptyDb();
  try {
    const raw = userStorage.getItem(STORAGE_KEY);
    if (raw) legacy = normalize(JSON.parse(raw));
  } catch (e) {
    /* ignore */
  }
  const id = uid();
  setPlans({ current: id, list: [{ id, name: t('plan.defaultName') }] });
  takePlanSnapshot({ list: [] }); // a brand-new plan list: nothing in it was deleted
  setDb(legacy);
  takeSnapshot(db);
  save();
}

export function save() {
  if (acting) return saveActing(acting);
  emit('saving');
  stampChanges(db);
  stampPlanChanges(plans);
  setPlansVersion(plansVersion + 1);
  try {
    userStorage.setItem(planKey(plans.current as string), JSON.stringify(db));
    userStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch (e) {
    emit('storageError');
  }
  emit('saved');
}

// Runs `fn` with `data` as the plan the core sees, and puts the open plan back, also when it throws.
// `fn` must be synchronous.
export function withPlan<T>(data: Db, fn: () => T): T {
  const keep = db;
  setDb(data);
  try {
    return fn();
  } finally {
    setDb(keep);
  }
}

// Changes a plan and saves it, open or not; false when there is no such plan. Another plan is
// stamped against what it held, and the open plan's change tracking is left as it was.
export function editPlan(id: string, fn: (data: Db) => void): boolean {
  if (id !== plans.current && !plans.list.some(p => p.id === id)) return false;
  actInPlan(id, () => {
    fn(db);
    save();
  });
  return true;
}

// The plan a screen action works on while it is not the open one (Today): the core sees it as the
// open plan, and save() writes it under its own key, leaving the plan list alone.
let acting: string | null = null;
export const actingPlan = () => acting;
// Runs `fn` on plan `id` as if it were open (synchronous). The open plan, '' or a nested call on the
// same plan run `fn` as it is; an unknown plan does not run it.
export function actInPlan<T>(id: string, fn: () => T): T | undefined {
  if (acting && id && id !== acting) throw new Error('actInPlan: nested on another plan');
  if (!id || id === plans.current || acting) return fn();
  if (!plans.list.some(p => p.id === id)) return undefined;
  const data = readPlan(id),
    kept = keepSnapshot();
  acting = id;
  try {
    takeSnapshot(data);
    return withPlan(data, fn);
  } finally {
    acting = null;
    restoreSnapshot(kept);
  }
}
// No 'saving': a goal reached in a plan that is not open is offered when that plan is opened.
function saveActing(id: string) {
  stampChanges(db);
  setPlansVersion(plansVersion + 1);
  try {
    userStorage.setItem(planKey(id), JSON.stringify(db));
  } catch (e) {
    emit('storageError');
  }
  emit('saved');
}

// The order plans were opened in on this device (a higher number is more recent), for the plan list.
export const planOpened = () => prefs.get<Record<string, number>>('planOpened', {});
export function openPlan(id: string) {
  const opened = planOpened(),
    // Plans deleted since are dropped.
    kept = Object.fromEntries(Object.entries(opened).filter(([k]) => plans.list.some(p => p.id === k)));
  prefs.set('planOpened', { ...kept, [id]: Math.max(0, ...Object.values(opened)) + 1 });
  plans.current = id;
  setDb(readPlan(id));
  takeSnapshot(db);
  Object.assign(ui, {
    category: '',
    activityGoal: '',
    mapGoal: '',
    timelineGoal: '',
    graphGoal: '',
    mapSelected: null,
    mapRel: null,
    search: '',
    mapRefocus: true,
    rtWeek: {},
  });
  save();
  emit('plansChanged');
}

// Plan names are unique, ignoring case and spaces around them.
export const nameTaken = (name: string, exceptId?: string) =>
  plans.list.some(p => p.id !== exceptId && p.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
// The name itself if it is free, else with the first free number added: "Sample plan 2".
export function uniqueName(name: string) {
  let candidate = name,
    n = 1;
  while (nameTaken(candidate)) candidate = `${name} ${++n}`;
  return candidate;
}

// The open plan is the sample (or another demo): not the user's own.
export const isDemo = () => currentPlan()?.demo === true;

export function createPlan(name: string, data: Db = emptyDb(), demo = false, emoji?: string): void {
  const id = uid();
  plans.list.push({ id, name, ...(emoji ? { emoji } : {}), ...(demo ? { demo } : {}) });
  plans.current = id;
  setDb(data);
  takeSnapshot(db); // what a new plan starts with is not an edit
  save();
  openPlan(id);
}

export function deletePlan(id: string) {
  try {
    userStorage.removeItem(planKey(id));
  } catch (e) {
    /* ignore */
  }
  plans.list = plans.list.filter(p => p.id !== id);
  if (!plans.list.length) return createPlan(t('plan.defaultName'));
  openPlan(plans.list[0].id);
}

// Moves everything in one plan into another and opens that one. Items keep their ids unless the
// target already has (or once deleted) that id; then they get new ones and their relations follow.
// The moved items are saved as changes, so sync carries them; `remove` deletes the source afterwards.
export function mergePlanInto(fromId: string, toId: string, remove = false) {
  if (fromId === toId) return;
  const source: Db = fromId === plans.current ? JSON.parse(JSON.stringify(db)) : readPlan(fromId);
  if (plans.current !== toId) openPlan(toId);
  const taken = new Set([...SYNC_COLLS.flatMap(c => db[c].map(x => x.id)), ...Object.keys(db.deleted || {})]);
  const ids = new Map<string, string>();
  const place = <T extends Item>(x: T): T => {
    const id = taken.has(x.id) ? uid() : x.id;
    taken.add(id);
    ids.set(x.id, id);
    delete x.updatedAt;
    return Object.assign(x, { id });
  };
  SYNC_COLLS.filter(c => c !== 'relations').forEach(c => (db[c] as Item[]).push(...(source[c] as Item[]).map(place)));
  db.relations.push(
    ...source.relations
      .filter(r => ids.has(r.from) && ids.has(r.to))
      .map(r => place({ ...r, from: ids.get(r.from) as string, to: ids.get(r.to) as string })),
  );
  if (remove) {
    try {
      userStorage.removeItem(planKey(fromId));
    } catch (e) {
      /* ignore */
    }
    plans.list = plans.list.filter(p => p.id !== fromId);
  }
  save();
  emit('plansChanged');
}

// Removes an item and keeps it in Recently deleted; says whether it could be kept there.
export function removeEntity(kind: ItemKind, id: string): 'ok' | 'large' | 'full' {
  const kept = trashAdd(
    kind === 'vision' ? visionEntry(id) : itemEntry(kind, id, plans.current!, currentPlan()?.name || ''),
  );
  if (kind === 'vision') {
    if (ui.mapSelected === id) ui.mapSelected = null;
    deleteVision(id);
    return kept;
  }
  const list = collection(kind);
  list.splice(
    list.findIndex(x => x.id === id),
    1,
  );
  db.relations = db.relations.filter(r => r.from !== id && r.to !== id);
  if (ui.mapSelected === id) ui.mapSelected = null;
  return kept;
}
