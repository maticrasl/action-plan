/** Sync: when it runs, merging this device with the sync file, and its status. */
import { GOOGLE_CLIENT_ID } from './config';
import { currentUser, userStorage } from '../store/users';
import { plans, plansVersion, setPlans, setPlansVersion } from '../store/state';
import { db, setDb, visions } from '../core/state';
import { PLANS_KEY, planKey, readPlan } from '../store/plans';
import { I18N, t } from '../i18n/index';
import { SYNC_COLLS, mergeStores, takePlanSnapshot, takeSnapshot, type Store } from '../core/merge';
import { uid } from '../core/util';
import { emptyDb, type Plan } from '../core/model';
import { emit } from '../store/events';
import { applyVisions } from '../store/visions';
import { SyncError, drive, toFile } from './drive';
import { prefs } from '../store/prefs';

/* =========================================================
   Google Drive sync
   ---------------------------------------------------------
   All plans and the plan list live in one hidden file in the user's Drive app folder
   (scope drive.appdata: only this app can see that folder). A sync reads the file, merges
   it with this device's plans item by item (core/merge.ts → mergeStores), stores the result
   locally and writes it back.
   There is no server, so Google's access token lasts about an hour and can only be renewed
   from a click; after that, sync pauses until the user clicks the sync button.
   main.ts starts it with initSync() (ui/sync-ui, the screen part).
   ========================================================= */

export const SYNC_DELAY = 3000; // after a change
export const SYNC_EVERY = 5 * 60000; // while the app is open

export const syncConfigured = () =>
  typeof GOOGLE_CLIENT_ID === 'string' && GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');
// Signed in = the current user has a Google account (users.js); the sync file is in that account's Drive.
export const syncConnected = () => syncConfigured() && !!currentUser().account;

// status: idle | syncing | synced | paused (needs a click) | offline | error | account (signed in to someone else's account)
export const syncState = { status: 'idle' as string, busy: false, again: false, timer: null as number | null };

/* ---------- Stores: this device ↔ the sync file ---------- */

// Everything on this device, as a detached copy.
export function localStore(): Required<Store> {
  const data = Object.fromEntries(plans.list.map(p => [p.id, p.id === plans.current ? db : readPlan(p.id)]));
  return JSON.parse(JSON.stringify({ plans: { list: plans.list, deleted: plans.deleted || {} }, data, visions }));
}

// The empty starter plan a new device makes on its first visit would otherwise sync as an extra
// "My plan"; on the first sync it is dropped when the Drive file already has plans.
export function dropStarterPlans(store: Required<Store>): Required<Store> {
  const starterNames = new Set(Object.values(I18N).map(l => l.strings['plan.defaultName']));
  const isStarter = (p: Plan) => {
    const d = store.data[p.id];
    return starterNames.has(p.name) && SYNC_COLLS.every(c => !d[c].length) && !Object.keys(d.deleted || {}).length;
  };
  const list = store.plans.list.filter(p => !isStarter(p));
  return {
    plans: { ...store.plans, list },
    data: Object.fromEntries(list.map(p => [p.id, store.data[p.id]])),
    visions: store.visions,
  };
}

// Make the merged store this device's data; the open plan is reloaded only if it changed.
export function applyStore(store: Store) {
  const before = JSON.stringify(db) + JSON.stringify(visions),
    current = plans.current;
  if (!store.plans.list.length) {
    const id = uid();
    store.plans.list.push({ id, name: t('plan.defaultName') });
    store.data[id] = emptyDb();
  }
  const keep = new Set(store.plans.list.map(p => p.id));
  plans.list
    .filter(p => !keep.has(p.id))
    .forEach(p => {
      try {
        userStorage.removeItem(planKey(p.id));
      } catch (e) {
        /* ignore */
      }
    });
  setPlans({
    current: keep.has(current as string) ? current : store.plans.list[0].id,
    list: store.plans.list,
    deleted: store.plans.deleted,
  });
  try {
    store.plans.list.forEach(p => userStorage.setItem(planKey(p.id), JSON.stringify(store.data[p.id])));
    userStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch (e) {
    emit('storageError');
  }
  takePlanSnapshot(plans);
  if (store.visions) applyVisions(store.visions);
  setPlansVersion(plansVersion + 1);
  setDb(readPlan(plans.current as string));
  takeSnapshot(db);
  emit('storeReplaced', plans.current !== current || JSON.stringify(db) + JSON.stringify(visions) !== before);
}

/* ---------- Sync ---------- */

// True while sync must wait: during the tour the open plan is a temporary one (main.ts sets it).
export let syncPaused = () => false;
export function setSyncPaused(v: () => boolean) {
  syncPaused = v;
}

export function scheduleSync(delay = SYNC_DELAY) {
  if (!syncConnected()) return;
  clearTimeout(syncState.timer as number);
  syncState.timer = setTimeout(() => syncNow(false), delay);
}

// `interactive` is true when a click started the sync, so Google may show its sign-in popup.
export async function syncNow(interactive = false): Promise<void> {
  // During the tour the open plan is a temporary one; endTour syncs once it is over.
  if (!syncConnected() || syncPaused()) return;
  if (syncState.busy) {
    syncState.again = true;
    return;
  }
  clearTimeout(syncState.timer as number);
  if (!navigator.onLine) return setSyncStatus('offline');
  // Another user taking over while this sync waits stops it: nothing of theirs is read or written.
  const user = currentUser(),
    mine = () => currentUser() === user;
  syncState.busy = true;
  setSyncStatus('syncing');
  try {
    const token = await drive.getToken(interactive);
    const remote = await drive.read(token);
    if (!mine()) return;
    // A tour that started while this sync waited: endTour syncs once it is over.
    if (syncPaused()) return setSyncStatus('idle');
    // From here until applyStore nothing waits, so no local edit can slip in between.
    let local = localStore();
    if (!prefs.get('syncedOnce', false) && remote.content?.plans.list.length) local = dropStarterPlans(local);
    const merged = remote.content ? mergeStores(local, remote.content) : local;
    applyStore(merged);
    const file = toFile(merged);
    if (!remote.content || JSON.stringify(file) !== JSON.stringify(toFile(remote.content)) || remote.extra.length) {
      await drive.write(token, remote.id, file);
      for (const id of remote.extra) await drive.remove(token, id);
    }
    if (!mine()) return;
    prefs.set('syncedOnce', true);
    prefs.set('lastSync', new Date().toISOString());
    setSyncStatus('synced');
  } catch (e) {
    if (!mine()) return;
    if (e instanceof SyncError) setSyncStatus(e.code === 'auth' ? 'paused' : e.code);
    else {
      console.error(e);
      setSyncStatus('error');
    }
  } finally {
    syncState.busy = false;
    if (syncState.again) {
      syncState.again = false;
      scheduleSync();
    }
  }
}

export function setSyncStatus(status: string) {
  syncState.status = status;
  emit('syncChanged');
}
