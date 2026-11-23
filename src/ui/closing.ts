/** The closing note (feature 15): when a goal becomes achieved, a small dialog asks what made the difference. */
import { db } from '../core/state';
import { addNote, notesOf } from '../core/notes';
import { today } from '../core/dates';
import { t } from '../i18n/index';
import { isDemo, save } from '../store/plans';
import { $ } from './dom';
import { requestRender } from './render';
import type { Goal } from '../core/model';
import { isKeep } from '../core/keep';
import { ownMetric } from '../core/progress';
import { relsTo } from '../core/relations';
import { isNum } from '../core/util';
import { openForm } from './forms/form';

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
  // A goal measured by a state to a target: offer to keep the result (07).
  const keep = !isKeep(g) && ownMetric(g) && isNum(g.target) && relsTo(g.id, 'measures').length > 0;
  $('#closingKeep').hidden = !keep;
  $('#closingKeepTitle').textContent = t('closing.keepTitle');
  $('#closingKeepText').textContent = t('closing.keepText');
  $('#closingKeepBtn').textContent = t('closing.keepBtn');
  dlg.dataset.goal = g.id;
  dlg.returnValue = '';
  if (!dlg.open) dlg.showModal();
  box.focus();
}

// Save stores the text as a closing note dated today; Skip, Esc or nothing typed stores nothing.
// "Set up a keep goal" also keeps what was typed, then opens the goal form filled in; nothing is created until it is saved.
export function listenClosing() {
  dlg.addEventListener('close', () => {
    const g = db.goals.find(x => x.id === dlg.dataset.goal);
    if (!g || !['save', 'keep'].includes(dlg.returnValue)) return;
    if (addNote(g, { date: today(), text: $<HTMLTextAreaElement>('#closingNote').value, kind: 'closing' })) {
      save();
      requestRender();
    }
    if (dlg.returnValue === 'keep') openForm('goal', null, { keepFrom: g.id });
  });
}
