/** Earlier versions (Settings › Account and sync) and the restore chooser: which plans, copies or merge. */
import { $, esc, settings } from './dom';
import { t } from '../i18n/index';
import { fmtRel } from '../core/dates';
import { SyncError, drive } from '../sync/drive';
import { listSnapshots, readSnapshot } from '../sync/snapshots';
import { syncNow } from '../sync/sync';
import { addCopies, mergeBackup, readBackup, type Backup } from './plan-io';

const dlg = $<HTMLDialogElement>('#restoreDlg');
let chosen: Backup | null = null;

function show(title: string, body: string, ok = '') {
  $('#restoreTitle').textContent = title;
  $('#restoreBody').innerHTML = body;
  $('#restoreOk').textContent = ok;
  $('#restoreOk').hidden = !ok;
  if (!dlg.open) dlg.showModal();
}

// The dated copies in Drive, newest first; only names are read until one is chosen.
export async function openVersions() {
  chosen = null;
  const lead = `<p class="hint">${t('versions.lead')}</p>`;
  show(t('versions.title'), lead);
  let list;
  try {
    list = await listSnapshots(await drive.getToken(false));
  } catch (e) {
    if (dlg.open)
      show(
        t('versions.title'),
        `<p class="hint">${t('versions.offline')}</p><div class="set-actions"><button type="button" class="btn small primary" data-restore="connect">${t('sync.now')}</button></div>`,
      );
    return;
  }
  if (!dlg.open || chosen) return;
  show(
    t('versions.title'),
    lead +
      (list.length
        ? `<div class="set-list">${list
            .map(
              f =>
                `<button type="button" class="set-item" data-version="${esc(f.id)}" data-day="${f.day}"><span class="set-text"><b>${esc(fmtRel(f.day, true))}</b></span></button>`,
            )
            .join('')}</div>`
        : `<p class="hint">${t('versions.none')}</p>`),
  );
}

async function openVersion(id: string, day: string) {
  try {
    const store = await readSnapshot(await drive.getToken(false), id);
    chooseRestore({ store, exportedAt: day + 'T12:00:00' }, false);
  } catch (e) {
    const why = t(e instanceof SyncError && e.code === 'update' ? 'versions.newer' : 'versions.offline');
    if (dlg.open) $('#restoreBody').insertAdjacentHTML('afterbegin', `<p class="hint" role="alert">${why}</p>`);
  }
}

// Which plans to bring back (all ticked), missing visions, and for a backup file: copies or merge.
export function chooseRestore(backup: Backup, canMerge: boolean) {
  chosen = backup;
  const row = (type: string, name: string, value: string, label: string, hint = '', on = true) =>
    `<label class="export-kind"><input type="${type}" name="${name}" value="${esc(value)}"${on ? ' checked' : ''}>
      <span><strong>${label}</strong>${hint ? `<span class="hint">${hint}</span>` : ''}</span></label>`;
  show(
    t(canMerge ? 'backup.restore' : 'versions.title'),
    `<fieldset class="export-kinds"><legend class="set-label">${t('versions.which')}</legend>${backup.store.plans.list
      .map(p => row('checkbox', 'plan', p.id, esc(p.name)))
      .join('')}</fieldset>
    <fieldset class="export-kinds"><legend class="sr-only">${t('backup.restore')}</legend>
    ${row('checkbox', 'visions', '1', t('versions.visions'))}
    ${
      canMerge
        ? row('radio', 'mode', 'copies', t('backup.copies')) +
          row('radio', 'mode', 'merge', t('backup.merge'), t('backup.mergeHint'), false)
        : ''
    }</fieldset>`,
    t('backup.copies'),
  );
}

function confirmChoice() {
  const checked = (sel: string) => [...dlg.querySelectorAll<HTMLInputElement>(`${sel}:checked`)].map(i => i.value);
  const only = checked('input[name=plan]'),
    merge = checked('input[name=mode]')[0] === 'merge',
    visions = checked('input[name=visions]').length > 0,
    backup = chosen!;
  dlg.close();
  if (merge) mergeBackup(backup, only);
  else addCopies(backup, { only, visions });
}

export function listenRestore() {
  document.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('#versionsBtn')) openVersions();
  });
  document.addEventListener('change', async e => {
    const input = e.target as HTMLInputElement;
    if (input.id !== 'backupInput') return;
    const file = input.files![0];
    input.value = '';
    const backup = file && readBackup(await file.text());
    if (!backup) return;
    settings.close();
    chooseRestore(backup, true);
  });
  dlg.addEventListener('change', () => {
    // Merging brings back what the backup holds, visions too: the box is for copies only.
    const merge = dlg.querySelector<HTMLInputElement>('input[name=mode][value=merge]')?.checked;
    const box = dlg.querySelector('input[name=visions]')?.closest('label');
    if (box) box.hidden = !!merge;
    $('#restoreOk').textContent = t(merge ? 'backup.merge' : 'backup.copies');
  });
  dlg.addEventListener('click', async ev => {
    const el = ev.target as HTMLElement;
    if (el === dlg || el.closest('[data-restore-close]')) return dlg.close();
    if (el.closest('#restoreOk') && chosen) return confirmChoice();
    if (el.closest('[data-restore="connect"]')) {
      await syncNow(true);
      return openVersions();
    }
    const v = el.closest<HTMLElement>('[data-version]');
    if (v) openVersion(v.dataset.version!, v.dataset.day!);
  });
}
