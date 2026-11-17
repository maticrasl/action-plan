/** Translations (English, Slovenian) and the t()/tp() lookups. */
import { en } from '../i18n/en';
import { sl } from '../i18n/sl';

/* =========================================================
   Translations
   ---------------------------------------------------------
   Plural entries are objects keyed by Intl.PluralRules category
   (one / two / few / other) and are read with tp().
   To add a language, copy the `en` block and translate it.
   ========================================================= */

export const I18N = {
  en,

  sl,
};

export const LANG_KEY = 'actionplan.lang';
// main.ts sets the language found by detectLang() before anything is drawn.
export let lang = 'en';
export let pluralRules = new Intl.PluralRules(I18N[lang].locale);
export function setLang(code) {
  lang = code;
  pluralRules = new Intl.PluralRules(I18N[code].locale);
}

export function detectLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (I18N[saved]) return saved;
  } catch (e) { /* ignore */ }
  const pref = (navigator.languages || [navigator.language || 'en']).map(l => l.slice(0, 2).toLowerCase());
  return pref.find(l => I18N[l]) || 'en';
}

export function setLanguage(code) {
  if (!I18N[code]) return;
  setLang(code);
  try { localStorage.setItem(LANG_KEY, code); } catch (e) { /* ignore */ }
}

export const locale = () => I18N[lang].locale;

export function lookup(key) {
  return I18N[lang].strings[key] ?? I18N.en.strings[key] ?? key;
}

export function fill(str, params) {
  return params ? str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m)) : str;
}

// t('key', {name: 'x'}) – simple string with {placeholders}
export function t(key, params) {
  return fill(lookup(key), params);
}

// tp('key', n, params) – plural-aware; {n} is filled automatically
export function tp(key, n, params = {}) {
  const forms = lookup(key);
  const str = typeof forms === 'string' ? forms : forms[pluralRules.select(n)] ?? forms.other;
  return fill(str, { n, ...params });
}

// Translates static markup: data-i18n (text), data-i18n-aria (aria-label), data-i18n-title (title).
export function applyStaticI18n(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach(el => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t(el.dataset.i18nAria)));
  root.querySelectorAll('[data-i18n-title]').forEach(el => (el.title = t(el.dataset.i18nTitle)));
}
