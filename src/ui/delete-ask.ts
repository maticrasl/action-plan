/** Deleting a goal or activity with activities under it: asks whether they go too (ticked), and says which stay. */
import { t, tp } from '../i18n/index';
import { $ } from './dom';

// `n` activities would go with it and `shared` stay; `done` runs only on Delete, with whether they go too.
export function askDelete(
  kind: 'goal' | 'activity',
  name: string,
  n: number,
  shared: number,
  done: (withThem: boolean) => void,
) {
  const dlg = $<HTMLDialogElement>('#deleteDlg');
  $('#deleteTitle').textContent = t('del.title', { name });
  $('#deleteKidsText').textContent = tp(kind === 'goal' ? 'del.kids.goal' : 'del.kids.activity', n);
  $('#deleteShared').textContent = shared ? tp('del.shared', shared) : '';
  $('#deleteShared').hidden = !shared;
  $<HTMLInputElement>('#deleteKids').checked = true;
  $('#deleteOk').textContent = t('btn.delete');
  $('#deleteCancel').textContent = t('btn.cancel');
  // On submit, not on close: `close` comes a moment later. Esc and Cancel delete nothing.
  dlg.querySelector('form')!.onsubmit = e => {
    e.preventDefault();
    dlg.close();
    if (e.submitter?.id === 'deleteOk') done($<HTMLInputElement>('#deleteKids').checked);
  };
  dlg.showModal();
  $('#deleteOk').focus();
}
