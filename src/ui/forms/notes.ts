/** The Notes section at the end of the goal, activity and state forms (feature 15): add, edit and delete, kept until Save. */
import { addNote, deleteNote, editNote, NOTE_MAX, notesOf } from '../../core/notes';
import { fmtRel, parseDateInput, today } from '../../core/dates';
import { t } from '../../i18n/index';
import { $, esc } from '../dom';
import { area, date, modal, openForm } from './form';
import { findEntity } from '../../core/relations';
import type { Note, WithNotes } from '../../core/model';

// What the section holds until Save, in a hidden input, so the form's "changed?" check sees it too.
const store = () => modal.querySelector<HTMLInputElement>('#f-notesJson');
const read = (): WithNotes => JSON.parse(store()?.value || '{}');
function write(x: WithNotes) {
  store()!.value = JSON.stringify(x);
  $('#noteList').innerHTML = rows(x);
}

const COUNTER_FROM = 1800;
const counter = (n: number) => (n >= NOTE_MAX ? t('notes.tooLong') : n >= COUNTER_FROM ? `${n} / ${NOTE_MAX}` : '');

const row = (n: Note) => `<li class="note" data-note="${esc(n.id)}">
  <span class="note-date">${esc(fmtRel(n.date, true))}</span>
  <span class="note-text">${n.kind === 'closing' ? `<span class="note-kind">${esc(t('notes.closing'))}</span>` : ''}${esc(n.text)}</span>
  <details class="note-more"><summary aria-label="${esc(t('notes.edit'))} · ${esc(t('notes.delete'))}">⋯</summary><div class="note-menu"><button type="button" data-note-edit>${esc(t('notes.edit'))}</button><button type="button" data-note-del>${esc(t('notes.delete'))}</button></div></details>
</li>`;
const rows = (x: WithNotes) => notesOf(x).map(row).join('');

// The item's form, scrolled to its Notes (the card's ✎ tag).
export function openNotes(id: string) {
  const ent = findEntity(id);
  if (!ent || ent.kind === 'vision') return;
  openForm(ent.kind, id);
  $('#notesSec').scrollIntoView({ block: 'nearest' });
  $('#f-noteText').focus({ preventScroll: true });
}

export const notesSection = (x: WithNotes) => `<div class="field notes-sec" id="notesSec" data-field="noteDate">
  <span class="label">${esc(t('notes.title'))}</span>
  <div class="note-add">${area('noteText', '', t('notes.add'), NOTE_MAX)}<div class="note-add-row">${date('noteDate', today())}<button type="button" class="btn small" data-note-add>${esc(t('notes.addBtn'))}</button></div></div>
  <div class="hint note-count" aria-live="polite"></div>
  <div class="err"></div>
  <ul class="note-list" id="noteList">${rows(x)}</ul>
  <input type="hidden" id="f-notesJson" value="${esc(JSON.stringify({ notes: x.notes, droppedNotes: x.droppedNotes }))}">
</div>`;

const fail = (msg: string) => {
  const f = $('#notesSec');
  f.classList.add('invalid');
  f.querySelector(':scope > .err')!.textContent = msg;
  return false;
};

// Adds what is typed in the add box; false (with the message shown) when its date is not a past day.
function addTyped(): boolean {
  const box = $<HTMLTextAreaElement>('#f-noteText');
  if (!box.value.trim()) return true;
  const raw = $<HTMLInputElement>('#f-noteDate').value.trim();
  const day = raw ? parseDateInput(raw) : today();
  if (!day) return fail(t('err.date'));
  if (day > today()) return fail(t('err.doneFuture'));
  const x = read();
  addNote(x, { date: day, text: box.value });
  write(x);
  box.value = '';
  $('#notesSec').classList.remove('invalid');
  $('#notesSec .note-count').textContent = '';
  return true;
}

function commitEdit(li: HTMLElement) {
  const x = read();
  editNote(x, li.dataset.note!, li.querySelector<HTMLTextAreaElement>('.note-edit')!.value);
  write(x);
}

// Before Save: an open edit and text left in the add box count as written. False stops the save.
export function flushNotes(): boolean {
  if (!store()) return true;
  modal.querySelectorAll<HTMLElement>('.note.editing').forEach(commitEdit);
  return addTyped();
}

// After Save has checked the form: the section's notes go onto the item.
export function applyNotes(item: WithNotes) {
  if (!store()) return;
  const x = read();
  for (const k of ['notes', 'droppedNotes'] as const)
    if (x[k]) (item as Record<string, unknown>)[k] = x[k];
    else delete item[k];
}

export function noteClick(e: Event): boolean {
  const el = e.target as HTMLElement;
  if (el.closest('[data-note-add]')) {
    if (addTyped()) $('#f-noteText').focus();
    return true;
  }
  const li = el.closest<HTMLElement>('.note');
  if (!li) return false;
  if (el.closest('[data-note-del]')) {
    const x = read();
    deleteNote(x, li.dataset.note!);
    write(x);
    $('#f-noteText').focus();
    return true;
  }
  if (el.closest('[data-note-edit]')) {
    const n = read().notes?.find(m => m.id === li.dataset.note);
    li.classList.add('editing');
    li.querySelector('details')!.remove();
    li.querySelector('.note-text')!.outerHTML =
      `<textarea class="note-edit" maxlength="${NOTE_MAX}" aria-label="${esc(t('notes.edit'))}">${esc(n?.text)}</textarea>`;
    li.querySelector<HTMLTextAreaElement>('.note-edit')!.focus();
    return true;
  }
  return false;
}

// In an edit: Enter keeps it (Shift+Enter is a new line), Esc leaves the note as it was.
export function noteKey(e: KeyboardEvent): boolean {
  const box = (e.target as HTMLElement).closest<HTMLTextAreaElement>('.note-edit');
  if (!box || e.isComposing) return false;
  if (e.key === 'Escape') {
    e.preventDefault();
    write(read());
    return true;
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    commitEdit(box.closest('.note')!);
    return true;
  }
  return false;
}

// Leaving an edit keeps it.
export function noteBlur(e: FocusEvent) {
  const li = (e.target as HTMLElement).closest<HTMLElement>('.note.editing');
  if (li?.isConnected && !li.contains(e.relatedTarget as Node)) commitEdit(li);
}

export function noteInput(e: Event) {
  const box = e.target as HTMLTextAreaElement;
  if (box.id === 'f-noteText') $('#notesSec .note-count').textContent = counter(box.value.length);
}
