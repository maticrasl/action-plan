/** Pieces the Overview and Today share: a step's row and the This week line. */
import { PlanSource } from '../core/today';
import { db } from '../core/state';
import { doneLog, weekCounts } from '../core/done-log';
import { addDays, weekday } from '../core/routines/schedule';
import { t, tp } from '../i18n/index';
import { deadlineTag, esc, linkTag, statusCheck } from '../ui/dom';
import { Activity } from '../core/model';
import { relsFrom } from '../core/relations';
import { activityState, blockers } from '../core/progress';
import { isList, listDone } from '../core/routines/checkins';
import { listFold, listOpen, listTicks } from './routines';

// What this plan (or `sources`, on Today) finished since Monday (feature 13); nothing at all when nothing was.
export function weekLine(now: string, sources: PlanSource[] = [{ plan: '', data: db }]) {
  const entries = doneLog(sources, addDays(now, -weekday(now)), now);
  const c = weekCounts(entries);
  const parts = [
    ...entries.filter(e => e.kind === 'goal').map(e => t('log.reached', { name: esc(e.title) })),
    c.steps ? tp('log.steps', c.steps) : '',
    c.routineDays ? tp('log.ticks', c.routineDays) : '',
    c.values ? tp('log.values', c.values) : '',
  ].filter(Boolean);
  return parts.length ? `<button class="week-line" data-log="view">${t('log.week', { parts: parts.join(' · ') })}</button>` : '';
}

export function activityRow(a: Activity) {
  const goals = relsFrom(a.id, 'contributes')
    .map(r => linkTag(r.to))
    .join('');
  const blocked = blockers(a).length;
  const open = isList(a) && a.list.length > 0 && listOpen(a.id);
  return `<div class="row glass st-${activityState(a)}${open ? ' open' : ''}" data-open="${a.id}" data-ctx-item="${a.id}">
    ${statusCheck(a)}
    <span class="grow ${a.status === 'done' ? 'done-text' : ''}">${esc(a.title)}</span>
    ${isList(a) && a.list.length ? listFold(a.id, listDone(a), a.list.length) : ''}
    ${blocked ? `<span class="tag bad" title="${esc(tp('blocked.title', blocked))}">${t('blocked')}</span>` : ''}
    <span class="links">${goals}</span>
    ${deadlineTag(a.dueDate, a.status === 'done')}
    ${open && isList(a) ? `<div class="row-items">${listTicks(a)}</div>` : ''}
  </div>`;
}
