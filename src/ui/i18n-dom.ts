/** The language on the page: detected from storage and the browser, saved, and applied to static markup. */
import { I18N, lang, setLang, t, type Lang, type TextKey } from '../i18n/index';

export const LANG_KEY = 'actionplan.lang';

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (I18N[saved as Lang]) return saved as Lang;
  } catch (e) {
    /* ignore */
  }
  const pref = (navigator.languages || [navigator.language || 'en']).map(l => l.slice(0, 2).toLowerCase());
  return (pref.find(l => I18N[l as Lang]) || 'en') as Lang;
}

export function setLanguage(code: string): void {
  if (!I18N[code as Lang]) return;
  setLang(code as Lang);
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch (e) {
    /* ignore */
  }
}

// Translates static markup: data-i18n (text), data-i18n-aria (aria-label), data-i18n-title (title).
export function applyStaticI18n(root: ParentNode = document): void {
  document.documentElement.lang = lang;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => (el.textContent = t(el.dataset.i18n as TextKey)));
  root
    .querySelectorAll<HTMLElement>('[data-i18n-aria]')
    .forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria as TextKey)));
  root
    .querySelectorAll<HTMLElement>('[data-i18n-title]')
    .forEach(el => (el.title = t(el.dataset.i18nTitle as TextKey)));
}
