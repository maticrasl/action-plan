import { expect, test } from 'vitest';
import { parseCsv, planCsv, stateCsv } from './csv';
import type { State } from './model';

const cells = (text: string) => parseCsv(text).map(r => r.cells);
const state = (p: Partial<State>): State => ({
  id: 's',
  title: 'Weight',
  description: '',
  value: '',
  history: [],
  ...p,
});

test('parseCsv: comma, semicolon and tab, chosen by the most lines with the same columns', () => {
  expect(cells('date,value\n2025-01-02,82.4\n')).toEqual([
    ['date', 'value'],
    ['2025-01-02', '82.4'],
  ]);
  expect(cells('datum;vrednost\n2.1.2025;82,4\n9.1.2025;82,1')).toEqual([
    ['datum', 'vrednost'],
    ['2.1.2025', '82,4'],
    ['9.1.2025', '82,1'],
  ]);
  expect(cells('2.1.2025\t82,4\n9.1.2025\t82,1')).toEqual([
    ['2.1.2025', '82,4'],
    ['9.1.2025', '82,1'],
  ]);
  // Semicolons and decimal commas without a header: both give two columns, the semicolon wins.
  expect(cells('2.1.2025;82,4\n9.1.2025;82,1')[0]).toEqual(['2.1.2025', '82,4']);
});

test('parseCsv: quoted fields with separators, doubled quotes and line breaks; line numbers', () => {
  const rows = parseCsv(
    'date,value,note\r\n2025-01-02,82.4,"a, b"\r\n2025-01-03,82,"say ""hi""\r\nthere"\r\n2025-01-04,81,x',
  );
  expect(rows.map(r => r.cells[2])).toEqual(['note', 'a, b', 'say "hi"\r\nthere', 'x']);
  expect(rows.map(r => r.line)).toEqual([1, 2, 3, 5]);
});

test('parseCsv: byte-order mark, LF, CR, empty lines and a trailing empty line', () => {
  const rows = parseCsv('\ufeffdate,value\n\n2025-01-02,82\n ,\n\r2025-01-03,81\n\n');
  expect(rows.map(r => r.cells)).toEqual([
    ['date', 'value'],
    ['2025-01-02', '82'],
    ['2025-01-03', '81'],
  ]);
  expect(rows.map(r => r.line)).toEqual([1, 3, 6]);
  expect(parseCsv('')).toEqual([]);
  expect(parseCsv('\ufeff\n\n')).toEqual([]);
});

test('parseCsv: one column only stays one column', () => {
  expect(cells('82\n83\n84')).toEqual([['82'], ['83'], ['84']]);
});

test('stateCsv: byte-order mark, CRLF, header by kind, dates by order, numbers with a dot', () => {
  const plain = state({
    history: [
      { date: '2025-01-09', value: '82.1' },
      { date: '2025-01-02', value: '82.4' },
    ],
  });
  expect(stateCsv(plain)).toBe('\ufeffdate,value,note\r\n2025-01-02,82.4,\r\n2025-01-09,82.1,\r\n');
  const adds = state({
    cumulative: true,
    entries: [
      { id: 'b', date: '2025-01-03', amount: '2' },
      { id: 'a', date: '2025-01-02', amount: '-1.5' },
      { id: 'c', date: '2025-01-02', amount: 'x' },
    ],
  });
  expect(stateCsv(adds)).toBe('\ufeffdate,amount,note\r\n2025-01-02,-1.5,\r\n2025-01-03,2,\r\n');
  expect(stateCsv(state({}))).toBe('\ufeffdate,value,note\r\n');
});

test('planCsv: every state, by state then date; text quoted and kept from running as a formula', () => {
  const a = state({ id: 'a', title: 'Weight, morning', unit: 'kg', history: [{ date: '2025-01-02', value: '82' }] });
  const b = state({
    id: 'b',
    title: '=SUM(A1)',
    unit: '@x',
    cumulative: true,
    entries: [
      { id: '2', date: '2025-01-05', amount: '3' },
      { id: '1', date: '2025-01-04', amount: '-2' },
    ],
  });
  const c = state({ id: 'c', title: 'Say "hi"', unit: '+1', history: [{ date: '2025-01-01', value: '-4' }] });
  const d = state({ id: 'd', title: '-minus', unit: '' });
  expect(planCsv([a, b, c, d]).split('\r\n')).toEqual([
    '\ufeffstate,unit,date,value,note',
    '"Weight, morning",kg,2025-01-02,82,',
    `'=SUM(A1),'@x,2025-01-04,-2,`,
    `'=SUM(A1),'@x,2025-01-05,3,`,
    `"Say ""hi""",'+1,2025-01-01,-4,`,
    '',
  ]);
});
