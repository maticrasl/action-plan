/** Measurements read from CSV rows: the columns, dates and numbers in them, and what importing them adds to a state. */
import { addEntry, entriesOf, isCumulative, recordMeasurements } from './cumulative';
import type { CsvRow } from './csv';
import type { ISODate, State } from './model';

export type DateOrder = 'dmy' | 'mdy' | 'ymd';
export type SkipReason = 'noDate' | 'badDate' | 'future' | 'noNumber';
export interface CsvValue {
  line: number;
  date: ISODate;
  value: number;
}
export interface CsvRead {
  header: boolean;
  columns: { date: number; value: number };
  order: DateOrder;
  slashed: boolean; // some dates are written with day and month, so the order can be chosen
  rows: CsvValue[];
  skipped: { line: number; reason: SkipReason; text?: string }[];
}
export const MAX_ROWS = 20000;

const pad = (n: string) => n.padStart(2, '0');
const realDay = (y: string, m: string, d: string): ISODate | null => {
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const t = new Date(iso + 'T00:00Z');
  return !isNaN(+t) && t.toISOString().slice(0, 10) === iso ? iso : null;
};
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/;
// Day and month in either order, a four-digit year last; a time after it is ignored.
const SLASHED = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\.?(?:\s.*)?$/;

export function readDate(text: string, order: DateOrder): ISODate | null {
  const s = text.trim();
  const iso = ISO.exec(s);
  if (iso) return realDay(iso[1], iso[2], iso[3]);
  const m = SLASHED.exec(s);
  if (!m) return null;
  return order === 'mdy' ? realDay(m[3], m[1], m[2]) : realDay(m[3], m[2], m[1]);
}

// Dot or comma as the decimal mark (the last one when both are there, so `1.234,5` and `1,234.5` read
// alike; one repeated is a thousands separator), spaces as thousands separators, and the state's unit
// after the number.
export function readNumber(text: string, unit = ''): number | null {
  let s = text.trim();
  const u = unit.trim().toLowerCase();
  if (u && s.toLowerCase().endsWith(u)) s = s.slice(0, -u.length);
  s = s.replace(/[\s\u00a0\u2009\u202f]/g, '');
  const dot = s.lastIndexOf('.'),
    comma = s.lastIndexOf(',');
  const mark = dot > comma ? '.' : ',';
  const other = mark === '.' ? ',' : '.';
  s = s.split(other).join('');
  if (s.split(mark).length > 2) s = s.split(mark).join('');
  s = s.replace(',', '.');
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : null;
}

// Header words, in English and Slovenian.
const WORDS = {
  date: /^(date|datum|day|dan)\b/iu,
  value: /^(value|amount|vrednost|znesek|koli[čc]ina)\b/iu,
};
const anyDate = (c = '') => !!(readDate(c, 'dmy') || readDate(c, 'mdy'));
const isNumber = (c = '') => readNumber(c) !== null;

// The first column where at least half the rows hold a date (or a number), skipping `not`.
function byContent(rows: CsvRow[], test: (c?: string) => boolean, not = -1): number {
  const width = Math.max(...rows.map(r => r.cells.length));
  for (let i = 0; i < width; i++)
    if (i !== not && rows.filter(r => test(r.cells[i])).length * 2 >= rows.length) return i;
  return -1;
}

// 'none' when no column of dates and one of numbers is found; 'tooMany' over MAX_ROWS rows.
export function readMeasurements(
  rows: CsvRow[],
  opts: { order?: DateOrder; unit?: string; today: ISODate },
): CsvRead | 'none' | 'tooMany' {
  if (!rows.length) return 'none';
  const first = rows[0].cells.map(c => c.trim());
  let date = first.findIndex(c => WORDS.date.test(c)),
    value = first.findIndex(c => WORDS.value.test(c));
  const named = date >= 0 || value >= 0;
  if (date < 0) date = byContent(rows, anyDate);
  if (date < 0) return 'none';
  if (value < 0 || value === date) value = byContent(rows, isNumber, date);
  if (value < 0) return 'none';
  const header = named || !isNumber(rows[0].cells[value]);
  const data = header ? rows.slice(1) : rows;
  if (data.length > MAX_ROWS) return 'tooMany';
  const cell = (r: CsvRow, i: number) => (r.cells[i] ?? '').trim();
  // Day first unless a second number over 12 says otherwise; a first number over 12 always means day first.
  let slashed = false,
    dayFirst = false,
    monthFirst = false;
  for (const r of data) {
    const m = SLASHED.exec(cell(r, date));
    if (!m) continue;
    slashed = true;
    if (+m[1] > 12) dayFirst = true;
    else if (+m[2] > 12) monthFirst = true;
  }
  const order: DateOrder = !slashed
    ? 'ymd'
    : opts.order && opts.order !== 'ymd'
      ? opts.order
      : !dayFirst && monthFirst
        ? 'mdy'
        : 'dmy';
  const read: CsvRead = { header, columns: { date, value }, order, slashed, rows: [], skipped: [] };
  for (const r of data) {
    const d = cell(r, date),
      v = cell(r, value);
    const iso = d ? readDate(d, order) : null;
    const n = readNumber(v, opts.unit);
    if (!d) read.skipped.push({ line: r.line, reason: 'noDate' });
    else if (!iso) read.skipped.push({ line: r.line, reason: 'badDate', text: d });
    else if (iso > opts.today) read.skipped.push({ line: r.line, reason: 'future' });
    else if (n === null) read.skipped.push({ line: r.line, reason: 'noNumber', text: v });
    else read.rows.push({ line: r.line, date: iso, value: n });
  }
  return read;
}

// What is new and what the state already has. Plain: one value a day, the file's last for a day,
// clashing with a day that has a value. Adding up: a row equal in date and amount to an amount there
// (each amount matched once) is already there, so a file imported twice adds nothing.
export function splitImport(s: State, rows: CsvValue[]): { fresh: CsvValue[]; clash: CsvValue[] } {
  const fresh: CsvValue[] = [],
    clash: CsvValue[] = [];
  if (isCumulative(s)) {
    const there = new Map<string, number>();
    entriesOf(s).forEach(e => {
      const k = `${e.date}|${Number(e.amount)}`;
      there.set(k, (there.get(k) || 0) + 1);
    });
    for (const r of rows) {
      const k = `${r.date}|${r.value}`,
        n = there.get(k) || 0;
      if (n) there.set(k, n - 1);
      (n ? clash : fresh).push(r);
    }
    return { fresh, clash };
  }
  const days = new Map(rows.map(r => [r.date, r]));
  const had = new Set((s.history || []).map(h => h.date));
  days.forEach(r => (had.has(r.date) ? clash : fresh).push(r));
  return { fresh, clash };
}

// Adds the rows as measurements (a day's value replaced, its remembered deletion cleared) or amounts.
export function applyImport(s: State, rows: CsvValue[]): void {
  if (isCumulative(s)) rows.forEach(r => addEntry(s, r.date, r.value));
  else
    recordMeasurements(
      s,
      rows.map(r => ({ date: r.date, value: String(r.value) })),
    );
}
