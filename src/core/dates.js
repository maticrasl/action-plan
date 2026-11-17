/** Calendar dates (yyyy-mm-dd): today, days between, typed dates, and dates shown in the app's language. */
import { formatter } from './util';
import { locale, t } from '../i18n/index';

// Local calendar date as YYYY-MM-DD.
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function today() {
  return isoDate(new Date());
}
// Tests replace today; callers see the replacement through the live binding.
// eslint-disable-next-line no-func-assign
export function setToday(f) { today = f; }
export function daysUntil(date) {
  if (!date) return null;
  return Math.round((new Date(date + 'T00:00') - new Date(today() + 'T00:00')) / 86400000);
}
export function fmtDate(date) {
  if (!date) return '';
  return formatter(Intl.DateTimeFormat, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date + 'T00:00'));
}
// "today", "tomorrow" or "yesterday" for those days, else the date (`other` formats it); `cap` for one
// that stands alone, such as a tag or a table cell.
export function fmtRel(date, cap = false, other = fmtDate) {
  const word = date && { '-1': 'yesterday', 0: 'today', 1: 'tomorrow' }[daysUntil(date)];
  if (!word) return other(date);
  const s = t('day.' + word);
  return cap ? s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1) : s;
}
// "3 Mar 2026 – tomorrow", or the one date there is.
export const fmtSpan = (s, e, cap = false) => (s && e ? `${fmtRel(s, cap)} – ${fmtRel(e)}` : fmtRel(s || e, cap));
// A yyyy-mm-dd date in the app's language, read as a calendar day (no time zone shift).
export const fmtDay = (iso, opts) => formatter(Intl.DateTimeFormat, { ...opts, timeZone: 'UTC' }).format(new Date(iso + 'T00:00Z'));
// Dates are typed as dd/mm/yyyy (also accepting dots, dashes or spaces, and yyyy-mm-dd) and stored as yyyy-mm-dd.
export function parseDateInput(s) {
  s = String(s ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/), d, mo, y;
  if (m) [, y, mo, d] = m.map(Number);
  else if ((m = s.match(/^(\d{1,2})[/.\-\s]+(\d{1,2})[/.\-\s]+(\d{4})$/))) [, d, mo, y] = m.map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
export const dateInput = iso => (iso ? iso.split('-').reverse().join('/') : '');
