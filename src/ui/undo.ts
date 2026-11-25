/** Undo for the last action: a copy of what it may change, put back from the toast's button or Ctrl+Z; deleting items through it. */
import { db, setDb, visions } from '../core/state';
import type { Db, ItemKind, PlanList, Vision } from '../core/model';
import { openPlan, planKey, readPlan, removeEntity, save } from '../store/plans';
import { plans } from '../store/state';
import { saveVisions } from '../store/visions';
import { getTrash, trashForget } from '../store/trash';
import { currentUser, userStorage } from '../store/users';
import { emit } from '../store/events';
import { t, tp, type TextKey } from '../i18n/index';
import { deletesWith, findEntity } from '../core/relations';
import { askDelete } from './delete-ask';
import { requestRender } from './render';
import { applyStore, localStore } from '../sync/sync';
import type { FullStore } from '../core/merge';
import { hideToast, toast } from './toast';

type Copy = {
  user: string;
  db: Db;
  visions: Vision[];
  plans: PlanList;
  plan?: { id: string; data: Db }; // a plan the action deletes
  trash: string[]; // entries the action put in Recently deleted
  store?: FullStore; // everything, for an action that changes every plan (merging a backup)
};
let pending: Copy | null = null;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// Runs `fn` (which changes, saves and returns the message) and offers Undo in the toast. Only the
// last action can be undone, and only until anything else is saved (see dropUndo).
// `whole`: the action may change every plan; Undo then puts the whole store back as it was.
export function undoable(fn: () => string, deletesPlan?: string, whole = false) {
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
    store: whole ? localStore() : undefined,
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
// `wholeOnly`: drops only an Undo of the whole store (see main.ts, 'uploaded').
export function dropUndo(wholeOnly = false) {
  if (!pending || (wholeOnly && !pending.store)) return;
  pending = null;
  hideToast();
}

function undo(c: Copy) {
  if (pending !== c || currentUser().id !== c.user) return;
  pending = null;
  if (c.store) {
    applyStore(c.store);
    return toast(t('toast.undone'));
  }
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

// Ctrl+Z (Cmd+Z on a Mac) does what the toast's Undo does. Fields keep their own undo, and nothing
// happens under an open dialog or when there is nothing to undo (the key is then left alone).
export function listenUndo() {
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || !pending) return;
    if ((e.target as Element).closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    hideToast();
    undo(pending);
  });
}

// Deleting a goal, state, activity or vision: Undo after. A goal or activity with activities under it
// first asks whether they go too; those that also belong elsewhere always stay.
export function deleteItem(kind: ItemKind, id: string) {
  const { gone, shared } = kind === 'goal' || kind === 'activity' ? deletesWith(id) : { gone: [], shared: 0 };
  if (!gone.length) return removeItems(kind, id, []);
  askDelete(kind as 'goal' | 'activity', findEntity(id)?.item.title || '', gone.length, shared, withThem =>
    removeItems(kind, id, withThem ? gone : []),
  );
}

function removeItems(kind: ItemKind, id: string, under: string[]) {
  undoable(() => {
    const kept = [removeEntity(kind, id), ...under.map(a => removeEntity('activity', a))].every(k => k === 'ok');
    save();
    requestRender();
    if (!kept) return t('trash.notKept');
    return under.length
      ? tp(kind === 'goal' ? 'toast.deletedWith.goal' : 'toast.deletedWith.activity', under.length)
      : t(('toast.deleted.' + kind) as TextKey);
  });
}
