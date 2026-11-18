/** Small pure helpers: ids, numbers typed in either language, and cached Intl formatters. */
import { locale } from '../i18n/index';

// Web Crypto, in browsers and in Node; src/core is compiled without the page's types.
declare const crypto: { randomUUID?: () => string };

export const uid = (): string =>
  crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const isNum = (v: unknown): boolean => v !== '' && v !== null && v !== undefined && !isNaN(Number(v));

// A date or number formatter for the app's language. Making one is slow (toLocaleString makes one on
// every call), and a long table formats thousands of values, so each is made once and kept.
export const formatters = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
export function formatter(Kind: typeof Intl.DateTimeFormat, opts?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat;
export function formatter(Kind: typeof Intl.NumberFormat, opts?: Intl.NumberFormatOptions): Intl.NumberFormat;
export function formatter(
  Kind: new (locale: string, opts?: object) => Intl.DateTimeFormat | Intl.NumberFormat,
  opts?: object,
) {
  const key = `${Kind.name} ${locale()} ${JSON.stringify(opts)}`;
  if (!formatters.has(key)) formatters.set(key, new Kind(locale(), opts));
  return formatters.get(key);
}

export function fmtNum(n: number | string): string {
  return formatter(Intl.NumberFormat, { maximumFractionDigits: 2 }).format(Number(n));
}
// A number typed with a decimal dot or comma ("78.5", "78,5", "1 234,5", "1,234.5"); NaN if it isn't one.
export function parseNum(s: unknown): number {
  let v = String(s ?? '')
    .trim()
    .replace(/[\s  ']/g, '')
    .replace(/^−/, '-');
  const dot = v.lastIndexOf('.'),
    comma = v.lastIndexOf(',');
  // With both, the last one is the decimal separator and the other groups thousands.
  if (dot >= 0 && comma >= 0) v = dot > comma ? v.replace(/,/g, '') : v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v) ? Number(v) : NaN;
}
// A stored number ("78.5") as typed in the current language ("78,5" in Slovenian).
export const numInput = (v: string | number | null | undefined): string | number =>
  isNum(v) ? String(v).replace('.', (1.5).toLocaleString(locale()).charAt(1)) : (v ?? '');

// A list's items on its card, each ticked off with a tap, under how many are done.
// Ticked items go below the ones still to do, each group in the list's own order.
export const doneLast = <T extends { done?: boolean }>(list: T[], done: (i: T) => unknown = i => i.done) => [
  ...list.filter(i => !done(i)),
  ...list.filter(done),
];
