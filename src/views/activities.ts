/** The activities view: routines above a board of status columns, with drag and drop between them. */
import { db } from '../core/state';
import {
  byDueDate,
  deadlineTag,
  emptyState,
  esc,
  hideDoneToggle,
  linkTag,
  matchesSearch,
  progressBar,
  statusCheck,
  waitsForTag,
} from '../ui/dom';
import { t, type TextKey } from '../i18n/index';
import { categoryChips, goalSelect, scopeFor, searchBox } from './filters';
import { ui } from '../store/state';
import { isRoutine, type Routine } from '../core/routines/schedule';
import { byUrgency } from '../core/routines/keeping';
import { activityState, blockers, isComplete } from '../core/progress';
import { ACTIVITY_STATUS, type Activity, type ActivityStatus } from '../core/model';
import { listTicks, routineCard, routineLegend } from './routines';
import { descendants, relsFrom } from '../core/relations';
import { isList } from '../core/routines/checkins';
import { save } from '../store/plans';
import { requestRender as render } from '../ui/render';

export function renderActivities() {
  if (!db.activities.length) return emptyState(t('acts.emptyTitle'), t('acts.emptyText'), 'activity');
  const scope = scopeFor(ui.activityGoal);
  const all = db.activities.filter(matchesSearch).filter(a => !scope || scope.activity.has(a.id));
  const list = all.filter(a => !isRoutine(a));
  const routines = all
    .filter((a): a is Routine => isRoutine(a) && !(ui.hideDone && isComplete('activity', a)))
    .sort(byUrgency);
  const statuses = ACTIVITY_STATUS.filter(s => !(ui.hideDone && s === 'done'));
  const cols = statuses
    .map(status => {
      const items = list.filter(a => a.status === status).sort(byDueDate);
      return `<div class="col col-${status}" data-status="${status}"><h3>${t(('activity.' + status) as TextKey)}<span>${items.length}</span></h3>${items.map(activityCard).join('')}</div>`;
    })
    .join('');
  return `${categoryChips()}
    <div class="toolbar">
      ${goalSelect('activity', ui.activityGoal)}
      ${hideDoneToggle()}
      ${searchBox()}
    </div>
    ${
      routines.length
        ? `<section class="routines" aria-labelledby="routinesTitle"><h3 class="routines-title" id="routinesTitle">${t('rt.title')}<span>${routines.length}</span></h3>
      ${routineLegend(routines)}
      <div class="routine-grid">${routines.map(routineCard).join('')}</div></section>`
        : ''
    }
    <div class="board" style="--cols:${statuses.length}">${cols}</div>`;
}

export function activityCard(a: Activity) {
  const goals = relsFrom(a.id, 'contributes')
    .map(r => linkTag(r.to))
    .join('');
  const blocked = blockers(a);
  const parent = relsFrom(a.id, 'subactivity')[0];
  const children = descendants(a.id, 'subactivity')
    .map(id => db.activities.find(x => x.id === id))
    .filter(Boolean) as Activity[];
  const childrenDone = children.filter(c => c.status === 'done').length;
  return `<article class="card glass activity st-${activityState(a)}" data-open="${a.id}" data-ctx-item="${a.id}" draggable="true" data-drag="${a.id}">
    <div class="card-head"><h3 class="${a.status === 'done' ? 'done-text' : ''}">${esc(a.title)}</h3>${statusCheck(a)}</div>
    ${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}
    ${children.length ? progressBar((childrenDone / children.length) * 100, t('acts.subDone', { done: childrenDone, total: children.length })) : ''}
    ${isList(a) ? listTicks(a) : ''}
    <div class="meta">
      ${deadlineTag(a.dueDate, a.status === 'done')}
      ${blocked.length ? waitsForTag(blocked) : ''}
    </div>
    ${parent ? `<div class="links"><span class="meta">${t('acts.partOf')}</span>${linkTag(parent.to)}</div>` : ''}
    ${goals ? `<div class="links">${goals}</div>` : ''}
  </article>`;
}

export function bindDragDrop() {
  document.querySelectorAll<HTMLElement>('[data-drag]').forEach(card => {
    // Cards are dragged with the mouse; on touch screens a long-press opens their menu instead.
    card.addEventListener('pointerdown', e => {
      card.draggable = e.pointerType === 'mouse';
    });
    card.addEventListener('dragstart', e => {
      e.dataTransfer!.setData('text/plain', card.dataset.drag!);
      e.dataTransfer!.effectAllowed = 'move';
    });
  });
  document.querySelectorAll<HTMLElement>('.col[data-status]').forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drop');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      const a = db.activities.find(x => x.id === e.dataTransfer!.getData('text/plain'));
      if (a && a.status !== col.dataset.status) {
        a.status = col.dataset.status as ActivityStatus;
        save();
      }
      render();
    });
  });
}
