/** The activities view: routines, then one-time activities, as cards that flow in columns of their own height. */
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
import { t } from '../i18n/index';
import { categorySelect, goalSelect, scopeFor, searchBox } from './filters';
import { ui } from '../store/state';
import { isRoutine, type Routine } from '../core/routines/schedule';
import { byUrgency } from '../core/routines/keeping';
import { activityState, blockers, isComplete } from '../core/progress';
import { type Activity, type ActivityStatus } from '../core/model';
import { listTicks, routineCard, routineLegend } from './routines';
import { descendants, relsFrom } from '../core/relations';
import { isList } from '../core/routines/checkins';
import { replanButton } from '../ui/replan';

export function renderActivities() {
  if (!db.activities.length) return emptyState(t('acts.emptyTitle'), t('acts.emptyText'), 'activity');
  const scope = scopeFor(ui.activityGoal);
  const all = db.activities
    .filter(matchesSearch)
    .filter(a => !scope || scope.activity.has(a.id))
    .filter(a => !(ui.hideDone && isComplete('activity', a)));
  const list = all.filter(a => !isRoutine(a)).sort(byStatus);
  const routines = all.filter((a): a is Routine => isRoutine(a)).sort(byUrgency);
  const title = (id: string, text: string, n: number) =>
    `<h3 class="routines-title" id="${id}">${text}<span>${n}</span></h3>`;
  return `
    <div class="toolbar">
      ${categorySelect()}
      ${goalSelect('activity', ui.activityGoal)}
      ${hideDoneToggle()}
      ${replanButton()}
      ${searchBox()}
    </div>
    ${
      routines.length
        ? `<section class="routines" aria-labelledby="routinesTitle">${title('routinesTitle', t('rt.title'), routines.length)}
      ${routineLegend(routines)}
      <div class="routine-grid flow">${routines.map(routineCard).join('')}</div></section>`
        : ''
    }
    ${
      list.length
        ? `<section class="routines acts" aria-labelledby="actsTitle">${title('actsTitle', t('nav.activities'), list.length)}
      <div class="routine-grid flow">${list.map(activityCard).join('')}</div></section>`
        : ''
    }`;
}

// In progress first, then to do, then done; within each, the earliest due date first.
const STATUS_ORDER: ActivityStatus[] = ['doing', 'todo', 'done'];
export const byStatus = (a: Activity, b: Activity) =>
  STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || byDueDate(a, b);

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
  return `<article class="card glass activity st-${activityState(a)}" data-open="${a.id}" data-ctx-item="${a.id}">
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

// Cards keep their own height: each spans as many small grid rows as it is tall, and the grid
// places them in reading order into the first free spot (left to right, then down).
const ROW = 4,
  GAP = 12;
const span = (c: Element, h: number) => ((c as HTMLElement).style.gridRowEnd = `span ${Math.ceil((h + GAP) / ROW)}`);
let flowObserver: ResizeObserver | null = null;
export function flowCards() {
  flowObserver?.disconnect();
  flowObserver ??= new ResizeObserver(es => es.forEach(e => span(e.target, e.borderBoxSize[0].blockSize)));
  const cards = [...document.querySelectorAll('.flow > *')];
  // All heights first, then all spans: one layout, not one per card.
  cards.map(c => c.getBoundingClientRect().height).forEach((h, k) => span(cards[k], h));
  cards.forEach(c => flowObserver!.observe(c));
}
