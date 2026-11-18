/** Deleting a plan (it spells out what is lost) and merging one plan into another. */
import { $, esc } from './dom';
import { closeCtxMenu } from './menu';
import { db } from '../core/state';
import { currentPlan, plans } from '../store/state';
import { t } from '../i18n/index';
import { syncConnected } from '../sync/sync';
import { deletePlan, mergePlanInto, readPlan } from '../store/plans';
import { toast } from './toast';
import { planContents } from './plan-switcher';
import { exportJson } from './plan-io';

/* ---------- Deleting a plan: spells out what is lost and asks for the plan's name ---------- */

export const planDel = $('#planDelete');

export function openPlanDelete(plan) {
  closeCtxMenu();
  planDel.dataset.id = plan.id;
  const contents = planContents(db);
  const last = plans.list.length === 1;
  $('#planDeleteBody').innerHTML = `
    <div class="del-warn" role="alert">
      <p>${t('planDel.lead', { name: `<span class="del-name">${esc(plan.name)}</span>` })}</p>
      ${contents ? `<ul>${contents}</ul>` : `<p>${t('planDel.empty')}</p>`}
    </div>
    <ul class="del-points">
      <li class="strong">${t('planDel.noUndo')}</li>
      <li>${t(syncConnected() ? 'planDel.synced' : 'planDel.local')}</li>
      <li>${t(last ? 'planDel.last' : 'planDel.others')}</li>
    </ul>
    <div class="del-actions">
      <button type="button" class="btn small" data-plan-backup>${t('planDel.backup')}</button>
      ${contents && !last ? `<button type="button" class="btn small" data-plan-merge-instead>${t('planDel.merge')}</button>` : ''}
    </div>
    <div class="field">
      <label for="planDeleteName">${t('planDel.type', { name: `<span class="del-name">${esc(plan.name)}</span>` })}</label>
      <input type="text" id="planDeleteName" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="planDeleteHint">
      <div class="hint" id="planDeleteHint">${t('planDel.typeHint')}</div>
    </div>`;
  $('#planDeleteBtn').disabled = true;
  planDel.showModal();
  $('#planDeleteName').focus();
}

export const planDelNameOk = () => $('#planDeleteName').value.trim() === plans.list.find(p => p.id === planDel.dataset.id)?.name;
planDel.addEventListener('input', () => ($('#planDeleteBtn').disabled = !planDelNameOk()));
planDel.addEventListener('click', e => {
  if (e.target === planDel || e.target.closest('[data-plan-delete-close]')) planDel.close();
  if (e.target.closest('[data-plan-backup]')) exportJson();
  if (e.target.closest('[data-plan-merge-instead]')) {
    planDel.close();
    openMerge(currentPlan(), true);
  }
});
$('#planDeleteForm').addEventListener('submit', e => {
  e.preventDefault();
  if (!planDelNameOk()) return;
  planDel.close();
  deletePlan(planDel.dataset.id);
  toast(t('toast.planDeleted'));
});

/* ---------- Merging a plan into another (also offered instead of deleting it) ---------- */

export const planMerge = $('#planMerge');

export function openMerge(plan, remove = false) {
  closeCtxMenu();
  const others = plans.list.filter(p => p.id !== plan.id);
  if (!others.length) return;
  planMerge.dataset.id = plan.id;
  const contents = planContents(plan.id === plans.current ? db : readPlan(plan.id));
  const name = `<strong>${esc(plan.name)}</strong>`;
  $('#planMergeBody').innerHTML = `
    <div class="field">
      <label for="mergeTarget">${t('merge.lead', { name })}</label>
      <select id="mergeTarget">${others.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
    </div>
    ${contents ? `<div><p>${t('merge.contents')}</p><ul class="import-progress">${contents}</ul></div>` : `<p>${t('planDel.empty')}</p>`}
    <p class="hint">${t('merge.hint')}</p>
    <label class="merge-remove"><input type="checkbox" id="mergeRemove" ${remove ? 'checked' : ''}> <span>${t('merge.remove', { name })}</span></label>`;
  planMerge.showModal();
  $('#mergeTarget').focus();
}
planMerge.addEventListener('click', e => {
  if (e.target === planMerge || e.target.closest('[data-plan-merge-close]')) return planMerge.close();
  if (!e.target.closest('#mergeBtn') || !planMerge.open) return;
  const from = plans.list.find(p => p.id === planMerge.dataset.id), to = plans.list.find(p => p.id === $('#mergeTarget').value);
  const remove = $('#mergeRemove').checked;
  planMerge.close();
  if (!from || !to) return;
  mergePlanInto(from.id, to.id, remove);
  toast(t(remove ? 'toast.mergedDeleted' : 'toast.merged', { from: from.name, to: to.name }));
});

