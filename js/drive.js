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

const syncConfigured = () => typeof GOOGLE_CLIENT_ID === 'string' && GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com');
const syncConnected = () => syncConfigured() && prefs.get('syncConnected', false) === true;

// status: idle | syncing | synced | paused (needs a click) | offline | error
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
  if (res.status === 401) { drive.forget(); throw new SyncError('auth'); }
  if (!res.ok) throw new SyncError('error');
  return res;
}

// Tests swap these methods for an in-memory fake.
const drive = {
  token: null, // { value, expires }

  // A valid access token; without one, only a click (interactive) may ask Google for a new one.
  async getToken(interactive) {
    if (!this.token) { try { this.token = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); } catch (e) { /* none */ } }
    if (this.token && this.token.expires - Date.now() > 60000) return this.token.value;
    if (!interactive) throw new SyncError('auth');
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SYNC_SCOPE,
        callback: r => {
          if (r.error || !google.accounts.oauth2.hasGrantedAllScopes(r, SYNC_SCOPE)) return reject(new SyncError('auth'));
          this.token = { value: r.access_token, expires: Date.now() + Number(r.expires_in) * 1000 };
          try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(this.token)); } catch (e) { /* ignore */ }
          resolve(r.access_token);
        },
        error_callback: () => reject(new SyncError('auth')),
      });
      client.requestAccessToken({ prompt: prefs.get('syncConnected', false) ? '' : 'consent' });
    });
  },

  forget() {
    this.token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  },

  revoke() {
    if (this.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(this.token.value, () => {});
    this.forget();
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
  const list = raw.plans.list.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string');
  return {
    plans: { list, deleted: raw.plans.deleted && typeof raw.plans.deleted === 'object' ? raw.plans.deleted : {} },
    data: Object.fromEntries(list.map(p => [p.id, normalize(raw.data?.[p.id])])),
  };
}

const toFile = store => ({ format: SYNC_FORMAT, version: 1, plans: store.plans, data: store.data });

// Everything on this device, as a detached copy.
function localStore() {
  const data = Object.fromEntries(plans.list.map(p => [p.id, p.id === plans.current ? db : readPlan(p.id)]));
  return JSON.parse(JSON.stringify({ plans: { list: plans.list, deleted: plans.deleted || {} }, data }));
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
  return { plans: { ...store.plans, list }, data: Object.fromEntries(list.map(p => [p.id, store.data[p.id]])) };
}

// Make the merged store this device's data; the open plan is reloaded only if it changed.
function applyStore(store) {
  const before = JSON.stringify(db), current = plans.current;
  if (!store.plans.list.length) {
    const id = uid();
    store.plans.list.push({ id, name: t('plan.defaultName') });
    store.data[id] = emptyDb();
  }
  const keep = new Set(store.plans.list.map(p => p.id));
  plans.list.filter(p => !keep.has(p.id)).forEach(p => { try { localStorage.removeItem(planKey(p.id)); } catch (e) { /* ignore */ } });
  plans = { current: keep.has(current) ? current : store.plans.list[0].id, list: store.plans.list, deleted: store.plans.deleted };
  try {
    store.plans.list.forEach(p => localStorage.setItem(planKey(p.id), JSON.stringify(store.data[p.id])));
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch (e) {
    toast(t('err.storage'));
  }
  takePlanSnapshot(plans);
  db = readPlan(plans.current);
  takeSnapshot(db);
  renderPlanSwitch();
  if (plans.current !== current || JSON.stringify(db) !== before) render();
}

/* ---------- Sync ---------- */

function scheduleSync(delay = SYNC_DELAY) {
  if (!syncConnected()) return;
  clearTimeout(syncState.timer);
  syncState.timer = setTimeout(() => syncNow(false), delay);
}

// `interactive` is true when a click started the sync, so Google may show its sign-in popup.
async function syncNow(interactive = false) {
  if (!syncConnected()) return;
  if (syncState.busy) { syncState.again = true; return; }
  clearTimeout(syncState.timer);
  if (!navigator.onLine) return setSyncStatus('offline');
  syncState.busy = true;
  setSyncStatus('syncing');
  try {
    const token = await drive.getToken(interactive);
    const remote = await drive.read(token);
    // During the tour the open plan is a temporary one: try again once it is over.
    if (typeof tour !== 'undefined' && tour.step >= 0) { syncState.again = true; return setSyncStatus('idle'); }
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
    prefs.set('syncedOnce', true);
    prefs.set('lastSync', new Date().toISOString());
    setSyncStatus('synced');
  } catch (e) {
    if (e instanceof SyncError) setSyncStatus(e.code === 'auth' ? 'paused' : e.code);
    else { console.error(e); setSyncStatus('error'); }
  } finally {
    syncState.busy = false;
    if (syncState.again) { syncState.again = false; scheduleSync(); }
  }
}

async function connectSync() {
  try {
    await drive.getToken(true);
  } catch (e) {
    return toast(t('sync.connectFailed'));
  }
  prefs.set('syncConnected', true);
  prefs.set('syncedOnce', false);
  toast(t('sync.connected'));
  await syncNow(true);
}

function disconnectSync() {
  drive.revoke();
  ['syncConnected', 'syncedOnce', 'lastSync'].forEach(k => prefs.set(k, null));
  clearTimeout(syncState.timer);
  setSyncStatus('idle');
  toast(t('sync.disconnected'));
}

/* ---------- Status: the cloud button in the top bar and the Sync section in Settings ---------- */

function setSyncStatus(status) {
  syncState.status = status;
  renderSync();
}

function syncTime(iso) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  if (I18N[lang].dateFormat) return `${fmtDate(isoDate(d))} ${time}`;
  return d.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function syncStatusText() {
  const s = syncState.status;
  if (s === 'idle' || s === 'synced') {
    const at = prefs.get('lastSync', null);
    return at ? t('sync.status.synced', { time: syncTime(at) }) : t('sync.status.never');
  }
  return t('sync.status.' + s);
}

function renderSync() {
  const connected = syncConnected();
  const btn = $('#syncBtn');
  btn.hidden = !connected;
  btn.dataset.status = syncState.status;
  btn.title = syncStatusText();
  btn.setAttribute('aria-label', btn.title);
  const action = (act, label, cls = '') => `<button type="button" class="btn small ${cls}" data-sync="${act}">${label}</button>`;
  let html;
  if (!syncConfigured()) html = `<p class="hint">${t('sync.notConfigured')}</p>`;
  else if (!connected) html = `<p class="hint">${t('sync.intro')}</p><div class="set-actions">${action('connect', t('sync.connect'))}</div>`;
  else {
    html = `<p class="sync-status" data-status="${syncState.status}"><i aria-hidden="true"></i>${esc(syncStatusText())}</p>
      <div class="set-actions">${action('now', t('sync.now'))}${action('disconnect', t('sync.disconnect'), 'ghost')}</div>
      <p class="hint">${t('sync.clockHint')}</p>`;
  }
  $('#syncSection .sync-body').innerHTML = html;
}

function initSync() {
  $('#syncBtn').addEventListener('click', () => syncNow(true));
  $('#syncSection').addEventListener('click', e => {
    const act = e.target.closest('[data-sync]')?.dataset.sync;
    if (act === 'connect') connectSync();
    if (act === 'now') syncNow(true);
    if (act === 'disconnect') disconnectSync();
  });
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
