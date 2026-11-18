/** The calendar under a date field: by mouse and keys, weeks starting on Monday. */
import { dateInput, fmtDay, parseDateInput, today } from '../core/dates';
import { $, esc } from './dom';
import { t } from '../i18n/index';
import { weekday } from '../core/routines/schedule';
import { isoOf } from '../core/days';
import type { ISODate } from '../core/model';
import { weekdayName } from './text';

/* ---------- Calendar for date fields ----------
   Opens below the field on the field's date, else (for an end date) on the form's start date, else today. */

// The open calendar: its date field, the text box, the month shown (m from 0) and the focused day.
export interface Cal {
  field: HTMLElement;
  box: HTMLInputElement;
  y: number;
  m: number;
  focus: ISODate;
}
export let cal: Cal | null = null;
export function setCal(v: Cal | null) {
  cal = v;
}

export function openCalendar(field: HTMLElement) {
  closeCalendar();
  const box = field.querySelector<HTMLInputElement>('[data-date]')!;
  const start = box.id === 'f-startDate' ? null : parseDateInput($<HTMLInputElement>('#f-startDate')?.value);
  const focus = parseDateInput(box.value) || start || today();
  const [y, m] = focus.split('-').map(Number);
  cal = { field, box, y, m: m - 1, focus };
  field.insertAdjacentHTML('beforeend', `<div class="cal" role="dialog" aria-label="${esc(t('f.pickDate'))}"></div>`);
  field.querySelector('[data-cal-open]')!.setAttribute('aria-expanded', 'true');
  drawCalendar();
  // Keep the calendar inside the form: open it to the left when the field is near the right edge.
  const el = field.querySelector('.cal')!,
    form = $('#modalForm').getBoundingClientRect();
  if (el.getBoundingClientRect().right > form.right - 8) el.classList.add('right');
  focusDay();
  el.scrollIntoView({ block: 'nearest' });
}

export function drawCalendar() {
  const { y, m, box } = cal!;
  const lead = weekday(isoOf(y, m, 1)); // Monday first
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const chosen = parseDateInput(box.value),
    now = today();
  const weekdays = Array.from(
    { length: 7 },
    (_, i) => `<span class="cal-wd" aria-hidden="true">${esc(weekdayName(i))}</span>`,
  ).join('');
  const cells = Array.from({ length: days }, (_, i) => {
    const iso = isoOf(y, m, i + 1);
    return `<button type="button" data-cal-day="${iso}" class="${iso === now ? 'today' : ''}" aria-pressed="${iso === chosen}" tabindex="${iso === cal!.focus ? 0 : -1}" aria-label="${esc(fmtDay(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}">${i + 1}</button>`;
  }).join('');
  cal!.field.querySelector('.cal')!.innerHTML = `
    <div class="cal-head">
      <button type="button" data-cal-move="-1" aria-label="${esc(t('cal.prev'))}">‹</button>
      <strong aria-live="polite">${esc(fmtDay(isoOf(y, m, 1), { month: 'long', year: 'numeric' }))}</strong>
      <button type="button" data-cal-move="1" aria-label="${esc(t('cal.next'))}">›</button>
    </div>
    <div class="cal-grid">${weekdays}${'<span></span>'.repeat(lead)}${cells}</div>
    <div class="cal-foot">
      <button type="button" class="btn small ghost" data-cal-pick="${now}">${t('cal.today')}</button>
      <button type="button" class="btn small ghost" data-cal-pick="">${t('cal.clear')}</button>
    </div>`;
}

export const focusDay = () =>
  cal!.field.querySelector<HTMLElement>(`.cal-grid [data-cal-day="${cal!.focus}"]`)!.focus();

// Show the month of `iso` with that day focused.
export function moveCalendar(iso: ISODate) {
  const [y, m] = iso.split('-').map(Number);
  Object.assign(cal!, { y, m: m - 1, focus: iso });
  drawCalendar();
}

export function closeCalendar(refocus = false) {
  if (!cal) return;
  const { field } = cal;
  cal = null;
  field.querySelector('.cal')?.remove();
  field.querySelector('[data-cal-open]')?.setAttribute('aria-expanded', 'false');
  if (refocus) field.querySelector<HTMLElement>('[data-cal-open]')?.focus();
}

// Focus goes back to the calendar button, not the text box: on a phone that would bring up the keyboard.
export function pickDate(iso: ISODate) {
  const { box } = cal!;
  box.value = dateInput(iso);
  closeCalendar(true);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

document.addEventListener('pointerdown', e => {
  if (cal && !cal.field.contains(e.target as Node)) closeCalendar();
});
