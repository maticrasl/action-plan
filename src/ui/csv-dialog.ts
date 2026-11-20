/** A state's measurements as CSV: Export as CSV, and Import from CSV… with its preview, read in the page. */
import { db } from '../core/state';
import { stateCsv, parseCsv, type CsvRow } from '../core/csv';
import {
  applyImport,
  readMeasurements,
  splitImport,
  type CsvRead,
  type CsvValue,
  type DateOrder,
} from '../core/csv-read';
import { isCumulative } from '../core/cumulative';
import { fmtDate, today } from '../core/dates';
import { fmtNum } from '../core/util';
import { t, tp, type TextKey } from '../i18n/index';
import { save } from '../store/plans';
import { $, esc } from './dom';
import { download, fileName } from './plan-io';
import { requestRender } from './render';
import { withUnit } from './text';
import { undoable } from './undo';

const dlg = $<HTMLDialogElement>('#csvImport');
const SHOWN = 3, // rows shown in the preview
  REASONS = 5; // skipped lines listed

// What the preview shows is what Import adds: the rows of one file, read once per date order.
let open: { id: string; rows: CsvRow[]; read: CsvRead | null; fresh: CsvValue[]; clash: CsvValue[] } | null = null;
const target = () => db.states.find(s => s.id === open?.id);

export function exportStateCsv(id: string) {
  const s = db.states.find(x => x.id === id);
  if (s) download(new Blob([stateCsv(s)], { type: 'text/csv' }), fileName(s.title, 'csv'));
}

export function openCsvImport(id: string) {
  const s = db.states.find(x => x.id === id);
  if (!s) return;
  open = { id, rows: [], read: null, fresh: [], clash: [] };
  $('#csvTitle').textContent = t('csv.title', { name: s.title });
  $<HTMLInputElement>('#csvInput').value = '';
  $<HTMLTextAreaElement>('#csvPaste').value = '';
  $('#csvPreview').innerHTML = '';
  counts();
  dlg.showModal();
}

// A file is read in the page; nothing leaves the device.
export async function readCsvFile(file: File) {
  $<HTMLTextAreaElement>('#csvPaste').value = '';
  readText(await file.text().catch(() => ''));
}

function readText(text: string) {
  if (!open) return;
  open.rows = parseCsv(text);
  readRows();
}

function readRows(order?: DateOrder) {
  const s = target();
  if (!open || !s) return;
  const res = open.rows.length ? readMeasurements(open.rows, { order, unit: s.unit, today: today() }) : null;
  open.read = res && typeof res === 'object' ? res : null;
  const box = $('#csvPreview');
  if (!res) box.innerHTML = '';
  else if (res === 'tooMany') box.innerHTML = `<p class="err">${esc(t('csv.tooMany'))}</p>`;
  else if (res === 'none' || (!res.rows.length && !res.skipped.length))
    box.innerHTML = `<p class="err">${esc(t('csv.none'))}</p>`;
  else box.innerHTML = preview(res, s.unit || '');
  counts();
}

function preview(r: CsvRead, unit: string) {
  const n = r.rows.length + r.skipped.length;
  const how = t('csv.how', {
    d: r.columns.date + 1,
    order: t(`csv.order.${r.order}` as TextKey),
    v: r.columns.value + 1,
  });
  const rows = r.rows
    .slice(0, SHOWN)
    .map(x => `<tr><td>${esc(fmtDate(x.date))}</td><td>${esc(withUnit(fmtNum(x.value), unit))}</td></tr>`)
    .join('');
  const more = r.rows.length > SHOWN ? `<p class="hint">${esc(t('csv.more', { n: r.rows.length - SHOWN }))}</p>` : '';
  const reason = (x: CsvRead['skipped'][number]) =>
    t('csv.line', { n: x.line, reason: t(`csv.reason.${x.reason}` as TextKey, { text: x.text ?? '' }) });
  const skipped = r.skipped.length
    ? `<ul class="csv-skipped">${r.skipped
        .slice(0, REASONS)
        .map(x => `<li>${esc(reason(x))}</li>`)
        .join(
          '',
        )}${r.skipped.length > REASONS ? `<li>${esc(t('csv.more', { n: r.skipped.length - REASONS }))}</li>` : ''}</ul>`
    : '';
  const order = r.slashed
    ? `<div class="field csv-order"><label for="csvOrder">${esc(t('csv.orderLabel'))}</label>
        <select id="csvOrder">${(['dmy', 'mdy'] as const)
          .map(o => `<option value="${o}"${o === r.order ? ' selected' : ''}>${esc(t(`csv.order.${o}`))}</option>`)
          .join('')}</select></div>`
    : '';
  return `<p>${esc(tp('csv.read', n, { how }))}</p>
    <div class="csv-rows"><table>${rows}</table></div>${more}
    <p class="csv-summary" id="csvSummary"></p>${skipped}
    <fieldset class="csv-choice" id="csvChoice" hidden><legend id="csvChoiceLabel"></legend>
      <label><input type="radio" name="csvTake" value="" checked> <span id="csvKeep"></span></label>
      <label><input type="radio" name="csvTake" value="1"> <span id="csvTake"></span></label></fieldset>
    ${order}`;
}

const take = () => !!dlg.querySelector<HTMLInputElement>('input[name="csvTake"]:checked')?.value;

// The counts, the choice for rows that clash and the button, from the rows read and the state now.
function counts() {
  const s = target(),
    r = open?.read;
  const btn = $<HTMLButtonElement>('#csvDoBtn');
  if (!open || !s || !r) {
    btn.textContent = tp('csv.do', 0);
    btn.disabled = true;
    return;
  }
  Object.assign(open, splitImport(s, r.rows));
  const adds = isCumulative(s);
  $('#csvSummary').textContent = t(adds ? 'csv.summaryAdds' : 'csv.summary', {
    new: open.fresh.length,
    clash: open.clash.length,
    skipped: r.skipped.length,
  });
  $('#csvChoice').hidden = !open.clash.length;
  $('#csvChoiceLabel').textContent = t(adds ? 'csv.dupes' : 'csv.clash');
  $('#csvKeep').textContent = t(adds ? 'csv.skip' : 'csv.mine');
  $('#csvTake').textContent = t(adds ? 'csv.again' : 'csv.theirs');
  const n = open.fresh.length + (take() ? open.clash.length : 0);
  btn.textContent = tp('csv.do', n);
  btn.disabled = !n;
}

function importRows() {
  const s = target();
  if (!open || !s) return;
  const rows = take() ? [...open.fresh, ...open.clash] : open.fresh;
  if (!rows.length) return;
  dlg.close();
  undoable(() => {
    applyImport(s, rows);
    save();
    requestRender();
    return tp('csv.done', rows.length);
  });
}

export function listenCsv() {
  $<HTMLInputElement>('#csvInput').addEventListener('change', e => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) readCsvFile(file);
  });
  $('#csvPaste').addEventListener('input', e => readText((e.target as HTMLTextAreaElement).value));
  dlg.addEventListener('change', e => {
    const el = e.target as HTMLElement;
    if (el.id === 'csvOrder') readRows((el as HTMLSelectElement).value as DateOrder);
    else if ((el as HTMLInputElement).name === 'csvTake') counts();
  });
  $('#csvForm').addEventListener('submit', e => {
    e.preventDefault();
    importRows();
  });
  dlg.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    if (el === dlg || el.closest('[data-csv-close]')) dlg.close();
  });
  // The close event comes later: by then the dialog may be open again for another state.
  dlg.addEventListener('close', () => {
    if (!dlg.open) open = null;
  });
  // The buttons in the state form.
  document.addEventListener('click', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-csv-import],[data-csv-export]');
    if (!el) return;
    if (el.dataset.csvImport) openCsvImport(el.dataset.csvImport);
    else exportStateCsv(el.dataset.csvExport!);
  });
}
