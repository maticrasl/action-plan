/** The plan switcher: the plans with their health, and new, rename, merge, export, import, delete. */
import { createPlan, openPlan, planKey, planOpened, readPlan, save, uniqueName, withPlan } from '../store/plans';
import { t, type TextKey } from '../i18n/index';
import { db } from '../core/state';
import { today } from '../core/dates';
import { isRoutine, runsOn } from '../core/routines/schedule';
import { routineState, routineToday } from '../core/routines/keeping';
import { userStorage } from '../store/users';
import { currentPlan, plans, ui } from '../store/state';
import { $, esc } from './dom';
import { toast } from './toast';
import { openMerge, openPlanDelete } from './plan-dialogs';
import { openExport } from './plan-io';
import { askPlan } from './plan-name';
import { planEmoji } from '../core/emoji';
import { renderPlanSettings } from './settings-plan';
import type { Db, ISODate } from '../core/model';

/* ---------- Plan switcher (sidebar on desktop, menu on mobile) ---------- */

export const PLAN_ICONS = {
  new: '<path d="M12 5v14M5 12h14"/>',
  rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  merge: '<path d="M6 3v4a6 6 0 0 0 12 0V3M12 13v8M8 17l4 4 4-4"/>',
  export: '<path d="M12 15V3M7 8l5-5 5 5M5 14v6h14v-6"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5M5 14v6h14v-6"/>',
  delete: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
};

// How a plan is doing, for the badge in the plan menus: 'late' when something is overdue,
// 'today' when something still has to be done today, else 'ok'. Paused goals and finished work don't count.
// How a plan is doing.
export type Health = 'ok' | 'today' | 'late';
export function planHealth(data: Db): Health {
  return withPlan(data, () => {
    const now = today();
    let health: Health = 'ok';
    const flag = (level: Health) => {
      if (level === 'late' || health === 'ok') health = level;
    };
    const due = (date: ISODate | undefined, open: boolean) => {
      if (open && date && date <= now) flag(date < now ? 'late' : 'today');
    };
    db.goals.forEach(g => due(g.deadline, g.status === 'active' || !g.status));
    db.activities.forEach(a => {
      if (!isRoutine(a)) return due(a.dueDate, a.status !== 'done');
      if (!runsOn(a, now)) return;
      if (routineState(a) === 'late') flag('late');
      // Due today: a set day not ticked yet, or a flexible routine that needs every day left, today included.
      if (routineToday(a) === 'due') flag('today');
    });
    return health;
  });
}

// Other plans change only through sync or the plan menu: their health is kept until the stored
// copy or the day changes, so a render reads them from storage without parsing them again.
export const storedHealth = new Map<string, { key: string; health: Health }>(); // plan id → { key, health }
export function storedPlanHealth(id: string) {
  let raw = null;
  try {
    raw = userStorage.getItem(planKey(id));
  } catch (e) {
    /* ignore */
  }
  const key = `${today()}|${raw}`;
  if (storedHealth.get(id)?.key !== key) storedHealth.set(id, { key, health: planHealth(readPlan(id)) });
  return storedHealth.get(id)!.health;
}

// The plan list shows each plan's dot before its name (unless switched off in Settings).
export function updatePlanBadges() {
  if (!ui.planBadges) return document.querySelectorAll<HTMLElement>('.plan-dot').forEach(dot => (dot.hidden = true));
  const open = planHealth(db);
  document.querySelectorAll<HTMLElement>('.plan-dot').forEach(dot => {
    const id = dot.closest<HTMLElement>('[data-plan-open]')!.dataset.planOpen!;
    const h = id === plans.current ? open : storedPlanHealth(id);
    dot.hidden = false;
    dot.dataset.health = h;
    dot.title = t(('plan.health.' + h) as TextKey);
  });
}

// The list shows the three plans opened last; the rest fold away (for this visit).
const SHOWN = 3;
let allPlans = false;

export function renderPlanSwitch() {
  const options = plans.list
    .map(
      p =>
        `<option value="${p.id}" ${p.id === plans.current ? 'selected' : ''}>${esc(planEmoji(p) + ' ' + p.name)}</option>`,
    )
    .join('');
  const opened = planOpened();
  const sorted = [...plans.list].sort((a, b) => (opened[b.id] || 0) - (opened[a.id] || 0));
  const rows = sorted
    .filter((p, i) => allPlans || i < SHOWN || p.id === plans.current)
    .map(
      p =>
        `<li><button type="button" class="plan-row" data-plan-open="${p.id}" aria-current="${p.id === plans.current}" title="${esc(p.name)}"><span class="plan-dot"></span><span class="plan-emoji" aria-hidden="true">${esc(planEmoji(p))}</span><span class="plan-row-name">${esc(p.name)}</span></button></li>`,
    )
    .join('');
  const more =
    sorted.length > SHOWN
      ? `<button type="button" class="plan-more" data-plan-more aria-expanded="${allPlans}">${esc(t(allPlans ? 'plan.showFewer' : 'plan.showAll', { n: sorted.length }))}</button>`
      : '';
  // Merging needs a second plan to merge into.
  const off = (act: string) => act === 'merge' && plans.list.length < 2;
  const label = (act: string) => esc(t((off(act) ? 'plan.mergeOnly' : 'plan.' + act) as TextKey));
  const actions = Object.entries(PLAN_ICONS)
    .map(
      ([act, path]) =>
        `<button type="button" class="icon-btn" data-plan="${act}" title="${label(act)}" aria-label="${label(act)}" ${off(act) ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg></button>`,
    )
    .join('');
  document.querySelectorAll('.plan-switch').forEach(box => {
    box.innerHTML = `<ul class="plan-list" aria-label="${esc(t('plan.label'))}">${rows}</ul>${more}<div class="plan-actions">${actions}</div>`;
  });
  $('#planName').innerHTML = options;
  renderPlanSettings(sorted);
  updatePlanBadges();
}

document.addEventListener('change', e => {
  if ((e.target as HTMLSelectElement).matches('[data-plan-select]')) openPlan((e.target as HTMLSelectElement).value);
});
document.addEventListener('click', e => {
  const row = (e.target as HTMLElement).closest<HTMLElement>('[data-plan-open]');
  if (row && row.dataset.planOpen !== plans.current) return openPlan(row.dataset.planOpen!);
  if ((e.target as HTMLElement).closest('[data-plan-more]')) {
    allPlans = !allPlans;
    return renderPlanSwitch();
  }
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-plan]')?.dataset.plan;
  if (!act) return;
  const plan = currentPlan()!;
  if (act === 'new') {
    askPlan(t('plan.newPrompt'), uniqueName(t('plan.defaultName')), undefined, (name, emoji) => {
      createPlan(name, undefined, false, emoji);
      toast(t('toast.planCreated'));
    });
  } else if (act === 'rename') {
    const rename = (name: string, emoji: string) => {
      Object.assign(plan, { name, emoji });
      save();
      renderPlanSwitch();
      toast(t('toast.planRenamed'));
    };
    askPlan(t('plan.renamePrompt'), plan.name, plan.emoji, rename, plan.id);
  } else if (act === 'merge') {
    openMerge(plan);
  } else if (act === 'export') {
    openExport();
  } else if (act === 'import') {
    $('#importInput').click();
  } else if (act === 'delete') {
    openPlanDelete(plan);
  }
});
