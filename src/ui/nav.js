/** Moving between views: the sidebar and tab bar, the phone's More menu, the collapsible sidebar. */
import { ui } from '../store/state';
import { prefs } from '../store/prefs';
import { requestRender } from './render';
import { $ } from './dom';
import { t } from '../i18n/index';

export function setView(view) {
  ui.view = view;
  ui.mapLinkFrom = null;
  ui.search = '';
  ui.mapRefocus = true;
  prefs.set('view', view);
  requestRender();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.nav-item[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

/* ---------- "More" menu of the phone tab bar ---------- */

export function openNavSheet() {
  const sheet = $('#navSheet');
  sheet.innerHTML = [...document.querySelectorAll('.nav-extra')].map(b =>
    `<button type="button" role="menuitem" class="${b.dataset.view === ui.view ? 'active' : ''}" data-sheet-view="${b.dataset.view}">${b.innerHTML}</button>`).join('');
  sheet.hidden = false;
  $('#navMore').setAttribute('aria-expanded', 'true');
  (sheet.querySelector('.active') || sheet.querySelector('button')).focus();
}

export function closeNavSheet(refocus = false) {
  const sheet = $('#navSheet');
  if (sheet.hidden) return;
  sheet.hidden = true;
  $('#navMore').setAttribute('aria-expanded', 'false');
  if (refocus) $('#navMore').focus();
}

$('#navMore').addEventListener('click', () => ($('#navSheet').hidden ? openNavSheet() : closeNavSheet()));
$('#navSheet').addEventListener('click', e => {
  const b = e.target.closest('[data-sheet-view]');
  if (!b) return;
  closeNavSheet();
  setView(b.dataset.sheetView);
});
$('#navSheet').addEventListener('keydown', e => {
  const items = [...$('#navSheet').querySelectorAll('button')];
  const i = items.indexOf(document.activeElement);
  const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
  if (e.key === 'Escape' || e.key === 'Tab') {
    if (e.key === 'Escape') e.preventDefault();
    closeNavSheet(e.key === 'Escape');
  } else if (to !== undefined) {
    e.preventDefault();
    items[(to + items.length) % items.length].focus();
  }
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('#navSheet, #navMore')) closeNavSheet(); });
// The menu only exists on phones; close it when the window grows past that.
matchMedia('(max-width: 720px)').addEventListener('change', e => { if (!e.matches) closeNavSheet(); });

/* ---------- Collapsible sidebar (desktop): only the icons stay visible ---------- */

export function setNavCollapsed(on) {
  ui.navCollapsed = on;
  prefs.set('navCollapsed', on);
  applyNavCollapsed();
  requestRender(); // graphs are drawn at the view's width
}

export function applyNavCollapsed() {
  const on = ui.navCollapsed;
  $('.app').classList.toggle('nav-collapsed', on);
  const b = $('#navToggle');
  b.setAttribute('aria-expanded', !on);
  b.querySelector('span').textContent = t(on ? 'nav.expand' : 'nav.collapse');
  b.title = t(on ? 'nav.expand' : 'nav.collapse');
}

$('#navToggle').addEventListener('click', () => setNavCollapsed(!ui.navCollapsed));
