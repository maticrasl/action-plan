/** This week's one thing (feature 09) and the plans Today reads: the card, choosing it, opening an item of another plan. */
import { PlanSource, asOpen, currentFocus, focusDone } from '../core/today';
import { allPlansData } from '../store/visions';
import { plans } from '../store/state';
import { Activity } from '../core/model';
import { Routine, isRoutine } from '../core/routines/schedule';
import { routineRow } from './routines';
import { activityRow } from './day-rows';
import { fmtDay, today } from '../core/dates';
import { journal, setFocus } from '../store/journal';
import { t } from '../i18n/index';
import { $, esc } from '../ui/dom';
import { openPlan } from '../store/plans';
import { toast } from '../ui/toast';
import { findEntity } from '../core/relations';
import { openForm } from '../ui/forms/form';
import { requestRender as render } from '../ui/render';
import { foldText } from '../core/guidance/search';

// The plans Today reads: the open one first, then the others in the list's order; never a sample.
export const todaySources = (): PlanSource[] =>
  allPlansData()
    .filter(({ plan }) => !plans.list.find(p => p.id === plan.id)?.demo)
    .map(({ plan, data }) => ({ plan: plan.id, data }));

export const planName = (id: string) => plans.list.find(p => p.id === id)?.name || '';
export const hasItems = (s: PlanSource) => s.data.goals.length + s.data.states.length + s.data.activities.length > 0;
export const row = (s: PlanSource | undefined, a: Activity) =>
  s ? asOpen(s.data, () => (isRoutine(a) ? routineRow(a as Routine) : activityRow(a))) : '';

// This week's one thing. On the Overview (`openOnly`) only when it is in the open plan, and never empty.
export function focusCard(sources: PlanSource[] = todaySources(), openOnly = false) {
  const now = today(),
    f = currentFocus(journal.focus, sources, now);
  if (openOnly && f?.plan !== plans.current) return '';
  const head = (extra = '') =>
    `<div class="focus-head"><h2 class="section-title">${t('today.focus')}</h2>${extra}</div>`;
  if (!f)
    return `<section class="focus-card">${head()}<div class="empty">${t('today.focusNone')} <button type="button" class="btn" data-today="choose">${t('today.choose')}</button></div></section>`;
  const done = focusDone(f.data, f.activity, now);
  const clear = `<button type="button" class="btn ghost small" data-today="clear">${t('today.focusClear')}</button>`;
  return `<section class="focus-card${done ? ' is-done' : ''}" data-in-plan="${esc(f.plan)}">${head(clear)}
    <div class="list">${row({ plan: f.plan, data: f.data }, f.activity)}</div>
    ${done ? `<p class="focus-done">${t('today.focusDone')}</p>` : ''}</section>`;
}

// Opens an item of another plan: that plan first, with a toast; the view stays where it is.
export function openIn(plan: string, id: string) {
  if (plan && plan !== plans.current && plans.list.some(p => p.id === plan)) {
    openPlan(plan);
    toast(t('log.openedPlan', { name: planName(plan) }));
  }
  const ent = findEntity(id);
  if (ent) openForm(ent.kind, ent.item.id);
}

export function chooseFocus(plan: string, id: string) {
  const a = allPlansData()
    .find(s => s.plan.id === plan)
    ?.data.activities.find(x => x.id === id);
  setFocus(plan, id);
  toast(t('today.focusSet', { name: a?.title || '' }));
  render();
}

const pickDlg = () => $<HTMLDialogElement>('#focusPickDlg');

export function openFocusPicker() {
  const dlg = pickDlg(),
    many = todaySources().length > 1;
  const steps = todaySources()
    .flatMap(s => s.data.activities.filter(a => !isRoutine(a) && a.status !== 'done').map(a => ({ plan: s.plan, a })))
    .sort((x, y) => (x.a.dueDate || '9999').localeCompare(y.a.dueDate || '9999'));
  $('#focusPickTitle').textContent = t('today.pick');
  const search = $<HTMLInputElement>('#focusPickSearch');
  search.placeholder = search.ariaLabel = t('today.pickSearch');
  search.value = '';
  $('#focusPickList').innerHTML = steps.length
    ? steps
        .map(
          ({ plan, a }) =>
            `<button type="button" class="pick-step" data-pick-plan="${esc(plan)}" data-pick-id="${esc(a.id)}" data-text="${esc(foldText(a.title))}"><span class="grow">${esc(a.title)}</span>${many ? `<small>${esc(planName(plan))}</small>` : ''}${a.dueDate ? `<small>${esc(fmtDay(a.dueDate, { day: 'numeric', month: 'short' }))}</small>` : ''}</button>`,
        )
        .join('')
    : `<div class="empty">${t('today.pickNone')}</div>`;
  $('#focusPickCancel').textContent = t('btn.cancel');
  dlg.showModal();
  search.focus();
}

// Called once from main.ts.
export function listenToday() {
  pickDlg().addEventListener('input', e => {
  const q = foldText((e.target as HTMLInputElement).value.trim());
  pickDlg()
    .querySelectorAll<HTMLElement>('[data-pick-id]')
    .forEach(b => (b.hidden = !!q && !b.dataset.text!.includes(q)));
});
pickDlg().addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pick-id]');
  if (!b) return;
  pickDlg().close();
  chooseFocus(b.dataset.pickPlan!, b.dataset.pickId!);
  });
}
