/** The timeline and graphs views, and boot (phase 7 moves the two views; the map is in views/map). */
import { clamp } from '../core/util';
import { REL_TYPES, VISION_RELS, emptyDb } from '../core/model';
import { setDb } from '../core/state';
import { saveUsers, userStorage, users } from '../store/users';
import { STORAGE_KEY, prefs } from '../store/prefs';
import { freshUi, setPlans, ui } from '../store/state';
import { PLANS_KEY, load } from '../store/plans';
import { setOtherPlansCache } from '../store/visions';
import { drive } from '../sync/drive';
import { syncState } from '../sync/sync';
import { renderSync } from '../ui/sync-ui';
import { $ } from '../ui/dom';
import { closeCtxMenu } from '../ui/menu';
import { applyNavCollapsed } from '../ui/nav';
import { closeAmountPop } from '../ui/amount-popover';
import { reachedQueue } from '../ui/reached';
import { hideToast } from '../ui/toast';
import { THEMES, applyTheme, renderSettings, setTheme, settings } from '../ui/settings';
import { renderPlanSwitch, storedHealth } from '../ui/plan-switcher';
import { endTour, isTourRunning } from '../tutorial/tour';
import { VIEWS, render } from '../views/index';
import { MAP } from '../views/map/layout';
import { TL } from '../views/timeline/render';

/* ---------- Boot ---------- */

// Loads the current user's plans, visions and preferences and shows them; true on their first visit.
export function bootUser() {
  // First visit = nothing stored yet; load() creates the first plan, so check before it.
  let firstVisit = false;
  try { firstVisit = !userStorage.getItem(PLANS_KEY) && !userStorage.getItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  setTheme(THEMES.includes(prefs.get('theme')) ? prefs.get('theme') : 'system');
  applyTheme();
  load();
  renderPlanSwitch();
  if (VIEWS[prefs.get('view')]) ui.view = prefs.get('view');
  ui.mapHidden = new Set([].concat(prefs.get('mapHidden', [])).filter(k => REL_TYPES[k] || VISION_RELS[k]));
  ui.hideDone = prefs.get('hideDone', false) === true;
  ui.hideVisions = prefs.get('hideVisions', false) === true;
  ui.nextAll = prefs.get('nextAll', false) === true;
  ui.tlDeps = prefs.get('tlDeps', true) !== false;
  ui.planBadges = prefs.get('planBadges', true) !== false;
  ui.tlPx = clamp(Number(prefs.get('tlPx', TL.ZOOM[prefs.get('tlZoom')] || TL.ZOOM.month)) || TL.ZOOM.month, TL.MIN, TL.MAX);
  ui.mapScale = clamp(Number(prefs.get('mapScale', 1)) || 1, MAP.MIN_SCALE, MAP.MAX_SCALE);
  ui.category = typeof prefs.get('category') === 'string' ? prefs.get('category') : '';
  ui.help = prefs.get('help', false) === true;
  ui.navCollapsed = prefs.get('navCollapsed', false) === true;
  applyNavCollapsed();
  $('#helpBtn').setAttribute('aria-pressed', ui.help);
  render();
  return firstVisit;
}

// Another user takes over this device: nothing of the one before stays in memory, on screen or
// in a sync on its way (syncNow stops itself). Returns true on that user's first visit.
export function enterUser(id) {
  if (isTourRunning()) endTour(false);
  closeCtxMenu();
  closeAmountPop();
  reachedQueue.length = 0; // "goal reached" popups still waiting were the other user's
  hideToast(); // an undo in it would act on the other user's plan
  document.querySelectorAll('dialog[open]').forEach(d => { if (d !== settings) d.close(); });
  clearTimeout(syncState.timer);
  Object.assign(syncState, { status: 'idle', again: false, timer: null });
  drive.token = null;
  users.current = id;
  saveUsers();
  Object.keys(ui).forEach(k => delete ui[k]);
  Object.assign(ui, freshUi());
  storedHealth.clear();
  setOtherPlansCache({ key: '', list: [] });
  setPlans({ current: null, list: [] });
  setDb(emptyDb());
  const firstVisit = bootUser();
  renderSettings();
  renderSync();
  return firstVisit;
}
