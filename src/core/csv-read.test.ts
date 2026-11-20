import { expect, test } from 'vitest';
import { parseCsv, stateCsv } from './csv';
import { applyImport, readDate, readMeasurements, readNumber, splitImport, type CsvRead } from './csv-read';
import { emptyDb, type State } from './model';
import { setDb } from './state';

const TODAY = '2026-11-18';
setDb(emptyDb());
const read = (text: string, opts: { order?: 'dmy' | 'mdy'; unit?: string } = {}) =>
  readMeasurements(parseCsv(text), { today: TODAY, ...opts }) as CsvRead;
const state = (p: Partial<State> = {}): State => ({
  id: 's',
  title: 'W',
  description: '',
  value: '',
  history: [],
  ...p,
});

test('readDate: ISO, day or month first, a time after it, real days only', () => {
  expect(readDate('2025-01-02', 'dmy')).toBe('2025-01-02');
  expect(readDate('2025-1-2T08:30', 'dmy')).toBe('2025-01-02');
  expect(readDate('05/06/2025', 'dmy')).toBe('2025-06-05');
  expect(readDate('05/06/2025', 'mdy')).toBe('2025-05-06');
  expect(readDate('5. 6. 2025', 'dmy')).toBe('2025-06-05');
  expect(readDate('5.6.2025.', 'dmy')).toBe('2025-06-05');
  expect(readDate('5-6-2025 12:00', 'dmy')).toBe('2025-06-05');
  expect(readDate('29/02/2024', 'dmy')).toBe('2024-02-29');
  expect(readDate('29/02/2025', 'dmy')).toBeNull();
  expect(readDate('31/12/25', 'dmy')).toBeNull();
  expect(readDate('13/13/2025', 'dmy')).toBeNull();
  expect(readDate('yesterday', 'dmy')).toBeNull();
  expect(readDate('2025-01-02x', 'dmy')).toBeNull();
});

test('readNumber: dot or comma, thousands separators, the unit, not a number', () => {
  expect(readNumber('82.4')).toBe(82.4);
  expect(readNumber('82,4')).toBe(82.4);
  expect(readNumber('1 234,5')).toBe(1234.5);
  expect(readNumber('1\u202f234,5')).toBe(1234.5);
  expect(readNumber('1.234,5')).toBe(1234.5);
  expect(readNumber('1,234.5')).toBe(1234.5);
  expect(readNumber('1.234.567')).toBe(1234567);
  expect(readNumber('-3')).toBe(-3);
  expect(readNumber(' 82.4 kg ', 'kg')).toBe(82.4);
  expect(readNumber('82.4KG', 'kg')).toBe(82.4);
  expect(readNumber('82.4 lb', 'kg')).toBeNull();
  expect(readNumber('82.4 kg')).toBeNull();
  expect(readNumber('n/a')).toBeNull();
  expect(readNumber('')).toBeNull();
  expect(readNumber('1e5')).toBeNull();
});

test('header in English or Slovenian picks the columns; the date order is worked out', () => {
  const en = read('note,Date,Value (kg)\nok,2025-01-02,82.4\n,2025-01-03,82');
  expect([en.header, en.columns, en.order]).toEqual([true, { date: 1, value: 2 }, 'ymd']);
  expect(en.rows).toEqual([
    { line: 2, date: '2025-01-02', value: 82.4 },
    { line: 3, date: '2025-01-03', value: 82 },
  ]);
  const sl = read('Opomba;Količina;Datum\n;3;31.12.2025\n;2;1.1.2025', { order: undefined });
  expect([sl.header, sl.columns, sl.order]).toEqual([true, { date: 2, value: 1 }, 'dmy']);
  expect(sl.rows.map(r => r.date)).toEqual(['2025-12-31', '2025-01-01']);
});

test('without a header, columns by content; a first row with no number is a header', () => {
  const r = read('x,2025-01-02,82.4\ny,2025-01-03,82');
  expect([r.header, r.columns, r.rows.length]).toEqual([false, { date: 1, value: 2 }, 2]);
  const h = read('when,how much\n2025-01-02,82.4');
  expect([h.header, h.columns, h.rows.length]).toEqual([true, { date: 0, value: 1 }, 1]);
});

test('date order: over 12 first forces day first, over 12 second forces month first, else day first and as chosen', () => {
  expect(read('31/12/2025,1\n05/06/2025,2').order).toBe('dmy');
  const m = read('12/31/2025,1\n05/06/2025,2');
  expect([m.order, m.rows[1].date]).toEqual(['mdy', '2025-05-06']);
  const d = read('05/06/2025,1');
  expect([d.order, d.slashed, d.rows[0].date]).toEqual(['dmy', true, '2025-06-05']);
  const chosen = read('05/06/2025,1', { order: 'mdy' });
  expect([chosen.order, chosen.rows[0].date]).toEqual(['mdy', '2025-05-06']);
  expect(read('2025-01-02,1').slashed).toBe(false);
});

test('skipped rows, with their line and reason', () => {
  const r = read(
    'date,value\n2025-01-02,82\n,80\n31/12/25,81\n2027-01-01,79\n2025-01-03,n/a\n2025-01-04,\n2025-01-05,82.4 lb',
    {
      unit: 'kg',
    },
  );
  expect(r.rows.map(x => x.line)).toEqual([2]);
  expect(r.skipped).toEqual([
    { line: 3, reason: 'noDate' },
    { line: 4, reason: 'badDate', text: '31/12/25' },
    { line: 5, reason: 'future' },
    { line: 6, reason: 'noNumber', text: 'n/a' },
    { line: 7, reason: 'noNumber', text: '' },
    { line: 8, reason: 'noNumber', text: '82.4 lb' },
  ]);
});

test('nothing to import: empty, one column, a plan file; more than 20,000 rows refused', () => {
  expect(readMeasurements(parseCsv(''), { today: TODAY })).toBe('none');
  expect(readMeasurements(parseCsv('82\n83'), { today: TODAY })).toBe('none');
  expect(readMeasurements(parseCsv('{\n  "format": "action-plan",\n  "goals": []\n}'), { today: TODAY })).toBe('none');
  const rows = (n: number) => 'date,value\n' + Array.from({ length: n }, () => '2025-01-02,1').join('\n');
  expect(readMeasurements(parseCsv(rows(20001)), { today: TODAY })).toBe('tooMany');
  expect((readMeasurements(parseCsv(rows(20000)), { today: TODAY }) as CsvRead).rows.length).toBe(20000);
});

test('plain state: the later row for a day wins; keep mine or take the file’s', () => {
  const s = state({ history: [{ date: '2025-01-03', value: '90' }], dropped: { '2025-01-04': 1 } });
  const r = read('2025-01-02,82\n2025-01-03,81\n2025-01-02,83\n2025-01-04,80');
  const { fresh, clash } = splitImport(s, r.rows);
  expect(fresh.map(x => [x.date, x.value])).toEqual([
    ['2025-01-02', 83],
    ['2025-01-04', 80],
  ]);
  expect(clash.map(x => x.date)).toEqual(['2025-01-03']);
  const mine = structuredClone(s);
  applyImport(mine, fresh);
  expect(mine.history).toEqual([
    { date: '2025-01-02', value: '83' },
    { date: '2025-01-03', value: '90' },
    { date: '2025-01-04', value: '80' },
  ]);
  expect(mine.dropped).toBeUndefined(); // the deleted day comes back
  expect([mine.value, mine.date]).toEqual(['80', '2025-01-04']);
  applyImport(s, [...fresh, ...clash]);
  expect(s.history.find(h => h.date === '2025-01-03')!.value).toBe('81');
});

test('adds up: identical rows are already there on a second import; add again adds them', () => {
  const s = state({ cumulative: true, entries: [] });
  const r = read('2025-01-02,2\n2025-01-02,2\n2025-01-03,1,5');
  const first = splitImport(s, r.rows);
  expect([first.fresh.length, first.clash.length]).toEqual([3, 0]);
  applyImport(s, first.fresh);
  expect(s.entries!.map(e => [e.date, e.amount])).toEqual([
    ['2025-01-02', '2'],
    ['2025-01-02', '2'],
    ['2025-01-03', '1'],
  ]);
  expect(s.value).toBe('5');
  const again = splitImport(s, read('2025-01-02,2\n2025-01-02,2.0\n2025-01-02,2\n2025-01-03,1').rows);
  expect([again.fresh.length, again.clash.length]).toEqual([1, 3]);
  applyImport(s, [...again.fresh, ...again.clash]);
  expect(s.entries!.length).toBe(7);
});

test('round trip: export, then import into an empty state, gives the same measurements', () => {
  const plain = state({
    unit: 'kg',
    history: [
      { date: '2024-02-29', value: '82.4' },
      { date: '2025-01-09', value: '-0.5' },
    ],
  });
  const back = state();
  applyImport(back, splitImport(back, read(stateCsv(plain)).rows).fresh);
  expect(back.history).toEqual(plain.history);
  const adds = state({ cumulative: true, entries: [{ id: 'a', date: '2025-01-02', amount: '1.25' }] });
  const into = state({ cumulative: true });
  applyImport(into, splitImport(into, read(stateCsv(adds)).rows).fresh);
  expect(into.entries!.map(e => [e.date, e.amount])).toEqual([['2025-01-02', '1.25']]);
});
