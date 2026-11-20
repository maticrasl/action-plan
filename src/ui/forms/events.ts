/** The form dialog's listeners, in the order they must run (Ctrl+Enter first, then the link lists and the calendar). */
import { $ } from '../dom';
import { t } from '../../i18n/index';
import { db } from '../../core/state';
import { findEntity } from '../../core/relations';
import { save } from '../../store/plans';
import { deleteItem, undoable } from '../undo';
import { requestRender } from '../render';
import { cal, calendarClick, calendarKey, closeCalendar, dateSlashes } from '../calendar';
import { pickItem, showPickList, unpickItem } from './picker';
import { updateMeasuredBy, updateProgressFields, updateSmartLive } from './goal';
import { updateStateFields } from './state';
import { addListRow, makeList, placeListRow, updateListDone, updateRepeatFields } from './activity';
import { fillRelTypes } from './relation';
import { formChanged, formCtx, modal, openForm, submitForm } from './form';

$('#modalForm').addEventListener('keydown', e => {
  // Ctrl+Enter (⌘+Enter on a Mac) saves from any field; the pickers and lists below never see it.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!$('#saveBtn').hidden) $<HTMLFormElement>('#modalForm').requestSubmit($('#saveBtn'));
    return;
  }
  // A phone keyboard sends Enter only for `enterkeyhint="enter"` (its Next key would jump to the next
  // field instead); Enter that finishes typing in an input method is left to it.
  if (e.key === 'Enter' && !e.isComposing && (e.target as HTMLElement).matches('.li-input')) {
    e.preventDefault();
    addListRow((e.target as HTMLElement).closest('.li-row'));
  }
});
$('#modalForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!formCtx?.choose) submitForm();
});
$('#modalBody').addEventListener('click', e => {
  if ((e.target as HTMLElement).closest('[data-li-add]')) return addListRow();
  const toList = (e.target as HTMLElement).closest<HTMLElement>('[data-to-list]');
  if (toList) return makeList(toList);
  if ((e.target as HTMLElement).closest('[data-li-done-toggle]')) {
    $('#listRows').classList.toggle('hide-done');
    return updateListDone();
  }
  const del = (e.target as HTMLElement).closest('[data-li-del]');
  if (del) {
    // Focus moves to the next row's remove button, not its text: on a phone that would open the keyboard.
    // Hidden ticked rows are skipped.
    const row = del.closest('.li-row')!,
      shown = (r: Element | null, step: 'nextElementSibling' | 'previousElementSibling') => {
        while (r && !(r as HTMLElement).offsetParent) r = r[step];
        return r;
      },
      next =
        shown(row.nextElementSibling, 'nextElementSibling') ||
        shown(row.previousElementSibling, 'previousElementSibling');
    row.remove();
    updateListDone();
    if (!next) {
      addListRow(null, false);
      return modal.querySelector<HTMLElement>('[data-li-add]')!.focus();
    }
    return next.querySelector<HTMLElement>('[data-li-del]')!.focus();
  }
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act-kind]');
  if (b && formCtx?.choose) openForm('activity', null, { ...formCtx.choose, repeat: b.dataset.actKind });
});
$('#modalForm').addEventListener('input', updateSmartLive);
$('#modalForm').addEventListener('input', e => {
  if (['f-every', 'f-count', 'f-startDate'].includes((e.target as HTMLElement).id)) updateRepeatFields(e);
});
// Typing or picking when a routine ends chooses that option.
$('#modalForm').addEventListener('focusin', e => {
  const row = (e.target as HTMLElement).closest('.rep-end');
  if (row && (e.target as HTMLInputElement).type !== 'radio')
    row.querySelector<HTMLInputElement>('input[type="radio"]')!.checked = true;
});
$('#modalForm').addEventListener('change', e => {
  if ((e.target as HTMLElement).matches('.li-check'))
    return placeListRow((e.target as HTMLElement).closest<HTMLElement>('.li-row')!);
  if ((e.target as HTMLElement).id === 'f-from' || (e.target as HTMLElement).id === 'f-to') return fillRelTypes();
  if (['f-monthDay', 'f-nth', 'f-weekday'].includes((e.target as HTMLElement).id))
    (e.target as HTMLElement).setAttribute('data-picked', '');
  if (['f-addsUp', 'f-unit'].includes((e.target as HTMLElement).id) && formCtx?.kind === 'state')
    return updateStateFields();
  if (['f-repeat', 'f-unit', 'f-on', 'f-startDate'].includes((e.target as HTMLElement).id))
    return updateRepeatFields(e);
  if ((e.target as HTMLElement).id === 'f-measuredBy') {
    updateMeasuredBy();
    return updateSmartLive();
  }
  if ((e.target as HTMLElement).id !== 'f-progress') return;
  updateProgressFields();
  updateSmartLive();
});
// Weekday toggles of a routine: the chosen days are kept in a hidden field.
$('#modalForm').addEventListener('click', e => {
  const day = (e.target as HTMLElement).closest('.day-toggle');
  if (!day) return;
  day.setAttribute('aria-pressed', String(day.getAttribute('aria-pressed') !== 'true'));
  const box = day.closest('.field')!;
  box.querySelector<HTMLInputElement>('input[name="days"]')!.value = [
    ...box.querySelectorAll<HTMLElement>('.day-toggle[aria-pressed="true"]'),
  ]
    .map(b => b.dataset.day)
    .join(',');
});

// Link lists: the list opens while the search box (or one of its items) has focus, typing filters it,
// a click on an item adds it and a chosen item's × removes it.
export const shownOpts = (picker: HTMLElement) => [...picker.querySelectorAll<HTMLElement>('.pick-opt:not([hidden])')];
['focusin', 'input'].forEach(type =>
  $('#modalForm').addEventListener(type, e => {
    if ((e.target as HTMLElement).matches('.picker-search'))
      showPickList((e.target as HTMLElement).closest<HTMLElement>('[data-picker]')!, true);
  }),
);
$('#modalForm').addEventListener('focusout', e => {
  const picker = (e.target as HTMLElement).closest<HTMLElement>('[data-picker]');
  if (
    picker &&
    !(
      e.relatedTarget &&
      picker.contains(e.relatedTarget as Node) &&
      (e.relatedTarget as HTMLElement).closest('.pick-list, .picker-search')
    )
  )
    showPickList(picker, false);
});
// Pressing an item must not move focus away from the search box first (that would close the list).
$('#modalForm').addEventListener('pointerdown', e => {
  if ((e.target as HTMLElement).closest('.pick-opt')) e.preventDefault();
});
$('#modalForm').addEventListener('keydown', e => {
  const picker = (e.target as HTMLElement).closest?.<HTMLElement>('[data-picker]');
  if (!picker || !(e.target as HTMLElement).closest('.picker-search, .pick-opt')) return;
  const search = picker.querySelector<HTMLElement>('.picker-search')!;
  const shown = shownOpts(picker);
  const i = shown.indexOf(e.target as HTMLElement);
  if (e.key === 'Escape' && !picker.querySelector<HTMLElement>('.pick-list')!.hidden) {
    // Close the list, not the form.
    e.preventDefault();
    e.stopPropagation();
    search.focus();
    showPickList(picker, false);
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (picker.querySelector<HTMLElement>('.pick-list')!.hidden) return showPickList(picker, true);
    const next = i + (e.key === 'ArrowDown' ? 1 : -1);
    (next < 0 ? search : shown[Math.min(next, shown.length - 1)] || search).focus();
  } else if (e.key === 'Enter' && e.target === search) {
    // Enter adds the first match instead of saving the form.
    e.preventDefault();
    if (shown[0]) pickItem(shown[0]);
  }
});
$('#modalForm').addEventListener('click', e => {
  const opt = (e.target as HTMLElement).closest<HTMLElement>('.pick-opt');
  if (opt) {
    const picker = opt.closest<HTMLElement>('[data-picker]')!,
      shown = shownOpts(picker),
      at = shown.indexOf(opt);
    const next = shown[at + 1] || shown[at - 1];
    pickItem(opt);
    // Keep the keyboard in the list; after a click, typing goes on in the search box.
    return (
      document.activeElement === opt && next ? next : picker.querySelector<HTMLElement>('.picker-search')!
    ).focus();
  }
  const x = (e.target as HTMLElement).closest<HTMLElement>('[data-unpick]');
  if (!x) return;
  const picker = x.closest<HTMLElement>('[data-picker]')!;
  const tags = [...picker.querySelectorAll<HTMLElement>('[data-unpick]')],
    at = tags.indexOf(x);
  unpickItem(picker, x.dataset.unpick!);
  (tags[at + 1] || tags[at - 1] || picker.querySelector<HTMLElement>('.picker-search')!).focus();
});
$('#modalForm').addEventListener('input', dateSlashes);

$('#modalForm').addEventListener('click', e => {
  // An entry marked for deletion is deleted on saving (and kept on cancelling).
  const drop = (e.target as HTMLElement).closest('[data-drop-entry]');
  if (drop) {
    const on = drop.getAttribute('aria-pressed') !== 'true';
    drop.setAttribute('aria-pressed', String(on));
    drop.closest('.entry')!.classList.toggle('dropped', on);
    return;
  }
  calendarClick(e);
});
$('#modalForm').addEventListener('keydown', calendarKey);
// Escape closes the calendar, not the whole form; so does a click anywhere else.
// Escape on a changed form asks first, as Cancel, × and a click outside do.
modal.addEventListener('cancel', e => {
  if (cal) {
    e.preventDefault();
    closeCalendar(true);
  } else if (formChanged() && !confirm(t('confirm.discard'))) e.preventDefault();
});

modal.addEventListener('click', e => {
  if (e.target !== modal && !(e.target as HTMLElement).closest('[data-close]')) return;
  if (!formChanged() || confirm(t('confirm.discard'))) modal.close();
});
$('#deleteBtn').addEventListener('click', () => {
  const { kind, id } = formCtx!;
  modal.close();
  if (kind === 'relation')
    return undoable(() => {
      db.relations = db.relations.filter(r => r.id !== id);
      save();
      requestRender();
      return t('toast.relRemoved');
    });
  if (findEntity(id!) || kind === 'vision') deleteItem(kind, id!);
});
