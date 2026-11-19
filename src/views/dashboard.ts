/** The overview: a summary line, what is due next, routines due today and goals in progress. */
import { byDeadline, byDueDate, deadlineTag, emptyState, esc, itemCount, linkTag, statusCheck } from '../ui/dom';
import { t, tp } from '../i18n/index';
import { db } from '../core/state';
import { activityState, blockers, goalProgress, hasPercent } from '../core/progress';
import { isRoutine, type Routine } from '../core/routines/schedule';
import { daysUntil, today } from '../core/dates';
import { routineToday } from '../core/routines/keeping';
import { ui } from '../store/state';
import { routineRow } from './routines';
import { goalCard } from '../ui/goal-card';
import { relsFrom } from '../core/relations';
import { isList, listDone } from '../core/routines/checkins';
import type { Activity } from '../core/model';

export function renderDashboard() {
  if (!itemCount()) return emptyState(t('dash.emptyTitle'), t('dash.emptyText'), 'goal');

  const active = db.goals.filter(g => g.status !== 'achieved' && g.status !== 'paused').sort(byDeadline);
  // The average counts only goals with a percentage; a measured goal without a target has none.
  const measured = active.filter(hasPercent),
    noTarget = active.length - measured.length;
  const avg = measured.length ? measured.reduce((s, g) => s + goalProgress(g), 0) / measured.length : 0;
  const headline =
    active.length && !measured.length
      ? tp('dash.headlineNone', active.length)
      : tp('dash.headline', active.length, { pct: `<strong>${Math.round(avg)}&nbsp;%</strong>` }) +
        (noTarget ? ' ' + tp('dash.noTarget', noTarget) : '');
  // Routines have no status of their own: they get their own list, and the counts leave them out.
  const oneOff = db.activities.filter(a => !isRoutine(a));
  // Only the routines today still asks for: a set day (or a missed one to make up), or a flexible
  // routine whose week or month is not met yet; not those ticked today, resting or not running.
  const now = today();
  const routines = db.activities.filter(
    (a): a is Routine => isRoutine(a) && ['due', 'makeUp', 'any'].includes(routineToday(a) as string),
  );
  const doneActs = oneOff.filter(a => a.status === 'done').length;
  const todo = oneOff.filter(a => a.status !== 'done').sort(byDueDate);
  const overdue = todo.filter(a => a.dueDate && daysUntil(a.dueDate)! < 0).length;
  // Only active activities: collapsed, those due by today (overdue included); expanded, also the
  // others in progress.
  const due = todo.filter(a => a.dueDate && a.dueDate <= now);
  const going = todo.filter(a => due.includes(a) || a.status === 'doing');
  const next = ui.nextAll ? going : due;
  const more =
    going.length > due.length
      ? `<button type="button" class="list-more" data-next-more aria-expanded="${ui.nextAll}">${
          ui.nextAll ? t('dash.showFewer') : t('dash.showAll', { n: going.length })
        }</button>`
      : '';

  const waiting = todo.filter(a => blockers(a).length).length;
  return `
    <section class="summary">
      <p class="summary-line">${headline}</p>
      <ul class="facts">
        <li>${t('dash.factDone', { done: doneActs, total: oneOff.length })}</li>
        ${overdue ? `<li class="fact-late">${tp('dash.factLate', overdue)}</li>` : ''}
        ${waiting ? `<li class="fact-waiting">${tp('dash.factWaiting', waiting)}</li>` : ''}
      </ul>
    </section>

    <h2 class="section-title">${t('dash.next')} <small>${next.length ? t('dash.sorted') : ''}</small></h2>
    ${
      next.length
        ? `<div class="list">${next.map(activityRow).join('')}${more}</div>`
        : more
          ? `<div class="list"><div class="empty">${t('dash.noneDue')}</div>${more}</div>`
          : `<div class="empty">${t(todo.length ? 'dash.noneActive' : 'dash.allDone')}</div>`
    }

    ${
      routines.length
        ? `<h2 class="section-title">${t('rt.title')} <small>${t('rt.dashHint')}</small></h2>
    <div class="list routine-list">${routines.map(routineRow).join('')}</div>`
        : ''
    }

    <h2 class="section-title">${t('dash.goalsInProgress')} <small>${active.length ? t('dash.clickToEdit') : ''}</small></h2>
    ${active.length ? `<div class="grid">${active.map(goalCard).join('')}</div>` : `<div class="empty">${t('dash.noActive')}</div>`}
  `;
}

export function activityRow(a: Activity) {
  const goals = relsFrom(a.id, 'contributes')
    .map(r => linkTag(r.to))
    .join('');
  const blocked = blockers(a).length;
  return `<div class="row glass st-${activityState(a)}" data-open="${a.id}" data-ctx-item="${a.id}">
    ${statusCheck(a)}
    <span class="grow ${a.status === 'done' ? 'done-text' : ''}">${esc(a.title)}</span>
    ${isList(a) && a.list.length ? `<span class="tag">${t('list.count', { done: listDone(a), total: a.list.length })}</span>` : ''}
    ${blocked ? `<span class="tag bad" title="${esc(tp('blocked.title', blocked))}">${t('blocked')}</span>` : ''}
    <span class="links">${goals}</span>
    ${deadlineTag(a.dueDate, a.status === 'done')}
  </div>`;
}
