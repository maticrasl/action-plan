'use strict';

/* =========================================================
   Google Drive sync
   ---------------------------------------------------------
   All plans and the plan list live in one hidden file in the user's Drive app folder
   (scope drive.appdata: only this app can see that folder). A sync reads the file, merges
   it with this device's plans item by item (sync.js → mergeStores), stores the result
   locally and writes it back.
   There is no server, so Google's access token lasts about an hour and can only be renewed
   from a click; after that, sync pauses until the user clicks the sync button.
   Loaded before app.js; initSync() is called from its boot section.
   ========================================================= */

const SYNC_FILE = 'actionplan-sync.json';
const SYNC_FORMAT = 'actionplan-sync';
const SYNC_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SYNC_DELAY = 3000;       // after a change
const SYNC_EVERY = 5 * 60000;  // while the app is open
const TOKEN_KEY = 'actionplan.syncToken'; // sessionStorage: survives a reload, not a browser restart
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_ABOUT = 'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId)';

const syncConfigured = () => typeof GOOGLE_CLIENT_ID === 'string' && GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');
// Signed in = the current user has a Google account (users.js); the sync file is in that account's Drive.
const syncConnected = () => syncConfigured() && !!currentUser().account;

// status: idle | syncing | synced | paused (needs a click) | offline | error | account (signed in to someone else's account)
const syncState = { status: 'idle', busy: false, again: false, timer: null };

class SyncError extends Error {
  constructor(code) { super(code); this.code = code; }
}

/* ---------- Google: access token and Drive file ---------- */

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  loadGis.promise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { loadGis.promise = null; reject(new SyncError('offline')); };
    document.head.append(s);
  });
  return loadGis.promise;
}

async function driveFetch(token, url, options = {}) {
  let res;
  try {
    res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  } catch (e) {
    throw new SyncError('offline');
  }
  if (res.status === 401) { if (drive.token?.value === token) drive.forget(); throw new SyncError('auth'); }
  if (!res.ok) throw new SyncError('error');
  return res;
}

// Tests swap these methods for an in-memory fake.
const drive = {
  token: null, // the current user's { value, expires }

  // A valid access token for the current user. Without one, only a click (interactive) may ask
  // Google for a new one, and it is kept only if it is for that user's own account.
  async getToken(interactive) {
    if (!this.token) { try { this.token = JSON.parse(userSession.getItem(TOKEN_KEY)); } catch (e) { /* none */ } }
    if (this.token && this.token.expires - Date.now() > 60000) return this.token.value;
    if (!interactive) throw new SyncError('auth');
    const user = currentUser();
    const token = await this.request(user.account?.email || '', '');
    const who = await this.whoami(token.value);
    if (currentUser() !== user) throw new SyncError('switched');
    if (user.account.id && who.id !== user.account.id) throw new SyncError('account');
    if (!user.account.id) { user.account = { id: who.id, email: who.email }; saveUsers(); } // linked before users existed
    this.keep(token);
    return token.value;
  },

  // Asks Google for an access token: `hint` is the account's email, `prompt` '' or 'select_account'.
  async request(hint, prompt) {
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SYNC_SCOPE,
        login_hint: hint || undefined,
        callback: r => {
          if (r.error || !google.accounts.oauth2.hasGrantedAllScopes(r, SYNC_SCOPE)) return reject(new SyncError('auth'));
          resolve({ value: r.access_token, expires: Date.now() + Number(r.expires_in) * 1000 });
        },
        error_callback: () => reject(new SyncError('auth')),
      });
      client.requestAccessToken({ prompt });
    });
  },

  // Whose token it is: the Google account's { id, email, name }.
  async whoami(token) {
    const { user } = await (await driveFetch(token, DRIVE_ABOUT)).json();
    if (!user?.permissionId) throw new SyncError('error');
    return { id: String(user.permissionId), email: String(user.emailAddress || ''), name: String(user.displayName || '') };
  },

  // Remembers a token for the current user only.
  keep(token) {
    this.token = token;
    try { userSession.setItem(TOKEN_KEY, JSON.stringify(token)); } catch (e) { /* ignore */ }
  },

  forget() {
    this.token = null;
    try { userSession.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  },

  // The sync file's id and content (null when there is none yet). Two devices connecting at the
  // same moment can each create a file; then all are merged and the extra ones listed for removal.
  async read(token) {
    const q = encodeURIComponent(`name = '${SYNC_FILE}' and trashed = false`);
    const list = await (await driveFetch(token, `${DRIVE_API}?spaces=appDataFolder&q=${q}&orderBy=createdTime&fields=files(id)`)).json();
    const files = list.files || [];
    if (!files.length) return { id: null, content: null, extra: [] };
    const contents = [];
    for (const f of files) contents.push(parseStore(await (await driveFetch(token, `${DRIVE_API}/${f.id}?alt=media`)).text()));
    return { id: files[0].id, content: contents.reduce((a, b) => mergeStores(a, b)), extra: files.slice(1).map(f => f.id) };
  },

  async write(token, id, content) {
    const body = JSON.stringify(content);
    if (id) {
      await driveFetch(token, `${DRIVE_UPLOAD}/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
      return id;
    }
    const boundary = 'actionplan' + Date.now().toString(36);
    const meta = JSON.stringify({ name: SYNC_FILE, parents: ['appDataFolder'] });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    const res = await driveFetch(token, `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
    return (await res.json()).id;
  },

  async remove(token, id) {
    await driveFetch(token, `${DRIVE_API}/${id}`, { method: 'DELETE' });
  },
};

/* ---------- Stores: this device ↔ the sync file ---------- */

function parseStore(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { throw new SyncError('error'); }
  if (raw?.format !== SYNC_FORMAT || !Array.isArray(raw.plans?.list)) throw new SyncError('error');
  const list = raw.plans.list.filter(p => p && safeId(p.id) && typeof p.name === 'string');
  return {
    plans: { list, deleted: raw.plans.deleted && typeof raw.plans.deleted === 'object' ? raw.plans.deleted : {} },
    data: Object.fromEntries(list.map(p => [p.id, normalize(raw.data?.[p.id])])),
    visions: normalizeVisions(raw.visions),
  };
}

const toFile = store => ({ format: SYNC_FORMAT, version: 1, plans: store.plans, data: store.data, visions: store.visions });

// Everything on this device, as a detached copy.
function localStore() {
  const data = Object.fromEntries(plans.list.map(p => [p.id, p.id === plans.current ? db : readPlan(p.id)]));
  return JSON.parse(JSON.stringify({ plans: { list: plans.list, deleted: plans.deleted || {} }, data, visions }));
}

// The empty starter plan a new device makes on its first visit would otherwise sync as an extra
// "My plan"; on the first sync it is dropped when the Drive file already has plans.
function dropStarterPlans(store) {
  const starterNames = new Set(Object.values(I18N).map(l => l.strings['plan.defaultName']));
  const isStarter = p => {
    const d = store.data[p.id];
    return starterNames.has(p.name) && SYNC_COLLS.every(c => !d[c].length) && !Object.keys(d.deleted || {}).length;
  };
  const list = store.plans.list.filter(p => !isStarter(p));
  return { plans: { ...store.plans, list }, data: Object.fromEntries(list.map(p => [p.id, store.data[p.id]])), visions: store.visions };
}

// Make the merged store this device's data; the open plan is reloaded only if it changed.
function applyStore(store) {
  const before = JSON.stringify(db) + JSON.stringify(visions), current = plans.current;
  if (!store.plans.list.length) {
    const id = uid();
    store.plans.list.push({ id, name: t('plan.defaultName') });
    store.data[id] = emptyDb();
  }
  const keep = new Set(store.plans.list.map(p => p.id));
  plans.list.filter(p => !keep.has(p.id)).forEach(p => { try { userStorage.removeItem(planKey(p.id)); } catch (e) { /* ignore */ } });
  plans = { current: keep.has(current) ? current : store.plans.list[0].id, list: store.plans.list, deleted: store.plans.deleted };
  try {
    store.plans.list.forEach(p => userStorage.setItem(planKey(p.id), JSON.stringify(store.data[p.id])));
    userStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch (e) {
    toast(t('err.storage'));
  }
  takePlanSnapshot(plans);
  if (store.visions) applyVisions(store.visions);
  plansVersion++;
  db = readPlan(plans.current);
  takeSnapshot(db);
  renderPlanSwitch();
  if (plans.current !== current || JSON.stringify(db) + JSON.stringify(visions) !== before) render();
}

/* ---------- Sync ---------- */

function scheduleSync(delay = SYNC_DELAY) {
  if (!syncConnected()) return;
  clearTimeout(syncState.timer);
  syncState.timer = setTimeout(() => syncNow(false), delay);
}

// `interactive` is true when a click started the sync, so Google may show its sign-in popup.
async function syncNow(interactive = false) {
  // During the tour the open plan is a temporary one; endTour syncs once it is over.
  if (!syncConnected() || (typeof tour !== 'undefined' && tour.step >= 0)) return;
  if (syncState.busy) { syncState.again = true; return; }
  clearTimeout(syncState.timer);
  if (!navigator.onLine) return setSyncStatus('offline');
  // Another user taking over while this sync waits stops it: nothing of theirs is read or written.
  const user = currentUser(), mine = () => currentUser() === user;
  syncState.busy = true;
  setSyncStatus('syncing');
  try {
    const token = await drive.getToken(interactive);
    const remote = await drive.read(token);
    if (!mine()) return;
    // A tour that started while this sync waited: endTour syncs once it is over.
    if (typeof tour !== 'undefined' && tour.step >= 0) return setSyncStatus('idle');
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
    else { console.error(e); setSyncStatus('error'); }
  } finally {
    syncState.busy = false;
    if (syncState.again) { syncState.again = false; scheduleSync(); }
  }
}

/* ---------- Signing in and out: one user per Google account (users.js) ---------- */

const userName = u => u.name || u.account?.email || t('user.guest');

function askUserName(who) {
  const suggestion = (who.name || who.email.split('@')[0] || t('user.defaultName')).slice(0, 40);
  return (prompt(t('user.askName'), suggestion) || '').trim().slice(0, 40) || suggestion;
}

// Signs in with Google (from Settings). The chosen account's own user if this device has one;
// else the data here becomes that account's when it belongs to no account yet (a guest's), and
// otherwise the account gets a new, empty user, as on a first visit. `target` is the user picked
// in the list, whose account may not be known yet (linked before users existed).
async function logIn(hint = '', target = null) {
  const from = currentUser();
  let token, who;
  try {
    token = await drive.request(hint, 'select_account');
    who = await drive.whoami(token.value);
  } catch (e) {
    return toast(t('sync.connectFailed'));
  }
  if (currentUser() !== from) return;
  let user = users.list.find(u => u.account?.id === who.id) || (target?.account && !target.account.id ? target : null);
  const known = !!user;
  if (!user) user = from.account ? addUser(null) : from;
  user.account = { id: who.id, email: who.email };
  if (!user.name) user.name = askUserName(who);
  saveUsers();
  const firstVisit = user !== from && enterUser(user.id);
  drive.keep(token);
  if (!known) prefs.set('syncedOnce', false);
  toast(known && user !== from ? t('user.switched', { name: userName(user) }) : t('sync.connected'));
  renderSync();
  await syncNow(true);
  if (firstVisit) offerTour();
}

// Signs out: this user's data stays on the device, apart, and the guest's (empty at first) opens.
function logOut() {
  const name = userName(currentUser());
  drive.forget();
  enterUser((users.list.find(u => !u.account) || addUser(null)).id);
  toast(t('user.loggedOut', { name }));
}

// Removes a user and everything stored for them on this device; what synced stays in their Google Drive,
// so logging in again brings it back. Removing the current user opens the guest, as logging out does.
function removeUser(id) {
  const user = users.list.find(u => u.id === id);
  if (!user?.account) return;
  const name = userName(user);
  if (!confirm(t('user.removeConfirm', { name }))) return;
  if (user === currentUser()) {
    drive.forget();
    enterUser((users.list.find(u => !u.account) || addUser(null)).id);
  }
  [localStorage, sessionStorage].forEach(area => userKeys(user, area).forEach(k => area.removeItem(k)));
  users.list = users.list.filter(u => u !== user);
  saveUsers();
  renderSync();
  toast(t('user.removed', { name }));
}

function renameUser(name) {
  currentUser().name = name.trim().slice(0, 40);
  saveUsers();
  renderSync();
}

/* ---------- Status: the cloud button in the top bar and the Account section in Settings ---------- */

function setSyncStatus(status) {
  syncState.status = status;
  renderSync();
}

function syncTime(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString(locale(), sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function syncStatusText() {
  const s = syncState.status;
  if (s === 'idle' || s === 'synced') {
    const at = prefs.get('lastSync', null);
    return at ? t('sync.status.synced', { time: syncTime(at) }) : t('sync.status.never');
  }
  if (s === 'account') return t('sync.status.account', { email: currentUser().account?.email || '' });
  return t('sync.status.' + s);
}

function renderSync() {
  const connected = syncConnected(), user = currentUser();
  const btn = $('#syncBtn');
  btn.hidden = !connected;
  btn.dataset.status = syncState.status;
  btn.title = syncStatusText();
  btn.setAttribute('aria-label', btn.title);
  const body = $('#syncSection .sync-body');
  // While the name is being typed, only the status changes, so the field keeps its focus.
  const status = body.querySelector('.sync-status');
  if (status && body.contains(document.activeElement) && document.activeElement.matches('input')) {
    status.dataset.status = syncState.status;
    status.lastChild.textContent = syncStatusText();
    return;
  }
  const action = (act, label, cls = '', id = '') => `<button type="button" class="btn small ${cls}" data-sync="${act}"${id ? ` data-user="${id}"` : ''}>${label}</button>`;
  const others = users.list.filter(u => u !== user && u.account);
  const list = others.length ? `<p class="user-list-title">${t('user.others')}</p><ul class="user-list">${others.map(u => `<li>
      <span class="user-mono" aria-hidden="true">${esc([...userName(u)][0].toLocaleUpperCase())}</span>
      <span class="user-who"><b>${esc(userName(u))}</b>${u.account.email && u.name ? `<small>${esc(u.account.email)}</small>` : ''}</span>
      ${action('switch', t(connected ? 'user.switch' : 'user.logIn'), '', u.id)}${action('remove', t('user.remove'), 'ghost', u.id)}</li>`).join('')}</ul>` : '';
  let html;
  if (!syncConfigured()) html = `<p class="hint">${t('sync.notConfigured')}</p>`;
  else if (!connected) html = `<p class="hint">${t('sync.intro')}</p><div class="set-actions">${action('connect', t('sync.connect'), 'primary')}</div>${list}`;
  else {
    html = `<label class="set-row user-name"><span>${t('user.name')}</span><input type="text" data-user-name maxlength="40" autocomplete="nickname" value="${esc(user.name)}" placeholder="${esc(userName(user))}"></label>
      ${user.account.email ? `<p class="hint">${t('user.signedInAs', { email: esc(user.account.email) })}</p>` : ''}
      <p class="sync-status" data-status="${syncState.status}"><i aria-hidden="true"></i><span>${esc(syncStatusText())}</span></p>
      <div class="set-actions">${action('now', t('sync.now'))}${action('connect', t('user.add'))}${action('logout', t('user.logOut'), 'ghost')}${action('remove', t('user.removeMe'), 'ghost', user.id)}</div>
      <p class="hint">${t('sync.clockHint')}</p>${list}`;
  }
  body.innerHTML = html;
}

function initSync() {
  $('#syncBtn').addEventListener('click', () => syncNow(true));
  $('#syncSection').addEventListener('click', e => {
    const el = e.target.closest('[data-sync]');
    const act = el?.dataset.sync;
    if (act === 'connect') logIn();
    if (act === 'now') syncNow(true);
    if (act === 'logout') logOut();
    if (act === 'remove') removeUser(el.dataset.user);
    if (act === 'switch') {
      const user = users.list.find(u => u.id === el.dataset.user);
      if (user?.account) logIn(user.account.email, user);
    }
  });
  $('#syncSection').addEventListener('change', e => { if (e.target.matches('[data-user-name]')) renameUser(e.target.value); });
  // Load Google's script ahead of a click, so its popup opens straight from that click.
  $('#settingsBtn').addEventListener('click', () => { if (syncConfigured()) loadGis().catch(() => {}); });
  addEventListener('online', () => syncNow(false));
  addEventListener('offline', () => syncConnected() && setSyncStatus('offline'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(false); });
  setInterval(() => syncNow(false), SYNC_EVERY);
  renderSync();
  if (syncConnected()) {
    loadGis().catch(() => {});
    syncNow(false);
  }
}
