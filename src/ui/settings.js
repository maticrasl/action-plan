/** Settings: language, theme, display options and the dialog that holds them. */
import { I18N, lang, t } from '../i18n/index';
import { $, esc } from './dom';
import { applyStaticI18n, setLanguage } from './i18n-dom';
import { applyNavCollapsed, setNavCollapsed } from './nav';
import { renderSync } from './sync-ui';
import { renderInstall } from './install';
import { modal } from './forms/form';
import { requestRender } from './render';
import { ui } from '../store/state';
import { prefs } from '../store/prefs';
import { renderPlanSwitch } from './plan-switcher';
import { closeCtxMenu } from './menu';
import { openTemplates } from './templates-dialog';
import { importJson, loadSample, openExport } from './plan-io';

/* ---------- Language & theme (in Settings) ---------- */

export function renderLangSwitch() {
  document.querySelectorAll('.lang-switch').forEach(box => {
    box.innerHTML = Object.entries(I18N).map(([code, l]) =>
      `<button type="button" data-lang="${code}" lang="${code}" title="${esc(l.name)}" aria-pressed="${code === lang}">${code.toUpperCase()}</button>`).join('');
  });
}

export function changeLanguage(code) {
  if (code === lang) return;
  setLanguage(code);
  applyStaticI18n();
  renderLangSwitch();
  renderThemeSetting();
  applyNavCollapsed();
  renderSync();
  renderPlanSwitch();
  renderInstall();
  if (modal.open) modal.close();
  requestRender();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-lang]');
  if (b) changeLanguage(b.dataset.lang);
});

// 'system' follows the device; 'light' / 'dark' pin the theme.
export const THEMES = ['system', 'light', 'dark'];
export const THEME_ICONS = {
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="currentColor"/></svg>',
};
export let theme = 'system'; // the current user's, read by bootUser
export function setTheme(v) { theme = v; }

export function applyTheme() {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
  renderThemeSetting();
}
export const darkScheme = matchMedia('(prefers-color-scheme: dark)');
// The map writes its glass in the colours of the theme it was drawn in, so a change of theme redraws it;
// other views follow the CSS, and keep an open popup.
export const redrawForTheme = () => { if (ui.view === 'map') requestRender(); };
darkScheme.addEventListener('change', () => { if (theme === 'system') redrawForTheme(); });
export function renderThemeSetting() {
  $('#themeSeg').innerHTML = THEMES.map(k =>
    `<button type="button" data-theme-set="${k}" aria-pressed="${k === theme}">${THEME_ICONS[k]}<span>${t('theme.' + k)}</span></button>`).join('');
}
$('#themeSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-theme-set]');
  if (!b) return;
  theme = b.dataset.themeSet;
  prefs.set('theme', theme);
  applyTheme();
  redrawForTheme();
});

/* ---------- Settings (gear, top right): plan, language, theme, display options, data, help ---------- */

export const settings = $('#settings');

// Display options shown as switches: how to read each one and what changing it does.
export const SETTINGS = {
  help: { get: () => ui.help, set: v => setHelp(v) },
  hideDone: { get: () => ui.hideDone, set: v => setToggle('hideDone', v) },
  tlDeps: { get: () => ui.tlDeps, set: v => setToggle('tlDeps', v) },
  planBadges: { get: () => ui.planBadges, set: v => setToggle('planBadges', v) },
  navCollapsed: { get: () => ui.navCollapsed, set: v => setNavCollapsed(v) },
};

// A remembered on/off display option (hideDone, tlDeps, planBadges).
export function setToggle(key, on) {
  ui[key] = on;
  prefs.set(key, on);
  requestRender();
}

export function renderSettings() {
  settings.querySelectorAll('[data-setting]').forEach(box => (box.checked = SETTINGS[box.dataset.setting].get()));
  renderThemeSetting();
}

$('#settingsBtn').addEventListener('click', () => {
  closeCtxMenu();
  renderSettings();
  settings.showModal();
});
settings.addEventListener('click', e => {
  if (e.target === settings || e.target.closest('[data-settings-close]')) settings.close();
});
settings.addEventListener('change', e => {
  const key = e.target.dataset.setting;
  if (key) SETTINGS[key].set(e.target.checked);
});
$('#exportBtn').addEventListener('click', openExport);
$('#importInput').addEventListener('change', e => {
  if (e.target.files[0]) { importJson(e.target.files[0]); settings.close(); }
  e.target.value = '';
});
$('#sampleBtn').addEventListener('click', () => { settings.close(); loadSample(); });
$('#templatesBtn').addEventListener('click', openTemplates);

export function setHelp(on) {
  ui.help = on;
  prefs.set('help', on);
  $('#helpBtn').setAttribute('aria-pressed', on);
  requestRender();
}
