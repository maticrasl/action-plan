/** CSV text: reading it into rows of cells, and writing a state's or a plan's measurements for a spreadsheet. */
import { entriesOf, isCumulative } from './cumulative';
import type { State } from './model';
import { isNum } from './util';

// A row and the line of the file it starts on (counting from 1, a header included).
export interface CsvRow {
  line: number;
  cells: string[];
}

// Quotes start a field only at its start; inside them, a doubled quote is one quote and line breaks
// belong to the field. CRLF, LF and a lone CR end a line. Rows with only blank cells are left out.
function split(text: string, sep: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let cells: string[] = [],
    cell = '',
    quoted = false,
    line = 1,
    start = 1;
  const endRow = () => {
    cells.push(cell);
    if (cells.some(c => c.trim())) rows.push({ line: start, cells });
    cells = [];
    cell = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else {
        if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++;
        cell += c;
      }
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === sep) {
      cells.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') continue;
    else if (c === '\n' || c === '\r') {
      endRow();
      start = ++line;
    } else cell += c;
  }
  endRow();
  return rows;
}

// The separator is the one of tab, semicolon and comma that gives the same number of columns (two or
// more) on the most of the first 20 rows; on a tie the earlier one, as `82,4` holds a comma but rarely a
// semicolon. With none, the rows split at commas (one column: nothing to import).
export function parseCsv(text: string): CsvRow[] {
  const body = text.replace(/^\ufeff/, '');
  let best: CsvRow[] | null = null,
    bestScore = 0;
  for (const sep of ['\t', ';', ',']) {
    const rows = split(body, sep);
    const counts: Record<number, number> = {};
    for (const r of rows.slice(0, 20))
      if (r.cells.length > 1) counts[r.cells.length] = (counts[r.cells.length] || 0) + 1;
    const score = Math.max(0, ...Object.values(counts));
    if (score > bestScore) {
      best = rows;
      bestScore = score;
    }
  }
  return best || split(body, ',');
}

/* ---------- Writing ---------- */

// Text that starts like a formula gets an apostrophe, so a spreadsheet shows it instead of running it;
// numbers are written as they are.
const cell = (v: string | number) => {
  if (typeof v === 'number') return String(v);
  const s = /^[=+\-@]/.test(v) ? "'" + v : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// UTF-8 with a byte-order mark (spreadsheets then read the letters right), CRLF after every line.
const csvText = (rows: (string | number)[][]) => '\ufeff' + rows.map(r => r.map(cell).join(',') + '\r\n').join('');

// Each measurement (or amount) by date, numbers with a dot. The note column is there for notes to come.
function measured(s: State): [string, number, string][] {
  const list = isCumulative(s)
    ? entriesOf(s).map(e => ({ date: e.date, n: e.amount }))
    : (s.history || []).filter(h => h.date && isNum(h.value)).map(h => ({ date: h.date, n: h.value }));
  return list.sort((a, b) => a.date.localeCompare(b.date)).map(m => [m.date, Number(m.n), '']);
}

export const stateCsv = (s: State): string =>
  csvText([['date', isCumulative(s) ? 'amount' : 'value', 'note'], ...measured(s)]);

export const planCsv = (states: State[]): string =>
  csvText([
    ['state', 'unit', 'date', 'value', 'note'],
    ...states.flatMap(s => measured(s).map(m => [s.title, s.unit || '', ...m])),
  ]);
