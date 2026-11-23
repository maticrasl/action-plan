/** The closing note (feature 15): when a goal becomes achieved, a small dialog asks what made the difference. */
import { db } from '../core/state';
import { addNote, notesOf } from '../core/notes';
import { today } from '../core/dates';
import { t } from '../i18n/index';
import { isDemo, save } from '../store/plans';
import { $ } from './dom';
import { requestRender } from './render';
import type { Goal } from '../core/model';

const dlg = $<HTMLDialogElement>('#closingDlg');

// Asked each time a goal becomes achieved; not in a demo plan, nor over the welcome card.
export function askClosing(g: Goal) {
  if (isDemo() || document.querySelector('.welcome')) return;
  const earlier = notesOf(g).find(n => n.kind === 'closing');
  $('#closingTitle').textContent = t('closing.title', { name: g.title });
  $('#closingText').textContent = t('closing.text');
  $('#closingSave').textContent = t('closing.save');
  $('#closingSkip').textContent = t('closing.skip');
  const box = $<HTMLTextAreaElement>('#closingNote');
  box.value = '';
  // Built with textContent: the note is the person's own text.
  $('#closingEarlier').textContent = earlier ? `${t('closing.earlier')}\n${earlier.text}` : '';
  $('#closingEarlier').hidden = !earlier;
  dlg.dataset.goal = g.id;
  dlg.returnValue = '';
  if (!dlg.open) dlg.showModal();
  box.focus();
}

// Save stores the text as a closing note dated today; Skip, Esc or nothing typed stores nothing.
export function listenClosing() {
  dlg.addEventListener('close', () => {
    const g = db.goals.find(x => x.id === dlg.dataset.goal);
    if (dlg.returnValue !== 'save' || !g) return;
    if (!addNote(g, { date: today(), text: $<HTMLTextAreaElement>('#closingNote').value, kind: 'closing' })) return;
    save();
    requestRender();
  });
}
