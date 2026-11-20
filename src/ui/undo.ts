/** Undo for the last action: a copy of what it may change, put back from the toast's button; deleting items through it. */
import { db, setDb, visions } from '../core/state';
import type { Db, ItemKind, PlanList, Vision } from '../core/model';
import { openPlan, planKey, readPlan, removeEntity, save } from '../store/plans';
import { plans } from '../store/state';
import { saveVisions } from '../store/visions';
import { getTrash, trashForget } from '../store/trash';
import { currentUser, userStorage } from '../store/users';
import { emit } from '../store/events';
import { t, type TextKey } from '../i18n/index';
import { requestRender } from './render';
import { hideToast, toast } from './toast';

type Copy = {
  user: string;
  db: Db;
  visions: Vision[];
  plans: PlanList;
  plan?: { id: string; data: Db }; // a plan the action deletes
  trash: string[]; // entries the action put in Recently deleted
};
let pending: Copy | null = null;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// Runs `fn` (which changes, saves and returns the message) and offers Undo in the toast. Only the
// last action can be undone, and only until anything else is saved (see dropUndo).
export function undoable(fn: () => string, deletesPlan?: string) {
  const before = new Set(getTrash().items.map(e => e.id));
  const copy: Copy = {
    user: currentUser().id,
    db: clone(db),
    visions: clone(visions.list),
    plans: clone(plans),
    plan: deletesPlan
      ? { id: deletesPlan, data: clone(deletesPlan === plans.current ? db : readPlan(deletesPlan)) }
      : undefined,
    trash: [],
  };
  pending = null;
  const msg = fn();
  copy.trash = getTrash()
    .items.filter(e => !before.has(e.id))
    .map(e => e.id);
  pending = copy;
  toast(msg, { label: t('undo'), run: () => undo(copy) });
}

// Any later save, a sync that changed something, or another user: undoing then would lose newer work.
export function dropUndo() {
  if (!pending) return;
  pending = null;
  hideToast();
}

function undo(c: Copy) {
  if (pending !== c || currentUser().id !== c.user) return;
  pending = null;
  trashForget(c.trash);
  if (c.plan)
    try {
      userStorage.setItem(planKey(c.plan.id), JSON.stringify(c.plan.data));
    } catch (e) {
      emit('storageError');
    }
  plans.list = c.plans.list;
  visions.list = c.visions;
  // Put back through the normal save, so what returns is stamped as changed now and syncs.
  if (c.plan) openPlan(c.plans.current as string);
  else {
    setDb(c.db);
    save();
  }
  saveVisions();
  requestRender();
  toast(t('toast.undone'));
}

// Deleting a goal, state, activity or vision: no question first, Undo after.
export function deleteItem(kind: ItemKind, id: string) {
  undoable(() => {
    const kept = removeEntity(kind, id);
    save();
    requestRender();
    return kept === 'ok' ? t(('toast.deleted.' + kind) as TextKey) : t('trash.notKept');
  });
}
