/** Users on one device and the storage under each one's key prefix. */
import { uid } from '../core/util';
import { LANG_KEY } from '../ui/i18n-dom';
import type { User, UserList } from '../core/model';

/* =========================================================
   Users: several people on one device, each signed in with their own Google account
   ---------------------------------------------------------
   Everything the app stores (plans, visions, preferences, the sync token) lives under keys that
   start with `actionplan.`; each user gets their own copy of that key space. The first user keeps
   the plain keys (so data from before users existed stays where it was), later users get
   `actionplan.u.<id>.…`. Only the user list itself and the language are shared by the device.
   All storage goes through `userStorage` and `userSession`, which put the current user's prefix on the key.
   A user without an account is a guest: the data on a device nobody has signed in on yet, or the
   empty space someone gets after signing out. At most one guest is kept.
   Loaded before visions.js and app.js, which read storage while they load.
   ========================================================= */

export const USERS_KEY = 'actionplan.users';
export const KEY_ROOT = 'actionplan.';

// As read from storage, before it is checked.
type RawUser = { id: string; ns: unknown; name: unknown; account?: { id?: unknown; email?: unknown } };

export function readUsers(): UserList {
  let raw: { current?: string; list?: RawUser[] } | null = null;
  try {
    raw = JSON.parse(localStorage.getItem(USERS_KEY) as string);
  } catch (e) {
    /* none yet */
  }
  const list: User[] = Array.isArray(raw?.list)
    ? raw.list
        .filter(u => u && /^[\w-]{1,64}$/.test(u.id) && (u.ns === '' || u.ns === `u.${u.id}.`))
        .map(u => ({
          id: u.id,
          ns: u.ns as string,
          name: typeof u.name === 'string' ? u.name : '',
          account:
            typeof u.account?.id === 'string' ? { id: u.account.id, email: String(u.account.email || '') } : null,
        }))
    : [];
  if (!list.length) {
    // A device that synced before users existed: linked to an account whose id the next sync learns.
    let linked = false;
    try {
      linked = localStorage.getItem(KEY_ROOT + 'v1.syncConnected') === 'true';
    } catch (e) {
      /* ignore */
    }
    return {
      current: 'local',
      list: [{ id: 'local', ns: '', name: '', account: linked ? { id: '', email: '' } : null }],
    };
  }
  const current = raw?.current;
  return { current: list.some(u => u.id === current) ? (current as string) : list[0].id, list };
}

export let users = readUsers();
export function setUsers(v: UserList) {
  users = v;
}
// There always is one: readUsers and every change keep `current` in the list.
export const currentUser = () => users.list.find(u => u.id === users.current) as User;

// False when it could not be stored (storage full): a login must not go on then, or after a reload the
// data it took over would belong to nobody again.
export function saveUsers() {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return true;
  } catch (e) {
    return false;
  }
}

// The current user's key for a device key: 'actionplan.plans' → 'actionplan.u.<id>.plans'.
export const userKey = (key: string) =>
  key.startsWith(KEY_ROOT) ? KEY_ROOT + currentUser().ns + key.slice(KEY_ROOT.length) : key;

export const scoped = (area: () => Storage) => ({
  getItem: (key: string) => area().getItem(userKey(key)),
  setItem: (key: string, value: string) => area().setItem(userKey(key), value),
  removeItem: (key: string) => area().removeItem(userKey(key)),
});
export const userStorage = scoped(() => localStorage);
export const userSession = scoped(() => sessionStorage);

// A new user with nothing stored yet, a guest until an account is set on it.
export function addUser() {
  const id = uid();
  const user: User = { id, ns: `u.${id}.`, name: '', account: null };
  users.list.push(user);
  saveUsers();
  return user;
}

// Every key stored for this user on this device (removing a user deletes them).
export function userKeys(user: User, area: Storage = localStorage) {
  const others = users.list.filter(u => u !== user && u.ns).map(u => KEY_ROOT + u.ns);
  const keys: string[] = [];
  for (let i = 0; i < area.length; i++) {
    const k = area.key(i) as string;
    if (k === USERS_KEY || !k.startsWith(KEY_ROOT + user.ns)) continue;
    if (!user.ns && (others.some(p => k.startsWith(p)) || k === LANG_KEY)) continue;
    keys.push(k);
  }
  return keys;
}

// Deletes a user's keys on this device: the session ones, and with `all` the stored ones first.
export function removeUserKeys(user: User, all: boolean) {
  (all ? [localStorage, sessionStorage] : [sessionStorage]).forEach(area =>
    userKeys(user, area).forEach(k => area.removeItem(k)),
  );
}
