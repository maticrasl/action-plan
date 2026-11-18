/** Signing in and out, the sync button and the Account section in Settings (screen part of sync). */
import { locale, t, type TextKey } from '../i18n/index';
import { USERS_KEY, addUser, currentUser, readUsers, removeUserKeys, saveUsers, setUsers, users } from '../store/users';
import { drive, loadGis, type Account } from '../sync/drive';
import type { User } from '../core/model';
import { prefs } from '../store/prefs';
import { SYNC_EVERY, setSyncStatus, syncConfigured, syncConnected, syncNow, syncState } from '../sync/sync';
import { plans } from '../store/state';
import { SYNC_COLLS } from '../core/merge';
import { db } from '../core/state';
import { $, esc } from './dom';
import { toast } from './toast';

// Switching users and offering the tour belong to the app above the screen parts; main.ts connects them.
let enterUser: (id: string) => boolean = () => false;
let offerTour: () => void = () => {};
export function connectSync(fns: { enterUser: (id: string) => boolean; offerTour: () => void }) {
  ({ enterUser, offerTour } = fns);
}

/* ---------- Signing in and out: one user per Google account (users.js) ---------- */

export const NAME_MAX = 40;
export const userName = (u: User) => u.name || u.account?.email || t(u.account ? 'user.unnamed' : 'user.guest');

export function askUserName(who: Account) {
  const suggestion = (who.name || who.email.split('@')[0] || t('user.defaultName')).slice(0, NAME_MAX);
  return (prompt(t('user.askName'), suggestion) || '').trim().slice(0, NAME_MAX) || suggestion;
}

// Signs in with Google (from Settings). The chosen account's own user if this device has one;
// else the data here becomes that account's when it belongs to no account yet (a guest's), and
// otherwise the account gets a new, empty user, as on a first visit. `target` is the user picked
// in the list, whose account may not be known yet (linked before users existed).
export async function logIn(hint = '', target: User | null = null) {
  const from = currentUser();
  let token, who;
  try {
    token = await drive.request(hint, 'select_account');
    who = await drive.whoami(token.value);
  } catch (e) {
    return toast(t('sync.connectFailed'));
  }
  if (currentUser() !== from) return;
  const before = JSON.stringify(users);
  let user = users.list.find(u => u.account?.id === who.id) || (target?.account && !target.account.id ? target : null);
  const known = !!user;
  if (!user) user = from.account ? addUser() : from;
  user.account = { id: who.id, email: who.email };
  if (!user.name) user.name = askUserName(who);
  // Not stored (storage full): nothing changes, so no data here is left to whoever logs in next.
  if (!saveUsers()) {
    setUsers(JSON.parse(before));
    return toast(t('err.storage'));
  }
  const firstVisit = user !== from && enterUser(user.id);
  drive.keep(token);
  if (!known) prefs.set('syncedOnce', false);
  toast(known && user !== from ? t('user.switched', { name: userName(user) }) : t('sync.connected'));
  renderSync();
  await syncNow(true);
  // A first visit, unless the sync brought back plans from the account's other devices.
  if (firstVisit && plans.list.length === 1 && !SYNC_COLLS.some(c => db[c].length)) offerTour();
}

// The guest's space opens (made, empty, when there is none); the one before keeps their data, apart.
export function openGuest() {
  drive.forget();
  enterUser((users.list.find(u => !u.account) || addUser()).id);
}

export function logOut() {
  const name = userName(currentUser());
  openGuest();
  toast(t('user.loggedOut', { name }));
}

// Removes a user and everything stored for them on this device; what synced stays in their Google Drive,
// so logging in again brings it back. Removing the current user opens the guest, as logging out does.
export function removeUser(id: string) {
  const user = users.list.find(u => u.id === id);
  if (!user?.account) return;
  const name = userName(user);
  if (!confirm(t('user.removeConfirm', { name }))) return;
  if (user === currentUser()) openGuest();
  removeUserKeys(user, true);
  users.list = users.list.filter(u => u !== user);
  saveUsers();
  renderSync();
  toast(t('user.removed', { name }));
}

export function renameUser(name: string) {
  currentUser().name = name.trim().slice(0, NAME_MAX);
  saveUsers();
  renderSync();
}

/* ---------- Status: the cloud button in the top bar and the Account section in Settings ---------- */

export function syncTime(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(
    locale(),
    sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  );
}

export function syncStatusText() {
  const s = syncState.status;
  if (s === 'idle' || s === 'synced') {
    const at = prefs.get('lastSync', null);
    return at ? t('sync.status.synced', { time: syncTime(at) }) : t('sync.status.never');
  }
  if (s === 'account') {
    const email = currentUser().account?.email;
    return email ? t('sync.status.account', { email }) : t('sync.status.accountTaken');
  }
  return t(('sync.status.' + s) as TextKey);
}

export function renderSync() {
  const connected = syncConnected(),
    user = currentUser();
  const btn = $('#syncBtn');
  btn.hidden = !connected;
  btn.dataset.status = syncState.status;
  btn.title = syncStatusText();
  btn.setAttribute('aria-label', btn.title);
  const body = $('#syncSection .sync-body');
  // While the name is being typed, only the status changes, so the field keeps its focus.
  const status = body.querySelector<HTMLElement>('.sync-status');
  if (status && body.contains(document.activeElement) && document.activeElement!.matches('input')) {
    status.dataset.status = syncState.status;
    status.lastChild!.textContent = syncStatusText();
    return;
  }
  const action = (act: string, label: string, cls = '', id = '') =>
    `<button type="button" class="btn small ${cls}" data-sync="${act}"${id ? ` data-user="${id}"` : ''}>${label}</button>`;
  const others = users.list.filter(u => u !== user && u.account);
  const list = others.length
    ? `<p class="user-list-title">${t('user.others')}</p><ul class="user-list">${others
        .map(
          u => `<li>
      <span class="user-mono" aria-hidden="true">${esc([...userName(u)][0].toLocaleUpperCase())}</span>
      <span class="user-who"><b>${esc(userName(u))}</b>${u.account!.email && u.name ? `<small>${esc(u.account!.email)}</small>` : ''}</span>
      ${action('switch', t(connected ? 'user.switch' : 'user.logIn'), '', u.id)}${action('remove', t('user.remove'), 'ghost', u.id)}</li>`,
        )
        .join('')}</ul>`
    : '';
  let html;
  if (!syncConfigured()) html = `<p class="hint">${t('sync.notConfigured')}</p>`;
  else if (!connected)
    html = `<p class="hint">${t('sync.intro')}</p><div class="set-actions">${action('connect', t('sync.connect'), 'primary')}</div>${list}`;
  else {
    html = `<label class="set-row user-name"><span>${t('user.name')}</span><input type="text" data-user-name maxlength="${NAME_MAX}" autocomplete="nickname" value="${esc(user.name)}" placeholder="${esc(userName(user))}"></label>
      ${user.account!.email ? `<p class="hint">${t('user.signedInAs', { email: esc(user.account!.email) })}</p>` : ''}
      <p class="sync-status" data-status="${syncState.status}"><i aria-hidden="true"></i><span>${esc(syncStatusText())}</span></p>
      <div class="set-actions">${action('now', t('sync.now'))}${action('connect', t('user.add'))}${action('logout', t('user.logOut'), 'ghost')}${action('remove', t('user.removeMe'), 'ghost', user.id)}</div>
      <p class="hint">${t('sync.clockHint')}</p>${list}`;
  }
  body.innerHTML = html;
}

export function initSync() {
  $('#syncBtn').addEventListener('click', () => syncNow(true));
  $('#syncSection').addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-sync]');
    const act = el?.dataset.sync;
    if (act === 'connect') logIn();
    if (act === 'now') syncNow(true);
    if (act === 'logout') logOut();
    if (act === 'remove') removeUser(el!.dataset.user!);
    if (act === 'switch') {
      const user = users.list.find(u => u.id === el!.dataset.user);
      if (user?.account) logIn(user.account.email, user);
    }
  });
  $('#syncSection').addEventListener('change', e => {
    if ((e.target as HTMLInputElement).matches('[data-user-name]')) renameUser((e.target as HTMLInputElement).value);
  });
  // Another tab changed the user list: this one takes it over, so it never writes an old list back.
  // If it removed the user open here, this tab's token for them goes too and the guest opens.
  addEventListener('storage', e => {
    if (e.key !== USERS_KEY) return;
    const was = currentUser();
    setUsers(readUsers());
    if (users.list.some(u => u.id === was.id)) {
      users.current = was.id;
      return renderSync();
    }
    removeUserKeys(was, false);
    enterUser((users.list.find(u => !u.account) || addUser()).id);
  });
  // Load Google's script ahead of a click, so its popup opens straight from that click.
  $('#settingsBtn').addEventListener('click', () => {
    if (syncConfigured()) loadGis().catch(() => {});
  });
  addEventListener('online', () => syncNow(false));
  addEventListener('offline', () => syncConnected() && setSyncStatus('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow(false);
  });
  setInterval(() => syncNow(false), SYNC_EVERY);
  renderSync();
  if (syncConnected()) {
    loadGis().catch(() => {});
    syncNow(false);
  }
}
