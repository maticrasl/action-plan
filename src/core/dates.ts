/** Calendar dates (yyyy-mm-dd): today, days between, typed dates, and dates shown in the app's language. */
import { formatter } from './util';
import { locale, t, type TextKey } from '../i18n/index';

// A date as stored: yyyy-mm-dd, or nothing.
export type DateStr = string | null | undefined;

// Local calendar date as YYYY-MM-DD.
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function today(): string {
  return isoDate(new Date());
}
// Tests replace today; callers see the replacement through the live binding.
export function setToday(f: () => string): void {
  // @ts-expect-error: the function declaration is reassigned on purpose
  today = f;
}
export function daysUntil(date: DateStr): number | null {
  if (!date) return null;
  return Math.round((+new Date(date + 'T00:00') - +new Date(today() + 'T00:00')) / 86400000);
}
export function fmtDate(date: DateStr): string {
  if (!date) return '';
  return formatter(Intl.DateTimeFormat, { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(date + 'T00:00'),
  );
}
// "today", "tomorrow" or "yesterday" for those days, else the date (`other` formats it); `cap` for one
// that stands alone, such as a tag or a table cell.
export function fmtRel(date: DateStr, cap = false, other: (date: DateStr) => string = fmtDate): string {
  const word =
    date && ({ '-1': 'yesterday', 0: 'today', 1: 'tomorrow' } as Partial<Record<number, string>>)[daysUntil(date)!];
  if (!word) return other(date);
  const s = t(('day.' + word) as TextKey);
  return cap ? s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1) : s;
}
// "3 Mar 2026 – tomorrow", or the one date there is.
export const fmtSpan = (s: DateStr, e: DateStr, cap = false): string =>
  s && e ? `${fmtRel(s, cap)} – ${fmtRel(e)}` : fmtRel(s || e, cap);
// A yyyy-mm-dd date in the app's language, read as a calendar day (no time zone shift).
export const fmtDay = (iso: string, opts?: Intl.DateTimeFormatOptions): string =>
  formatter(Intl.DateTimeFormat, { ...opts, timeZone: 'UTC' }).format(new Date(iso + 'T00:00Z'));
// Dates are typed as dd/mm/yyyy (also accepting dots, dashes or spaces, and yyyy-mm-dd) and stored as yyyy-mm-dd.
export function parseDateInput(s: string | null | undefined): string | null {
  s = String(s ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/),
    d,
    mo,
    y;
  if (m) [, y, mo, d] = m.map(Number);
  else if ((m = s.match(/^(\d{1,2})[/.\-\s]+(\d{1,2})[/.\-\s]+(\d{4})$/))) [, d, mo, y] = m.map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
export const dateInput = (iso: DateStr): string => (iso ? iso.split('-').reverse().join('/') : '');
