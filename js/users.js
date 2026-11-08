'use strict';

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

const USERS_KEY = 'actionplan.users';
const ROOT = 'actionplan.';

function readUsers() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(USERS_KEY)); } catch (e) { /* none yet */ }
  const list = Array.isArray(raw?.list) ? raw.list.filter(u => u && /^[\w-]{1,64}$/.test(u.id) && typeof u.ns === 'string'
    && (u.ns === '' || u.ns === `u.${u.id}.`))
    .map(u => ({ id: u.id, ns: u.ns, name: typeof u.name === 'string' ? u.name : '',
      account: typeof u.account?.id === 'string' ? { id: u.account.id, email: String(u.account.email || '') } : null })) : [];
  if (!list.length) {
    // A device that synced before users existed: linked to an account whose id the next sync learns.
    let linked = false;
    try { linked = localStorage.getItem(ROOT + 'v1.syncConnected') === 'true'; } catch (e) { /* ignore */ }
    return { current: 'local', list: [{ id: 'local', ns: '', name: '', account: linked ? { id: '', email: '' } : null }] };
  }
  return { current: list.some(u => u.id === raw.current) ? raw.current : list[0].id, list };
}

let users = readUsers();
const currentUser = () => users.list.find(u => u.id === users.current);

function saveUsers() {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (e) { /* ignore */ }
}

// The current user's key for a device key: 'actionplan.plans' → 'actionplan.u.<id>.plans'.
const userKey = key => (key.startsWith(ROOT) ? ROOT + currentUser().ns + key.slice(ROOT.length) : key);

const scoped = area => ({
  getItem: key => area().getItem(userKey(key)),
  setItem: (key, value) => area().setItem(userKey(key), value),
  removeItem: key => area().removeItem(userKey(key)),
});
const userStorage = scoped(() => localStorage);
const userSession = scoped(() => sessionStorage);

// A new user with nothing stored yet; `account` is { id, email } or null for a guest.
function addUser(account, name = '') {
  const id = uid();
  const user = { id, ns: `u.${id}.`, name, account };
  users.list.push(user);
  saveUsers();
  return user;
}

// Every key this user's data is stored under (for checks and tests).
function userKeys(user, area = localStorage) {
  const others = users.list.filter(u => u !== user && u.ns).map(u => ROOT + u.ns);
  const keys = [];
  for (let i = 0; i < area.length; i++) {
    const k = area.key(i);
    if (k === USERS_KEY || !k.startsWith(ROOT + user.ns)) continue;
    if (!user.ns && (others.some(p => k.startsWith(p)) || k === ROOT + 'lang')) continue;
    keys.push(k);
  }
  return keys;
}
