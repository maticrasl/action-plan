/** Settings › Data › Recently deleted: the list, Restore, Delete for good and Empty. */
import { $, esc } from './dom';
import { t, tp, type TextKey } from '../i18n/index';
import { fmtDate } from '../core/dates';
import { isoOf } from '../core/days';
import type { Db, Kind } from '../core/model';
import { restoreItem, restoreVision, type TrashEntry } from '../core/trash';
import { createPlan, editPlan, openPlan, uniqueName } from '../store/plans';
import { currentPlan, plans } from '../store/state';
import { saveVisions } from '../store/visions';
import { getTrash, trashForget } from '../store/trash';
import { requestRender } from './render';
import { toast } from './toast';
import { openForm } from './forms/form';

const dlg = $<HTMLDialogElement>('#trash');

const day = (iso: string) => {
  const d = new Date(iso);
  return fmtDate(isoOf(d.getFullYear(), d.getMonth(), d.getDate()));
};

function meta(e: TrashEntry) {
  const kind = e.kind === 'plan' ? t('trash.plan') : t(('kind.' + e.kind) as TextKey).toLocaleLowerCase();
  const where =
    e.kind === 'plan'
      ? tp(
          'trash.items',
          (['goals', 'states', 'activities'] as const).reduce(
            (n, c) => n + (e.payload as { data: Db }).data[c].length,
            0,
          ),
        )
      : e.planName;
  return [kind, where, t('trash.when', { date: day(e.deletedAt) })].filter(Boolean).join(' · ');
}

function draw() {
  const items = getTrash().items;
  $('#trashEmpty').hidden = !items.length;
  $('#trashBody').innerHTML = items.length
    ? `<ul class="trash-list">${items
        .map(
          e => `<li data-id="${esc(e.id)}">
        <span class="trash-what"><b>${esc(e.title)}</b><small>${esc(meta(e))}</small></span>
        <span class="trash-acts"><button type="button" class="btn small restore" data-trash="restore">${t('trash.restore')}</button>
        <button type="button" class="btn small danger" data-trash="forever">${t('trash.forever')}</button></span></li>`,
        )
        .join('')}</ul>`
    : `<p class="hint">${t('trash.none')}</p>`;
}

// The count beside the button in Settings › Data.
export function renderTrashCount() {
  const n = getTrash().items.length;
  $('#trashCount').textContent = n ? `(${n})` : '';
}

export function openTrash() {
  draw();
  dlg.showModal();
}

function restore(e: TrashEntry) {
  let lost = 0,
    show: (() => void) | undefined;
  if (e.kind === 'plan') {
    createPlan(uniqueName(e.title), JSON.parse(JSON.stringify((e.payload as { data: Db }).data)));
  } else if (e.kind === 'vision') {
    const back = restoreVision(e);
    lost = back.lost;
    saveVisions();
    show = () => openForm('vision', back.id);
  } else {
    let target = e.plan;
    if (!plans.list.some(p => p.id === target)) {
      if (!confirm(t('trash.planGone', { plan: currentPlan()?.name || '' }))) return;
      target = plans.current!;
    }
    let id = '';
    editPlan(target, () => ({ id, lost } = restoreItem(e as TrashEntry & { kind: Kind })));
    show = () => {
      if (plans.current !== target) openPlan(target);
      openForm(e.kind as Kind, id);
    };
  }
  trashForget([e.id]);
  requestRender();
  const msg = lost ? tp('trash.restoredLinks', lost) : t('trash.restored', { name: e.title });
  toast(msg, show ? { label: t('trash.show'), run: show } : null);
}

export function listenTrash() {
  $('#trashBtn').addEventListener('click', openTrash);
  $('#settingsBtn').addEventListener('click', renderTrashCount);
  dlg.addEventListener('click', ev => {
    const el = ev.target as HTMLElement;
    if (el === dlg || el.closest('[data-trash-close]')) return dlg.close();
    if (el.closest('#trashEmpty')) {
      if (confirm(t('trash.confirmEmpty'))) trashForget(getTrash().items.map(e => e.id));
      renderTrashCount();
      return draw();
    }
    const act = el.closest<HTMLElement>('[data-trash]')?.dataset.trash;
    // Read again: another tab or a sync may have changed the list since it was drawn.
    const entry = getTrash().items.find(e => e.id === el.closest<HTMLElement>('li')?.dataset.id);
    if (act && entry) {
      if (act === 'forever' && confirm(t('trash.confirmForever', { name: entry.title }))) trashForget([entry.id]);
      if (act === 'restore') {
        dlg.close();
        restore(entry);
      }
    }
    renderTrashCount();
    if (dlg.open) draw();
  });
}
