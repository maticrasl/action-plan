/** A goal's card, as the overview and the goals view show it. */
import {
  blockers,
  byActivities,
  byRoutines,
  countedActivities,
  goalActivities,
  goalCurrent,
  goalProgress,
  goalRoutines,
  goalState,
  hasPercent,
  measuringState,
} from '../core/progress';
import { isRoutine } from '../core/routines/schedule';
import { deadlineTag, esc, linkTag, smartBadge, trail, waitsForTag } from './dom';
import { relsFrom } from '../core/relations';
import { t, tp, type TextKey } from '../i18n/index';
import { fmtNum, isNum } from '../core/util';
import { goalPeriod, isCumulative, lastPeriodTotal, stateTotal } from '../core/cumulative';
import { periodText, withUnit } from './text';
import type { Goal, Period } from '../core/model';
import { goalPace } from '../core/pace';
import { today } from '../core/dates';

const PACE_CLS = { ahead: 'ok', on: '', behind: 'warn' };
// The pace tag, and when behind what it would take: per week (or day) from here, or steps against time.
function paceMeta(g: Goal, unit: string) {
  const p = goalPace(g, today());
  if (!p) return '';
  const tag = `<span class="tag pace ${PACE_CLS[p.status]}">${t(`pace.${p.status}`)}</span>`;
  if (p.status !== 'behind') return tag;
  const more =
    p.kind === 'acts'
      ? t('pace.steps', { done: p.done, total: p.total, pct: Math.round(p.time * 100) })
      : p.rate &&
        t(p.rate.per === 'day' ? 'pace.needsShortDay' : 'pace.needsShort', {
          value: withUnit(fmtNum(p.rate.value), unit),
        });
  return tag + (more ? `<span class="pace-needs">${esc(more)}</span>` : '');
}

export function goalCard(g: Goal) {
  const pct = goalProgress(g);
  const linked = goalActivities(g);
  const acts = linked.filter(a => !isRoutine(a));
  const done = acts.filter(a => a.status === 'done').length;
  const routines = byRoutines(g) ? goalRoutines(g) : linked.filter(isRoutine);
  const st = measuringState(g);
  const unit = g.unit ? ' ' + esc(g.unit) : '';
  const parent = relsFrom(g.id, 'subgoal')[0];
  const waits = g.status === 'achieved' ? [] : blockers(g, 'goal');
  const measured = byActivities(g),
    counted = measured ? countedActivities(g).length : 0;
  return `<article class="card glass goal st-${goalState(g)}" data-open="${g.id}" data-ctx-item="${g.id}">
    <div class="card-head"><h3>${esc(g.title)}</h3>${smartBadge(g)}</div>
    ${g.category ? `<div><button type="button" class="tag cat" data-category="${esc(g.category)}">${esc(g.category)}</button></div>` : ''}
    ${g.specific ? `<p class="desc">${esc(g.specific)}</p>` : ''}
    ${
      byRoutines(g)
        ? `${trail(pct, '0 %', '100 %')}
    <div class="meta"><span>${t('goals.consistency')}: <strong>${Math.round(pct)} %</strong></span></div>`
        : measured
          ? `${trail(pct, '0', esc(tp('goals.actsTotal', counted)))}
    <div class="meta"><span>${t('f.progressActs')}: <strong>${goalCurrent(g)} / ${counted}</strong></span></div>`
          : !hasPercent(g)
            ? `<p class="meta no-target">${t('goals.noTarget')}</p>`
            : `${trail(pct, `${fmtNum(isNum(g.baseline) ? g.baseline! : 0)}${unit}`, `${fmtNum(g.target!)}${unit}`)}
    <div class="meta"><span>${g.metric?.trim() ? esc(g.metric) : t('goals.progress')}: <strong>${fmtNum(goalCurrent(g))}${unit}</strong></span></div>
    ${isCumulative(st) && goalPeriod(g) !== 'total' ? `<div class="meta cu-periods">${esc(t(('cu.goalLine.' + goalPeriod(g)) as TextKey, { now: withUnit(fmtNum(stateTotal(st, goalPeriod(g))), st.unit || g.unit || ''), last: withUnit(fmtNum(lastPeriodTotal(st, goalPeriod(g) as Period)), st.unit || g.unit || '') }))}</div>` : ''}`
    }
    <div class="meta">
      ${g.status !== 'active' ? `<span class="tag ${g.status === 'achieved' ? 'ok' : ''}">${t(('goal.' + g.status) as TextKey)}</span>` : ''}
      ${waits.length ? waitsForTag(waits) : ''}
      ${deadlineTag(g.deadline, g.status === 'achieved')}
      ${paceMeta(g, st?.unit || g.unit || '')}
      ${measured || (!acts.length && routines.length) ? '' : `<span>${t('goals.activities', { done, total: acts.length })}</span>`}
      ${routines.length ? `<span title="${esc(routines.map(a => `${a.title}: ${periodText(a)}`).join('\n'))}">⟳ ${esc(tp('goals.routines', routines.length))}</span>` : ''}
      ${st ? `<span title="${esc(t('goals.measuredBy'))}">◐ ${esc(st.title)}</span>` : ''}
    </div>
    ${parent ? `<div class="links"><span class="meta">${t('goals.partOf')}</span>${linkTag(parent.to)}</div>` : ''}
  </article>`;
}
