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

// A plural entry: the forms by Intl.PluralRules category; `other` is the fallback.
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
// The sample plan a language offers (built into a plan by the sample loader).
export interface Sample {
  goals: {
    category: string;
    title: string;
    specific: string;
    metric?: string;
    unit?: string;
    achievable: string;
    relevant: string;
  }[];
  states: { title: string; description: string; unit?: string }[];
  activities: { title: string; description: string; list?: string[] }[];
}
// English sets the keys: every other language has exactly the same ones, plural where English is.
type EnStrings = typeof en.strings;
export type StringKey = keyof EnStrings;
export type TextKey = { [K in StringKey]: EnStrings[K] extends string ? K : never }[StringKey];
export type PluralKey = Exclude<StringKey, TextKey>;
export type Strings = { [K in StringKey]: EnStrings[K] extends string ? string : Plural };
export interface Language {
  name: string;
  locale: string;
  strings: Strings;
  sample: Sample;
}
// Values put into {placeholders}.
export type Params = Record<string, unknown>;

export const I18N = {
  en,

  sl,
} satisfies Record<string, Language>;
export type Lang = keyof typeof I18N;

// main.ts sets the language found by detectLang() before anything is drawn.
export let lang: Lang = 'en';
export let pluralRules = new Intl.PluralRules(I18N[lang].locale);
export function setLang(code: Lang): void {
  lang = code;
  pluralRules = new Intl.PluralRules(I18N[code].locale);
}

export const locale = (): string => I18N[lang].locale;

export function lookup(key: TextKey): string;
export function lookup(key: PluralKey): Plural;
export function lookup(key: StringKey): string | Plural;
export function lookup(key: StringKey): string | Plural {
  return I18N[lang].strings[key] ?? I18N.en.strings[key] ?? key;
}

export function fill(str: string, params?: Params): string {
  return params ? str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : str;
}

// t('key', {name: 'x'}) – simple string with {placeholders}
export function t(key: TextKey, params?: Params): string {
  return fill(lookup(key), params);
}

// tp('key', n, params) – plural-aware; {n} is filled automatically
export function tp(key: PluralKey, n: number, params: Params = {}): string {
  const forms = lookup(key);
  const str = typeof forms === 'string' ? forms : (forms[pluralRules.select(n)] ?? forms.other);
  return fill(str, { n, ...params });
}
