/** Filters the views share: goal categories, a goal picker, the search box, and the items a filter keeps. */
import { byDeadline, esc } from '../ui/dom';
import { t } from '../i18n/index';
import { ui, type Ui } from '../store/state';
import { db } from '../core/state';
import { goalScope, type Scope } from '../core/progress';
import { KINDS, type Goal } from '../core/model';
import { categories } from '../core/categories';

export function searchBox() {
  return `<input type="search" class="search" placeholder="${esc(t('search'))}" value="${esc(ui.search)}" data-search>`;
}

export const inCategory = (g: Goal) => !ui.category || g.category === ui.category;

// What a view shows: one goal's scope if a goal is picked, otherwise everything under
// the selected category (null means no filter at all).
export function scopeFor(goalId: string): Scope | null {
  const goal = db.goals.find(g => g.id === goalId);
  if (goal && inCategory(goal)) return goalScope(goal.id);
  if (!ui.category) return null;
  const scope: Scope = { goal: new Set(), activity: new Set(), state: new Set() };
  db.goals.filter(inCategory).forEach(g => {
    const s = goalScope(g.id);
    KINDS.forEach(k => s[k].forEach(id => scope[k].add(id)));
  });
  return scope;
}

export function categoryChips() {
  const cats = categories();
  if (!cats.length) return '';
  const chip = (value: string, label: string, count?: number) =>
    `<button class="chip ${ui.category === value ? 'active' : ''}" data-category="${esc(value)}" aria-pressed="${ui.category === value}">${esc(label)}${count === undefined ? '' : ` <span class="count">${count}</span>`}</button>`;
  return `<div class="chips cat-chips" role="group" aria-label="${esc(t('f.category'))}">${chip('', t('cat.all'))}${cats.map(c => chip(c, c, db.goals.filter(g => g.category === c).length)).join('')}</div>`;
}

// The ui field holding each view's goal filter, by the goal picker's data-goal-select value.
export const GOAL_FILTERS = {
  activity: 'activityGoal',
  map: 'mapGoal',
  timeline: 'timelineGoal',
  graphs: 'graphGoal',
} satisfies Record<string, keyof Ui>;
export type GoalFilterTarget = keyof typeof GOAL_FILTERS;

// Goal picker limited to the selected category, grouped by category otherwise.
export function goalSelect(target: GoalFilterTarget, value: string) {
  const option = (g: Goal) => `<option value="${g.id}" ${value === g.id ? 'selected' : ''}>${esc(g.title)}</option>`;
  const goals = db.goals.filter(inCategory).sort(byDeadline);
  const groups =
    ui.category || !categories().length
      ? goals.map(option).join('')
      : [...categories(), '']
          .map(c => {
            const list = goals.filter(g => (g.category || '') === c);
            return list.length
              ? `<optgroup label="${esc(c || t('cat.none'))}">${list.map(option).join('')}</optgroup>`
              : '';
          })
          .join('');
  return `<select data-goal-select="${target}" style="max-width:280px" aria-label="${esc(t('f.goal'))}">
    <option value="">${t(ui.category ? 'cat.allInCategory' : 'acts.allGoals')}</option>${groups}
  </select>`;
}
