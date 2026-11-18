/** Ready-made plans to start from: the dialog that lists them by area. */
import { createPlan, uniqueName } from '../store/plans';
import { TEMPLATES, TPL_AREAS, templateData, tplText, type Template, type TplText } from '../core/templates/index';
import { toast } from './toast';
import { t, tp, type TextKey } from '../i18n/index';
import { $, esc } from './dom';
import { closeCtxMenu } from './menu';
import { settings } from './settings';

/* ---------- Templates (core/templates): ready-made plans to start from ---------- */

export function useTemplate(tpl: Template) {
  const name = uniqueName(tplText(tpl.name));
  createPlan(name, templateData(tpl));
  toast(t('toast.template', { name }));
}

// How long a template runs: weeks up to three months, then months, then whole years.
export function tplSpan(tpl: Template) {
  const days = Math.max(...tpl.goals.map(g => g.end));
  if (days <= 91) return tp('tpl.weeks', Math.round(days / 7));
  const months = Math.round(days / 30.44);
  return months % 12 ? tp('tpl.months', months) : tp('tpl.years', months / 12);
}

export const tplDialog = $<HTMLDialogElement>('#templates');
export let tplArea = '';

export function tplCard(tpl: Template) {
  const routines = tpl.activities.filter(a => a.repeat);
  const steps = tpl.activities.filter(a => !a.repeat && !a.parent);
  const counts = [
    tp('tpl.goals', tpl.goals.length),
    tpl.states.length && tp('tpl.states', tpl.states.length),
    tp('tpl.activities', tpl.activities.length - routines.length),
    routines.length && tp('tpl.routines', routines.length),
  ].filter(Boolean);
  const list = (label: string, items: { title: TplText }[]) =>
    items.length
      ? `<p><strong>${label}</strong></p><ul>${items.map(x => `<li>${esc(tplText(x.title))}</li>`).join('')}</ul>`
      : '';
  return `<article class="tpl-card">
    <div class="tpl-head"><h3>${esc(tplText(tpl.name))}</h3><span class="tag tpl-level ${tpl.level}">${t(('tpl.level.' + tpl.level) as TextKey)}</span></div>
    <p class="tpl-about">${esc(tplText(tpl.about))}</p>
    <p class="tpl-meta">${[tplSpan(tpl), ...counts].map(x => `<span>${x}</span>`).join('')}</p>
    <details class="tpl-inside"><summary>${t('tpl.inside')}</summary>
      ${list(t('tpl.goalList'), tpl.goals)}${list(t('tpl.stepList'), steps)}${list(t('tpl.routineList'), routines)}</details>
    <button type="button" class="btn small primary" data-template="${tpl.id}">${t('tpl.use')}</button>
  </article>`;
}

// Templates by area (starter ones first), with chips to show a single area.
export function renderTemplates() {
  const chip = (area: string, label: string) =>
    `<button type="button" class="chip ${tplArea === area ? 'active' : ''}" data-tpl-area="${area}" aria-pressed="${tplArea === area}">${label}</button>`;
  $('#templateAreas').innerHTML =
    chip('', t('tpl.area.all')) + TPL_AREAS.map(a => chip(a, t(('tpl.area.' + a) as TextKey))).join('');
  const levels = ['starter', 'ambitious'];
  $('#templateList').innerHTML = TPL_AREAS.filter(a => !tplArea || a === tplArea)
    .map(area => {
      const list = TEMPLATES.filter(x => x.area === area).sort(
        (a, b) => levels.indexOf(a.level) - levels.indexOf(b.level),
      );
      return `<section class="tpl-area"><h3>${t(('tpl.area.' + area) as TextKey)}</h3><div class="tpl-grid">${list.map(tplCard).join('')}</div></section>`;
    })
    .join('');
}

export function openTemplates() {
  closeCtxMenu();
  if (settings.open) settings.close();
  renderTemplates();
  tplDialog.showModal();
  tplDialog.querySelector('.modal-body')!.scrollTop = 0;
}
tplDialog.addEventListener('click', e => {
  if (e.target === tplDialog || (e.target as HTMLElement).closest('[data-templates-close]')) return tplDialog.close();
  const area = (e.target as HTMLElement).closest<HTMLElement>('[data-tpl-area]');
  if (area) {
    tplArea = area.dataset.tplArea!;
    renderTemplates();
    return;
  }
  const use = (e.target as HTMLElement).closest<HTMLElement>('[data-template]');
  if (!use) return;
  tplDialog.close();
  useTemplate(TEMPLATES.find(x => x.id === use.dataset.template)!);
});
