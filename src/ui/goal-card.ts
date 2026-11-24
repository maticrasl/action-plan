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
import { deadlineTag, esc, linkTag, noteTag, smartBadge, trail, waitsForTag } from './dom';
import { relsFrom } from '../core/relations';
import { t, tp, type TextKey } from '../i18n/index';
import { fmtNum, isNum } from '../core/util';
import { goalPeriod, isCumulative, lastPeriodTotal, stateTotal } from '../core/cumulative';
import { periodText, withUnit } from './text';
import type { Goal, Period, Vision } from '../core/model';
import { findVision, goalVisionIds } from '../core/visions';
import { visionTag } from './line-of-sight';
import { goalPace } from '../core/pace';
import { fmtDate, fmtRel, today } from '../core/dates';
import { isKeep, keepMarks, keepNow, keepShare } from '../core/keep';
import type { PluralKey } from '../i18n/index';

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

// The visions a goal serves (feature 05), as tags under its meta line; nothing without any.
function serves(g: Goal) {
  const vs = goalVisionIds(g)
    .map(findVision)
    .filter((v): v is Vision => !!v);
  return vs.length
    ? `<div class="links"><span class="meta">${t('los.serves')}</span>${vs.map(v => visionTag(v)).join('')}</div>`
    : '';
}

// A keep goal's share of periods in range with the last ten marks, and where it stands now (07).
function keepLines(g: Goal, unit: string) {
  const share = keepShare(g),
    m = keepMarks(g),
    now = keepNow(g);
  const marks = (m?.marks || [])
    .slice(-10)
    .map(k => `<i class="km km-${k}"></i>`)
    .join('');
  const head =
    share && m
      ? `<div class="meta keep-share"><strong>${esc(t('keep.share', { n: share.n, total: share.total, unit: tp(`keep.unit.${m.unit}` as PluralKey, share.total) }))}</strong><span class="keep-marks" title="${esc(t('keep.marks'))}">${marks}</span></div>`
      : '';
  const status =
    now.kind === 'none'
      ? t('keep.none')
      : now.kind === 'stale'
        ? t('keep.stale', { when: fmtRel(now.date) })
        : now.kind === 'in'
          ? '✓ ' + t('keep.in')
          : t(now.dist > 0 ? 'keep.above' : 'keep.below', { value: withUnit(fmtNum(Math.abs(now.dist)), unit) });
  const value =
    now.kind === 'none'
      ? ''
      : `${g.metric?.trim() ? esc(g.metric) : t('goals.progress')}: <strong>${esc(withUnit(fmtNum(now.value), unit))}</strong> `;
  return `${head}<div class="meta keep-now keep-${now.kind}"><span>${value}${esc(status)}</span></div>`;
}
// Until, no end, or Ended: a keep goal's end date never makes it late.
function untilTag(g: Goal) {
  if (g.deadline && g.deadline < today())
    return `<span class="tag">${esc(t('keep.ended', { date: fmtDate(g.deadline) }))}</span>`;
  return `<span>${esc(t('f.until'))}: ${esc(g.deadline ? fmtDate(g.deadline) : t('keep.noEnd'))}</span>`;
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
      isKeep(g)
        ? keepLines(g, st?.unit || g.unit || '')
        : byRoutines(g)
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
      ${isKeep(g) ? untilTag(g) : deadlineTag(g.deadline, g.status === 'achieved')}
      ${paceMeta(g, st?.unit || g.unit || '')}
      ${measured || (!acts.length && routines.length) ? '' : `<span>${t('goals.activities', { done, total: acts.length })}</span>`}
      ${routines.length ? `<span title="${esc(routines.map(a => `${a.title}: ${periodText(a)}`).join('\n'))}">⟳ ${esc(tp('goals.routines', routines.length))}</span>` : ''}
      ${st ? `<span title="${esc(t('goals.measuredBy'))}">◐ ${esc(st.title)}</span>` : ''}
      ${noteTag(g)}
    </div>
    ${serves(g)}
    ${parent ? `<div class="links"><span class="meta">${t('goals.partOf')}</span>${linkTag(parent.to)}</div>` : ''}
  </article>`;
}
