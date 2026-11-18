/** The form dialog's listeners, in the order they must run (Ctrl+Enter first, then the link lists and the calendar). */
import { $ } from '../dom';
import { isoOf } from '../../core/days';
import { t } from '../../i18n/index';
import { db } from '../../core/state';
import { findEntity } from '../../core/relations';
import { removeEntity } from '../../store/plans';
import { cal, closeCalendar, focusDay, moveCalendar, openCalendar, pickDate } from '../calendar';
import { pickItem, showPickList, unpickItem } from './picker';
import { updateProgressFields, updateSmartLive } from './goal';
import { updateStateFields } from './state';
import { addListRow, placeListRow, updateRepeatFields } from './activity';
import { fillRelTypes } from './relation';
import { finish, formCtx, modal, openForm, submitForm } from './form';

$('#modalForm').addEventListener('keydown', e => {
  // Ctrl+Enter (⌘+Enter on a Mac) saves from any field; the pickers and lists below never see it.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!$('#saveBtn').hidden) $('#modalForm').requestSubmit($('#saveBtn'));
    return;
  }
  // A phone keyboard sends Enter only for `enterkeyhint="enter"` (its Next key would jump to the next
  // field instead); Enter that finishes typing in an input method is left to it.
  if (e.key === 'Enter' && !e.isComposing && e.target.matches('.li-input')) { e.preventDefault(); addListRow(e.target.closest('.li-row')); }
});
$('#modalForm').addEventListener('submit', e => { e.preventDefault(); if (!formCtx?.choose) submitForm(); });
$('#modalBody').addEventListener('click', e => {
  if (e.target.closest('[data-li-add]')) return addListRow();
  const del = e.target.closest('[data-li-del]');
  if (del) {
    // Focus moves to the next row's remove button, not its text: on a phone that would open the keyboard.
    const row = del.closest('.li-row'), next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    if (!next) {
      addListRow(null, false);
      return modal.querySelector('[data-li-add]').focus();
    }
    return next.querySelector('[data-li-del]').focus();
  }
  const b = e.target.closest('[data-act-kind]');
  if (b && formCtx?.choose) openForm('activity', null, { ...formCtx.choose, repeat: b.dataset.actKind });
});
$('#modalForm').addEventListener('input', updateSmartLive);
$('#modalForm').addEventListener('input', e => {
  if (['f-every', 'f-count', 'f-startDate'].includes(e.target.id)) updateRepeatFields(e);
});
// Typing or picking when a routine ends chooses that option.
$('#modalForm').addEventListener('focusin', e => {
  const row = e.target.closest('.rep-end');
  if (row && e.target.type !== 'radio') row.querySelector('input[type="radio"]').checked = true;
});
$('#modalForm').addEventListener('change', e => {
  if (e.target.matches('.li-check')) return placeListRow(e.target.closest('.li-row'));
  if (e.target.id === 'f-from' || e.target.id === 'f-to') return fillRelTypes();
  if (['f-monthDay', 'f-nth', 'f-weekday'].includes(e.target.id)) e.target.setAttribute('data-picked', '');
  if (['f-addsUp', 'f-unit'].includes(e.target.id) && formCtx?.kind === 'state') return updateStateFields();
  if (['f-repeat', 'f-unit', 'f-on', 'f-startDate'].includes(e.target.id)) return updateRepeatFields(e);
  if (e.target.id !== 'f-progress') return;
  updateProgressFields();
  updateSmartLive();
});
// Weekday toggles of a routine: the chosen days are kept in a hidden field.
$('#modalForm').addEventListener('click', e => {
  const day = e.target.closest('.day-toggle');
  if (!day) return;
  day.setAttribute('aria-pressed', day.getAttribute('aria-pressed') !== 'true');
  const box = day.closest('.field');
  box.querySelector('input[name="days"]').value = [...box.querySelectorAll('.day-toggle[aria-pressed="true"]')].map(b => b.dataset.day).join(',');
});

// Link lists: the list opens while the search box (or one of its items) has focus, typing filters it,
// a click on an item adds it and a chosen item's × removes it.
export const shownOpts = picker => [...picker.querySelectorAll('.pick-opt:not([hidden])')];
['focusin', 'input'].forEach(type => $('#modalForm').addEventListener(type, e => {
  if (e.target.matches('.picker-search')) showPickList(e.target.closest('[data-picker]'), true);
}));
$('#modalForm').addEventListener('focusout', e => {
  const picker = e.target.closest('[data-picker]');
  if (picker && !(e.relatedTarget && picker.contains(e.relatedTarget) && e.relatedTarget.closest('.pick-list, .picker-search'))) showPickList(picker, false);
});
// Pressing an item must not move focus away from the search box first (that would close the list).
$('#modalForm').addEventListener('pointerdown', e => { if (e.target.closest('.pick-opt')) e.preventDefault(); });
$('#modalForm').addEventListener('keydown', e => {
  const picker = e.target.closest?.('[data-picker]');
  if (!picker || !e.target.closest('.picker-search, .pick-opt')) return;
  const search = picker.querySelector('.picker-search');
  const shown = shownOpts(picker);
  const i = shown.indexOf(e.target);
  if (e.key === 'Escape' && !picker.querySelector('.pick-list').hidden) {
    // Close the list, not the form.
    e.preventDefault();
    e.stopPropagation();
    search.focus();
    showPickList(picker, false);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (picker.querySelector('.pick-list').hidden) return showPickList(picker, true);
    const next = i + (e.key === 'ArrowDown' ? 1 : -1);
    (next < 0 ? search : shown[Math.min(next, shown.length - 1)] || search).focus();
  } else if (e.key === 'Enter' && e.target === search) {
    // Enter adds the first match instead of saving the form.
    e.preventDefault();
    if (shown[0]) pickItem(shown[0]);
  }
});
$('#modalForm').addEventListener('click', e => {
  const opt = e.target.closest('.pick-opt');
  if (opt) {
    const picker = opt.closest('[data-picker]'), shown = shownOpts(picker), at = shown.indexOf(opt);
    const next = shown[at + 1] || shown[at - 1];
    pickItem(opt);
    // Keep the keyboard in the list; after a click, typing goes on in the search box.
    return (document.activeElement === opt && next ? next : picker.querySelector('.picker-search')).focus();
  }
  const x = e.target.closest('[data-unpick]');
  if (!x) return;
  const picker = x.closest('[data-picker]');
  const tags = [...picker.querySelectorAll('[data-unpick]')], at = tags.indexOf(x);
  unpickItem(picker, x.dataset.unpick);
  (tags[at + 1] || tags[at - 1] || picker.querySelector('.picker-search')).focus();
});
// Date fields: slashes are added while typing digits.
$('#modalForm').addEventListener('input', e => {
  const box = e.target;
  if (!box.matches('[data-date]') || e.inputType !== 'insertText' || !/^\d$/.test(e.data) || box.selectionStart !== box.value.length) return;
  if (/^\d{2}$|^\d{1,2}\/\d{2}$/.test(box.value)) box.value += '/';
});

$('#modalForm').addEventListener('click', e => {
  // An entry marked for deletion is deleted on saving (and kept on cancelling).
  const drop = e.target.closest('[data-drop-entry]');
  if (drop) {
    const on = drop.getAttribute('aria-pressed') !== 'true';
    drop.setAttribute('aria-pressed', on);
    drop.closest('.entry').classList.toggle('dropped', on);
    return;
  }
  const open = e.target.closest('[data-cal-open]');
  if (open) return cal?.field === open.closest('.date-field') ? closeCalendar() : openCalendar(open.closest('.date-field'));
  if (!cal) return;
  const day = e.target.closest('[data-cal-day], [data-cal-pick]');
  if (day) return pickDate(day.dataset.calDay ?? day.dataset.calPick);
  const move = e.target.closest('[data-cal-move]');
  if (move) {
    const n = Number(move.dataset.calMove);
    const d = Number(cal.focus.slice(8));
    // Same day in the other month, or its last day.
    const last = new Date(Date.UTC(cal.y, cal.m + n + 1, 0)).getUTCDate();
    moveCalendar(isoOf(cal.y, cal.m + n, Math.min(d, last)));
    cal.field.querySelector(`[data-cal-move="${n}"]`).focus();
  }
});
$('#modalForm').addEventListener('keydown', e => {
  if (!cal || !cal.field.querySelector('.cal').contains(e.target)) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    return closeCalendar(true);
  }
  if (!e.target.matches('[data-cal-day]')) return;
  const [y, m, d] = cal.focus.split('-').map(Number);
  const to = {
    ArrowLeft: [y, m - 1, d - 1], ArrowRight: [y, m - 1, d + 1], ArrowUp: [y, m - 1, d - 7], ArrowDown: [y, m - 1, d + 7],
    PageUp: [y, m - 2, Math.min(d, new Date(Date.UTC(y, m - 1, 0)).getUTCDate())],
    PageDown: [y, m, Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())],
  }[e.key];
  if (!to) return;
  e.preventDefault();
  moveCalendar(isoOf(...to));
  focusDay();
});
// Escape closes the calendar, not the whole form; so does a click anywhere else.
modal.addEventListener('cancel', e => {
  if (!cal) return;
  e.preventDefault();
  closeCalendar(true);
});

modal.addEventListener('click', e => {
  if (e.target === modal || e.target.closest('[data-close]')) modal.close();
});
$('#deleteBtn').addEventListener('click', () => {
  const { kind, id } = formCtx;
  if (kind === 'relation') {
    if (!confirm(t('confirm.deleteRel'))) return;
    db.relations = db.relations.filter(r => r.id !== id);
    return finish(t('toast.relRemoved'));
  }
  const item = findEntity(id)?.item;
  if (!item || !confirm(t('confirm.delete', { name: item.title }))) return;
  removeEntity(kind, id);
  finish(t('toast.deleted.' + kind));
});
