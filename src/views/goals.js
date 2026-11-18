/** The goals view: category and status chips, search, and the goal cards. */
import { db } from '../core/state';
import { byDeadline, emptyState, matchesSearch } from '../ui/dom';
import { t } from '../i18n/index';
import { statusLabels } from '../ui/text';
import { GOAL_STATUS } from '../core/model';
import { categoryChips, inCategory, searchBox } from './filters';
import { ui } from '../store/state';
import { goalCard } from '../ui/goal-card';

export function renderGoals() {
  if (!db.goals.length) return emptyState(t('goals.emptyTitle'), t('goals.emptyText'), 'goal');
  const filters = statusLabels(['all', ...GOAL_STATUS], 'goal.');
  const inCat = db.goals.filter(inCategory);
  const list = inCat
    .filter(g => ui.goalFilter === 'all' || g.status === ui.goalFilter)
    .filter(matchesSearch)
    .sort(byDeadline);
  return `
    ${categoryChips()}
    <div class="toolbar">
      <div class="chips">${Object.entries(filters).map(([k, v]) => `<button class="chip ${ui.goalFilter === k ? 'active' : ''}" data-goal-filter="${k}">${v} <span class="count">${k === 'all' ? inCat.length : inCat.filter(g => g.status === k).length}</span></button>`).join('')}</div>
      ${searchBox()}
    </div>
    ${list.length ? `<div class="grid">${list.map(goalCard).join('')}</div>` : `<div class="empty">${t('goals.noMatch')}</div>`}`;
}
