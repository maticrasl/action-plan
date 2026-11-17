/** Small pure helpers: ids, numbers typed in either language, and cached Intl formatters. */
import { locale } from '../i18n/index';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const isNum = v => v !== '' && v !== null && v !== undefined && !isNaN(Number(v));

// A date or number formatter for the app's language. Making one is slow (toLocaleString makes one on
// every call), and a long table formats thousands of values, so each is made once and kept.
export const formatters = new Map();
export function formatter(Kind, opts) {
  const key = `${Kind.name} ${locale()} ${JSON.stringify(opts)}`;
  if (!formatters.has(key)) formatters.set(key, new Kind(locale(), opts));
  return formatters.get(key);
}

export function fmtNum(n) {
  return formatter(Intl.NumberFormat, { maximumFractionDigits: 2 }).format(Number(n));
}
// A number typed with a decimal dot or comma ("78.5", "78,5", "1 234,5", "1,234.5"); NaN if it isn't one.
export function parseNum(s) {
  let v = String(s ?? '').trim().replace(/[\s  ']/g, '').replace(/^−/, '-');
  const dot = v.lastIndexOf('.'), comma = v.lastIndexOf(',');
  // With both, the last one is the decimal separator and the other groups thousands.
  if (dot >= 0 && comma >= 0) v = dot > comma ? v.replace(/,/g, '') : v.replace(/\./g, '').replace(',', '.');
  else v = v.replace(',', '.');
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v) ? Number(v) : NaN;
}
// A stored number ("78.5") as typed in the current language ("78,5" in Slovenian).
export const numInput = v => (isNum(v) ? String(v).replace('.', (1.5).toLocaleString(locale()).charAt(1)) : v ?? '');
