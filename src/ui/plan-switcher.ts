/** The plan switcher: the plans with their health, and new, rename, merge, export, import, delete. */
import { createPlan, nameTaken, openPlan, planKey, readPlan, save, uniqueName } from '../store/plans';
import { t, tp, type PluralKey, type TextKey } from '../i18n/index';
import { db, setDb } from '../core/state';
import { today } from '../core/dates';
import { isRoutine, runsOn } from '../core/routines/schedule';
import { routineState, routineToday } from '../core/routines/keeping';
import { userStorage } from '../store/users';
import { currentPlan, plans, ui } from '../store/state';
import { $, esc } from './dom';
import { toast } from './toast';
import { openMerge, openPlanDelete } from './plan-dialogs';
import { openExport } from './plan-io';
import type { Db, ISODate } from '../core/model';

// Asks for a plan name until it is free (or the user cancels); `exceptId` is the plan being renamed.
export function askPlanName(question: string, suggestion: string, exceptId?: string) {
  let name = prompt(question, suggestion)?.trim();
  while (name && nameTaken(name, exceptId))
    name = prompt(`${t('plan.nameTaken', { name })}\n${question}`, name)?.trim();
  return name;
}

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
  const keep = db;
  setDb(data);
  try {
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
  } finally {
    setDb(keep);
  }
}
export const HEALTH_BADGE = { ok: '🟢', today: '🟡', late: '🔴' };

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

// The plan menus show each plan's badge before its name (unless switched off in Settings).
export function updatePlanBadges() {
  const health = ui.planBadges
    ? Object.fromEntries(plans.list.map(p => [p.id, p.id === plans.current ? planHealth(db) : storedPlanHealth(p.id)]))
    : {};
  document.querySelectorAll<HTMLOptionElement>('[data-plan-select] option').forEach(o => {
    const plan = plans.list.find(p => p.id === o.value),
      h = health[o.value];
    if (!plan) return;
    o.textContent = h ? `${HEALTH_BADGE[h]} ${plan.name}` : plan.name;
    o.title = h ? t(('plan.health.' + h) as TextKey) : '';
  });
}

export function renderPlanSwitch() {
  const options = plans.list
    .map(p => `<option value="${p.id}" ${p.id === plans.current ? 'selected' : ''}>${esc(p.name)}</option>`)
    .join('');
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
    box.innerHTML = `<label class="plan-label">${t('plan.label')}<select data-plan-select>${options}</select></label><div class="plan-actions">${actions}</div>`;
  });
  $('#planName').innerHTML = options;
  updatePlanBadges();
}

document.addEventListener('change', e => {
  if ((e.target as HTMLSelectElement).matches('[data-plan-select]')) openPlan((e.target as HTMLSelectElement).value);
});
document.addEventListener('click', e => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-plan]')?.dataset.plan;
  if (!act) return;
  const plan = currentPlan()!;
  if (act === 'new') {
    const name = askPlanName(t('plan.newPrompt'), uniqueName(t('plan.defaultName')));
    if (name) {
      createPlan(name);
      toast(t('toast.planCreated'));
    }
  } else if (act === 'rename') {
    const name = askPlanName(t('plan.renamePrompt'), plan.name, plan.id);
    if (name) {
      plan.name = name;
      save();
      renderPlanSwitch();
      toast(t('toast.planRenamed'));
    }
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

// What a plan holds, as list items for the delete and merge dialogs ('' when it is empty).
export function planContents(data: Db) {
  const count = (key: PluralKey, n: number) => (n ? `<li>${esc(tp(key, n))}</li>` : '');
  const measured = data.states.reduce((sum, s) => sum + (s.cumulative ? s.entries || [] : s.history || []).length, 0);
  return (
    count('planDel.goals', data.goals.length) +
    count('planDel.states', data.states.length) +
    count('planDel.measurements', measured) +
    count('planDel.activities', data.activities.length) +
    count('planDel.relations', data.relations.length)
  );
}
