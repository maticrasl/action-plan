/** Settings › Plan: the open plan with what can be done to it, and every plan to switch to. */
import { t, type TextKey } from '../i18n/index';
import { db } from '../core/state';
import { planEmoji } from '../core/emoji';
import type { PlanList } from '../core/model';
import { plans, ui } from '../store/state';
import { $, esc } from './dom';
import { PLAN_ICONS, planHealth } from './plan-switcher';

const icon = (act: keyof typeof PLAN_ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${PLAN_ICONS[act]}</svg>`;

// `sorted`: the plans opened last first, as the plan list shows them.
export function renderPlanSettings(sorted: PlanList['list']) {
  const plan = sorted.find(p => p.id === plans.current);
  if (!plan) return;
  const health = ui.planBadges ? planHealth(db) : null;
  // Merging needs a second plan to merge into.
  const lone = plans.list.length < 2;
  const act = (a: 'rename' | 'export' | 'merge' | 'delete', cls = '') => {
    const off = a === 'merge' && lone;
    const title = esc(t((off ? 'plan.mergeOnly' : 'plan.' + a) as TextKey));
    return `<button type="button" class="btn small ${cls}" data-plan="${a}" title="${title}" ${off ? 'disabled' : ''}>${icon(a)}<span>${esc(t(('settings.plan.' + a) as TextKey))}</span></button>`;
  };
  const rows = sorted
    .map(p => {
      const on = p.id === plans.current;
      return `<button type="button" class="set-item plan-item" data-plan-open="${p.id}" aria-current="${on}"><span class="plan-dot"></span><span class="plan-emoji" aria-hidden="true">${esc(planEmoji(p))}</span><span class="set-text"><b>${esc(p.name)}</b></span>${on ? `<small class="plan-open-mark">${esc(t('settings.plan.open'))}</small>` : ''}</button>`;
    })
    .join('');
  $('#setPlanBody').innerHTML = `
    <div class="plan-hero">
      <span class="plan-hero-emoji" aria-hidden="true">${esc(planEmoji(plan))}</span>
      <div class="set-text"><b>${esc(plan.name)}</b>${health ? `<small class="plan-hero-health" data-health="${health}">${esc(t(('plan.health.' + health) as TextKey))}</small>` : ''}</div>
    </div>
    <div class="plan-hero-actions">${act('rename')}${act('export')}${act('merge')}${act('delete', 'danger')}</div>
    <h4 class="set-label">${esc(t('settings.plan.all'))}</h4>
    <div class="set-list">${rows}</div>
    <div class="set-list">
      <button type="button" class="set-item" data-plan="new">${icon('new').replace('<svg', '<svg class="set-ico"')}<span class="set-text"><b>${esc(t('plan.new'))}</b></span></button>
      <button type="button" class="set-item" data-plan="import">${icon('import').replace('<svg', '<svg class="set-ico"')}<span class="set-text"><b>${esc(t('plan.import'))}</b><small>${esc(t('settings.importHint'))}</small></span></button>
    </div>`;
}
