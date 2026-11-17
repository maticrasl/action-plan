/** The language in use and the t()/tp() lookups over the translations (en.ts, sl.ts). */
import { en } from './en';
import { sl } from './sl';

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

// main.ts sets the language found by detectLang() before anything is drawn.
export let lang = 'en';
export let pluralRules = new Intl.PluralRules(I18N[lang].locale);
export function setLang(code) {
  lang = code;
  pluralRules = new Intl.PluralRules(I18N[code].locale);
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
