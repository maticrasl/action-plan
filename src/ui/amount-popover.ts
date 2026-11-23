/** A small form at a button that asks for one or more amounts (and a date). */
import { esc } from './dom';
import { t } from '../i18n/index';
import { dateInput, parseDateInput, today } from '../core/dates';
import { clamp, parseNum } from '../core/util';
import type { ISODate } from '../core/model';

/* ---------- Amount popover: a quick amount for states that add up ----------
   A state card's + asks for an amount and its date; ticking a routine that improves such states
   asks for an amount for each (empty adds nothing). Enter adds. Escape or "Tick only" still ticks
   the day; a click elsewhere leaves everything as it was. */

export let amountPop: { el: HTMLFormElement; anchor: HTMLElement; skip: (() => void) | null } | null = null;

// What the popover asks: a field per amount, and the date when `withDate`.
export interface AmountAsk {
  title: string;
  hint?: string;
  fields: { label: string; unit?: string }[];
  withDate?: boolean;
  okLabel: string;
  skipLabel?: string;
  // A text line under the numbers (feature 15): a measurement's note, or the note itself.
  note?: { label: string; placeholder?: string; max: number };
  pastOnly?: boolean; // the date may not be after today
}

export function openAmountPop(
  anchor: HTMLElement,
  { title, hint, fields, withDate, okLabel, skipLabel, note, pastOnly }: AmountAsk,
  submit: (amounts: (number | null)[], date: ISODate, note: string) => void,
  skip: (() => void) | null = null,
) {
  closeAmountPop();
  const el = document.createElement('form');
  el.className = 'amount-pop';
  el.noValidate = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', title);
  el.innerHTML = `<strong class="amount-title">${esc(title)}</strong>${hint ? `<p class="amount-hint">${esc(hint)}</p>` : ''}
    ${fields
      .map(
        (f, i) => `<label class="amount-field"><span>${esc(f.label)}</span><span class="amount-input">
      <input type="text" data-amount="${i}" inputmode="decimal" autocomplete="off" placeholder="0">${f.unit ? `<span class="amount-unit">${esc(f.unit)}</span>` : ''}</span></label>`,
      )
      .join('')}
    ${note ? `<label class="amount-field amount-note"><span>${esc(note.label)}</span><input type="text" data-amount-note maxlength="${note.max}" placeholder="${esc(note.placeholder || '')}" autocomplete="off"></label>` : ''}
    ${withDate ? `<label class="amount-field"><span>${t('f.asOf')}</span><input type="text" data-amount-date value="${esc(dateInput(today()))}" placeholder="${esc(t('f.datePh'))}" inputmode="numeric" autocomplete="off" maxlength="10"></label>` : ''}
    <div class="amount-err" role="alert"></div>
    <div class="amount-actions">${skipLabel ? `<button type="button" class="btn small ghost" data-amount-skip>${esc(skipLabel)}</button>` : ''}<button type="submit" class="btn small primary">${esc(okLabel)}</button></div>`;
  document.body.append(el);
  amountPop = { el, anchor, skip };
  const r = anchor.getBoundingClientRect(),
    vw = document.documentElement.clientWidth;
  const below = r.bottom + 8 + el.offsetHeight <= innerHeight - 8;
  el.style.left = `${clamp(r.left + r.width / 2 - el.offsetWidth / 2, 8, vw - el.offsetWidth - 8)}px`;
  el.style.top = `${Math.max(8, below ? r.bottom + 8 : r.top - 8 - el.offsetHeight)}px`;
  el.querySelector('input')!.focus();
  el.addEventListener('submit', e => {
    e.preventDefault();
    const amounts = [...el.querySelectorAll<HTMLInputElement>('[data-amount]')].map(i =>
      i.value.trim() ? parseNum(i.value) : null,
    );
    const dateBox = el.querySelector<HTMLInputElement>('[data-amount-date]');
    const date = dateBox ? parseDateInput(dateBox.value) : today();
    const err = amounts.some(n => Number.isNaN(n))
      ? t('err.number')
      : !date
        ? t('err.date')
        : pastOnly && date > today()
          ? t('err.doneFuture')
          : '';
    if (err) {
      el.querySelector('.amount-err')!.textContent = err;
      return;
    }
    closeAmountPop();
    submit(amounts, date!, el.querySelector<HTMLInputElement>('[data-amount-note]')?.value.trim() || '');
  });
  el.addEventListener('click', e => {
    if ((e.target as Element).closest('[data-amount-skip]')) skipAmount();
  });
  el.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    skipAmount();
  });
}

export function skipAmount() {
  const { skip, anchor } = amountPop!;
  closeAmountPop();
  if (skip) skip();
  else anchor.focus();
}

export function closeAmountPop() {
  amountPop?.el.remove();
  amountPop = null;
}
document.addEventListener('pointerdown', e => {
  if (amountPop && !amountPop.el.contains(e.target as Node) && e.target !== amountPop.anchor) closeAmountPop();
});
